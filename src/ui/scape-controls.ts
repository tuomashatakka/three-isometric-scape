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

  /**
   * Whether changing this needs the scape built again.
   *
   * Almost nothing does — the whole point of the dotted-path design is that the
   * modules re-read the config every frame. What does are the decisions taken
   * *once*, when the renderer and its programs are made: whether there is a post
   * chain at all, whether shadow maps compile, how many drops are in the rain's
   * one static buffer. A knob that silently did nothing until the next reload
   * would lie about what a knob does, so this one says so and rebuilds.
   */
  rebuild?: boolean
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

  /**
   * The heading this section files under.
   *
   * Ten flat fieldsets in a nineteen-rem drawer is a list, not an interface —
   * finding the snow line meant reading every legend on the way past it. Runs of
   * sections that share a group get one heading and a rule above them, and each
   * section collapses on its own underneath it.
   */
  group?: string

  /** Whether the section starts open. Most do not; the drawer is small. */
  open?: boolean

  /**
   * Whether the snapshot should remember this section. Defaults to yes.
   *
   * Everything else on the panel describes the place, and a place is worth
   * keeping. The performance section describes the budget the place is drawn on,
   * and that is seeded from whatever tier the device resolved to *this* load. A
   * pixel ratio or an uncapped frame rate kept from one session and replayed
   * into the next is how a device that has already lost a context gets handed
   * back the budget that took it — underneath a tier the memory had correctly
   * held down.
   */
  persist?: boolean
}

const GRADES: readonly GradeName[] = [
  'nordic', 'natural', 'cinematic', 'warm', 'cool', 'noir', 'dream',
]

/**
 * What the device is allowed to build.
 *
 * `tier` is the budget the device was detected into, which leaves whole systems
 * out on the cheap ones rather than drawing poor versions of them. `all` builds
 * every effect the scape has, on whatever tier is running — the reader's call to
 * make on their own hardware, and the switch that puts the optical chain back on
 * a phone that the mobile preset takes it off.
 */
const EFFECT_MODES: readonly string[] = [ 'tier', 'all' ]

/**
 * Every leaf path the overlay persists, in declaration order.
 *
 * The paths themselves are read and written with `readPath`/`writePath` from
 * the runtime — this module owns the *tree*, not the addressing.
 */
export function controlPaths (sections: readonly ControlSection[]): string[] {
  return sections
    .filter(section => section.persist !== false)
    .flatMap(section => section.controls.flatMap(
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
      group:    'look',
      title:    'optics',
      open:     true,
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
      group:    'time',
      title:    'daylight',
      controls: [
        // Outside the switch on purpose: freezing the clock is exactly when you
        // want to scrub it, so the time knob must survive the cycle being off.
        { ...range('daylight.time', 'time of day', 0, 1, 0.002), live: true },
        toggled('day cycle', range('daylight.speed', 'cycles per minute', 0, 2, 0.01), 0.4),
        // Both live, and both rebuild nothing: the arc is solved per frame, so
        // dragging the coast north until the winter loses its daylight is a
        // slider that tells the truth about what it does.
        range('daylight.latitude', 'latitude °n', 0, 80, 0.5),
        range('daylight.axialTilt', 'axial tilt', 0, 40, 0.1),
        range('daylight.azimuth', 'noon bearing', -180, 180, 1),
        range('daylight.nightLift', 'night lift', 0, 1, 0.01),
      ],
    },
    {
      group:    'time',
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
      group:    'time',
      title:    'weather',
      controls: [
        // Outside the switch, like the other two clocks' phases: freezing the
        // front is exactly when you want to scrub through it.
        { ...range('weather.time', 'time in the front', 0, 1, 0.002), live: true },
        toggled('weather cycle', range('weather.speed', 'fronts per minute', 0, 1, 0.01), 0.14),
        toggled(
          'rain',
          range('weather.rain', 'how hard it falls', 0, 1, 0.01, quality.rainDrops > 0),
          0.9,
          [ range('weather.fall', 'fall speed', 0, 40, 0.5) ],
        ),
        // Under the weather rather than under the ground, because it is the rain
        // that puts it there and the rain's own clock that takes it away again.
        range('weather.wet', 'wet ground', 0, 1, 0.01),
      ],
    },
    {
      group:    'air',
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
        // Under the sky rather than under the year, even though the year is half
        // of what drives it. The aurora is a thing in the sky the way the deck
        // is, and the knobs that shape it are a height and a drift — the same
        // two the clouds above it have.
        toggled(
          'aurora',
          range('atmosphere.aurora', 'brightness', 0, 1.5, 0.01, quality.auroraLayers > 0),
          0.85,
          [
            range('atmosphere.auroraHeight', 'ceiling', 20, 70, 1),
            range('atmosphere.auroraSpeed', 'drift', 0, 2, 0.01),
          ],
        ),
        // Beside the aurora, because it is the same deck and the same one gate:
        // how much sky the sun has left. There is no height and no drift under
        // it, and that is the point — the wheel's angle is the hour and the
        // month is the year, so everything that would have been a knob here is
        // already a slider somewhere else on this panel.
        toggled(
          'night sky',
          range('atmosphere.starlight', 'starlight', 0, 1.5, 0.01, quality.starCount > 0),
          0.85,
          [ range('atmosphere.moonlight', 'moon', 0, 2.5, 0.01) ],
        ),
      ],
    },
    {
      group:    'air',
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
      group:    'ground & water',
      title:    'water',
      controls: [
        toggled('sun glitter', range('water.sparkle', 'strength', 0, 1.5, 0.01), 0.5),
        range('water.waveHeight', 'swell', 0, 0.4, 0.005),
        range('water.rippleStrength', 'ripple', 0, 0.6, 0.01),
        toggled('boat wakes', range('water.wakeStrength', 'wake strength', 0, 1.5, 0.01), 0.78),
        range('water.roughness', 'roughness', 0.05, 1, 0.01),
        range('boats.speed', 'boat speed', 0, 12, 0.1),
      ],
    },
    {
      group: 'ground & water',
      title: 'the gulls',

      // Filed under the water because that is what they are over, the way the
      // coastal light is. How *many* there are is the tier's — see
      // `quality.birdCount` — and where they hang is the survey's, so what is
      // left here is how much of the colony is up and what it is doing. The
      // colony spread is deliberately absent: it decides where the rings were
      // fitted, which takes a rebuild to see.
      controls: [
        toggled(
          'gulls',
          range('birds.flight', 'aloft', 0, 1, 0.01, quality.birdCount > 0),
          0.85,
          [
            range('birds.speed', 'wheeling', 0, 1.5, 0.01),
            range('birds.flap', 'wingbeats a second', 0, 6, 0.1),
            range('birds.wingspan', 'wingspan (m)', 0.4, 4, 0.05),
            range('birds.ceiling', 'ceiling (m)', 4, 60, 0.5),
          ],
        ),
      ],
    },
    {
      group:    'ground & water',
      title:    'ground',
      controls: [
        range('terrain.detailGrain', 'soil grain', 0, 1, 0.01),
        range('terrain.detailMacro', 'soil patches', 0, 1.5, 0.01),
        range('terrain.detailScale', 'grain scale', 1, 24, 0.5),
        // The other half of the same injection: everything upright, which the
        // soil terms cannot reach because they weigh themselves by how
        // horizontal a face is.
        range('terrain.propGrain', 'timber & stone grain', 0, 1, 0.01),
        range('wind.strength', 'wind strength', 0, 3, 0.01),
        range('wind.speed', 'wind speed', 0, 4, 0.01),
        // Scaled by the wind strength above rather than standing apart from it,
        // so a still day already stops the wheel and this is only the gearing.
        range('mill.spin', 'mill sails', 0, 4, 0.01),
      ],
    },
    {
      group:    'ground & water',
      title:    'the light',
      // Under the water rather than under the sky: what the beam is for is the
      // sea it sweeps, and the lamp answers to the sun without a knob of its own.
      // The blades are the tier's — see `quality.beaconBlades` — so what is left
      // here is how brightly it burns and how fast it turns.
      controls: [
        toggled(
          'coastal light',
          range('beacon.lamp', 'lamp', 0, 2, 0.01, quality.beaconBlades > 0),
          0.85,
          [
            range('beacon.turn', 'turns per minute', 0, 12, 0.1),

            // Only does anything where there is a bloom to catch it, so it is
            // greyed rather than hidden on the tiers without one — the knob is
            // still the reason the lamp looks different between them.
            range('beacon.glow', 'glow', 1, 12, 0.1, quality.bloom),
          ],
        ),
      ],
    },
    {
      group:    'camera',
      title:    'framing',
      controls: [
        range('camera.tiltNear', 'tilt zoomed in', 8, 60, 1),
        range('camera.tiltFar', 'tilt zoomed out', 8, 70, 1),
      ],
    },

    // The only section that changes what the frame costs rather than what it
    // shows, and the only one the snapshot deliberately forgets. See `persist`.
    {
      group:    'device',
      title:    'performance',
      persist:  false,
      controls: [
        range('runtime.pixelRatio', 'pixel ratio', 0.5, 2, 0.05),

        // Zero is the top of the range, not the bottom of it: an uncapped loop
        // draws on every animation frame the display offers, which is the most
        // expensive thing this slider can ask for.
        range('runtime.frameCap', 'frame cap · 0 free', 0, 120, 5),
        range('runtime.shadowCadence', 'shadow every n frames', 1, 4, 1, quality.shadows),
      ],
    },

    // Its own section, and persisted where `performance` is not. Those three
    // knobs are seeded from whichever tier the device resolved to *this* load,
    // so replaying them is how a device that has already lost a context gets
    // handed back the budget that took it. This is not that: it is a deliberate
    // answer to a question the reader was asked, and forgetting it every reload
    // would make the switch useless. A context loss still clears it — see
    // `loseContext` in `main.ts` — because that is the device disagreeing.
    {
      group:    'device',
      title:    'effects',
      controls: [
        {
          kind: 'select', path: 'runtime.effects', label: 'build', options: EFFECT_MODES, rebuild: true,
        },
      ],
    },
  ]
}
