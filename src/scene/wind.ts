import { defineModule } from 'threejs-scene'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'


/**
 * The weather's fourth clock, and the only one every other system reads.
 *
 * Before this there were five winds. The foliage integrated `elapsed *
 * wind.speed` and swayed on a phase derived from an instance's own coordinates;
 * the cloud shadow scrolled along a drift vector hard-coded in
 * `props/material.ts`; the deck overhead picked a heading off the seed; each
 * mist sheet picked another; and the rain kept a heading of its own that it
 * advanced itself. Every one of them was a wind, and no two of them agreed
 * which way it was blowing — so a gust crossing the grass never reached the
 * mist standing in it, and the clouds crossed the sky at an unrelated angle.
 *
 * One authority, then, and every consumer keeps only a *response*: a
 * dimensionless factor saying how hard that system answers the wind, never a
 * rate of its own. {@link WindState.travel} is what makes them agree — a single
 * integrated distance every scrolling surface multiplies by its own response,
 * so one gust is one wave passing over the whole scape rather than four
 * unrelated scrolls that happen to speed up together.
 *
 * The aurora is the deliberate exception, and keeps `atmosphere.auroraSpeed`.
 * An aurora is a current in the ionosphere eighty kilometres up; it does not
 * blow on a coastal wind, and giving it one would be a tidier config that lied.
 */
export interface WindState {

  /** Phase of the gust front, 0..1 — `wind.time` as of this tick. */
  phase: number

  /** Where the wind is blowing *to*, in radians, veer included. */
  bearing: number

  /** The bearing as a unit vector in the ground plane. */
  dirX: number
  dirZ: number

  /** The authored strength, before the gust. */
  base: number

  /** How far into a gust the front currently is, 0..1. */
  gust: number

  /** What is actually blowing: `base` lifted by the gust. */
  strength: number

  /**
   * Accumulated wind travel.
   *
   * The shared quantity, and the reason this module exists. Integrated from
   * `speed * strength`, so it stops dead when either reaches zero — which is
   * what lets a capture freeze the whole scape's motion with the two knobs
   * `STILL` already sets.
   */
  travel: number
}

export interface Wind {
  module: ScapeModule

  /**
   * The live instant of the wind, resolved once per frame by this module.
   *
   * Published rather than sampled, the way the landscape publishes its year:
   * two samples in one frame are two different gusts, and a scape whose grass
   * and mist lean on different instants is exactly what this replaced.
   */
  state: WindState
}

const TAU = Math.PI * 2

/**
 * How far the bearing wanders at full gust, in radians.
 *
 * Not a knob, on purpose. A wind that backs and veers is a property of wind
 * rather than a thing to tune, and it has no useful setting other than "a
 * little" — at more than about fifteen degrees the grass visibly swings round
 * and reads as a vortex rather than as weather.
 */
const VEER = 0.21

/**
 * Fronts per minute, per unit of wind speed.
 *
 * A sixth puts a squall through about every four and a half minutes at the
 * default wind, which is the rate the separate `gustSpeed` knob this replaced
 * was set to.
 */
const GUST_RATE = 1 / 6

/**
 * The gust at a phase of the front, 0..1.
 *
 * Three incommensurate sines rather than one, for the reason the lake's glitter
 * uses two noise fetches: a single sine is a period the eye finds within two
 * cycles, and wind that pulses on a metronome reads as machinery. Their sum
 * never repeats inside the clock's own turn, so a gust arrives when it arrives.
 */
export function gustAmount (phase: number): number {
  const wrapped = phase - Math.floor(phase)
  const swell   = Math.sin(wrapped * TAU) * 0.5 +
    Math.sin(wrapped * TAU * 2.7 + 1.1) * 0.3 +
    Math.sin(wrapped * TAU * 5.3 + 2.4) * 0.2

  return Math.min(1, Math.max(0, swell * 0.5 + 0.5))
}

/**
 * The veer at a phase of the front, -1..1.
 *
 * Deliberately not the gust curve reused. A wind that only ever swings when it
 * strengthens is a wind with one degree of freedom, and the giveaway is that
 * every gust comes from the same new quarter — so this is its own slower
 * wander, offset so the two peaks never line up.
 */
export function veerAmount (phase: number): number {
  const wrapped = phase - Math.floor(phase)

  return Math.sin(wrapped * TAU + 0.7) * 0.68 + Math.sin(wrapped * TAU * 1.9 - 0.4) * 0.32
}

/**
 * One wind for the whole scape.
 *
 * Mounted before the landscape, so the instant every other module reads has
 * already been resolved for the frame in flight. It owns no geometry and no
 * gpu resource at all — which is why, like the year and the weather, it can run
 * on a clock without anything ever being rebuilt.
 */
export function createWind (config: LiveConfig): Wind {
  const state: WindState = {
    phase:    0,
    bearing:  0,
    dirX:     1,
    dirZ:     0,
    base:     0,
    gust:     0,
    strength: 0,
    travel:   0,
  }

  /** Resolve the state from a phase. Split out so `build` can settle it too. */
  function resolve (phase: number): void {
    const wind    = config().wind
    const wrapped = phase - Math.floor(phase)
    const gust    = gustAmount(wrapped)
    const bearing = wind.bearing * Math.PI / 180 + veerAmount(wrapped) * VEER * wind.gust

    state.phase    = wrapped
    state.gust     = gust
    state.base     = Math.max(0, wind.strength)
    state.strength = state.base * (1 + gust * wind.gust)
    state.bearing  = bearing
    state.dirX     = Math.cos(bearing)
    state.dirZ     = Math.sin(bearing)
  }

  const module = defineModule<ScapeConfig>({
    name: 'wind',

    build () {
      resolve(config().wind.time)
    },

    // The phase is a field in the config, exactly as the day, the year and the
    // front are — so scrubbing the overlay's slider and letting the clock run
    // are the same operation on the same number.
    update (state_, frame) {
      const wind = state_.wind

      // The front is carried by the wind, not by a rate of its own. A harder
      // wind brings its squalls through faster, which is the physics and also
      // the reason there is no second knob here saying so — and it is what lets
      // `wind.speed=0` freeze the gust along with everything else it stops.
      wind.time = (wind.time + frame.delta * wind.speed * GUST_RATE / 60) % 1

      resolve(wind.time)

      // Integrated after the strength is resolved, so a gust travels further as
      // well as harder. Both factors can reach zero, which is the whole
      // contract: `wind.speed=0` and `wind.strength=0` stop every scrolling
      // surface in the scape at once.
      state.travel += frame.delta * wind.speed * state.strength
    },
  })

  return { module, state }
}

// perf: three sines and a pair of trig calls per frame, no allocation, no
// geometry and no gpu resource. Every consumer reads the published record.
