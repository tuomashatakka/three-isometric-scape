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

export function steadingPlaces (yard: Yard): SteadingPlaces {
  const facing = Math.atan2(-yard.z, -yard.x)

  const around = (offset: number, distance: number, radius: number): Standing => ({
    x:     yard.x + Math.cos(facing + offset) * distance,
    z:     yard.z + Math.sin(facing + offset) * distance,
    angle: facing + offset + Math.PI,
    radius,
  })

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
