import { Group } from 'three'
import type { Object3D } from 'three'
import { defineModule } from 'threejs-scene'
import type { AppModule } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { createScapeMaterials } from '../props/material.ts'
import type { ScapeMaterials } from '../props/material.ts'
import type { AtmosphereQuality } from '../quality.ts'
import { createDressing } from './dressing.ts'
import type { Dressing } from './dressing.ts'
import { createHeightField } from './height.ts'
import type { HeightField } from './height.ts'
import { createScapeLayout } from './layout.ts'
import type { ScapeLayout } from './layout.ts'
import { createTerrain } from './terrain.ts'
import { createWater } from './water.ts'
import type { Water } from './water.ts'


export interface Landscape {
  module: AppModule<Record<string, never>>

  /** What click-to-focus raycasts against: terrain and water, nothing else. */
  surfaces: Object3D[]
  heightAt(x: number, z: number): number
  layout:   ScapeLayout
}

export function createLandscape (config: ScapeConfig, quality: AtmosphereQuality): Landscape {
  const surfaces: Object3D[] = []
  const layout               = createScapeLayout(config)
  const field: HeightField   = createHeightField(config, layout)

  let root: Group | null               = null
  let materials: ScapeMaterials | null = null
  let dressing: Dressing | null        = null
  let water: Water | null              = null

  const module = defineModule<Record<string, never>>({
    name: 'nordic-landscape',

    build (ctx) {
      root = new Group()
      root.name = 'nordic-scape'

      materials = createScapeMaterials({
        cloudShadow:  config.atmosphere.cloudShadow,
        cloudScale:   config.atmosphere.cloudScale,
        cloudSpeed:   config.atmosphere.cloudSpeed,
        windStrength: config.wind.strength,
        windSpeed:    config.wind.speed,
        seed:         config.seed,
      })

      const terrain = createTerrain(config, layout, field, materials.ground, quality.terrainSegments)
      water = createWater(config, field)

      surfaces.push(terrain, water.mesh)
      root.add(terrain, water.mesh)

      dressing = createDressing(config, layout, field, materials, quality)
      root.add(dressing.object)

      ctx.scene.add(root)
    },

    update (_state, frame) {
      materials?.update(frame.elapsed)
      water?.update(frame.elapsed)
    },

    dispose () {
      dressing?.dispose()
      water?.dispose()

      if (root) {
        root.removeFromParent()
        root.traverse(object => {
          const mesh = object as { geometry?: { dispose(): void }}
          mesh.geometry?.dispose()
        })
        root.clear()
      }

      materials?.dispose()

      surfaces.length = 0
      root      = null
      dressing  = null
      water     = null
      materials = null
    },
  })

  return { module, surfaces, heightAt: field.heightAt, layout }
}

export { createHeightField } from './height.ts'
export type { HeightField } from './height.ts'
export { createScapeLayout, distanceToTrack, plotInfluence, ridgeInfluence } from './layout.ts'
export type { Plot, Ridge, ScapeLayout, Vec2, Yard } from './layout.ts'
export { createTerrainPainter } from './terrain.ts'

// perf: one terrain draw, one water draw, one merged steading draw, and one
// InstancedMesh per scattered prop type. Every mesh shares one of two materials.
