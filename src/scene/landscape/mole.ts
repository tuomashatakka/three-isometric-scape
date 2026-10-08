import type { Spot } from './landing.ts'
import type { Vec2 } from './path.ts'


/**
 * The arm the landing never had.
 *
 * The settlement has two pieces of water and they have opposite problems, and
 * until now only one of them had been answered.
 *
 * The **harbour** is a cove chosen for shelter, and `landscape/pier.ts` proved
 * how sheltered: on the home island every bearing out of it runs into the far
 * bank inside four metres, which is why the trestle refuses the site and why the
 * fish weir takes it instead. Nothing out there needs protecting, because
 * nothing out there can get out.
 *
 * The **landing** is the other half of that pair and has never been given its
 * own answer. It is sited for a *way out* — the ferry network is routed through
 * it — so it is on open water by construction, and on this archipelago open
 * water means a couple of hundred metres of fetch on the bearings that matter.
 * The jetty standing on it is seven metres of deck on six piles, built as though
 * the sea it stands in were the lake the first version of this scape had.
 *
 * So this is the one structure in the settlement built against the sea rather
 * than into it: a rubble mound tipped out from the shore beside the landing and
 * hooked across in front of it, leaving a pool of water the fleet can lie in.
 *
 * Three questions, in this order:
 *
 * - **where does the sea come from.** A sweep of bearings off the landing, each
 *   walked until it runs into something. The longest run is the fetch, the
 *   fetch-weighted mean of the sweep is the bearing, and a landing whose worst
 *   fetch is under {@link MoleSearch.exposure} is already in shelter — it gets
 *   no arm, because the ground did the work.
 * - **which hand is it built on.** Not decided by a rule. A coast is a curve and
 *   the water in front of it is not a half-plane, so both hands are solved and
 *   the one that shadows more of the sweep wins. See {@link solveMole}.
 * - **how much does it actually shelter.** The arm's own course is put back
 *   under the sweep and every bearing it stands in the way of is counted. An arm
 *   that shadows nothing is a pile of stone, and this refuses rather than builds
 *   one.
 *
 * Pure, and free of `three` — the course is surveyed here and the mound is
 * raised in `props/mole.ts`, so `scape:map` reports the reach and the shelter of
 * every arm in the archipelago without building a vertex of one.
 */

/** One station of the mound, and the bed it is tipped onto. */
export interface MoleStation {

  /** Where the station stands, in the island's own local frame. */
  x: number
  z: number

  /** Bed height under it, in metres. Below the waterline for every station but the root. */
  bed: number

  /** Metres out from the root, measured along the course. */
  along: number
}

/** One arm, carried out from one shore and hooked across one landing. */
export interface Mole {

  /** The shore end, in the island's own local frame. */
  root: Vec2

  /** The bearing the stem is carried out on, in radians. */
  angle: number

  /** The bearing the hook turns onto, in radians. */
  hook: number

  /**
   * Which hand the arm was built on: `+1` for the shore to port of the landing's
   * own bearing, `-1` for the shore to starboard. Also the side of the course
   * the open sea is on, which is what the armour is laid against.
   */
  hand: number

  /** The bearing the open water lies on, in radians, measured from the landing. */
  exposure: number

  /** Metres of open water on the worst bearing of the sweep. */
  fetch: number

  /** Metres along the course where the stem ends and the hook begins. */
  elbow: number

  /** Metres from the root to the head, along the course. */
  length: number

  /** Every station, root first, head last. */
  stations: readonly MoleStation[]

  /** World height of the crest, in metres. */
  crest: number

  /** Degrees of the landing's own sweep the arm now stands in the way of. */
  shelter: number
}

export interface MoleSearch {

  /** The ground as the height field leaves it, in metres. */
  ground(x: number, z: number): number
  waterLevel: number

  /**
   * Metres of open water on the worst bearing before a landing is exposed
   * enough to be worth walling.
   *
   * The switch, and there is no boolean beside it. Raised past what the sweep
   * finds, a landing keeps its bare jetty; raised past what every landing
   * finds, the archipelago has no arms in it. What it must not become is a
   * *shorter* arm — a mound that stops in the shallows is a causeway that was
   * abandoned, and this coast already has one of those.
   */
  exposure: number

  /**
   * Deepest water rubble is tipped into, in metres.
   *
   * The other switch, and on these rock coasts it is the one that decides the
   * *length* of every arm that gets built. A mound is stone falling off the end
   * of the last stone, so where it stops is not where somebody got tired of
   * carting — it is where the bottom went out from under it.
   */
  tipped: number

  /**
   * Furthest the arm is carried, in metres, stem and hook together.
   *
   * **Metres, and they stay metres.** How much stone a settlement this size
   * will move into the sea is a fact about carts and winters, not about how wide
   * the archipelago is — so a world that grows does not grow this.
   */
  reach: number

  /** Metres between stations along the course. */
  station: number

  /** Degrees the hook turns off the stem, across the front of the landing. */
  turn: number

  /** Metres the crest stands over mean water. */
  crest: number

  /**
   * Metres across the crest.
   *
   * Surveyed as well as drawn, because it is what decides whether a bearing is
   * shadowed: the sweep is blocked by a band of stone rather than by a line.
   */
  width: number
}

/**
 * How finely the sea is swept, in degrees.
 *
 * Seven and a half degrees is forty-eight bearings, which is fine enough that a
 * gap between two skerries reads as a gap and coarse enough that the sweep is
 * two thousand height samples rather than ten. It is also the resolution
 * {@link Mole.shelter} is quoted at, so an arm's shelter is always a multiple of
 * it — that is a property of the instrument and not of the stone.
 */
const SWEEP = 7.5

/** How far along a bearing the sweep walks, in metres. */
const STEP = 2

/**
 * Furthest the sweep looks, in metres.
 *
 * A threshold instrument rather than a knob, and metres rather than a share of
 * the world. What it is asking is whether there is open sea off this bank, and
 * past a couple of hundred metres the answer has stopped changing: a bearing
 * with 280 m of water on it and a bearing with 1400 m are the same bearing as
 * far as a rubble mound is concerned, because the sea that reaches the coast off
 * both of them is the sea the wind had room to raise. A world that doubles does
 * not move this, which is the whole reason it is here rather than scaled off
 * `archipelago.worldSize`.
 */
const HORIZON = 280

/**
 * How far along a bearing the search will walk to find the waterline, in metres.
 *
 * The root is offset along the shore from the landing to clear the jetty, and on
 * a curving bank that offset lands inland as often as in the water — so the
 * waterline is searched for either side of the offset point rather than assumed
 * to be at it.
 */
const LANDFALL = 10

/**
 * The shortest arm worth building, in metres.
 *
 * Four stations at the default spacing. Under it the thing standing beside the
 * landing is the jetty built out of stone instead of timber, and the scape
 * already has a jetty. A craft fact rather than a tuning knob, which is why it
 * is here and not in the config: what a reader wants to turn is how exposed a
 * landing has to be, not the point at which a mound stops being an arm.
 */
const SHORTEST_ARM = 10

/**
 * What share of {@link MoleSearch.reach} the stem may spend before it hooks.
 *
 * The stem is the part that gets the arm off the beach and the hook is the part
 * that does the work, so the hook is given the larger half. An arm that spent
 * its whole allowance running straight out is a pier made of rubble: it shadows
 * one bearing of the sweep and shelters nothing.
 */
const STEM_SHARE = 0.45

/** Least water a station may stand in before the run counts as having gone ashore. */
const WETTED = 0.1


/**
 * Walk one bearing out from a point and say how far the open water runs.
 *
 * Capped at {@link HORIZON}, which is what makes the sweep a threshold rather
 * than a measurement of the whole sea.
 */
function fetchAlong (search: MoleSearch, from: Vec2, angle: number): number {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  let run = 0

  for (let distance = STEP; distance <= HORIZON + 1e-6; distance += STEP) {
    if (search.ground(from.x + cos * distance, from.z + sin * distance) > search.waterLevel)
      break

    run = distance
  }

  return run
}

/** Where the sea comes from, and how much of it there is. */
export interface Exposure {

  /** The fetch-weighted mean bearing of the sweep, in radians. */
  bearing: number

  /** Metres of open water on the worst bearing of the sweep. */
  fetch: number

  /**
   * Metres of open water on every bearing, from 0° round in {@link SWEEP} steps.
   *
   * Kept rather than reduced away, because the shelter of every candidate arm
   * is scored against it — see {@link shelterOf} — and measuring it once per
   * landing instead of once per candidate is most of what keeps this search
   * inside the survey's budget.
   */
  sweep: readonly number[]
}

/**
 * Sweep the whole compass off one spot and reduce it to a bearing and a length.
 *
 * Two different reductions, deliberately, because they answer two different
 * questions. The **fetch** is the worst single bearing, because what wrecks a
 * boat at its moorings is the one direction the sea has room to build on, not
 * the average of the horizon. The **bearing** is the fetch-weighted vector mean,
 * because the worst bearing saturates — on an open coast a dozen of them hit
 * {@link HORIZON} together and picking the first of those is picking an
 * artefact of the loop order.
 */
export function surveyExposure (search: MoleSearch, from: Vec2): Exposure {
  const sweep: number[] = []
  let sumX  = 0
  let sumZ  = 0
  let worst = 0

  for (let degrees = 0; degrees < 360; degrees += SWEEP) {
    const angle = degrees * Math.PI / 180
    const run   = fetchAlong(search, from, angle)

    sweep.push(run)
    sumX  += Math.cos(angle) * run
    sumZ  += Math.sin(angle) * run
    worst  = Math.max(worst, run)
  }

  return { bearing: Math.atan2(sumZ, sumX), fetch: worst, sweep }
}

/** Where the waterline is along one bearing, or `null` for a bearing with no water on it. */
function waterline (search: MoleSearch, from: Vec2, angle: number): number | null {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  for (let distance = -LANDFALL; distance <= LANDFALL + 1e-6; distance += 0.5)
    if (search.ground(from.x + cos * distance, from.z + sin * distance) <= search.waterLevel)
      return distance

  return null
}

/**
 * Carry one leg out from a point and say how far the bed would take it.
 *
 * A length rather than a length and a reason. The first cut of this returned
 * *why* the leg stopped as well — ashore, off the shelf, or out of allowance —
 * because the hook was only turned on a stem the bottom had not stopped. On
 * this coast the bottom stops nearly every stem, and refusing to hook those is
 * what left the archipelago with no arms at all. The hook turns now whatever
 * ended the stem, so the reason has no reader and does not ship.
 */
function carry (search: MoleSearch, from: Vec2, angle: number, allowance: number): number {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  let run = 0

  for (let along = search.station; along <= allowance + 1e-6; along += search.station) {
    const water = search.waterLevel - search.ground(from.x + cos * along, from.z + sin * along)

    // Ashore again, or off the shelf. Either way the last station that stood is
    // the head — a mound does not step over a bar and it does not float.
    if (water < WETTED || water > search.tipped)
      break

    run = along
  }

  return run
}

/** Lay stations along one leg, skipping the joint the previous leg already stood on. */
function stationsAlong (
  search: MoleSearch,
  from:   Vec2,
  angle:  number,
  run:    number,
  offset: number,
  first:  boolean,
): MoleStation[] {
  const cos                 = Math.cos(angle)
  const sin                 = Math.sin(angle)
  const laid: MoleStation[] = []

  for (let along = first ? 0 : search.station; along <= run + 1e-6; along += search.station) {
    const x = from.x + cos * along
    const z = from.z + sin * along

    laid.push({ x, z, bed: search.ground(x, z), along: offset + along })
  }

  return laid
}

/**
 * Does the ray leaving `from` on `angle` run into this band of stone?
 *
 * A ray against a band rather than against a line: the course is a run of
 * stations {@link MoleSearch.width} across, so a bearing that clips the crest is
 * sheltered and one that passes a hand's breadth off the head is not. Each
 * station is tested as a disc — the stations are closer together than the discs
 * are wide, so the band has no gaps in it for a bearing to thread.
 *
 * A ray query rather than a walk, which matters: the sweep is run once per
 * candidate arm and there are twenty-two of those per landing, so an inner loop
 * over the hundred and forty steps of a walk would be the most expensive thing
 * in the survey by an order of magnitude.
 */
function blocked (
  from:     Vec2,
  angle:    number,
  stations: readonly MoleStation[],
  radius:   number,
): boolean {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  for (const station of stations) {
    const dx = station.x - from.x
    const dz = station.z - from.z
    const at = dx * cos + dz * sin

    if (at <= 0 || at > HORIZON)
      continue

    const off = dx * sin - dz * cos

    if (off * off <= radius * radius)
      return true
  }

  return false
}

/**
 * How many degrees of one precomputed sweep this course stands in the way of.
 *
 * The sweep is handed in rather than measured here because it belongs to the
 * *landing* and not to the arm: every candidate course is scored against the
 * same horizon, which is what makes comparing two of them mean anything.
 */
function shelterOf (
  search:   MoleSearch,
  from:     Vec2,
  sweep:    readonly number[],
  stations: readonly MoleStation[],
): number {
  const radius = Math.max(search.width, search.station) * 0.6
  let shadowed = 0

  for (const [ index, run ] of sweep.entries())
    if (run > 0 && blocked(from, index * SWEEP * Math.PI / 180, stations, radius))
      shadowed += SWEEP

  return shadowed
}

/**
 * Metres along the shore between the landing and the root of the arm.
 *
 * Far enough that the mound does not bury the jetty's own piles and near enough
 * that the pool the hook encloses is the water the jetty stands in rather than
 * the next cove along. The jetty reserves seven metres of scatter around itself
 * — `JETTY_CLEARING` in `dressing-harbour.ts` — so this is that clearing plus
 * the half-width of a crest.
 */
const MOLE_OFFSET = 8.6


/** One hand's answer, before the two are compared. */
interface Arm {
  hand:     number
  slant:    number
  root:     Vec2
  angle:    number
  hook:     number
  elbow:    number
  length:   number
  stations: MoleStation[]
  shelter:  number
}

/**
 * How far off the landing's own bearing the stem may be carried, in degrees,
 * and how finely that arc is swept.
 *
 * The first cut of this had no arc at all: the stem went straight out on the
 * shore normal and the hook did the rest, which is how a breakwater is drawn in
 * a textbook and how none of them are built. It produced nothing on any island
 * in the archipelago, and the reason is the whole character of this coast —
 * these banks go from dry to five metres of water inside two station lengths,
 * so a run carried straight out of one is off the buildable bottom before it
 * has laid four stones.
 *
 * What is actually buildable here is the *shelf*, and a shelf runs along the
 * shore rather than away from it. So the bearing is searched the way the pier's
 * is, over an arc either side of the normal, and what comes back is an arm that
 * leaves the beach at a slant — which is what a mound tipped off the end of a
 * cart track does anyway.
 */
const ARM_ARC  = 50
const ARM_STEP = 10


/** Solve the arm on one hand of the landing, carried out on one bearing. */
function armOn (
  search:   MoleSearch,
  landing:  Spot,
  sweep:    readonly number[],
  hand:     number,
  slant:    number,
): Arm | null {
  // The shore runs across the landing's own bearing, so the root is offset along
  // that tangent and the hook turns back the other way — which is what puts the
  // head of the arm in front of the landing rather than beside it.
  const tangent = landing.angle + hand * Math.PI / 2
  const angle   = landing.angle + slant * Math.PI / 180
  const offset  = {
    x: landing.x + Math.cos(tangent) * MOLE_OFFSET,
    z: landing.z + Math.sin(tangent) * MOLE_OFFSET,
  }
  const seat = waterline(search, offset, angle)

  if (seat === null)
    return null

  const root = {
    x: offset.x + Math.cos(angle) * seat,
    z: offset.z + Math.sin(angle) * seat,
  }
  const stem = carry(search, root, angle, search.reach * STEM_SHARE)

  if (stem <= 0)
    return null

  const elbowAt = {
    x: root.x + Math.cos(angle) * stem,
    z: root.z + Math.sin(angle) * stem,
  }

  // The hook turns toward the landing whatever stopped the stem, including the
  // bottom dropping out from under it. On a shelf this narrow that is the usual
  // ending, and turning back across the slope is the only direction left with
  // anything to tip stone onto — which is also, conveniently, the direction the
  // arm was being built in for.
  const hookAngle = angle - hand * search.turn * Math.PI / 180
  const hooked    = carry(search, elbowAt, hookAngle, search.reach - stem)
  const stations  = [
    ...stationsAlong(search, root, angle, stem, 0, true),
    ...stationsAlong(search, elbowAt, hookAngle, hooked, stem, false),
  ]
  const length = stem + hooked

  if (length < SHORTEST_ARM)
    return null

  return {
    hand,
    slant,
    root,
    angle,
    hook:    hookAngle,
    elbow:   stem,
    length,
    stations,
    shelter: shelterOf(search, landing, sweep, stations),
  }
}

/** Is this candidate a better arm than the best so far? */
function better (arm: Arm, best: Arm | null): boolean {
  if (!best)
    return true

  if (arm.shelter !== best.shelter)
    return arm.shelter > best.shelter

  if (arm.length !== best.length)
    return arm.length > best.length

  return Math.abs(arm.slant) < Math.abs(best.slant)
}

/**
 * Wall one landing against the sea, or refuse the site.
 *
 * `null` is a real answer and not a failure, the way the pier's and the weir's
 * are, and here it means one of three facts about the coast: the landing is
 * already in shelter and has no sea worth walling, neither hand of it has bed
 * shallow enough to tip four stations of rubble onto, or what did get built
 * shadows none of the sweep it was built against.
 *
 * That last refusal is the one worth keeping. An arm is a *claim* — that the
 * water behind it is quieter than the water in front — and a mound carried out
 * on the wrong hand of a cove can be forty metres long and shelter nothing but
 * the rock it was tipped against. So the claim is measured rather than asserted:
 * the finished course goes back under the same sweep that said the landing was
 * exposed, every bearing it stands in the way of is counted, and
 * {@link Mole.shelter} is what `scape:map` prints.
 *
 * Which hand the arm is built on is measured for the same reason. The obvious
 * rule — put it on the weather side — is wrong about as often as it is right on
 * a coast this crooked, because the shore beside a landing is a curve and the
 * hand that reaches the sea is whichever one the curve happens to swing toward.
 * So both are solved and the one that shadows more of the sweep wins, with
 * length breaking the ties.
 */
export function solveMole (search: MoleSearch, landing: Spot): Mole | null {
  if (search.station <= 0 || search.reach < SHORTEST_ARM)
    return null

  const exposure = surveyExposure(search, landing)

  if (exposure.fetch < search.exposure)
    return null

  let best: Arm | null = null

  for (const hand of [ 1, -1 ])
    for (let slant = -ARM_ARC; slant <= ARM_ARC; slant += ARM_STEP) {
      const arm = armOn(search, landing, exposure.sweep, hand, slant)

      if (arm && arm.shelter > 0 && better(arm, best))
        best = arm
    }

  if (!best)
    return null

  return {
    root:     best.root,
    angle:    best.angle,
    hook:     best.hook,
    hand:     best.hand,
    exposure: exposure.bearing,
    fetch:    exposure.fetch,
    elbow:    best.elbow,
    length:   best.length,
    stations: best.stations,
    crest:    search.waterLevel + search.crest,
    shelter:  best.shelter,
  }
}

/** Where the head of an arm is, in the island's own local frame. */
export function moleHead (mole: Mole): Vec2 {
  const last = mole.stations[mole.stations.length - 1]

  return last ? { x: last.x, z: last.z } : mole.root
}
