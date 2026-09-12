import type { Obstacle } from './footpath.ts'
import { distanceToPath } from './path.ts'
import type { Vec2 } from './path.ts'
import { faceToward } from './steading.ts'
import type { Standing } from './steading.ts'


/**
 * Where the shieling stands, in the island's own local frame.
 *
 * The one building on this island sited against the *hill* rather than against
 * the farm or the water. Everything else is put where the work is; a shieling is
 * put where the work is not, because the grazing that is worth ten weeks a year
 * is the ground nothing else on the island wants. So this is the only search in
 * the scape whose distance term has the wrong sign on it — every other one pays
 * to be near something, and this one pays to be *up*.
 *
 * A {@link Standing}, like the smokehouse, because the hut is modelled in the
 * farmstead's frame with its door on local `+z`. `faceToward` aims that door
 * back down at the yard — which is where somebody walking out of a shieling at
 * six in the morning is looking — and `doorstepOf` finds the place the path is
 * worn to, with no yaw helper of its own. See `props/shieling.ts`.
 *
 * Pure, and free of `three`, so `scape:map` reports the site without building a
 * vertex of it.
 */
export interface ShielingSite extends Standing {

  /** Ground height under the sill, in metres. */
  level: number

  /** Metres the sill stands above the farmyard's own ground. */
  rise: number

  /** Metres from the yard. The walk that is the whole point of the building. */
  fromYard: number

  /**
   * Metres from the burn's centreline, or `Infinity` on an island with no beck.
   *
   * Reported rather than only tested, because it is the number that says which
   * of the two gates actually decided the site — a hut at fifty-four metres of
   * water was placed by the burn, and one at eight was placed by the grazing and
   * happened to land beside it.
   */
  toWater: number
}

/**
 * How much ground the hut and its fold claim, in metres.
 *
 * The radius that holds the whole plan from the hut's own origin — the walls,
 * the eaves out past them, and the fold walled onto the back. Held in step with
 * the geometry by the test beside this file rather than by hope, the same way
 * `SMOKEHOUSE_FOOTING` and `CHAPEL_FOOTING` are.
 *
 * Much larger than {@link SILL_PROBES} walks, and by more than any other
 * building here: the probes are the corners of the *room*, which is the only
 * part with a floor that has to be level, while this is the whole enclosure
 * nothing else may be put inside. A drystone fold follows the ground it is
 * built across and does not care what the ground does.
 *
 * It is the largest claim any single building makes on these islands, and that
 * is the fold rather than the hut — the room is three metres by two and a half,
 * and the pen walled onto the back of it reaches four and a half metres further.
 */
export const SHIELING_FOOTING = 6

/**
 * Where the probes that measure the sill's fall sit, in metres.
 *
 * The corners of the room's walls, and nothing of the fold — see
 * {@link SHIELING_FOOTING}.
 */
const SILL_PROBES = [[ -1.6, -1.15 ], [ 1.6, -1.15 ], [ 1.6, 1.15 ], [ -1.6, 1.15 ]] as const

/**
 * How much fall the socle is willing to bridge, in metres.
 *
 * Tighter than the smokehouse's 0.8, and the reason is the ground rather than
 * the building: a shore bank is steep but it is *smooth*, while open fell at
 * half the island's rise is broken by every erratic and peat hag on it. A
 * shieling is a merged hero rather than a plopped one — the socle is baked at
 * build time and can only ever sit at one height — so this is the whole of its
 * tolerance and not, as with the smokehouse, the part of it a foundation does
 * not take up.
 */
const SILL_FALL = 0.55

/**
 * Least rise there has to be between the farm and the summit, in metres.
 *
 * The same number and the same sentence as the head dyke's: below it the island
 * has no hill, and a hut sited a share of the way up nothing is a hut in a field
 * with a long walk to it. Written here rather than imported because the two are
 * the same *judgement* about what counts as a hill and not one number two
 * modules share — a dyke could reasonably want a steeper island than a hut does.
 */
const HILL = 2

/**
 * Bearings swept around the yard, and rings of distance out from it.
 *
 * Denser than the smokehouse's 24 by 10, and it has to be: that search runs over
 * a bank eighteen metres deep where almost every station qualifies, while this
 * one runs over a whole island of which the grazing is perhaps a fifteenth. At
 * 36 by 14 the home island came back with no hut at all — not because it has
 * nowhere to put one, but because nine hundred and sixty stations is the
 * resolution at which its hill has any of them on it.
 */
const BEARINGS = 48
const RINGS    = 20

export interface ShielingSearch {

  /** The ground as the height field leaves it, in metres. */
  ground(x: number, z: number): number

  /**
   * The height the hill is measured up from, in metres: the farmyard's ground.
   *
   * The dyke's `foot`, and for the dyke's reason — a share of the rise from the
   * farm to the summit is what lets one number stand a hut in the right place on
   * a six-metre island and on a twenty-six-metre one.
   */
  foot: number

  /** Where between {@link foot} and the summit the hut stands, 0..1. */
  headroom: number

  /** Nearest the yard the hut may stand, in metres. */
  setback: number

  /**
   * Furthest from the yard the search will look, in metres.
   *
   * **World-sized.** The island's own land radius, so an archipelago whose
   * islands grow is searched to their new edge — unlike the setback above, which
   * is a walk and stays a walk.
   */
  reach: number

  /** Furthest from the burn the hut may stand, in metres. */
  water: number

  /** The beck's centreline, or `null` on an island whose ridge fed none. */
  burn: readonly Vec2[] | null

  /** Ground nothing can be founded on at all — the ice, and the beck's channel. */
  barred(x: number, z: number): boolean
}

/**
 * The worst drop across the room's sill.
 *
 * One walk round the four corners, like the smokehouse's, and without that
 * search's drowning test: ground this far above the farmyard is by construction
 * ground well above the sea, so a freeboard here would be a gate that never
 * fires pretending to be one that does.
 */
function sillFall (search: ShielingSearch, x: number, z: number): number {
  const centre = search.ground(x, z)
  let worst    = 0

  for (const [ dx, dz ] of SILL_PROBES)
    worst = Math.max(worst, Math.abs(search.ground(x + dx, z + dz) - centre))

  return worst
}

/** Metres to the burn's centreline, or `Infinity` where the island has no beck. */
function toWater (search: ShielingSearch, x: number, z: number): number {
  return search.burn && search.burn.length > 1
    ? distanceToPath(search.burn, x, z)
    : Infinity
}

/**
 * The patch of hill the shieling is built on, or `null` when the island has
 * none to offer.
 *
 * `null` is a real answer and not a failure, the same way the mill's, the
 * chapel's and the smokehouse's are. Four kinds of island get none: one with no
 * hill at all, where the rise from the farm to the summit is under {@link HILL};
 * one whose grazing band and whose beck never meet, on an island with a beck;
 * one whose high ground is all rock too broken for a sill; and one simply too
 * small, where the whole hill lies inside the setback and the sweep never gets
 * to look at it. That last one is the answer rather than a hole in it — a place
 * you can see from your own door is not somewhere you go for the summer. Raising
 * `shieling.headroom` to 1 takes them out of the scape everywhere, and there is
 * no separate switch for the reason nothing else here has one.
 *
 * The sweep is rings out from the yard rather than a grid over the island,
 * because the walk is a term in the answer and a ring sweep is already sorted by
 * it. No bearing is privileged: the grazing is wherever the hill is, and the
 * headroom gate throws out the whole of the island that is not it.
 *
 * What the score says, in the order it says it: get up the hill; stand level;
 * stay near the water; and, only when the first three are tied, stay near home.
 * A metre of rise is worth about two metres of walk, which is why a hut on the
 * shoulder above the farm loses to one on the fell behind it.
 */
export function findShielingSite (
  search: ShielingSearch,
  yard:   Vec2,
  summit: number,
  avoid:  readonly Obstacle[],
): ShielingSite | null {
  if (search.headroom >= 1 || search.reach <= search.setback || summit - search.foot < HILL)
    return null

  const wanted = search.foot + (summit - search.foot) * search.headroom

  let best: ShielingSite | null = null
  let bestScore                 = -Infinity

  for (let ring = 0; ring < RINGS; ring += 1) {
    const fromYard = search.setback + ring / (RINGS - 1) * (search.reach - search.setback)

    for (let step = 0; step < BEARINGS; step += 1) {
      const around = step / BEARINGS * Math.PI * 2
      const x      = yard.x + Math.cos(around) * fromYard
      const z      = yard.z + Math.sin(around) * fromYard
      const level  = search.ground(x, z)

      if (level < wanted || search.barred(x, z))
        continue

      if (avoid.some(thing =>
        Math.hypot(thing.x - x, thing.z - z) < thing.radius + SHIELING_FOOTING))
        continue

      const wet = toWater(search, x, z)

      // Infinity passes on an island with no beck, and only there — see
      // `ShielingConfig.water`. A finite reading past the gate is a hut too far
      // from the burn to be one.
      if (Number.isFinite(wet) && wet > search.water)
        continue

      const fall = sillFall(search, x, z)

      if (fall > SILL_FALL)
        continue

      const score = (level - search.foot) * 2 - fall * 6 -
        (Number.isFinite(wet) ? wet * 0.05 : 0) - fromYard * 0.02

      if (score > bestScore) {
        bestScore = score
        best      = {
          x,
          z,
          angle:   faceToward({ x, z }, yard),
          radius:  SHIELING_FOOTING,
          level,
          rise:    level - search.foot,
          fromYard,
          toWater: wet,
        }
      }
    }
  }

  return best
}
