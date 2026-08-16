import { createSeededRng } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { createFootpaths } from './footpath.ts'
import type { Footpaths, Obstacle } from './footpath.ts'
import { createHeightField } from './height.ts'
import type { HeightField } from './height.ts'
import { findHarbourBank, findLanding } from './landing.ts'
import type { Spot } from './landing.ts'
import { createScapeLayout, distanceToTrack } from './layout.ts'
import type { ScapeLayout } from './layout.ts'
import { planFarmNetwork } from './network.ts'
import type { FarmNetwork } from './network.ts'
import { STEADING_BUILDINGS, steadingPlaces } from './steading.ts'
import type { SteadingPlaces } from './steading.ts'


/**
 * Everything the scape knows about itself before anything is drawn.
 *
 * The ground, where the farm stands, where the boats land, and the routes worn
 * between them — the whole composition, and not one vertex of it.
 */
export interface ScapeSurvey {
  layout: ScapeLayout
  field:  HeightField

  /** Where the farmstead stands. */
  places: SteadingPlaces

  /** The bank the jetty is on, or `null` if no bearing off the yard found water. */
  landing: Spot | null

  /** The second cove, along the shore from the landing. */
  harbour: Spot | null

  /** The street plan: every place walked to, and every leg planned between them. */
  network: FarmNetwork
  paths:   Footpaths
}

/**
 * Survey the scape without building it.
 *
 * Split out of `createLandscape` when the debugging tools arrived, because the
 * order these five are resolved in is *load-bearing* and was previously known
 * only to the module that draws them: the paths answer to the levelled yard and
 * the carved beck rather than to the raw fBm, so tracing them before the height
 * field is graded gives routes that climb through ground the terrain has since
 * flattened. A second caller reproducing that order by hand would drift out of
 * agreement with the scene the first time either changed.
 *
 * Pure, and deliberately so — no `three`, no gl context, no DOM. That is what
 * lets `scripts/scape-map.ts` render the whole composition in a terminal, in
 * about sixteen milliseconds, with no browser anywhere near it.
 */
export function surveyScape (config: ScapeConfig): ScapeSurvey {
  const layout             = createScapeLayout(config)
  const field: HeightField = createHeightField(config, layout)
  const places             = steadingPlaces(layout.yard)
  const landing            = findLanding(layout, field, config)
  const harbour            = landing && findHarbourBank(layout, field, config, landing)

  const avoid: Obstacle[] = STEADING_BUILDINGS.map(name => places[name])
  const network           = planFarmNetwork(layout, places, [ landing, harbour ], avoid)

  const paths = createFootpaths({
    routes:   network.routes,
    heightAt: field.heightAt,
    avoid,
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

  return { layout, field, places, landing, harbour, network, paths }
}
