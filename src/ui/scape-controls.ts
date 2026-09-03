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
        range('season.snowSwing', 'aspect', 0, 4, 0.1),
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

        // The same front, seen from outside it. `lead` is the knob worth
        // dragging with `weather.time` frozen: it walks the band forwards and
        // backwards through the squall the coast is about to get.
        toggled(
          'far squall',
          range('squall.strength', 'how heavy it lies', 0, 1, 0.01, quality.squallSheets > 0),
          0.7,
          [
            range('squall.lead', 'how far ahead of here', 0, 0.3, 0.005),
            range('squall.reach', 'how far it sweeps', 0, 3, 0.05),
            range('squall.span', 'how wide it runs', 0.05, 1, 0.01),
            range('squall.drift', 'travel with the wind', 0, 2, 0.01),
          ],
        ),
      ],
    },
    {
      group:    'air',
      title:    'atmosphere',
      controls: [
        range('atmosphere.fogDensity', 'fog density', 0, 0.9, 0.01),
        range('atmosphere.fogBreath', 'fog breath', 0, 0.4, 0.01),
        range('atmosphere.cloudShadow', 'cloud shadow', 0, 1, 0.01),
        range('atmosphere.cloudDrag', 'cloud drift', 0, 3, 0.01),
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
          [ range('atmosphere.mistDrag', 'drift', 0, 1.5, 0.01) ],
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

        // Which way it breaks is the wind's, and lives under the weather. What
        // is here is how hard, how far out, and how much the lee is spared.
        toggled(
          'surf',
          range('water.surf', 'break', 0, 1.5, 0.01),
          0.85,
          [
            range('water.surfDepth', 'shelf depth (m)', 0, 4, 0.05),
            range('water.surfExposure', 'weather side', 0, 1, 0.01),
          ],
        ),
        // How much of it is up on any given hour is the sun's, the same way the
        // surf's heading is the wind's. What is here is how bright, how far
        // down it reaches, and how big the cells of the net are.
        toggled(
          'caustics',
          range('water.caustics', 'strength', 0, 1.5, 0.01),
          1,
          [
            range('water.causticDepth', 'reach (m)', 0, 6, 0.05),
            range('water.causticScale', 'cell size (m)', 0.5, 8, 0.05),
          ],
        ),
        // The running water, filed under the sea it runs into. Only the two
        // live knobs are here: how deep the sheet is laid and how much of the
        // floor it covers are cut into the ribbon at build time, and a slider
        // that needs a reload lies about what a slider does.
        toggled(
          'the beck',
          range('beck.flow', 'flow (m/s)', 0, 4, 0.05),
          1.1,
          [ range('beck.riffle', 'white water', 0, 1.5, 0.01, quality.beckRipples > 0) ],
        ),
        // Filed under the water for the reason the beck is, and with the same
        // two-knob restraint: where a pool stands and how deep its basin is cut
        // are folded into the ground at build time, so what is here is what a
        // frame can actually change — how much sky the surface gives back, and
        // how far ahead of the sound it locks.
        toggled(
          'the tarns',
          range('tarn.mirror', 'mirror', 0, 1, 0.01),
          0.86,
          [ range('tarn.frost', 'frost, ahead of the sea', 0, 1, 0.01) ],
        ),
        // Which hour the water is at is the day's and the month's, the same way
        // the surf's heading is the wind's. What is here is how far it swings,
        // how much of that the month takes back, and how late it arrives.
        toggled(
          'the tide',
          range('tide.range', 'spring range (m)', 0, 1.6, 0.01),
          0.8,
          [
            range('tide.spring', 'neap falloff', 0, 1, 0.01),
            range('tide.lag', 'high-water lag (h)', 0, 12.4, 0.1),
          ],
        ),
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
      group: 'ground & water',
      title: 'hearth smoke',

      // Filed with the ground because that is where the fires are, the way the
      // gulls are filed with the water they wheel over. How *many* puffs a plume
      // is drawn from is the tier's — see `quality.hearthPuffs` — and where the
      // stacks stand is the survey's, so what is left here is how hard they are
      // burning and what the wind does about it.
      controls: [
        toggled(
          'chimneys',
          range('hearth.smoke', 'smoke', 0, 1, 0.01, quality.hearthPuffs > 0),
          0.52,
          [
            range('hearth.rise', 'rise (m)', 2, 30, 0.5),
            range('hearth.speed', 'climb (m/s)', 0, 6, 0.05),
            range('hearth.drag', 'lean into the wind', 0, 1, 0.01),
            range('hearth.winter', 'banked in winter', 0, 2, 0.01),
          ],
        ),
      ],
    },
    {
      group: 'ground & water',
      title: 'lamplight',

      // Beside the hearth smoke, because it is the same five buildings seen at
      // the other end of the day. How much haze a lamp is drawn with is the
      // tier's — see `quality.lampSpill` — and where the panes are is the
      // survey's, so what is left here is who is up and what their wicks are
      // doing. Every one of these is read per frame; there is nothing in this
      // section that needs a rebuild to be seen.
      controls: [
        toggled(
          'lit windows',
          range('windows.glow', 'lamps', 0, 2, 0.01),
          0.95,
          [
            range('windows.occupancy', 'windows occupied', 0, 1, 0.01),
            range('windows.rising', 'up at', 0, 0.5, 0.005),
            range('windows.bedtime', 'turned in at', 0.5, 1, 0.005),
            range('windows.banked', 'left burning', 0, 1, 0.01),
            range('windows.flicker', 'guttering', 0, 4, 0.05),
            range('windows.unsteady', 'guttering depth', 0, 1, 0.01),
          ],
        ),
      ],
    },
    {
      group:    'ground & water',
      title:    'ground',
      controls: [
        // Contrast *and* depth: the grain and the relief the ground is marched
        // through are the same field, so one number says how much grit there is
        // and there is no second one able to describe deep grit with no
        // contrast on it. 0 is flat, unlit paper — and it is the switch.
        range('terrain.detailGrain', 'soil grain & relief', 0, 1, 0.01),
        range('terrain.detailMacro', 'soil patches', 0, 1.5, 0.01),
        range('terrain.detailScale', 'grain scale', 1, 24, 0.5),
        // The other half of the same injection: everything upright, which the
        // soil terms cannot reach because they weigh themselves by how
        // horizontal a face is.
        range('terrain.propGrain', 'timber & stone grain', 0, 1, 0.01),
        // Scaled by the wind's live strength rather than standing apart from it,
        // so a still day already stops the wheel and this is only the gearing.
        range('mill.spin', 'mill sails', 0, 4, 0.01),
      ],
    },
    {
      // Its own section, and up in the air with the weather it belongs to. It
      // used to be two sliders at the bottom of `ground`, which is where it made
      // sense when the only thing it moved was the grass — one wind now drives
      // the mist, the deck, the fall, the sails and the sea as well, and the
      // three drift responses that answer it sit under the systems they belong
      // to rather than here.
      group:    'air',
      title:    'wind',
      controls: [
        range('wind.strength', 'strength', 0, 3, 0.01),
        range('wind.speed', 'speed', 0, 4, 0.01),
        range('wind.bearing', 'bearing', -180, 180, 1),
        // No separate rate under it: how fast a front comes through is
        // `wind.speed` above, because a harder wind brings its squalls through
        // faster and two numbers for that was two numbers to keep in step.
        toggled('gusts', range('wind.gust', 'variation', 0, 1, 0.01), 0.45),
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
      group:    'ground & water',
      title:    'cursor light',
      // Under the coastal light because they are both lamps: one fixed on a
      // rock and one carried by the reader. The tier gates whether this runs
      // at all — see `quality.cursorLight` — and the intensity knob is the
      // switch, so greying it on the floor tiers is enough.
      controls: [
        toggled(
          'carried lamp',
          range('cursorLight.intensity', 'strength', 0, 2, 0.01, quality.cursorLight),
          0.6,
          [
            range('cursorLight.distance', 'reach (m)', 2, 40, 0.5),
            range('cursorLight.lift', 'height (m)', 0, 6, 0.1),
            range('cursorLight.damping', 'smoothness (s)', 0.02, 0.6, 0.01),
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
