import { smoothstep } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { sampleHeight } from '../noise.ts'
import { distanceToTrack, plotInfluence } from './layout.ts'
import type { ScapeLayout } from './layout.ts'


/**
 * The authored ground.
 *
 * `noise.ts` still owns the raw fBm; this layer is what turns a landscape into
 * a *place* — it shelves the shore, levels the field plots, flattens the yard
 * the buildings stand on, and grades a track between them.
 *
 * Everything downstream calls `heightAt`: the terrain vertices, the click-to-
 * focus raycast fallback, and every placement query. That is deliberate. Three
 * separate approximations of the ground is how props end up buried.
 */
export interface HeightField {
  heightAt(x: number, z: number): number

  /** Absolute gradient magnitude — drives the granite-on-steep-faces rule. */
  slopeAt(x: number, z: number): number
}

const TRACK_DEPTH   = 0.26
const YARD_STRENGTH = 0.94
const PLOT_STRENGTH = 0.9
const SLOPE_REACH   = 0.75

function smoothProfile (values: number[], passes: number): number[] {
  let current = values

  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.slice()

    for (let index = 1; index < current.length - 1; index += 1)
      next[index] = (current[index - 1] + current[index] * 2 + current[index + 1]) / 4

    current = next
  }

  return current
}

export function createHeightField (config: ScapeConfig, layout: ScapeLayout): HeightField {
  const { waterLevel, shoreBand, islandInner, islandOuter } = config.terrain
  const { yard, track }                                     = layout
  const corridor                                            = track.width * 1.7
  const half                                                = config.terrain.size * 0.5
  const seabed                                              = waterLevel - config.terrain.seabedDrop

  /** Base fBm, sunk into an island, shelved at the waterline, then levelled. */
  function graded (x: number, z: number): number {
    let height = sampleHeight(x, z, config.seed, config.terrain.height)

    // Drown the rim. The falloff is radial while the terrain plane is square,
    // which is deliberate: the corners end up well past `islandOuter`, so the
    // plane's own straight edges are always far under water and never read as
    // the edge of the world.
    const radial = Math.hypot(x, z) / half
    const land   = 1 - smoothstep(islandInner, islandOuter, radial)

    height = seabed + (height - seabed) * land

    // Shelve the *bank* into a beach, but let the basin keep falling away.
    // Flattening both sides of the waterline is what turns a lake into a
    // puddle — and a puddle is all foam and no water.
    const fromWater = height - waterLevel

    height = fromWater >= 0
      ? waterLevel + fromWater * (0.44 + 0.56 * smoothstep(shoreBand, shoreBand * 2.2, fromWater))
      : waterLevel + fromWater * 1.3

    for (const plot of layout.plots) {
      const claim = plotInfluence(plot, x, z)

      if (claim > 0)
        height += (plot.level - height) * claim * PLOT_STRENGTH
    }

    const fromYard = Math.hypot(x - yard.x, z - yard.z)
    const onYard   = 1 - smoothstep(yard.radius * 0.62, yard.radius * 1.25, fromYard)

    if (onYard > 0)
      height += (yard.level - height) * onYard * YARD_STRENGTH

    return height
  }

  // The road grade is sampled from the already-levelled ground and smoothed, so
  // the track never inherits a bump the surrounding terrain still has.
  const profile = smoothProfile(
    track.points.map(point => graded(point.x, point.z)),
    4,
  )

  function trackLevelAt (x: number, z: number): number {
    const points = track.points
    let bestDistance = Infinity
    let bestLevel    = 0

    for (let index = 0; index < points.length - 1; index += 1) {
      const a        = points[index]
      const b        = points[index + 1]
      const dx       = b.x - a.x
      const dz       = b.z - a.z
      const lengthSq = dx * dx + dz * dz

      const t = lengthSq === 0
        ? 0
        : Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq))

      const distance = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t))

      if (distance < bestDistance) {
        bestDistance = distance
        bestLevel    = profile[index] + (profile[index + 1] - profile[index]) * t
      }
    }

    return bestLevel
  }

  function heightAt (x: number, z: number): number {
    const height   = graded(x, z)
    const distance = distanceToTrack(layout, x, z)

    if (distance >= corridor)
      return height

    const claim = 1 - smoothstep(track.width * 0.5, corridor, distance)
    return height + (trackLevelAt(x, z) - TRACK_DEPTH - height) * claim
  }

  return {
    heightAt,

    slopeAt (x, z) {
      const dx = heightAt(x + SLOPE_REACH, z) - heightAt(x - SLOPE_REACH, z)
      const dz = heightAt(x, z + SLOPE_REACH) - heightAt(x, z - SLOPE_REACH)
      return Math.hypot(dx, dz) / (SLOPE_REACH * 2)
    },
  }
}
