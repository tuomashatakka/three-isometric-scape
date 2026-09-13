import type { Spot } from './landing.ts'
import { weirSpot } from './landing.ts'
import type { Vec2 } from './path.ts'


/**
 * The fish weir — the one piece of the settlement that is built for the sea to
 * take away twice a day and give back.
 *
 * Every other structure on this coast answers the question *where does the
 * ground break the surface*, and answers it once. The jetty stops at the
 * waterline, the boathouse hangs over it, and `pier.ts` walks out past it to a
 * berth. A trap is built in the one band where that question has two answers —
 * the ground the tide walks across, which is dry at low water and under it at
 * high — and the whole structure is a way of spending the difference.
 *
 * So the search here is not the pier's search with the inequality flipped. It
 * asks three things, and each one is about the band rather than about the depth:
 *
 * - **where does the flat start.** The wall is rooted a shed's footing along the
 *   bank from the boathouse and on the *other* hand from the trestle, and the
 *   root is seated at the first ground along that bearing that is in the band at
 *   all — a bank is a point on a curve and five metres along it is as often the
 *   yard as the shore.
 * - **how far does the flat go.** The leader is carried out while the bed stays
 *   inside the band and stops where it leaves it, in either direction: into
 *   water that never drains, or up onto ground that never covers. Both ends of
 *   that are the same finding — the flat is over.
 * - **will the flat hold a pound.** The ring is set at the head of the leader
 *   and drawn in until the whole of it lies in the band too. If it has to come
 *   in past {@link WeirSearch.least} the leader is pulled back a bay and the ring
 *   tried again, and when there is nowhere left to pull back to the island has
 *   no trap.
 *
 * The answer is a line and a ring rather than a point: a leader out from the
 * bank, a pound at the end of it, and a gap in the pound facing back the way the
 * fish came.
 *
 * Pure, and free of `three` — the course is surveyed here and laid in
 * `props/weir.ts`, so `scape:map` reports the leader, the pound and the pool of
 * every trap in the archipelago without building a vertex of one.
 */

/** A leader out to a pound, with a gap in it. */
export interface Weir {

  /** Where the wall leaves the bank, in the island's own local frame. */
  root: Vec2

  /** The bearing the leader is carried out on, in radians. */
  angle: number

  /** Degrees the leader is turned off the harbour's own bearing to find its flat. */
  turn: number

  /** Metres from the root to the pound's centre. */
  lead: number

  /** The pound's centre, in the island's own local frame. */
  head: Vec2

  /** The pound's plan radius, in metres. Never more than what was asked for. */
  pound: number

  /** The gap in the ring, in radians, centred back along the leader. */
  mouth: number

  /** Bed height under the pound's centre, in metres. */
  bed: number
}

export interface WeirSearch {

  /** The ground as the height field leaves it, in metres. */
  ground(x: number, z: number): number
  waterLevel: number

  /**
   * Metres between low and high water at springs — `tide.range`, handed in
   * rather than restated.
   *
   * The band, and the switch. Half of it above mean water is the highest ground
   * the flood still covers and half below is the lowest ground the ebb still
   * uncovers, and a trap can only be laid between the two. At 0 the band has no
   * width, no bearing off any bank has a station in it, and the archipelago
   * comes back with no traps — which is the correct answer for a tideless sea
   * rather than a degenerate case to guard against.
   */
  tidal: number

  /** Furthest out the leader is carried, in metres. */
  reach: number

  /** The pound's plan radius as asked for, in metres. */
  pound: number

  /** The smallest pound worth setting, in metres. */
  least: number

  /** The gap left in the ring, in radians. */
  mouth: number
}

/**
 * How far off the harbour's own bearing the leader may be turned, in degrees,
 * and how finely that arc is swept.
 *
 * Wider than the pier's sixty, and deliberately. A trestle turned off its cove
 * is a deck pointing down the coast, because a pier belongs to the harbour it
 * serves. A weir belongs to the *flat*, and a flat is a fact about the shore
 * rather than about the cove — so the sweep is allowed all the way round to the
 * beam, and what keeps the wall near the harbour is that the band runs out
 * before the sweep does.
 */
const TURN  = 80
const SWEEP = 10

/** How far along a bearing the search will walk to find the band, in metres. */
const LANDFALL = 10

/** How finely the bearing is walked, and how far the leader is pulled back at a time, in metres. */
const BAY = 2

/**
 * The shortest leader worth walling, in metres.
 *
 * Four bays. Under it the pound is close enough to the bank that the flood
 * reaches it before it reaches the wall, and what is standing on the flat is a
 * pen rather than a trap. A craft fact rather than a tuning knob, which is why
 * it is here and not in the config: what a reader wants to turn is how big the
 * pound has to be, not the point at which a leader stops being one.
 */
const SHORTEST_LEAD = 8

/** How many stations the ring is proved at. */
const RING = 16

/** How finely the pound is drawn in, in metres. */
const DRAW = 0.25


/** Half the tide's range — the distance either side of mean water the band reaches. */
function halfBand (search: WeirSearch): number {
  return search.tidal / 2
}

/**
 * Is this ground in the band the tide walks across?
 *
 * Both ends of the test matter and they fail differently. Ground above the band
 * never covers, so a wall on it is a wall on the beach; ground below it never
 * drains, so a wall on it is a wall the pool never empties over. The trap needs
 * the ground that does both.
 */
function inBand (search: WeirSearch, x: number, z: number): boolean {
  const half  = halfBand(search)
  const depth = search.waterLevel - search.ground(x, z)

  return depth > -half && depth < half
}

/** One bearing's answer: where the band started, and how far it ran. */
interface Flat {
  seat: number
  run:  number
}

/**
 * Walk one bearing: off the bank, onto the flat, out along it.
 *
 * `null` when the bearing never finds the band inside {@link LANDFALL}, which is
 * a bearing pointing at the hill behind the farm or off the end of the shelf.
 */
function walkFlat (search: WeirSearch, from: Vec2, angle: number): Flat | null {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const at  = (distance: number): boolean =>
    inBand(search, from.x + cos * distance, from.z + sin * distance)

  let seat = -1

  for (let distance = 0; distance <= LANDFALL + 1e-6; distance += 0.5)
    if (at(distance)) {
      seat = distance
      break
    }

  if (seat < 0)
    return null

  let run = 0

  for (let along = BAY; along <= search.reach + 1e-6; along += BAY) {
    if (!at(seat + along))
      break

    run = along
  }

  return { seat, run }
}

/**
 * The widest pound the flat will hold at this point, or 0.
 *
 * Drawn in from what was asked for rather than grown out from nothing, because
 * the two find different rings on a band with a hole in it: growing outward
 * stops at the first radius that fails and keeps a ring smaller than the flat
 * would carry, and drawing inward keeps the largest ring that is *wholly* in the
 * band. The gap is proved along with the rest of the ring — a mouth laid across
 * a channel is a mouth the pool drains out of.
 */
function settlePound (search: WeirSearch, centre: Vec2): number {
  for (let radius = search.pound; radius >= search.least - 1e-6; radius -= DRAW) {
    let held = true

    for (let station = 0; station < RING && held; station += 1) {
      const around = station / RING * Math.PI * 2

      held = inBand(
        search,
        centre.x + Math.cos(around) * radius,
        centre.z + Math.sin(around) * radius,
      )
    }

    if (held)
      return radius
  }

  return 0
}

/** One bearing's whole answer, before the sweep has picked between them. */
interface Setting {
  turn:  number
  seat:  number
  lead:  number
  pound: number
}

/**
 * Set the pound as far out along one bearing as the flat will carry it.
 *
 * The leader is taken at its full length first and pulled back a bay at a time,
 * so the trap is set at the seaward end of the flat rather than in the middle of
 * it. That ordering is the whole character of the result and it is the opposite
 * of the pier's: a trestle is turned as little as it can be because it belongs
 * to its harbour, and a weir is carried as far out as it can be because every
 * metre further down the flat is another hour of the tide working for it.
 */
function setAlong (search: WeirSearch, from: Vec2, angle: number, turn: number): Setting | null {
  const flat = walkFlat(search, from, angle)

  if (!flat || flat.run < SHORTEST_LEAD)
    return null

  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  for (let lead = flat.run; lead >= SHORTEST_LEAD - 1e-6; lead -= BAY) {
    const centre = {
      x: from.x + cos * (flat.seat + lead),
      z: from.z + sin * (flat.seat + lead),
    }
    const pound = settlePound(search, centre)

    if (pound > 0)
      return { turn, seat: flat.seat, lead, pound }
  }

  return null
}

/**
 * Lay a trap out from one harbour, or refuse the site.
 *
 * `null` is a real answer and not a failure, and here it is most of the finding:
 * a coast has to be shallow for a long way before it has anywhere to put one of
 * these, and this archipelago is rock. At the default seed exactly one island in
 * six has a flat wide enough, and it is the home island — whose harbour is the
 * enclosed shallow bay `pier.ts` refuses to build a trestle out of, for the same
 * reason in the other direction. The cove with no way out of it is the cove with
 * a flat in it.
 *
 * The sweep is scored on the *pound* rather than on the leader, because the
 * pound is the trap and the leader is only how the fish get to it. Where two
 * bearings hold the same ring the longer leader wins, and where those tie the
 * one nearer the harbour's own bearing does — that last one only so the result
 * does not depend on which way the sweep happens to run.
 */
export function solveWeir (search: WeirSearch, harbour: Spot): Weir | null {
  if (search.tidal <= 0 || search.least <= 0 || search.reach < SHORTEST_LEAD)
    return null

  const from        = weirSpot(harbour)
  let best: Setting | null = null

  for (let turn = -TURN; turn <= TURN; turn += SWEEP) {
    const found = setAlong(search, from, harbour.angle + turn * Math.PI / 180, turn)

    if (!found)
      continue

    if (
      !best ||
      found.pound > best.pound ||
      found.pound === best.pound && found.lead > best.lead ||
      found.pound === best.pound && found.lead === best.lead && Math.abs(turn) < Math.abs(best.turn)
    )
      best = found
  }

  if (!best)
    return null

  const angle = harbour.angle + best.turn * Math.PI / 180
  const cos   = Math.cos(angle)
  const sin   = Math.sin(angle)
  const root  = { x: from.x + cos * best.seat, z: from.z + sin * best.seat }
  const head  = { x: root.x + cos * best.lead, z: root.z + sin * best.lead }

  return {
    root,
    angle,
    turn:  best.turn,
    lead:  best.lead,
    head,
    pound: best.pound,
    mouth: search.mouth,
    bed:   search.ground(head.x, head.z),
  }
}

/**
 * The wall, as two polylines: the leader out, and the ring round.
 *
 * Separate rather than one line, and not for the drawing's sake — they are two
 * different structures that happen to be built of the same stone. The leader is
 * a fence the fish follow and the pound is the thing they cannot leave, and
 * every test worth writing about this shape is about one or the other.
 *
 * The ring starts and ends at the edges of the mouth, which faces back along the
 * leader: the gap is centred on the bearing from the pound's centre to the root,
 * so the fish running out down the wall on the ebb meet the opening side-on and
 * the wall closes behind them.
 */
type WeirCourseReturnType = { leader: Vec2[], pound: Vec2[] }

export function weirCourse (weir: Weir, step: number): WeirCourseReturnType {
  const cos            = Math.cos(weir.angle)
  const sin            = Math.sin(weir.angle)
  const spans          = Math.max(2, Math.round(weir.lead / Math.max(step, 0.1)))
  const leader: Vec2[] = []

  for (let span = 0; span <= spans; span += 1) {
    const along = weir.lead * span / spans

    leader.push({ x: weir.root.x + cos * along, z: weir.root.z + sin * along })
  }

  // Back down the leader, which is the bearing the root lies on from the head.
  const facing        = weir.angle + Math.PI
  const closed        = Math.PI * 2 - weir.mouth
  const arcs          = Math.max(3, Math.round(closed * weir.pound / Math.max(step, 0.1)))
  const pound: Vec2[] = []

  for (let arc = 0; arc <= arcs; arc += 1) {
    const around = facing + weir.mouth / 2 + closed * arc / arcs

    pound.push({
      x: weir.head.x + Math.cos(around) * weir.pound,
      z: weir.head.z + Math.sin(around) * weir.pound,
    })
  }

  return { leader, pound }
}

/**
 * How far the pound's wall stands out of the sea at low springs, in metres.
 *
 * The one number that says whether a trap reads as one, and it is not the
 * radius. A weir is only ever visible in the window between the two tides: the
 * flood covers it and the ebb uncovers it, and what makes that window worth
 * anything is how much wall is left standing when the water has gone. The band
 * test guarantees the bed uncovers at all; this says by how much, with the wall
 * on top of it. Reported by `scape:map` so that a retune which quietly drowns
 * the pound at every state of the tide shows up as a number rather than as a
 * still nobody took.
 */
export function weirStanding (weir: Weir, waterLevel: number, tidal: number, height: number): number {
  return weir.bed + height - (waterLevel - tidal / 2)
}
