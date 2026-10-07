import { faceAmount } from './aspect.ts'
import { driftDirection } from './drift.ts'
import type { GroundNormal } from './height.ts'
import type { Vec2 } from './path.ts'


/**
 * The fence the track needs, and the only thing in this scape sited from the
 * weather rather than from the ground.
 *
 * `drift.ts` moved the winter: the snow line rises on every face turned into
 * the weather and falls on every face turned out of it, so the hill is scoured
 * on one side of a ridge and banked metres deep on the other. That left a thing
 * the ground now *has* and nothing was yet placed from — and the obvious thing
 * to place from it is the one piece of the island that has to stay open all
 * winter whatever the hill does, which is the cart track.
 *
 * The question this asks is deliberately a product of two:
 *
 * - **is this stretch of track banking.** `faceAmount` against the weather's
 *   own bearing, which is the same reading `drift.ts` swings the snow line with
 *   and `aspect.ts` swings it with against the sun. Positive is a lee face: the
 *   side the drift builds on.
 * - **does it bank across the road or along it.** A track running down the wind
 *   collects nothing however sheltered its ground is — the snow is travelling
 *   the way the road goes. So the lee reading is multiplied by how squarely the
 *   track lies across the weather, and the gate is on the product.
 *
 * Neither alone is the question, and that is the whole of the siting. A
 * threshold on shelter alone fences the whole lee half of an island; a
 * threshold on bearing alone fences the exposed crossings that never drift
 * because nothing lies on them.
 *
 * The answer is a line rather than a point, and it is **not** built where the
 * drift is. A fence does not stop blowing snow, it slows the air until the snow
 * falls out of it, so the bank forms in the fence's lee — which means the fence
 * stands `snowFence.setback` of its own heights *upwind* of the stretch it
 * guards, and the drift it throws lands on the open ground between the two. A
 * fence built on the verge is a fence that puts a wall of snow on the road.
 *
 * Pure, rng-free and free of `three`: the line is surveyed here and the timber
 * is cut in `props/snowfence.ts`, so `scape:map` reports every fence in the
 * archipelago without building a vertex of one.
 */

/** One run of palings, standing across the weather. */
export interface SnowFence {

  /** Every post, in the island's own local frame, one end of the line to the other. */
  posts: readonly Vec2[]

  /** The bearing the line runs on, in radians. Always square to the weather. */
  angle: number

  /** Metres of fence standing. */
  length: number

  /** Metres upwind of the guarded stretch the line was set back. */
  setback: number

  /** The middle of the stretch of track it was built for. */
  guards: Vec2

  /** Metres of track that stretch runs to. */
  guarded: number

  /** The worst drift reading on that stretch, 0..1 — see {@link driftRisk}. */
  bite: number

  /**
   * The way the braces rake, as a unit vector: downwind, which is the way the
   * fence is pushed.
   */
  lean: Vec2
}

/**
 * One island's answer, which is a measurement whether or not it is a fence.
 *
 * `run` alone would make the two ways this search says no indistinguishable,
 * and they are not the same fact about an island at all: a track that never
 * crosses a drifting face is a road that stays open, and a track that drifts
 * badly with nowhere upwind to stand a fence is a road that closes every winter
 * and cannot be helped. The first is a feature of the ground; the second is the
 * finding. So {@link drifts} comes back either way, and `scape:map` reports it
 * on the islands that got nothing — which is the only place it can be read.
 */
export interface SnowFenceSurvey {

  /** Metres of cart track standing on a drifting face, at or over the bite. */
  drifts: number

  /** The run of palings, or `null` when no line upwind of a drifting stretch would stand. */
  run: SnowFence | null
}

export interface SnowFenceSearch {

  /** The cart track, in the island's own local frame. */
  track: readonly Vec2[]

  /** The ground as the height field leaves it, in metres. */
  ground(x: number, z: number): number

  /** Which way that ground faces, written into a caller-owned record. */
  normal(x: number, z: number, target: GroundNormal): GroundNormal
  waterLevel: number

  /** The base weather bearing, in degrees — `wind.bearing`, the way it blows toward. */
  bearing: number

  /** Whether a post may stand here at all: off the claims, the yard and the channel. */
  clear(x: number, z: number): boolean

  /** `snowFence.height`, in metres. */
  height: number

  /** `snowFence.setback`, in multiples of {@link height}. */
  setback: number

  /** `snowFence.spacing`, in metres. */
  spacing: number

  /** `snowFence.bite`, 0..1. */
  bite: number

  /** `snowFence.reach`, in metres. */
  reach: number

  /** `snowFence.freeboard`, in metres. */
  freeboard: number
}

/** How finely the track is walked when the drifting stretches are found, in metres. */
const STEP = 1.2

/**
 * The shortest stretch of drifting track worth fencing, in metres.
 *
 * A craft fact rather than a knob, which is why it is here. Below about a dozen
 * metres the wind simply goes round the end of the fence and closes the road
 * behind it — the bank a short fence throws is narrower than the gap it was
 * built to keep open, which is the one way this structure can be built
 * correctly and do nothing.
 */
const SHORTEST_GUARD = 12

/**
 * How far past each end of the guarded stretch the line is carried, in metres.
 *
 * The overrun, and it is the other half of the same fact. Blowing snow does not
 * travel in straight lines past the end of a fence; it curls in behind it, and
 * a run that stops exactly where the drifting stretch stops leaves a tongue of
 * bank at each end of the stretch it was meant to clear. Four metres is about
 * three heights of the default fence.
 */
const FLARE = 4

/** The fewest posts a run can be built from — three bays, under which it is a hurdle. */
const SHORTEST_RUN = 4


/**
 * How hard one point on a track is drifting, 0..1.
 *
 * The product this module is built on, exported because it is also the claim:
 * a test that re-measures it at every post of every sited fence is a test that
 * states "fences stand where the track drifts" as a fact about the data rather
 * than re-running the search.
 *
 * `lee` is {@link driftDirection}'s vector — the way the weather blows toward,
 * which is the way a sheltered face points. `along` is the track's own tangent
 * and need not be normalised; the cross product is divided by its length here.
 */
export function driftRisk (normal: GroundNormal, lee: Vec2, along: Vec2): number {
  const span = Math.hypot(along.x, along.z)

  if (span < 1e-6)
    return 0

  // |t x w| for two horizontal unit vectors: 1 when the track lies square across
  // the weather, 0 when it runs down it.
  const across    = Math.abs(along.x * lee.z - along.z * lee.x) / span
  const sheltered = Math.max(0, faceAmount(normal, lee))

  return sheltered * across
}

/** One station on the walked track, with its drift reading. */
interface Station extends Vec2 {
  risk: number
}

/** Walk the track at {@link STEP} and read the drift at every station. */
function readTrack (search: SnowFenceSearch, lee: Vec2): Station[] {
  const { track }            = search
  const facing: GroundNormal = { x: 0, y: 1, z: 0 }
  const stations: Station[]  = []

  for (let index = 0; index < track.length - 1; index += 1) {
    const a    = track[index]
    const b    = track[index + 1]
    const span = Math.hypot(b.x - a.x, b.z - a.z)

    if (span < 1e-6)
      continue

    const along = { x: (b.x - a.x) / span, z: (b.z - a.z) / span }

    for (let walked = 0; walked < span; walked += STEP) {
      const x = a.x + along.x * walked
      const z = a.z + along.z * walked

      stations.push({ x, z, risk: driftRisk(search.normal(x, z, facing), lee, along) })
    }
  }

  return stations
}

/** The run of stations this module settles on, and what it is worth. */
interface Stretch {
  from:  number
  to:    number
  worth: number
}

/**
 * Every contiguous stretch of drifting track, worst first.
 *
 * Scored on drifting *metres* rather than on the peak reading, because the
 * fence is one line and the thing it has to be long enough to cover is a
 * length. Scoring on the peak picks the single nastiest station on the island
 * and builds a fence square to the weather at it, which on a winding track is
 * as often as not a ten-metre run guarding four metres of road.
 *
 * A list rather than a winner, and that is the lesson the pier's arc sweep
 * already learned here: the stretch that drifts worst and the stretch that can
 * actually be fenced are two different questions, and a search that answers
 * only the first hands back a site and lets the caller discover it is in the
 * sea. These islands make that common rather than rare — a cart track runs from
 * the farmyard to the water, so the ground a setback upwind of its worst
 * stretch is as often as not the yard itself, and the island's answer is the
 * *second* stretch rather than no fence at all.
 */
function driftingStretches (stations: readonly Station[], bite: number): Stretch[] {
  const found: Stretch[] = []
  let from  = -1
  let worth = 0

  const close = (to: number): void => {
    if (from >= 0 && (to - from) * STEP >= SHORTEST_GUARD)
      found.push({ from, to, worth })

    from  = -1
    worth = 0
  }

  for (const [ index, station ] of stations.entries())
    if (station.risk >= bite) {
      if (from < 0)
        from = index

      worth += station.risk * STEP
    }
    else
      close(index)

  close(stations.length)

  return found.sort((first, second) => second.worth - first.worth)
}

/**
 * The longest unbroken run of standable posts on a line.
 *
 * A fence with a hole in it is two fences, and two short fences are two hurdles
 * — so a line that crosses a gully, the beck's channel or the corner of a claim
 * is cut to the better side of the obstruction rather than built in pieces.
 */
function standable (
  search: SnowFenceSearch,
  centre: Vec2,
  across: Vec2,
  half:   number,
): Vec2[] {
  const floor = search.waterLevel + search.freeboard
  let best: Vec2[] = []
  let run:  Vec2[] = []

  for (let offset = -half; offset <= half + 1e-6; offset += search.spacing) {
    const x = centre.x + across.x * offset
    const z = centre.z + across.z * offset

    if (search.ground(x, z) >= floor && search.clear(x, z))
      run.push({ x, z })
    else {
      if (run.length > best.length)
        best = run

      run = []
    }
  }

  return run.length > best.length ? run : best
}

/**
 * Fence one island's track, or refuse it.
 *
 * A `null` run is a real answer and not a failure, the way the mill's and the
 * pier's are, and here it means one of three facts about the island: no stretch
 * of track long enough is both sheltered and lying across the weather, the
 * ground a setback upwind of the stretch that is is in the sea or spoken for,
 * or what is left of the line after both is shorter than three bays. Which of
 * the three it was is readable off {@link SnowFenceSurvey.drifts}, which is why
 * that comes back whether or not anything was built.
 *
 * The line is square to the weather rather than parallel to the road, and that
 * is deliberate. A fence set along a winding track is a fence presenting a
 * different angle to the wind every ten metres, and the drift it throws is
 * deep in some places and nothing in others. One straight line across the
 * weather throws one even bank, which is the whole engineering.
 */
export function solveSnowFence (search: SnowFenceSearch): SnowFenceSurvey {
  if (search.height <= 0 || search.spacing <= 0 || search.track.length < 2)
    return { drifts: 0, run: null }

  const lee      = driftDirection(search.bearing)
  const across   = { x: -lee.z, z: lee.x }
  const setback  = search.height * search.setback
  const stations = readTrack(search, lee)
  const drifts   = stations.filter(station => station.risk >= search.bite).length * STEP

  for (const stretch of driftingStretches(stations, search.bite)) {
    const guarded = stations.slice(stretch.from, stretch.to)
    const middle  = {
      x: guarded.reduce((sum, station) => sum + station.x, 0) / guarded.length,
      z: guarded.reduce((sum, station) => sum + station.z, 0) / guarded.length,
    }

    // Square to the weather, so the span the line has to cover is the guarded
    // stretch measured *across* the wind rather than its length along the
    // ground. A track that doubles back inside one drifting stretch needs a
    // fence as wide as its shadow and no wider.
    const reach = guarded.map(station =>
      (station.x - middle.x) * across.x + (station.z - middle.z) * across.z)
    const span  = Math.max(...reach) - Math.min(...reach)
    const posts = standable(
      search,
      { x: middle.x - lee.x * setback, z: middle.z - lee.z * setback },
      across,
      Math.min(span / 2 + FLARE, search.reach / 2),
    )

    if (posts.length < SHORTEST_RUN)
      continue

    const head = posts[0]
    const tail = posts[posts.length - 1]

    return {
      drifts,
      run: {
        posts,
        angle:   Math.atan2(across.z, across.x),
        length:  Math.hypot(tail.x - head.x, tail.z - head.z),
        setback,
        guards:  middle,
        guarded: (stretch.to - stretch.from) * STEP,
        bite:    guarded.reduce((worst, station) => Math.max(worst, station.risk), 0),
        lean:    lee,
      },
    }
  }

  return { drifts, run: null }
}

/**
 * Metres of ground one post claims against the scatter.
 *
 * Narrow, and narrower than the dyke's. A head dyke is a metre of stone laid on
 * the ground and a juniper grown against it hides it; a snow fence is a line of
 * laths with daylight through them, and the only thing a claim has to prevent
 * is a spruce standing *in* the run. The ground either side of it is exactly
 * the ground the drift lands on, and emptying that would be emptying the hill.
 */
export const SNOW_FENCE_CLAIM = 0.8
