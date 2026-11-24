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
 * the rain the ice veil runs, the lag of high water, the wind's bearing, the
 * camera's tilt, the latitude, the strength of the surface detail
 * every material shares — those are the physics of the place, and live on as config leaves for `--set` and the url, not rows.
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
        // The light through the deck is glare too — a bright gap smeared by the
        // air rather than the glass — so it rides this row (\`shafts.strength\`
        // is its share, a config leaf), and the row is live wherever either is.
        toggled('glare', range('look.glare', 'bloom, streak, rays through the deck', 0, 3, 0.01, quality.bloom || quality.shaftSheets > 0), 1),
        toggled('lens', range('look.lens', 'defocus, fringe, halation, grain', 0, 2, 0.01), 1),
        // The light that arrives second-hand: the sky a neighbour hides, and the
        // sunlit ground (or snow) lighting every face from below (\`ground-bounce.ts\`).
        toggled('indirect light', range('look.ao', 'occlusion and ground bounce', 0, 2, 0.01), 1),
      ],
    },
    {
      group:    'time',
      title:    'the clocks',
      controls: [
        // The phases sit outside their switch on purpose: freezing a clock is
        // exactly when you want to scrub it. Only the day runs from the panel;
        // how fast the year and the fronts turn (`season.speed`,
        // `weather.speed`) are rates, config leaves for `--set` and the url.
        { ...range('daylight.time', 'time of day', 0, 1, 0.002), live: true },
        toggled('day cycle', range('daylight.speed', 'cycles per minute', 0, 2, 0.01), 0.4),
        { ...range('season.time', 'time of year', 0, 1, 0.002), live: true },
        { ...range('weather.time', 'time in the front · the light greys under it', 0, 1, 0.002), live: true },
      ],
    },
    {
      group:    'time',
      title:    'season',
      controls: [
        // How far the leaves turn is the year's own colour, carried by the
        // clock above: \`season.turn\` is a config leaf for \`--set\` and the url.
        toggled('snow', range('season.snow', 'cover', 0, 1, 0.01), 0.85),
        // The plates standing on the sound are the sea ice's, so they follow
        // its freeze; \`pack.cover\` stays a config leaf for \`--set\` and the url.
        toggled('sea ice · freeze and floes', range('season.ice', 'freeze', 0, 1, 0.01), 0.9),
      ],
    },
    {
      group:    'time',
      title:    'weather',
      controls: [
        // Hail falls out of the same showers, so it rides this row:
        // \`weather.hail\` is its share (a config leaf).
        toggled('rain & hail · and the wet they leave', range('weather.rain', 'how hard it falls', 0, 1, 0.01, quality.rainDrops > 0 || quality.hailStones > 0), 0.9),
        // The far squall and its lightning, and the bow and the halo, are
        // what the front brings through on its own clock — the front's
        // scrubber walks them in and out, and the bow already needs the rain's
        // drops. \`squall.strength\` and \`rainbow.strength\` are config
        // leaves for \`--set\` and the url, defaults unchanged.
      ],
    },
    {
      group:    'air',
      title:    'sky & mist',
      controls: [
        range('atmosphere.fogDensity', 'fog density', 0, 0.9, 0.01),
        // The cover is in the shadow's own product, so one row is the deck and
        // the dapple both: \`atmosphere.cloudShadow\` — how dark a cloud's
        // shadow is, which is the light's physics — is a config leaf only.
        toggled('sky clouds · deck and its shadow', range('atmosphere.cloudCover', 'cover', 0, 1, 0.01), 0.62),
        // One fog on the ground, whichever surface it lies on: the mist over the
        // land, and the steam off the open water in the weeks of the year it has.
        toggled('mist · ground, sea smoke, night bank', range('atmosphere.mistAmount', 'density', 0, 1, 0.01), 0.34),
        toggled('night sky · stars, aurora, moonlight', range('atmosphere.starlight', 'starlight', 0, 1.5, 0.01, quality.starCount > 0 || quality.auroraLayers > 0), 0.85),
        range('wind.strength', 'wind', 0, 3, 0.01),
      ],
    },
    {
      group:    'ground & water',
      title:    'water',
      controls: [
        // One row for the sky in every water: the sea's mirror and the clouds
        // in it, the glitter of the sun and the moon, and the tarns' polish.
        toggled('the sky in the water · sea, glitter, tarns', range('water.mirror', 'mirror', 0, 1.5, 0.01), 1),
        // The wash rides the sea state (its run-up scales with the wave), so
        // \`swash.reach\` — Hunt's coefficient, physics — is a config leaf only.
        // A wake is the sea's answer to a hull, so it rides the sea state's row
        // (\`water.ts\` scales it by the state up to 1): \`water.wakeStrength\`
        // is a config leaf for \`--set\` and the url.
        range('water.state', 'sea state · swell, surf, caps, wash', 0, 2, 0.01),
        // The tide's spring range and the beck's flow are the place's
        // hydrology — a range in metres, a speed in metres a second — not a
        // look anyone turns: \`tide.range\` and \`beck.flow\` are config
        // leaves for \`--set\` and the url.
      ],
    },
    {
      group:    'ground & water',
      title:    'life on the coast',
      controls: [
        // One row for the colonies: the gulls aloft, and the seals hauled out
        // as a share of it (\`haulout.ashore\`, a config leaf).
        toggled('wildlife · gulls aloft, seals ashore', range('birds.flight', 'life', 0, 1, 0.01, quality.birdCount > 0 || quality.sealCount > 0), 0.85),
        // One row for every household and every lamp: the far coast's glow, the
        // cursor's lantern (\`cursorLight.intensity\`), the coastal light
        // (\`beacon.lamp\`) and the chimneys (\`hearth.smoke\`) are shares of
        // it. Occupancy, a kiln's draw and a cart's haul are the place's
        // physics, and live on as config leaves.
        toggled('lamps & hearths · ashore, far, carried, the light', range('windows.glow', 'glow', 0, 2, 0.01), 0.95),
      ],
    },
    {
      group:    'device',
      title:    'performance',
      persist:  false,
      controls: [
        range('runtime.pixelRatio', 'pixel ratio', 0.5, 2, 0.05),
        // The shadow's cadence is the tier's decision (\`main.ts\` writes it):
        // \`runtime.shadowCadence\` is a config leaf for \`--set\` and the url.
        range('runtime.frameCap', 'frame cap · 0 free', 0, 120, 5),
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
