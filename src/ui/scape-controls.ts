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
 *
 * A row is a *look* someone would turn: how hard it rains, how much snow lies.
 * The rate a beacon turns at, the height of the haar's top, how far ahead of
 * the rain the ice veil runs, the lag of high water — those are the physics of
 * the place, and live on as config leaves for `--set` and the url, not rows.
 * Every effect is one strength row; the panel only shrinks.
 */
export function createScapeControls (quality: AtmosphereQuality): ControlSection[] {
  return [
    {
      group:    'look',
      title:    'optics',
      open:     true,
      controls: [
        range('look.intensity', 'film grade', 0, 1, 0.01),
        toggled('glare', range('look.glare', 'bloom, streak and shafts', 0, 3, 0.01, quality.bloom), 1),
        toggled('lens', range('look.lens', 'defocus, fringe, halation, grain', 0, 2, 0.01), 1),
        toggled('occlusion', range('look.ao', 'shade where things meet', 0, 2, 0.01), 1),
        range('terrain.detailGrain', 'ground grain & relief', 0, 1, 0.01),
      ],
    },
    {
      group:    'time',
      title:    'the clocks',
      controls: [
        // The phases sit outside their switches on purpose: freezing a clock is
        // exactly when you want to scrub it.
        { ...range('daylight.time', 'time of day', 0, 1, 0.002), live: true },
        toggled('day cycle', range('daylight.speed', 'cycles per minute', 0, 2, 0.01), 0.4),
        { ...range('season.time', 'time of year', 0, 1, 0.002), live: true },
        toggled('year cycle', range('season.speed', 'years per minute', 0, 1, 0.01), 0.08),
        { ...range('weather.time', 'time in the front', 0, 1, 0.002), live: true },
        toggled('weather cycle', range('weather.speed', 'fronts per minute', 0, 1, 0.01), 0.14),
        // Live: the arc is solved per frame, so dragging the coast north until
        // the winter loses its daylight is a slider that tells the truth.
        range('daylight.latitude', 'latitude °n', 0, 80, 0.5),
        range('daylight.moonStrength', 'moonlight', 0, 0.6, 0.01),
      ],
    },
    {
      group:    'time',
      title:    'season',
      controls: [
        toggled('snow', range('season.snow', 'cover', 0, 1, 0.01), 0.85),
        range('season.turn', 'leaf turn', 0, 1, 0.01),
        toggled('sea ice', range('season.ice', 'freeze', 0, 1, 0.01), 0.9),
        toggled('floes', range('pack.cover', 'plates standing', 0, 1, 0.01, quality.floeCount > 0), 1),
        // The gap between the land's winter and the sea's, so it files here.
        toggled('sea smoke', range('season.seaSmoke', 'steam', 0, 1, 0.01), 0.9),
      ],
    },
    {
      group:    'time',
      title:    'weather',
      controls: [
        toggled('rain', range('weather.rain', 'how hard it falls', 0, 1, 0.01, quality.rainDrops > 0), 0.9),
        toggled('hail', range('weather.hail', 'how hard it comes down', 0, 1, 0.01, quality.hailStones > 0), 0.75),
        range('weather.wet', 'wet ground', 0, 1, 0.01),
        toggled('far squall', range('squall.strength', 'how heavy it lies', 0, 1, 0.01, quality.squallSheets > 0), 0.7),
        // The bow and the halo come out on the edges of a band, so the front's
        // scrubber is what walks them in and out.
        toggled('rainbow', range('rainbow.strength', 'how brightly it stands', 0, 1, 0.01, quality.rainbowArcs > 0), 0.85),
        toggled('halo', range('halo.strength', 'how brightly it stands', 0, 1, 0.01, quality.haloArcs > 0), 0.85),
        toggled('lightning', range('storm.strength', 'how the cloud lights', 0, 1, 0.01, quality.stormFlashes > 0), 0.85),
      ],
    },
    {
      group:    'air',
      title:    'sky & mist',
      controls: [
        range('atmosphere.fogDensity', 'fog density', 0, 0.9, 0.01),
        // The cover is in the shadow's own product: switching the deck off
        // takes the dapple with it.
        toggled(
          'sky clouds',
          range('atmosphere.cloudCover', 'cover', 0, 1, 0.01),
          0.62,
          [ range('atmosphere.cloudShadow', 'shadow', 0, 1, 0.01) ],
        ),
        toggled('ground mist', range('atmosphere.mistAmount', 'density', 0, 1, 0.01), 0.34),
        toggled('the night bank', range('haar.strength', 'thickness', 0, 1, 0.01, quality.haarSheets > 0), 0.85),
        toggled('light through the deck', range('shafts.strength', 'brightness', 0, 0.6, 0.005, quality.shaftSheets > 0), 0.22),
        toggled('aurora', range('atmosphere.aurora', 'brightness', 0, 1.5, 0.01, quality.auroraLayers > 0), 0.85),
        toggled('night sky', range('atmosphere.starlight', 'starlight', 0, 1.5, 0.01, quality.starCount > 0), 0.85),
        range('wind.strength', 'wind', 0, 3, 0.01),
        range('wind.bearing', 'wind bearing', -180, 180, 1),
      ],
    },
    {
      group:    'ground & water',
      title:    'the sea',
      controls: [
        toggled('sun glitter', range('water.sparkle', 'strength', 0, 1.5, 0.01), 0.5),
        toggled('the night sea', range('water.moonTrack', 'moon track', 0, 8, 0.05), 3.2),
        toggled('swell', range('water.waveHeight', 'height (m)', 0, 0.4, 0.005), 0.075),
        range('water.rippleStrength', 'ripple', 0, 0.6, 0.01),
        toggled('surf', range('water.surf', 'break', 0, 1.5, 0.01), 0.85),
        toggled('whitecaps', range('water.whitecap', 'coverage', 0, 1, 0.01), 0.34),
        toggled('roost', range('roost.strength', 'broken water', 0, 1, 0.01), 0.72),
        toggled('the wash', range('swash.reach', 'run-up (Hunt)', 0, 2, 0.01), 1),
        toggled('caustics', range('water.caustics', 'strength', 0, 1.5, 0.01), 1),
        toggled('the tide', range('tide.range', 'spring range (m)', 0, 1.6, 0.01), 0.8),
        toggled('boat wakes', range('water.wakeStrength', 'wake strength', 0, 1.5, 0.01), 0.78),
      ],
    },
    {
      group:    'ground & water',
      title:    'fresh water',
      controls: [
        toggled('the beck', range('beck.flow', 'flow (m/s)', 0, 4, 0.05), 1.1),
        toggled('the fall', range('force.flow', 'flow (m/s)', 0, 8, 0.05), 3.2),
        toggled('the tarns', range('tarn.mirror', 'mirror', 0, 1, 0.01), 0.86),
      ],
    },
    {
      group:    'ground & water',
      title:    'life on the coast',
      controls: [
        toggled('gulls', range('birds.flight', 'aloft', 0, 1, 0.01, quality.birdCount > 0), 0.85),
        toggled('seals', range('haulout.ashore', 'hauled out', 0, 1, 0.01, quality.sealCount > 0), 0.78),
        toggled('chimneys', range('hearth.smoke', 'smoke', 0, 1, 0.01, quality.hearthPuffs > 0), 0.52),
        toggled('the lime burn', range('kiln.draw', 'draw', 0, 3, 0.05, quality.hearthPuffs > 0), 1.8),
        toggled('carts', range('carter.reach', 'a day’s haul (m)', 0, 600, 5, quality.carterRounds > 0), 240),
        toggled(
          'lit windows',
          range('windows.glow', 'lamps', 0, 2, 0.01),
          0.95,
          [ range('windows.occupancy', 'windows occupied', 0, 1, 0.01) ],
        ),
        toggled('lights on the far shore', range('shoreLights.glow', 'lamps', 0, 2, 0.01), 1),
        toggled('coastal light', range('beacon.lamp', 'lamp', 0, 2, 0.01, quality.beaconBlades > 0), 0.85),
        toggled(
          'carried lamp',
          range('cursorLight.intensity', 'strength', 0, 2, 0.01, quality.cursorLight),
          0.6,
          [ range('cursorLight.distance', 'reach (m)', 2, 40, 0.5) ],
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
    {
      group:    'device',
      title:    'performance',
      persist:  false,
      controls: [
        range('runtime.pixelRatio', 'pixel ratio', 0.5, 2, 0.05),
        range('runtime.frameCap', 'frame cap · 0 free', 0, 120, 5),
        range('runtime.shadowCadence', 'shadow every n frames', 1, 4, 1, quality.shadows),
      ],
    },
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
