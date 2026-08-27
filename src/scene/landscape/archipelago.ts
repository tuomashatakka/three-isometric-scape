import { landmassDetail, landmassLayout, landmassTerrain } from '../config.ts'
import type { LandmassProfile, LandmassSpec, ScapeConfig } from '../config.ts'
import type { Footpath, Footpaths } from './footpath.ts'
import { surfaceQueries } from './height.ts'
import type { HeightField } from './height.ts'
import type { Vec2 } from './path.ts'
import { surveySkerries } from './skerry.ts'
import type { SkerryGuard } from './skerry.ts'
import { surveyScape } from './survey.ts'
import type { ScapeSurvey } from './survey.ts'
import { surveyStrand } from './strand.ts'
import type { Strand } from './strand.ts'
import { createWaterways, createWorldPort } from './waterway.ts'
import type { WaterwayNetwork, WorldPort } from './waterway.ts'


export interface LandmassSurvey {
  id:      string
  profile: LandmassProfile
  origin:  Vec2

  /**
   * How closely this island is drawn and dressed, relative to the home island.
   *
   * Resolved once here rather than read off the spec by every caller — the
   * terrain's segment count and the dressing's budgets both scale by it, and two
   * readings of an optional field is how one of them ends up at the default.
   */
  detail: number
  config: ScapeConfig
  survey: ScapeSurvey
}

export interface ArchipelagoField extends HeightField {
  landmassAt(x: number, z: number): LandmassSurvey | null
}

export interface ArchipelagoSurvey {
  landmasses: readonly LandmassSurvey[]
  home:       LandmassSurvey

  /**
   * The bar joining two of the islands, or `null` on an archipelago with none.
   *
   * Published rather than kept inside the field, because the terrain has to
   * *draw* it: the patches stop at their own edges and there is nothing between
   * them but the seabed quad nine metres down. See `landscape/terrain.ts`.
   */
  strand: Strand | null

  /**
   * The rocks out in the open water, always present and sometimes empty.
   *
   * Published for the same reason the bar is: the terrain has to *draw* them,
   * because the patches stop at their own edges and between them is one seabed
   * quad nine metres down. See `landscape/skerry.ts`.
   */
  skerries:   SkerryGuard
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
  strand:     Strand | null,
  skerries:   SkerryGuard,
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
    const ground   = landmass
      ? landmass.survey.field.heightAt(x - landmass.origin.x, z - landmass.origin.z)
      : seabed

    // A maximum, never a minimum, and never conditional on which patch answered.
    // The bar may raise the seabed it lies on and must not lower the island it
    // runs into — which is also what lets both of its ends simply vanish under
    // the rising shore instead of needing a join. Off the bar `heightAt` returns
    // the seabed, so this is already the no-op a branch would have been.
    //
    // The guard folds in on exactly the same terms, and after the bar for the
    // same reason: both are world-space terms over ground that has already been
    // dispatched, and a rock is not allowed to cut into anything either.
    const raised = strand ? Math.max(ground, strand.heightAt(x, z)) : ground

    return Math.max(raised, skerries.heightAt(x, z))
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
 * What one extra `surveyArchipelago` costs a test, in milliseconds.
 *
 * A test that proves determinism, or that a second seed lands a different
 * world, has to survey the whole archipelago a second time — every island
 * resited, every route retraced — and that is minutes of work against bun's
 * five-second default. Five tests needed that and five tests wrote their own
 * `30_000`, which held until the scape outgrew it: the world went on getting
 * bigger every run and the second-seed survey passed thirty seconds, so a
 * green suite turned red on nothing but growth.
 *
 * So the budget is published once, here, beside the call whose cost it
 * describes rather than copied into whichever test paid it. The number is
 * deliberately far above the ~35 s a survey costs today — a budget is a hang
 * detector, and pricing one to the current world just schedules the next red
 * suite for whenever the next run adds an island.
 */
export const SURVEY_BUDGET_MS = 180_000

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
      detail:  landmassDetail(spec),
      config:  local,
      survey:  surveyScape(local),
    }
  })

  const home = landmasses.find(landmass => landmass.id === 'home')
  if (!home)
    throw new Error('the archipelago has no home landmass')

  // Surveyed before the field, because the field is what they are folded into —
  // and surveyed from the landmasses' own local fields, so the shore the bar
  // starts at is the shore that island's coast warp actually put there.
  //
  // The guard comes after the bar and before the field, which settles the one
  // ordering question the two of them have: a rock may not stand on the bar, so
  // the bar has to exist to be asked. And both are in the field before the
  // ferry network is planned over it, which is what makes the boats route round
  // the rocks by the clearance test they were already running rather than by a
  // second rule written for skerries.
  const strand    = surveyStrand(config, landmasses)
  const skerries  = surveySkerries(config, landmasses, strand)
  const field     = createCompositeField(config, landmasses, strand, skerries)
  const paths     = createWorldPaths(landmasses)
  const ports     = projectPorts(config, field, landmasses)
  const waterways = createWaterways(config, field, ports)

  return {
    landmasses,
    home,
    strand,
    skerries,
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
