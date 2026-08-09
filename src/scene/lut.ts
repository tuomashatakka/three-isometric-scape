import { Color } from 'three'
import type { Data3DTexture } from 'three'
import { createCinematicLUT } from 'threejs-scene/modules/post'
import type { GradeName } from './config.ts'


interface GradeRecipe {
  contrast:   number
  splitTone:  number
  saturation: number
  tint:       string
  amount:     number
  lift:       number
}

const RECIPES: Record<GradeName, GradeRecipe> = {
  natural:   { contrast: 1.04, splitTone: 0.2, saturation: 1.02, tint: '#ffffff', amount: 0, lift: 0 },
  cinematic: { contrast: 1.12, splitTone: 1, saturation: 1.08, tint: '#ffffff', amount: 0, lift: 0 },
  warm:      { contrast: 1.1, splitTone: 0.45, saturation: 1.14, tint: '#ffb765', amount: 0.45, lift: 0.015 },
  cool:      { contrast: 1.12, splitTone: 0.35, saturation: 0.92, tint: '#7fa6d8', amount: 0.5, lift: 0.02 },
  noir:      { contrast: 1.32, splitTone: 0.15, saturation: 0.12, tint: '#ffffff', amount: 0, lift: 0.01 },
  dream:     { contrast: 0.9, splitTone: 0.5, saturation: 1.2, tint: '#c8a6e8', amount: 0.4, lift: 0.055 },
}

const LUT_SIZE = 33
const tint     = new Color()

function tone (texture: Data3DTexture, recipe: GradeRecipe): void {
  if (recipe.amount <= 0 && recipe.lift <= 0)
    return

  const data = texture.image.data as Uint8Array
  tint.set(recipe.tint)

  const channels  = [ tint.r, tint.g, tint.b ]
  const brightest = Math.max(...channels, 1e-6)
  const gain      = channels.map(value => 1 + (value / brightest - 1) * recipe.amount)
  const floor     = recipe.lift * 255

  for (let offset = 0; offset < data.length; offset += 4)
    for (let channel = 0; channel < 3; channel += 1) {
      const cast             = data[offset + channel] * gain[channel]
      data[offset + channel] = Math.round(floor + cast * (1 - recipe.lift))
    }
  texture.needsUpdate = true
}

export interface GradeLUTs {
  get(grade: GradeName): Data3DTexture
  dispose(): void
}

export function createGradeLUTs (): GradeLUTs {
  const cache = new Map<GradeName, Data3DTexture>()

  return {
    get (grade) {
      const cached = cache.get(grade)
      if (cached)
        return cached

      const recipe  = RECIPES[grade]
      const texture = createCinematicLUT(LUT_SIZE, {
        contrast:   recipe.contrast,
        splitTone:  recipe.splitTone,
        saturation: recipe.saturation,
      })
      tone(texture, recipe)
      cache.set(grade, texture)
      return texture
    },

    dispose () {
      for (const texture of cache.values())
        texture.dispose()
      cache.clear()
    },
  }
}

// perf: each grade is baked once on the cpu; rendering costs one 3d texture
// lookup per fragment, independent of how many recipes are available.
