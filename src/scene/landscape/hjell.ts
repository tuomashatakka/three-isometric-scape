import { smoothstep } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import type { ArchipelagoSurvey, LandmassSurvey } from './archipelago.ts'
import { toWorld } from './archipelago.ts'
import { driftDirection } from './drift.ts'
import type { Obstacle } from './footpath.ts'
import type { Spot } from './landing.ts'
import type { Vec2 } from './layout.ts'
import { hypot } from '../hypot.ts'


/**
 * One trestle of a drying rack, in the island's own local frame.
 *
 * The level is carried rather than re-sampled, and that is the only interesting
 * thing about this record. Two readers need the ground under a leg — the
 * dressing, which stands the timber on it, and the catch planner, which hangs
 * the fish a fixed height above it — and two answers to how deep a foot sits is
 * a row of cod floating beside its own rail.
 */
export interface HjellStation extends Vec2 {

  /** Ground height under the feet, in metres. */
  level: number
}

/**
 * The run of racks one island's harbour dries its catch on.
 *
 * Pure, and free of `three`, so `scape:map` reports the run without building a
 * vertex of it.
 */
export interface HjellRun {

  /**
   * The bearing the run is carried along, in radians.
   *
   * Not a choice the search makes. It is the prevailing wind's own heading,
   * because a rack laid across the weather is a fence and a rack laid along it
   * is a rack — see `config-hjell.ts`. The search picks *where* the line goes,
   * never which way it points.
   */
  angle: number

  /** Metres from the harbour bank to the nearest trestle. */
  fromBank: number

  /** Metres of open ground measured upwind of the windward trestle. */
  fetch: number

  /** The worst fall between any two feet of the run, in metres. */
  fall: number

  /**
   * The world height of the top rail, in metres.
   *
   * One number for the whole run, and it is the thing that makes a rack on a
   * slope a rack rather than a staircase. The rails are level because a rail
   * that followed the ground would tip its load off the low end; what follows
   * the ground is the *legs*, cut longer downhill, and `hjell.fall` is how much
   * extra timber the farm is willing to cut rather than how flat the ground has
   * to be.
   *
   * Carried here rather than recomputed by each reader for the reason
   * {@link HjellStation.level} is: the geometry stands the timber under it and
   * the catch hangs off it, and two answers is a row of cod floating beside its
   * own rail.
   */
  deck: number

  /** Every trestle, windward end first. */
  stations: readonly HjellStation[]

  /** Metres between the first trestle and the last. */
  length: number
}

/** One fish on a rail, in world metres. */
export interface HjellFish {
  x: number
  y: number
  z: number

  /** The yaw the fish hangs at — along the rail, give or take. */
  angle: number

  /** Metres of fish, as a scale on the built prop. */
  size: number

  /**
   * Where in the loading this one sits, 0..1.
   *
   * The run does not fill all at once: a rack is loaded from one end as the
   * boats come in. Dealt across the stations so the windward bays carry fish a
   * fortnight before the lee ones and are stripped a fortnight after, which is
   * the same trick the bird cliff plays with its tiers and for the same reason —
   * four hundred fish appearing between two frames is a thing a diff catches.
   */
  keen: number
}

/**
 * How much ground the run claims either side of its line, in metres.
 *
 * Wide enough to hold a trestle and the person loading it. Held in step with
 * the geometry by the test beside this file rather than by hope, the same way
 * `SMOKEHOUSE_FOOTING` is.
 */
export const HJELL_CLEARING = 1.9

/** Bearings swept around the bank, and rings of distance out from it. */
const BEARINGS = 20
const RINGS    = 8

/** Metres a fetch walk steps upwind, and the clearance it allows the top rail. */
const FETCH_STEP  = 1.5
const FETCH_CLEAR = 0.4

/**
 * How far below the top rail the lower one hangs, as a share of the height.
 *
 * Exported because two modules measure against it — the geometry that builds
 * the rails and the planner that hangs fish from them — and a rail at two
 * heights is a row of fish growing out of the air beside it.
 */
export const HJELL_LOWER_RAIL = 0.62

/**
 * Metres the fish's own origin sits below the centreline of a rail.
 *
 * Zero, and named rather than dropped, because the number is a decision and not
 * an absence: a stockfish is folded *over* its pole, so the point where it meets
 * what carries it is the pole itself — see the note at the head of
 * `props/hjell.ts`. Anything positive hangs the fold under the rail it is
 * supposed to be sitting on.
 */
const HANG = 0

/**
 * How far out from the run's centreline each rail lies, in metres.
 *
 * Exported because two modules measure against it and they have to agree: the
 * geometry lays the poles here and the planner hangs the fish on them. The first
 * cut had the two numbers unrelated — the rails at 0.21 and the fish at 0.085 —
 * and the result was four rows of cod hanging in the air *between* the poles
 * they were supposed to be over, which is invisible from above and obvious from
 * the side. A trestle carries four poles, two at each height, so a run carries
 * four rows of fish.
 */
export const HJELL_BEARER = 0.21

export interface HjellSearch {

  /** The ground as the height field leaves it, in metres. */
  ground(x: number, z: number): number
  waterLevel: number

  /** The bearing the wind blows toward, in degrees — `config.wind.bearing`. */
  bearing: number

  /** Everything in `config.hjell` the search is allowed to read. */
  height:    number
  bays:      number
  spacing:   number
  setback:   number
  reach:     number
  freeboard: number
  fall:      number
  fetch:     number
}

/** Where a station sits, given the run's centre and its offset along the line. */
function stationAt (
  search: HjellSearch,
  centre: Vec2,
  along:  Vec2,
  offset: number,
): HjellStation {
  const x = centre.x + along.x * offset
  const z = centre.z + along.z * offset

  return { x, z, level: search.ground(x, z) }
}

/**
 * Metres of open ground upwind of a point before something stands over the rail.
 *
 * Walked rather than sampled once, because what shuts a rack off from the
 * weather is not a far hill but the first shoulder — and a single probe at the
 * far end steps straight over it. The walk stops at {@link HjellSearch.fetch},
 * so the number this returns is a budget met rather than a distance to the next
 * obstruction: a site with open sea upwind of it and a site with a hundred
 * metres of flat machair upwind of it are the same answer, and both are right.
 */
function fetchOf (search: HjellSearch, from: HjellStation, into: Vec2): number {
  const top = from.level + search.height

  for (let walked = FETCH_STEP; walked <= search.fetch; walked += FETCH_STEP)
    if (search.ground(from.x + into.x * walked, from.z + into.z * walked) > top - FETCH_CLEAR)
      return walked - FETCH_STEP

  return search.fetch
}

/**
 * Lay a whole run through a candidate centre, or refuse it.
 *
 * Every foot is tested rather than the centre, which is the lesson the
 * churchyard wall wrote down and the smokehouse's sill repeated: a centre being
 * on dry, level, unclaimed ground says nothing about a line twenty metres long
 * drawn through it. The refusals are cheap-first — claimed ground, then wet
 * ground, then fall — so the expensive fetch walk only runs on a line that is
 * already a line.
 */
function layRun (
  search: HjellSearch,
  centre: Vec2,
  along:  Vec2,
  avoid:  readonly Obstacle[],
): { stations: HjellStation[], fall: number, crest: number } | null {
  const count                    = search.bays + 1
  const span                     = search.bays * search.spacing
  const stations: HjellStation[] = []

  let low  = Infinity
  let high = -Infinity

  for (let index = 0; index < count; index += 1) {
    const station = stationAt(search, centre, along, index * search.spacing - span / 2)

    if (avoid.some(thing =>
      hypot(thing.x - station.x, thing.z - station.z) < thing.radius + HJELL_CLEARING))
      return null

    if (station.level - search.waterLevel < search.freeboard)
      return null

    low  = Math.min(low, station.level)
    high = Math.max(high, station.level)

    if (high - low > search.fall)
      return null

    stations.push(station)
  }

  return { stations, fall: high - low, crest: high }
}

/**
 * The line of ground the island's catch is dried on, or `null` when the harbour
 * has nowhere open enough to put one.
 *
 * `null` is a real answer and not a failure, the same way the smokehouse's and
 * the pier's are: a harbour dug into a hollow with a shoulder upwind of it dries
 * nothing, and gets no racks rather than a rack standing in still air. There is
 * no separate switch — `hjell.height` at 0 takes the timber out of the scape,
 * and raising `hjell.fetch` past what a coast offers takes it out one island at
 * a time.
 *
 * No bearing off the bank is privileged and the run's own heading is never one
 * of the things searched: the sweep is over *where* the line sits and the line
 * always points the way the weather goes. Exposure is a refusal rather than a
 * term in the score, which is the one decision here worth arguing with: a rack
 * that half sees the weather is not half a rack, it is a rack that does not dry
 * fish, and a score would trade that away for a shorter carry on every coast
 * with a shoulder on it. So every candidate that gets scored already has its
 * fetch, and what is left to choose between them is the walk from the boats.
 */
export function findHjellRun (
  search: HjellSearch,
  bank:   Spot,
  avoid:  readonly Obstacle[],
): HjellRun | null {
  if (search.height <= 0 || search.bays < 1 || search.reach <= search.setback)
    return null

  const along = driftDirection(search.bearing)
  const into  = { x: -along.x, z: -along.z }
  const angle = Math.atan2(along.z, along.x)

  let best: HjellRun | null = null
  let bestScore             = -Infinity

  for (let ring = 0; ring < RINGS; ring += 1) {
    const fromBank = search.setback + ring / (RINGS - 1) * (search.reach - search.setback)

    for (let step = 0; step < BEARINGS; step += 1) {
      const around = step / BEARINGS * Math.PI * 2
      const centre = {
        x: bank.x + Math.cos(around) * fromBank,
        z: bank.z + Math.sin(around) * fromBank,
      }
      const laid   = layRun(search, centre, along, avoid)

      if (!laid)
        continue

      // The windward end is the one the wind reaches first, and the run was
      // laid from `-span/2` along the wind's own heading — so the first station
      // is the one upwind of every other.
      const fetch = fetchOf(search, laid.stations[0] as HjellStation, into)

      if (fetch < search.fetch)
        continue

      // Near the bank, and level. A metre of carrying is worth about a
      // handspan of tilt, which is the order a fish-house actually makes the
      // trade in: the catch is heavy and the rails only have to be level
      // enough that nothing slides off them.
      const score = -fromBank - laid.fall * 3

      if (score > bestScore) {
        bestScore = score
        best      = {
          angle,
          fromBank,
          fetch,
          fall:     laid.fall,
          deck:     laid.crest + search.height,
          stations: laid.stations,
          length:   search.bays * search.spacing,
        }
      }
    }
  }

  return best
}

/**
 * How full the racks are at a phase of the year, 0..1.
 *
 * A window round `hjell.peak` rather than one centred on a solstice, which is
 * the whole difference between this curve and the bird cliff's: an auk's year
 * is symmetric about the longest day and a fishing year is not. Ramped at both
 * ends over a fifth of the window, so the coast loads and empties over a
 * fortnight.
 *
 * It integrates nothing and remembers nothing: the year is where the published
 * season says it is, so a still taken with every clock stopped shows the racks
 * that week actually has on them.
 */
export function hjellHung (time: number, hung: number, peak: number): number {
  if (hung <= 0)
    return 0

  if (hung >= 1)
    return 1

  // Distance from the peak round the ring, 0 on the week itself and 0.5 half a
  // year away from it.
  const phase = Math.abs(((time - peak) % 1 + 1.5) % 1 - 0.5)
  const edge  = hung * 0.5

  return 1 - smoothstep(edge * 0.78, edge, phase)
}

/** How much of one fish is on its rail, given the coast's fill and its place in it. */
export function fishHung (hung: number, keen: number): number {
  return Math.max(0, Math.min(1, (hung - keen * 0.5) / 0.5))
}

/** Every seat on one island's run, in world metres. */
function seatsOf (landmass: LandmassSurvey, config: ScapeConfig): HjellFish[] {
  const run = landmass.survey.hjell

  if (!run || config.hjell.fill <= 0)
    return []

  const { stations, angle, deck } = run
  const seats: HjellFish[]        = []
  const perBay                    = Math.round(config.hjell.spacing * config.hjell.fill)

  // Both rails are level, so both rows of fish hang at one height for the whole
  // run — see {@link HjellRun.deck}. The lower rail is a share of the rack's
  // height *below the top one*, which is the same offset the timber is built at.
  const rails = [ deck - HANG, deck - config.hjell.height * (1 - HJELL_LOWER_RAIL) - HANG ]

  for (const [ index, station ] of stations.entries()) {
    if (index === stations.length - 1)
      break

    const next  = stations[index + 1] as HjellStation
    const world = toWorld(landmass, station)
    const ahead = toWorld(landmass, next)
    const keen  = index / Math.max(1, stations.length - 2)

    for (let seat = 0; seat < perBay; seat += 1) {
      const along = (seat + 0.5) / perBay

      for (const [ rail, height ] of rails.entries())
        for (const side of [ -1, 1 ]) {
          const x = world.x + (ahead.x - world.x) * along - Math.sin(angle) * HJELL_BEARER * side
          const z = world.z + (ahead.z - world.z) * along + Math.cos(angle) * HJELL_BEARER * side

          seats.push({
            x,
            y:    height,
            z,
            angle,
            // The lower rail carries the smaller fish, which is what a rack
            // loaded from the top down actually looks like.
            size: rail === 0 ? 1 : 0.86,
            keen,
          })
        }
    }
  }

  return seats
}

/**
 * Every fish on every rack in the archipelago, dealt to the tier's budget.
 *
 * Thinned by stride rather than by island, for the reason the pack ice is: a
 * phone with a third of the seats should get a thinner coast, not two full racks
 * and four bare ones. The stride walks the flattened list, so it takes from
 * every island in proportion to what that island offered.
 */
export function planHjellCatch (
  archipelago: ArchipelagoSurvey,
  config:      ScapeConfig,
  budget:      number,
): readonly HjellFish[] {
  if (budget < 1)
    return []

  const seats = archipelago.landmasses.flatMap(landmass => seatsOf(landmass, config))

  if (seats.length <= budget)
    return seats

  const stride = seats.length / budget

  return Array.from({ length: budget }, (_, index) => seats[Math.floor(index * stride)] as HjellFish)
}
