import { dayLength } from '../daylight.ts'
import type { ScapeConfig } from '../config.ts'
import type { ArchipelagoSurvey, LandmassSurvey } from './archipelago.ts'
import type { HeightField } from './height.ts'


/**
 * The round the cart works, and the hours of the day it is worked in.
 *
 * Free of `three` on purpose, the way `haulout.ts` and `mole.ts` are: where the
 * cart is at a given hour is an answer about a route and a clock, so
 * `scape:map` can report it without building a vertex and the tests can state
 * the claim without a gl context. The geometry side is `carters.ts`.
 *
 * ## there is no fourth clock here
 *
 * The cart integrates nothing. Its place on the track is a pure function of
 * `daylight.time` and `season.time` — the two the scape already turns — for the
 * reason the tide carries no rate of its own: a journey with a clock of its own
 * is a journey that is somewhere else in every frame of a tour, and the only
 * way to photograph it would have been to switch it off. So there is no entry
 * for the cart in `STILL`, deliberately. Stopping the day stops the cart where
 * the day left it, and naming an hour puts it back in the same place.
 *
 * The cost of that choice is that a *pace* cannot be metres per second: the day
 * runs at `daylight.speed`, and a pace in seconds would mean the cart gets a
 * different distance along the track depending on how fast the sky is being
 * scrubbed. {@link ScapeConfig.carter.reach} is therefore metres **per turn of
 * the day clock**, which is the only unit in which the journey is the same
 * journey at every speed the overlay can set — the clock's zero included.
 */

/** A point on the round, on the ground and in world metres. */
export interface CarterStation {
  x: number
  y: number
  z: number
}

/** Where the cart is, and which way it is pointing. */
export interface CarterSample extends CarterStation {

  /** Compass bearing of travel, in radians. `yawAlong` turns it into a yaw. */
  bearing: number
}

/** One island's round: up the track from the yard to the shore, and back. */
export interface CarterRound {

  /** The island it is worked on. Reported by `scape:map`, not drawn. */
  id: string

  /** The track, yard first and shore last, on the ground and in world metres. */
  points: readonly CarterStation[]

  /** Horizontal distance from the yard to each point, in metres. */
  marks: readonly number[]

  /** One-way length, in metres. The round itself is twice this. */
  length: number
}

/** How the day is going for one cart. */
export interface CarterJourney {

  /** Whether anybody is on the road at all. */
  out: boolean

  /** Metres from the yard along the track. 0 at the door, {@link CarterRound.length} at the shore. */
  distance: number

  /** Whether the cart is actually moving, as against standing at one end. */
  moving: boolean

  /** Whether it is on the way back. The cart turns round; the route does not. */
  homeward: boolean
}

/**
 * The shortest round worth sending a cart out on, in metres.
 *
 * One-way. Under this the track is a yard apron rather than a road, and a cart
 * that sets off and arrives inside its own length is a jitter rather than a
 * journey.
 */
const SHORTEST = 9

/**
 * How far clear of mean water the far end of the round has to stand, in metres.
 *
 * The same guard the dyke's stations and the snow fence's posts carry, and here
 * for a reason neither of them had to state: the layout draws the track out to
 * `landRadius`, which is the radius the ground is *reliably* dry inside — and
 * the coast is warped, so on a bearing where the island is thin that last
 * stretch of road is already in the sea. Walking the ruts to the end of the
 * line put a cart in seven metres of water on one of the six islands. The round
 * therefore stops at the last station standing this clear of mean water, which
 * is the top of the beach rather than the end of the drawing.
 *
 * Mean rather than high: the tide walks ±0.4 m through `tide.springs`, and a
 * freeboard under that is a cart paddling twice a day.
 */
const BEACH = 0.45

/**
 * How far ahead and behind the bearing is read, in metres.
 *
 * The track is resampled at about one point every two metres, so a bearing
 * taken off the segment the cart happens to be on steps round by a few degrees
 * every couple of seconds. Reading across a span longer than the spacing turns
 * that staircase back into a curve, which is the same trick the ferries use —
 * see `turnLookAhead` in `boats.ts` — minus the turn rate, because a cart on a
 * track has no helm to put over and is simply pointing along the road.
 */
const LOOK = 2.4

/**
 * The longest share of a day a round is allowed to take, as a hard ceiling.
 *
 * The config's own ceiling is clamped to this rather than to 1, and the reason
 * is arithmetic rather than taste: the window is centred on the sun's transit,
 * so a span of 1 would start at phase 0 and a span over 1 would wrap past
 * midnight into the previous day. Everything below assumes the window lies
 * inside one turn of the clock, and this is what makes that true.
 */
const CEILING = 0.94

/**
 * The hours the road is worked, as a share of the day.
 *
 * The lit part of the day, capped at what a person will actually walk in one.
 * Both halves matter and neither is authored: at 68° the midwinter day length
 * is exactly zero, so the window closes and the cart stays in — and at
 * midsummer it is exactly one, so without the cap the cart would work the round
 * right through a midnight that never gets dark.
 */
export function carterSpan (config: ScapeConfig): number {
  const { latitude, axialTilt } = config.daylight

  return carterWindow(dayLength(config.season.time, latitude, axialTilt), config.carter.day)
}

/**
 * The same window, from a day length that has already been solved.
 *
 * Split out of {@link carterSpan} for the one reader that needs to ask the
 * question about a week other than the one the config is on: `scape:map` walks
 * the whole year to report how much of it the road is worked, and rebuilding a
 * config per week to ask would be seventy copies of the scape's schema to
 * answer a question about two numbers.
 */
export function carterWindow (light: number, day: number): number {
  return Math.min(Math.max(0, light), Math.min(CEILING, Math.max(0, day)))
}

/**
 * How many loads a day of this length will take.
 *
 * A day's work is not one journey, and pretending it was left the cart standing
 * at the shore for most of the daylight on every island with a short road. So
 * the window is divided into as many whole out-and-backs as fit, and what is
 * left over inside each one is the time the cart stands at the far end being
 * loaded — which is the same dwell the single-journey version had, taken a load
 * at a time rather than all at once.
 *
 * It is also where the refusal lives. Fewer than one whole load means the cart
 * would not be home before dark, and a cart that would not be home before dark
 * does not set off: 0 here is a road nobody works today.
 */
export function carterLoads (span: number, length: number, reach: number): number {
  if (!(reach > 0) || !(length > 0) || !(span > 0))
    return 0

  return Math.floor(span / (length * 2 / reach))
}

/**
 * Where one cart is at a phase of the day.
 *
 * Out from the door, standing at the shore while it is loaded, and home again
 * — as many times over as the daylight allows, which is {@link carterLoads}.
 * The dwell is what is *left over* within a load rather than a knob of its own:
 * the walk takes what it takes and the rest of the slot is spent at the far
 * end, so a short road is worked hard all day and a long one is one journey
 * with no standing about in it at all.
 *
 * @param time - Phase of the day, 0..1, as `daylight.time` holds it.
 * @param span - The lit window, from {@link carterSpan}.
 * @param length - One-way length of the round, in metres.
 * @param reach - Metres covered in one whole turn of the day clock.
 */
export function carterJourney (
  time:   number,
  span:   number,
  length: number,
  reach:  number,
): CarterJourney {
  const idle: CarterJourney = { out: false, distance: 0, moving: false, homeward: false }
  const loads               = carterLoads(span, length, reach)

  if (loads < 1)
    return idle

  const phase = time - Math.floor(time)
  const since = phase - (0.5 - span / 2)

  if (since < 0 || since > span)
    return idle

  const travel = length * 2 / reach
  const slot   = span / loads
  const within = Math.max(0, since - Math.floor(since / slot) * slot)
  const half   = travel / 2

  if (within <= half)
    return { out: true, distance: Math.min(length, within * reach), moving: true, homeward: false }

  const dwell = slot - travel

  if (within <= half + dwell)
    return { out: true, distance: length, moving: false, homeward: false }

  const back = (within - half - dwell) * reach

  return {
    out:      true,
    distance: Math.max(0, length - back),
    moving:   true,
    homeward: true,
  }
}

/**
 * The round on one island, or `null` where the track is too short to be one.
 *
 * The track is taken as the layout drew it and reversed, because the layout
 * builds it from the shore inward and a round starts at the door. Nothing is
 * re-traced: the cart runs down the centreline the ruts were cut along, which
 * is the only way the two can be guaranteed to agree.
 */
export function planCarterRound (landmass: LandmassSurvey, field: HeightField): CarterRound | null {
  const { origin, survey } = landmass
  const track              = survey.layout.track.points
  const dry                = survey.layout.waterLevel + BEACH

  if (track.length < 2)
    return null

  const points: CarterStation[] = []
  const marks: number[]         = []
  let length                    = 0

  for (let index = track.length - 1; index >= 0; index -= 1) {
    const point = track[index]
    const x     = point.x + origin.x
    const z     = point.z + origin.z
    const y     = field.heightAt(x, z)
    const last  = points[points.length - 1]

    // The road stops at the top of the beach. Breaking rather than skipping,
    // because the stations past the first wet one are wetter still: a round
    // that stepped over a drowned station and carried on would put the cart
    // back on dry ground with a stretch of sea in the middle of its journey.
    if (y < dry)
      break

    if (last)
      length += Math.hypot(x - last.x, z - last.z)

    points.push({ x, y, z })
    marks.push(length)
  }

  if (points.length < 2 || length < SHORTEST)
    return null

  return { id: landmass.id, points, marks, length }
}

/**
 * Every round the archipelago works, home island first.
 *
 * `limit` is the tier's — see `quality.carterRounds` — and it cuts from the far
 * end, so a phone keeps the rounds on the islands it is most likely to be
 * looking at and the outer tracks are simply quiet. A tier that asks for none
 * gets an empty list and no mesh at all rather than a mesh with nothing in it.
 */
export function planCarterRounds (
  archipelago: ArchipelagoSurvey,
  limit:       number,
): CarterRound[] {
  const rounds: CarterRound[] = []

  for (const landmass of archipelago.landmasses) {
    if (rounds.length >= limit)
      break

    const round = planCarterRound(landmass, archipelago.field)

    if (round)
      rounds.push(round)
  }

  return rounds
}

/**
 * The cart's place and bearing at a distance along the round, into `target`.
 *
 * Allocation-free, for the reason `sampleWaterway` is: this runs once per cart
 * per frame, and the fleet owns the record it writes into.
 */
export function sampleCarterRound (
  round:    CarterRound,
  distance: number,
  homeward: boolean,
  target:   CarterSample,
): CarterSample {
  placeOnRound(round, distance, target)

  const ahead  = placeOnRound(round, distance + LOOK, scratchAhead)
  const behind = placeOnRound(round, distance - LOOK, scratchBehind)
  const dx     = ahead.x - behind.x
  const dz     = ahead.z - behind.z
  const facing = Math.hypot(dx, dz) > 1e-6
    ? Math.atan2(dz, dx)
    : 0

  target.bearing = homeward
    ? facing + Math.PI
    : facing

  return target
}

const scratchAhead: CarterStation  = { x: 0, y: 0, z: 0 }
const scratchBehind: CarterStation = { x: 0, y: 0, z: 0 }

/** Linear interpolation along the round's own marks, clamped at both ends. */
function placeOnRound<T extends CarterStation> (
  round:    CarterRound,
  distance: number,
  target:   T,
): T {
  const { points, marks } = round
  const walked            = Math.min(Math.max(0, distance), round.length)

  let index = 1

  while (index < marks.length - 1 && marks[index] < walked)
    index += 1

  const from = points[index - 1]
  const to   = points[index]
  const span = marks[index] - marks[index - 1]
  const t    = span > 1e-6
    ? (walked - marks[index - 1]) / span
    : 0

  target.x = from.x + (to.x - from.x) * t
  target.y = from.y + (to.y - from.y) * t
  target.z = from.z + (to.z - from.z) * t

  return target
}
