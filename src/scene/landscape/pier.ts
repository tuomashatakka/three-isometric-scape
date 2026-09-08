import type { Spot } from './landing.ts'
import { pierSpot } from './landing.ts'
import type { Vec2 } from './path.ts'


/**
 * The pier — the one piece of the settlement that is built on the water rather
 * than beside it.
 *
 * Everything the settlement already had at the water stops at the waterline. The
 * jetty is seven metres of deck on six short piles, the boathouse hangs its floor
 * over the shallows on a slipway, and both are sited by the same question: where
 * does the ground *break the surface*. That is the right question for a rowing
 * boat and the wrong one for anything with a keel, and a coast whose whole
 * economy is the sea had nowhere for one to come alongside.
 *
 * So this asks three other questions instead, and which one bites depends
 * entirely on the coast:
 *
 * - **where does the water start.** The pier is rooted a shed's width along the
 *   bank from the boathouse, and a bank is a point on a curve — on a headland
 *   that offset lands inland. So the run is seated at the waterline it actually
 *   finds along its bearing rather than at the spot it was handed.
 * - **where does the shelf end.** A pile is driven, and past a certain depth of
 *   water there is no driving one. The trestle is carried out to the last bent
 *   the bottom will still take and stops there — which on these rock coasts is
 *   three bays, because the bottom falls away that fast.
 * - **is there anywhere to go from it.** A deck a boat cannot leave is a bridge
 *   that ran out of money. So the head has to have {@link PierSearch.offing}
 *   metres of navigable water still ahead of it on the same bearing.
 *
 * The answer is a length rather than a point: a trestle of bents, every pile cut
 * to the bed it stands in, carrying one level deck out to water deep enough to
 * lie a hull in, with a way out of it.
 *
 * Pure, and free of `three` — the shelf is surveyed here and drawn in
 * `props/pier.ts`, so `scape:map` reports the reach of every pier in the
 * archipelago without building a vertex of one.
 */

/** One pair of piles, and the bed they are driven into. */
export interface PierBent {

  /** Where the bent stands, in the island's own local frame. */
  x: number
  z: number

  /** Bed height under it, in metres. Below the waterline for every bent but the root. */
  bed: number

  /** Metres out from the root. */
  along: number
}

/** A trestle carried out from one bank to one berth. */
export interface Pier {

  /** The shore end, in the island's own local frame. */
  root: Vec2

  /** The bearing it is carried out on, in radians. */
  angle: number

  /** Degrees the run is turned off the harbour's own bearing to find its water. */
  turn: number

  /** Metres from the root to the head. */
  length: number

  /** Every bent, root first, head last. */
  bents: readonly PierBent[]

  /** Metres of water under the head at mean water. */
  depth: number

  /** World height of the deck, in metres. */
  deck: number
}

export interface PierSearch {

  /** The ground as the height field leaves it, in metres. */
  ground(x: number, z: number): number
  waterLevel: number

  /**
   * Metres of water the head has to stand in.
   *
   * One of the two switches. Raising it past what a shelf offers takes the pier
   * off that island rather than building a shorter one — a deck that stops in
   * half a metre of water is a jetty with extra timber in it, and the scape
   * already has jetties.
   */
  berth: number

  /**
   * Deepest water a pile is driven in, in metres.
   *
   * The other switch, and on this archipelago it is the one that decides the
   * *length* of every pier that gets built. These coasts are rock: the bottom
   * goes from a boot-deep shelf to twelve metres of open sound inside a couple
   * of bays, so where the trestle stops is not where somebody got tired of
   * walking — it is where there stopped being anything to drive a pile into.
   */
  piled: number

  /**
   * Furthest out the trestle will be carried, in metres.
   *
   * **Metres, and they stay metres.** How far somebody will walk over open water
   * to reach their boat is a fact about people and timber, not about how wide
   * the archipelago is — so a world that grows does not grow this.
   */
  reach: number

  /**
   * Metres of navigable water the head needs still ahead of it.
   *
   * The third switch, and the one the first cut of this module did not have. A
   * run that stays wet the whole way has not necessarily gone *out*: on the home
   * island the harbour cove is an enclosed shallow bay, and a trestle that
   * crossed it stopped three metres short of the far shore and read as an
   * unfinished bridge. `scape:diff` showed a pier; only measuring the water past
   * the head said which kind.
   *
   * Metres, and they stay metres — it is the room a hull needs to lie alongside
   * and get away again, which is a fact about the boat.
   */
  offing: number

  /**
   * Metres of water that counts as navigable in the offing.
   *
   * `boats.clearance`, handed in rather than restated: the waterways are already
   * routed to keep exactly this much under every hull in the fleet, and a second
   * opinion about how much water a boat needs is how a pier ends up with a berth
   * the ferry cannot reach. It is deliberately *not* {@link berth} — a berth is
   * where a boat lies still and the offing is where it is under way, and asking
   * for the deeper of the two out here took every pier in the archipelago.
   */
  clearance: number

  /** Metres between bents. */
  bay: number

  /** Metres the deck stands over mean water. */
  freeboard: number
}

/**
 * How far off the harbour's own bearing the run may be turned, in degrees, and
 * how finely that arc is swept.
 *
 * A cove is a curve and the water in front of it is not a half-plane, so the
 * bearing the *bank* faces is where the search starts rather than where it has
 * to end. Sixty degrees either side is the arc over which a pier still reads as
 * belonging to that harbour; past it the deck is pointing along the shore.
 *
 * The score below spends this arc as reluctantly as it can — see {@link solvePier}.
 */
const TURN  = 60
const SWEEP = 5

/**
 * How far along a bearing the search will walk to find the waterline, in metres.
 *
 * The root is handed to this module already offset along the bank to clear the
 * boathouse, and on a curving shore that offset lands inland as often as not.
 * Ten metres is enough to walk off a headland and no more — past it the bearing
 * is simply pointing at the island, and the honest answer is that this is not
 * the way out to the water.
 */
const LANDFALL = 10

/**
 * The shortest run worth building, in metres.
 *
 * Three bays. Under it the thing standing at the harbour is the length of the
 * jetty already standing round the bay, built wider and called something else,
 * and an island whose shelf gives no more than that keeps its rowing boats. A
 * craft fact rather than a tuning knob, which is why it is here and not in the
 * config: what a reader wants to turn is how deep a berth has to be, not the
 * point at which a pier stops being one.
 */
const SHORTEST_RUN = 9

/** Least water a bent may stand in before the run counts as having gone ashore. */
const WETTED = 0.15


/** How finely the water past the head is walked, in metres. */
const OFFING_STEP = 1

/** One bearing's answer: where it made landfall, how far it ran, and how deep it ended. */
interface Reach {
  seat:  number
  run:   number
  depth: number
}

/**
 * Walk one bearing: off the bank, into the water, out along the shelf.
 *
 * `null` when the bearing never reaches the water inside {@link LANDFALL}, which
 * is a bearing pointing back at the island.
 */
function walk (search: PierSearch, from: Vec2, angle: number): Reach | null {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const at  = (distance: number): number =>
    search.waterLevel - search.ground(from.x + cos * distance, from.z + sin * distance)

  let seat = -1

  for (let distance = 0; distance <= LANDFALL + 1e-6; distance += 0.5)
    if (at(distance) >= 0) {
      seat = distance
      break
    }

  if (seat < 0)
    return null

  let run   = 0
  let depth = 0

  for (let along = search.bay; along <= search.reach + 1e-6; along += search.bay) {
    const water = at(seat + along)

    // Ashore again, or off the shelf. Either way the last bent that stood is
    // the head — a pier does not step over a bar and it does not float.
    if (water < WETTED || water > search.piled)
      break

    run   = along
    depth = water
  }

  // A deck with nowhere to go from it is a bridge that ran out of money, so the
  // water past the head is walked as well as the water under it.
  for (let ahead = OFFING_STEP; ahead <= search.offing + 1e-6; ahead += OFFING_STEP)
    if (at(seat + run + ahead) < search.clearance)
      return null

  return { seat, run, depth }
}

/**
 * Carry a pier out from one harbour, or refuse the site.
 *
 * `null` is a real answer and not a failure, the way the mill's and the
 * smokehouse's are, and here it means one of four facts about the coast: every
 * bearing in the arc points back at the island, the shelf falls away inside
 * three bays, what it falls away to is still too shallow to lie in, or there is
 * no water past the head to leave by. At the default seed three of the six
 * islands build one and three do not, and that last refusal is the interesting
 * one: a harbour is sited for *shelter*, and the most sheltered cove on a coast
 * is often the one with no way out of it.
 *
 * The score spends the arc reluctantly: the *least turned* bearing that
 * qualifies wins, and length breaks the ties. That ordering is the whole
 * character of the result. Scoring on depth instead — the obvious first
 * instinct, and the one the first cut of this had — put every pier in the
 * archipelago at the far edge of the sweep, because the deepest water off a cove
 * is always the water beside it rather than in front of it, and a pier turned
 * sixty degrees off its own harbour is a pier pointing down the coast.
 *
 * The bed is sampled at every bent rather than at the head alone, because those
 * are two different questions: how deep it is where the boat lies, and how long
 * each pile has to be cut. Sampling only the head is what would let a deck fly
 * two metres over a bar it never noticed.
 */
export function solvePier (search: PierSearch, harbour: Spot): Pier | null {
  if (search.bay <= 0 || search.reach < SHORTEST_RUN)
    return null

  const from = pierSpot(harbour)
  let best: Reach & { turn: number } | null = null

  for (let turn = -TURN; turn <= TURN; turn += SWEEP) {
    const found = walk(search, from, harbour.angle + turn * Math.PI / 180)

    if (!found || found.run < SHORTEST_RUN || found.depth < search.berth)
      continue

    if (
      !best ||
      Math.abs(turn) < Math.abs(best.turn) ||
      Math.abs(turn) === Math.abs(best.turn) && found.run > best.run
    )
      best = { ...found, turn }
  }

  if (!best)
    return null

  const angle             = harbour.angle + best.turn * Math.PI / 180
  const cos               = Math.cos(angle)
  const sin               = Math.sin(angle)
  const root              = { x: from.x + cos * best.seat, z: from.z + sin * best.seat }
  const bents: PierBent[] = []

  for (let along = 0; along <= best.run + 1e-6; along += search.bay) {
    const x = root.x + cos * along
    const z = root.z + sin * along

    bents.push({ x, z, bed: search.ground(x, z), along })
  }

  return {
    root,
    angle,
    turn:   best.turn,
    length: best.run,
    bents,
    depth:  best.depth,
    deck:   search.waterLevel + search.freeboard,
  }
}

/** Where the head of a pier is, in the island's own local frame. */
export function pierHead (pier: Pier): Vec2 {
  return {
    x: pier.root.x + Math.cos(pier.angle) * pier.length,
    z: pier.root.z + Math.sin(pier.angle) * pier.length,
  }
}
