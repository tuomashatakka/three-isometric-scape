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
import type { SeasonState } from '../season.ts'
import { createWeather } from '../weather.ts'
import type { WeatherState } from '../weather.ts'
import { surveyArchipelago } from './archipelago.ts'
import type { ArchipelagoSurvey } from './archipelago.ts'
import { createBoatFleet } from './boats.ts'
import type { BoatFleet } from './boats.ts'
import { createDressing } from './dressing.ts'
import type { Dressing } from './dressing.ts'
import type { ScapeLayout } from './layout.ts'
import { createArchipelagoTerrain } from './terrain.ts'
import { createWater } from './water.ts'
import type { Water } from './water.ts'


export interface Landscape {
  module: AppModule<Record<string, never>>

  /** What click-to-focus raycasts against: terrain and water, nothing else. */
  surfaces:    Object3D[]
  heightAt(x: number, z: number): number
  layout:      ScapeLayout
  archipelago: ArchipelagoSurvey

  /**
   * The live instant of the year, resolved once per frame by this module's
   * `update`. Published the way the atmosphere publishes its daylight, so a
   * module outside the landscape can read the year without sampling it a second
   * time — two samples in one frame are two different weeks.
   */
  season: SeasonState

  /**
   * The live instant of the weather, resolved by the same `update` and from the
   * same frame's year. Published for the fall — `rain.ts` draws what this says
   * is coming down, and cannot be a shower ahead of the ground it lands on.
   */
  weather: WeatherState
}

export function createLandscape (
  config: ScapeConfig,
  quality: AtmosphereQuality,
  skip: ScapeSkips = NOTHING_SKIPPED,
): Landscape {
  const surfaces: Object3D[] = []

  // Each island resolves in the original local survey, then their fields, paths
  // and ports are projected into one deterministic world.
  const archipelago = surveyArchipelago(config)
  const { field }   = archipelago
  const { layout }  = archipelago.home.survey

  // The year lives here rather than beside the day, because everything that
  // reads it — the ground, the growing things and the lake — is in this module.
  // It owns no geometry: nothing it does needs a rebuild, which is the whole
  // reason a season can run on a clock at all.
  const season = createSeason(config)

  // The third clock, mounted beside the second because it is derived from it:
  // what a squall drops is the year's answer, not the weather's. Like the season
  // it owns no geometry — the fall is `rain.ts`, and what the ground does about
  // it is two uniforms.
  const weather = createWeather(config)

  let root: Group | null               = null
  let materials: ScapeMaterials | null = null
  let dressing: Dressing | null        = null
  let fleet: BoatFleet | null          = null
  let water: Water | null              = null

  const module = defineModule<Record<string, never>>({
    name: 'nordic-landscape',

    build (ctx) {
      root = new Group()
      root.name = 'nordic-scape'

      materials = createScapeMaterials(config, skip, quality.detailTaps)

      const terrain = createArchipelagoTerrain(
        config,
        archipelago,
        materials.ground,
        quality.terrainSegments,
      )

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
        dressing = createDressing(config, archipelago, materials, quality)
        fleet = createBoatFleet({
          config,
          network:  archipelago.waterways,
          material: materials.ground,
        })
        root.add(dressing.object, fleet.mesh)
      }

      ctx.scene.add(root)
    },

    update (_state, frame) {
      // The year is a number in the config, the same way the time of day is, so
      // scrubbing the overlay's season slider and letting the clock run are the
      // same operation on the same field.
      const year = config.season
      const sky  = config.weather

      year.time = (year.time + frame.delta * year.speed / 60) % 1
      sky.time  = (sky.time + frame.delta * sky.speed / 60) % 1

      // Sampled once and handed to both readers. The ground takes the tint and
      // the snow; the lake takes the freeze — and they have to be looking at
      // the same instant of the year, or a shore whitens on a week the water
      // beside it is not shutting on.
      const now = season.sample(year.time)

      // After the year and from the year: the share of a squall that falls as
      // snow is this week's snow, so the weather has to be resolved against an
      // instant of the season that has already been resolved.
      const front = weather.sample(sky.time, now)

      materials?.update(frame.elapsed, now, front)
      water?.update(frame.elapsed, now, front)
      fleet?.update(frame.delta)
    },

    dispose () {
      dressing?.dispose()
      fleet?.dispose()
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
      fleet     = null
      water     = null
      materials = null
    },
  })

  return {
    module,
    surfaces,
    heightAt: field.heightAt,
    layout,
    archipelago,
    season:   season.state,
    weather:  weather.state,
  }
}

// perf: one merged terrain draw, one water draw, one merged settlement draw,
// one moving fleet draw, and one InstancedMesh per scattered prop type.
