import { LADE_FEED, WATERMILL_SINK, WHEEL_REACH } from '../props/watermill.ts'
import type { Obstacle } from './footpath.ts'
import type { Vec2 } from './path.ts'
import type { Standing } from './steading.ts'


/**
 * Where the watermill stands, in the island's own local frame.
 *
 * The only building in the scape sited against a *pair* of places rather than
 * one. Everything else here answers to a point — the yard, the harbour, a rock,
 * the summit — and can be turned to face it afterwards. A mill answers to the
 * bank it stands on *and* to the reach of channel that feeds it, and the two
 * have to be solved together: a stand with no fall above it is a shed, a fall
 * with no stand beside it is a waterfall, and the thing that makes either of
 * them a mill is the trough between them.
 *
 * A {@link Standing}, like the smokehouse and the shieling, so it is walked to
 * with `doorstepOf` and raised with the yaw in `angle`. What that yaw means is
 * stricter here than anywhere else in the kit, and `props/watermill.ts` spells
 * it out: local `-x` is upstream, local `-z` is the water, local `+z` is the
 * door. Both of the first two are *solved* rather than chosen, which is why the
 * search below has a gate about which side of the lade the channel is on.
 *
 * Pure, and free of `three`, so `scape:map` reports the mill without building a
 * vertex of it.
 */
export interface WatermillSite extends Standing {

  /** Ground height under the sill, in metres. */
  level: number

  /** The mouth cut into the bank, on the channel, in the island's own frame. */
  intake: Vec2

  /** The channel bed at the mouth, in metres. */
  intakeLevel: number

  /**
   * Metres the bed at the mouth stands above the mill's own sill.
   *
   * The reading that says whether a site is a mill site at all, and the one the
   * config gates on. Reported rather than only tested, because the surplus over
   * the trough's own rise is the number that says how deep the mouth is cut into
   * its bank — see `WatermillConfig.watermill.head`.
   */
  head: number

  /** Metres of trough between the mouth and the wheel. */
  lade: number

  /**
   * Which end of the wet wall the trough comes in over: `-1` or `+1` on local
   * `x`, never 0.
   *
   * The wheel's sense of rotation follows from it, because a breastshot wheel
   * turns away from the water that fills it. See {@link ladeSide}.
   */
  feedSide: number
}

/**
 * How much ground the mill and its works claim, in metres.
 *
 * The house, the wheel turning a metre and a half off the wet gable, the frame
 * that carries it and the stone apron the spent water runs away over. Held in
 * step with the geometry by the test beside this file rather than by hope, the
 * same way `SHIELING_FOOTING` and `CHAPEL_FOOTING` are.
 *
 * The lade is deliberately *not* in it. A trough on trestles is a thing you walk
 * under, exactly as a sail four metres up is a thing you walk under, and pushing
 * every route and every spruce out past the mouth would fence off the whole
 * reach of bank the mill was built on. See `MILL_FOOTING`.
 */
export const WATERMILL_FOOTING = 4.4

/**
 * Where the probes that measure the sill's fall sit, in metres.
 *
 * The corners of the room's own walls, and nothing of the wheel — that stands on
 * its own long posts and is gated separately by {@link WHEEL_DROP}.
 */
const SILL_PROBES = [[ -2, -1.45 ], [ 2, -1.45 ], [ 2, 1.45 ], [ -2, 1.45 ]] as const

/**
 * How much fall the underbuilding is willing to bridge, in metres.
 *
 * Looser than every other sill gate in the scape — the shieling's is 0.55 and
 * the smokehouse's 0.8 measured on a foundation this building does not have —
 * and the reason is the ground rather than a slackening of standards. A beck
 * bank is *tilted by construction*: it is the side of a channel, and the search
 * is deliberately held within three metres of that channel's edge, so there is
 * no flat on it to find. At 0.6 the archipelago carried exactly one mill and
 * five of the six refusals were the same refusal.
 *
 * What makes it honest is that the building answers for it. `SOCLE_DEEP` in
 * `props/watermill.ts` is this number seen from the other end: seventy
 * centimetres of field stone below the sill, buried on the high side and
 * standing on the low one, which is what a mill on a bank has always been built
 * on. The gate and the stone are held in step by the test beside this file.
 */
const SILL_FALL = 0.7

/**
 * How far the ground under the wheel may fall below the mill's sill, in metres.
 *
 * `CHEEK_FOOT` in `props/watermill.ts` seen from the other end. The frame that
 * carries the axle is three quarters of a metre of post below the sill, so
 * ground that has fallen further than this leaves the wheel standing on nothing
 * — which on a bank running down into a channel is a real risk and not a
 * theoretical one.
 *
 * Gated the other way too, and tighter: ground *above* the sill on the wet side
 * buries the bottom of the wheel, and a wheel turning in a hillside is worse
 * than one turning in the air because it looks deliberate.
 */
const WHEEL_DROP = 0.74
const WHEEL_RISE = 0.45

/**
 * Metres of bank between the channel's outer edge and the furthest the mill may
 * stand from it.
 *
 * The ceiling on `watermill.standoff`, and the half of that knob that decides
 * anything. Without it the sweep is free to walk the sill out into the pasture
 * and point a trough at a burn it can no longer reach — which is what the first
 * cut of this did on every island with a hill behind the channel.
 */
const BANK = 3

/**
 * How far the ground may stand above the trough's own floor, in metres.
 *
 * The lade is a trough on trestles and not a tunnel. It is allowed to be a
 * little buried — a mouth is a hole in a bank, and the stone at the upstream end
 * is usually half under the ground on the steeper islands — but a run that
 * disappears into a rise halfway along and comes out the other side is a
 * structure the eye reads as broken.
 */
const SETTLE = 0.25

/** Shortest and longest trough worth digging, in metres. */
const LADE_LEAST = 4

/** Stations along the trough the ground is checked under. */
const SETTLE_PROBES = 8

/** Bearings swept around each course point, and rings of distance out from it. */
const BEARINGS = 32
const RINGS    = 4

/** Metres the sweep's innermost ring stands off the channel's centreline. */
const RING_NEAR = 5
const RING_STEP = 0.6

export interface WatermillSearch {

  /** The ground as the height field leaves it, in metres. */
  ground(x: number, z: number): number

  /** The beck's centreline, spring first and mouth last. */
  course: readonly Vec2[]

  /** Metres between a point and the channel's outer edge, negative inside it. */
  clearanceAt(x: number, z: number): number

  /** Continuous index into {@link course} of the nearest point on it. */
  courseAt(x: number, z: number): number
  waterLevel: number

  /** Metres of fall the reach must have. See `WatermillConfig.watermill.head`. */
  head: number

  /** Metres of dry bank between the channel's edge and the mill. */
  standoff: number

  /** Least metres the sill stands above mean water. */
  freeboard: number

  /** Longest trough the farm would dig, in metres. */
  reach: number

  /** Ground nothing can be founded on at all — the ice, and the cart track. */
  barred(x: number, z: number): boolean
}

/**
 * The worst drop across the room's sill.
 *
 * Walked in the *building's* frame rather than the island's, which is the one
 * thing about this that is not obvious and the one thing that matters. The room
 * is four metres by three, it is sited on a bank that falls at half a metre to
 * the metre, and it is turned to face the water — so a footprint walked on the
 * island's own axes is a different quadrilateral from the one the socle is
 * actually laid on. On the home island the two readings differed by a metre:
 * the axis-aligned probe ran along the contour and reported 0.6 m of fall under
 * a building whose real corners stood 1.76 m apart in height.
 */
function sillFall (search: WatermillSearch, x: number, z: number, angle: number): number {
  const centre = search.ground(x, z)
  const cos    = Math.cos(angle)
  const sin    = Math.sin(angle)
  let worst    = 0

  for (const [ dx, dz ] of SILL_PROBES)
    worst = Math.max(worst, Math.abs(
      search.ground(x + dx * cos + dz * sin, z - dx * sin + dz * cos) - centre,
    ))

  return worst
}

/** The point on the centreline a continuous course index names. */
function alongCourse (course: readonly Vec2[], at: number): Vec2 {
  const first = Math.max(0, Math.min(course.length - 2, Math.floor(at)))
  const local = Math.max(0, Math.min(1, at - first))
  const a     = course[first]
  const b     = course[first + 1]

  return { x: a.x + (b.x - a.x) * local, z: a.z + (b.z - a.z) * local }
}

/** A bank station that survived the cheap gates, before any intake was found. */
interface Stand {
  x:     number
  z:     number
  level: number
  at:    number
  fall:  number

  /** The yaw the mill would be raised with here. See {@link faceTheWater}. */
  angle: number
}

/**
 * The yaw that turns the mill's wet side to the water.
 *
 * The wheel hangs on local `-z` and nothing about the building is free to move
 * it, so this is the whole of the mill's orientation: put local `-z` on the
 * bearing of the nearest water and everything else about the plan follows. The
 * door on local `+z` then faces inland, which is where the flour goes, and
 * `doorstepOf` finds it with no helper of its own.
 *
 * `null` where the stand is somehow on the centreline, which the standoff gate
 * has already made impossible and which is therefore an assertion rather than a
 * case.
 */
function faceTheWater (search: WatermillSearch, stand: Vec2, at: number): number | null {
  const near = alongCourse(search.course, at)
  const dx   = near.x - stand.x
  const dz   = near.z - stand.z
  const span = Math.hypot(dx, dz)

  if (span < 1e-3)
    return null

  return Math.atan2(-dx / span, -dz / span)
}

/**
 * Which end of the wall the lade comes in over, or 0 when it would come in
 * across it.
 *
 * The one gate in the scape about a *building's own frame* rather than about
 * the ground, and the mill is the one building that needs it. A wheel whose axle
 * runs on local `z` can only be filled tangentially — water arriving broadside
 * hits the shroud and turns nothing — so the trough has to run along the wet
 * wall rather than at it.
 *
 * Both ends qualify, and that is the half worth writing down. A breastshot wheel
 * filled from its left turns one way and one filled from its right turns the
 * other; both are mills. Held to one end, this search refused every site on the
 * sound and the shield, whose qualifying banks all happen to lie on the same
 * side of their own becks — a handedness that is an accident of the prop's frame
 * has no business deciding which islands grind their own corn.
 */
function ladeSide (angle: number, ux: number, uz: number): number {
  // Local `+x` in world, for a yaw of `angle`.
  const along = Math.cos(angle) * ux - Math.sin(angle) * uz

  return Math.abs(along) > 0.3 ? Math.sign(along) : 0
}

/**
 * Whether the trough clears the ground it is carried over.
 *
 * Walked from the feed to the mouth on the straight line the run is built along,
 * because that is the line `props/lade.ts` lays timber on. Sampling the *course*
 * instead would answer a question about the beck rather than about the trough.
 */
function ladeClears (
  search: WatermillSearch,
  stand:  Stand,
  intake: Vec2,
  bed:    number,
  angle:  number,
  side:   number,
): boolean {
  const feed  = feedPoint(stand, angle, side)
  const feedX = feed.x
  const feedZ = feed.z
  const feedY = stand.level - WATERMILL_SINK + LADE_FEED.y

  if (bed <= feedY)
    return false

  for (let probe = 1; probe < SETTLE_PROBES; probe += 1) {
    const share = probe / SETTLE_PROBES
    const deck  = feedY + (bed - feedY) * share

    if (search.ground(feedX + (intake.x - feedX) * share, feedZ + (intake.z - feedZ) * share) > deck + SETTLE)
      return false
  }

  return true
}

/**
 * Where the trough lets go, in world space.
 *
 * The mill's own frame carried out: a yaw of `angle` puts local `+x` on
 * `(cos, -sin)` and local `+z` on `(sin, cos)`, which is the pair `placeHero`'s
 * `rotateY` applies to the building itself. Written once here and read by the
 * clearance walk, by the test and — through `WatermillSite.feedSide` — by the
 * dressing that actually lays the timber.
 */
function feedPoint (stand: Vec2, angle: number, side: number): Vec2 {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  return {
    x: stand.x + LADE_FEED.x * side * cos + LADE_FEED.z * sin,
    z: stand.z - LADE_FEED.x * side * sin + LADE_FEED.z * cos,
  }
}

/** Every bank station the ground alone allows, before the water is consulted. */
function bankStands (search: WatermillSearch, avoid: readonly Obstacle[]): Stand[] {
  const stands: Stand[] = []

  for (let index = 1; index < search.course.length - 1; index += 1) {
    const point = search.course[index]

    for (let ring = 0; ring < RINGS; ring += 1)
      for (let step = 0; step < BEARINGS; step += 1) {
        const around = step / BEARINGS * Math.PI * 2
        const out    = RING_NEAR + ring * RING_STEP
        const x      = point.x + Math.cos(around) * out
        const z      = point.z + Math.sin(around) * out
        const clear  = search.clearanceAt(x, z)

        if (clear < search.standoff || clear > BANK)
          continue

        const level = search.ground(x, z)

        if (level - search.waterLevel < search.freeboard || search.barred(x, z))
          continue

        if (avoid.some(thing =>
          Math.hypot(thing.x - x, thing.z - z) < thing.radius + WATERMILL_FOOTING))
          continue

        // Before the sill, because the sill is measured in the frame this sets.
        const at    = search.courseAt(x, z)
        const angle = faceTheWater(search, { x, z }, at)

        if (angle === null)
          continue

        const fall = sillFall(search, x, z, angle)

        if (fall > SILL_FALL)
          continue

        stands.push({ x, z, level, at, fall, angle })
      }
  }

  return stands
}

/**
 * The nearest mouth upstream of a stand that would fill its trough, or `null`.
 *
 * Nearest rather than best, and it is the one place in this search where that is
 * the whole of the judgement: every metre of trough is a metre of timber somebody
 * cut, carried and now has to keep watertight. A farm that could take its water
 * from six metres up the bank does not take it from eleven because the fall there
 * is better.
 */
function mouthAbove (
  search: WatermillSearch,
  stand:  Stand,
  angle:  number,
): { intake: Vec2, bed: number, lade: number, head: number, side: number } | null {
  const wheelX = stand.x + Math.sin(angle) * -WHEEL_REACH
  const wheelZ = stand.z + Math.cos(angle) * -WHEEL_REACH
  const under  = stand.level - search.ground(wheelX, wheelZ)

  if (under > WHEEL_DROP || under < -WHEEL_RISE)
    return null

  for (let index = Math.floor(stand.at); index >= 1; index -= 1) {
    const point = search.course[index]
    const lade  = Math.hypot(point.x - stand.x, point.z - stand.z)

    if (lade < LADE_LEAST)
      continue
    if (lade > search.reach)
      return null

    const bed  = search.ground(point.x, point.z)
    const head = bed - stand.level

    if (head < search.head)
      continue

    const side = ladeSide(angle, (point.x - stand.x) / lade, (point.z - stand.z) / lade)

    if (side === 0)
      continue

    if (!ladeClears(search, stand, point, bed, angle, side))
      continue

    return { intake: point, bed, lade, head, side }
  }

  return null
}

/**
 * The bank the watermill is built on, or `null` when the island's beck has no
 * reach that would turn a wheel.
 *
 * `null` is a real answer and not a failure, the same way the mill's, the
 * chapel's, the smokehouse's and the shieling's are — and on this archipelago it
 * is the more interesting half of what this search decides. Three kinds of
 * island get none: one whose beck simply does not fall far enough in the length
 * of a trough, which is what a burn over peat looks like; one too narrow for
 * there to be any ground that is both off the channel and above the sea; and one
 * where the two exist but never on the same reach. Raising `watermill.head` past
 * what any beck offers takes the rest out of the scape, and there is no separate
 * switch for the reason nothing else here has one.
 *
 * The sweep is rings out from the *channel* rather than a grid over the island,
 * because a mill is a thing on a bank and the bank is a ribbon. Everything the
 * ground can refuse on its own is refused in {@link bankStands} before a single
 * intake is looked at, which is what keeps this inside `scape:map`'s budget on
 * an island whose course carries sixty points.
 *
 * What the score says, in the order it says it: dig the shortest trough; take no
 * more head than the trough needs; and stand level. The surplus term is what
 * stops the shield — whose beck falls nine metres in the length of a lade —
 * putting its mill at the bottom of the whole cascade with a mouth four metres
 * underground.
 */
export function findWatermillSite (
  search: WatermillSearch,
  avoid:  readonly Obstacle[],
): WatermillSite | null {
  if (search.course.length < 3 || search.reach < LADE_LEAST)
    return null

  let best: WatermillSite | null = null
  let bestScore                  = -Infinity

  for (const stand of bankStands(search, avoid)) {
    const mouth = mouthAbove(search, stand, stand.angle)

    if (!mouth)
      continue

    const score = -mouth.lade * 0.6 - (mouth.head - search.head) * 0.35 - stand.fall * 6

    if (score > bestScore) {
      bestScore = score
      best      = {
        x:      stand.x,
        z:      stand.z,
        angle:  stand.angle,
        radius: WATERMILL_FOOTING,
        level:  stand.level,

        intake:      mouth.intake,
        intakeLevel: mouth.bed,
        head:        mouth.head,
        lade:        mouth.lade,
        feedSide:    mouth.side,
      }
    }
  }

  return best
}
