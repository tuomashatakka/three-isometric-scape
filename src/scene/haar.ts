import { smoothstep } from 'threejs-scene'
import type { ScapeConfig } from './config.ts'


function clamp01 (value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * The night fog — a level bank in the low ground, as a term of the aerial
 * chunk every fogged program already runs (`haarFog` in `aerial.ts`).
 *
 * It was two to five world-sized transparent sheets, each a full-frame blend,
 * stacked through the band so a hillside met five contour lines instead of
 * one. A surface seen from above through a level layer of fog is dimmed by the
 * column of fog standing over it, and that column is a function of the
 * fragment's height alone: the whole band over the sea, less of it up the
 * strand, none above the top. So the bank is that function now — a soft edge up
 * every slope rather than five staggered cuts, a roof standing out of it while
 * its sill is in it, on every tier including the phone, which had none — and
 * the sheets, their texture, their render slot and their tier count are gone.
 *
 * What is left here is the weather: whether a bank is out at all.
 */

/**
 * The bank's strength for one instant, 0..1.
 *
 * Four gates, multiplied, and every one of them is a condition a real radiation
 * fog needs rather than a knob invented to shape a curve:
 *
 * - **a night**, and `1 - day` is the whole of it. The ground has to lose its
 *   heat to a sky and it cannot do that with the sun on it, so what makes the
 *   fog is simply how much sun is off the ground and for how sharp a curve —
 *   which is `burn`. There is deliberately no *week* in here and none is needed:
 *   `day` at latitude 68 is already a fact about the year as much as the hour,
 *   because a midsummer midnight up there has more than half a noon's sun in it
 *   and a midwinter afternoon has none. A seasonal curve beside that would be a
 *   second answer to a question the sun's own arc has already answered.
 * - **a calm**, because a wind mixes the cooled air back into the warm air over
 *   it before it can reach its dew point. Measured against the gusted strength;
 *   see `scour`.
 * - **water in the ground**, which is what there is to condense. `damp` says how
 *   much of the bank that shower is worth.
 * - **the switch**, which is `strength` and nothing else.
 *
 * Pure, and takes its terms rather than a config, so `scape:map` can print the
 * bank at three winds and two hours without building a scene.
 */
/**
 * The mist density the bank's `strength` is a share of.
 *
 * One fog knob, not two: the night bank, the ground mist and the sea smoke are
 * one air giving up its water, so the panel's mist row thickens all three and
 * `haar.strength` is the bank's share of it — authored at 0.34, so the bank at
 * the authored mist is the bank this scape always had.
 */
export const HAAR_MIST = 0.34

export function haarAmount (
  haar: ScapeConfig['haar'],
  day: number,
  wind: number,
  wet: number,
  mist = HAAR_MIST,
): number {
  const { strength, burn, scour, damp } = haar

  const night = (1 - clamp01(day)) ** Math.max(0, burn)

  // A threshold of zero is not a threshold, and smoothstep cannot be asked what
  // it means: the honest reading is that any air at all takes the bank.
  const calm = scour <= 0
    ? wind > 0 ? 0 : 1
    : 1 - smoothstep(0, scour, Math.max(0, wind))

  const ground = 1 - clamp01(damp) + clamp01(damp) * clamp01(wet)

  return clamp01(strength * Math.max(0, mist) / HAAR_MIST * night * calm * ground)
}

/** Optical depth of a metre of the bank, at full amount, seen down this camera's elevation. */
export const HAAR_DENSITY = 0.5

/** How much of the bank's density the thinnest lane in its field keeps. */
export const HAAR_LANE = 0.05

/**
 * Metres of bank standing over a surface at `height`: the whole band under the
 * ceiling (`waterLevel + top`) and nothing above it. The fog chunk's own
 * arithmetic, so a test can state it.
 */
export function haarColumn (height: number, ceiling: number, depth: number): number {
  return Math.min(Math.max(0, depth), Math.max(0, ceiling - height))
}

/** How much of a surface at `height` the bank hides, 0..1, at `amount` and a bank field `bank`. */
export function haarFog (height: number, ceiling: number, depth: number, amount: number, bank = 1): number {
  const lane = HAAR_LANE + (1 - HAAR_LANE) * bank

  return 1 - Math.exp(-amount * HAAR_DENSITY * lane * haarColumn(height, ceiling, depth))
}
