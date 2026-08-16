import type { Yard } from './layout.ts'
import type { Vec2 } from './path.ts'


/** One thing standing in the yard, and the room it takes up. */
export interface Standing extends Vec2 {

  /** Yaw for whatever is raised here, already turned to face the yard. */
  angle: number

  /**
   * Roughly how much ground it covers, in metres.
   *
   * Rough on purpose. The exact footprint is the geometry's business and does
   * not exist until the prop has been built, while everything that wants this
   * — the paths that go round the buildings rather than under them — only needs
   * to know that a barn is bigger than a store hut.
   */
  radius: number
}

/**
 * Where the farmstead stands.
 *
 * Split out of the dressing when the footpaths arrived, because the arrangement
 * is *composition* and not scenery: the buildings are placed by the same kind of
 * rule the yard and the track are, and two things now need the answer. The
 * dressing raises a building at each of these; the paths are worn between them.
 *
 * Pure, and deliberately without an rng — the farm is arranged, not scattered.
 */
export interface SteadingPlaces {
  farmhouse: Standing
  barn:      Standing
  aitta:     Standing
  woodshed:  Standing
  sauna:     Standing
  well:      Standing
  cart:      Standing
  logPile:   Standing
  flagpole:  Standing
}

/** The buildings, in the order a path would meet them going round the yard. */
export const STEADING_BUILDINGS = [ 'farmhouse', 'barn', 'aitta', 'woodshed', 'sauna' ] as const

/** How far out from a wall the doorstep is, in metres. */
const DOORSTEP = 1.4

/**
 * The yaw that turns a prop's own front toward a point.
 *
 * Every building in the kit is modelled with its door on local `+z`, and
 * `rotateY(θ)` carries that face to `(sin θ, cos θ)` — so the yaw wanted is
 * `atan2(dx, dz)`, and *not* the bearing `atan2(dz, dx)` that names the same
 * direction as a polar angle. The two are reflections of each other and agree
 * on exactly one diagonal, which is why arranging the farm by bearing looked
 * right on some seeds and stood the farmhouse with its door in the hedge on the
 * rest. Everything that has to agree about where a front is — the yaw, the
 * doorstep, the path worn to it — goes through this one function.
 */
export function faceToward (from: Vec2, toward: Vec2): number {
  return Math.atan2(toward.x - from.x, toward.z - from.z)
}

/**
 * Where a building's doorway meets the ground, outside its wall.
 *
 * The anchor a path is worn to. Clear of the wall by more than the clearance a
 * route is pushed out by, so arriving at a door is never mistaken for standing
 * inside the building.
 */
export function doorstepOf (place: Standing): Vec2 {
  return {
    x: place.x + Math.sin(place.angle) * (place.radius + DOORSTEP),
    z: place.z + Math.cos(place.angle) * (place.radius + DOORSTEP),
  }
}

export function steadingPlaces (yard: Yard): SteadingPlaces {
  const facing = Math.atan2(-yard.z, -yard.x)

  const around = (offset: number, distance: number, radius: number): Standing => {
    const x = yard.x + Math.cos(facing + offset) * distance
    const z = yard.z + Math.sin(facing + offset) * distance

    return { x, z, angle: faceToward({ x, z }, yard), radius }
  }

  return {
    farmhouse: around(0.35, yard.radius * 0.5, 4),
    barn:      around(-1.55, yard.radius * 0.72, 4.5),
    aitta:     around(2.5, yard.radius * 0.62, 2.6),
    woodshed:  around(-2.7, yard.radius * 0.66, 3),
    sauna:     around(1.55, yard.radius * 0.86, 3),
    well:      around(0.9, yard.radius * 0.24, 1.2),
    cart:      around(-0.4, yard.radius * 0.34, 1.6),
    logPile:   around(-2.4, yard.radius * 0.92, 2),
    flagpole:  {
      x:      yard.x - Math.cos(facing) * 2.2,
      z:      yard.z - Math.sin(facing) * 2.2,
      angle:  0,
      radius: 0.6,
    },
  }
}
