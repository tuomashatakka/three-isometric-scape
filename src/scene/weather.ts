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
   * How hard it is hailing, 0..1.
   *
   * Beside {@link fall} rather than inside it, and that is the whole shape of
   * the system. {@link sleet} is a *share* of the fall, because what the year
   * freezes it freezes on the way down and one drop cannot be both; hail is a
   * second fall entirely, out of the same cloud at a different moment in its
   * life. See {@link hailAmount} for which moment, and why it is not this
   * curve's.
   */
  hail: number

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
 * How far ahead of the squall's own peak the hail comes, in cycles.
 *
 * The one number this system is, and it is a lead rather than a width because
 * hail is not heavy rain. A shower of this kind is a column of air going up
 * fast enough to carry water above the freezing level and hold it there, and
 * the first thing that reaches the ground under it is what that column has
 * already finished making. So the stones arrive on the band's *leading flank*,
 * ahead of the rain, and are over before the rain is at its hardest.
 *
 * Taken off `BANDS[0].centre` rather than written down as a phase, for the
 * reason `AT_BOW` asks `bowPeak` rather than carrying a decimal: a run that
 * reshapes the front must not silently move the hail out of it.
 */
const HAIL_LEAD = 0.095

/**
 * Half-width of the pulse, in cycles.
 *
 * Narrow on purpose. The rain in this scape runs for about a quarter of the
 * cycle and the trailing band adds another tenth; a hail fall that lasted as
 * long would be a white shower rather than a hail shower, and the thing that
 * makes somebody look up is that it starts and stops.
 *
 * Exported because `hail.ts` lays the cell's track across it: where the one
 * patch of hard fall stands is a position *within the pulse*, and a module
 * that derived that from a second width would drift out of the fall it is
 * supposed to be carrying.
 */
export const HAIL_WIDTH = 0.045

/** Where the pulse is centred, in cycles. */
export const HAIL_CENTRE = BANDS[0].centre - HAIL_LEAD

/**
 * How hard the stones are coming down at a phase of the front, 0..1.
 *
 * Cut against the cosine of the phase like the bands above it and for the same
 * reason — a bump assembled out of a gaussian is very slightly discontinuous at
 * the wrap, and this clock runs for as long as the page is open.
 *
 * It is deliberately **not** a function of {@link showerAmount}. Scaling the
 * rain's own curve is the obvious first cut and what it produces is rain that
 * briefly goes white in the middle of itself, which is the one shape a hail
 * shower does not have. The pulse peaks where the shower is still *climbing*,
 * and reaches zero before the shower reaches one.
 */
export function hailAmount (phase: number): number {
  const wrapped = phase - Math.floor(phase)
  const across  = Math.cos((wrapped - HAIL_CENTRE) * TAU)

  return smoothstep(Math.cos(HAIL_WIDTH * TAU), Math.cos(HAIL_WIDTH * TAU * 0.3), across)
}

/** What high summer keeps of the shoulder's hail, and what midwinter keeps. */
const SUMMER_HAIL = 0.55
const WINTER_HAIL = 0.12

/**
 * What the week of the year does to the hail, 0..1.
 *
 * A weight and deliberately not a gate, which is the difference between this
 * and the `sleet` coupling two functions down. Snow is what the year turns the
 * fall *into*, so it is a share and it is allowed to reach one; hail comes out
 * of a cloud whose top is above freezing level, and in this latitude that cloud
 * is standing over the sound in every month there is.
 *
 * What the year changes is how often it gets through. The shoulders are the
 * season — cold air over a sea that has not cooled with it is the whole recipe
 * — so the window opens as soon as the ground starts taking snow at all. High
 * summer keeps better than half of it, because a hail shower in June is a thing
 * that happens here and a system switched off for a third of the year is a
 * system most visitors never see. The deep of winter is where it nearly goes,
 * and that one is physics rather than taste: a column cold enough all the way
 * down delivers snow, and the scape already draws that.
 *
 * Read off `season.snow` rather than off the week, so a scape moved south keeps
 * the coupling instead of keeping the calendar.
 */
export function hailChill (snow: number): number {
  const cold = smoothstep(0, 0.12, snow)
  const deep = smoothstep(0.55, 0.9, snow)

  return (SUMMER_HAIL + (1 - SUMMER_HAIL) * cold) * (1 - (1 - WINTER_HAIL) * deep)
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
  const state: WeatherState = { phase: 0, fall: 0, sleet: 0, hail: 0, wet: 0 }

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
      state.hail = hailAmount(wrapped) * hailChill(sleet) * weather.hail
      state.wet  = wetAmount(wrapped) * weather.rain * weather.wet * (1 - sleet)

      return state
    },
  }
}
