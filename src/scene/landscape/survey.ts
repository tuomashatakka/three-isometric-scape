import { createSeededRng } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { findBeaconSite } from './beacon.ts'
import type { BeaconSite } from './beacon.ts'
import { solveCauseway } from './causeway.ts'
import type { Causeway } from './causeway.ts'
import { solveCrag } from './crag.ts'
import type { Crag } from './crag.ts'
import { solveDunes } from './dunes.ts'
import type { DuneBelt } from './dunes.ts'
import { CHAPEL_FOOTING } from './chapel.ts'
import { findCroftSite } from './croft.ts'
import type { CroftSite } from './croft.ts'
import { createFootpaths } from './footpath.ts'
import type { Footpaths, Obstacle } from './footpath.ts'
import { createHeightField, resolveIsles } from './height.ts'
import type { HeightField } from './height.ts'
import { BOATHOUSE_FOOTING, NET_RACK_FOOTING, boathouseSpot, findHarbourBank, findLanding, netRackSpot } from './landing.ts'
import type { Spot } from './landing.ts'
import { solvePier } from './pier.ts'
import type { Pier } from './pier.ts'
import { createScapeLayout, distanceToTrack } from './layout.ts'
import type { ScapeLayout } from './layout.ts'
import { MILL_FOOTING } from './mill.ts'
import { planFarmNetwork } from './network.ts'
import type { FarmNetwork, OutlyingPlace } from './network.ts'
import { solvePeatBank } from './peat.ts'
import type { PeatBank } from './peat.ts'
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

  /** The rock the croft is on, or `null` when nothing in the ring is free and level. */
  croft: CroftSite | null

  /** The bank above the harbour the smokehouse stands on, or `null` if none is dry. */
  smokehouse: SmokehouseSite | null

  /** The trestle out to deep water, or `null` when the shelf never drops away. */
  pier: Pier | null

  /** The pool above the beck's spring, or `null` if no hollow up there holds one. */
  tarn: Tarn | null

  /** The turf cutting on the moor, or `null` if the island has no flat low ground. */
  peat: PeatBank | null

  /** The bar out to the nearest rock, or `null` when nothing is close enough. */
  causeway: Causeway | null

  /**
   * The blown sand on the weather shore, or `null` on an island with none.
   *
   * The one solved landform in here that asks the survey for nothing: the belt
   * is a function of the config alone, so it is settled first and every field
   * built below it — including the throwaway ones the pool and the cutting are
   * sited against — is built with the same sand in it.
   */
  dunes: DuneBelt | null

  /**
   * The rock face on the steep shore, or `null` on an island whose coasts all
   * shelve.
   *
   * Solved beside the belt and for the same reasons — it asks the survey for
   * nothing but the beck's mouth, so it is settled first and every field built
   * below it carries the same headland. What it is *not* is a second opinion
   * about which shore is which: the belt takes the weather coast, and the crag
   * is refused that coast outright, so an island has at most one of the two on
   * any bearing.
   */
  crag: Crag | null

  /** The street plan: every place walked to, and every leg planned between them. */
  network: FarmNetwork
  paths:   Footpaths
}

/**
 * The crossing, and the ground that has it in it. One record, because they are
 * one decision — see {@link joinTheRock}.
 */
type JoinedGround = { causeway: Causeway | null, field: HeightField }

/**
 * Site the crossing, and hand back the ground that has it in it.
 *
 * The one thing in the survey sited *after* the boats rather than before them,
 * and the order is the rule rather than a convenience: a bar found on a ground
 * that already had a bar in it could be laid across the water the jetty stands
 * in, and the jetty would then have been found on ground the bar has since
 * raised. So the banks are settled against the island as it is, the causeway is
 * told to miss them, and the field everything downstream reads is rebuilt with
 * it — once, and only on an island that got one.
 *
 * A function of its own rather than six lines in `surveyScape`, because which
 * field the rest of the survey is measured against depends entirely on whether
 * there is a crossing to measure.
 */
function joinTheRock (
  config: ScapeConfig,
  layout: ScapeLayout,
  tarn:   Tarn | null,
  peat:   PeatBank | null,
  ashore: HeightField,
  berths: readonly (Spot | null)[],
  dunes:  DuneBelt | null,
  crag:   Crag | null,
): JoinedGround {
  const causeway = solveCauseway(
    {
      ground:     ashore.heightAt,
      waterLevel: config.terrain.waterLevel,
      gap:        config.causeway.gap,
      minIsle:    config.causeway.minIsle,
      clear:      config.causeway.clear,
      crest:      config.causeway.crest,
      camber:     config.causeway.camber,
      halfWidth:  config.causeway.halfWidth,
    },
    resolveIsles(config),
    berths,
  )

  return {
    causeway,
    field: causeway ? createHeightField(config, layout, tarn, peat, causeway, dunes, crag) : ashore,
  }
}

/**
 * The trestle, or the reason there is none.
 *
 * A function of its own rather than eight lines in `surveyScape` because that
 * one is at the lint config's complexity ceiling and every null-able site it
 * gains pushes it over — the same seam `joinTheRock` was cut on, and the same
 * rule: what belongs in the survey is the *order*, not the argument lists.
 *
 * Rooted on the *harbour* bank rather than on the landing's, which is the whole
 * siting decision and is argued out in `PIER_OFFSET`: the landing is the port,
 * and a trestle beside one stands in the fairway every ferry uses.
 *
 * Surveyed against the field the crossing is already in rather than against the
 * bare island, and that order is load-bearing for the reason `joinTheRock`
 * exists: a bar laid across the harbour mouth is ground, and a trestle solved
 * before it was there would walk out over the top of it on stilts. Read on the
 * joined field, the same bar simply refuses the site.
 */
function reachDeepWater (
  config:  ScapeConfig,
  field:   HeightField,
  harbour: Spot | null,
): Pier | null {
  return harbour && solvePier(
    {
      ground:     field.heightAt,
      waterLevel: config.terrain.waterLevel,
      berth:      config.pier.berth,
      piled:      config.pier.piled,
      reach:      config.pier.reach,
      offing:     config.pier.offing,
      // The fleet's own number rather than a second opinion about how much water
      // a boat needs — see `PierSearch.clearance`.
      clearance:  config.boats.clearance,
      bay:        config.pier.bay,
      freeboard:  config.pier.freeboard,
    },
    harbour,
  )
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

  // Before the fields rather than between them. The belt reads the falloff's
  // own ground and nothing else, and every height field below has to carry it —
  // a pool sited against a coast with no sand on it and then drawn on one with
  // sand is the two-approximations bug this file exists to avoid.
  const dunes = solveDunes(config)

  // Beside the belt, and told where the sand is so the two can never be sited
  // on one shore — and where the beck runs out, so a headland is never thrown
  // across an estuary the channel is already cut into.
  const crag = solveCrag(config, dunes, layout.creek)

  // The pool has to be sited against a ground that has no pool in it, and every
  // reader downstream has to see the ground that does. So the field is built
  // twice around the one solve — see `createHeightField`'s own note on why that
  // is cheaper than the alternative.
  const tarn = solveTarn(config, layout, createHeightField(config, layout, null, null, null, dunes, crag).heightAt)

  // And the cutting against the ground the pool left, for the same reason again
  // — with the pool itself handed over as ground already spoken for. The middle
  // field is the one the tarn solve used to throw away, so this is one more
  // closure and one more pair of smoothed profiles rather than a third pass over
  // the island.
  const peat    = solvePeatBank(config, layout, createHeightField(config, layout, tarn, null, null, dunes, crag).heightAt, tarn)
  const ashore  = createHeightField(config, layout, tarn, peat, null, dunes, crag)
  const places  = steadingPlaces(layout.yard)
  const landing = findLanding(layout, ashore, config)
  const harbour = landing && findHarbourBank(layout, ashore, config, landing)

  const { causeway, field } = joinTheRock(config, layout, tarn, peat, ashore, [ landing, harbour ], dunes, crag)

  // Offshore, and answering to nothing else in the survey: the light is sited on
  // the ring of rocks rather than on the island, so it neither moves anything
  // ashore nor is moved by it. Nothing is routed to it — a seamark is reached by
  // boat — which is why it stays out of `avoid` and out of the network below.
  const beacon = findBeaconSite(config, field)

  // The other building out on the rocks, and sited after the light because it is
  // sited *around* it: the ring is small enough that the largest islet is often
  // the only one either search would want, and a hut on the seamark's rock would
  // stand inside its storm boulders. Anchored on the harbour rather than on the
  // island's centre — a croft answers to the boats, and so does the walk from the
  // one that carried you there. Nothing ashore is routed to it for the reason
  // nothing is routed to the light.
  const croft = harbour && findCroftSite(
    {
      ground:     field.heightAt,
      waterLevel: config.terrain.waterLevel,
      freeboard:  config.croft.freeboard,
      minIsle:    config.croft.minIsle,
      reach:      config.croft.reach,
    },
    resolveIsles(config),
    harbour,
    beacon?.isle ?? null,
  )

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
    // The working, for the reason the pool is here: a leg that took the short
    // line across it would be a footpath along the floor of a cutting and up
    // over the face at the far end.
    ...peat ? [{ x: peat.floor.x, z: peat.floor.z, radius: peat.floor.radius }] : [],
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

  const pier = reachDeepWater(config, field, harbour)

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

  return {
    layout,
    field,
    places,
    landing,
    harbour,
    beacon,
    croft,
    smokehouse,
    pier,
    tarn,
    peat,
    causeway,
    dunes,
    crag,
    network,
    paths,
  }
}
