import { createSeededRng } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { findBeaconSite } from './beacon.ts'
import type { BeaconSite } from './beacon.ts'
import { CHAPEL_FOOTING } from './chapel.ts'
import { createFootpaths } from './footpath.ts'
import type { Footpaths, Obstacle } from './footpath.ts'
import { createHeightField } from './height.ts'
import type { HeightField } from './height.ts'
import { BOATHOUSE_FOOTING, NET_RACK_FOOTING, boathouseSpot, findHarbourBank, findLanding, netRackSpot } from './landing.ts'
import type { Spot } from './landing.ts'
import { createScapeLayout, distanceToTrack } from './layout.ts'
import type { ScapeLayout } from './layout.ts'
import { MILL_FOOTING } from './mill.ts'
import { planFarmNetwork } from './network.ts'
import type { FarmNetwork, OutlyingPlace } from './network.ts'
import { SMOKEHOUSE_FOOTING, findSmokehouseSite } from './smokehouse.ts'
import type { SmokehouseSite } from './smokehouse.ts'
import { STEADING_BUILDINGS, doorstepOf, steadingPlaces } from './steading.ts'
import type { SteadingPlaces } from './steading.ts'
import { solveTarn } from './tarn.ts'
import type { Tarn } from './tarn.ts'


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

  /** The outer rock the light stands on, or `null` on an island with no rocks. */
  beacon: BeaconSite | null

  /** The bank above the harbour the smokehouse stands on, or `null` if none is dry. */
  smokehouse: SmokehouseSite | null

  /** The pool above the beck's spring, or `null` if no hollow up there holds one. */
  tarn: Tarn | null

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
  const layout = createScapeLayout(config)

  // The pool has to be sited against a ground that has no pool in it, and every
  // reader downstream has to see the ground that does. So the field is built
  // twice around the one solve — see `createHeightField`'s own note on why that
  // is cheaper than the alternative.
  const tarn               = solveTarn(config, layout, createHeightField(config, layout).heightAt)
  const field: HeightField = createHeightField(config, layout, tarn)
  const places             = steadingPlaces(layout.yard)
  const landing            = findLanding(layout, field, config)
  const harbour            = landing && findHarbourBank(layout, field, config, landing)

  // Offshore, and answering to nothing else in the survey: the light is sited on
  // the ring of rocks rather than on the island, so it neither moves anything
  // ashore nor is moved by it. Nothing is routed to it — a seamark is reached by
  // boat — which is why it stays out of `avoid` and out of the network below.
  const beacon = findBeaconSite(config, field)

  // Everything already standing when the smokehouse is sited, and everything a
  // footpath then has to bend round. Resolved before the search rather than
  // after it, because the search is the one thing here that has to *miss* all of
  // them: the first cut of it had only the harbour's own two to avoid, and on
  // the home island it put the hut two metres inside the barn.
  const standing: Obstacle[] = [
    ...STEADING_BUILDINGS.map(name => places[name]),
    // The trestle, so a route bends round the piers rather than through them.
    // The sail sweep is deliberately not in here — see `MILL_FOOTING`.
    ...layout.mill ? [{ x: layout.mill.x, z: layout.mill.z, radius: MILL_FOOTING }] : [],
    // The whole chapel, unlike the mill: there is no walking under a nave, and
    // a leg that cut the corner off the churchyard would be a path through the
    // graves and out over the wall.
    ...layout.chapel ? [{ x: layout.chapel.x, z: layout.chapel.z, radius: CHAPEL_FOOTING }] : [],
    // Standing water is a thing to walk round, and the only obstacle here that
    // is not a building. A leg that took the short line across the pool would be
    // a footpath along the bottom of it.
    ...tarn ? [{ x: tarn.x, z: tarn.z, radius: tarn.radius }] : [],
  ]

  // Against the harbour rather than against the farm, and after everything else
  // ashore: the smokehouse is the only building on the island whose whole reason
  // is the boats, so it is sited on what nothing else has already taken and is
  // never handed to anything as something to miss.
  const smokehouse = harbour && findSmokehouseSite(
    {
      ground:     field.heightAt,
      waterLevel: config.terrain.waterLevel,
      freeboard:  config.smokehouse.freeboard,
      setback:    config.smokehouse.setback,
      reach:      config.smokehouse.reach,
    },
    harbour,
    [
      ...standing,
      { ...boathouseSpot(harbour), radius: BOATHOUSE_FOOTING },
      { ...netRackSpot(harbour), radius: NET_RACK_FOOTING },
    ],
  )

  const avoid: Obstacle[] = [
    ...standing,
    // The hut, for the same reason as the chapel and at a fifth of the size.
    ...smokehouse ? [{ x: smokehouse.x, z: smokehouse.z, radius: SMOKEHOUSE_FOOTING }] : [],
  ]

  // The smokehouse is walked to at its *door*, like every other building. The
  // landing and the harbour are banks rather than buildings, so the place walked
  // to is the bank itself.
  const outlying: (OutlyingPlace | null)[] = [
    landing && { x: landing.x, z: landing.z, name: 'landing', kind: 'shore' },
    harbour && { x: harbour.x, z: harbour.z, name: 'harbour', kind: 'shore' },
    smokehouse && { ...doorstepOf(smokehouse), name: 'smokehouse', kind: 'door' },
  ]

  const network = planFarmNetwork(layout, places, outlying, avoid)

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

  return { layout, field, places, landing, harbour, beacon, smokehouse, tarn, network, paths }
}
