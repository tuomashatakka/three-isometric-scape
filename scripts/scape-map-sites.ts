import type { ScapeConfig } from '../src/scene/config.ts'
import { dayLength } from '../src/scene/daylight.ts'
import type { LandmassSurvey } from '../src/scene/landscape/archipelago.ts'
import { carterJourney, carterLoads, carterWindow, planCarterRound } from '../src/scene/landscape/carter.ts'
import { causewayCover } from '../src/scene/landscape/causeway.ts'
import type { Causeway } from '../src/scene/landscape/causeway.ts'
import type { CroftSite } from '../src/scene/landscape/croft.ts'
import type { HeadDyke } from '../src/scene/landscape/dyke.ts'
import type { HeightField } from '../src/scene/landscape/height.ts'
import { peatFaceStanding } from '../src/scene/landscape/peat.ts'
import { COURSES } from '../src/scene/landscape/cropping.ts'
import type { Course } from '../src/scene/landscape/cropping.ts'
import { layoutRigs, rigLength } from '../src/scene/landscape/rigs.ts'
import type { RigLayout } from '../src/scene/landscape/rigs.ts'
import type { Plot } from '../src/scene/landscape/layout.ts'
import { moleHead } from '../src/scene/landscape/mole.ts'
import type { Mole } from '../src/scene/landscape/mole.ts'
import { pierHead } from '../src/scene/landscape/pier.ts'
import type { Pier } from '../src/scene/landscape/pier.ts'
import type { PeatBank } from '../src/scene/landscape/peat.ts'
import type { HoweSite } from '../src/scene/landscape/howe.ts'
import type { ShielingSite } from '../src/scene/landscape/shieling.ts'
import type { WatermillSite } from '../src/scene/landscape/watermill.ts'
import type { HjellRun } from '../src/scene/landscape/hjell.ts'
import type { KilnSite } from '../src/scene/landscape/kiln.ts'
import type { SmokehouseSite } from '../src/scene/landscape/smokehouse.ts'
import type { CrossingSurvey } from '../src/scene/landscape/crossing.ts'
import type { SnowFenceSurvey } from '../src/scene/landscape/snowfence.ts'
import { tarnWetted } from '../src/scene/landscape/tarn.ts'
import type { Tarn } from '../src/scene/landscape/tarn.ts'
import { weirStanding } from '../src/scene/landscape/weir.ts'
import type { Weir } from '../src/scene/landscape/weir.ts'
import type { WreckSite } from '../src/scene/landscape/wreck.ts'
import { tideAmplitudeAt } from '../src/scene/tide.ts'
import type { CompositionStats } from './scape-map.ts'


/**
 * The sited features of one island, as the stats lines report them.
 *
 * Split off `scape-map.ts` when that file went past the 666-line ceiling a third
 * time, and the seam is the one those functions had already drawn between
 * themselves: every one of them is a *projection plus a measurement* — a local
 * point carried into world metres, and the one number that says whether the
 * thing the search found is really there. None of them touch the grid, the
 * layers or the argument parsing that is the rest of that file.
 *
 * They are separate functions rather than branches inside `compositionStats`
 * because the lint config's complexity ceiling refuses the alternative, and
 * rightly: a survey-to-stats mapping that keeps growing null guards is a mapping
 * that wants splitting, not a limit that wants raising.
 */

/** Round for the report, not for the maths. */
const round = (value: number, places = 1): number => Number(value.toFixed(places))

/** Carrying a local coordinate into world metres. See `compositionStats`. */
type Project = (value: number) => number


/**
 * The drying racks above the harbour, and the four numbers that say whether the
 * search did its job.
 *
 * `fetch` is the one worth reading first and the one no still can show: it is
 * metres of open ground measured upwind of the windward trestle, capped at
 * `hjell.fetch`, so a run that comes back at the cap is a run standing in the
 * weather and a `NONE` beside a harbour is a coast that had nowhere out of the
 * lee. `fall` is how much extra leg the slope cost, `length` is how much rack
 * the line could hold, and `fromBank` is how far the catch is carried.
 */
export function hjellOf (
  run:    HjellRun | null,
  worldX: Project,
  worldZ: Project,
): CompositionStats['hjell'] {
  const root = run?.stations[0]
  const head = run?.stations[run.stations.length - 1]

  if (!run || !root || !head)
    return null

  return {
    x:        round(worldX(root.x)),
    z:        round(worldZ(root.z)),
    toX:      round(worldX(head.x)),
    toZ:      round(worldZ(head.z)),
    bays:     run.stations.length - 1,
    length:   round(run.length, 1),
    deck:     round(run.deck, 2),
    fall:     round(run.fall, 2),
    fetch:    round(run.fetch, 1),
    fromBank: round(run.fromBank, 1),
  }
}

/**
 * The kiln on the bank, the brae it was cut into, and the walk to the boats.
 *
 * `fall` is the line the site search actually scored on, so it is the field
 * worth reading first: a kiln whose fall has crept toward `kiln.scarp` is a kiln
 * standing against a bank it no longer sits in, and a harbour whose brae has
 * flattened out reports `NONE` rather than a kiln on level ground.
 */
export function kilnOf (
  site:   KilnSite | null,
  worldX: Project,
  worldZ: Project,
): CompositionStats['kiln'] {
  return site && {
    x:        round(worldX(site.x)),
    z:        round(worldZ(site.z)),
    fall:     round(site.fall, 2),
    sill:     round(site.level, 2),
    fromBank: round(site.fromBank, 1),
  }
}

/** The harbour's hut, and how far up the bank it stands. */
export function smokehouseOf (
  site:   SmokehouseSite | null,
  worldX: Project,
  worldZ: Project,
): CompositionStats['smokehouse'] {
  return site && {
    x:        round(worldX(site.x)),
    z:        round(worldZ(site.z)),
    fromBank: round(site.fromBank, 1),
  }
}

/**
 * The hut on the grazing, the climb to it, and the walk to its water.
 *
 * `toWater` comes back as `null` rather than as `Infinity` on an island whose
 * ridge fed no beck, because the stats block is read by a person and `Infinity`
 * metres from a burn that does not exist says less than a blank does.
 */
export function shielingOf (
  site:   ShielingSite | null,
  worldX: Project,
  worldZ: Project,
): CompositionStats['shieling'] {
  return site && {
    x:        round(worldX(site.x)),
    z:        round(worldZ(site.z)),
    rise:     round(site.rise, 2),
    fromYard: round(site.fromYard),
    toWater:  Number.isFinite(site.toWater) ? round(site.toWater) : null,
  }
}

/**
 * The barrow, what it stands over, and whether the farm can actually see it.
 *
 * `skyline` is the reading that matters and it is the one no still can give at
 * a pose nobody thought to take: the mound can be on the finest top the island
 * has and still be behind the shoulder in front of it, and the picture of that
 * failure is a frame with no mound in it, which looks exactly like a frame of
 * an island that was never given one.
 */
export function howeOf (
  site:   HoweSite | null,
  worldX: Project,
  worldZ: Project,
): CompositionStats['howe'] {
  return site && {
    x:        round(worldX(site.x)),
    z:        round(worldZ(site.z)),
    stands:   round(site.stands, 2),
    skyline:  round(site.skyline, 2),
    fromYard: round(site.fromYard),
  }
}

/**
 * The fence, the road it guards, and the one number about neither.
 *
 * `bite` is why this block exists. Every other refusal reported here is about
 * ground — dry ground being scarce, a shelf falling away, a top standing clear
 * — and every one of them is at least *in principle* visible in a still taken
 * from the right angle. This one is about the weather crossing the ground, and
 * there is no angle to take it from: a fence whose stretch of track has stopped
 * drifting draws exactly like one whose has not. A `bite` that has fallen back
 * toward `snowFence.bite` across runs is a fence being built on the threshold,
 * which is the finding; one far above it is a road that really does close.
 *
 * `length` against `guarded` is the other reading, and it is a pair for the
 * pier's reason: a run shorter than the stretch it was built for is a fence the
 * wind simply goes round, and one number alone cannot say that.
 */
export function snowFenceOf (
  survey: SnowFenceSurvey,
  worldX: Project,
  worldZ: Project,
): CompositionStats['snowFence'] {
  const fence = survey.run

  return {
    drifts: round(survey.drifts, 1),
    run:    fence && {
      x:       round(worldX(fence.guards.x)),
      z:       round(worldZ(fence.guards.z)),
      length:  round(fence.length, 1),
      posts:   fence.posts.length,
      guarded: round(fence.guarded, 1),
      setback: round(fence.setback, 1),
      bite:    round(fence.bite, 3),
    },
  }
}

/**
 * The mill on the beck, the head it was built for, and the trough it took to
 * get it.
 *
 * Three numbers rather than one, because the three are what say whether the
 * search did its job. `head` alone says only that the gate passed; the *surplus*
 * over the trough's own rise says how deep the mouth is cut into its bank, and
 * `lade` says how far somebody carried the timber. A mill that comes back with
 * fifteen metres of lade for a head that barely clears the gate is a mill the
 * scoring put in the wrong place, and no still in the scape would show it.
 */
export function watermillOf (
  site:   WatermillSite | null,
  worldX: Project,
  worldZ: Project,
): CompositionStats['watermill'] {
  return site && {
    x:      round(worldX(site.x)),
    z:      round(worldZ(site.z)),
    head:   round(site.head, 2),
    lade:   round(site.lade, 1),
    intake: {
      x: round(worldX(site.intake.x)),
      z: round(worldZ(site.intake.z)),
    },
  }
}

/**
 * The bridges over the water, and the fords left unbridged.
 *
 * Two numbers that only mean anything together, and this is the one block in
 * the survey where a blank is genuinely ambiguous without them. `fords` is how
 * many places a worn way goes into water — a fact about the network, which
 * moves whenever a building moves. `bridges` is how many of them got a deck.
 * `fords` climbing while `bridges` holds is a scape growing wet crossings;
 * both at zero is an island whose ways simply never meet its beck or its sea,
 * which is a different thing entirely from an island that fords them.
 *
 * `refused` says which of the five reasons the rest were left: the channel was
 * tidal there, it was a damp crease rather than a stream, it was wider than a
 * bridge will span, its two banks stand at heights no level deck would reach
 * between, or the farm had already built its two.
 */
export interface CrossingStats {
  fords:   number
  bridges: {
    kind:      'foot' | 'cart'
    over:      'beck' | 'tide'
    x:         number
    z:         number
    span:      number
    wet:       number
    deck:      number
    freeboard: number
    course:    number | null
    routes:    number
  }[]
  refused: { tidal: number, dry: number, wide: number, uneven: number, budget: number }
}

/**
 * The bridges, and the crossings that were left wet.
 *
 * The one block here whose interesting number is the *refusal*, and it is
 * reported as three counts rather than one blank because the three mean
 * entirely different things. `tidal` is the survey working correctly — the
 * channel down there is an inlet and a farm keeps a boat for it. `dry` is a
 * way meeting the beck up where the cut has not opened yet, which is a reading
 * about the *course* rather than about the crossing. `wide` is a beck that has
 * outgrown a plank, which is a finding about the terrain. `budget` is
 * `crossing.most` biting, and a `budget` that climbs across runs is the
 * network growing legs over one stream.
 */
export function crossingsOf (
  survey: CrossingSurvey,
  worldX: Project,
  worldZ: Project,
): CrossingStats {
  const refused = { tidal: 0, dry: 0, wide: 0, uneven: 0, budget: 0 }

  for (const ford of survey.fords)
    if (ford.refused)
      refused[ford.refused] += 1

  return {
    fords:   survey.fords.length,
    refused,
    bridges: survey.bridges.map(bridge => ({
      kind:      bridge.kind,
      x:         round(worldX(bridge.x)),
      z:         round(worldZ(bridge.z)),
      span:      round(bridge.span, 2),
      wet:       round(bridge.wet, 2),
      deck:      round(bridge.deck, 2),
      freeboard: round(bridge.freeboard, 2),
      over:      bridge.over,
      course:    bridge.course === null ? null : round(bridge.course, 3),
      routes:    bridge.routes,
    })),
  }
}

/**
 * The march round the hill, and how much of the ring it actually is.
 *
 * `length` against `circuit` is the whole of this line's value: the contour is a
 * fact about the ground and moves only when the terrain does, while the built
 * share moves whenever anything else in the composition steps onto it. Reported
 * as two numbers rather than a percentage so a reader can see which of them
 * changed.
 */
export function dykeOf (
  dyke:   HeadDyke | null,
  worldX: Project,
  worldZ: Project,
): CompositionStats['dyke'] {
  return dyke && {
    x:        round(worldX(dyke.summit.x)),
    z:        round(worldZ(dyke.summit.z)),
    level:    round(dyke.level, 2),
    length:   round(dyke.length),
    circuit:  round(dyke.circuit),
    runs:     dyke.runs.length,
    gates:    dyke.gates.length,
    encloses: round(dyke.encloses),
  }
}

/** The hut on the outer rock, and the freeboard the search dealt it. */
export function croftOf (
  site:   CroftSite | null,
  worldX: Project,
  worldZ: Project,
): CompositionStats['croft'] {
  return site && {
    x:           round(worldX(site.x)),
    z:           round(worldZ(site.z)),
    freeboard:   round(site.freeboard, 2),
    isle:        site.isle,
    fromHarbour: round(site.fromHarbour),
  }
}

/**
 * The pool, and how much water is actually in it.
 *
 * `wetted` is the measurement. The sheet is drawn to the full radius and
 * occluded by the bank, so a basin that stopped holding water draws exactly as
 * it did before and shows up nowhere but here.
 */
export function tarnOf (
  tarn:   Tarn | null,
  field:  HeightField,
  worldX: Project,
  worldZ: Project,
): CompositionStats['tarn'] {
  return tarn && {
    x:      round(worldX(tarn.x)),
    z:      round(worldZ(tarn.z)),
    level:  round(tarn.level, 2),
    wetted: round(tarnWetted(tarn, field.heightAt), 1),
    spread: round(tarn.spread, 2),
  }
}

/**
 * The pier, and the two numbers that say whether it is one.
 *
 * `depth` is the measurement that matters and it is the one a still cannot give
 * you: the whole point of the trestle is that it reaches water a keel can lie
 * in, and water is opaque from above. A pier drawn out over a shelf that never
 * dropped away looks exactly like a pier that works — the deck is level either
 * way — so a `berth` that a retuned falloff quietly stopped meeting shows up
 * here and nowhere else.
 *
 * `bents` is the second half of the same question. A pier of two bents is a
 * bank that shelved off a cliff, which is a real coast and a suspicious one on
 * an island whose harbour was chosen for being sheltered.
 */
export function pierOf (
  pier:   Pier | null,
  worldX: Project,
  worldZ: Project,
): CompositionStats['pier'] {
  if (!pier)
    return null

  const head = pierHead(pier)

  return {
    x:      round(worldX(head.x)),
    z:      round(worldZ(head.z)),
    length: round(pier.length, 1),
    depth:  round(pier.depth, 2),
    deck:   round(pier.deck, 2),
    bents:  pier.bents.length,
  }
}

/**
 * The arm, and the number that says whether it does anything.
 *
 * `shelter` is to a breakwater what `standing` is to a weir and `depth` is to a
 * pier: the one measurement that separates a structure from a shape. All three
 * are invisible in a still — a photograph of an arm shows stone in water
 * whether the water behind it is quiet or not — and all three are the reason
 * `scape:map` is read before `scape:diff` rather than after it.
 */
export function moleOf (
  mole:   Mole | null,
  worldX: Project,
  worldZ: Project,
): CompositionStats['mole'] {
  if (!mole)
    return null

  const head = moleHead(mole)

  return {
    x:        round(worldX(head.x)),
    z:        round(worldZ(head.z)),
    length:   round(mole.length, 1),
    elbow:    round(mole.elbow, 1),
    stations: mole.stations.length,
    crest:    round(mole.crest, 2),
    fetch:    Math.round(mole.fetch),
    shelter:  round(mole.shelter, 1),
  }
}

/**
 * The trap, and the number that says whether the sea ever shows it.
 *
 * `standing` is the measurement no still can give you, and it is the weir's
 * equivalent of the pier's `depth`. A trap is built in the band between the two
 * tides, so what it looks like depends entirely on when you look: the same wall
 * is a ring of stone on a drained flat at low springs and nothing at all at high
 * water. Metres of crest over low springs is the one figure that is true at
 * every state of the tide, and a retune that quietly drowned the pound would
 * show up here and in no capture.
 *
 * `turn` is the second half of the same question. A weir turned hard off its
 * harbour is a trap that found its flat somewhere along the coast rather than in
 * the cove — a real answer on a shore like this one, and worth seeing in a
 * number rather than discovering in a still.
 */
export function weirOf (
  weir:   Weir | null,
  config: ScapeConfig,
  worldX: Project,
  worldZ: Project,
): CompositionStats['weir'] {
  if (!weir)
    return null

  return {
    x:        round(worldX(weir.head.x)),
    z:        round(worldZ(weir.head.z)),
    lead:     round(weir.lead, 1),
    pound:    round(weir.pound, 2),
    turn:     Math.round(weir.turn),
    standing: round(
      weirStanding(weir, config.terrain.waterLevel, config.tide.range, config.weir.height),
      2,
    ),
  }
}

/** The cutting, and how much of its face is standing. */
export function peatOf (
  peat:   PeatBank | null,
  field:  HeightField,
  worldX: Project,
  worldZ: Project,
): CompositionStats['peat'] {
  return peat && {
    x:        round(worldX(peat.x)),
    z:        round(worldZ(peat.z)),
    level:    round(peat.level, 2),
    spread:   round(peat.spread, 2),
    standing: round(peatFaceStanding(peat, field.heightAt), 2),
  }
}

/**
 * The crossing, and how much of the tide stands over it.
 *
 * The measurement here is a pair rather than a single number, because a causeway
 * is defined by the *band* its crest sits in: covered at the quarters of the
 * month it is a ford, covered at neither end of it a mole. Both are read from
 * the closed form in `landscape/causeway.ts` rather than by marching a clock, so
 * this line and `causeway.test.ts` cannot disagree about what covered means.
 */
export function causewayOf (
  causeway: Causeway | null,
  config:   ScapeConfig,
  worldX:   Project,
  worldZ:   Project,
): CompositionStats['causeway'] {
  if (!causeway)
    return null

  const freeboard = causeway.crest - config.terrain.waterLevel

  return {
    x:        round(worldX((causeway.shore.x + causeway.head.x) * 0.5)),
    z:        round(worldZ((causeway.shore.z + causeway.head.z) * 0.5)),
    isle:     causeway.isle,
    crossing: round(causeway.crossing, 1),
    crest:    round(freeboard, 2),
    springs:  round(causewayCover(freeboard, tideAmplitudeAt(1, config.tide)), 2),
    neaps:    round(causewayCover(freeboard, tideAmplitudeAt(0, config.tide)), 2),
  }
}

/**
 * The hull out on the low rock, and the two numbers that say which rock it is.
 *
 * `freeboard` is the reading worth watching, and it is the only one here that is
 * a claim rather than a position: the search is written to take the *lowest*
 * qualifying rock in the ring, so a freeboard that climbs is a search that has
 * quietly started choosing the rocks a boat can see — the beacon's rocks. `fall`
 * is the other half, and a fall that has grown is a hull bridging a hollow she
 * was never meant to be balanced over.
 */
export function wreckOf (
  site:   WreckSite | null,
  worldX: Project,
  worldZ: Project,
): CompositionStats['wreck'] {
  return site && {
    x:         round(worldX(site.x)),
    z:         round(worldZ(site.z)),
    freeboard: round(site.freeboard, 2),
    fall:      round(site.fall, 2),
    turn:      site.turn,
    reach:     round(site.reach),
    isle:      site.isle,
  }
}

/**
 * The cart's day, as the four numbers no still can give you.
 *
 * Every one of them is invisible in a picture, and between them they are the
 * whole of what this system is. A frame shows a cart somewhere on a road; it
 * cannot show that the road is worked eight months of the year and shut for the
 * other four, that today's window opens at a particular hour, or — the one that
 * actually fails — that the round is a few metres too long for the longest day
 * this latitude has and *no* frame anywhere in the year has a cart in it.
 *
 * `worked` is the reading that matters. A reach retuned down, a track that grew
 * with the island, a latitude pushed north: any of the three closes the road,
 * and all three leave a scape that builds, draws, lints and looks exactly as it
 * did. This is the field that moves.
 */
export function carterOf (
  landmass: LandmassSurvey,
  world:    HeightField,
  config:   ScapeConfig,
): CompositionStats['carter'] {
  const { latitude, axialTilt } = config.daylight
  const { reach, day }          = config.carter
  const length                  = planCarterRound(landmass, world)?.length ?? 0
  const span                    = carterWindow(dayLength(config.season.time, latitude, axialTilt), day)
  const today                   = carterJourney(config.daylight.time, span, length, reach)

  let worked = 0

  // Weekly rather than per frame: the window is a smooth function of the year
  // and the question is what share of it the road is open, not which afternoon
  // it shut on.
  for (let week = 0; week < WEEKS; week += 1) {
    const light = dayLength(week / WEEKS, latitude, axialTilt)

    if (carterJourney(0.5, carterWindow(light, day), length, reach).out)
      worked += 1
  }

  return {
    round:  round(length * 2, 1),
    worked: round(worked / WEEKS, 2),
    window: span > 0 ? round(span, 2) : 0,
    loads:  carterLoads(span, length, reach),
    at:     today.out ? round(today.distance, 1) : null,
    moving: today.moving,
  }
}

/** Samples of the year the working season is counted over. One a week. */
const WEEKS = 52


/**
 * The field pattern: ploughed strips and metres of furrow.
 *
 * On the readout rather than left to the picture because it is exactly the
 * kind of thing a still cannot judge. A plot that shrank past twice the rig
 * spacing stops carrying rigs at all, silently — the field is still brown,
 * still the right size and simply no longer worked — and the only place that
 * shows is a count that went to zero while `plots` stayed at four.
 */
export interface RigStats {
  count:  number
  length: number

  /**
   * Fields in each course, in {@link COURSES} order.
   *
   * On the readout for the same reason the count is, one question further on.
   * The rotation is dealt round the plots in the order they were *sited*, and
   * nothing about the siting knows the cycle exists — so a seed that happens
   * to place one field is a seed whose whole infield is in one course, and a
   * rotation shorter or longer than the farm has fields is a farm that never
   * shows one of them. Both are legitimate worlds and both are invisible in a
   * still, which is exactly the shape of thing this block is for.
   */
  courses: Record<Course, number>
}

export function rigsOf (plots: readonly Plot[], layout: RigLayout): RigStats {
  const rigs = layoutRigs(plots, layout)

  // Counted off the plots rather than off the rig groups, because a field too
  // small to carry a strip is still a field in a course, and the one place
  // that would show is this line disagreeing with `plots` beside it.
  return {
    count:   rigs.length,
    length:  round(rigLength(rigs), 1),
    courses: Object.fromEntries(
      COURSES.map(course => [ course, plots.filter(plot => plot.course === course).length ]),
    ) as Record<Course, number>,
  }
}
