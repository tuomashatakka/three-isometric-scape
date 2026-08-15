import type { GradeName } from '../scene/config.ts'
import type { AtmosphereQuality } from '../scene/quality.ts'


/**
 * A continuous knob, addressed by where it lives in the config.
 *
 * The path is the whole design. An earlier version carried a `get`/`set` pair
 * per control, which meant every knob was three lines of closure and — worse —
 * that nothing outside the closure could tell *what* it wrote. A string can be
 * collected, diffed and persisted, which is how the same list now drives the
 * overlay and the local-storage snapshot without either one enumerating the
 * scene's settings a second time.
 */
export interface RangeControl {
  kind:  'range'
  path:  string
  label: string
  min:   number
  max:   number
  step:  number

  /** Unavailable knobs still render, greyed, so the tier is visible rather than mysterious. */
  available?: boolean

  /** Re-read while the panel is open — for values the scene drives on its own. */
  live?: boolean
}

export interface SelectControl {
  kind:    'select'
  path:    string
  label:   string
  options: readonly string[]
}

/**
 * An effect switch, with the knobs it owns nested underneath.
 *
 * There is no separate "enabled" flag anywhere in the config — an effect is off
 * when its strength is zero, and `children[0]` is that strength. So the switch
 * remembers the value it turned off at and restores it, which is what makes
 * toggling non-destructive.
 */
export interface ToggleControl {
  kind:     'toggle'
  label:    string
  children: RangeControl[]

  /** Value to come back to when switched on from a config authored at zero. */
  restore: number
}

export type ScapeControl = RangeControl | SelectControl | ToggleControl

export interface ControlSection {
  title:    string
  controls: ScapeControl[]
}

const GRADES: readonly GradeName[] = [
  'nordic', 'natural', 'cinematic', 'warm', 'cool', 'noir', 'dream',
]

function walk (root: object, path: string): [ Record<string, unknown>, string ] | null {
  const keys = path.split('.')
  const last = keys.pop()
  let node: unknown = root

  for (const key of keys) {
    if (typeof node !== 'object' || node === null)
      return null
    node = (node as Record<string, unknown>)[key]
  }

  if (!last || typeof node !== 'object' || node === null)
    return null

  return [ node as Record<string, unknown>, last ]
}

/** Read a dotted path out of the config. `undefined` if any step is missing. */
export function readPath (root: object, path: string): unknown {
  const slot = walk(root, path)
  return slot ? slot[0][slot[1]] : undefined
}

/** Write a dotted path into the config. Silently does nothing if the path is dead. */
export function writePath (root: object, path: string, value: unknown): void {
  const slot = walk(root, path)

  if (slot)
    slot[0][slot[1]] = value
}

export function readNumber (root: object, path: string): number {
  const value = readPath(root, path)
  return typeof value === 'number' ? value : 0
}

export function readText (root: object, path: string): string {
  const value = readPath(root, path)
  return typeof value === 'string' ? value : ''
}

/** Every leaf path the overlay exposes, in declaration order. */
export function controlPaths (sections: readonly ControlSection[]): string[] {
  return sections.flatMap(section => section.controls.flatMap(
    control => control.kind === 'toggle'
      ? control.children.map(child => child.path)
      : [ control.path ],
  ))
}

function range (
  path: string,
  label: string,
  min: number,
  max: number,
  step: number,
  available = true,
): RangeControl {
  return { kind: 'range', path, label, min, max, step, available }
}

function toggled (
  label: string,
  strength: RangeControl,
  restore: number,
  extra: RangeControl[] = [],
): ToggleControl {
  return { kind: 'toggle', label, restore, children: [ strength, ...extra ]}
}

/**
 * The tunable surface, as sections.
 *
 * Nothing here holds a reference to the config — these are paths into it. The
 * panel binds them, the settings store persists them, and the scene modules
 * re-read the same fields every frame, so there is exactly one copy of every
 * number in the program.
 */
export function createScapeControls (quality: AtmosphereQuality): ControlSection[] {
  return [
    {
      title:    'optics',
      controls: [
        { kind: 'select', path: 'look.grade', label: 'colour grade', options: GRADES },
        range('look.intensity', 'grade strength', 0, 1, 0.01),
        toggled('bloom', range('look.bloom', 'strength', 0, 1.5, 0.01, quality.bloom), 0.34),
        toggled('vignette', range('look.vignette', 'amount', 0, 1, 0.01), 0.34),
        toggled('film grain', range('look.grain', 'amount', 0, 1, 0.01, quality.grain), 0.16),
        toggled('tilt-shift', range('look.tiltShift', 'blur', 0, 2, 0.01), 0.88),
        toggled('sun shafts', range('look.godRays', 'strength', 0, 1, 0.01, quality.godRays), 0.26),
      ],
    },
    {
      title:    'daylight',
      controls: [
        // Outside the switch on purpose: freezing the clock is exactly when you
        // want to scrub it, so the time knob must survive the cycle being off.
        { ...range('daylight.time', 'time of day', 0, 1, 0.002), live: true },
        toggled('day cycle', range('daylight.speed', 'cycles per minute', 0, 2, 0.01), 0.4),
        range('daylight.tilt', 'noon height', 8, 80, 1),
        range('daylight.azimuth', 'sun bearing', -180, 180, 1),
        range('daylight.nightLift', 'night lift', 0, 1, 0.01),
      ],
    },
    {
      title:    'season',
      controls: [
        // Outside the switch for the same reason the time of day is: freezing
        // the year is exactly when you want to scrub it.
        { ...range('season.time', 'time of year', 0, 1, 0.002), live: true },
        toggled('year cycle', range('season.speed', 'years per minute', 0, 1, 0.01), 0.08),
        toggled('snow', range('season.snow', 'cover', 0, 1, 0.01), 0.85),
        range('season.snowLine', 'snow line', -1, 6, 0.1),
        range('season.turn', 'leaf turn', 0, 1, 0.01),
        toggled(
          'sea ice',
          range('season.ice', 'freeze', 0, 1, 0.01),
          0.9,
          [
            range('water.iceReach', 'held to the shallows', 0, 1, 0.01),
            range('water.iceBreak', 'floe break-up', 0, 1, 0.01),
          ],
        ),
        // Under the year rather than under the mist, because the year is what
        // drives it: the smoke is the gap between the land's winter and the
        // sea's, and both of those knobs are in this section already.
        toggled('sea smoke', range('season.seaSmoke', 'steam', 0, 1, 0.01), 0.9),
      ],
    },
    {
      title:    'atmosphere',
      controls: [
        range('atmosphere.fogDensity', 'fog density', 0, 0.9, 0.01),
        range('atmosphere.fogBreath', 'fog breath', 0, 0.4, 0.01),
        range('atmosphere.cloudShadow', 'cloud shadow', 0, 1, 0.01),
        range('atmosphere.cloudSpeed', 'cloud drift', 0, 3, 0.01),
        toggled(
          'sky clouds',
          range('atmosphere.cloudCover', 'cover', 0, 1, 0.01),
          0.62,
          [ range('atmosphere.cloudHeight', 'ceiling', 10, 90, 1) ],
        ),
      ],
    },
    {
      title:    'mist',
      controls: [
        toggled(
          'ground mist',
          range('atmosphere.mistAmount', 'density', 0, 1, 0.01),
          0.34,
          [ range('atmosphere.mistWind', 'drift', 0, 1.5, 0.01) ],
        ),
      ],
    },
    {
      title:    'water',
      controls: [
        toggled('sun glitter', range('water.sparkle', 'strength', 0, 1.5, 0.01), 0.5),
        range('water.waveHeight', 'swell', 0, 0.4, 0.005),
        range('water.rippleStrength', 'ripple', 0, 0.6, 0.01),
        range('water.roughness', 'roughness', 0.05, 1, 0.01),
      ],
    },
    {
      title:    'ground',
      controls: [
        range('terrain.detailGrain', 'soil grain', 0, 1, 0.01),
        range('terrain.detailMacro', 'soil patches', 0, 1.5, 0.01),
        range('terrain.detailScale', 'grain scale', 1, 24, 0.5),
        range('wind.strength', 'wind strength', 0, 3, 0.01),
        range('wind.speed', 'wind speed', 0, 4, 0.01),
      ],
    },
    {
      title:    'camera',
      controls: [
        range('camera.tiltNear', 'tilt zoomed in', 8, 60, 1),
        range('camera.tiltFar', 'tilt zoomed out', 8, 70, 1),
      ],
    },
  ]
}
