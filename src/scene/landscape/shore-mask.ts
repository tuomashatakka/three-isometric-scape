import { DataTexture, LinearFilter, RGBAFormat } from 'three'
import type { ScapeConfig } from '../config.ts'
import type { HeightField } from './height.ts'
import { surveyRoosts } from './roost.ts'


/**
 * The bathymetry the lake is shaded from, the direction the sea lies in, and
 * where the tide has to hurry to get through.
 *
 * One map, three facts. `r` is how deep the water is, which is what the depth
 * tint, the alpha ramp, the ice front and the foam trim have always read. `g`
 * and `b` are the **seaward direction** at that point — a unit vector in the
 * ground plane pointing from the bank out toward open water. `a` is **how tight
 * a gate this water is in**, which is what the roost reads — see `roost.ts`.
 *
 * All three used to be channels of nothing: the bake wrote the same depth byte
 * into `r`, `g` and `b` and 255 into `a`, so three quarters of a 512² upload
 * carried a copy of the first quarter. Putting the shore's own bearing in two
 * of them is what lets the surf ask which way a coast faces without a second
 * fetch, a second map or a per-fragment gradient; putting the gates in the last
 * one is what lets the sound break at half ebb without a map of its own. The
 * tap the water was already making now answers all three questions at once.
 *
 * Derived from the depth grid rather than from the height field a second time.
 * A central difference over the grid costs four array reads per texel; four
 * more `heightAt` calls would cost a million samples of the composite field,
 * which is the expensive half of a build.
 *
 * How many texels there are is the tier's — see `quality.shoreMask`. The mask
 * used to be a fixed 512 chosen against a 196-metre world, and the world is
 * eight times that now.
 */
export const SHORE_RESOLUTION = 512

/**
 * Metres of water the depth channel resolves before it saturates.
 *
 * Everything that reads the mask reads it as a fraction of this, so it is the
 * scale a depth in metres is converted through — see `water.surfDepth`.
 */
export const MAX_DEPTH = 3.2

/** Pack a −1..1 component into a byte. */
function encodeUnit (value: number): number {
  return Math.round(Math.min(255, Math.max(0, (value * 0.5 + 0.5) * 255)))
}

/**
 * Unpack what {@link encodeUnit} wrote.
 *
 * Exported because the shader's `shore.gb * 2.0 - 1.0` is this function, and a
 * test that decoded the bytes its own way would be checking its own arithmetic
 * rather than the thing the gpu will actually read.
 */
export function decodeUnit (byte: number): number {
  return byte / 255 * 2 - 1
}

/**
 * How deep the water stands over every texel, as a fraction of {@link MAX_DEPTH}.
 *
 * Split out from the bake below because two things now want it and only one of
 * them wants a texture: the mask packs it into a byte, and the roost search
 * reads it as the plan of the coast — dry is 0 and everything over it is water.
 * Building it twice would be the expensive half of the bake paid twice, since
 * this is the loop that actually samples the composite height field.
 */
export function bakeDepthGrid (
  config: ScapeConfig,
  field:  HeightField,
  span:   number,
  size:   number = SHORE_RESOLUTION,
): Float32Array {
  const step  = span / (size - 1)
  const depth = new Float32Array(size * size)

  for (let row = 0; row < size; row += 1)
    for (let column = 0; column < size; column += 1) {
      const x = -span / 2 + column * step
      const z = -span / 2 + row * step

      depth[row * size + column] = Math.min(
        1,
        Math.max(0, (config.terrain.waterLevel - field.heightAt(x, z)) / MAX_DEPTH),
      )
    }

  return depth
}

/**
 * The mask as bytes, before it is a texture.
 *
 * Split out so the bake can be tested at all: a `DataTexture` is a handle with
 * an image behind it, and reaching into `texture.image.data` to state a fact
 * about the shoreline is the kind of test that breaks when three changes how it
 * stores one.
 */
export function bakeShoreData (
  config: ScapeConfig,
  field:  HeightField,
  span:   number,
  size:   number = SHORE_RESOLUTION,
): Uint8Array {
  const depth = bakeDepthGrid(config, field, span, size)
  const roost = surveyRoosts(depth, size, span, config.roost).field
  const data  = new Uint8Array(size * size * 4)
  const at    = (column: number, row: number): number =>
    depth[Math.min(size - 1, Math.max(0, row)) * size + Math.min(size - 1, Math.max(0, column))]

  for (let row = 0; row < size; row += 1)
    for (let column = 0; column < size; column += 1) {
      const index = (row * size + column) * 4

      // Which way the water gets deeper. Central differences, clamped at the
      // border where the composite field is already deep seabed and the
      // gradient is zero anyway. Deep water saturates the depth channel, so the
      // vector goes to zero out there — which is correct rather than merely
      // cheap: open sea has no shore to face.
      const gradientX = at(column + 1, row) - at(column - 1, row)
      const gradientZ = at(column, row + 1) - at(column, row - 1)
      const length    = Math.hypot(gradientX, gradientZ)
      const seaward   = length > 1e-6 ? 1 / length : 0

      data[index]     = Math.round(depth[row * size + column] * 255)
      data[index + 1] = encodeUnit(gradientX * seaward)
      data[index + 2] = encodeUnit(gradientZ * seaward)

      // Unsigned, unlike the two above it: a gate is a strength rather than a
      // bearing, so it uses the whole byte rather than half of one.
      data[index + 3] = Math.round(roost[row * size + column] * 255)
    }

  return data
}

/** The mask, on the gpu. Linear, unmipped — see the note in `water.ts`. */
export function bakeShoreMask (
  config: ScapeConfig,
  field:  HeightField,
  span:   number,
  size:   number = SHORE_RESOLUTION,
): DataTexture {
  const texture = new DataTexture(bakeShoreData(config, field, span, size), size, size, RGBAFormat)

  texture.name        = 'water.shoreMask'
  texture.minFilter   = LinearFilter
  texture.magFilter   = LinearFilter
  texture.needsUpdate = true
  return texture
}
