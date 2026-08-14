import { Group } from 'three'
import type { Object3D } from 'three'
import { defineModule } from 'threejs-scene'
import type { AppModule } from 'threejs-scene'
import { NOTHING_SKIPPED } from '../audit.ts'
import type { ScapeSkips } from '../audit.ts'
import type { ScapeConfig } from '../config.ts'
import { createScapeMaterials } from '../props/material.ts'
import type { ScapeMaterials } from '../props/material.ts'
import type { AtmosphereQuality } from '../quality.ts'
import { createSeason } from '../season.ts'
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

export function createLandscape (
  config: ScapeConfig,
  quality: AtmosphereQuality,
  skip: ScapeSkips = NOTHING_SKIPPED,
): Landscape {
  const surfaces: Object3D[] = []
  const layout               = createScapeLayout(config)
  const field: HeightField   = createHeightField(config, layout)

  // The year lives here rather than beside the day, because the ground and the
  // growing things are its only readers and both of them are in this module. It
  // owns no geometry: nothing it does needs a rebuild, which is the whole reason
  // a season can run on a clock at all.
  const season = createSeason(config)

  let root: Group | null               = null
  let materials: ScapeMaterials | null = null
  let dressing: Dressing | null        = null
  let water: Water | null              = null

  const module = defineModule<Record<string, never>>({
    name: 'nordic-landscape',

    build (ctx) {
      root = new Group()
      root.name = 'nordic-scape'

      materials = createScapeMaterials(config, skip, quality.detailTaps)

      const terrain = createTerrain(config, layout, field, materials.ground, quality.terrainSegments)

      surfaces.push(terrain)
      root.add(terrain)

      // `?skip=water` and `?skip=dressing` each remove a whole program from the
      // scape — the water surface with its own injection, and every
      // `InstancedMesh` in the place along with the foliage material. Between
      // them and `?skip=inject` the custom shader surface can be emptied a piece
      // at a time, which is how the audit's accusation gets confirmed on the
      // device rather than argued about here.
      if (!skip.has('water')) {
        water = createWater(config, field, quality)
        surfaces.push(water.mesh)
        root.add(water.mesh)
      }

      if (!skip.has('dressing')) {
        dressing = createDressing(config, layout, field, materials, quality)
        root.add(dressing.object)
      }

      ctx.scene.add(root)
    },

    update (_state, frame) {
      // The year is a number in the config, the same way the time of day is, so
      // scrubbing the overlay's season slider and letting the clock run are the
      // same operation on the same field.
      const year = config.season

      year.time = (year.time + frame.delta * year.speed / 60) % 1

      materials?.update(frame.elapsed, season.sample(year.time))
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
