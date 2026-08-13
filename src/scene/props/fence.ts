import { CylinderGeometry, Matrix4, Quaternion, Vector3 } from 'three'
import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'


/** A point on the ground plane. */
export interface FencePoint {
  x: number
  z: number
}

export interface FenceRunOptions {

  /** The line the fence follows, in world space. Two points minimum. */
  points: readonly FencePoint[]

  /** Ground height, sampled per post. */
  heightAt(x: number, z: number): number
  rng:     SeededRng
  palette: NordicPalette

  /** Metres between posts. The run is resampled to this spacing. @defaultValue 2.2 */
  spacing?: number

  /** Post height above ground, in metres. @defaultValue 1.35 */
  postHeight?: number

  /** Rail heights as fractions of `postHeight`. @defaultValue [0.32, 0.6, 0.86] */
  rails?: readonly number[]

  /** Close the run back to its first point — for a fence around a field. @defaultValue false */
  closed?: boolean

  /** Skip any post whose ground falls below this. @defaultValue -Infinity */
  minHeight?: number
}

const UP    = new Vector3(0, 1, 0)
const ONE   = new Vector3(1, 1, 1)
const RAILS = [ 0.32, 0.6, 0.86 ]

const from      = new Vector3()
const to        = new Vector3()
const direction = new Vector3()
const midpoint  = new Vector3()
const rotation  = new Quaternion()
const placement = new Matrix4()

/**
 * Lay a cylinder between two world points.
 *
 * `part()` only takes an Euler, which cannot express "point at that" without
 * the caller doing the trigonometry anyway — so the colour is baked with no
 * transform and the geometry is placed with a matrix afterwards. Vertex colours
 * are unaffected by a later transform, and `applyMatrix4` carries the normals.
 */
function strut (
  parts:  BufferGeometry[],
  rng:    SeededRng,
  color:  string,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  radius: number,
  jitter: number,
): void {
  from.set(ax, ay, az)
  to.set(bx, by, bz)
  direction.subVectors(to, from)

  const length = direction.length()

  if (length < 1e-4)
    return

  const geometry = part(new CylinderGeometry(radius, radius, length, 5), { color, jitter, rng })

  rotation.setFromUnitVectors(UP, direction.divideScalar(length))
  placement.compose(midpoint.addVectors(from, to).multiplyScalar(0.5), rotation, ONE)
  geometry.applyMatrix4(placement)
  parts.push(geometry)
}

/**
 * Resample a polyline so consecutive points sit `spacing` apart along it.
 *
 * Shared with [`wall.ts`](wall.ts): a fence and a drystone wall disagree about
 * everything they put on the line, and about nothing at all about the line.
 */
export function resamplePath (points: readonly FencePoint[], spacing: number, closed: boolean): FencePoint[] {
  const path              = closed ? [ ...points, points[0] ] : [ ...points ]
  const out: FencePoint[] = [ path[0] ]
  let carry = 0

  for (let index = 0; index < path.length - 1; index += 1) {
    const a    = path[index]
    const b    = path[index + 1]
    const span = Math.hypot(b.x - a.x, b.z - a.z)

    if (span < 1e-4)
      continue

    for (let walked = spacing - carry; walked <= span; walked += spacing) {
      const t = walked / span
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
    }

    carry = (carry + span) % spacing
  }

  return out
}

type Post = FencePoint & { y: number }

/** Plumb posts, each standing on its own patch of ground. */
function raisePosts (
  parts:      BufferGeometry[],
  posts:      readonly Post[],
  rng:        SeededRng,
  palette:    NordicPalette,
  postHeight: number,
  minHeight:  number,
): void {
  for (const post of posts) {
    if (post.y < minHeight)
      continue

    strut(
      parts, rng, palette.tarWood,
      post.x, post.y - 0.16, post.z,
      post.x, post.y + postHeight, post.z,
      0.075, 0.13,
    )
  }
}

/** Rails from post to post — they pick up the slope for free. */
function spanRails (
  parts:      BufferGeometry[],
  posts:      readonly Post[],
  rng:        SeededRng,
  palette:    NordicPalette,
  postHeight: number,
  rails:      readonly number[],
  spacing:    number,
  minHeight:  number,
): void {
  for (let index = 0; index < posts.length - 1; index += 1) {
    const a = posts[index]
    const b = posts[index + 1]

    if (a.y < minHeight || b.y < minHeight)
      continue

    // A gap wider than two spacings means the run stepped over rejected ground.
    if (Math.hypot(b.x - a.x, b.z - a.z) > spacing * 2)
      continue

    for (const rail of rails) {
      const lift = postHeight * rail + rng.range(-0.02, 0.02)

      strut(
        parts, rng, rng.next() > 0.6 ? palette.woodDark : palette.wood,
        a.x, a.y + lift, a.z,
        b.x, b.y + lift, b.z,
        0.045, 0.15,
      )
    }
  }
}

/**
 * A continuous split-rail fence (riukuaita) following a line on the ground.
 *
 * Posts are plumb and sit at whatever height the ground is under each one;
 * rails span from post to post, so they pitch with the terrain on their own.
 * That split is the whole point — a fence built from rigid identical segments
 * either floats over dips or, if each segment is tilted to match its patch of
 * ground, zig-zags where neighbours disagree. Real fences do neither.
 *
 * @returns One merged, world-space, vertex-coloured geometry. The caller owns it.
 */
export function buildFenceRun ({
  points,
  heightAt,
  rng,
  palette,
  spacing = 2.2,
  postHeight = 1.35,
  rails = RAILS,
  closed = false,
  minHeight = -Infinity,
}: FenceRunOptions): BufferGeometry | null {
  if (points.length < 2)
    return null

  const parts: BufferGeometry[] = []
  const posts                   = resamplePath(points, spacing, closed)
    .map(point => ({ ...point, y: heightAt(point.x, point.z) }))

  raisePosts(parts, posts, rng, palette, postHeight, minHeight)
  spanRails(parts, posts, rng, palette, postHeight, rails, spacing, minHeight)

  return parts.length > 0
    ? mergeParts(parts)
    : null
}

// perf: one merged geometry for a whole run, however long. Built once, and the
// posts resolve their own ground height so nothing floats.
