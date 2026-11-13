import type { BufferGeometry } from 'three'

/**
 * No two of a kind the same colour.
 *
 * Every scattered family is one geometry in one set of vertex colours, stamped
 * hundreds of times. A grey shade per instance made some darker than others,
 * but a stand of spruce was still one green at several brightnesses — the look
 * of a rubber stamp. A real stand runs from yellow-green in the open to
 * blue-green in the shade of its neighbours, and a bank of heather is never one
 * purple.
 *
 * So the per-instance tint leans, warm or cool, as well as shading. The lean is
 * scaled by how much colour the family has in the first place
 * ({@link familyChroma}): a spruce takes all of it, a boulder almost none — a
 * grey stone tinted amber would stop reading as stone, and would stop
 * weathering, which keys on neutral grey. It rides the instance colour the
 * scatter already carried, so it costs no draw, no program and no attribute,
 * and it reaches every tier.
 *
 * The lean is a hash of where the instance stands, not a draw from the rng:
 * the placement stream is byte-for-byte what it was.
 */

/** The most the lean moves red and blue, either way, on a fully coloured family. */
export const LEAN_RED  = 0.15
export const LEAN_BLUE = 0.2

/** Mean relative chroma (max − min over max) under which a family takes no lean, and over which it takes all of it. */
export const CHROMA_RANGE = [ 0.2, 0.5 ] as const

/** `-1..1`, the same for the same spot, unrelated between spots a hand apart. */
export function spotHash (x: number, z: number): number {
  let h = Math.imul(Math.round(x * 64) | 0, 0x9e3779b1) ^ Math.imul(Math.round(z * 64) | 0, 0x85ebca6b)

  h = Math.imul(h ^ h >>> 15, 0x2c1b3c6d)
  h = Math.imul(h ^ h >>> 12, 0x297a2d39)
  h ^= h >>> 15

  return (h >>> 0) / 0x7fffffff - 1
}

/**
 * How much of the lean a family takes, `0..1`: the mean relative chroma of its vertex
 * colours, through {@link CHROMA_RANGE}. A geometry with no colours takes none.
 */
export function familyChroma (geometry: BufferGeometry): number {
  const colour = geometry.getAttribute('color')

  if (!colour || colour.count === 0)
    return 0

  let sum = 0

  for (let index = 0; index < colour.count; index += 1) {
    const r = colour.getX(index)
    const g = colour.getY(index)
    const b = colour.getZ(index)

    const peak = Math.max(r, g, b)

    // Relative, because the colours are linear and a conifer's are dark: its
    // green is two thirds of its brightest channel and a twentieth of white.
    sum += peak > 1e-4 ? (peak - Math.min(r, g, b)) / peak : 0
  }

  const t = Math.min(1, Math.max(0, (sum / colour.count - CHROMA_RANGE[0]) / (CHROMA_RANGE[1] - CHROMA_RANGE[0])))

  return t * t * (3 - 2 * t)
}

const hex = (value: number): string => Math.min(255, Math.max(0, Math.round(value * 255))).toString(16)
  .padStart(2, '0')

/**
 * The tint of the instance at `(x, z)`: its grey `shade` (about 1), leaned warm
 * or cool by `chroma` of the full lean. Green is the anchor, so the shade keeps
 * its lightness whichever way the instance leans.
 */
export function instanceTone (shade: number, x: number, z: number, chroma: number): string {
  const lean = spotHash(x, z) * chroma

  return `#${hex(shade * (1 + LEAN_RED * lean))}${hex(shade)}${hex(shade * (1 - LEAN_BLUE * lean))}`
}
