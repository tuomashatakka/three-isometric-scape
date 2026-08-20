/**
 * A normal map, derived from a height field the scape already has.
 *
 * The ground grain used to reach the lighting as a *finite difference*: three
 * fetches of `ground.grain` at a fixed uv offset, subtracted in the fragment
 * shader, and three more of `ground.wear` for the broad octave. Six dependent
 * texture reads to describe a surface that never changes, recomputed for every
 * lit fragment of every frame — and, because the difference was assembled as
 * `(+dh/dx, 0, +dh/dz)` rather than `(-dh/dx, 1, -dh/dz)`, six reads spent
 * describing the *inverse* of the surface they were sampled from. Grit lit as
 * pitting.
 *
 * Baking it is strictly better on both counts. The gradient is computed once, at
 * full texel resolution rather than across a seven-texel stride, with the sign
 * the physics has; the shader reads one texel and is done.
 *
 * Deliberately pure — bytes in, bytes out, no `three` and no DOM. The
 * `DataTexture` around the result belongs to `catalogue.ts`, which is the one
 * place in the scape allowed to put a map on the gpu.
 */

/**
 * How hard the baked gradient leans.
 *
 * Chosen against the six-tap difference it replaces rather than by eye:
 * `normals.test.ts` measures the mean perturbation both formulas produce over
 * the real grain field and holds them within a fifth of each other, so the
 * ground is lit by the same amount of relief it always was — the right way up.
 */
export const GRAIN_RELIEF = 7.6

/**
 * What the fragment shader multiplies the fetched tangent by.
 *
 * Exported so the shader and the test that pins it cannot drift apart. The two
 * constants only mean anything as a product.
 */
export const GROUND_NORMAL_GAIN = 2.55

/** Encode one component of a unit normal into a byte. */
function encode (value: number): number {
  return Math.max(0, Math.min(255, Math.round((value * 0.5 + 0.5) * 255)))
}

/**
 * Turn a height field into a tangent-space normal map.
 *
 * @param source - RGBA bytes whose red channel is the height, row-major.
 * @param size - Texels per side.
 * @param relief - How hard the gradient leans. See {@link GRAIN_RELIEF}.
 * @returns RGBA bytes: `rgb` the encoded unit normal, `a` the height it came
 *   from — carried along because the parallax march needs a height and reading
 *   it out of the map that already has to be bound is one fetch rather than two.
 *
 * @remarks The wrap is modulo `size - 1`, not `size`. `createSeamlessNoiseTexture`
 * samples `x / (size - 1)`, so its last row and column are exact duplicates of
 * its first — wrapping at `size` would put two identical texels next to each
 * other and lay a seam of dead-flat normal across every repeat of the tile.
 */
export function normalFromHeight (
  source: Uint8Array,
  size:   number,
  relief = GRAIN_RELIEF,
): Uint8Array {
  const out    = new Uint8Array(size * size * 4)
  const period = Math.max(1, size - 1)

  const heightAt = (x: number, y: number): number =>
    source[((y % period + period) % period * size + (x % period + period) % period) * 4] / 255

  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      // Central differences, in heights per texel. A one-sided difference biases
      // every slope half a texel downhill, which over a tiling map shows up as a
      // constant lean the light picks out as a direction the ground does not have.
      const dx = (heightAt(x + 1, y) - heightAt(x - 1, y)) * 0.5 * relief
      const dy = (heightAt(x, y + 1) - heightAt(x, y - 1)) * 0.5 * relief

      // The surface normal of a height field is `(-dh/dx, 1, -dh/dz)`. The minus
      // signs are the whole correction: a bump has to tip its normal *away* from
      // the rising side, and the difference this replaces tipped it toward.
      const length = Math.hypot(-dx, -dy, 1)
      const index  = (y * size + x) * 4

      out[index]     = encode(-dx / length)
      out[index + 1] = encode(-dy / length)
      out[index + 2] = encode(1 / length)
      out[index + 3] = source[(y * size + x) * 4]
    }

  return out
}
