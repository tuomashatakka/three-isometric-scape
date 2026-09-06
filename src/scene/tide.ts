import { defineModule } from 'threejs-scene'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import { moonPhase } from './nightsky.ts'


/**
 * The tide, and the moon that makes it.
 *
 * The sea in this scape stood at one level. Every solver that asks where the
 * water is — the jetty finder, the waterway router, the beacon's freeboard, the
 * littoral band on the skerries — asks `terrain.waterLevel`, and that is right:
 * those are facts about the ground, and the ground is surveyed against *mean*
 * water. What was missing is the other half, which is that the sea is only at
 * its mean level twice a cycle.
 *
 * This is the second half, and it is not a fourth clock either. The moon is
 * already in the sky here — `nightsky.moonPhase` reads the day against the year
 * and gets a month out of the two — and the tide is that same moon seen from
 * underneath. So it inherits the property the moon has: turn `daylight.speed`
 * down and the water slows; stop it and the water holds, which is what a
 * capture needs and why there is nothing to add to `STILL` for it.
 *
 * Two consumers, and both take the published record rather than resolving the
 * hour a second time. The lake moves its own plane and shifts every depth it
 * reads by the same metres, so the tint, the trim, the breakers, the caustics
 * and the ice front all walk up and down the beach together. The fleet floats
 * on it. What deliberately does *not* move is anything that was solved: a jetty
 * built for the tide it happens to be at high water is a jetty that has to be
 * rebuilt twice a cycle.
 */
export interface TideState {

  /**
   * Metres above mean water, positive on the flood.
   *
   * This is the only number either consumer wants, and it is an offset rather
   * than a level so nothing has to remember which mean it was measured from.
   */
  level: number

  /** Phase of the semidiurnal cycle, 0..1. 0 is high water, 0.5 is low. */
  phase: number

  /** Half the range in force this hour, in metres — what `level` swings inside. */
  amplitude: number

  /** Where the month is between neaps (0) and springs (1). */
  spring: number
}

export interface Tide {
  module: ScapeModule

  /**
   * The live instant of the tide, resolved once per frame by this module.
   *
   * Published rather than sampled, for the reason the wind is: the lake and the
   * fleet reading two different instants of the same tide is a boat sitting in
   * a hole in the sea, and it would only show at the two ends of the swing.
   */
  state: TideState
}

const TAU = Math.PI * 2

/**
 * Turns of the day clock between one lunar transit and the next.
 *
 * A day is a turn of `daylight.time` and the moon slips one lunation back
 * through the year, so the hour angle the tide runs on is `time - moonPhase` —
 * exactly the one `nightsky.moonPlace` puts the moon at. The lunar day falls
 * out of that subtraction rather than being a constant here, which is why this
 * file has no 24.84 in it: the two clocks already say what it is.
 *
 * Transit is at phase 0.5, because that is where the day clock puts noon and
 * the moon is on the sun's own arc.
 */
const TRANSIT = 0.5

/** Highs per turn of the moon's hour angle. Semidiurnal: one at each transit. */
const HIGHS = 2

/**
 * How far the month is toward springs at a phase of the month, 0..1.
 *
 * 1 at new and at full, 0 at both quarters. The physics is the sun's tide
 * arriving either in step with the moon's or across it, and the shape of that
 * is a cosine at twice the month — which is the same |cos| the illuminated
 * width is drawn from, taken at double rate. Springs therefore land on the dark
 * of the moon as well as on the full one, which is the half of it that gets
 * left out when a scape ties big tides to a bright sky.
 */
export function springAmount (phase: number): number {
  return Math.abs(Math.cos((phase - Math.floor(phase)) * TAU))
}

/**
 * Half the range in force this month, in metres.
 *
 * `range` is the spring range, high water to low, and `spring` is how much of
 * it the month is allowed to take away — 0 is a coast whose every tide is the
 * same size, which is the switch for the month rather than a second flag.
 */
export function tideAmplitude (year: number, tide: ScapeConfig['tide']): number {
  return tideAmplitudeAt(springAmount(moonPhase(year)), tide)
}

/**
 * The same half-range, from a spring amount rather than from a date.
 *
 * The two ends of the month are worth being able to ask for without inventing a
 * year that lands on them: `tideAmplitudeAt(1, tide)` is the spring amplitude
 * and `tideAmplitudeAt(0, tide)` the neap one, which is how the causeway's
 * covering is reported and how the test states its claim. Splitting it out is
 * what keeps that from being a second copy of the swing arithmetic.
 */
export function tideAmplitudeAt (spring: number, tide: ScapeConfig['tide']): number {
  const swing = 1 - Math.max(0, Math.min(1, tide.spring)) *
    (1 - Math.max(0, Math.min(1, spring)))

  return Math.max(0, tide.range) * 0.5 * swing
}

/**
 * Phase of the semidiurnal cycle at an hour of the day, 0..1. 0 is high water.
 *
 * The lag is the establishment of the port: high water does not arrive at the
 * moon's transit but a couple of hours behind it, because a tide is a wave
 * crossing a shelf rather than a bulge standing under the moon. Hours, and they
 * stay hours — how long the water takes to arrive over a continental shelf is
 * not a fact about how wide this world is.
 */
export function tidePhase (time: number, year: number, tide: ScapeConfig['tide']): number {
  const hour  = time - moonPhase(year) - TRANSIT - tide.lag / 24
  const turns = hour * HIGHS

  return turns - Math.floor(turns)
}

/** Metres above mean water at an hour of the day. */
export function tideLevel (time: number, year: number, tide: ScapeConfig['tide']): number {
  return tideAmplitude(year, tide) * Math.cos(tidePhase(time, year, tide) * TAU)
}

/**
 * One tide for the whole scape.
 *
 * Mounted beside the wind and ahead of the landscape, so the record the lake
 * and the fleet read has already been resolved for the frame in flight. Like
 * the wind and the year it owns no geometry and no gpu resource: nothing it
 * does needs a rebuild, which is what lets the sea run on a clock at all.
 */
export function createTide (config: LiveConfig): Tide {
  const state: TideState = { level: 0, phase: 0, amplitude: 0, spring: 1 }

  /** Resolve the state from the two clocks. Split out so `build` can settle it too. */
  function resolve (): void {
    const scape = config()
    const year  = scape.season.time

    state.spring    = springAmount(moonPhase(year))
    state.amplitude = tideAmplitude(year, scape.tide)
    state.phase     = tidePhase(scape.daylight.time, year, scape.tide)
    state.level     = state.amplitude * Math.cos(state.phase * TAU)
  }

  const module = defineModule<ScapeConfig>({
    name: 'tide',

    build () {
      resolve()
    },

    // No integration of its own. The hour and the week are both fields in the
    // config that the day and the year advance, so the tide is a function of
    // them rather than a state it keeps — and scrubbing the overlay's hour
    // slider walks the water up the beach exactly as letting the clock run
    // does.
    update () {
      resolve()
    },
  })

  return { module, state }
}
