/**
 * Bake a procedural alpha field into a `DataTexture`.
 *
 * Three atmosphere layers — mist, cloud deck, aurora veil — each paint a
 * different noise into the same shape: a square `Uint8Array`, a
 * `DataTexture` wrapping it, and the same filtering and mip setup. The
 * noise and the falloff curve are deliberate per layer; only the texture
 * construction and its settings repeat. This helper takes the size and a
 * sampler callback and returns the finished texture, so the call sites
 * keep their own noise and nothing else.
 */
import {
  DataTexture,
  LinearFilter,
  MirroredRepeatWrapping,
  RGBAFormat,
} from 'three'
import type { ColorSpace, Texture, Wrapping } from 'three'


export interface AlphaFieldOptions {
  wrap?:       Wrapping
  colorSpace?: ColorSpace
}

export function bakeAlphaField (
  size: number,
  sampler: (field: Uint8Array) => void,
  options?: AlphaFieldOptions,
): Texture {
  const field = new Uint8Array(size * size * 4)

  sampler(field)

  const texture     = new DataTexture(field, size, size, RGBAFormat)
  texture.wrapS     = options?.wrap ?? MirroredRepeatWrapping
  texture.wrapT     = options?.wrap ?? MirroredRepeatWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  if (options?.colorSpace)
    texture.colorSpace = options.colorSpace
  texture.needsUpdate = true

  return texture
}
