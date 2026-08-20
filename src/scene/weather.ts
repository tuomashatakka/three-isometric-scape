import { smoothstep } from 'threejs-scene'
import type { LiveConfig } from './config.ts'
import type { SeasonState } from './season.ts'


/** Everything the fall, the ground and the lake need for one instant of the weather. */
export interface WeatherState {

  /** Phase of the front, 0..1. 0 is the middle of the clear spell. */
  phase: number

  /** How hard it is coming down, 0..1, before the year says what it comes down as. */
  fall: number

  /** How much of that fall is frozen, 0..1. 0 is rain, 1 is snow. */
  sleet: number

  /**
   * How wet the ground is, 0..1.
   *
   * Never less than {@link fall} and usually more — see {@link wetAmount}. It is
   * already scaled by the coast's own strength and already has the frozen share
   * taken out of it, so a reader can mix straight on it.
   */
  wet: number
}

export interface Weather {
  state: WeatherState

  /** Resolve the weather at a phase, 0..1, against a week of the year. Allocation-free. */
  sample(phase: number, season: SeasonState): WeatherState
}

const TAU = Math.PI * 2

/**
 * The bands of one front, as it crosses.
 *
 * Two of them rather than one, because a squall is not a bell curve: a front
 * arrives, passes, gives an hour of brightening, and then the trailing band
 * comes through lighter than the first. `open` and `full` are cut against the
 * cosine of the phase, which is what makes each band periodic — a band assembled
 * out of a gaussian would be very slightly discontinuous at the wrap, and this
 * clock runs for as long as the page is open.
 *
 * They are deliberately spaced so their skirts do not touch. The clear spell
 * between them is the shorter of the two dry stretches in the cycle, and the
 * long one — from the back of the trailing band round to the front of the next
 * squall, better than a third of the whole period — is what keeps the scape a
 * scape with weather in it rather than a scape it rains on.
 */
const BANDS = [

  /** The squall itself. */
  { centre: 0.3, open: 0.66, full: 0.97, weight: 1 },

  /** The trailing band an hour behind it, and never as heavy. */
  { centre: 0.6, open: 0.86, full: 0.99, weight: 0.45 },
] as const

/**
 * How hard it is falling at a phase of the front, 0..1.
 *
 * Taken as a maximum over the bands rather than a sum, for the same reason the
 * auroral arcs are: two bands overlapping are two bands, and adding them fills
 * in the clear spell that the second band exists to show.
 */
export function showerAmount (phase: number): number {
  const wrapped = phase - Math.floor(phase)
  let amount    = 0

  for (const band of BANDS) {
    const across = Math.cos((wrapped - band.centre) * TAU)

    amount = Math.max(amount, band.weight * smoothstep(band.open, band.full, across))
  }

  return amount
}

/**
 * How much of the front the ground stays wet for, as a fraction of the cycle.
 *
 * The whole reason wet ground is not simply `showerAmount` painted darker. Rain
 * stops in a minute and the ground it fell on takes an hour, so a surface
 * response tied to the fall itself dries the moment the last drop lands — which
 * reads, unmistakably, as somebody turning an effect off.
 */
const DRYING = 0.26

/** How many points of the recent past the drying is resolved at. */
const DRYING_STEPS = 14

/**
 * How wet the ground is at a phase of the front, 0..1.
 *
 * A decaying maximum looking backwards rather than an integrator, and that is a
 * determinism decision before it is a shape one: an accumulator would carry the
 * frame rate and the page's load time into the answer, so two captures of the
 * same phase would not agree. This is a function of the phase alone, which means
 * the scrubber in the overlay and the clock running at speed put the ground in
 * exactly the same state.
 *
 * It is never below {@link showerAmount} at the same phase — step zero of the
 * walk is the present — so ground cannot be drier than the rain falling on it.
 */
export function wetAmount (phase: number): number {
  let wet = 0

  for (let step = 0; step <= DRYING_STEPS; step += 1) {
    const age = step / DRYING_STEPS

    wet = Math.max(wet, showerAmount(phase - age * DRYING) * (1 - age))
  }

  return wet
}

/**
 * The third clock.
 *
 * Built like the other two — a phase, a speed, and everything else derived from
 * the phase — and coupled to the second one rather than duplicating it. What
 * falls out of a cold sky is snow, and the scape already has a curve that says
 * how cold this week is: `season.snow`. So the weather owns *how hard* it is
 * coming down and the year owns *what*, which is also why there is no snowfall
 * knob anywhere in the config. A winter squall is this one with the year's own
 * white already in it.
 *
 * The same coupling takes the wet off the ground in the cold half of the year.
 * Frozen ground does not go dark and glossy, it goes white, and the white is the
 * season's to apply — so wetness is scaled by whatever share of the fall is
 * still liquid. What survives a midwinter is whatever share `season.snow` has
 * not claimed, which is the right answer rather than a leak: an authored cover
 * of 0.85 is a winter with bare ground in it, and bare ground in a squall is
 * wet.
 */
export function createWeather (config: LiveConfig): Weather {
  const state: WeatherState = { phase: 0, fall: 0, sleet: 0, wet: 0 }

  return {
    state,

    sample (phase, season) {
      const wrapped = phase - Math.floor(phase)
      const sleet   = Math.min(1, Math.max(0, season.snow))

      state.phase = wrapped
      state.sleet = sleet

      // Read here rather than captured above: `weather.rain` and `weather.wet`
      // are both on the overlay, and the store hands back a new config object
      // every time one of them moves.
      const { weather } = config()

      state.fall = showerAmount(wrapped) * weather.rain
      state.wet  = wetAmount(wrapped) * weather.rain * weather.wet * (1 - sleet)

      return state
    },
  }
}
