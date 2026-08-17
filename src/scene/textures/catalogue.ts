import { LinearFilter, LinearMipmapLinearFilter, RepeatWrapping } from 'three'
import type { Texture } from 'three'
import { createNoiseTexture, createSeamlessNoiseTexture } from 'threejs-scene/modules/assets'


/**
 * Every texture in the scape, in one list.
 *
 * The problem this solves is finding them. Procedural maps were being built
 * where they happened to be needed — a seamless noise in `material.ts`, two more
 * in `water.ts`, a baked field in each of `mist`, `clouds`, `aurora` — with the
 * size, frequency and wrap mode written out again each time and no way to answer
 * "what does this scape sample, and how much of it is there" short of grepping
 * for `Texture`. Two of them were the same noise at two sizes and neither knew
 * about the other.
 *
 * So: one catalogue. Every *tiling* map is built here and shared, so a second
 * consumer costs a lookup rather than another upload. Every map that is **baked
 * from the survey** stays where its data comes from — a bathymetry mask belongs
 * next to the height field it samples — but it is still registered here, with
 * the module that owns it, so this list is the whole answer either way.
 *
 * Adding a texture anywhere in `src/scene` means adding an entry here. The
 * `catalogue.test.ts` roster test is what makes that a rule rather than a wish:
 * it walks the scene source for texture constructors and fails on one this file
 * has never heard of.
 */
export type TextureId =
  'ground.grain' | 'ground.wear' | 'prop.bark' | 'sky.cloudShadow' |
  'water.ripple' | 'water.wave' | 'water.shoreMask' |
  'sky.deck' | 'sky.aurora' | 'sky.gradient' | 'mist.field' | 'post.lut'

/**
 * Where a texture's pixels come from.
 *
 * `catalogue` is built here, on demand, and shared by every consumer that asks
 * for it. `baked` is derived from the survey by the module named in `module`,
 * and is only ever useful there — so it stays next to the data it is made of and
 * is registered here rather than moved.
 */
export type TextureOrigin = 'catalogue' | 'baked'

export interface TextureEntry {
  id:     TextureId
  origin: TextureOrigin

  /** What it is, in a line. */
  purpose: string

  /** Texels per side. */
  size: number

  /** The module that builds it, relative to `src/scene`. */
  module: string

  /** The uniforms or material slots it reaches the gpu through. */
  consumers: readonly string[]
}

/**
 * The roster.
 *
 * Ordered by where it lands in the frame — ground first, then water, then the
 * things in the air, then the grade the whole picture goes through.
 */
export const TEXTURES: readonly TextureEntry[] = [
  {
    id:        'ground.grain',
    origin:    'catalogue',
    purpose:   'fine soil grit — albedo mottle, roughness break-up and the normal perturbation taken as its finite difference',
    size:      512,
    module:    'textures/catalogue.ts',
    consumers: [ 'uDetailMap' ],
  },
  {
    id:        'ground.wear',
    origin:    'catalogue',
    purpose:   'metre-wide damp and wear patches under the grit, so the fine octave never tiles into a visible weave',
    size:      256,
    module:    'textures/catalogue.ts',
    consumers: [ 'uWearMap' ],
  },
  {
    id:        'prop.bark',
    origin:    'catalogue',
    purpose:   'stretched grain for timber, trunks and planking — read along the surface rather than across it',
    size:      256,
    module:    'textures/catalogue.ts',
    consumers: [ 'uBarkMap' ],
  },
  {
    id:        'sky.cloudShadow',
    origin:    'catalogue',
    purpose:   'the drifting shadow map both scape materials darken by',
    size:      256,
    module:    'textures/catalogue.ts',
    consumers: [ 'uCloudMap' ],
  },
  {
    id:        'water.ripple',
    origin:    'catalogue',
    purpose:   'speckled tint on the lake surface — mipmapped, because a sharp one aliases into specks the god rays then smear into streaks',
    size:      128,
    module:    'textures/catalogue.ts',
    consumers: [ 'uRippleMap' ],
  },
  {
    id:        'water.wave',
    origin:    'catalogue',
    purpose:   'fractal value noise the lake shades from — neighbouring texels agree which way the surface leans',
    size:      256,
    module:    'textures/catalogue.ts',
    consumers: [ 'uWaveMap' ],
  },
  {
    id:        'water.shoreMask',
    origin:    'baked',
    purpose:   'bathymetry and shoreline distance, sampled off the height field',
    size:      256,
    module:    'landscape/water.ts',
    consumers: [ 'uShoreMap' ],
  },
  {
    id:        'sky.deck',
    origin:    'baked',
    purpose:   'the cloud deck overhead',
    size:      256,
    module:    'clouds.ts',
    consumers: [ 'map' ],
  },
  {
    id:        'sky.aurora',
    origin:    'baked',
    purpose:   'the auroral veils, one field stacked at several depths',
    size:      256,
    module:    'aurora.ts',
    consumers: [ 'map' ],
  },
  {
    id:        'sky.gradient',
    origin:    'baked',
    purpose:   'the sky ramp, one column resolved per step of the day',
    size:      64,
    module:    'atmosphere.ts',
    consumers: [ 'map' ],
  },
  {
    id:        'mist.field',
    origin:    'baked',
    purpose:   'the ground mist sheet, cut by the island mask',
    size:      256,
    module:    'mist.ts',
    consumers: [ 'map' ],
  },
  {
    id:        'post.lut',
    origin:    'baked',
    purpose:   'the colour grade, one 3d lut per named grade, cached on first use',
    size:      32,
    module:    'lut.ts',
    consumers: [ 'LUTPass' ],
  },
]

export interface TextureCatalogue {

  /** The shared instance, built on first ask. */
  get(id: TextureId): Texture

  /** What has actually been built, for the diagnostics log. */
  describe(): string
  dispose(): void
}

/** Tiling maps repeat; that is the one thing every one of them has in common. */
function tiled (texture: Texture): Texture {
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  return texture
}

/**
 * Mipmapped as well as tiled.
 *
 * For anything sampled at roughly one texel per pixel. Without the chain a noise
 * map at that density aliases into a field of bright specks — and the god-ray
 * pass then smears every speck into a streak along the sun vector, which is
 * where the lake's vertical bright lines came from.
 */
function mipped (texture: Texture): Texture {
  tiled(texture)
  texture.generateMipmaps = true
  texture.minFilter       = LinearMipmapLinearFilter
  texture.magFilter       = LinearFilter
  texture.needsUpdate     = true
  return texture
}

/**
 * The builders, one per catalogue-owned entry.
 *
 * Each takes the scape seed and forks it with its own constant, so the maps stay
 * independent: retuning one does not reshuffle the others, and two of them never
 * accidentally become the same noise.
 */
const BUILDERS: Record<string, (seed: number) => Texture> = {
  'ground.grain': seed =>
    tiled(createSeamlessNoiseTexture({ size: 512, seed: seed ^ 0x77c1, frequency: 12, octaves: 5 })),

  // Deliberately its own noise rather than the grain read at a low frequency,
  // which is what it used to be. The same field at two scales is self-similar by
  // construction, so the broad octave landed its patches exactly where the fine
  // one already had its darkest grit and the two reinforced into a lumpy weave
  // instead of reading as separate history. Few octaves, because wear is smooth.
  'ground.wear': seed =>
    tiled(createSeamlessNoiseTexture({ size: 256, seed: seed ^ 0x1d33, frequency: 3, octaves: 3 })),

  // Two octaves, not four. Octaves average toward the mean, and the prop grain
  // has one fetch to work with rather than the ground's six plus a finite
  // difference — so it needs the contrast in the map rather than in the read.
  'prop.bark': seed =>
    tiled(createSeamlessNoiseTexture({ size: 256, seed: seed ^ 0x5ae9, frequency: 14, octaves: 2 })),

  'sky.cloudShadow': seed =>
    tiled(createSeamlessNoiseTexture({ size: 256, seed, frequency: 3, octaves: 4 })),

  'water.ripple': seed =>
    mipped(createNoiseTexture({ size: 128, seed: seed ^ 0x2f1a, monochrome: true, lift: 0.1 })),

  'water.wave': seed =>
    mipped(createSeamlessNoiseTexture({ size: 256, seed: seed ^ 0x51b7, frequency: 5, octaves: 4 })),
}

/** Every id the catalogue builds itself, in roster order. */
export const CATALOGUE_TEXTURES: readonly TextureId[] = TEXTURES
  .filter(entry => entry.origin === 'catalogue')
  .map(entry => entry.id)

/**
 * One catalogue per scape.
 *
 * Lazy, because a tier that skips the ground grain should not pay to generate
 * it, and disposed as a unit — the scape's textures outlive individual materials
 * but not the scape, so there is exactly one place that frees them.
 */
export function createTextureCatalogue (seed: number): TextureCatalogue {
  const built = new Map<TextureId, Texture>()

  return {
    get (id) {
      const cached = built.get(id)

      if (cached)
        return cached

      const build = BUILDERS[id]

      if (!build)
        throw new Error(`texture ${id} is baked by its own module, not built by the catalogue`)

      const texture = build(seed)

      texture.name = id
      built.set(id, texture)
      return texture
    },

    describe () {
      const total = [ ...built ].reduce((bytes, [ id, texture ]) => {
        const entry = TEXTURES.find(candidate => candidate.id === id)
        void texture

        // Four bytes a texel, and a third again for the mip chain where there is
        // one. Approximate on purpose: the point is the order of magnitude.
        return bytes + (entry ? entry.size * entry.size * 4 * 1.34 : 0)
      }, 0)

      return `${built.size}/${CATALOGUE_TEXTURES.length} shared textures · ~${Math.round(total / 1024)}kb`
    },

    dispose () {
      for (const texture of built.values())
        texture.dispose()
      built.clear()
    },
  }
}
