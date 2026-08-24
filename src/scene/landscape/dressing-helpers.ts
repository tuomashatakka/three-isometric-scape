import type { ScapeConfig } from '../config.ts'
import type { FencePoint } from '../props/fence.ts'
import type { PropName } from '../props/index.ts'
import { alignToSlope } from './align.ts'
import type { TiltWeight } from './align.ts'
import type { ArchipelagoSurvey } from './archipelago.ts'
import type { Creek } from './creek.ts'
import type { HeightField } from './height.ts'
import type { Spot } from './landing.ts'
import { yawAlong } from './layout.ts'
import type { Plot, ScapeLayout, Vec2 } from './layout.ts'
import { drawnSurfaceOf, patchSegments } from './terrain.ts'


/** Where a prop meets the ground, and which way that ground is facing. */
export interface GroundContact {

  /**
   * The continuous field, as the rules read it.
   *
   * Carried here beside the drawn surface so both answers come from one place:
   * a *rule* asks whether ground is above the water or steep enough for scree
   * and wants the smooth field, and a *placement* asks where the triangle
   * actually is. Mixing the two up is how a prop passes the beach test and then
   * gets laid half a metre under the beach.
   */
  heightAt(x: number, z: number): number

  /**
   * The ground *as the terrain draws it*.
   *
   * Placements used to read `heightAt`, which is the continuous field the
   * terrain's vertices were sampled *from* rather than the chord they were
   * joined into. The two differ by tens of centimetres wherever the ground
   * curves, and that gap is what every scattered prop's `- 0.1` sink was
   * quietly paying for: sink everything far enough and nothing floats, at the
   * price of everything on level ground being buried a little.
   */
  surfaceAt(x: number, z: number): number

  /**
   * The euler that stands a prop at `(x, z)` facing `yaw`, taking `tilt` of the
   * ground's lean. See `align.ts`.
   */
  standing(x: number, z: number, yaw: number, tilt: TiltWeight): [number, number, number]
}

/**
 * One answer about where the ground is, for everything that stands on it.
 *
 * Dispatched per landmass because each patch is drawn on its own grid, at the
 * density `patchSegments` fixes — the same function the terrain itself uses, so
 * there is one answer to how finely an island is drawn rather than two that can
 * drift apart.
 */
export function createGroundContact (
  config:      ScapeConfig,
  archipelago: ArchipelagoSurvey,
  segments:    number,
): GroundContact {
  const { field } = archipelago
  const drawn     = new Map(archipelago.landmasses.map(landmass => [
    landmass.id,
    drawnSurfaceOf(
      landmass.survey.field,
      landmass.config.terrain.size,
      patchSegments(
        config.terrain.size,
        landmass.config.terrain.size,
        segments,
        landmass.detail,
      ),
    ),
  ]))

  // Reused by every placement. `normalAt` writes into a caller-owned record for
  // the reason the samplers do, and `alignToSlope` does the same with its euler.
  const normal                           = { x: 0, y: 1, z: 0 }
  const facing: [number, number, number] = [ 0, 0, 0 ]

  return {
    heightAt: field.heightAt,

    surfaceAt (x, z) {
      const landmass = field.landmassAt(x, z)
      const patch    = landmass && drawn.get(landmass.id)

      return patch && landmass
        ? patch(x - landmass.origin.x, z - landmass.origin.z)
        : field.heightAt(x, z)
    },

    /**
     * The tilt is taken from the *continuous* field while the height is taken
     * from the drawn one, and the split is deliberate. A chord's normal is
     * constant across a quad and then jumps at the diagonal, so two cobbles a
     * hand apart would lean at visibly different angles; the field is smooth,
     * and a prop only has to look like it belongs on the triangle it is resting
     * on rather than to be co-planar with it.
     */
    standing (x, z, yaw, tilt) {
      return alignToSlope(field.normalAt(x, z, normal), yaw, tilt, facing)
    },
  }
}


const FOLIAGE: ReadonlySet<string> = new Set([
  'spruce', 'pine', 'birch', 'sapling', 'juniper', 'grass', 'heather', 'wildflower', 'reeds', 'crop', 'lilyPads',
])


export function isFoliage (name: PropName): boolean {
  return FOLIAGE.has(name)
}


/** The point on the track a given distance out from the yard, and its heading. */
export function trackPointNear (layout: ScapeLayout, distance: number): Spot | null {
  const points = layout.track.points

  for (let index = points.length - 1; index > 0; index -= 1) {
    const point = points[index]
    const gap   = Math.hypot(point.x - layout.yard.x, point.z - layout.yard.z)

    if (gap >= distance) {
      const previous = points[index - 1]
      return {
        x:     point.x,
        z:     point.z,
        angle: Math.atan2(point.z - previous.z, point.x - previous.x),
      }
    }
  }

  return null
}

/**
 * The `y` rotation that carries a bridge along the track at a given point.
 *
 * `yawAlong`, not the bearing itself — the bridge is long in `+z`, so it has to
 * be turned the same way the jetty is or it lies across the road it carries.
 */
function trackYawAt (points: readonly Vec2[], index: number): number {
  const previous = points[Math.max(0, index - 1)]
  const point    = points[index]

  return yawAlong(Math.atan2(point.z - previous.z, point.x - previous.x))
}

/**
 * The height of the ground either side of a claimed stretch of track.
 *
 * A bridge rests on its banks, and the banks are the nearest track points the
 * channel does not claim. Sitting it on the *carved* ground under it instead
 * drops the deck into the beck it is meant to be spanning.
 */
function bankLevelAt (
  points: readonly Vec2[],
  field:  HeightField,
  creek:  Creek,
  index:  number,
): number | null {
  let total = 0
  let banks = 0

  for (const direction of [ -1, 1 ])
    for (let step = 1; step < points.length; step += 1) {
      const at = index + direction * step

      if (at < 0 || at >= points.length)
        break
      if (creek.claimAt(points[at].x, points[at].z) > 0)
        continue

      total += field.heightAt(points[at].x, points[at].z)
      banks += 1
      break
    }

  return banks > 0 ? total / banks : null
}

/** Where the track runs deepest through the beck's channel, if it does at all. */
function findBeckCrossing (
  layout: ScapeLayout,
  field:  HeightField,
  creek:  Creek,
): Spot & { deck: number } | null {
  const points = layout.track.points

  let best: { index: number, claim: number } | null = null

  for (let index = 1; index < points.length - 1; index += 1) {
    const claim = creek.claimAt(points[index].x, points[index].z)

    if (claim > 0.35 && (!best || claim > best.claim))
      best = { index, claim }
  }

  if (!best)
    return null

  const point = points[best.index]
  const bank  = bankLevelAt(points, field, creek, best.index)

  return {
    x:     point.x,
    z:     point.z,
    angle: trackYawAt(points, best.index),
    deck:  (bank ?? layout.waterLevel + 0.9) - 0.15,
  }
}

/** Where the track dips below the waterline, if it does at all. */
function findDipCrossing (
  layout: ScapeLayout,
  field:  HeightField,
  config: ScapeConfig,
): Spot & { deck: number } | null {
  const points = layout.track.points
  const water  = config.terrain.waterLevel

  let best: { index: number, height: number } | null = null

  for (let index = 1; index < points.length - 1; index += 1) {
    const height = field.heightAt(points[index].x, points[index].z)

    if (height > water + 0.45)
      continue
    if (best && height >= best.height)
      continue

    best = { index, height }
  }

  if (!best)
    return null

  const point = points[best.index]
  return { x: point.x, z: point.z, angle: trackYawAt(points, best.index), deck: water + 0.35 }
}

/**
 * Where the track has to get across something.
 *
 * The beck first, because a bridge over running water is the one a reader can
 * read. Failing that — a seed whose beck never meets the road — the old rule
 * stands and the bridge goes over the lowest dip the track takes below the
 * waterline, which is the only other place in the scape that needs one.
 */
export function findCrossing (
  layout: ScapeLayout,
  field:  HeightField,
  config: ScapeConfig,
): Spot & { deck: number } | null {
  return layout.creek && findBeckCrossing(layout, field, layout.creek) ||
    findDipCrossing(layout, field, config)
}

/** The four corners of a plot, in world space and in winding order. */
export function plotOutline (plot: Plot): FencePoint[] {
  const cos = Math.cos(plot.rotation)
  const sin = Math.sin(plot.rotation)

  return ([[ -1, -1 ], [ 1, -1 ], [ 1, 1 ], [ -1, 1 ]] as const).map(([ sx, sz ]) => {
    const localX = sx * plot.halfW
    const localZ = sz * plot.halfD

    return {
      x: plot.x + localX * cos - localZ * sin,
      z: plot.z + localX * sin + localZ * cos,
    }
  })
}
