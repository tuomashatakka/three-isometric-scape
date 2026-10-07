import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { box, mergeParts, part } from 'threejs-scene/modules/assets'
import { resamplePath, strut } from './fence.ts'
import type { FencePoint } from './fence.ts'
import type { NordicPalette } from './palette.ts'


/**
 * A snow fence: posts, two rails and a bay of laths between each pair.
 *
 * The fourth parametric run in this directory — after the split-rail fence, the
 * drystone wall and the weir's band — and it takes their shape for their
 * reason: a line on the ground, resampled to a station spacing, with each
 * station standing at whatever height the ground is under it. A fence built
 * from rigid identical segments either floats over the dips or zig-zags where
 * two neighbouring segments disagree about the slope, and a snow fence stands
 * on the most open ground on the island, which is where the dips are.
 *
 * **It is not `buildFenceRun` with more rails in it.** A stock fence is built
 * to stop an animal and is as solid as the timber allows; this one is built to
 * stop *air*, and everything that makes it look different is that difference
 * doing its job:
 *
 * - **the gaps are the structure.** A solid board fence throws a shorter and
 *   steeper drift than a gappy one and scours a trench at its own foot — about
 *   half open is what a snow fence is for. So the laths are set with a lath's
 *   width of daylight between them, and the count per bay is the tier's handle
 *   rather than a constant: see `AtmosphereQuality.fencePalings`.
 * - **the bottom gap is deliberate.** The run stands clear of the ground by a
 *   tenth of its own height, so the first bank to form passes under it instead
 *   of burying it in the first week of the winter it was built for.
 * - **the braces rake downwind.** The wind this is built against only ever
 *   pushes one way, so the leg that holds it up only ever goes on one side —
 *   which is the one piece of a fence that says, in a still, which way the
 *   weather on this island comes from.
 */

export interface SnowFenceRunOptions {

  /** The line, in world metres. Two points minimum. */
  points: readonly FencePoint[]

  /** Ground height, sampled per post and per lath. */
  heightAt(x: number, z: number): number

  /** How far the palings stand over the ground, in metres. */
  height: number

  /** Metres between posts. The run is resampled to this spacing. */
  spacing: number

  /** Laths per bay. 0 leaves the run railed and unclad. */
  palings: number

  /** The way the braces rake — downwind, as a unit vector on the ground plane. */
  lean: FencePoint

  /** Skip any station whose ground falls below this. @defaultValue -Infinity */
  minHeight?: number

  rng:     SeededRng
  palette: NordicPalette
}

/** Where the two rails sit, as fractions of the height. */
const RAILS = [ 0.26, 0.92 ]

/**
 * How far the cladding stands clear of the ground, as a share of the height.
 *
 * The bottom gap, and it is the one proportion here that is load-bearing rather
 * than decorative — see the note above. A tenth is what the handbooks give and
 * it is also what reads: much less and the run looks like a hoarding, much more
 * and it looks like a fence somebody forgot to finish.
 */
const CLEAR = 0.1

/** Lath width and thickness, in metres. The gap between two of them is the width. */
const LATH  = 0.085
const BOARD = 0.03

/** How far a post is driven below the ground, in metres. */
const DRIVEN = 0.18

/** Where on the post the brace is footed and where it lands, as shares of the height. */
const BRACE_HEAD = 0.72
const BRACE_FOOT = 0.62

/** One station of the run, with the ground under it already read. */
interface Post extends FencePoint {
  y: number
}

/** Posts, driven, and the raking leg behind each one. */
function raisePosts (
  parts:   BufferGeometry[],
  posts:   readonly Post[],
  options: SnowFenceRunOptions,
): void {
  const { height, lean, rng, palette } = options

  for (const post of posts) {
    strut(
      parts, rng, palette.tarWood,
      post.x, post.y - DRIVEN, post.z,
      post.x, post.y + height, post.z,
      0.062, 0.12,
    )

    // Downwind, and only downwind. The fence is pushed one way all winter.
    const footX = post.x + lean.x * height * BRACE_FOOT
    const footZ = post.z + lean.z * height * BRACE_FOOT

    strut(
      parts, rng, rng.next() > 0.5 ? palette.driftwoodDark : palette.woodDark,
      post.x, post.y + height * BRACE_HEAD, post.z,
      footX, options.heightAt(footX, footZ) - 0.08, footZ,
      0.042, 0.16,
    )
  }
}

/** The two rails, and the laths hung off them. */
function clad (
  parts:   BufferGeometry[],
  posts:   readonly Post[],
  options: SnowFenceRunOptions,
): void {
  const { height, spacing, palings, heightAt, rng, palette } = options
  const colors                                               = [ palette.driftwood, palette.driftwoodDark, palette.deadWood, palette.plank ]

  for (let index = 0; index < posts.length - 1; index += 1) {
    const a = posts[index]
    const b = posts[index + 1]

    // A gap wider than two spacings means the run stepped over refused ground,
    // and a rail spanning it would be a rail hanging in the air.
    if (Math.hypot(b.x - a.x, b.z - a.z) > spacing * 2)
      continue

    for (const rail of RAILS)
      strut(
        parts, rng, rng.next() > 0.55 ? palette.woodDark : palette.wood,
        a.x, a.y + height * rail, a.z,
        b.x, b.y + height * rail, b.z,
        0.038, 0.14,
      )

    const along = Math.atan2(b.z - a.z, b.x - a.x)

    for (let lath = 0; lath < palings; lath += 1) {
      // Inset by half a step at each end, so the daylight at a post is the same
      // daylight as the gaps — a lath landing on a post reads as a solid pier.
      const share = (lath + 0.5) / palings
      const x     = a.x + (b.x - a.x) * share
      const z     = a.z + (b.z - a.z) * share
      const foot  = heightAt(x, z) + height * CLEAR
      const rise  = a.y + height - foot

      if (rise <= 0)
        continue

      parts.push(part(box(BOARD, rise, LATH), {
        at:     [ x, foot + rise / 2, z ],
        rotate: [ 0, -along, rng.range(-0.03, 0.03) ],
        color:  rng.pick(colors),
        jitter: 0.16,
        rng,
      }))
    }
  }
}

/**
 * One snow fence, as a single geometry in world space.
 *
 * @returns One merged, world-space, vertex-coloured geometry, or `null` when
 *          the line was too short to stand anything on. The caller owns it.
 */
export function buildSnowFenceRun (options: SnowFenceRunOptions): BufferGeometry | null {
  const { points, heightAt, spacing, minHeight = -Infinity } = options

  if (points.length < 2 || spacing <= 0 || options.height <= 0)
    return null

  const parts: BufferGeometry[] = []
  const posts                   = resamplePath(points, spacing, false)
    .map(point => ({ ...point, y: heightAt(point.x, point.z) }))
    .filter(post => post.y >= minHeight)

  if (posts.length < 2)
    return null

  raisePosts(parts, posts, options)
  clad(parts, posts, options)

  return parts.length > 0
    ? mergeParts(parts)
    : null
}

// perf: one merged geometry for the whole run, joining the steading's single
// hero draw — a fenced island costs no draw call of its own on any tier. The
// lath count is `quality.fencePalings`, and zero leaves a railed run standing.
