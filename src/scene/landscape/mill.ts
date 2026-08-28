import { distanceToPath } from './path.ts'
import type { Vec2 } from './path.ts'


/**
 * Where the mill stands, in the island's own local frame.
 *
 * A mill is sited by one question the rest of the farm never asks: *is there
 * any wind here*. The yard is placed on the flattest sheltered ground the
 * island has, the pasture on the highest ground the farm is not already using —
 * and a mill wants neither. It wants the open shoulder nobody built on, which
 * is why this search scores prominence above everything else and pays for it in
 * distance from the farm.
 */
export interface MillSite extends Vec2 {

  /** Ground height under the trestle, in metres. */
  level: number

  /**
   * Compass bearing the sails face, in radians.
   *
   * Out to sea, which on this coast is the same thing as into the wind: the
   * open water is where the fetch is, and a post mill is turned to face it.
   * Feed it to `yawAlong` to get the yaw the prop is raised with.
   */
  bearing: number

  /** How far the ground stands above its surroundings, in metres. */
  prominence: number
}

/**
 * How far behind the post the tail stair reaches the ground, in metres.
 *
 * The mill's doorstep, in the sense `steading.ts` means it: the door is at the
 * top of the stair, so the place a path is worn to is the foot of it. Kept in
 * step with the geometry by the test in `mill.test.ts` rather than by hope.
 */
export const MILL_STAIR_REACH = 4.4

/**
 * How much ground the trestle itself claims, in metres.
 *
 * The piers and the stair, and deliberately not the sail sweep — a path may
 * quite happily run under a turning sail four metres up, and pushing every
 * route out past the wheel would fence the mill off from the farm that uses it.
 */
export const MILL_FOOTING = 3.4

/** Where the tail stair meets the ground — the anchor a footpath is worn to. */
export function millDoorstep (mill: MillSite): Vec2 {
  return {
    x: mill.x - Math.cos(mill.bearing) * MILL_STAIR_REACH,
    z: mill.z - Math.sin(mill.bearing) * MILL_STAIR_REACH,
  }
}

/** A disc the mill has to keep out of. */
export interface MillObstacle extends Vec2 {
  radius: number
}

/** A line the mill has to keep off — the cart track, the beck. */
export interface MillKeepOff {
  points: readonly Vec2[]

  /** Metres of ground the mill must leave between itself and the line. */
  clearance: number
}

export interface MillSearch {

  /** The ground as the island falloff leaves it, in metres. */
  ground(x: number, z: number): number

  /** Radius that is dry whichever way you walk, in metres. */
  landRadius: number
  waterLevel: number

  /** Metres the ground must stand above its surroundings before a mill is built. */
  prominence: number

  /** Radius of the sail wheel, in metres — the ground that has to be clear. */
  sweep: number
}

const MILL_PROBES = 36

/**
 * How far out the ground is sampled to decide whether a point is a rise or the
 * floor of something, in metres.
 *
 * Twice the sail sweep and then some. Sampled tighter than this every knoll the
 * fBm has scores as prominent, including the ones inside a hollow, and the mill
 * ends up in the shelter it was sited to avoid.
 */
const HORIZON = 22

const HORIZON_PROBES = 8

/** Trestle-scale roughness — a mill's four piers span about this. */
const FOOTING = 2.4

/**
 * How far the ground rises above what surrounds it.
 *
 * The mean of a ring rather than its lowest point, deliberately: a shoulder
 * with one gully cutting into it is still a shoulder, and scoring it by the
 * gully would move every mill on the coast into the middle of its island.
 *
 * Takes the sampler rather than a whole {@link MillSearch}, because the chapel
 * asks the same question of the same ground and has no sails to describe. See
 * [`chapel.ts`](chapel.ts).
 */
export function prominenceAt (ground: (x: number, z: number) => number, x: number, z: number): number {
  let sum = 0

  for (let step = 0; step < HORIZON_PROBES; step += 1) {
    const angle = step / HORIZON_PROBES * Math.PI * 2

    sum += ground(x + Math.cos(angle) * HORIZON, z + Math.sin(angle) * HORIZON)
  }

  return ground(x, z) - sum / HORIZON_PROBES
}

function roughnessAt (search: MillSearch, x: number, z: number): number {
  const centre = search.ground(x, z)
  let worst    = 0

  for (const [ dx, dz ] of [[ FOOTING, 0 ], [ -FOOTING, 0 ], [ 0, FOOTING ], [ 0, -FOOTING ]])
    worst = Math.max(worst, Math.abs(search.ground(x + dx, z + dz) - centre))

  return worst
}

/**
 * The exposed shoulder a mill would be built on, or `null` when the island has
 * none.
 *
 * `null` is a real answer and not a failure: an island with nowhere level and
 * exposed to stand a trestle on has no business carrying a mill, and the ridge
 * island at the default seed is exactly that — every shoulder it has is too
 * steep under a four-metre footing. Raising `mill.prominence` past what the
 * ground offers is the supported way to take the rest of the mills back out of
 * the scape — there is no separate switch, for the same reason nothing else
 * here has one.
 *
 * Pure, and free of `three`, so `scape:map` can report the site without
 * building a vertex of it.
 */
export function findMillSite (
  search: MillSearch,
  yard:   MillObstacle,
  lines:  readonly MillKeepOff[],
  avoid:  readonly MillObstacle[],
): MillSite | null {
  // The *trestle* inside the radius that is dry whichever way you walk, and not
  // the sweep. A sail tip is a metre and more off the ground at the bottom of
  // its turn and the mill is sited on a shoulder above the coast — a wheel that
  // reaches out over the water is what a headland mill looks like, and holding
  // the whole sweep inland instead is what stops the smaller islands having one
  // at all.
  const reach = search.landRadius - MILL_FOOTING

  if (reach <= 0)
    return null

  // Clear of the yard's graded shelf by the mill's own footing. A mill inside
  // the farmyard is a mill in the way of the farm.
  const fromFarm = yard.radius * 1.1 + MILL_FOOTING

  let best: MillSite | null = null
  let bestScore             = -Infinity

  for (let ix = 0; ix < MILL_PROBES; ix += 1)
    for (let iz = 0; iz < MILL_PROBES; iz += 1) {
      const x = -reach + ix / (MILL_PROBES - 1) * reach * 2
      const z = -reach + iz / (MILL_PROBES - 1) * reach * 2

      if (Math.hypot(x, z) > reach)
        continue

      const fromYard = Math.hypot(x - yard.x, z - yard.z)

      if (fromYard < fromFarm)
        continue
      if (lines.some(line => distanceToPath(line.points, x, z) < line.clearance))
        continue
      if (avoid.some(thing => Math.hypot(thing.x - x, thing.z - z) < thing.radius + search.sweep * 0.7))
        continue

      const dryness = search.ground(x, z) - search.waterLevel

      if (dryness < 3.2)
        continue

      const rise = prominenceAt(search.ground, x, z)

      if (rise < search.prominence)
        continue

      // The trestle is four piers on dry-laid stone. It tolerates a slope the
      // way a barn's sill does not — but only just, and the tolerance is the
      // pier height rather than a taste.
      const rough = roughnessAt(search, x, z)

      if (rough > 1.3)
        continue

      const score = rise * 2.1 + dryness * 0.2 - rough * 2.6

      if (score > bestScore) {
        bestScore = score
        best      = {
          x,
          z,
          level:   search.ground(x, z),
          // Out to sea on the bearing the island falls away along. At the exact
          // centre there is no such bearing, so the mill turns its back on the
          // farm instead — which is where the open ground is anyway.
          bearing: Math.hypot(x, z) > 1e-3
            ? Math.atan2(z, x)
            : Math.atan2(z - yard.z, x - yard.x),
          prominence: rise,
        }
      }
    }

  return best
}
