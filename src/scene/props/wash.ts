import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { box, cyl, deg, mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'
import { hypot } from '../hypot.ts'


/**
 * The washing line and what is pegged to it.
 *
 * Two builders in one file for the hjell's reason: one subject, one set of
 * offsets. The line is a parametric run in its own frame — posts at `±length/2`
 * along local `x`, rope sagging between them — raised once per farm and merged
 * into the steading. The cloth is a pure prop stamped through one
 * `InstancedMesh`, and like the stockfish it *hangs* from `y = 0`: the origin
 * is the rope, the pegs straddle it, the cloth falls away below.
 */

/** Width and drop of the cloth as built, in metres. Instances scale from these. */
export const LINEN_WIDTH = 0.8
export const LINEN_DROP  = 0.7

/** How far the rope sags at the middle, as a share of its length. */
export const WASH_SAG = 0.035

/** How far a post is driven into the ground, in metres. */
const EMBED = 0.3

/**
 * Height of the rope over the posts' feet at a share `t` (0..1) of the way
 * along — a parabola, which over a span this short is a catenary to the
 * millimetre. One function so the rope drawn and the pegs hung agree.
 */
export function washRopeAt (height: number, length: number, t: number): number {
  return height - WASH_SAG * length * 4 * t * (1 - t)
}

export interface WashLineOptions {
  length:  number
  height:  number
  rng:     SeededRng
  palette: NordicPalette
}

/**
 * Two T-posts and the rope between them, base at `y = 0`.
 *
 * The rope is segmented rather than one straight box so the sag reads at close
 * zoom; eight segments is where it stops looking like a hinge.
 */
export function buildWashLine ({ length, height, rng, palette }: WashLineOptions): BufferGeometry {
  const parts: BufferGeometry[] = []
  const half                    = length / 2

  for (const side of [ -1, 1 ]) {
    parts.push(part(cyl(0.05, 0.065, height + EMBED + 0.12, 6), {
      at: [ side * half, (height + 0.12 - EMBED) / 2, 0 ], color: palette.woodDark, jitter: 0.1, rng,
    }))
    // The crosstree, square to the rope — what turns a stake into a line post.
    parts.push(part(box(0.06, 0.06, 0.62), {
      at: [ side * half, height + 0.04, 0 ], color: palette.wood, jitter: 0.1, rng,
    }))
    // A strut kicked out behind each post, which is what keeps one upright
    // under a line of wet sheets.
    parts.push(part(box(0.045, 1.1, 0.045), {
      at:     [ side * (half + 0.32), 0.42, 0 ],
      rotate: [ 0, 0, deg(side * 32) ],
      color:  palette.woodDark,
      jitter: 0.1,
      rng,
    }))
  }

  const SEGMENTS = 8

  for (let step = 0; step < SEGMENTS; step++) {
    const t0 = step / SEGMENTS,
      t1     = (step + 1) / SEGMENTS
    const x0 = -half + t0 * length,
      x1     = -half + t1 * length
    const y0 = washRopeAt(height, length, t0),
      y1     = washRopeAt(height, length, t1)

    parts.push(part(box(hypot(x1 - x0, y1 - y0) + 0.01, 0.018, 0.018), {
      at:     [ (x0 + x1) / 2, (y0 + y1) / 2, 0 ],
      rotate: [ 0, 0, Math.atan2(y1 - y0, x1 - x0) ],
      color:  palette.trimShadow,
      jitter: 0.04,
      rng,
    }))
  }

  return mergeParts(parts, { grime: 1.6, grimeFloor: 0.55 })
}

/**
 * One cloth pegged over the rope.
 *
 * Three panels set at alternating angles rather than one flat card: a sheet on
 * a line is never flat, it hangs in soft vertical folds, and the zig-zag is
 * what makes the light break across it into bands at every sun. Thin boxes
 * rather than planes, so both faces are lit with the shared single-sided
 * material. Painted white; the instance colour is what makes it a blue shirt
 * or a red rag, so one geometry serves the whole line.
 */
export function buildLinen (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const panel                   = LINEN_WIDTH / 3
  const fold                    = deg(rng.range(14, 22))

  for (const [ index, sense ] of [ -1, 1, -1 ].entries()) {
    const width = panel / Math.cos(fold)

    parts.push(part(box(width, LINEN_DROP, 0.012), {
      at:     [ (index - 1) * panel, -LINEN_DROP / 2, sense * Math.tan(fold) * panel * 0.25 ],
      rotate: [ 0, sense * fold, 0 ],
      color:  palette.trimWhite,
      jitter: 0.05,
      rng,
    }))
  }

  // The hem folded over the rope, and the two pegs that hold it.
  parts.push(part(box(LINEN_WIDTH, 0.05, 0.03), {
    at: [ 0, -0.01, 0 ], color: palette.trimShadow, jitter: 0.05, rng,
  }))
  for (const side of [ -1, 1 ])
    parts.push(part(box(0.025, 0.08, 0.04), {
      at: [ side * LINEN_WIDTH * 0.4, 0.01, 0 ], color: palette.woodLight, jitter: 0.1, rng,
    }))

  return mergeParts(parts, { grime: 0.6, grimeFloor: 0.8 })
}
