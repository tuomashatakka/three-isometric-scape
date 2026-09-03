import type { IsleSite } from './height.ts'
import type { Vec2 } from './path.ts'
import { faceToward } from './steading.ts'
import type { Standing } from './steading.ts'


/**
 * Which rock is lived on, in the landmass's own local frame.
 *
 * The seamark's search and this one look at the same list of islets and want
 * opposite things out of it, which is the whole reason they are two searches.
 * `beacon.ts` scores **reach**: a light is put on the last thing a boat passes,
 * so the further out the better and nothing else counts. A croft is the other
 * way round — it is a place somebody rows home from in the dark, so what it
 * scores is the *shortness of that row*, and the rock the light is already on is
 * struck off the list before anything is measured.
 *
 * What the two share is the shape of the answer: a threshold on the ground
 * (broad enough, dry enough, level enough) and a preference over what is left.
 *
 * Pure and free of `three`, like every other survey here, so `scape:map` can
 * report the holding without building a vertex of it.
 */
export interface CroftSite extends Standing {

  /** Ground height under the sill, in metres. */
  level: number

  /** Metres of rock between the sill and the water, at the worst corner. */
  freeboard: number

  /** Index of the islet in `terrain.isles`, so the map tools can name it. */
  isle: number

  /** Metres of open water back to the harbour. The reason this rock. */
  fromHarbour: number
}

/**
 * How much rock the hut claims, in metres.
 *
 * The radius that holds the whole plan — the roof out past the walls, the step
 * stone in front of the door and the oars against the far gable, measured from
 * the hut's own origin. Held in step with the geometry by the test beside this
 * file, the same way `SMOKEHOUSE_FOOTING` and `BEACON_FOOTING` are.
 */
export const CROFT_FOOTING = 3.1

/**
 * How much fall the socle is willing to bridge, in metres.
 *
 * Under the smokehouse's `SILL_FALL`, and deliberately: that building is plopped
 * and grows a foundation down onto whatever it finds, while this one is merged
 * into the steading draw and can only ever sit at one height. What takes up the
 * difference is the 0.32 m of dry-laid stone under it and nothing else — see
 * `props/croft.ts` — so the ground has to be most of the way level before the
 * hut is allowed onto it.
 */
const SILL_FALL = 0.45

/**
 * Where the probes that measure that fall sit, in metres.
 *
 * The corners of the *walls*, not of the claim: the roof overhang and the oars
 * are inside {@link CROFT_FOOTING} and have no foundation under them, so ground
 * they happen to reach over is not ground the socle has to find.
 */
const SILL_PROBES = [[ -1.9, -1.5 ], [ 1.9, -1.5 ], [ 1.9, 1.5 ], [ -1.9, 1.5 ]] as const

/** Bearings swept around each islet's middle, and rings out from it. */
const BEARINGS = 12
const RINGS    = 4

/**
 * How far out from an islet's centre the search will walk, as a fraction of its
 * radius.
 *
 * Small on purpose. An islet is a dome with a warped coast on it, so the outer
 * third of one is the part that shelves into the water — and a hut sited there
 * is a hut whose seaward corners fail the freeboard test on most seeds and, on
 * the rest, stands on the one ledge that happens to be dry. Keeping the sweep in
 * the crown is what makes the answer a fact about the rock rather than about the
 * warp.
 */
const CROWN_REACH = 0.42

export interface CroftSearch {

  /** The ground as the height field leaves it, in metres. */
  ground(x: number, z: number): number
  waterLevel: number

  /** Metres of dry rock the sill needs, at the middle and at all four corners. */
  freeboard: number

  /** Metres of islet radius before a rock is big enough to be lived on. */
  minIsle: number

  /** Furthest from the harbour the search will row, in metres. */
  reach: number
}

/**
 * The worst freeboard across the footing, or `-Infinity` when the fall across it
 * is more than the socle can bridge.
 *
 * One walk round the building answering both questions, for the reason the
 * smokehouse's `sillFall` is one function: they have the same four probes, and
 * asking them separately is two walks round the same hut. The lesson the
 * churchyard wall wrote down holds at this scale too — a centre standing clear
 * of the water says nothing about the corners, and the shelf of an islet is
 * exactly the ground where the difference is the whole freeboard.
 */
function sillClearance (search: CroftSearch, x: number, z: number): number {
  const centre = search.ground(x, z)
  let worst    = centre - search.waterLevel

  for (const [ dx, dz ] of SILL_PROBES) {
    const at = search.ground(x + dx, z + dz)

    if (Math.abs(at - centre) > SILL_FALL)
      return -Infinity

    worst = Math.min(worst, at - search.waterLevel)
  }

  return worst
}

/**
 * The rock the croft is built on, or `null` when the ring has nowhere to put one.
 *
 * `null` is a real answer and not a failure, the same way the mill's, the
 * chapel's and the smokehouse's are: an archipelago whose only broad islet is
 * the one already carrying the light gets no croft rather than a second building
 * standing in the lighthouse's storm boulders. Raising `croft.minIsle` past the
 * largest free islet is the supported way to take them back out of the scape —
 * there is no separate switch, for the same reason nothing else here has one.
 *
 * Every candidate islet is searched rather than only the nearest, and the row
 * home is folded into the score instead of gating it. The alternative — pick the
 * nearest rock, then look for ground on it — loses the croft entirely whenever
 * that one rock happens to be a dome with no flat on it, which is most of them.
 *
 * @param taken Index of the islet the seamark is already on, or `null`. Struck
 *   off before anything is measured: a tower and a hut on one rock is a hamlet,
 *   and their two footings do not both fit on anything in this ring.
 */
export function findCroftSite (
  search:  CroftSearch,
  isles:   readonly IsleSite[],
  harbour: Vec2,
  taken:   number | null,
): CroftSite | null {
  let best: CroftSite | null = null
  let bestScore              = -Infinity

  for (const [ index, isle ] of isles.entries()) {
    if (index === taken || isle.radius < search.minIsle)
      continue

    const fromIsle = Math.hypot(isle.x - harbour.x, isle.z - harbour.z)

    if (fromIsle > search.reach)
      continue

    for (let ring = 0; ring < RINGS; ring += 1) {
      const out = isle.radius * CROWN_REACH * (ring / (RINGS - 1))

      for (let step = 0; step < BEARINGS; step += 1) {
        const around = step / BEARINGS * Math.PI * 2
        const x      = isle.x + Math.cos(around) * out
        const z      = isle.z + Math.sin(around) * out

        const freeboard = sillClearance(search, x, z)

        if (freeboard < search.freeboard)
          continue

        const fromHarbour = Math.hypot(x - harbour.x, z - harbour.z)

        // A short row first, then dry rock under the sill. The freeboard term is
        // a tie-break rather than a preference — it is already past a threshold,
        // and left unweighted it would pull every croft onto the crown of the
        // furthest island in the ring.
        const score = -fromHarbour * 0.4 + freeboard

        if (score > bestScore) {
          bestScore = score
          best      = {
            x,
            z,
            angle:  faceToward({ x, z }, harbour),
            radius: CROFT_FOOTING,
            level:  search.ground(x, z),
            freeboard,
            isle:   index,
            fromHarbour,
          }
        }
      }
    }
  }

  return best
}
