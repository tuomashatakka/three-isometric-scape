import type { SeededRng } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import type { Footpaths } from './footpath.ts'
import type { ScapeLayout } from './layout.ts'
import type { Vec2 } from './path.ts'


/**
 * Where the dressing throws its darts.
 *
 * Every scatter in the scape is rejection sampling — draw a candidate, ask the
 * rule whether it will do, try again — so the sampler is what decides whether a
 * budget of nine hundred stones puts nine hundred stones on the ground or
 * eleven. Each of these narrows the draw to the ground its callers actually
 * accept: the island rather than the sea, one small feature rather than the
 * island, the worn network rather than the land it crosses.
 *
 * All three write into a caller-owned scratch and hand back the same object
 * every call. They run tens of thousands of times per build; an allocation
 * apiece is the whole budget.
 */

const TAU = Math.PI * 2

/**
 * A candidate-point generator, biased onto land.
 *
 * Candidates are drawn from the main island *or* from one of the islets rather
 * than uniformly over the whole field: the field is mostly open sea, and a
 * uniform disc throws most of every attempt budget into the water — the island
 * thins out to prove it. Writes into a caller-owned scratch, because this runs
 * tens of thousands of times at build.
 */
export function createSpotSampler (
  config: ScapeConfig,
  layout: ScapeLayout,
  rng:    SeededRng,
  extent: number,
): () => Vec2 {
  const half  = config.terrain.size * 0.5
  const spot  = { x: 0, z: 0 }
  const isles = config.terrain.isles.map(isle => ({
    x:      isle.x * half,
    z:      isle.z * half,
    radius: isle.radius * half,
  }))
  const mainReach = Math.min(layout.landRadius * 1.22, extent)

  return () => {
    const isle     = isles.length > 0 && rng.next() < 0.17 ? rng.pick(isles) : null
    const angle    = rng.next() * TAU
    const distance = Math.sqrt(rng.next()) * (isle ? isle.radius * 1.08 : mainReach)

    spot.x = (isle?.x ?? 0) + Math.cos(angle) * distance
    spot.z = (isle?.z ?? 0) + Math.sin(angle) * distance
    return spot
  }
}

/**
 * Candidate points drawn from the worn network itself.
 *
 * The island sampler is the wrong instrument for paving. The treads are a few
 * hundred square metres of a landmass that is tens of thousands, so all but a
 * handful of darts miss and the budget that survives gravels the path instead
 * of cobbling it. This walks the traced legs — a segment picked in proportion
 * to its length, a point along it, a jitter across it — so every candidate
 * lands on the tread and the count in the config is the count on the ground.
 *
 * `null` when there are no paths at all, which is what a scape with the
 * footpath wear turned to zero has: no legs to sample, so no paving, without a
 * second switch saying so.
 */
export function createTreadSampler (paths: Footpaths, rng: SeededRng): (() => Vec2) | null {
  const legs: { a: Vec2, b: Vec2 }[] = []
  const reach: number[]              = []

  let total = 0

  for (const path of paths.paths)
    for (let index = 0; index < path.points.length - 1; index += 1) {
      const a = path.points[index]
      const b = path.points[index + 1]

      total += Math.hypot(b.x - a.x, b.z - a.z)
      legs.push({ a, b })
      reach.push(total)
    }

  if (legs.length === 0 || total <= 0)
    return null

  const spot = { x: 0, z: 0 }

  return () => {
    const want = rng.next() * total

    // Binary search rather than a scan: this runs once per stone per attempt,
    // and the segment list is the whole network at forty-odd points a leg.
    let low  = 0
    let high = legs.length - 1

    while (low < high) {
      const middle = low + high >> 1
      if (reach[middle] < want)
        low = middle + 1
      else
        high = middle
    }

    const { a, b } = legs[low]
    const along    = rng.next()
    const dx       = b.x - a.x
    const dz       = b.z - a.z
    const span     = Math.hypot(dx, dz) || 1

    // Across the tread, not the verge: the stones are the bare middle, and the
    // grass thinning either side of them is what makes the edge read as an edge.
    const across = rng.range(-0.34, 0.34)

    spot.x = a.x + dx * along - dz / span * across
    spot.z = a.z + dz * along + dx / span * across
    return spot
  }
}

/**
 * Candidates drawn from one small feature rather than from the whole island.
 *
 * The island-wide sampler is right for anything that belongs to the terrain and
 * hopeless for anything that belongs to a *place*: the pasture is a quarter of
 * a percent of its disc, and forty darts thrown at the island land in a twelve
 * metre circle about once. Anything scattered into a named feature gets its own
 * disc instead. Returns the origin when there is no feature — the accept rule
 * that goes with such a scatter rejects everything anyway, so nothing is placed.
 */
export function createDiscSampler (rng: SeededRng, feature: Vec2 & { radius: number } | null): () => Vec2 {
  const spot = { x: 0, z: 0 }

  return () => {
    if (feature) {
      const angle    = rng.next() * TAU
      const distance = Math.sqrt(rng.next()) * feature.radius

      spot.x = feature.x + Math.cos(angle) * distance
      spot.z = feature.z + Math.sin(angle) * distance
    }

    return spot
  }
}
