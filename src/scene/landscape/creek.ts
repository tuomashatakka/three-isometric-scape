import { smoothstep } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { createPathQuery, distanceToPath, pathLength, smoothPath, smoothPolyline } from './path.ts'
import type { Vec2 } from './path.ts'


/** Where a point falls in the channel. A shared scratch — read it, do not keep it. */
export interface CreekSample {

  /** 1 on the centreline, falling to 0 past the bank. */
  claim: number

  /** Position along the course, 0 at the spring and 1 at the mouth. */
  course: number

  /** Continuous index into {@link Creek.points}, for interpolating a profile. */
  at: number
}

/**
 * The beck.
 *
 * One watercourse, traced downhill from a spring on the high ground until it
 * runs out into open sea. It is the only feature in the scape whose shape is
 * *found* rather than authored: a track can be drawn between two places and a
 * pasture can be sited on the flattest ground, but water only ever goes one
 * way, and a beck that does not obey the terrain it crosses reads as a painted
 * stripe. So the course is a steepest-descent walk on the same fBm the terrain
 * is built from, and everything else about the beck follows from that line.
 */
export interface Creek {

  /** Centreline, spring first and mouth last. */
  points: readonly Vec2[]

  /** The spring, up on the ridge. */
  head: Vec2

  /** Where the channel gives up and becomes sea. */
  mouth: Vec2

  /** Length of the course, in world units. */
  length: number

  /** Half the channel floor's width at a course position, in metres. */
  halfWidthAt(course: number): number

  /**
   * How far the ground has to be cut at a course position, and how low the
   * mouth is dredged. Both in metres below the *unincised* ground.
   */
  incisionAt(course: number): number

  /** The floor the tidal reach is dredged to, in world height. */
  tideFloor: number

  /** How strongly the tidal floor claims the bed at a course position, 0..1. */
  tideAt(course: number): number

  /** Where a point falls in the channel. Allocation-free. */
  sampleAt(x: number, z: number): CreekSample

  /** Just the claim, for callers that do not need the rest. */
  claimAt(x: number, z: number): number

  /**
   * Metres between a point and the outer edge of the channel, negative inside
   * it. `Infinity` well away from the course.
   *
   * The placement searches want this rather than a raw distance to the
   * centreline: the channel is a couple of metres across at the spring and
   * three times that at the mouth, so one clearance figure for the whole beck
   * either lets a field hang over the estuary or reserves a quarter of the
   * island against a stream you could step over.
   */
  clearanceAt(x: number, z: number): number
}

/** A disc of ground the farm has already taken, that no course may run through. */
export interface Claim extends Vec2 {
  radius: number
}

/** Whether any claim reaches a point, with a margin added to every radius. */
function claimed (claims: readonly Claim[], x: number, z: number, margin: number): boolean {
  return claims.some(claim => Math.hypot(x - claim.x, z - claim.z) < claim.radius + margin)
}

const TAU = Math.PI * 2

/** Bearings tried at every step of the descent. */
const DESCENT_FANS = 24

/** How far the walk advances per step, in metres. */
const DESCENT_STEP = 2.4

/** Enough steps to cross the island twice, so termination is the limit's job. */
const DESCENT_LIMIT = 120

/**
 * What holding a heading is worth, in metres of drop.
 *
 * Steepest descent alone traces a staircase: the fan is quantised, the fBm is
 * bumpy at the step scale, and the walk spends as much of its length turning as
 * descending. Paying a little height to keep going the way it was already going
 * is what makes the result read as a watercourse rather than as a search.
 */
const HEADING_WORTH = 0.55

/**
 * What heading seaward is worth, in metres of drop.
 *
 * The island falloff only starts taking height away past `islandInner`, so
 * inside that radius the raw fBm has closed hollows in it and a purely downhill
 * walk sits in the first one it finds. A standing bias outward is the cheapest
 * nudge past the shallow ones — and it is also true, because the hollows a real
 * catchment has are already full of the water running through them.
 */
const SEAWARD_WORTH = 0.3

/**
 * How much harder the walk pushes seaward for every step it fails to get
 * further out, and the cap on that.
 *
 * The deep hollows need more than a nudge, and this is the honest way to give
 * it to them: a stream that cannot descend out of a basin fills the basin and
 * then leaves over its lowest lip. Growing the bias while the walk is stalled
 * and dropping it the moment it makes ground is exactly that behaviour, and it
 * is what turns "usually terminates" into "always terminates" — every extra
 * stalled step raises the price of staying until no rim is worth it.
 */
const SPILL_GAIN = 0.55
const SPILL_CAP  = 14

/** Shortest course worth having, in metres. Below this it is a puddle. */
const MIN_COURSE = 26

/** Metres of course a metre of fall is worth when the candidates are ranked. */
const FALL_WORTH = 6

/** Metres of course a track crossing is worth. Enough to outrank a longer beck. */
const CROSSING_WORTH = 40

const SPRING_PROBES = 26

/** Springs are kept this far apart, so the candidates are not one hill five times. */
const SPRING_SPACING = 9

/** How many candidate springs are traced before the best course is picked. */
const SPRING_COUNT = 8

/**
 * Candidate springs: the highest interior ground the farm is not standing on.
 *
 * Deliberately *not* `layout.ridges`. Those are ranked on the raw fBm over a
 * square grid whose corners reach past `islandOuter`, so most of them are
 * already under water by the time the falloff has had its say — they are a
 * conifer-density hint, not a catchment. A spring has to be somewhere the water
 * can actually run *from*, which means real height on ground that survives the
 * drowning.
 */
function findSprings (
  config:   ScapeConfig,
  groundAt: (x: number, z: number) => number,
  keepOut:  readonly Claim[],
): Vec2[] {
  const reach = config.terrain.size * 0.5 * config.terrain.islandInner * 0.85

  const found: { x: number, z: number, height: number }[] = []

  for (let ix = 0; ix < SPRING_PROBES; ix += 1)
    for (let iz = 0; iz < SPRING_PROBES; iz += 1) {
      const x = -reach + ix / (SPRING_PROBES - 1) * reach * 2
      const z = -reach + iz / (SPRING_PROBES - 1) * reach * 2

      if (Math.hypot(x, z) > reach)
        continue
      if (claimed(keepOut, x, z, SPRING_SPACING * 0.5))
        continue

      const height = groundAt(x, z)

      if (height < config.terrain.waterLevel + 2.5)
        continue

      found.push({ x, z, height })
    }

  found.sort((a, b) => b.height - a.height)

  const springs: Vec2[] = []

  for (const candidate of found) {
    if (springs.length >= SPRING_COUNT)
      break
    if (springs.some(spring => Math.hypot(spring.x - candidate.x, spring.z - candidate.z) < SPRING_SPACING))
      continue

    springs.push({ x: candidate.x, z: candidate.z })
  }

  return springs
}

/**
 * Trace one watercourse downhill from a start point.
 *
 * @param groundAt The ground *before* any authored levelling — the beck predates
 *   the farm, and grading a yard into a hillside does not move the stream that
 *   was already running down it.
 * @returns The raw walk, at one point per {@link DESCENT_STEP}, or `null` if it
 *   never reached open water.
 */
function traceDescent (
  config:   ScapeConfig,
  groundAt: (x: number, z: number) => number,
  start:    Vec2,
): Vec2[] | null {
  const half  = config.terrain.size * 0.5
  const limit = half * (config.terrain.islandOuter + 0.04)

  const points: Vec2[] = [{ x: start.x, z: start.z }]
  let x        = start.x
  let z        = start.z
  let headingX = 0
  let headingZ = 0
  let furthest = Math.hypot(x, z)
  let stalled  = 0

  for (let step = 0; step < DESCENT_LIMIT; step += 1) {
    const radius   = Math.hypot(x, z) || 1
    const outwardX = x / radius
    const outwardZ = z / radius
    const seaward  = SEAWARD_WORTH * (1 + Math.min(stalled, SPILL_CAP) * SPILL_GAIN)

    let bestX    = 0
    let bestZ    = 0
    let bestCost = Infinity

    for (let fan = 0; fan < DESCENT_FANS; fan += 1) {
      const angle = fan / DESCENT_FANS * TAU
      const dx    = Math.cos(angle)
      const dz    = Math.sin(angle)

      const cost = groundAt(x + dx * DESCENT_STEP, z + dz * DESCENT_STEP) -
        (headingX * dx + headingZ * dz) * HEADING_WORTH -
        (outwardX * dx + outwardZ * dz) * seaward

      if (cost < bestCost) {
        bestCost = cost
        bestX    = dx
        bestZ    = dz
      }
    }

    x += bestX * DESCENT_STEP
    z += bestZ * DESCENT_STEP
    headingX = bestX
    headingZ = bestZ

    points.push({ x, z })

    const reached = Math.hypot(x, z)

    if (reached >= limit)
      return points

    if (reached > furthest) {
      furthest = reached
      stalled  = 0
    }
    else
      stalled += 1
  }

  return null
}

/**
 * Site and shape the beck.
 *
 * Every candidate spring is traced downhill and the courses are ranked; the
 * winner is the longest one that keeps out of the farmyard, with a standing
 * bonus for crossing the track, because a beck the track has to cross is what
 * gives the bridge a reason to exist rather than a low patch to sit in.
 *
 * @param groundAt The ground before any authored levelling.
 * @param track The road, for the crossing bonus.
 * @param keepOut The farmyard, the fields and the walled meadow. The beck is
 *   resolved *after* all of them and routes around them rather than the other
 *   way about — not because water yields to a farm, but because those three are
 *   sited by searches that would each have to be taught the channel's shape,
 *   and a single list of discs the course has to miss says the same thing once.
 *   A course that cannot miss them is discarded, and a scape whose every
 *   candidate is discarded simply has no beck.
 * @returns The chosen course, or `null` when no spring produced one — a smaller
 *   island or a seed with no high ground can both mean there is nothing to
 *   trace, and every reader of `layout.creek` copes with its absence.
 */
export function createCreek (
  config:   ScapeConfig,
  groundAt: (x: number, z: number) => number,
  track:    readonly Vec2[],
  keepOut:  readonly Claim[],
): Creek | null {
  // Half the channel again, so a course that merely grazes a wall still counts
  // as running through it — the carve reaches well past the centreline.
  const margin = config.creek.width * 1.5

  let best: Vec2[] | null = null
  let bestScore           = -Infinity

  for (const spring of findSprings(config, groundAt, keepOut)) {
    const walk = traceDescent(config, groundAt, spring)

    if (!walk)
      continue

    // Smoothed *before* it is judged, because the smoothing is what will
    // actually be carved — a walk that only clears the yard in its jagged form
    // is a walk that puts a stream through the farmyard.
    const course = smoothPolyline(walk, 6)
    const length = pathLength(course)

    if (length < MIN_COURSE)
      continue
    if (course.some(point => claimed(keepOut, point.x, point.z, margin)))
      continue

    const crossesTrack = track.length > 1 &&
      course.some(point => distanceToPath(track, point.x, point.z) < config.creek.width)

    // Length alone picks the course with the *most* of itself already under the
    // waterline — which is a long inlet and no beck at all. Fall is what buys
    // the running water above the tide, so it is worth several metres of course
    // per metre of drop.
    const fall  = groundAt(course[0].x, course[0].z) - config.terrain.waterLevel
    const score = length + fall * FALL_WORTH + (crossesTrack ? CROSSING_WORTH : 0)

    if (score > bestScore) {
      bestScore = score
      best      = course
    }
  }

  if (!best)
    return null

  // Resampled to roughly one point per descent step. Denser buys nothing — the
  // channel is metres wide and every query walks every segment — and coarser
  // lets the Catmull-Rom cut the corners the smoothing just rounded.
  const points = smoothPath(best, Math.max(8, Math.round(pathLength(best) / DESCENT_STEP)))
  const spans  = points.length - 1

  const { width, incision, mouthDepth, mouthFlare } = config.creek
  const halfWidth                                   = width * 0.5
  const tideFloor                                   = config.terrain.waterLevel - mouthDepth

  const halfWidthAt = (course: number): number =>
    halfWidth * (1 + (mouthFlare - 1) * smoothstep(0.5, 1, course))

  // The spring is a seep, not a hole in the hillside: the cut ramps in over the
  // first fifth of the course so the channel starts as a damp crease.
  const incisionAt = (course: number): number => incision * smoothstep(0, 0.2, course)

  const tideAt = (course: number): number => smoothstep(0.6, 0.98, course)

  /**
   * How far past the floor the bank keeps taking ground, as a multiple of the
   * floor's own half-width.
   *
   * Wider and the beck reads as a valley it happens to be lying in; narrower
   * and the terrain grid cannot resolve two sides at all on the mobile tier,
   * where a quad is two metres across and the whole channel is five.
   */
  const bank = 2.5

  const query = createPathQuery(points, halfWidthAt(1) * bank + 2)

  const sample: CreekSample = { claim: 0, course: 0, at: 0 }

  const sampleAt = (x: number, z: number): CreekSample => {
    const hit = query(x, z)

    sample.at     = hit.at
    sample.course = spans === 0 ? 0 : hit.at / spans

    if (!Number.isFinite(hit.distance)) {
      sample.claim = 0
      return sample
    }

    const floor  = halfWidthAt(sample.course)
    sample.claim = 1 - smoothstep(floor, floor * bank, hit.distance)
    return sample
  }

  return {
    points,
    head:   points[0],
    mouth:  points[points.length - 1],
    length: pathLength(points),
    halfWidthAt,
    incisionAt,
    tideFloor,
    tideAt,
    sampleAt,

    claimAt (x, z) {
      return sampleAt(x, z).claim
    },

    clearanceAt (x, z) {
      const hit = query(x, z)

      if (!Number.isFinite(hit.distance))
        return Infinity

      return hit.distance - halfWidthAt(spans === 0 ? 0 : hit.at / spans) * bank
    },
  }
}
