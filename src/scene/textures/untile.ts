/**
 * A tiling map read so that the tile stops showing.
 *
 * ## the finding
 *
 * `weather-bank.ts` stopped the *cloud cover* repeating, and the readme took
 * that as the sky no longer repeating. It did not: the bank biases where the
 * cut is crossed, but every comma it lets through is still the same 92 m tile,
 * stamped on the same perfect lattice. At `default` the ground under the shower
 * was sixteen rows of identical prints, and the sea beside it was forty-five rows
 * of a 34 m ripple tile through the albedo sheen — a figure you could count from
 * the frame. Wallpaper is the one thing a photograph of a coast never contains,
 * so it was the single loudest thing in the scape that said "rendered".
 *
 * ## what it is
 *
 * The same map read twice: once where it always was, and once on a second
 * lattice turned by {@link UNTILE_TURN} and scaled by {@link UNTILE_RATIO}. The
 * sum of two periodic fields is periodic only where *both* lattices come back
 * together, and these two were chosen — by search, not by taste — so that inside
 * a frame's reach they never do: `untile.test.ts` states that as a fact about the
 * lattices rather than about a picture.
 *
 * The two reads are summed around the mean and divided by √2, not averaged.
 * Averaging two independent noises keeps the mean and loses a third of the
 * contrast, which would quietly thin every cloud the shadow cuts and flatten
 * every sheen it textures; the √2 keeps the spread, so the cut is crossed as
 * often as before and coverage does not move. That is the cheap half of
 * Heitz & Neyret's histogram-preserving blend, and for a field whose histogram
 * is already roughly gaussian it is the half that matters.
 *
 * Pure and free of `three`, so the test and `scape:map` can reason about the
 * lattices without a gl context.
 */

/** The second lattice's turn, in radians — 23.5°. */
export const UNTILE_TURN = 23.5 * Math.PI / 180

/** The second lattice's tile, as a multiple of the first's frequency. */
export const UNTILE_RATIO = 0.73

/**
 * Where the second lattice starts, in tiles, so the two do not share an origin
 * — a shared origin is a point the eye finds and the pattern radiates from.
 */
export const UNTILE_SHIFT: readonly [number, number] = [ 0.37, 0.61 ]

/** The second read's uv for a first read at `(u, v)`, in tiles. */
export function untiledUv (u: number, v: number): [number, number] {
  const c = Math.cos(UNTILE_TURN) * UNTILE_RATIO
  const s = Math.sin(UNTILE_TURN) * UNTILE_RATIO

  return [ c * u - s * v + UNTILE_SHIFT[0], s * u + c * v + UNTILE_SHIFT[1] ]
}

/**
 * How close, in tiles, the second lattice comes to repeating with the first
 * anywhere within `reach` tiles.
 *
 * The first read repeats at every integer offset, so the pair can only repeat
 * at one; there it repeats exactly when the second read's uv moved by an integer
 * too. This is the distance from the nearest such near-miss to a true repeat —
 * zero is wallpaper again, and a tenth of a tile is a field the eye cannot match
 * against itself.
 */
export function nearestRepeat (reach: number): number {
  const [ ox, oy ] = untiledUv(0, 0)
  let nearest      = Infinity

  for (let i = -reach; i <= reach; i++)
    for (let j = 0; j <= reach; j++) {
      if (j === 0 && i <= 0 || i * i + j * j > reach * reach)
        continue

      const [ x, y ] = untiledUv(i, j)
      const dx       = x - ox
      const dy       = y - oy

      nearest = Math.min(nearest, Math.hypot(dx - Math.round(dx), dy - Math.round(dy)))
    }

  return nearest
}

const turnC = (Math.cos(UNTILE_TURN) * UNTILE_RATIO).toFixed(6)
const turnS = (Math.sin(UNTILE_TURN) * UNTILE_RATIO).toFixed(6)

/**
 * `scapeUntiled(map, uv)` — the red channel of `map` at `uv`, with the tile
 * gone. One extra fetch per call, off a sampler already bound.
 *
 * `mat2` is column-major, so the literal below is the rotation
 * {@link untiledUv} writes out row by row. Guarded, because the lake compiles
 * the cloud shadow's chunk and its own, and both ask for this.
 */
export const UNTILE_GLSL = /* glsl */`
#ifndef SCAPE_UNTILED
#define SCAPE_UNTILED
  float scapeUntiled (sampler2D map, vec2 uv) {
    vec2 turned = mat2(${turnC}, ${turnS}, -${turnS}, ${turnC}) * uv
      + vec2(${UNTILE_SHIFT[0].toFixed(2)}, ${UNTILE_SHIFT[1].toFixed(2)});
    float first  = texture2D(map, uv).r;
    float second = texture2D(map, turned).r;
    return 0.5 + (first + second - 1.0) * 0.7071;
  }
#endif
`
