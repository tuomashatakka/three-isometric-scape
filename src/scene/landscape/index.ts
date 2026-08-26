import { Group } from 'three'
import type { Object3D } from 'three'
import { defineModule } from 'threejs-scene'
import { NOTHING_SKIPPED } from '../audit.ts'
import type { ScapeSkips } from '../audit.ts'
import type { LiveConfig, ScapeConfig, ScapeModule } from '../config.ts'
import { BEACON_SINK, LANTERN_HEIGHT } from '../props/beacon.ts'
import type { HearthStack } from '../hearth.ts'
import type { WindowLight } from '../windows.ts'
import { createScapeMaterials } from '../props/material.ts'
import { MILL_HUB_HEIGHT, MILL_HUB_REACH, MILL_SINK } from '../props/mill.ts'
import type { ScapeMaterials } from '../props/material.ts'
import type { LanternHub } from '../beacon.ts'
import { createTextureCatalogue } from '../textures/catalogue.ts'
import type { AtmosphereQuality } from '../quality.ts'
import { createSeason } from '../season.ts'
import type { SeasonState } from '../season.ts'
import { createWeather } from '../weather.ts'
import type { WeatherState } from '../weather.ts'
import type { WindState } from '../wind.ts'
import { surveyArchipelago } from './archipelago.ts'
import type { ArchipelagoSurvey } from './archipelago.ts'
import { createBoatFleet } from './boats.ts'
import type { BoatFleet } from './boats.ts'
import { planColonies } from './colony.ts'
import type { Colony } from './colony.ts'
import { createDressing } from './dressing.ts'
import { surveyHearths } from './hearths.ts'
import { surveyWindows } from './windows.ts'
import type { Dressing } from './dressing.ts'
import { yawAlong } from './layout.ts'
import type { ScapeLayout } from './layout.ts'
import { createMillSails } from './mill-sails.ts'
import type { MillHub, MillSails } from './mill-sails.ts'
import { createArchipelagoTerrain } from './terrain.ts'
import { createWater } from './water.ts'
import type { Water } from './water.ts'


export interface Landscape {
  module: ScapeModule

  /** What click-to-focus raycasts against: terrain and water, nothing else. */
  surfaces:    Object3D[]
  heightAt(x: number, z: number): number
  layout:      ScapeLayout
  archipelago: ArchipelagoSurvey

  /**
   * Where the gulls wheel, in world metres.
   *
   * Published rather than drawn here, for the reason the lantern hubs are: where
   * a flock can hang is a fact about the water the survey found, and what the
   * birds do about it belongs to `scene/birds.ts`.
   */
  colonies: readonly Colony[]

  /** Live fleet accessor; null until the landscape module has built. */
  boatFleet(): BoatFleet | null

  /**
   * Every lamp in the archipelago, in world space.
   *
   * Published rather than drawn here, because the light is lit by the day and the
   * day belongs to the atmosphere — see `scene/beacon.ts`. A fact about where the
   * towers *are*, resolved from the survey the same way the mills' hubs are.
   */
  lanternHubs: readonly LanternHub[]

  /**
   * Every chimney and flue in the archipelago, at the mouth and in world space.
   *
   * Published rather than drawn here for the reason the lantern hubs are: where
   * a stack *is* is a fact about the survey and the prop's own frame, and what
   * rises out of it answers to the day and the year — see `scene/hearth.ts`.
   */
  hearths: readonly HearthStack[]

  /**
   * Every glazed pane in the archipelago, in world space.
   *
   * Published for the reason the stacks above are: where a window *is* is a fact
   * about the survey and the prop's own frame, and whether a lamp is burning
   * behind it answers to the hour — see `scene/windows.ts`.
   */
  windows: readonly WindowLight[]

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
  config: LiveConfig,
  quality: AtmosphereQuality,
  wind: WindState,
  skip: ScapeSkips = NOTHING_SKIPPED,
): Landscape {
  const surfaces: Object3D[] = []

  // Each island resolves in the original local survey, then their fields, paths
  // and ports are projected into one deterministic world.
  const archipelago = surveyArchipelago(config())
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

  // One catalogue for the whole landscape: the ground grain, the cloud shadow
  // and the lake's two maps are one set of uploads shared by two materials and a
  // custom surface, and they are freed together in `dispose`.
  const textures = createTextureCatalogue(config().seed)

  let root: Group | null               = null
  let materials: ScapeMaterials | null = null
  let dressing: Dressing | null        = null
  let fleet: BoatFleet | null          = null
  let sails: MillSails | null          = null
  let water: Water | null              = null

  /**
   * Every mill's wheel, in world space.
   *
   * Resolved from the survey rather than reported back by the dressing, because
   * the hub is a fact about where the mill *is* and not about the geometry that
   * was raised there. `MILL_SINK` is read from the prop module for the same
   * reason the dressing passes it: the wheel and the shaft it hangs on have to
   * arrive at one number.
   */
  const millHubs: MillHub[] = archipelago.landmasses.flatMap(landmass => {
    const { mill } = landmass.survey.layout

    if (!mill)
      return []

    const x = mill.x + landmass.origin.x
    const z = mill.z + landmass.origin.z

    // Local `+z` is carried to `(cos bearing, sin bearing)` by the same yaw the
    // prop is raised with, so the shaft reaches out along the bearing itself.
    return [{
      x:   x + Math.cos(mill.bearing) * MILL_HUB_REACH,
      y:   field.heightAt(x, z) - MILL_SINK + MILL_HUB_HEIGHT,
      z:   z + Math.sin(mill.bearing) * MILL_HUB_REACH,
      yaw: yawAlong(mill.bearing),
    }]
  })

  /**
   * Every lantern, lifted to the lamp inside it.
   *
   * The sink is read from the prop module rather than defaulted, for the reason
   * `millHubs` gives: the tower is raised by `dressing.ts` and the lamp is placed
   * here, and two answers to how deep the plinth sits is a glow hanging beside
   * its own glazing.
   */
  const lanternHubs: LanternHub[] = archipelago.landmasses.flatMap(landmass => {
    const { beacon } = landmass.survey

    if (!beacon)
      return []

    return [{
      x: beacon.x + landmass.origin.x,
      y: beacon.level - BEACON_SINK + LANTERN_HEIGHT,
      z: beacon.z + landmass.origin.z,
    }]
  })

  /**
   * Every chimney and flue, at the mouth and in world space.
   *
   * Surveyed here beside the hubs and the lanterns, and for the same reason: it
   * is an answer about the ground and the arrangement on it rather than about
   * geometry. The plume itself is `scene/hearth.ts`.
   */
  const hearths = surveyHearths(archipelago)
  const windows = surveyWindows(archipelago)

  /**
   * Every flock the coast can carry, sited over open water.
   *
   * Surveyed here beside the hubs and the lanterns, and for the same reason:
   * it is an answer about the ground and the sea rather than about geometry, so
   * it is resolved once with the rest of the survey and read by whoever needs it.
   */
  const colonies = planColonies(archipelago, config())

  const module = defineModule<ScapeConfig>({
    name: 'nordic-landscape',

    build (ctx) {
      root = new Group()
      root.name = 'nordic-scape'

      materials = createScapeMaterials(
        config,
        skip,
        quality.detailTaps,
        textures,
        quality.reliefSteps,
      )

      const terrain = createArchipelagoTerrain(
        config(),
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
        water = createWater(config, field, quality, textures)
        surfaces.push(water.mesh)
        root.add(water.mesh)
      }

      if (!skip.has('dressing')) {
        dressing = createDressing(config(), archipelago, materials, quality)
        fleet = createBoatFleet({
          config,
          network:  archipelago.waterways,
          material: materials.ground,
          motion:   {
            dwellSeconds:  config().boats.dwellSeconds,
            turnRate:      config().boats.turnRate,
            turnLookAhead: config().boats.turnLookAhead,
          },
        })
        sails = createMillSails({ config, hubs: millHubs, material: materials.ground })
        root.add(dressing.object, fleet.mesh)

        if (sails)
          root.add(sails.mesh)
      }

      ctx.scene.add(root)
    },

    update (_state, frame) {
      // The year is a number in the config, the same way the time of day is, so
      // scrubbing the overlay's season slider and letting the clock run are the
      // same operation on the same field.
      const year = config().season
      const sky  = config().weather

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

      fleet?.update(frame.delta)
      sails?.update(frame.delta, wind.strength)
      materials?.update(wind, now, front)
      water?.update(frame.elapsed, wind, now, front, fleet?.wakeEmitters)
    },

    dispose () {
      dressing?.dispose()
      fleet?.dispose()
      sails?.dispose()
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
      textures.dispose()

      surfaces.length = 0
      root      = null
      dressing  = null
      fleet     = null
      sails     = null
      water     = null
      materials = null
    },
  })

  return {
    module,
    surfaces,
    heightAt:  field.heightAt,
    layout,
    archipelago,
    boatFleet: () => fleet,
    colonies,
    lanternHubs,
    hearths,
    windows,
    season:    season.state,
    weather:   weather.state,
  }
}

// perf: one merged terrain draw, one water draw, one merged settlement draw,
// one moving fleet draw, one turning sail draw, and one InstancedMesh per
// scattered prop type.
