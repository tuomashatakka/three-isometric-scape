import { Group } from 'three'
import type { Object3D } from 'three'
import { createSeededRng, defineModule } from 'threejs-scene'
import type { AppModule } from 'threejs-scene'
import { NOTHING_SKIPPED } from '../audit.ts'
import type { ScapeSkips } from '../audit.ts'
import type { ScapeConfig } from '../config.ts'
import { createScapeMaterials } from '../props/material.ts'
import type { ScapeMaterials } from '../props/material.ts'
import type { AtmosphereQuality } from '../quality.ts'
import { createSeason } from '../season.ts'
import type { SeasonState } from '../season.ts'
import { createDressing } from './dressing.ts'
import type { Dressing } from './dressing.ts'
import { createFootpaths, footpathRoutes } from './footpath.ts'
import { createHeightField } from './height.ts'
import type { HeightField } from './height.ts'
import { findHarbourBank, findLanding } from './landing.ts'
import { createScapeLayout, distanceToTrack } from './layout.ts'
import type { ScapeLayout } from './layout.ts'
import { STEADING_BUILDINGS, steadingPlaces } from './steading.ts'
import { createTerrain } from './terrain.ts'
import { createWater } from './water.ts'
import type { Water } from './water.ts'


export interface Landscape {
  module: AppModule<Record<string, never>>

  /** What click-to-focus raycasts against: terrain and water, nothing else. */
  surfaces: Object3D[]
  heightAt(x: number, z: number): number
  layout:   ScapeLayout

  /**
   * The live instant of the year, resolved once per frame by this module's
   * `update`. Published the way the atmosphere publishes its daylight, so a
   * module outside the landscape can read the year without sampling it a second
   * time — two samples in one frame are two different weeks.
   */
  season: SeasonState
}

export function createLandscape (
  config: ScapeConfig,
  quality: AtmosphereQuality,
  skip: ScapeSkips = NOTHING_SKIPPED,
): Landscape {
  const surfaces: Object3D[] = []
  const layout               = createScapeLayout(config)
  const field: HeightField   = createHeightField(config, layout)

  // The year lives here rather than beside the day, because everything that
  // reads it — the ground, the growing things and the lake — is in this module.
  // It owns no geometry: nothing it does needs a rebuild, which is the whole
  // reason a season can run on a clock at all.
  const season = createSeason(config)

  // Where the farmstead stands. Resolved here rather than inside the dressing,
  // because the paths are worn between these places and the ground has to be
  // painted with them before anything is raised on it.
  const places  = steadingPlaces(layout.yard)
  const landing = findLanding(layout, field, config)

  // The paths come after the ground and before anything that stands on it. They
  // are traced across the field as it is finally built — the routes answer to the
  // levelled yard and the carved beck, not to the raw fBm underneath them — and
  // everything downstream then treats them as part of the composition: the
  // terrain paints them, and the scatter stays off them.
  const paths = createFootpaths({
    routes: footpathRoutes(layout, places, [
      landing,
      landing && findHarbourBank(layout, field, config, landing),
    ]),
    heightAt: field.heightAt,
    avoid:    STEADING_BUILDINGS.map(name => places[name]),
    width:    config.footpath.width,
    verge:    config.footpath.verge,
    climb:    config.footpath.climb,
    wander:   config.footpath.wander,
    wear:     config.footpath.wear,
    rng:      createSeededRng(config.seed).fork('footpath'),
    // Only outside the yard. The cart track ends *at* the farm, so inside the
    // yard its corridor covers most of the ground the buildings stand around —
    // and a rule meant to stop a path being worn alongside the road would
    // otherwise refuse every path in the place people actually walk.
    onTrack:  (x, z) =>
      Math.hypot(x - layout.yard.x, z - layout.yard.z) > layout.yard.radius &&
      distanceToTrack(layout, x, z) < layout.track.width * 1.3,
  })

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

      const terrain = createTerrain(config, layout, field, paths, materials.ground, quality.terrainSegments)

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
        dressing = createDressing(config, layout, field, paths, materials, quality)
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

      // Sampled once and handed to both readers. The ground takes the tint and
      // the snow; the lake takes the freeze — and they have to be looking at
      // the same instant of the year, or a shore whitens on a week the water
      // beside it is not shutting on.
      const now = season.sample(year.time)

      materials?.update(frame.elapsed, now)
      water?.update(frame.elapsed, now)
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

  return { module, surfaces, heightAt: field.heightAt, layout, season: season.state }
}

export { createFootpaths, footpathRoutes } from './footpath.ts'
export type { Footpath, FootpathRoute, Footpaths } from './footpath.ts'
export { createHeightField } from './height.ts'
export type { HeightField } from './height.ts'
export { findBank, findHarbourBank, findLanding } from './landing.ts'
export { STEADING_BUILDINGS, steadingPlaces } from './steading.ts'
export type { SteadingPlaces, Standing } from './steading.ts'
export { createScapeLayout, distanceToTrack, plotInfluence, ridgeInfluence } from './layout.ts'
export type { Plot, Ridge, ScapeLayout, Vec2, Yard } from './layout.ts'
export { createTerrainPainter } from './terrain.ts'

// perf: one terrain draw, one water draw, one merged steading draw, and one
// InstancedMesh per scattered prop type. Every mesh shares one of two materials.
