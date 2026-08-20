import { landmassLayout, landmassTerrain } from '../config.ts'
import type { LandmassProfile, LandmassSpec, ScapeConfig } from '../config.ts'
import type { Footpath, Footpaths } from './footpath.ts'
import { surfaceQueries } from './height.ts'
import type { HeightField } from './height.ts'
import type { Vec2 } from './path.ts'
import { surveyScape } from './survey.ts'
import type { ScapeSurvey } from './survey.ts'
import { createWaterways, createWorldPort } from './waterway.ts'
import type { WaterwayNetwork, WorldPort } from './waterway.ts'


export interface LandmassSurvey {
  id:      string
  profile: LandmassProfile
  origin:  Vec2
  config:  ScapeConfig
  survey:  ScapeSurvey
}

export interface ArchipelagoField extends HeightField {
  landmassAt(x: number, z: number): LandmassSurvey | null
}

export interface ArchipelagoSurvey {
  landmasses: readonly LandmassSurvey[]
  home:       LandmassSurvey
  field:      ArchipelagoField
  paths:      Footpaths
  ports:      readonly WorldPort[]
  waterways:  WaterwayNetwork
  size:       number
  waterLevel: number
}

function landmassConfig (config: ScapeConfig, spec: LandmassSpec): ScapeConfig {
  return {
    ...config,
    seed:    (config.seed ^ spec.seedOffset) >>> 0,
    terrain: landmassTerrain(config, spec),
    layout:  landmassLayout(config, spec),
  }
}

function assertSeparate (config: ScapeConfig): void {
  const { landmasses, worldSize } = config.archipelago
  const halfWorld                 = worldSize * 0.5

  for (const landmass of landmasses) {
    const half = landmassTerrain(config, landmass).size * 0.5

    if (Math.abs(landmass.origin[0]) + half > halfWorld || Math.abs(landmass.origin[1]) + half > halfWorld)
      throw new Error(`${landmass.id} terrain patch leaves the archipelago plane`)
  }

  for (let a = 0; a < landmasses.length; a += 1)
    for (let b = a + 1; b < landmasses.length; b += 1) {
      const first  = landmasses[a]
      const second = landmasses[b]
      const reach  =
        (landmassTerrain(config, first).size + landmassTerrain(config, second).size) * 0.5

      if (
        Math.abs(first.origin[0] - second.origin[0]) < reach &&
        Math.abs(first.origin[1] - second.origin[1]) < reach
      )
        throw new Error(`${first.id} and ${second.id} terrain patches overlap`)
    }
}

function createCompositeField (
  config:     ScapeConfig,
  landmasses: readonly LandmassSurvey[],
): ArchipelagoField {
  const seabed = config.terrain.waterLevel - config.terrain.seabedDrop

  function landmassAt (x: number, z: number): LandmassSurvey | null {
    for (const landmass of landmasses) {
      const half = landmass.config.terrain.size * 0.5

      if (
        Math.abs(x - landmass.origin.x) <= half &&
        Math.abs(z - landmass.origin.z) <= half
      )
        return landmass
    }

    return null
  }

  function heightAt (x: number, z: number): number {
    const landmass = landmassAt(x, z)

    return landmass
      ? landmass.survey.field.heightAt(x - landmass.origin.x, z - landmass.origin.z)
      : seabed
  }

  return { landmassAt, heightAt, ...surfaceQueries(heightAt) }
}

function createWorldPaths (landmasses: readonly LandmassSurvey[]): Footpaths {
  const paths: Footpath[] = landmasses.flatMap(landmass =>
    landmass.survey.paths.paths.map(path => ({
      points: path.points.map(point => ({
        x: point.x + landmass.origin.x,
        z: point.z + landmass.origin.z,
      })),
      to: {
        x: path.to.x + landmass.origin.x,
        z: path.to.z + landmass.origin.z,
      },
    })))

  return {
    paths,

    wearAt (x, z) {
      let wear = 0

      for (const landmass of landmasses)
        wear = Math.max(wear, landmass.survey.paths.wearAt(
          x - landmass.origin.x,
          z - landmass.origin.z,
        ))

      return wear
    },
  }
}

function projectPorts (
  config:     ScapeConfig,
  field:      HeightField,
  landmasses: readonly LandmassSurvey[],
): WorldPort[] {
  return landmasses.map(landmass => {
    const landing = landmass.survey.landing

    if (!landing)
      throw new Error(`${landmass.id} has no jetty landing`)

    return createWorldPort(landmass.id, {
      x:     landing.x + landmass.origin.x,
      z:     landing.z + landmass.origin.z,
      angle: landing.angle,
    }, field, config)
  })
}

export function toWorld (landmass: LandmassSurvey, point: Vec2): Vec2 {
  return {
    x: point.x + landmass.origin.x,
    z: point.z + landmass.origin.z,
  }
}

export function toLocal (landmass: LandmassSurvey, point: Vec2): Vec2 {
  return {
    x: point.x - landmass.origin.x,
    z: point.z - landmass.origin.z,
  }
}

/**
 * Survey every inhabited island locally, then join only their world-facing
 * contracts: ground, paths, ports and waterways.
 */
export function surveyArchipelago (config: ScapeConfig): ArchipelagoSurvey {
  assertSeparate(config)

  const landmasses = config.archipelago.landmasses.map(spec => {
    const local = landmassConfig(config, spec)

    return {
      id:      spec.id,
      profile: spec.profile,
      origin:  { x: spec.origin[0], z: spec.origin[1] },
      config:  local,
      survey:  surveyScape(local),
    }
  })

  const home = landmasses.find(landmass => landmass.id === 'home')
  if (!home)
    throw new Error('the archipelago has no home landmass')

  const field     = createCompositeField(config, landmasses)
  const paths     = createWorldPaths(landmasses)
  const ports     = projectPorts(config, field, landmasses)
  const waterways = createWaterways(config, field, ports)

  return {
    landmasses,
    home,
    field,
    paths,
    ports,
    waterways,
    size:       config.archipelago.worldSize,
    waterLevel: config.terrain.waterLevel,
  }
}

// perf: three pure local surveys plus one build-time navigation grid. Height
// queries dispatch to one non-overlapping patch and allocate nothing per call.
