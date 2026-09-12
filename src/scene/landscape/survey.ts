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
import { solveHeadDyke, summitOf } from './dyke.ts'
import type { HeadDyke } from './dyke.ts'
import { iceClaim } from './icecap.ts'
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
import type { Vec2 } from './path.ts'
import { MILL_FOOTING } from './mill.ts'
import { planFarmNetwork } from './network.ts'
import type { FarmNetwork, OutlyingPlace } from './network.ts'
import { solvePeatBank } from './peat.ts'
import type { PeatBank } from './peat.ts'
import { SHIELING_FOOTING, findShielingSite } from './shieling.ts'
import type { ShielingSite } from './shieling.ts'
import { SMOKEHOUSE_FOOTING, findSmokehouseSite } from './smokehouse.ts'
import type { SmokehouseSite } from './smokehouse.ts'
import { STEADING_BUILDINGS, doorstepOf, steadingPlaces } from './steading.ts'
import type { SteadingPlaces } from './steading.ts'
import { solveSaltings } from './saltings.ts'
import type { Saltings } from './saltings.ts'
import { solveTarn } from './tarn.ts'
import type { Tarn } from './tarn.ts'
import { findWreckSite } from './wreck.ts'
import type { WreckSite } from './wreck.ts'


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

  /** The hut on the summer grazing, or `null` on an island with no hill to put one on. */
  shieling: ShielingSite | null

  /** The trestle out to deep water, or `null` when the shelf never drops away. */
  pier: Pier | null

  /**
   * The hull out on the low rock, or `null` when every rock in the ring stands
   * high enough to be seen coming.
   */
  wreck: WreckSite | null

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

  /**
   * The tidal flat at the beck's mouth, or `null` where the mouth is on a coast
   * already spoken for.
   *
   * Solved beside the belt and the headland and for their reasons — it asks the
   * survey for nothing but the beck's mouth and those two bearings, so it is
   * settled first and every field built below it carries the same marsh.
   */
  saltings: Saltings | null

  /** The street plan: every place walked to, and every leg planned between them. */
  network: FarmNetwork
  paths:   Footpaths

  /**
   * The march round the hill, or `null` on an island with no hill to divide.
   *
   * The last thing in the survey, and the only one that reads the *paths* rather
   * than only the ground — see {@link ringTheHill}.
   */
  dyke: HeadDyke | null
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
  marsh:  Saltings | null,
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
    field: causeway ? createHeightField(config, layout, tarn, peat, causeway, dunes, crag, marsh) : ashore,
  }
}

/** The marsh, and the ground that has it in it. One record, for one decision. */
type SiltedGround = { marsh: Saltings | null, field: HeightField }

/**
 * Lay the silt at the beck's mouth, and hand back the ground that has it in it.
 *
 * A function of its own rather than three lines in `surveyScape`, for the reason
 * `joinTheRock` is one: that function is at the lint config's complexity ceiling
 * and every null-able landform it gains pushes it over. What belongs in the
 * survey is the *order*, not the argument lists.
 *
 * And the order here is the causeway's, for the causeway's reason. The flat is
 * the one deposit in this scape that can take a *place* away — sand under a
 * barley plot is still a barley plot, and silt in a harbour is a harbour with no
 * water in it, which the first cut of this landform proved by silting the meadow
 * island's until the trestle out of it could no longer find a berth. So the two
 * banks are settled against the island as it is, the marsh is told to miss them,
 * and the ground everything downstream reads is rebuilt with it — once, and only
 * on an island that got one.
 */
function siltTheMouth (
  config: ScapeConfig,
  layout: ScapeLayout,
  tarn:   Tarn | null,
  peat:   PeatBank | null,
  bare:   HeightField,
  berths: readonly (Spot | null)[],
  dunes:  DuneBelt | null,
  crag:   Crag | null,
): SiltedGround {
  const marsh = solveSaltings(config, layout.creek, dunes, crag, berths)

  return {
    marsh,
    field: marsh ? createHeightField(config, layout, tarn, peat, null, dunes, crag, marsh) : bare,
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
 * The wall between the farm and the hill, or the reason there is none.
 *
 * A function of its own for the reason {@link reachDeepWater} is one — the
 * survey holds the *order*, not the argument lists — and it is the last thing
 * that order reaches, because it is the only site in the scape that answers to
 * the paths. Every other search is run before the routes are traced and hands
 * the tracer something to bend around; this one is run after them and bends
 * around nothing, because a head dyke is opened where people already walk
 * rather than walked around.
 *
 * What the ring may not be built across is handed over as two different kinds of
 * fact. `taken` is ground something already stands on — the byres, the mill, the
 * chapel, the pool, the cutting, the graded farmyard and the walled meadow — and
 * the wall abuts each of them and starts again beyond. `barred` is ground no
 * stone can be founded on at all: under the ice, where `tarn.ts` and `peat.ts`
 * already refuse to put anything, and in the beck's own channel, where a wall
 * would be a dam.
 */
function ringTheHill (
  config: ScapeConfig,
  layout: ScapeLayout,
  field:  HeightField,
  paths:  Footpaths,
  avoid:  readonly Obstacle[],
): HeadDyke | null {
  const { creek } = layout

  return solveHeadDyke(
    {
      ground:     field.heightAt,
      waterLevel: config.terrain.waterLevel,
      foot:       field.heightAt(layout.yard.x, layout.yard.z),
      headroom:   config.dyke.headroom,
      freeboard:  config.dyke.freeboard,
      gateway:    config.dyke.gateway,
      height:     config.dyke.height,
      // World-sized: the island's own land radius with the falloff's shoulder on
      // it, so a hill that reaches past the mean coastline is still walked to
      // its end. See `DykeSearch.reach` and `hillReach`.
      reach:      hillReach(layout),
      taken:      [
        ...avoid,
        // The graded shelf the farmstead stands on, whole. The buildings are
        // already in `avoid` at their own footings, but the yard is one levelled
        // platform and a wall laid across it is a wall through the farm.
        { x: layout.yard.x, z: layout.yard.z, radius: layout.yard.radius },
        // The hay meadow with its own wall on it, and the width of that wall as
        // well — two drystone walls a stone apart is one wide heap of stones.
        ...layout.pasture
          ? [{ x: layout.pasture.x, z: layout.pasture.z, radius: layout.pasture.radius + 1.5 }]
          : [],
        // The churchyard at the wall rather than at the nave, for the same
        // reason. `avoid` carries the building's own footing only.
        ...layout.chapel
          ? [{ x: layout.chapel.x, z: layout.chapel.z, radius: Math.max(config.chapel.yardRadius, CHAPEL_FOOTING) }]
          : [],
      ],
      barred: (x, z) =>
        iceClaim(config, x, z, field.heightAt(x, z)) > 0 ||
        (creek?.clearanceAt(x, z) ?? Infinity) < 0,
    },
    [
      ...paths.paths.map(path => path.points),
      // The cart track as well as the worn routes: it is the one way onto the
      // island that a cart takes, and a wall across it with no gate in it would
      // be a wall somebody would have to lift a cart over.
      layout.track.points,
    ],
  )
}

/**
 * A sited thing as ground already spoken for, or nothing at all where the search
 * that looked for it came back with none.
 *
 * Four searches in this file are allowed to answer `null` and four spreads of
 * `site ? [{ … }] : []` said so, one per line, which is what took `surveyScape`
 * past the lint config's complexity ceiling when the fifth arrived. The ceiling
 * is right: the branches were never the interesting part of that function, the
 * *order* is.
 */
function claim (site: Vec2 | null, radius: number): Obstacle[] {
  return site ? [{ x: site.x, z: site.z, radius }] : []
}

/**
 * How far from the island's middle the hill is looked for, in metres.
 *
 * **World-sized**, and the *same* number the head dyke walks its contour over —
 * because the summit both of them measure a share of is found inside it, and a
 * hut sited against one summit and a wall drawn against another is how the hut
 * ends up on the wrong side of the wall. See `summitOf`.
 */
function hillReach (layout: ScapeLayout): number {
  return layout.landRadius * 1.3
}

/**
 * The hull on the low rock, or the reason the ring has none.
 *
 * A function of its own for the reason {@link grazeTheHill} is one, and for one
 * more: the two rocks it has to keep off are both optional, so inlining it put
 * two `?.` into `surveyScape` and took that function past the lint config's
 * complexity ceiling. The survey holds the order; the argument lists live out
 * here.
 */
function strandAHull (
  config: ScapeConfig,
  field:  HeightField,
  beacon: BeaconSite | null,
  croft:  CroftSite | null,
): WreckSite | null {
  return findWreckSite(config, field, [ beacon?.isle ?? null, croft?.isle ?? null ])
}

/**
 * The hut on the summer grazing, or the reason there is none.
 *
 * A function of its own for the reason {@link ringTheHill} is one — the survey
 * holds the *order*, not the argument lists. Run before the routes rather than
 * after them, unlike the wall: a shieling is walked to, so it has to exist
 * before the network is planned, and the leg worn up to its door is the longest
 * one on the island.
 *
 * What it may not be built on is handed over as the same two kinds of fact the
 * dyke takes. `avoid` is ground something already stands on, and it carries two
 * things beyond the buildings: the graded farmyard, because a hut at the top of
 * the yard is an outbuilding, and the walled hay meadow, because a hain is the
 * *other* way of keeping stock off grass. `barred` is ground nothing can be
 * founded on at all — under the ice, in the beck's own channel, and on the cart
 * track, which is the one thing here the wall is allowed to cross and a building
 * is not.
 */
function grazeTheHill (
  config:   ScapeConfig,
  layout:   ScapeLayout,
  field:    HeightField,
  standing: readonly Obstacle[],
): ShielingSite | null {
  const { creek, pasture, yard } = layout
  const reach                    = hillReach(layout)

  return findShielingSite(
    {
      ground:   field.heightAt,
      foot:     field.heightAt(layout.yard.x, layout.yard.z),
      headroom: config.shieling.headroom,
      setback:  config.shieling.setback,
      reach,
      water:    config.shieling.water,
      burn:     creek?.points ?? null,
      barred:   (x, z) =>
        iceClaim(config, x, z, field.heightAt(x, z)) > 0 ||
        (creek?.clearanceAt(x, z) ?? Infinity) < 0 ||
        distanceToTrack(layout, x, z) < layout.track.width * 1.5,
    },
    yard,
    summitOf(field.heightAt, reach).height,
    [
      ...standing,
      // The graded shelf, whole. A hut on the top of the farmyard is a shed with
      // a view, and the buildings' own footings leave the open middle of it free.
      { x: yard.x, z: yard.z, radius: yard.radius },
      // The walled hay meadow and the width of its wall. A hain and a shieling
      // are the two ways of keeping stock off grass, and neither is built inside
      // the other.
      ...claim(pasture, (pasture?.radius ?? 0) + 1.5),
    ],
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
  const bare    = createHeightField(config, layout, tarn, peat, null, dunes, crag)
  const places  = steadingPlaces(layout.yard)
  const landing = findLanding(layout, bare, config)
  const harbour = landing && findHarbourBank(layout, bare, config, landing)

  // And the silt last of the three coastal landforms, told about the other two
  // and about both banks — which is why it is settled *here* rather than beside
  // them. See {@link siltTheMouth}. What it does *not* search for is a coast:
  // the beck's mouth decides where it goes, and the sand, the rock and the two
  // banks decide only whether it is allowed to be there.
  const berths = [ landing, harbour ]

  const { marsh, field: ashore } =
    siltTheMouth(config, layout, tarn, peat, bare, berths, dunes, crag)

  const { causeway, field } = joinTheRock(config, layout, tarn, peat, ashore, berths, dunes, crag, marsh)

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
    ...claim(layout.mill, MILL_FOOTING),
    // The whole chapel, unlike the mill: there is no walking under a nave, and
    // a leg that cut the corner off the churchyard would be a path through the
    // graves and out over the wall.
    ...claim(layout.chapel, CHAPEL_FOOTING),
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

  // The third thing out on the rocks, and the only site in the survey that is
  // nobody's decision. Sited after the light and the croft because it is sited
  // *against* them — those two take the rocks somebody chose, and this one takes
  // the rock nobody could see. Nothing ashore is routed to it and nothing avoids
  // it, for the reason nothing does either for the light.
  const wreck = strandAHull(config, field, beacon, croft)

  // Out on the hill, and the only thing in the survey sited *away* from
  // everything: the grazing is the ground nothing else on the island wanted. Run
  // before the routes because the hut is walked to, and after everything ashore
  // because the whole of that is ground it has to miss.
  const shieling = grazeTheHill(config, layout, field, standing)

  const avoid: Obstacle[] = [
    ...standing,
    // The hut, for the same reason as the chapel and at a fifth of the size.
    ...claim(smokehouse, SMOKEHOUSE_FOOTING),
    // The shieling with its fold, which is the largest claim on the island after
    // the farmyard's own — a leg that cut the corner off it would be a path
    // through a sheep pen.
    ...claim(shieling, SHIELING_FOOTING),
  ]

  // The smokehouse is walked to at its *door*, like every other building. The
  // landing and the harbour are banks rather than buildings, so the place walked
  // to is the bank itself.
  const outlying: (OutlyingPlace | null)[] = [
    landing && { x: landing.x, z: landing.z, name: 'landing', kind: 'shore' },
    harbour && { x: harbour.x, z: harbour.z, name: 'harbour', kind: 'shore' },
    smokehouse && { ...doorstepOf(smokehouse), name: 'smokehouse', kind: 'door' },
    shieling && { ...doorstepOf(shieling), name: 'shieling', kind: 'door' },
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
    shieling,
    pier,
    wreck,
    tarn,
    peat,
    causeway,
    dunes,
    crag,
    saltings: marsh,
    network,
    paths,
    dyke:     ringTheHill(config, layout, field, paths, avoid),
  }
}
