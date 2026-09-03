import { smoothstep } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { CHAPEL_FOOTING } from './chapel.ts'
import { distanceToTrack, pastureInfluence, plotInfluence } from './layout.ts'
import type { ScapeLayout } from './layout.ts'
import { MILL_FOOTING } from './mill.ts'
import type { Vec2 } from './path.ts'


/**
 * The pool up on the high ground.
 *
 * The beck is the scape's one *found* landform — a steepest-descent walk that
 * obeys the ground because water only ever goes one way. A tarn is the other
 * half of that sentence: standing water goes nowhere at all, so it is not
 * traced, it is *sited*, the way the pasture and the plots are. What it needs
 * from the ground is not a line downhill but a piece of upland flat enough that
 * a basin cut into it holds its water all the way round.
 *
 * So the search is for flatness rather than for fall, and the one number it
 * does not choose is the surface: a pool stands at its lowest lip, because that
 * is the first place it would run out over. Everything the scape then draws —
 * how deep the water is at a point, where the margin is, where the outlet
 * would be — follows from that one measured height.
 */
export interface Tarn {

  /** Centre of the pool, in the island's local frame. */
  x: number
  z: number

  /** Wetted radius at the surface, in metres. */
  radius: number

  /**
   * Surface height, in metres. The lowest point of the rim, and nothing else.
   *
   * Not chosen: water stands at the first height it could run out over, so the
   * one thing the solver must not do here is pick a number. Everything the
   * scape then draws — how deep the water is anywhere, where the shoreline
   * runs, where the outlet would be — follows from this.
   */
  level: number

  /** Metres the floor is scoured below the surface at the deepest point. */
  depth: number

  /** Metres of relief across the rim — the flatness the site was chosen for. */
  spread: number

  /** The low point of the rim: where the water leaves when there is enough of it. */
  outflow: Vec2

  /**
   * How strongly a point is inside the basin, 1 at the centre and 0 at the rim.
   *
   * The carve, the placement rules and the surface all read this one function,
   * which is what keeps a juniper from standing in water the ground was cut
   * away under and the sheet from ending somewhere the bank has not arrived.
   */
  claimAt(x: number, z: number): number
}

/** The ground the search measures, before any basin has been cut into it. */
export type GroundAt = (x: number, z: number) => number

/**
 * Bearings the rim is read at.
 *
 * Twenty-four, the same fan the beck's descent uses, and for a related reason:
 * the question here is whether a circle of ground holds water all the way
 * round, and a coarse fan steps straight over the gap that drains it.
 */
const RIM_BEARINGS = 24

/** Steps out along one bearing when the wetted reach is being measured. */
const WET_STEPS = 32

/**
 * Candidate centres per axis, across the island's land radius.
 *
 * Fixed rather than a spacing in metres, because the fell is three times the
 * home island's span and a metric grid would cost nine times as much there for
 * an answer about flat ground that does not need the resolution. Twenty-four
 * is a candidate every two metres on the home island and every eight on the
 * fell, and both are finer than the relief being measured.
 */
const CANDIDATES = 24

/**
 * Metres of rim relief that a metre of altitude is worth.
 *
 * The same shape of bribe as the beck's `HEADING_WORTH`, and for the same kind
 * of reason: the flattest ground on an island is very often the ground nearest
 * the waterline, and a tarn sited there is a lagoon. Paying a little flatness
 * for height is what puts the pool on the fell instead of on the foreshore.
 */
const HEIGHT_WORTH = 0.22

/**
 * How the floor falls away from the rim, as a power on the radial fraction.
 *
 * Above 1 the bowl is dished — shallow at the margin, deepest across a broad
 * middle — which is what a rock basin scoured out under ice looks like. A
 * linear cone reads as a funnel, and a funnel is a quarry rather than a tarn.
 */
const BOWL_POWER = 1.7

/**
 * Where the basin starts handing the ground back, as a fraction of the radius.
 *
 * Without it the carve ends at the rim as a step: the floor arrives at the
 * surface from underneath and the untouched hillside stands a metre or two
 * above it across a single quad. Blending the bowl into the ground over the
 * outer quarter is what makes the pool sit *in* the hillside — and it is also
 * what gives the water an irregular edge, because the ground the bowl is
 * blending into is a different height on every bearing. The waterline is then
 * found rather than drawn: it is wherever the result crosses the surface.
 */
const MARGIN = 0.72

/** Ground already spoken for, which no basin may be cut into. */
function taken (layout: ScapeLayout, x: number, z: number, radius: number): boolean {
  if (Math.hypot(x - layout.yard.x, z - layout.yard.z) < layout.yard.radius + radius)
    return true
  if (distanceToTrack(layout, x, z) < layout.track.width * 1.5 + radius)
    return true
  if (layout.plots.some(plot => plotInfluence(plot, x, z) > 0))
    return true
  if (pastureInfluence(layout, x, z) > 0)
    return true

  // The two buildings that are sited before the ground is graded, at the
  // footings the footpath planner avoids them by. The smokehouse is not here
  // and does not need to be: it is sited on the harbour bank, and `lift` keeps
  // the pool metres above it.
  if (layout.mill && Math.hypot(x - layout.mill.x, z - layout.mill.z) < MILL_FOOTING + radius)
    return true
  if (layout.chapel && Math.hypot(x - layout.chapel.x, z - layout.chapel.z) < CHAPEL_FOOTING + radius)
    return true

  // A channel through the basin would be a beck running along the bottom of a
  // pool, and the pool's own carve would take the fall out from under it.
  return (layout.creek?.clearanceAt(x, z) ?? Infinity) < radius
}

/**
 * Site the pool: the flattest piece of high ground with room for it.
 *
 * @returns The tarn, or `null` when nothing on the island is flat enough — a
 *   coast of nothing but hillside holds no standing water, and that absence is
 *   the honest answer rather than a puddle tipped down a slope.
 */
export function solveTarn (
  config: ScapeConfig,
  layout: ScapeLayout,
  ground: GroundAt,
): Tarn | null {
  const { radius, depth, lift, spread: allowed } = config.tarn

  if (radius <= 0 || depth <= 0)
    return null

  const floor = layout.waterLevel + lift
  const step  = layout.landRadius * 2 / CANDIDATES

  let best: { x: number, z: number, level: number, spread: number, outflow: Vec2 } | null = null
  let bestScore                                                                           = Infinity

  for (let ix = 0; ix <= CANDIDATES; ix += 1)
    for (let iz = 0; iz <= CANDIDATES; iz += 1) {
      const x = -layout.landRadius + ix * step
      const z = -layout.landRadius + iz * step

      // The whole pool has to fit inside the ground that is reliably dry, not
      // just its centre — a basin whose far rim is out past the coast is a bay.
      if (Math.hypot(x, z) > layout.landRadius - radius)
        continue
      if (ground(x, z) < floor || taken(layout, x, z, radius))
        continue

      let lowest  = Infinity
      let highest = -Infinity
      let outflow = { x, z }

      for (let index = 0; index < RIM_BEARINGS; index += 1) {
        const bearing = index / RIM_BEARINGS * Math.PI * 2
        const rimX    = x + Math.cos(bearing) * radius
        const rimZ    = z + Math.sin(bearing) * radius
        const rim     = ground(rimX, rimZ)

        if (rim < lowest) {
          lowest  = rim
          outflow = { x: rimX, z: rimZ }
        }

        highest = Math.max(highest, rim)
      }

      // A rim that dips under the lift is a rim the sea is on the other side of.
      if (lowest < floor)
        continue

      const score = highest - lowest - lowest * HEIGHT_WORTH

      if (score < bestScore) {
        bestScore = score
        best      = { x, z, level: lowest, spread: highest - lowest, outflow }
      }
    }

  if (!best || best.spread > allowed)
    return null

  const { x, z } = best

  return {
    x,
    z,
    radius,
    level:   best.level,
    depth,
    spread:  best.spread,
    outflow: best.outflow,

    claimAt (px, pz) {
      const distance = Math.hypot(px - x, pz - z)

      if (distance >= radius)
        return 0

      return 1 - (distance / radius) ** BOWL_POWER
    },
  }
}

/**
 * How far the water actually reaches, in metres of radius.
 *
 * Not the same number as `radius`, and the difference is the whole shape of the
 * thing: the basin is blended back into the hillside over its outer quarter, so
 * on the bearing the rim is lowest the water runs out to the full radius and on
 * the bearing it is highest it stops well short. The scape draws the sheet to
 * the radius either way and lets the bank stand in front of it — this is what
 * the terminal instruments measure instead, because a pool that quietly stopped
 * holding water is invisible in a still and one number here.
 *
 * @param ground The ground *with* the carve in it.
 */
export function tarnWetted (tarn: Tarn, ground: GroundAt): number {
  let wetted = 0

  for (let index = 0; index < RIM_BEARINGS; index += 1) {
    const bearing = index / RIM_BEARINGS * Math.PI * 2
    const cos     = Math.cos(bearing)
    const sin     = Math.sin(bearing)

    for (let step = 1; step <= WET_STEPS; step += 1) {
      const distance = tarn.radius * step / WET_STEPS

      if (ground(tarn.x + cos * distance, tarn.z + sin * distance) < tarn.level)
        wetted = Math.max(wetted, distance)
    }
  }

  return wetted
}

/**
 * The ground with the basin cut into it.
 *
 * Downward only, exactly the way the beck's channel is: the carve says how low
 * the floor may be, never how high. That is what makes the rim a containment
 * rather than an earthwork — every point on the circle the search measured is
 * left at the height it was found at, and the search only ever accepted a
 * circle whose lowest point is the water level.
 */
export function carveTarn (tarn: Tarn | null, x: number, z: number, height: number): number {
  if (!tarn)
    return height

  const distance = Math.hypot(x - tarn.x, z - tarn.z)

  if (distance >= tarn.radius)
    return height

  const bowl  = tarn.level - tarn.depth * tarn.claimAt(x, z)
  const blend = smoothstep(tarn.radius * MARGIN, tarn.radius, distance)

  return Math.min(height, bowl + (height - bowl) * blend)
}
