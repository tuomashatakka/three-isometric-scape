import { smoothstep } from 'threejs-scene'
import { headingDelta, wrapHeading } from './camera-controls.ts'


/**
 * One place the camera is asked to be.
 *
 * The same four numbers the controls already integrate — a ground point, a view
 * size and a heading — because a waypoint that carried a *camera position*
 * instead would have to know about the lift, the tilt curve and the waterline
 * clearance, all of which are derived. A waypoint is a pose, not a transform.
 */
export interface CameraWaypoint {
  x:        number
  z:        number
  viewSize: number
  heading:  number
}

export interface CameraPathTween {
  x:        number
  z:        number
  viewSize: number
  heading:  number
}

/**
 * Headings as one continuous number line.
 *
 * Interpolating compass degrees directly is how a tour from 350° to 10° swings
 * the long way round through every heading it was not asked for. Accumulating
 * the *shortest* step between consecutive waypoints unrolls the sequence into
 * values a spline can be fitted through, and the result is wrapped once at the
 * end — so a path that genuinely circles twice still circles twice, and one that
 * merely crosses north does not go the long way to do it.
 */
export function unwrapHeadings (points: readonly CameraWaypoint[]): number[] {
  const unwrapped: number[] = []
  let running = points.length > 0 ? points[0].heading : 0

  for (const [ index, point ] of points.entries()) {
    if (index > 0)
      running += headingDelta(points[index - 1].heading, point.heading)

    unwrapped.push(running)
  }

  return unwrapped
}

/** How many legs a path has: one per gap, plus the way home when it loops. */
export function legCount (points: number, loop: boolean): number {
  if (points < 2)
    return 0

  return loop ? points : points - 1
}

/**
 * Centripetal-free uniform Catmull-Rom, the same spline the routes are smoothed
 * with — chosen for the same reason: it passes *through* its control points, so
 * a waypoint the reader placed is a place the camera actually visits rather than
 * one it leans toward.
 */
function spline (before: number, from: number, to: number, after: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t

  return 0.5 * (
    2 * from +
    (to - before) * t +
    (2 * before - 5 * from + 4 * to - after) * t2 +
    (3 * from - before - 3 * to + after) * t3
  )
}

/** The index a leg's neighbour has, wrapped on a loop and clamped on a run. */
function neighbour (index: number, count: number, loop: boolean): number {
  if (loop)
    return (index % count + count) % count

  return Math.min(count - 1, Math.max(0, index))
}

/**
 * Where the camera is, `travel` legs into the path.
 *
 * `travel` is in legs rather than in seconds, so the same function answers for a
 * tour running at any speed and for a scrub bar that has not been written yet.
 * Out of range it clamps to the ends of an open path and wraps around a closed
 * one — there is no state here to get out of step with the caller's.
 *
 * A path that does not loop eases in over its first leg and out over its last,
 * so a tour starts and stops at rest. A loop does not: a smooth join is the
 * whole point of closing it, and easing at the seam would make the one place
 * the reader cannot see a join into the one place they can.
 */
export function samplePath (
  points:    readonly CameraWaypoint[],
  unwrapped: readonly number[],
  travel:    number,
  loop:      boolean,
  out:       CameraPathTween,
): CameraPathTween {
  const count = points.length

  if (count === 0)
    return out

  if (count === 1) {
    out.x        = points[0].x
    out.z        = points[0].z
    out.viewSize = points[0].viewSize
    out.heading  = wrapHeading(points[0].heading)
    return out
  }

  const legs   = legCount(count, loop)
  const walked = loop
    ? (travel % legs + legs) % legs
    : Math.min(Math.max(travel, 0), legs)

  const leg  = Math.min(Math.floor(walked), legs - 1)
  const from = neighbour(leg, count, loop)
  const to   = neighbour(leg + 1, count, loop)
  const raw  = walked - leg

  // Half the ease, so the end legs slow without stalling — a full smoothstep on
  // a two-point path spends most of the tour barely moving.
  const eased = !loop && (leg === 0 || leg === legs - 1)
    ? (smoothstep(0, 1, raw) + raw) * 0.5
    : raw
  const t = eased

  const before = points[neighbour(leg - 1, count, loop)]
  const after  = points[neighbour(leg + 2, count, loop)]

  out.x = spline(before.x, points[from].x, points[to].x, after.x, t)
  out.z = spline(before.z, points[from].z, points[to].z, after.z, t)

  // Positive by construction — a view size that splined below the minimum would
  // put the camera inside the ground on the way between two perfectly good
  // places to stand.
  out.viewSize = Math.max(
    0.01,
    spline(before.viewSize, points[from].viewSize, points[to].viewSize, after.viewSize, t),
  )

  // Splined on the unrolled line and wrapped only once it is a heading again.
  // A looping path keeps going: index `count` is the first waypoint one whole
  // turn on, so the spline crosses the seam without ever seeing a 360 jump.
  const turn = loop
    ? unwrapped[count - 1] - unwrapped[0] + headingDelta(points[count - 1].heading, points[0].heading)
    : 0

  const heading = (index: number): number => {
    if (!loop)
      return unwrapped[neighbour(index, count, false)]

    const turns = Math.floor(index / count)

    return unwrapped[index - turns * count] + turns * turn
  }

  out.heading = wrapHeading(spline(heading(leg - 1), heading(leg), heading(leg + 1), heading(leg + 2), t))

  return out
}

export interface CameraPathOptions {

  /** Seconds the camera spends on one leg. Below this the tour is a cut. */
  legSeconds: number
  loop:       boolean
}

export interface CameraPath {
  readonly waypoints: readonly CameraWaypoint[]
  readonly playing:   boolean

  /** 0..1 across the whole path, for a progress readout. */
  readonly progress: number

  add(waypoint: CameraWaypoint): void
  removeAt(index: number): void
  clear(): void
  replace(waypoints: readonly CameraWaypoint[]): void

  play(): void
  stop(): void

  set(options: Partial<CameraPathOptions>): void
  readonly options: CameraPathOptions

  /**
   * Advance the tour.
   *
   * @returns Where the camera should be, or `null` when the path is not running
   * — which is the signal the controls use to leave the pose alone entirely
   * rather than to keep writing the same target every frame.
   */
  advance(delta: number): CameraPathTween | null
}

/** A tour, and the clock it runs on. */
export function createCameraPath (options: CameraPathOptions): CameraPath {
  const points: CameraWaypoint[] = []
  const tween: CameraPathTween   = { x: 0, z: 0, viewSize: 1, heading: 0 }
  const settings                 = { ...options }

  let unwrapped: number[] = []
  let travel              = 0
  let playing             = false

  function legs (): number {
    return legCount(points.length, settings.loop)
  }

  function rebuild (): void {
    unwrapped = unwrapHeadings(points)
    travel    = Math.min(travel, legs())

    if (points.length < 2)
      playing = false
  }

  return {
    get waypoints () {
      return points
    },
    get playing () {
      return playing
    },
    get progress () {
      const total = legs()
      return total > 0 ? travel / total : 0
    },
    get options () {
      return { ...settings }
    },

    add (waypoint) {
      points.push({ ...waypoint })
      rebuild()
    },

    removeAt (index) {
      if (index >= 0 && index < points.length)
        points.splice(index, 1)
      rebuild()
    },

    clear () {
      points.length = 0
      travel        = 0
      rebuild()
    },

    replace (waypoints) {
      points.length = 0
      for (const waypoint of waypoints)
        points.push({ ...waypoint })
      travel = 0
      rebuild()
    },

    play () {
      if (points.length < 2)
        return

      // From the top when the last run finished, and from where it stopped when
      // it was paused part-way — pressing play twice in a row should not be a
      // way to get stuck at the end of a path.
      if (!settings.loop && travel >= legs())
        travel = 0

      playing = true
    },

    stop () {
      playing = false
    },

    set (next) {
      Object.assign(settings, next)
      settings.legSeconds = Math.max(0.1, settings.legSeconds)
      rebuild()
    },

    advance (delta) {
      if (!playing || points.length < 2)
        return null

      travel += delta / settings.legSeconds

      if (travel >= legs()) {
        if (settings.loop)
          travel %= legs()
        else {
          travel  = legs()
          playing = false
        }
      }

      return samplePath(points, unwrapped, travel, settings.loop, tween)
    },
  }
}
