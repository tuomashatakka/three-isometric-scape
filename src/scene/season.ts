import { Color } from 'three'
import { smoothstep } from 'threejs-scene'
import type { ScapeConfig } from './config.ts'


/** Everything the ground and the growing things need for one instant of the year. */
export interface SeasonState {

  /** Phase of the year, 0..1. 0 is midwinter, 0.5 is midsummer. */
  phase: number

  /** How much of the growing season is up. 0 is sere, 1 is lush. */
  growth: number

  /** Leaf turn. Peaks between midsummer and midwinter, 0 the rest of the year. */
  turn: number

  /** What green things are pulled toward — straw in the cold, gold in the turn. */
  tint: Color

  /** How far toward {@link tint} a fully green surface goes, 0..1. */
  tintAmount: number

  /** Lying snow, before the snow line and the surface angle take their cut. */
  snow:      number
  snowColor: Color

  /** World height, in metres, where snow starts to hold. */
  snowLine: number

  /** How hard the year is locking the water, 0..1. Depth takes its own cut. */
  freeze:   number
  iceColor: Color

  /** Sea smoke — how hard the open water is steaming into colder air, 0..1. */
  smoke: number
}

export interface Season {
  state: SeasonState

  /** Resolve the year at a phase, 0..1. Allocation-free. */
  sample(phase: number): SeasonState
}

const TAU = Math.PI * 2

/**
 * How far the year's warmth lags the year's phase.
 *
 * Ground warms and cools slower than the sun that does it, so the growing season
 * peaks after midsummer rather than on it, and the first snow arrives before the
 * shortest day rather than after. A twentieth of a year is roughly the lag a
 * northern coast actually runs at, and it is the whole reason autumn feels
 * longer than spring here.
 */
const LAG = 0.05

/** How lush the growing things are at a phase of the year, 0..1. */
export function growthAmount (phase: number): number {
  const wrapped = phase - Math.floor(phase)
  const warmth  = -Math.cos((wrapped - LAG) * TAU)

  return smoothstep(-0.45, 0.5, warmth)
}

/**
 * Leaf turn at a phase of the year, 0..1.
 *
 * One-sided on purpose: the same fall in warmth happens twice a year, and only
 * one of them turns anything gold. Spring loses its snow to bare ground and then
 * greens straight from it, which is what the growth curve alone already says.
 */
export function turnAmount (phase: number): number {
  const wrapped = phase - Math.floor(phase)
  const falling = Math.sin((wrapped - 0.5) * TAU)

  return falling <= 0 ? 0 : smoothstep(0.1, 0.9, falling)
}

/** Lying snow at a phase of the year, 0..1, before any local gate. */
export function snowAmount (phase: number): number {
  const wrapped = phase - Math.floor(phase)

  return smoothstep(0.12, 0.86, Math.cos(wrapped * TAU))
}

/**
 * How far behind the land the sea runs.
 *
 * A metre of water holds something like a thousand times the heat a metre of
 * air does, so a coast is white weeks before its bays are shut and its bays are
 * still shut weeks after the fields have gone bare. This constant is the whole
 * of that story: it is why {@link freezeAmount} is the same shape as
 * {@link snowAmount} and yet never lines up with it.
 */
const ICE_LAG = 0.06

/**
 * The freeze at a phase of the year, 0..1, before depth takes its cut.
 *
 * Narrower than the snow curve as well as later. Snow needs one cold night and
 * a shower; ice needs a whole column of water to have given its heat up, which
 * only ever happens in the deepest weeks of the winter — so the window opens
 * late, shuts late, and is only ever briefly total.
 */
export function freezeAmount (phase: number): number {
  const wrapped = phase - Math.floor(phase)

  return smoothstep(0.34, 0.96, Math.cos((wrapped - ICE_LAG) * TAU))
}

/**
 * Sea smoke at a phase of the year, 0..1, before the coast's own strength.
 *
 * Not a curve of its own — it is the *gap* between the two winters the scape
 * already has. Steam fog needs water warmer than the air standing on it, and
 * {@link ICE_LAG} is precisely that difference written down: the land takes the
 * winter weeks before the water does, so subtracting the sea's winter from the
 * land's leaves exactly the weeks when a cold sky is sitting on open water.
 *
 * That makes it one-sided for free, and correctly so. Come spring the lag runs
 * the other way — the air is back and the bays are still shut — the difference
 * goes negative, and it is clamped away. A coast smokes on its way into the
 * winter and not on its way out, which is also why the effect has no partner in
 * {@link snowAmount}'s symmetry.
 *
 * It peaks near 0.83 rather than 1, a fortnight or so before midwinter. That is
 * not a scale to be corrected: the most open water a cold sky ever gets is
 * however much of the year the lag leaves between the two curves.
 */
export function seaSmokeAmount (phase: number): number {
  return Math.max(0, snowAmount(phase) - freezeAmount(phase))
}

/**
 * The seasonal axis.
 *
 * Built the way `daylight.ts` is built, and for the same reason: the authored
 * palette stays the *midsummer* anchor and every other week of the year is
 * derived from it. Winter is the anchor pulled toward one dead straw and then
 * toward one snow white; autumn is the same straw with a gold leaned into it.
 * Nothing here keyframes a month, so retuning the scape is still a matter of
 * editing the colours that were already in `palette`, and no week of the year
 * can drift out of the family the rest of the scene was graded for.
 *
 * What the year does *not* touch is the shape of the world. Snow here is a
 * surface response, not accumulation — the height field, the layout and every
 * prop are built once from the seed and stay exactly where they were. That is
 * what keeps a whole seasonal cycle free of a rebuild, and it is why the clock
 * can run live while the scape is being looked at.
 */
export function createSeason (config: ScapeConfig): Season {
  const { palette, season, terrain } = config

  const sere   = new Color(palette.dryGrass)
  const autumn = new Color(palette.autumn)

  const state: SeasonState = {
    phase:      0,
    growth:     1,
    turn:       0,
    tint:       new Color(),
    tintAmount: 0,
    snow:       0,
    snowColor:  new Color(palette.snow),
    snowLine:   terrain.waterLevel + season.snowLine,
    freeze:     0,
    iceColor:   new Color(palette.ice),
    smoke:      0,
  }

  return {
    state,

    sample (phase) {
      const wrapped = phase - Math.floor(phase)
      const growth  = growthAmount(wrapped)
      const turn    = turnAmount(wrapped)

      // Withering and turning are the same event seen twice, so the tint takes
      // whichever is further along rather than adding them — a leaf that has
      // already gone gold does not also go straw on top of it.
      const wither = 1 - growth

      state.phase      = wrapped
      state.growth     = growth
      state.turn       = turn
      state.tintAmount = Math.min(1, Math.max(wither, turn) * season.turn)
      state.snow       = snowAmount(wrapped) * season.snow
      state.snowLine   = terrain.waterLevel + season.snowLine
      state.freeze     = freezeAmount(wrapped) * season.ice
      state.smoke      = seaSmokeAmount(wrapped) * season.seaSmoke

      state.tint.copy(sere).lerp(autumn, turn)
      state.snowColor.set(palette.snow)
      state.iceColor.set(palette.ice)

      return state
    },
  }
}
