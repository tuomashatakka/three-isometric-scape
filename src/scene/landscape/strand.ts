import { createSeededRng, smoothstep, valueNoise1d } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import type { LandmassSurvey } from './archipelago.ts'
import type { Vec2 } from './path.ts'


/**
 * The bar that makes two islands one.
 *
 * Every other landform in this scape is surveyed inside a single patch's own
 * frame, which is what lets one island's yard, coast, beck and landing all agree
 * about the same ground. A tombolo cannot be: it is the ground *between* two
 * patches, and the patches deliberately do not overlap — `assertSeparate` is
 * what keeps a height query dispatching to exactly one of them.
 *
 * So this is the one piece of the world built in world space, and it is added to
 * the composite field *after* the dispatch, as a maximum. Never a minimum: a bar
 * may raise the seabed it lies on and must never lower the island it runs into,
 * which is also what lets both ends simply disappear under the rising shore
 * rather than needing a join.
 *
 * Everything downstream then inherits it for nothing, which is the whole point
 * of there being one height field: the bathymetry mask bakes off it so the water
 * knows the bar is there, the ferry routes test depth so they round it rather
 * than sail through it, and `scape:map` samples it so the bar draws in ascii
 * without the script being told.
 */
export interface Strand {

  /** The centreline, in world space, shore to shore. */
  points: readonly Vec2[]

  /** Shore-to-shore length, in metres. */
  length: number

  /**
   * The crest at a point, in absolute world height.
   *
   * Returns the seabed where the bar has no claim, so a caller can take the
   * maximum unconditionally rather than branching on a claim first.
   */
  heightAt(x: number, z: number): number

  /** How much of the bar is at a point, 0..1. The paint and the tests read this. */
  claimAt(x: number, z: number): number
}

/**
 * How far past the dry crest the skirt reaches, as a multiple of the width.
 *
 * Derived rather than authored, like the wander below it. A bar is a heap of
 * shingle at its own angle of repose; the shape is not a thing to tune per
 * scape, and a knob for it would be a knob nobody could answer.
 */
const SKIRT = 2.6

/** Lateral wander of the centreline, as a multiple of the width. */
const WANDER = 1.9

/** How much of the crest the undulation is allowed to take away. */
const UNDULATION = 0.38

/** Metres between probes when walking out to find the shore. */
const PROBE = 2

/**
 * Where a bar would leave one island for another.
 *
 * Walks out from the island's own middle along the bearing of its neighbour and
 * returns the first point at or under the waterline — which is the shore, on
 * that bearing, as this island's own survey understands it. Local coordinates go
 * in and world coordinates come out, because the two islands do not share a
 * frame and the bar is the thing that has to.
 *
 * @returns `null` when the whole bearing is dry to the edge of the patch, which
 *   means the island is not where the caller thought it was.
 */
export function findShoreToward (
  config: ScapeConfig,
  from:   LandmassSurvey,
  toward: Vec2,
): Vec2 | null {
  const dx             = toward.x - from.origin.x
  const dz             = toward.z - from.origin.z
  const span           = Math.hypot(dx, dz)
  const reach          = from.config.terrain.size * 0.5
  const { waterLevel } = config.terrain

  if (span < 1e-6)
    return null

  for (let along = 0; along <= reach; along += PROBE) {
    const localX = dx / span * along
    const localZ = dz / span * along

    if (from.survey.field.heightAt(localX, localZ) <= waterLevel)
      return { x: from.origin.x + localX, z: from.origin.z + localZ }
  }

  return null
}

/** The nearest point on a polyline, as a distance and a position along it. */
type AlongPolylineReturnType = { distance: number, at: number }

function alongPolyline (points: readonly Vec2[], x: number, z: number): AlongPolylineReturnType {
  let distance = Infinity
  let at       = 0
  let walked   = 0
  let total    = 0

  for (let index = 0; index < points.length - 1; index += 1)
    total += Math.hypot(points[index + 1].x - points[index].x, points[index + 1].z - points[index].z)

  for (let index = 0; index < points.length - 1; index += 1) {
    const a        = points[index]
    const b        = points[index + 1]
    const dx       = b.x - a.x
    const dz       = b.z - a.z
    const lengthSq = dx * dx + dz * dz
    const leg      = Math.sqrt(lengthSq)

    const t = lengthSq === 0
      ? 0
      : Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq))

    const near = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t))

    if (near < distance) {
      distance = near
      at       = total === 0 ? 0 : (walked + leg * t) / total
    }

    walked += leg
  }

  return { distance, at }
}

/**
 * The bar, traced between two shore anchors.
 *
 * The centreline wanders and the crest undulates, both off one seeded 1d noise
 * and both scaled from `strand.width` and `strand.crest` rather than from knobs
 * of their own — a bar that is exactly straight and exactly level reads as
 * engineering, and this one was not built by anybody.
 *
 * The undulation is deliberately one-sided. It may take a little over a third of
 * the crest away and never all of it, because "these two islands are joined" is
 * a claim the rest of the scape is entitled to rely on: a dip below the
 * waterline anywhere along the line would quietly turn one island back into two,
 * and nothing downstream would say so.
 */
export function createStrand (
  config: ScapeConfig,
  from:   Vec2,
  to:     Vec2,
): Strand {
  const { waterLevel, seabedDrop } = config.terrain
  const { width, crest }           = config.strand

  const seabed = waterLevel - seabedDrop
  const span   = Math.hypot(to.x - from.x, to.z - from.z)
  const steps  = Math.max(2, Math.round(span / 6))

  // Two independent streams off one fork, so the line's wander and the crest's
  // undulation are not the same shape read twice — a bar that is highest exactly
  // where it bends furthest is a bar somebody drew.
  const rng   = createSeededRng(config.seed).fork('strand')
  const sways = rng.next() * 64
  const dunes = rng.next() * 64

  // Cells, in metres. Four lobes over the crossing for the line and rather more
  // for the crest, because shingle piles at a shorter wavelength than a spit
  // curves at.
  const swaySpan = Math.max(24, span * 0.25)
  const duneSpan = Math.max(12, span * 0.11)

  // Across the line, so a lateral wander is a wander and not a longer bar.
  const acrossX = -(to.z - from.z) / span
  const acrossZ = (to.x - from.x) / span

  const points: Vec2[] = Array.from({ length: steps + 1 }, (_unused, index) => {
    const t = index / steps

    // Pinned at both ends: the anchors are where the land already is, and a
    // centreline that wandered away from them would leave the bar starting in
    // open water a few metres off its own shore.
    const held = Math.sin(t * Math.PI)
    const sway = (valueNoise1d(t * span, swaySpan, sways) - 0.5) * 2 * width * WANDER * held

    return {
      x: from.x + (to.x - from.x) * t + acrossX * sway,
      z: from.z + (to.z - from.z) * t + acrossZ * sway,
    }
  })

  // The bar's own bounding box, grown by its skirt.
  //
  // Not an optimisation to be tidied away later — it is what makes the strand
  // affordable at all. `heightAt` is the single query the whole scape is built
  // on: every terrain vertex, every placement, every cell of the A* navigation
  // grid and every texel of the bathymetry mask goes through it, which on this
  // archipelago is millions of calls. Walking a seventy-six segment polyline for
  // each of them took a survey that used to run in sixteen milliseconds to
  // **forty-nine seconds**, measured. Almost none of those queries are anywhere
  // near four hundred metres of shingle in the far south, and one box test says
  // so before any of the arithmetic happens.
  const reach = width * SKIRT
  const minX  = Math.min(...points.map(point => point.x)) - reach
  const maxX  = Math.max(...points.map(point => point.x)) + reach
  const minZ  = Math.min(...points.map(point => point.z)) - reach
  const maxZ  = Math.max(...points.map(point => point.z)) + reach

  function outside (x: number, z: number): boolean {
    return x < minX || x > maxX || z < minZ || z > maxZ
  }

  function claimAt (x: number, z: number): number {
    if (outside(x, z))
      return 0

    return 1 - smoothstep(width, reach, alongPolyline(points, x, z).distance)
  }

  return {
    points,
    length: span,

    heightAt (x, z) {
      if (outside(x, z))
        return seabed

      const { distance, at } = alongPolyline(points, x, z)
      const claim            = 1 - smoothstep(width, reach, distance)

      if (claim <= 0)
        return seabed

      const dune = 1 - UNDULATION * valueNoise1d(at * span, duneSpan, dunes)

      return seabed + (waterLevel + crest * dune - seabed) * claim
    },

    claimAt,
  }
}

/**
 * The archipelago's strand, if the two islands it names are both here.
 *
 * @returns `null` when either id is unknown, when the two are the same island,
 *   or when a shore could not be found on the bearing between them — every one
 *   of which is a scape with no bar rather than a scape that failed to build.
 */
export function surveyStrand (
  config:     ScapeConfig,
  landmasses: readonly LandmassSurvey[],
): Strand | null {
  const [ fromId, toId ] = config.strand.between
  const from             = landmasses.find(landmass => landmass.id === fromId)
  const to               = landmasses.find(landmass => landmass.id === toId)

  if (!from || !to || from === to || config.strand.crest <= 0)
    return null

  const head = findShoreToward(config, from, to.origin)
  const foot = findShoreToward(config, to, from.origin)

  return head && foot ? createStrand(config, head, foot) : null
}
