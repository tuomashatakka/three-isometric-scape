import type { Obstacle } from './footpath.ts'
import type { Spot } from './landing.ts'
import { faceToward } from './steading.ts'
import type { Standing } from './steading.ts'


/**
 * Where the smokehouse stands, in the island's own local frame.
 *
 * The one building on this island sited against the *harbour* rather than
 * against the farm. A smokehouse is where the catch is landed, not where the
 * people live: it wants to be a few paces up the bank from the boats, on ground
 * dry enough to keep a fire on, and it wants nothing else at all. So this is the
 * shortest search in the scape — a ring sweep out from the bank that stops at
 * the first ground that qualifies, rather than a grid over the island scored on
 * prominence.
 *
 * A {@link Standing}, and not a shape of its own, because the building is
 * modelled in the farmstead's frame with its door on local `+z`. That is what
 * lets `faceToward` aim it and `doorstepOf` find the place the path is worn to,
 * with no yaw helper of its own — see `props/smokehouse.ts`.
 *
 * Pure, and free of `three`, so `scape:map` reports the site without building a
 * vertex of it.
 */
export interface SmokehouseSite extends Standing {

  /** Ground height under the sill, in metres. */
  level: number

  /** Metres from the harbour bank. The reason this patch and not a better one. */
  fromBank: number
}

/**
 * How much ground the building claims, in metres.
 *
 * The radius that holds the whole plan — the eaves out past the walls on both
 * sides and the billets stacked against the blind gable, measured from the hut's
 * own origin. Held in step with the geometry by the test beside this file rather
 * than by hope, the same way `CHAPEL_FOOTING` is.
 *
 * Deliberately larger than the rectangle {@link SILL_PROBES} walks. They are
 * different questions: this is how much ground nothing else may be put on, and
 * that is where the socle has to find ground to stand on — a roof overhang has
 * no foundation under it.
 */
export const SMOKEHOUSE_FOOTING = 2.9

export interface SmokehouseSearch {

  /** The ground as the height field leaves it, in metres. */
  ground(x: number, z: number): number
  waterLevel: number

  /** Metres of dry ground the sill needs under it, everywhere it sits. */
  freeboard: number

  /** Nearest the bank a site may be, in metres. */
  setback: number

  /** Furthest from the bank the search will look, in metres. */
  reach: number
}

/**
 * How much fall the socle is willing to bridge, in metres.
 *
 * Just inside `PLINTH_REACH` in the dressing, which is the drop a plopped
 * building's foundation is actually willing to grow down over — the same number
 * and the same sentence as the chapel's `SILL_FALL`, seen from the other end.
 * It is left a little under that rather than at it because this is the smallest
 * building in the kit: a metre of socle reads as a foundation under a fourteen
 * metre nave and as a pedestal under a three metre hut.
 *
 * This is the gate that actually bites, and it is worth saying why. A shore bank
 * is the steepest ground anything in this scape is built on — the home island's
 * harbour shelves at about a metre in four — so nothing here is refused for
 * being wet or crowded nearly as often as for simply being on a slope.
 */
const SILL_FALL = 0.8

/**
 * Where the probes that measure that fall sit, in metres.
 *
 * The corners of the *walls* rather than a ring, because the walls are a
 * rectangle and their corners are where a socle actually runs out of ground.
 */
const SILL_PROBES = [[ -1.7, -1.25 ], [ 1.7, -1.25 ], [ 1.7, 1.25 ], [ -1.7, 1.25 ]] as const

/** Bearings swept around the bank, and rings of distance out from it. */
const BEARINGS = 24
const RINGS    = 10

/**
 * The worst drop across the footing, or `Infinity` when any corner of it is
 * standing in the water.
 *
 * One helper and not two, because the two questions have the same four probes
 * and asking them separately is two walks round the same building. The lesson
 * the churchyard wall wrote down applies at this scale as well: a centre being
 * on dry land says nothing about the corners, and a shore bank is exactly the
 * ground where the difference is a whole metre.
 */
function sillFall (search: SmokehouseSearch, x: number, z: number): number {
  const centre = search.ground(x, z)
  let worst    = 0

  for (const [ dx, dz ] of SILL_PROBES) {
    const at = search.ground(x + dx, z + dz)

    if (at - search.waterLevel < search.freeboard)
      return Infinity

    worst = Math.max(worst, Math.abs(at - centre))
  }

  return worst
}

/**
 * The patch of bank the smokehouse is built on, or `null` when the harbour has
 * no dry ground behind it.
 *
 * `null` is a real answer and not a failure, the same way the mill's and the
 * chapel's are: a harbour dug into a shelf that shelves straight into the rock
 * behind it has nowhere to put one, and gets no smokehouse rather than one
 * standing in the surf. Raising `smokehouse.freeboard` past what the bank offers
 * is the supported way to take them back out of the scape — there is no separate
 * switch, for the same reason nothing else here has one.
 *
 * No bearing is privileged. The sweep goes the whole way round the bank and the
 * freeboard test throws out the half of it that is water, which is the same
 * answer a landward half-plane would have given on a straight coast and a better
 * one in a cove, where "behind the bank" is not a direction.
 *
 * Nor is the farmyard fenced off, and that is deliberate rather than an
 * oversight. The harbour bank is by construction the nearest water to the yard —
 * `findBank` walks out from it — so on a compact island the shore and the
 * bottom of the farmyard are the same few metres of ground, and a rule that kept
 * the hut off the yard's graded shelf took the home island's smokehouse away
 * with it. What must not be built on is what is already *standing*, and the
 * caller hands all of that over in `avoid`.
 */
export function findSmokehouseSite (
  search: SmokehouseSearch,
  bank:   Spot,
  avoid:  readonly Obstacle[],
): SmokehouseSite | null {
  if (search.reach <= search.setback)
    return null

  let best: SmokehouseSite | null = null
  let bestScore                   = -Infinity

  for (let ring = 0; ring < RINGS; ring += 1) {
    const fromBank = search.setback + ring / (RINGS - 1) * (search.reach - search.setback)

    for (let step = 0; step < BEARINGS; step += 1) {
      const around = step / BEARINGS * Math.PI * 2
      const x      = bank.x + Math.cos(around) * fromBank
      const z      = bank.z + Math.sin(around) * fromBank

      if (avoid.some(thing =>
        Math.hypot(thing.x - x, thing.z - z) < thing.radius + SMOKEHOUSE_FOOTING))
        continue

      const level = search.ground(x, z)

      if (level - search.waterLevel < search.freeboard)
        continue

      const fall = sillFall(search, x, z)

      if (fall > SILL_FALL)
        continue

      // Near the bank, and level. Nothing else — a smokehouse has no view to
      // want and no prominence to earn, and every term this search does not
      // have is a term that cannot pull it up the hill away from the boats.
      // A metre of walk is worth about six centimetres of drop.
      const score = -fromBank * 0.3 - fall * 5

      if (score > bestScore) {
        bestScore = score
        best      = {
          x,
          z,
          angle:  faceToward({ x, z }, bank),
          radius: SMOKEHOUSE_FOOTING,
          level,
          fromBank,
        }
      }
    }
  }

  return best
}
