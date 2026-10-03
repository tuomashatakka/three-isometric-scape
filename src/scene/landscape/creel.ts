import { createSeededRng } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { toWorld } from './archipelago.ts'
import type { ArchipelagoSurvey, LandmassSurvey } from './archipelago.ts'
import type { Vec2 } from './path.ts'


/**
 * Where the pots are shot, and what each float rides on.
 *
 * The half of the creel fishery with no mesh in it. `config-creel.ts` states
 * the rule — a depth of water and a distance from home — and this is the search
 * that applies it to the ground the scape actually draws.
 * `landscape/creels.ts` is the half that puts one `InstancedMesh` over the
 * answer.
 *
 * ### a string is shot along the contour, because that is where the ground is
 *
 * The first cut of this walked each candidate bearing straight out from the
 * jetty and shot pots down it, which is how a boat leaves a harbour and is not
 * how it shoots gear. These coasts shelve from the waterline to a nine-metre
 * seabed inside a couple of bays, so the band between {@link CreelGroundConfig
 * .sill} and `deep` is a *ring* a dozen metres wide — and a row shot across it
 * is four pots long before the bottom falls out from under it. Every harbour in
 * the archipelago came back with the minimum string, on one bearing, which is
 * the shape of a rule rather than the shape of a fishery.
 *
 * So the line follows the depth it was shot in. The bearing out of the harbour
 * only decides *where the string starts*; from there each pot is stepped along
 * the contour — square to the local gradient of the seabed, with the drift back
 * onto the target depth taken out at every step, which is {@link settle}. That
 * is physically what a backline is, and it is the difference between gear
 * somebody shot and gear somebody dropped.
 *
 * ### and no two of a harbour's strings are on the same ground
 *
 * Every bearing that qualifies is scored, the longest first, and a candidate
 * whose line comes within {@link GAP} metres of a string already kept is thrown
 * away rather than shortened. Without it the strings out of one harbour all
 * trace the same contour from starts a few degrees apart and lie on top of one
 * another, which from above is one string drawn four times.
 *
 * Pure, and free of `three`: the ground is surveyed here and drawn in
 * `landscape/creels.ts`, so `scape:map` reports every harbour's fishery
 * without building a vertex of one.
 */

/** One pot on a backline, in world metres. */
export interface CreelPot {

  /** The island whose harbour works it, so the map can say which coasts fish. */
  island: string

  x: number
  z: number

  /** Absolute world height of the seabed it is sitting on. What the tide is measured against. */
  bed: number

  /** Metres out along the backline from the inshore end. */
  along: number

  /** Where this float is in the swell, 0..1. Dealt so a string does not bob as one bar. */
  phase: number
}

/** One string of pots, shot on one bearing out of one harbour. */
export interface CreelString {
  island: string

  /** The inshore end, in world metres — the first pot of the row. */
  root: Vec2

  /** The bearing it was shot on, in radians. */
  angle: number

  /** Metres from the first pot to the last. */
  length: number

  pots: readonly CreelPot[]
}

/** One harbour's gear, and whether the search found it any ground at all. */
export interface CreelFleet {
  island: string

  /**
   * Bearings the ground qualified on before the tier's budget and the spread
   * were applied.
   *
   * The structural finding, and the reason it is counted rather than inferred:
   * `offered` at zero is a coast with no creel ground on it, which is a fact
   * about the shelf; `offered` high with `strings` low is the budget, which is
   * a fact about the tier.
   */
  offered: number

  strings: readonly CreelString[]
}

/**
 * Bearings the ground is searched on, out of each harbour.
 *
 * Five degrees. Finer buys nothing — {@link SPREAD} throws away anything inside
 * twenty-five degrees of a string already kept — and coarser starts missing the
 * one shelving gully on a steep coast, which is exactly the bearing a fisherman
 * would be working.
 */
const BEARINGS = 72

/** Metres between probes on the walk out to the start of the ground. */
const PROBE = 2

/**
 * The fewest pots worth shooting as a string.
 *
 * A craft fact rather than a tuning knob, which is why it is here and not in
 * the config — the same reasoning `SHORTEST_RUN` in `pier.ts` is written down
 * with. Under four pots the row is not a fleet, it is gear somebody dropped,
 * and from any zoom this scape is read at it is a scatter of dots that says
 * nothing about anybody working.
 */
const FEWEST_POTS = 4

/**
 * Metres of water a float needs under it to be floating.
 *
 * Its own number rather than the float's radius, because what this decides is a
 * *reading* rather than a collision: under a quarter of a metre the mark is
 * lying on wet ground with the sea round its waist, and the placement draws it
 * sitting on the bottom. See {@link creelAground}.
 */
const GROUNDED = 0.25

/**
 * Metres of water over a pot, at a state of the tide.
 *
 * The whole of the tide coupling, and it is a subtraction rather than a state —
 * the same discipline `kelpDepth` and `sealClearance` are held to. Nothing here
 * integrates and nothing here remembers.
 */
export function creelDepth (pot: CreelPot, waterLevel: number, tideLevel: number): number {
  return waterLevel + tideLevel - pot.bed
}

/**
 * Whether the sea has left this float sitting on the ground.
 *
 * The one state in the system the tide can change, and it is worth having a
 * name because it is the finding `scape:map` reports: a fishery whose gear is
 * aground at every state of the tide was shot in the wrong water, and a fishery
 * that is never aground is one a spring tide has stopped mattering to.
 */
export function creelAground (pot: CreelPot, waterLevel: number, tideLevel: number): boolean {
  return creelDepth(pot, waterLevel, tideLevel) < GROUNDED
}

/** What one bearing's shot out of a harbour needs to know. */
interface Shot {
  survey:   ArchipelagoSurvey
  landmass: LandmassSurvey
  config:   ScapeConfig
  from:     Vec2
  angle:    number

  /**
   * Every other harbour in the archipelago, in world metres.
   *
   * Here because `creel.range` alone is a circle, and a circle drawn round one
   * harbour on this archipelago reaches another island's shelf: at the default
   * seed the ridge's boat found a four-pot string on the home island's south
   * coast, a hundred and fifty metres from its own pier and fifty from
   * somebody else's. Gear belongs to the harbour nearest it — that is how a
   * coast divides its ground, and it needs no second knob.
   */
  others: readonly Vec2[]
}

/** Metres either side of a point the seabed's slope is read over. */
const GRADIENT_STEP = 1

/** Passes of {@link settle} per pot. Three is well inside a centimetre on this field. */
const SETTLE_PASSES = 3

/** The furthest one pass of {@link settle} will move a pot sideways, in metres. */
const SETTLE_REACH = 6

/**
 * How far off its own contour a backline may wander, as a share of the window.
 *
 * A seventh either side, so no string spans more than two sevenths of the band
 * between {@link CreelGroundConfig.sill} and `deep`. It is the number that
 * makes "shot along the ground" a fact rather than a hope: without it a trace
 * that lost its contour at a corner of the shelf kept going, stayed inside the
 * window — which is four and a half metres wide — and came out as a line down
 * the slope that no number in `scape:map` distinguished from a line along it.
 */
const HOLD = 1 / 7

/** Newton steps on the bearing per pot. See {@link trace}. */
const SWING_PASSES = 4

/** Radians either side of a bearing the depth ahead is read over. */
const SWING_STEP = 0.05

/**
 * The most a backline turns between one pot and the next, in radians.
 *
 * A third of a right angle over a spacing is as tight a bend as a rope laid on
 * the bottom will take, and it is also the clamp that keeps a trace off a
 * contour it cannot follow: at a corner of the shelf the solver asks for a turn
 * it cannot have, the line walks off the depth window instead, and the string
 * ends there — which is the honest answer rather than a line doubling back over
 * the gear behind it.
 */
const MAX_SWING = Math.PI / 6

/**
 * Metres kept between two strings out of the same harbour.
 *
 * Three bays, measured pot to pot across the whole of both lines rather than
 * between the two starts: two contour traces that begin forty metres apart can
 * still converge, and what matters is whether a boat hauling one fouls the
 * other.
 */
const GAP = 24

/**
 * Walk a pot back onto the depth it is supposed to be shot in.
 *
 * A contour trace drifts: the step is square to the gradient *here*, and by the
 * time it has been taken the gradient is somewhere else. Three Newton steps
 * along the slope take that back out, which is what keeps a backline on one
 * depth rather than wandering down the shelf over eighty metres.
 *
 * The move is clamped, because a nearly flat patch of seabed divides by nearly
 * nothing and would fling the pot across the island.
 */
function settle (depthAt: (x: number, z: number) => number, at: Vec2, target: number): Vec2 {
  let { x, z } = at

  for (let pass = 0; pass < SETTLE_PASSES; pass += 1) {
    const here = depthAt(x, z)
    const gx   = (depthAt(x + GRADIENT_STEP, z) - depthAt(x - GRADIENT_STEP, z)) / (GRADIENT_STEP * 2)
    const gz   = (depthAt(x, z + GRADIENT_STEP) - depthAt(x, z - GRADIENT_STEP)) / (GRADIENT_STEP * 2)
    const sq   = gx * gx + gz * gz

    if (sq < 1e-6)
      break

    const scale = (target - here) / sq
    const moveX = gx * scale
    const moveZ = gz * scale
    const span  = Math.hypot(moveX, moveZ)
    const held  = span > SETTLE_REACH ? SETTLE_REACH / span : 1

    x += moveX * held
    z += moveZ * held
  }

  return { x, z }
}

/**
 * The next pot along the contour, exactly {@link CreelGroundConfig.spacing}
 * metres from the last one.
 *
 * Posed as a question about a *bearing* rather than about a point, which is
 * what makes both halves of it exact at once: the pot is on the circle of one
 * spacing round the pot behind it by construction, so the only thing left to
 * solve is which way round that circle keeps it on its depth. A few Newton
 * steps on the angle do it.
 *
 * The first cut solved for the point instead — step, correct back onto the
 * depth, re-measure the chord — and the two pulled against each other: the
 * correction moved the pot off its distance and the re-measure moved it off its
 * depth. It settled at five metres of gap where eight had been authored, which
 * is a knob quietly meaning something else, and then at eight metres of gap
 * with two and a half metres of depth across one string, which is a backline
 * shot down the shelf rather than along it.
 *
 * The swing is clamped, so a contour this trace cannot follow comes out as a
 * line that stops rather than a line that doubles back on the gear behind it.
 */
function trace (
  depthAt: (x: number, z: number) => number,
  from:    Vec2,
  heading: number,
  spacing: number,
  target:  number,
): number {
  const at = (angle: number): number =>
    depthAt(from.x + Math.cos(angle) * spacing, from.z + Math.sin(angle) * spacing)

  let angle = heading

  for (let pass = 0; pass < SWING_PASSES; pass += 1) {
    const off   = at(angle) - target
    const slope = (at(angle + SWING_STEP) - at(angle - SWING_STEP)) / (SWING_STEP * 2)

    if (Math.abs(slope) < 1e-4)
      break

    const turn = off / slope

    angle -= Math.max(-MAX_SWING, Math.min(MAX_SWING, turn))
  }

  return angle
}

/**
 * Every pot one bearing will carry, traced along the contour it starts on.
 *
 * Empty when the bearing offers nowhere to start — a bearing pointing back at
 * the island, or one whose ground never comes right inside the boat's range —
 * and when the trace runs off the band before {@link FEWEST_POTS} pots are
 * down.
 */
function shootString ({ survey, landmass, config, from, angle, others }: Shot): CreelPot[] {
  const { sill, deep, spacing, pots, range, clear } = config.creel
  const { waterLevel }                              = survey
  const seed                                        = createSeededRng(config.seed ^ 0x6c17)
    .fork(`creel-${landmass.id}-${Math.round(angle * 1_000)}`)

  // The depth *this* string is shot on, dealt inside the window rather than
  // taken at its middle. A harbour works inshore ground and offshore ground —
  // every string on one contour is a fishery with one opinion about where the
  // crab is — and it is also what keeps `creel.sill` and `creel.deep` honest:
  // a pair of knobs that only ever decided their own midpoint would be one
  // knob with a wide collar on it. The inset is {@link HOLD}'s, so a string
  // dealt the shallow end still has room to wander without leaving the window.
  const target = sill + (deep - sill) * (HOLD + seed.next() * (1 - HOLD * 2))

  const depthAt = (x: number, z: number): number => waterLevel - survey.field.heightAt(x, z)

  // Out to where the ground comes right. The harbour's own cut is spent rather
  // than stepped round, exactly as the kelp spends a place it may not plant in:
  // a string that began the moment it cleared the jetty would be shot across
  // the fairway it is supposed to leave alone.
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  let head: Vec2 | null = null

  for (let out = clear; out <= range + 1e-6; out += PROBE) {
    const x     = from.x + cos * out
    const z     = from.z + sin * out
    const depth = depthAt(x, z)

    if (depth >= sill && depth <= deep) {
      head = settle(depthAt, { x, z }, target)
      break
    }
  }

  if (!head)
    return []

  // Square to the bearing it was found on, which on a coast is along the shore.
  // Which of the two ways round is not a choice worth making: the sweep tries
  // every bearing, so the other direction is another candidate's trace.
  let heading = angle + Math.PI / 2
  let at      = head

  const row: CreelPot[] = []

  for (let index = 0; index < pots; index += 1) {
    const depth = depthAt(at.x, at.z)

    // Off the ground, or off the end of the boat's tether. A backline is shot
    // in one run — it does not step over a bank and resume on the far side of
    // it, and a row with a hole in it is two strings the boat only hauled once.
    if (depth < sill || depth > deep)
      break

    // And the tighter rule the *line* has to keep, as opposed to the one each
    // pot has to: a backline is shot along one depth, so a trace that has
    // wandered a seventh of the window off the contour it started on has
    // stopped following the ground. It ends there rather than walking down the
    // shelf inside a window wide enough to hide it — which is exactly what the
    // first contour-following cut did, and what `scape:map`'s `water` pair
    // could not have told apart from a shelving coast.
    if (Math.abs(depth - target) > (deep - sill) * HOLD)
      break

    // Both ends of the tether, and the near one is not a formality: a contour
    // traced round a headland comes back toward the harbour it started from,
    // and a pot that curled into the fairway is a rope round somebody's
    // propeller. The string stops at the cut rather than stepping over it.
    const home = Math.hypot(at.x - from.x, at.z - from.z)

    if (home > range || home < clear)
      break

    // And off the neighbours' ground. See {@link Shot.others}.
    if (others.some(other => Math.hypot(at.x - other.x, at.z - other.z) < home))
      break

    row.push({
      island: landmass.id,
      x:      at.x,
      z:      at.z,
      bed:    waterLevel - depth,
      along:  index * spacing,
      phase:  seed.next(),
    })

    const turned = trace(depthAt, at, heading, spacing, target)

    at = {
      x: at.x + Math.cos(turned) * spacing,
      z: at.z + Math.sin(turned) * spacing,
    }
    heading = turned
  }

  return row.length >= FEWEST_POTS ? row : []
}

/** Every bearing out of one harbour that the shelf and the range both allow. */
function offer (
  survey:   ArchipelagoSurvey,
  landmass: LandmassSurvey,
  config:   ScapeConfig,
  from:     Vec2,
  others:   readonly Vec2[],
): CreelString[] {
  const step                   = Math.PI * 2 / BEARINGS
  const offered: CreelString[] = []

  for (let bearing = 0; bearing < BEARINGS; bearing += 1) {
    const angle = bearing * step
    const pots  = shootString({ survey, landmass, config, from, angle, others })

    if (!pots.length)
      continue

    offered.push({
      island: landmass.id,
      root:   { x: pots[0].x, z: pots[0].z },
      angle,
      length: pots[pots.length - 1].along,
      pots,
    })
  }

  return offered
}

/**
 * Take the strings a harbour will actually shoot, spread round its ground.
 *
 * Longest first — the ground that holds the most gear is the ground anybody
 * works — with {@link GAP} metres kept between every pot of one string and
 * every pot of another, and the bearing breaking the ties so the answer is the
 * same on every run. See the note on spreading at the top of the file for what
 * this stops.
 */
function spread (offered: readonly CreelString[], budget: number): CreelString[] {
  const ordered = [ ...offered ].sort((first, second) =>
    second.pots.length - first.pots.length || first.angle - second.angle)

  const kept: CreelString[] = []

  for (const string of ordered) {
    if (kept.length >= budget)
      break

    const fouls = kept.some(other => other.pots.some(there =>
      string.pots.some(here => Math.hypot(here.x - there.x, here.z - there.z) < GAP)))

    if (!fouls)
      kept.push(string)
  }

  return kept
}

/**
 * Every string of creels in the archipelago, on the harbours that have ground
 * for one.
 *
 * Deterministic: one rng forked per island and bearing off the scape's seed, so
 * a coast that gains a fleet does not reshuffle the swell phases of every other
 * one — the same discipline every scatter in the scape is held to.
 *
 * An island with no landing gets no fishery, and that is the honest answer
 * rather than a missing case: gear belongs to a harbour, and an island nobody
 * lands on has nobody to haul it.
 *
 * @param budget Strings one harbour may work, from the tier. 0 is a sea with no
 *   gear in it, and the whole system is then absent rather than cheap.
 */
export function planCreels (
  survey: ArchipelagoSurvey,
  config: ScapeConfig,
  budget: number,
): readonly CreelFleet[] {
  const strings = Math.max(0, Math.floor(budget))

  if (strings < 1 || config.creel.deep <= config.creel.sill || config.creel.spacing <= 0)
    return []

  // Every harbour first, because where one boat may shoot depends on where the
  // others are — see {@link Shot.others}.
  const harbours = new Map<string, Vec2>()

  for (const landmass of survey.landmasses)
    if (landmass.survey.landing)
      harbours.set(landmass.id, toWorld(landmass, landmass.survey.landing))

  return survey.landmasses.map(landmass => {
    const landing = harbours.get(landmass.id)

    if (!landing)
      return { island: landmass.id, offered: 0, strings: []}

    const others  = [ ...harbours ].filter(([ id ]) => id !== landmass.id).map(([ , at ]) => at)
    const offered = offer(survey, landmass, config, landing, others)

    return { island: landmass.id, offered: offered.length, strings: spread(offered, strings) }
  })
}

/** Every pot in the archipelago, flattened out of the fleets that work them. */
export function creelPots (fleets: readonly CreelFleet[]): readonly CreelPot[] {
  return fleets.flatMap(fleet => fleet.strings.flatMap(string => string.pots))
}
