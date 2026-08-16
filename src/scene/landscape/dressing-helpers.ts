import type { ScapeConfig } from '../config.ts'
import type { FencePoint } from '../props/fence.ts'
import type { PropName } from '../props/index.ts'
import type { Creek } from './creek.ts'
import type { HeightField } from './height.ts'
import type { Spot } from './landing.ts'
import { yawAlong } from './layout.ts'
import type { Plot, ScapeLayout, Vec2 } from './layout.ts'


const FOLIAGE: ReadonlySet<string> = new Set([
  'spruce', 'pine', 'birch', 'sapling', 'grass', 'heather', 'wildflower', 'reeds', 'crop', 'lilyPads',
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
