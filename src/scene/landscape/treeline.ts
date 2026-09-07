import { smoothstep } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import type { HeightField } from './height.ts'


const DEGREES = Math.PI / 180

/**
 * The lowest a line may be pulled to, in metres over the water.
 *
 * The lower edge of the margin fade is `limit - taper`, and on a fully exposed
 * coast that is a negative number — a smoothstep whose first edge is under the
 * sea, which starts the fade at the waterline and takes a fifth off every tree
 * on the island. Floored here rather than by lifting `exposed`, because the
 * *line* on an exposed coast really is about two metres and it is only the band
 * around it that cannot reach below the beach.
 */
const FLOOR = 0.15

/**
 * Where the wood stops, and how it gives out getting there.
 *
 * Pure, and pure the way the prop builders are: a height field and a config in,
 * three numbers per point out, no scene, no rng, no state. That is what lets the
 * dressing gate its scatter on this while `scape:map` measures the same lines
 * from the same functions — the alternative is a rule in the dressing and a
 * second copy of it in the instrument, which is how a readout ends up describing
 * a wood that is not there.
 *
 * There is no rng in here on purpose. The *roll* that decides whether one dart
 * lands a spruce belongs to the dressing, which owns the shared stream; what
 * this answers is how good the ground is, and ground does not roll dice.
 */
export interface Treeline {

  /**
   * How much open water lies upwind of a point, 0..1.
   *
   * 0 is ground with land upwind all the way out to the fetch; 1 is ground with
   * nothing but sea. The interesting values are in between and they are what
   * separates the two faces of one island: on this seed the yard sits at 0.10
   * and the croft out on the free islet at 0.93.
   */
  exposureAt (x: number, z: number): number

  /**
   * Metres over the waterline the wood gives out at this point.
   *
   * The line itself — `exposed` on a coast with the weather on it, `sheltered`
   * in the lee, and mixed by the exposure between. Published because it is the
   * one number a reader can check against the ground: a limit that came out
   * under the shore band means no island has trees on it at all.
   */
  limitAt (x: number, z: number): number

  /**
   * How well a tree grows at a point, 0..1.
   *
   * Both a probability and a size. The dressing multiplies its acceptance roll
   * by this — so the wood thins toward its edge rather than ending at one — and
   * scales the tree it plants by it, so the last ones standing are the stunted
   * ones. One number doing both jobs is deliberate: a margin of full-height
   * trees standing further apart reads as a felled wood, and a margin of small
   * trees at full density reads as a plantation.
   */
  vigourAt (x: number, z: number): number
}

/**
 * Survey the treeline over a height field.
 *
 * The wind's bearing is read once, from `wind.bearing`, and it is the *base*
 * bearing rather than this instant's: `wind.ts` veers it by up to a few degrees
 * with the gust, and a wood that had grown to the gust would be a wood whose
 * shape changed between frames. A treeline is the average of a century of
 * weather, so it takes the one number the whole scape agrees on and ignores the
 * clock, exactly as the mossy side of a hill takes `daylight.azimuth` rather
 * than the sun's present place. See `aspect.ts`.
 */
export function planTreeline (
  field:      HeightField,
  config:     ScapeConfig,
  waterLevel: number,
): Treeline {
  const { fetch, samples, exposed, sheltered, taper, saltBand, saltBite } = config.treeline
  const bearing                                                           = config.wind.bearing * DEGREES

  // Upwind, so the walk goes back the way the weather came. `wind.bearing` is
  // the direction the wind blows *toward* — see `wind.ts`, where the same two
  // trigs come out as `dirX`/`dirZ` — and fetch is measured against it.
  const upwindX = -Math.cos(bearing)
  const upwindZ = -Math.sin(bearing)

  // Nearer water shelters less than distant water exposes, so the samples are
  // weighted down the walk: the metre of sea immediately upwind of a point
  // matters more to it than the metre sixty-nine out. Summed once rather than
  // per query — the divisor is the same for every point on the archipelago.
  let weightTotal = 0

  for (let step = 1; step <= samples; step += 1)
    weightTotal += 1 - (step - 1) / samples

  function exposureAt (x: number, z: number): number {
    let open = 0

    for (let step = 1; step <= samples; step += 1) {
      const distance = fetch * step / samples

      if (field.heightAt(x + upwindX * distance, z + upwindZ * distance) <= waterLevel)
        open += 1 - (step - 1) / samples
    }

    return open / weightTotal
  }

  function limitAt (x: number, z: number): number {
    return exposed + (1 - exposureAt(x, z)) * (sheltered - exposed)
  }

  function vigourAt (x: number, z: number): number {
    const relative = field.heightAt(x, z) - waterLevel

    if (relative <= 0)
      return 0

    const openness = exposureAt(x, z)
    const limit    = exposed + (1 - openness) * (sheltered - exposed)
    const above    = 1 - smoothstep(Math.max(FLOOR, limit - taper), limit + taper, relative)

    // The salt takes the bottom of the same range the wind takes the top of,
    // and only where the wind reaches: a sheltered shore grows birch to the
    // high-water mark, which is what the burn behind the harbour looks like.
    const salt = openness * saltBite * (1 - smoothstep(0, saltBand, relative))

    return above * (1 - salt)
  }

  return { exposureAt, limitAt, vigourAt }
}

/**
 * What a tree at this vigour is scaled to, as a fraction of its full size.
 *
 * Separate from {@link Treeline} because it is the *dressing's* half of the
 * rule — the survey says how good the ground is, and this says what a tree does
 * about it. Kept here rather than in `dressing.ts` so the test that states the
 * claim can reach it without building a scene.
 */
export function stuntedTo (vigour: number, stunt: number): number {
  return stunt + (1 - stunt) * Math.min(1, Math.max(0, vigour))
}
