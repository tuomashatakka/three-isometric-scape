import { DataTexture, LinearFilter, RGBAFormat } from 'three'
import type { ScapeConfig } from '../config.ts'
import type { HeightField } from './height.ts'


/**
 * The bathymetry the lake is shaded from, and the direction the sea lies in.
 *
 * One map, two facts. `r` is how deep the water is, which is what the depth
 * tint, the alpha ramp, the ice front and the foam trim have always read. `g`
 * and `b` are the **seaward direction** at that point — a unit vector in the
 * ground plane pointing from the bank out toward open water.
 *
 * The second one used to be three channels of nothing: the bake wrote the same
 * depth byte into `r`, `g` and `b` and 255 into `a`, so two thirds of a 512²
 * upload carried a copy of the first third. Putting the shore's own bearing
 * there is what lets the surf ask which way a coast faces without a second
 * fetch, a second map or a per-fragment gradient — the tap the water was
 * already making now answers both questions at once.
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

  const data = new Uint8Array(size * size * 4)
  const at   = (column: number, row: number): number =>
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
      data[index + 3] = 255
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
