import { hash2 } from 'threejs-scene'
import type { Vec2 } from './path.ts'

/**
 * Cart ruts: wheel wear patterns showing on the track surface.
 *
 * Ruts appear as darker linear features in the wheel tracks, strongest near
 * the yard where traffic is heaviest, fading with distance. Combines a lateral
 * pattern (perpendicular to the track, where the wheels run) with a
 * longitudinal decay (distance from yard).
 */
export interface CartRuts {
  wearAt(x: number, z: number): number
}

export interface CartRutsOptions {

  /** Track polyline in world space. */
  track: readonly Vec2[]

  /** Function that returns distance from yard for a coordinate. */
  yardDistance(x: number, z: number): number
}

/** Spacing between wheel tracks: ~0.72m (axle width) */
const RUT_SPACING = 0.72

/** Width of each rut line: ~0.4m (wear band around tread) */
const RUT_WIDTH = 0.4

/** Maximum darkening intensity of ruts: 0..1 */
const RUT_STRENGTH = 0.32

/** How far from track center ruts extend laterally: ~0.42m */
const RUT_REACH = 0.42

/** Longitudinal decay distance: wear fades over ~18m from yard */
const RUT_DECAY = 18

/**
 * Gaussian falloff: smooth transition from peak to zero.
 * Used for both lateral rut edges and longitudinal decay.
 */
function gaussian (distance: number, width: number): number {
  const sigma = width / 2.355 // Convert width to sigma
  return Math.exp(-(distance * distance) / (2 * sigma * sigma))
}

/**
 * Pseudo-random lateral jitter for rut lines.
 * Hash-based so it's deterministic and doesn't require seeding.
 */
function lateralJitter (x: number, z: number): number {
  // Two octaves of hash noise for jitter variation
  const h1 = hash2(x * 0.5, z * 0.5)
  const h2 = hash2(x * 2, z * 2)
  return (h1 * 0.7 + h2 * 0.3) * RUT_REACH * 0.4 - RUT_REACH * 0.2
}

export function createCartRuts (options: CartRutsOptions): CartRuts {
  const { track, yardDistance } = options

  return {
    wearAt (x: number, z: number): number {
      // Find closest point on track polyline
      let minDist = Infinity
      let toTrack = 0

      for (let i = 0; i < track.length - 1; i += 1) {
        const a = track[i]
        const b = track[i + 1]

        // Closest point on line segment ab to (x, z)
        const dx   = b.x - a.x
        const dz   = b.z - a.z
        const len2 = dx * dx + dz * dz

        if (len2 > 0) {
          const t        = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2))
          const closestX = a.x + t * dx
          const closestZ = a.z + t * dz

          const dist = Math.hypot(x - closestX, z - closestZ)

          if (dist < minDist) {
            minDist = dist
            toTrack = Math.hypot(x - closestX, z - closestZ)
          }
        }
      }

      // Outside rut reach: no wear
      if (toTrack > RUT_REACH)
        return 0

      // Longitudinal decay: wear fades with distance from yard
      const distFromYard     = yardDistance(x, z)
      const longitudinalWear = gaussian(distFromYard, RUT_DECAY)

      // Two rut lines, symmetrically placed
      const jitter      = lateralJitter(x, z)
      const leftOffset  = RUT_SPACING * 0.5 + jitter
      const rightOffset = RUT_SPACING * -0.5 + jitter

      // Distance to each rut line in perpendicular direction.
      // leftOffset and rightOffset have opposite signs; don't take abs() of them
      // as that would make both ruts appear at the same distance.
      const perpDistance = Math.abs(toTrack - leftOffset)

      // Create the rut appearance through lateral pattern
      const rutPattern = gaussian(perpDistance, RUT_WIDTH)

      // Add a secondary pattern to simulate the other rut
      const secondaryPattern = gaussian(
        Math.abs(toTrack - rightOffset),
        RUT_WIDTH,
      )

      // Combine the two rut lines; whichever is stronger wins
      const rutWear = Math.max(rutPattern, secondaryPattern)

      return Math.min(1, rutWear * longitudinalWear * RUT_STRENGTH)
    },
  }
}
