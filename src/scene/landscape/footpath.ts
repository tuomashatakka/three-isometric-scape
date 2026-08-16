import { smoothstep } from 'threejs-scene'
import type { SeededRng } from 'threejs-scene'
import { createPathQuery, smoothPath, smoothPolyline } from './path.ts'
import type { Vec2 } from './path.ts'


/** Ground something already stands on, that a path has to go round. */
export interface Obstacle extends Vec2 {
  radius: number
}

/** Two places the farm goes between. The tracing turns it into a path. */
export interface FootpathRoute {
  from: Vec2
  to:   Vec2
}

/** One worn route, as it ended up on the ground. */
export interface Footpath {
  points: readonly Vec2[]

  /** Where it was worn to. Kept for the anchor a follow-up would hang on it. */
  to: Vec2
}

export interface Footpaths {
  paths: readonly Footpath[]

  /**
   * How bare a point has been walked, 0..1.
   *
   * 1 down the middle of a tread near the yard, falling across the verge and
   * falling again along the route's length. The strength knob is *not* applied
   * here: the terrain paints with it and the scatter tests against the bare
   * geometry, so turning the wear down pales the paths without letting the grass
   * creep back over ground that is still being walked on.
   */
  wearAt(x: number, z: number): number
}

export interface FootpathOptions {
  routes:   readonly FootpathRoute[]
  heightAt: (x: number, z: number) => number

  /** Buildings and the like. A path goes round these, never under them. */
  avoid: readonly Obstacle[]

  /** Width of the bare tread, in metres. */
  width: number

  /** Metres of thinning grass either side of the tread. */
  verge: number

  /** How hard a route works to keep off a climb. 0 walks straight lines. */
  climb: number

  /** Overall strength, 0..1. At 0 no route is traced at all. */
  wear: number

  /** Lateral wander, in metres — a path nobody surveyed is never quite straight. */
  wander: number

  rng: SeededRng

  /**
   * Ground the farm already has a way across. A route that spends most of its
   * length on the cart track is the cart track, and is dropped rather than
   * painted twice.
   */
  onTrack?: (x: number, z: number) => boolean
}

/** Control points per route, before the smoothing resample. */
const SEGMENTS = 12

/** Relaxation passes. Past about thirty the route stops moving. */
const PASSES = 34

/** How hard a point is pulled back toward its neighbours each pass. */
const TENSION = 0.34

/** Central-difference reach for the ground gradient, in metres. */
const PROBE = 1.1

/**
 * Height difference below which a bump is not a bump, in metres.
 *
 * A step this size is one footfall. Without it the sidestep term reads the
 * ground's own grain as topography and the route wanders over centimetres.
 */
const SLACK = 0.3

/** Resampled points per route. Dense enough that the query is a segment walk. */
const RESAMPLE = 44

/** Fraction of a route that has to lie off the track for it to be worth wearing. */
const OFF_TRACK = 0.62

/** Routes shorter than this are two names for the same spot, in metres. */
const STUB = 2.5

/**
 * How far outside a building's own radius the tread is pushed, in metres.
 *
 * Exported because the network planner has to agree with it: a leg is costed as
 * a detour exactly when the straight line between two places would come inside
 * this, which is the same thing the tracer would then have to push it out of.
 */
export const CLEARANCE = 0.6

/**
 * Push a point out of anything it is standing inside.
 *
 * Applied as a projection after each relaxation pass rather than as another
 * force term, so it cannot be traded off against the tension the way a spring
 * would be — a path that mostly misses the barn is not a path that misses the
 * barn. Endpoints are exempt by never being passed in: a route to a door has to
 * arrive at the door, which is by definition against the building.
 */
function clearObstacles (point: Vec2, avoid: readonly Obstacle[]): void {
  for (const thing of avoid) {
    const dx    = point.x - thing.x
    const dz    = point.z - thing.z
    const range = thing.radius + CLEARANCE
    const gap   = Math.hypot(dx, dz)

    if (gap >= range)
      continue

    // Dead centre has no direction to be pushed in; anywhere else, straight out.
    const away = gap < 1e-6 ? { x: 1, z: 0 } : { x: dx / gap, z: dz / gap }

    point.x = thing.x + away.x * range
    point.z = thing.z + away.z * range
  }
}

/**
 * A soft sign.
 *
 * `Math.sign` makes the sidestep term a switch, and a switch on a noisy field
 * chatters — the point flips direction every pass and the route never settles.
 * This is the same answer either side of the slack and smooth across it.
 */
function soften (value: number): number {
  return value / (Math.abs(value) + SLACK)
}

/**
 * A desire line, found rather than drawn.
 *
 * The route is the one a person would take: as short as it can be, and off the
 * climb where the climb is worth walking round. Both are one relaxation. Every
 * interior point is pulled toward the midpoint of its neighbours, which is the
 * gradient of the route's own length and is what keeps it from meandering; and
 * it is pushed along the ground gradient by how much of a *bulge* it is — how
 * far its own height stands above, or below, the two points either side of it.
 *
 * That second term is the whole idea, and it is signed for a reason. A point
 * higher than both neighbours is a crest the route is climbing over for nothing,
 * and it slides downhill; a point lower than both is a hollow it drops into and
 * has to climb out of, and it slides up. A point that merely sits *between* its
 * neighbours is on a steady slope with a steady grade — which is a hillside path,
 * not a fault — and the term vanishes there however steep the ground is. So the
 * route traverses slopes and refuses humps and dips, which is what a worn path
 * does and what a shortest-path search does not.
 *
 * Endpoints never move: a path to the landing has to arrive at the landing.
 */
function traceRoute (
  from:     Vec2,
  to:       Vec2,
  heightAt: (x: number, z: number) => number,
  climb:    number,
  avoid:    readonly Obstacle[],
): Vec2[] {
  const points: Vec2[] = []

  for (let step = 0; step <= SEGMENTS; step += 1) {
    const t = step / SEGMENTS
    points.push({ x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t })
  }

  for (let pass = 0; pass < PASSES; pass += 1)
    for (let index = 1; index < points.length - 1; index += 1) {
      const point = points[index]
      const back  = points[index - 1]
      const ahead = points[index + 1]

      const here  = heightAt(point.x, point.z)
      const bulge = soften(here - heightAt(back.x, back.z)) +
        soften(here - heightAt(ahead.x, ahead.z))

      const gradX = (heightAt(point.x + PROBE, point.z) - heightAt(point.x - PROBE, point.z)) / (PROBE * 2)
      const gradZ = (heightAt(point.x, point.z + PROBE) - heightAt(point.x, point.z - PROBE)) / (PROBE * 2)

      point.x += ((back.x + ahead.x) * 0.5 - point.x) * TENSION - bulge * gradX * climb
      point.z += ((back.z + ahead.z) * 0.5 - point.z) * TENSION - bulge * gradZ * climb

      clearObstacles(point, avoid)
    }

  return points
}

/** Lay a lazy S over a settled route, so nothing in the scape is ruler-straight. */
function wanderRoute (points: Vec2[], amount: number, phase: number): Vec2[] {
  const last = points.length - 1
  const dx   = points[last].x - points[0].x
  const dz   = points[last].z - points[0].z
  const span = Math.hypot(dx, dz)

  if (span < 1e-6 || amount <= 0)
    return points

  const acrossX = -dz / span
  const acrossZ = dx / span

  return points.map((point, index) => {
    const t     = index / last
    const swing = Math.sin(t * Math.PI * (1 + phase * 0.6) + phase) * Math.sin(t * Math.PI) * amount

    return { x: point.x + acrossX * swing, z: point.z + acrossZ * swing }
  })
}

/**
 * Every path the farm has worn into the ground it stands on.
 *
 * Paint, and never height. The route is traced across the ground *as built* —
 * levelled yard, graded track, carved beck and all — so it cannot also carve
 * that ground without becoming its own input; a path that sank the hillside it
 * had just been routed over would move the hillside out from under itself on the
 * next build. The terrain gets the wear as colour, the scatter gets it as a
 * place not to stand, and neither of them changes a vertex height.
 */
export function createFootpaths (options: FootpathOptions): Footpaths {
  const { heightAt, avoid, width, verge, climb, wear, wander, rng, onTrack } = options

  const inner              = width * 0.5
  const outer              = inner + Math.max(0.05, verge)
  const traced: Footpath[] = []

  // Nothing is traced at all when the wear is off, rather than traced and then
  // painted with zero strength — the scatter tests against the geometry, and a
  // path nobody walks has to let the grass back over it.
  for (const { from, to } of wear > 0 ? options.routes : []) {
    // Two names for the same spot. The well is a couple of paces from the
    // farmhouse door on some seeds, and a path that short is the yard.
    if (Math.hypot(to.x - from.x, to.z - from.z) < STUB)
      continue

    const route  = traceRoute(from, to, heightAt, climb, avoid)
    const wavy   = wanderRoute(route, wander * rng.range(0.5, 1), rng.range(0, Math.PI * 2))
    const points = smoothPath(smoothPolyline(wavy, 2), RESAMPLE)

    // The wander and the resample both move points a little, and a tread that
    // clips the corner of a barn is the one failure this can produce that a
    // reader will notice. Settle it once more on the line actually walked.
    for (let index = 1; index < points.length - 1; index += 1)
      clearObstacles(points[index], avoid)

    if (onTrack && points.filter(point => !onTrack(point.x, point.z)).length < points.length * OFF_TRACK)
      continue

    traced.push({ points, to: { x: to.x, z: to.z }})
  }

  const queries = traced.map(path => createPathQuery(path.points, outer))

  return {
    paths: traced,

    // Across the tread only, and never along it. A leg of the network runs
    // between two places people have business at, so there is no far end to
    // pale toward — and a taper that ran from one end of every leg to the other
    // would leave a visible seam at each junction, where a leg's faded tail
    // meets the next leg's full-strength head.
    wearAt (x, z) {
      let worn = 0

      for (const query of queries) {
        const hit = query(x, z)

        if (hit.distance > outer)
          continue

        worn = Math.max(worn, 1 - smoothstep(inner, outer, hit.distance))
      }

      return worn
    },
  }
}
