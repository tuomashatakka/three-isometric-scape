/** A point on the ground plane. */
export interface Vec2 {
  x: number
  z: number
}

/** Where a point falls against a polyline. */
export interface PathHit {

  /** Shortest distance to the line, in world units. */
  distance: number

  /**
   * Position along the line, as a continuous index into its points.
   *
   * An index rather than an arc length, because every caller that wants this
   * also wants to interpolate a per-point array — a ground profile, a width —
   * and an index does that directly. Divide by `points.length - 1` for a 0..1
   * course; the routes here are traced at a fixed step, so the two agree.
   */
  at: number
}

/**
 * Route geometry, shared by everything that runs a line across the ground.
 *
 * Split out of `layout.ts` when the beck arrived: the track and the beck ask the
 * same three questions of a polyline — smooth it, thin it, tell me where I am
 * against it — and the beck cannot import the layout that is going to own it.
 */

/** Uniform Catmull-Rom through the control points, so a route never kinks. */
export function smoothPath (control: readonly Vec2[], steps: number): Vec2[] {
  const padded         = [ control[0], ...control, control[control.length - 1] ]
  const points: Vec2[] = []

  for (let step = 0; step <= steps; step += 1) {
    const t       = step / steps * (control.length - 1)
    const segment = Math.min(Math.floor(t), control.length - 2)
    const local   = t - segment

    const [ p0, p1, p2, p3 ] = [
      padded[segment], padded[segment + 1], padded[segment + 2], padded[segment + 3],
    ]
    const l2 = local * local
    const l3 = l2 * local

    points.push({
      x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * local +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * l2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * l3),
      z: 0.5 * (2 * p1.z + (-p0.z + p2.z) * local +
        (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * l2 +
        (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * l3),
    })
  }

  return points
}

/**
 * Pull the kinks out of a traced line, leaving its two ends where they are.
 *
 * Catmull-Rom cannot do this — it passes *through* every control point, so a
 * line traced by picking the best of a fan of bearings keeps the fan's angular
 * quantisation no matter how densely it is resampled. This averages the control
 * points themselves, which is what turns a staircase into a watercourse.
 */
export function smoothPolyline (points: readonly Vec2[], passes: number): Vec2[] {
  let current = points.map(point => ({ x: point.x, z: point.z }))

  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.map(point => ({ x: point.x, z: point.z }))

    for (let index = 1; index < current.length - 1; index += 1) {
      next[index].x = (current[index - 1].x + current[index].x * 2 + current[index + 1].x) / 4
      next[index].z = (current[index - 1].z + current[index].z * 2 + current[index + 1].z) / 4
    }

    current = next
  }

  return current
}

/**
 * A reusable "where am I against this line" query.
 *
 * Returns a shared scratch rather than a fresh object: the terrain bake, the
 * bathymetry bake and every placement query run this hundreds of thousands of
 * times, and an allocation per call is the whole build budget. Callers read the
 * fields and move on; nobody holds the result.
 *
 * @param margin Distance past the line's own bounding box that still counts.
 *   Outside it the query answers `Infinity` without walking the segments, which
 *   is most of the map for a line that only crosses part of it.
 */
export function createPathQuery (
  points: readonly Vec2[],
  margin: number,
): (x: number, z: number) => PathHit {
  const hit: PathHit = { distance: Infinity, at: 0 }

  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  for (const point of points) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minZ = Math.min(minZ, point.z)
    maxZ = Math.max(maxZ, point.z)
  }

  minX -= margin
  maxX += margin
  minZ -= margin
  maxZ += margin

  return (x, z) => {
    hit.distance = Infinity
    hit.at       = 0

    if (x < minX || x > maxX || z < minZ || z > maxZ)
      return hit

    for (let index = 0; index < points.length - 1; index += 1) {
      const a        = points[index]
      const b        = points[index + 1]
      const dx       = b.x - a.x
      const dz       = b.z - a.z
      const lengthSq = dx * dx + dz * dz

      const t = lengthSq === 0
        ? 0
        : Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq))

      const distance = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t))

      if (distance < hit.distance) {
        hit.distance = distance
        hit.at       = index + t
      }
    }

    return hit
  }
}

/** Shortest distance from a point to a polyline, in world units. */
export function distanceToPath (points: readonly Vec2[], x: number, z: number): number {
  let best = Infinity

  for (let index = 0; index < points.length - 1; index += 1) {
    const a        = points[index]
    const b        = points[index + 1]
    const dx       = b.x - a.x
    const dz       = b.z - a.z
    const lengthSq = dx * dx + dz * dz

    const t = lengthSq === 0
      ? 0
      : Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq))

    best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)))
  }

  return best
}

/** Total length of a polyline, in world units. */
export function pathLength (points: readonly Vec2[]): number {
  let total = 0

  for (let index = 0; index < points.length - 1; index += 1)
    total += Math.hypot(points[index + 1].x - points[index].x, points[index + 1].z - points[index].z)

  return total
}
