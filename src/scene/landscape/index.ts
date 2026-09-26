import { Group } from 'three'
import type { Object3D } from 'three'
import { defineModule } from 'threejs-scene'
import { NOTHING_SKIPPED } from '../audit.ts'
import type { ScapeSkips } from '../audit.ts'
import { createCloudShadow } from '../cloud-shadow.ts'
import type { LiveConfig, ScapeConfig, ScapeModule } from '../config.ts'
import { BEACON_SINK, LANTERN_HEIGHT } from '../props/beacon.ts'
import type { HearthStack } from '../hearth.ts'
import type { WindowLight } from '../windows.ts'
import { createScapeMaterials } from '../props/material.ts'
import { MILL_HUB_HEIGHT, MILL_HUB_REACH, MILL_SINK } from '../props/mill.ts'
import { WATERMILL_SINK, WHEEL_AXLE, WHEEL_REACH } from '../props/watermill.ts'
import type { ScapeMaterials } from '../props/material.ts'
import type { LanternHub } from '../beacon.ts'
import { createTextureCatalogue } from '../textures/catalogue.ts'
import type { AtmosphereQuality } from '../quality.ts'
import { createSeason } from '../season.ts'
import type { SeasonState } from '../season.ts'
import { createWeather } from '../weather.ts'
import type { WeatherState } from '../weather.ts'
import type { TideState } from '../tide.ts'
import type { WindState } from '../wind.ts'
import { surveyArchipelago } from './archipelago.ts'
import type { ArchipelagoSurvey } from './archipelago.ts'
import { beckFreeze, createBeck } from './beck.ts'
import type { Beck } from './beck.ts'
import { createBoatFleet } from './boats.ts'
import type { BoatFleet } from './boats.ts'
import { planColonies } from './colony.ts'
import type { Colony } from './colony.ts'
import { createDressing } from './dressing.ts'
import { createForce } from './force.ts'
import type { Force } from './force.ts'
import { surveyHearths } from './hearths.ts'
import { surveyWindows } from './windows.ts'
import type { Dressing } from './dressing.ts'
import { planCliffColonies } from './ledges.ts'
import type { CliffColony } from './ledges.ts'
import { createPackIce } from './floes.ts'
import type { PackIce } from './floes.ts'
import { planHaulouts } from './haulout.ts'
import type { Haulout } from './haulout.ts'
import { createKelpForest } from './kelp.ts'
import type { KelpForest } from './kelp.ts'
import { planKelp } from './kelpbed.ts'
import { planPackIce } from './packice.ts'
import type { IceFloe } from './packice.ts'
import type { KelpSkirt } from './kelpbed.ts'
import { yawAlong } from './layout.ts'
import type { ScapeLayout } from './layout.ts'
import { createMillSails } from './mill-sails.ts'
import type { MillHub, MillSails } from './mill-sails.ts'
import { createWaterWheels } from './mill-wheels.ts'
import type { WaterWheelHub, WaterWheels } from './mill-wheels.ts'
import { createSeabirdCliffs } from './seabirds.ts'
import type { SeabirdCliffs } from './seabirds.ts'
import { createSealColony } from './seals.ts'
import type { SealColony } from './seals.ts'
import { createTarnWater } from './tarn-water.ts'
import type { TarnWater } from './tarn-water.ts'
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

  /**
   * Every rock in the guard with seals on it, and where each animal lies.
   *
   * Published for the reason the flocks are: which rock a seal would use is an
   * answer about the ground and the sea, and it is the one thing `scape:map` can
   * measure about a colony without a browser. What is drawn from it is
   * `landscape/seals.ts`, and how many of them are out of the water at any hour
   * is the tide's.
   */
  haulouts: readonly Haulout[]

  /**
   * Every headland with a bird colony on it, and where each bird stands.
   *
   * Published for the reason the haul-outs are: which cliff carries birds is an
   * answer about the rock and the water under it, and it is the one thing
   * `scape:map` can measure about a colony without a browser. What is drawn from
   * it is `landscape/seabirds.ts`, and how many of them are ashore in any week
   * is the year's.
   */
  cliffs: readonly CliffColony[]

  /**
   * Every island's kelp skirt, and every plant in it.
   *
   * Published for the reason the haul-outs are: which water grows weed is an
   * answer about the seabed and the sea over it, and it is the one thing
   * `scape:map` can measure about a bed without a browser. What is drawn from it
   * is `landscape/kelp.ts`, and how far each plant is leaning at any hour is the
   * tide's.
   */
  kelp: readonly KelpSkirt[]

  /**
   * Every plate of ice the winter can stand on the sound, and the week each
   * arrives.
   *
   * Published for the reason the haul-outs and the weed are: which water carries
   * a floe is an answer about the depth and the ice front over it rather than
   * about geometry, and it is the one thing `scape:map` can measure about a pack
   * without a browser. What is drawn from it is `landscape/floes.ts`, and how
   * much of it is standing in any week is the year's.
   */
  pack: readonly IceFloe[]

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
  tide: TideState,
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

  // One shadow for the whole landscape, built here because it is the one thing
  // the two materials and the lake all read and none of them owns. It carries
  // no geometry and nothing to free — the map under it belongs to the
  // catalogue above — so it is built beside the survey rather than in `build`,
  // and survives a rebuild the way the season and the weather do.
  const shadow = createCloudShadow(config, textures)

  let root: Group | null               = null
  let materials: ScapeMaterials | null = null
  let dressing: Dressing | null        = null
  let fleet: BoatFleet | null          = null
  let sails: MillSails | null          = null
  let wheels: WaterWheels | null       = null
  let seals: SealColony | null         = null
  let cliffs: SeabirdCliffs | null     = null
  let kelp: KelpForest | null          = null
  let pack: PackIce | null             = null
  let water: Water | null              = null
  let beck: Beck | null                = null
  let force: Force | null              = null
  let tarns: TarnWater | null          = null

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
   * Every watermill's wheel, in world space.
   *
   * Resolved from the survey beside the sails and for the sails' reason — the
   * hub is a fact about where the mill *is*, not about the geometry that was
   * raised there. The frame is the building's own, so the offsets read out of
   * `props/watermill.ts` rather than being restated: local `-z` is the wet side,
   * and the yaw the wheel turns in is the yaw the house was raised with, because
   * the axle runs through the wall between them.
   */
  const wheelHubs: WaterWheelHub[] = archipelago.landmasses.flatMap(landmass => {
    const site = landmass.survey.watermill

    if (!site)
      return []

    const x = site.x + landmass.origin.x
    const z = site.z + landmass.origin.z

    return [{
      x:     x + Math.sin(site.angle) * -WHEEL_REACH,
      y:     field.heightAt(x, z) - WATERMILL_SINK + WHEEL_AXLE,
      z:     z + Math.cos(site.angle) * -WHEEL_REACH,
      yaw:   site.angle,
      // Away from the water that fills it. The trough comes in over one end of
      // the wet wall or the other, and which one is the bank's decision.
      sense: -site.feedSide,
    }]
  })

  /**
   * Hand back everything the last build allocated on the gpu.
   *
   * A list walked rather than a column of `?.dispose()`, and the reason is the
   * lint config's complexity ceiling rather than taste — the twelfth system in
   * that column is what took `dispose` past it. The ceiling is right: which
   * systems exist was never the interesting part of teardown, the *order* of
   * what follows is, and that is still spelled out in `dispose` itself.
   */
  function releaseSystems (): void {
    const systems: readonly ({ dispose(): void } | null)[] =
      [ dressing, fleet, sails, wheels, seals, kelp, cliffs, pack, water, beck, force, tarns ]

    for (const system of systems)
      system?.dispose()
  }

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

  /**
   * Every seal on the guard, sited once against mean water.
   *
   * Surveyed here beside the flocks, and for the same reason — where an animal
   * can lie is a fact about the rock rather than about geometry. The tier is
   * asked here rather than inside the search because how many animals a rock
   * carries is a budget and which rocks carry any is not.
   */
  const haulouts = planHaulouts(archipelago, config(), quality.sealCount)

  /**
   * Every kelp plant in the archipelago, sited once against mean water.
   *
   * Surveyed here beside the haul-outs, and for the same reason — where a plant
   * can grow is a fact about how much water is over the seabed rather than about
   * geometry. The tier is asked here rather than inside the walk because how many
   * plants a coast carries is a budget and which water carries any is not.
   */
  const skirts = planKelp(archipelago, config(), quality.kelpCount)

  /**
   * Every bird on the headlands, sited once against the rock.
   *
   * Surveyed here beside the haul-outs and the weed, and for their reason —
   * where a bird can stand is a fact about the cliff rather than about geometry.
   * The tier is asked here rather than inside the search because how many birds
   * a headland carries is a budget and which headlands carry any is not.
   */
  const cliffColonies = planCliffColonies(archipelago, config(), quality.cliffBirds)

  /**
   * Every plate of ice on the sea between the islands, sited once against mean
   * water.
   *
   * Surveyed here beside the weed and the birds, and for their reason — where a
   * floe can float is a fact about the depth and the ice front over it rather
   * than about geometry. The tier is asked here rather than inside the search
   * because how many plates the world carries is a budget and which water
   * carries any is not.
   */
  const packIce = planPackIce(archipelago, config(), quality.floeCount)

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
        shadow,
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
        water = createWater(config, field, quality, textures, shadow)
        surfaces.push(water.mesh)
        root.add(water.mesh)
      }

      // Built after the terrain and before the dressing, because it reads the
      // ground *as drawn*: the sheet is laid on the same chord the patch
      // renders, at the same segment count the patch was given.
      if (!skip.has('water')) {
        beck = createBeck(config, archipelago, quality, quality.terrainSegments)

        if (beck)
          root.add(beck.mesh)

        // And the one place on the course where the water is not lying in the
        // channel at all. Built after the beck and read off the same drawn
        // ground, so the lip the sheet hangs from is a point on the ribbon the
        // beck has just drawn rather than a second opinion about where it is.
        force = createForce(config, archipelago, quality, quality.terrainSegments)

        if (force)
          root.add(force.mesh)

        // Same reasoning, one storey up: the pools are read against the ground
        // as the patch renders it, because that is the surface their banks are
        // going to occlude them with.
        tarns = createTarnWater(config, archipelago, quality, quality.terrainSegments)

        if (tarns)
          root.add(tarns.mesh)
      }

      if (!skip.has('dressing')) {
        dressing = createDressing(config(), archipelago, materials, quality)
        fleet = createBoatFleet({
          config,
          network:  archipelago.waterways,
          material: materials.ground,
          tide,
          motion:   {
            dwellSeconds:  config().boats.dwellSeconds,
            turnRate:      config().boats.turnRate,
            turnLookAhead: config().boats.turnLookAhead,
          },
        })
        sails = createMillSails({ config, hubs: millHubs, material: materials.ground })
        wheels = createWaterWheels({ config, quality, hubs: wheelHubs, material: materials.ground })
        seals = createSealColony({ config, haulouts, material: materials.ground, tide })
        kelp = createKelpForest({ config, skirts, material: materials.ground, tide })
        cliffs = createSeabirdCliffs({ config, colonies: cliffColonies, material: materials.ground })
        pack = createPackIce({ config, floes: packIce, material: materials.ground, tide })
        root.add(dressing.object, fleet.mesh)

        if (sails)
          root.add(sails.mesh)

        if (wheels)
          root.add(wheels.mesh)

        if (seals)
          root.add(seals.mesh)

        if (kelp)
          root.add(kelp.mesh)

        if (cliffs)
          root.add(cliffs.mesh)

        if (pack)
          root.add(pack.mesh)
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

      // Before anything that draws with it. The ground, the grass and the lake
      // read the same four uniforms, so the shadow is placed once and then
      // three programs are handed the answer.
      shadow.update(wind)

      fleet?.update(frame.delta)
      sails?.update(frame.delta, wind.strength)
      // What is left of the beck this week. The same function the water in the
      // channel reads, so the wheel stops on the week the channel does.
      wheels?.update(frame.delta, 1 - beckFreeze(now.freeze))
      seals?.update(frame.delta)
      kelp?.update(frame.delta)
      cliffs?.update(year.time)
      pack?.update(now, wind)
      materials?.update(wind, now, front)
      beck?.update(frame.delta, now)
      force?.update(frame.delta, now)
      tarns?.update(now)
      water?.update(frame.elapsed, wind, tide, now, front, fleet?.wakeEmitters)
    },

    dispose () {
      releaseSystems()

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
      wheels    = null
      seals     = null
      cliffs    = null
      kelp      = null
      pack      = null
      water     = null
      beck      = null
      force     = null
      tarns     = null
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
    haulouts,
    cliffs:    cliffColonies,
    kelp:      skirts,
    pack:      packIce,
    lanternHubs,
    hearths,
    windows,
    season:    season.state,
    weather:   weather.state,
  }
}

// perf: one merged terrain draw, one water draw, one beck draw, one force draw,
// one tarn draw,
// one merged settlement draw,
// one moving fleet draw, one turning sail draw, one hauled colony draw, one
// leaning kelp draw, one
// frozen pack draw, and one
// InstancedMesh per scattered prop type.
