import { smoothstep } from 'threejs-scene'
import type { IsleSite } from './height.ts'
import type { Vec2 } from './path.ts'


/**
 * The shingle bar out to the nearest rock, and the tide that takes it back.
 *
 * The scape already had a bar. `strand.ts` joins two *landmasses*, and it has to
 * be built in world space and folded into the composite field after the patch
 * dispatch, because the ground between two patches belongs to neither of them.
 * This one is the opposite case and is built the opposite way: an islet lives
 * inside the home island's own patch, in the frame that island's yard, coast,
 * beck and landing all agree about — so the crossing can be *surveyed* rather
 * than merely drawn.
 *
 * That is the whole reason it is a second module and not a second strand:
 *
 * - it is sited against the landing and the harbour, so a bar can never be laid
 *   across the water the boats come in on
 * - it is folded into the island's own height field, so the island's terrain
 *   patch draws it at the island's own resolution and needs no geometry, no
 *   material and no draw call of its own
 * - everything downstream inherits it for nothing, exactly as the inlet and the
 *   tombolo do: the bathymetry mask bakes off the field, the shore band paints
 *   it, the ferry lanes test depth so they round it, and `scape:map` samples it
 *   so the crossing draws in ascii without the script being told
 *
 * ## it is a tidal causeway, and that is the point
 *
 * The crest stands a hand's breadth over mean water. That is deliberately inside
 * the band the tide already walks up and down every rock in the guard: the bar
 * is dry ground most of the month and the sea closes over it around high water
 * on the springs, which is what a causeway to an offshore rock actually does.
 *
 * No code anywhere makes that happen. The water surface rides the tide and the
 * ground does not, so a crest measured in the same metres as the tidal range is
 * covered and uncovered by arithmetic that already existed —
 * {@link causewayCover} states the share in closed form so a test and
 * `scape:map` can both say it without sampling a clock.
 */
export interface Causeway {

  /** Which islet is joined, as an index into the resolved ring. */
  isle: number

  /** The mainland landfall, in the island's own local frame. */
  shore: Vec2

  /** The islet's own shore, at the far end of the crossing. */
  head: Vec2

  /** Open water bridged, shore to shore, in metres. */
  crossing: number

  /** Absolute world height of the lowest point of the bar — the middle of it. */
  crest: number

  /** Absolute world height where the bar meets either shore. */
  anchor: number

  /** Half-width of the bar at its skirt, in metres. */
  halfWidth: number

  /**
   * How much of the bar is at a point, 1 along the crown and 0 off the skirt.
   *
   * The raise, the tests and the instruments read this one function, so there is
   * no second opinion anywhere about where the causeway is.
   */
  claimAt(x: number, z: number): number
}

/** The ground the search measures, before any bar has been laid on it. */
export type GroundAt = (x: number, z: number) => number

/** Somewhere the bar must not make its landfall — a bank the boats use. */
export type Berth = Vec2

/**
 * Bearings either side of the line to the island's middle that the crossing is
 * measured on, and how far the fan opens.
 *
 * The shortest water from a rock is *roughly* the line toward the island it
 * stands off, and roughly is not good enough on a warped coast: a bay behind the
 * islet puts the nearest dry ground twenty degrees off that line and a single
 * probe would report the crossing as half again as long as it is. Nine bearings
 * across fifty degrees is fine enough that the fan cannot step over a headland
 * this size and coarse enough to stay a handful of walks.
 */
const FAN_BEARINGS = 9
const FAN_SPREAD   = 25 * Math.PI / 180

/** Metres between samples along one bearing. Half the terrain's finest quad. */
const WALK_STEP = 0.5

/**
 * How much of the half-width is flat crown. The rest is the skirt.
 *
 * A shingle bar is a heap at its own angle of repose, so this is derived rather
 * than authored — the same decision `strand.ts` made about its own skirt, and
 * for the same reason: a knob for the shape of loose stone is a knob nobody
 * could answer.
 */
const CROWN_SHARE = 0.42

/**
 * Metres of islet radius that a metre of crossing is worth.
 *
 * The search wants the shortest crossing, but not so badly that it lays a bar to
 * a pebble it could step over rather than to the rock people actually walk out
 * to. A metre of extra water is worth about two thirds of a metre of rock.
 */
const ISLE_WORTH = 1.5

/**
 * How far an islet's warped shore may stand outside its own circle, as a
 * multiple of the radius.
 *
 * The number `terrain.isles` is authored against — see the note on the islet
 * table in the config. Used here to refuse a landfall that is really a second
 * rock rather than the mainland.
 */
const ISLE_REACH = 1.34


/**
 * The share of a semidiurnal cycle the sea stands over a freeboard, 0..1.
 *
 * Closed form, and it has to be: the alternative is marching a clock in a test
 * and in an instrument, and two marches over the same cosine is two chances to
 * disagree about what "covered" means. The tide is `A·cos(2π·phase)` about mean
 * water, so it stands above `freeboard` for exactly `acos(freeboard / A) / π` of
 * the cycle — one at a crest the sea never leaves, zero at one it never reaches.
 *
 * @param freeboard Metres the ground stands above mean water. May be negative.
 * @param amplitude Half the range in force, from `tideAmplitude`.
 */
export function causewayCover (freeboard: number, amplitude: number): number {
  if (amplitude <= 0)
    return freeboard < 0 ? 1 : 0

  const ratio = freeboard / amplitude

  if (ratio >= 1)
    return 0

  if (ratio <= -1)
    return 1

  return Math.acos(ratio) / Math.PI
}

/** The crest profile along the crossing, as metres above the lowest point. */
function camberAt (at: number, camber: number): number {
  return camber * (1 - Math.sin(Math.PI * Math.min(1, Math.max(0, at))))
}

/**
 * Where a bearing off an islet leaves the islet and where it next finds land,
 * or `null` when it never does.
 *
 * One walk answering both questions, because they are the same walk: the near
 * end of the crossing is where the rock gives out and the far end is where the
 * next dry ground starts, and asking them separately is two passes over the same
 * samples.
 */
function crossingAlong (
  ground: GroundAt,
  water:  number,
  isle:   IsleSite,
  angle:  number,
  reach:  number,
): { head: Vec2, shore: Vec2 } | null {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  // A rock whose own middle is under water is a rock with no shore to anchor to,
  // and the walk below would report the crossing as starting at its centre.
  if (ground(isle.x, isle.z) < water)
    return null

  let head: Vec2 | null = null

  for (let step = 0; step * WALK_STEP <= reach; step += 1) {
    const out = step * WALK_STEP
    const x   = isle.x + cos * out
    const z   = isle.z + sin * out
    const dry = ground(x, z) >= water

    // Still on the rock: keep the last dry sample, because the one after the
    // final one is the shore.
    if (!head) {
      if (!dry)
        head = { x: isle.x + cos * Math.max(0, out - WALK_STEP), z: isle.z + sin * Math.max(0, out - WALK_STEP) }

      continue
    }

    if (dry)
      return { head, shore: { x, z }}
  }

  return null
}

/** True when a landfall is really another rock in the ring. */
function onAnotherIsle (isles: readonly IsleSite[], mine: number, at: Vec2): boolean {
  return isles.some((isle, index) =>
    index !== mine && Math.hypot(isle.x - at.x, isle.z - at.z) < isle.radius * ISLE_REACH)
}

export interface CausewaySearch {

  /** The ground as the island's own field leaves it, before the bar. */
  ground:     GroundAt
  waterLevel: number

  /** Longest crossing the bar will bridge, in metres. 0 is no causeway at all. */
  gap: number

  /** Smallest islet radius worth walking out to, in metres. */
  minIsle: number

  /** Metres the landfall must keep from any bank the boats use. */
  clear: number

  /** Metres the middle of the bar stands above mean water. */
  crest: number

  /** Metres the two anchors stand above that middle. */
  camber: number

  /** Half-width of the bar at its skirt, in metres. */
  halfWidth: number
}

/**
 * The crossing, or `null` on an island with nothing worth walking out to.
 *
 * `null` is a real answer and the common one, the way the smokehouse's and the
 * croft's are: four of the five holdings have no islets at all, and an island
 * whose nearest rock is a hundred metres offshore gets no causeway rather than a
 * mole out into open water. `gap` at 0 is the switch and the only one — a bar
 * that will bridge no water is no bar, and there is no boolean beside it saying
 * the same thing twice.
 *
 * Pure, and free of `three`, so `scape:map` reports the crossing without
 * building a vertex of it.
 */
export function solveCauseway (
  search: CausewaySearch,
  isles:  readonly IsleSite[],
  berths: readonly (Berth | null)[],
): Causeway | null {
  if (search.gap <= 0)
    return null

  let best: Causeway | null = null
  let bestScore             = -Infinity

  for (const [ index, isle ] of isles.entries()) {
    if (isle.radius < search.minIsle)
      continue

    // The bearing from the rock toward the island's middle, which is the
    // direction the mainland is nearest in — then a fan either side of it,
    // because "nearest" and "straight at the middle" are the same line only on
    // a coast that is a circle. See {@link FAN_BEARINGS}.
    const inward = Math.atan2(-isle.z, -isle.x)

    for (let step = 0; step < FAN_BEARINGS; step += 1) {
      const angle = inward + (step / (FAN_BEARINGS - 1) - 0.5) * 2 * FAN_SPREAD

      const found = crossingAlong(
        search.ground,
        search.waterLevel,
        isle,
        angle,
        isle.radius * ISLE_REACH + search.gap,
      )

      if (!found || onAnotherIsle(isles, index, found.shore))
        continue

      const crossing = Math.hypot(found.shore.x - found.head.x, found.shore.z - found.head.z)

      if (crossing <= 0 || crossing > search.gap)
        continue

      // The one hard rule. A bar laid across the water the jetty stands in is a
      // bar the ferry cannot get past, and the landing and the harbour were both
      // found before this search ran precisely so it could be told to miss them.
      if (berths.some(berth =>
        berth && Math.hypot(berth.x - found.shore.x, berth.z - found.shore.z) < search.clear))
        continue

      const score = isle.radius * ISLE_WORTH - crossing

      if (score <= bestScore)
        continue

      bestScore = score
      best      = describe(search, index, found.head, found.shore, crossing)
    }
  }

  return best
}

/** Fill in the record once a crossing has won. Split out to keep the search flat. */
function describe (
  search:   CausewaySearch,
  isle:     number,
  head:     Vec2,
  shore:    Vec2,
  crossing: number,
): Causeway {
  const crest = search.waterLevel + search.crest
  const dx    = head.x - shore.x
  const dz    = head.z - shore.z
  const span  = Math.max(1e-6, crossing * crossing)

  return {
    isle,
    head,
    shore,
    crossing,
    crest,
    anchor:    crest + search.camber,
    halfWidth: search.halfWidth,

    claimAt (x, z) {
      const at = Math.min(1, Math.max(0, ((x - shore.x) * dx + (z - shore.z) * dz) / span))

      const lateral = Math.hypot(
        x - (shore.x + dx * at),
        z - (shore.z + dz * at),
      )

      return 1 - smoothstep(search.halfWidth * CROWN_SHARE, search.halfWidth, lateral)
    },
  }
}

/**
 * Lay the bar over a raw ground height.
 *
 * Only ever upward, and that is the whole contract — the mirror of the rule the
 * inlet's carve is written to. A heap of shingle may raise the seabed it lies on
 * and must never lower the island it runs into, which is also what lets both
 * ends simply vanish under the rising shore instead of needing a join.
 *
 * `null` returns the height untouched on the first line, which is what an island
 * with no rocks off it costs.
 */
export function raiseCauseway (
  causeway: Causeway | null,
  x:        number,
  z:        number,
  height:   number,
): number {
  if (!causeway)
    return height

  const claim = causeway.claimAt(x, z)

  if (claim <= 0)
    return height

  const { shore, head, crossing } = causeway
  const dx                        = head.x - shore.x
  const dz                        = head.z - shore.z
  const span                      = Math.max(1e-6, crossing * crossing)
  const at                        = ((x - shore.x) * dx + (z - shore.z) * dz) / span

  const level = causeway.crest + camberAt(at, causeway.anchor - causeway.crest)

  return Math.max(height, height + (level - height) * claim)
}

// perf: one projection, one hypot and one smoothstep per call, and no
// allocation. Runs per terrain vertex on the one island that has a causeway and
// costs a null check on the four that do not.
