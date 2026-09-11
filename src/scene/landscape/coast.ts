import type { ScapeConfig } from '../config.ts'
import { baseAt, remapRelief, sinkToIsland } from './layout.ts'


/**
 * Where the water meets the land, on every bearing, once.
 *
 * Two landforms are written against the *coastline* rather than against a
 * height — the dune belt on the weather shore and the crag on the steep one —
 * and both need the same two answers: what the ground was before the farm and
 * the shelving got at it, and how far out that ground is still dry on a given
 * bearing. They had one implementation between them for exactly as long as
 * there was one of them.
 *
 * Kept here rather than in either, because a second march inward from the sea
 * is a second coastline: the two would agree on the day it was copied and drift
 * the first time somebody widened the falloff band. `dunes.ts` and `crag.ts`
 * both read this, and so a belt and a cliff can never disagree about where the
 * island ends.
 */

/**
 * Bearings the waterline is solved at.
 *
 * Forty-eight is 7.5° apart, which on the home island's 44 m of land is a
 * sample every five and a half metres of coast — finer than a blowout, finer
 * than a cleft in a cliff, and far finer than either landform's own arc, so the
 * interpolation between two samples never invents a shape. It is also the whole
 * cost of this at build: forty-eight marches of a few dozen probes, against a
 * terrain patch that samples the ground a quarter of a million times.
 */
export const COAST_BEARINGS = 48

/** Metres between probes on the inward march, before the refinement. */
const MARCH_STEP = 1.5

/** Bisection passes that turn a 1.5 m bracket into a waterline. Four is 9 cm. */
const REFINE = 4


/**
 * Signed difference between two bearings, in radians, in −π..π.
 *
 * Here rather than in either of the landforms that site themselves by it, for
 * the reason the waterline march is here: the crag keeps off the sand's shore
 * and off the beck's mouth by this, and the saltings keep off the crag and the
 * sand by it, and a second copy of it is a second chance to get the wrap wrong
 * — which is a landform on the far side of the island from where it was sited.
 */
export function bearingGap (a: number, b: number): number {
  const raw = (a - b) % (Math.PI * 2)

  return raw > Math.PI ? raw - Math.PI * 2 : raw < -Math.PI ? raw + Math.PI * 2 : raw
}

/**
 * The ground a coastal landform is measured against: the falloff's, before
 * anything else.
 *
 * Not the ground the terrain draws, and the difference is the whole reason this
 * exists. What a belt or a cliff answers to is the *coast* — the fBm sunk into
 * an island and its relief shaped — because that is the shape the sea worked
 * on. Everything the authored scape does afterwards happens to the landform
 * rather than deciding it: the shore shelving grades a dune's foot into the
 * beach, the farm levels whatever ended up under a field, and the beck cuts its
 * channel back out of the ridge on its way to the sea.
 *
 * So a test that wants to check what a landform was allowed has to ask this and
 * not the height field, which is a different question with a different answer.
 */
export function coastBedAt (config: ScapeConfig, x: number, z: number): number {
  return remapRelief(config, x, z, sinkToIsland(config, x, z, baseAt(config, x, z)))
}

/**
 * Metres from the island's middle to the waterline on one bearing.
 *
 * Marched inward from open water rather than outward from the middle, and that
 * is not arbitrary: an island with a fjord in it, or a bay that cuts most of
 * the falloff band inward, has *several* waterline crossings on one bearing,
 * and the one the sea works on is the outermost. Walking in from the sea finds
 * that one first. 0 where the bearing crosses no dry land at all — which
 * happens on any island the coast warp has bitten a whole quadrant out of.
 */
function shoreRadius (config: ScapeConfig, angle: number): number {
  const { size, waterLevel, islandInner, islandOuter } = config.terrain

  const half = size * 0.5
  const cos  = Math.cos(angle)
  const sin  = Math.sin(angle)
  const from = half * (islandOuter + 0.02)
  const to   = half * islandInner * 0.5

  let outer = from

  for (let radius = from; radius >= to; radius -= MARCH_STEP) {
    if (coastBedAt(config, cos * radius, sin * radius) > waterLevel) {
      let dry = radius
      let wet = outer

      for (let pass = 0; pass < REFINE; pass += 1) {
        const middle = (dry + wet) * 0.5

        if (coastBedAt(config, cos * middle, sin * middle) > waterLevel)
          dry = middle
        else
          wet = middle
      }

      return dry
    }

    outer = radius
  }

  return 0
}

/** The island's own waterline, as a function of bearing. */
export interface Coastline {

  /**
   * Metres from the island's middle to the waterline on a bearing, or 0 where
   * that bearing has no dry land on it at all.
   *
   * @param angle Radians, in the island's own frame, `atan2(z, x)`.
   */
  shoreAt(angle: number): number
}

/**
 * Solve the waterline, once, for one island.
 *
 * Pure and a function of the config alone, which is what lets the height field,
 * the terrain painter, the dressing and `scape:map` all read one coastline
 * without any of them having to be built in a particular order.
 */
export function solveCoastline (config: ScapeConfig): Coastline {
  const step  = Math.PI * 2 / COAST_BEARINGS
  const table = Array.from(
    { length: COAST_BEARINGS },
    (_unused, index) => shoreRadius(config, index * step),
  )

  return {
    shoreAt (angle: number): number {
      const at    = (angle / step % COAST_BEARINGS + COAST_BEARINGS) % COAST_BEARINGS
      const index = Math.floor(at)
      const near  = table[index]
      const far   = table[(index + 1) % COAST_BEARINGS]

      // A bearing with no land on it does not get to be half a coastline.
      // Without this the interpolation walks a shore radius from 40 m down to
      // nothing across one 7.5° step, and whatever is written against the coast
      // follows it into the sea.
      if (near <= 0 || far <= 0)
        return 0

      return near + (far - near) * (at - index)
    },
  }
}
