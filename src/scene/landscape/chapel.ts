import type { Obstacle } from './footpath.ts'
import { prominenceAt, roughnessAt } from './mill.ts'
import { distanceToPath } from './path.ts'
import type { Vec2 } from './path.ts'
import { faceToward } from './steading.ts'
import type { Standing } from './steading.ts'


/**
 * Where the chapel stands, in the island's own local frame.
 *
 * A `Standing`, and that is the whole point of the type: the farmstead's five
 * buildings are placed, faced and walked to through `Standing.angle` and
 * `doorstepOf`, and a chapel is a building with a door like any of them. Giving
 * it a bearing of its own — the way the mill has one, because a mill is turned
 * to face the wind rather than the farm — would be a second convention for the
 * same question, and the sign of it is a door in the hedge.
 *
 * A chapel is sited by two questions the rest of the composition never asks
 * together: *can it be seen from the water*, and *does it stand above what is
 * around it*. The yard is on the flattest sheltered ground, the pasture on the
 * highest ground the farm is not using, the mill on the windiest shoulder — and
 * a chapel wants the seaward knoll every one of those searches walked past.
 */
export interface ChapelSite extends Standing {

  /** Ground height under the sill, in metres. */
  level: number

  /** How far the ground stands above its surroundings, in metres. */
  prominence: number

  /** Metres in from the radius that is dry whichever way you walk. */
  inland: number
}

/**
 * How much ground the chapel claims, in metres.
 *
 * The nave, its tower and the ground a person stands on to go in — what a
 * footpath has to bend around and what nothing else may be sited inside. The
 * geometry is a little longer than this across its own diagonal; a claim is
 * roughly how much room a thing needs and not a bounding box, the same
 * approximation {@link Standing.radius} is everywhere else.
 */
export const CHAPEL_FOOTING = 4.2

/**
 * The radius the doorstep and the levelling are measured from.
 *
 * Smaller than the footing on purpose: {@link CHAPEL_FOOTING} is the ground
 * nothing else may take, and this is the building itself — where its floor is
 * probed and how far out its doorstep is set. Kept in step with the geometry by
 * `chapel.test.ts` rather than by hope.
 */
export const CHAPEL_RADIUS = 3.2

const CHAPEL_PROBES = 34

/** Sill-scale roughness. A chapel's foundation spans about this. */
const FOOTING = 2.8

/**
 * What a chapel needs to know about the ground, and nothing else.
 *
 * The same shape as `MillSearch` and deliberately not the same type: the two
 * searches want different things of a hill, and a shared record would have to
 * carry both of their thresholds and let either of them read the other's.
 */
export interface ChapelSearch {

  /** The ground as the island falloff leaves it, in metres. */
  ground(x: number, z: number): number

  /** Radius that is dry whichever way you walk, in metres. */
  landRadius: number
  waterLevel: number

  /** Metres the ground must stand above its surroundings before a chapel is built. */
  knoll: number

  /** Metres in from the coast a chapel may still be sited. */
  shore: number
}

/** A line the chapel has to keep off — the cart track, the beck. */
export interface ChapelKeepOff {
  points: readonly Vec2[]

  /** Metres of ground the chapel must leave between itself and the line. */
  clearance: number
}

/**
 * The seaward knoll a chapel would be built on, or `null` when the island has
 * none.
 *
 * `null` is a real answer and not a failure to find one, exactly as it is for
 * the mill and the pasture: an island whose coastal ground is all flat, all
 * steep or all spoken for does not get a chapel, and raising `chapel.knoll` past
 * what the ground offers is the supported way to take them back out of the
 * scape. There is no separate switch, for the same reason nothing else here has
 * one.
 *
 * Pure, and free of `three`, so `scape:map` can report the site without building
 * a vertex of it.
 */
export function findChapelSite (
  search: ChapelSearch,
  yard:   Obstacle,
  lines:  readonly ChapelKeepOff[],
  avoid:  readonly Obstacle[],
): ChapelSite | null {
  const reach = search.landRadius - CHAPEL_FOOTING

  if (reach <= 0)
    return null

  // Clear of the yard's graded shelf by the chapel's own footing. A chapel
  // inside the farmyard is another outbuilding.
  const fromFarm = yard.radius * 1.15 + CHAPEL_FOOTING

  let best: ChapelSite | null = null
  let bestScore               = -Infinity

  for (let ix = 0; ix < CHAPEL_PROBES; ix += 1)
    for (let iz = 0; iz < CHAPEL_PROBES; iz += 1) {
      const x    = -reach + ix / (CHAPEL_PROBES - 1) * reach * 2
      const z    = -reach + iz / (CHAPEL_PROBES - 1) * reach * 2
      const from = Math.hypot(x, z)

      if (from > reach)
        continue

      // The rule that makes this a *coastal* chapel rather than another
      // building on the best ground available. Measured in from the radius that
      // is dry whichever way you walk, so it is the same band of shore on an
      // island of any size — and it is metres, and it stays metres: a wider
      // world does not move a chapel further from its own water.
      if (search.landRadius - from > search.shore)
        continue
      if (Math.hypot(x - yard.x, z - yard.z) < fromFarm)
        continue
      if (lines.some(line => distanceToPath(line.points, x, z) < line.clearance))
        continue
      if (avoid.some(thing => Math.hypot(thing.x - x, thing.z - z) < thing.radius + CHAPEL_FOOTING))
        continue

      // Above the shore shelving, not merely above the water. `height.ts`
      // compresses the first metre or so over the waterline into a beach after
      // every placement decision has been taken, so a sill cleared at half a
      // metre of raw ground comes back standing in the wash.
      const dryness = search.ground(x, z) - search.waterLevel

      if (dryness < 2.6)
        continue

      const rise = prominenceAt(search, x, z)

      if (rise < search.knoll)
        continue

      // A limewashed board building on a stone sill tolerates far less lean
      // than a mill's four dry-laid piers do, and it is walked into rather than
      // climbed into. This is the gate that keeps the plinth a plinth.
      const rough = roughnessAt(search, x, z, FOOTING)

      if (rough > 0.9)
        continue

      // The seaward term is a *fraction* of the island rather than a distance in
      // metres, for the reason the pasture's own score gives: two of these three
      // terms are heights, so a raw distance is the one that changes meaning
      // when the island changes size and quietly outranks the rise it is
      // supposed to be breaking ties on.
      const score = rise * 1.8 + from / search.landRadius * 2.2 - rough * 3.2

      if (score > bestScore) {
        bestScore = score
        best      = {
          x,
          z,
          // Its door to the farm, because the farm is who walks to it — and
          // through the same function the steading faces every other door by,
          // so the yaw, the doorstep and the path worn to it cannot disagree.
          angle:      faceToward({ x, z }, yard),
          radius:     CHAPEL_RADIUS,
          level:      search.ground(x, z),
          prominence: rise,
          inland:     search.landRadius - from,
        }
      }
    }

  return best
}
