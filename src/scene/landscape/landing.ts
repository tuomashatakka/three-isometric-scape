import type { ScapeConfig } from '../config.ts'
import type { HeightField } from './height.ts'
import type { ScapeLayout } from './layout.ts'
import type { Vec2 } from './path.ts'


const TAU = Math.PI * 2

/** A point on the ground with a bearing attached. */
export interface Spot extends Vec2 {
  angle: number
}

/**
 * Walk out from the yard on one bearing until the ground goes under, then back
 * off to where it breaks the surface again — that point is the bank.
 *
 * `distance` is where the water was *found*, not where the bank is; the shore
 * search ranks bearings by it.
 */
export function findBank (
  layout: ScapeLayout,
  field:  HeightField,
  config: ScapeConfig,
  angle:  number,
): Spot & { distance: number } | null {
  const water = config.terrain.waterLevel
  const limit = config.terrain.size * 0.46

  for (let distance = 4; distance < limit; distance += 1.2) {
    const x = layout.yard.x + Math.cos(angle) * distance
    const z = layout.yard.z + Math.sin(angle) * distance

    if (Math.hypot(x, z) > limit)
      return null
    if (field.heightAt(x, z) > water - 0.6)
      continue

    // Water is not the same thing as *the sea*. The beck now reaches within a
    // couple of yard radii of the farm, and it is the nearest thing to it that
    // a walk outward finds under the waterline — so without this the jetty gets
    // built across a stream two metres wide and the boathouse follows it in.
    if (layout.creek?.claimAt(x, z))
      return null

    let bank = distance
    while (bank > 2 && field.heightAt(
      layout.yard.x + Math.cos(angle) * bank,
      layout.yard.z + Math.sin(angle) * bank,
    ) < water + 0.1)
      bank -= 0.4

    return {
      x: layout.yard.x + Math.cos(angle) * bank,
      z: layout.yard.z + Math.sin(angle) * bank,
      angle,
      distance,
    }
  }

  return null
}

/**
 * The nearest shoreline to the yard, facing out over open water.
 *
 * Shared rather than private to the dressing, because two things now depend on
 * where the farm meets the water: the jetty is built there, and the footpath
 * that gets people to the jetty is worn to it. Two searches would answer the
 * same question twice and eventually disagree, and a path that stops four
 * metres short of the landing is worse than no path at all.
 */
export function findLanding (
  layout: ScapeLayout,
  field:  HeightField,
  config: ScapeConfig,
): Spot | null {
  let best: Spot & { distance: number } | null = null

  for (let step = 0; step < 48; step += 1) {
    const found = findBank(layout, field, config, step / 48 * TAU)

    if (found && (!best || found.distance < best.distance))
      best = found
  }

  return best && { x: best.x, z: best.z, angle: best.angle }
}

/**
 * The bank the boat harbour is dug into, a set arc round the shore from the
 * landing. Shared for the same reason the landing is: the boathouse is raised
 * here and the path from the yard is worn to here.
 */
export function findHarbourBank (
  layout:  ScapeLayout,
  field:   HeightField,
  config:  ScapeConfig,
  landing: Spot,
): Spot & { distance: number } | null {
  return findBank(
    layout,
    field,
    config,
    landing.angle + config.layout.harbourSpread * Math.PI / 180,
  )
}
