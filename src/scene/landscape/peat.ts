import { smoothstep } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { CHAPEL_FOOTING } from './chapel.ts'
import { distanceToTrack, pastureInfluence, plotInfluence, ridgeInfluence } from './layout.ts'
import type { ScapeLayout } from './layout.ts'
import { MILL_FOOTING } from './mill.ts'
import type { Tarn } from './tarn.ts'


/**
 * The turf ground the farm burns.
 *
 * Every roof out on the rocks is turf and every hearth in the archipelago is
 * lit, and until now neither came from anywhere. A peat bank is where they come
 * from: a face cut into the wet moor, worked backwards a few metres a year, with
 * the stripped floor lying open behind it and the turves stood up on the bank to
 * dry.
 *
 * It is sited the way the tarn is rather than traced the way the beck is — there
 * is no rule of nature that says where a man starts digging, only which ground
 * is worth digging. That ground is flat, low and badly drained: flat because a
 * face cut into a hillside collapses, low because that is where the water sits
 * and the peat forms, badly drained because peat *is* the drainage failing for
 * five thousand years. So the search is the tarn's search with its bribe
 * reversed — the pool pays flatness for altitude, and the cutting pays it for
 * the lack of any.
 *
 * The one thing the cutting has that no other sited feature does is a *bearing*.
 * A pool is a disc and does not care which way it faces; a working face has to
 * stand across the fall, or the first wet week takes the bank down onto the
 * floor. So the orientation is read off the ground's own gradient rather than
 * chosen, and the cutting is worked downhill from it.
 */
export interface PeatBank {

  /** Middle of the working face, in the island's local frame. */
  x: number
  z: number

  /**
   * Bearing the face runs along, in radians.
   *
   * Across the fall, never along it — see {@link PeatBank}. The stripped floor
   * lies on the downhill side of this line, which is what `claimAt` measures
   * against.
   */
  bearing: number

  /** Metres of open face. */
  face: number

  /** Metres the cutting has been worked back from that face. */
  reach: number

  /** Metres the floor stands below the moor at the face. */
  depth: number

  /** Height of the moor at the face: the top of the cut, and the one measured number. */
  level: number

  /**
   * Metres of relief measured **along the face** — the flatness it was sited for.
   *
   * Along the face rather than across the whole footprint, and the distinction
   * is the difference between a search that finds sites and one that does not:
   * a working *wants* the ground to fall away from its face, and only the face
   * itself has to be level, because a face is cut along one line.
   */
  spread: number

  /** Middle of the stripped floor. Where anything worked on the bank is scattered from. */
  floor: { x: number, z: number, radius: number }

  /**
   * How strongly a point is on the stripped floor, 1 in the middle and 0 off it.
   *
   * The carve, the terrain paint, the footpath planner and the scatter all read
   * this one function, which is what keeps the dark ground, the step in the
   * terrain and the drying turves describing the same rectangle.
   */
  claimAt(x: number, z: number): number
}

/** The ground the search measures, before anything has been cut out of it. */
export type GroundAt = (x: number, z: number) => number

/**
 * Candidate origins per axis, across the island's land radius.
 *
 * The tarn's number, for the tarn's reason: a count rather than a spacing, so
 * the fell is not searched nine times as hard as the home island for a feature
 * whose whole test is about relief measured over metres.
 */
const CANDIDATES = 24

/**
 * Samples taken along the face.
 *
 * The face is the thing that has to be level, so the flatness test is taken
 * along it rather than at its middle — a face sampled at one point is a face
 * sited on the only level square metre of a hillside.
 */
const ALONG_SAMPLES = 5

/**
 * The steepest the ground under a working may fall, as a gradient.
 *
 * Not a drawing constraint — the carve tracks the ground, so a cutting on a
 * slope is still a cutting a spade deep — but a constraint about what peat *is*.
 * Blanket peat forms where the ground does not drain, and ground that falls by
 * a third of its own length drains perfectly well. A bank cut into that is a
 * bank cut into a hillside with no turf in it.
 *
 * A third is roughly eighteen degrees, which on these islands admits most of
 * the moor above the shore and refuses the fell sides.
 */
const DRAINED_GRADE = 0.32

/**
 * Metres of footprint relief that a metre of altitude is worth.
 *
 * The tarn's `HEIGHT_WORTH` with its sign turned over, and the reason is the
 * same shape: the flattest ground on one of these islands is very often the
 * high shoulder the pasture is already on, and a peat bank cut up there is a
 * peat bank in ground that has never held water. Paying a little flatness to
 * come *down* is what puts the working on the wet moor above the shore, which
 * is where the turf is.
 */
const LOW_WORTH = 0.3

/**
 * Metres of footprint relief that standing in the thick of the forest is worth.
 *
 * A penalty rather than a refusal, because `ridgeInfluence` is a density and not
 * a wood: on these islands the conifers take nearly every dry acre, so a search
 * that refused any of it would refuse every site there is. Two metres is enough
 * to move the working off the ridges and onto the open ground between them, and
 * not enough to send it back down to the foreshore the `lift` just kept it off.
 */
const WOODED_COST = 2

/**
 * Metres the face is ramped over, and metres the other three edges are.
 *
 * A cut face is vertical and the terrain grid is not: the home island's patch
 * carries a vertex every 0.68 m at the desktop tier and every 2.3 m on mobile,
 * so a step asked for over nothing at all is a step drawn over one quad
 * whatever this says. Half a metre is that quad on the tier the scape is tuned
 * at and an honest ramp on the tier below it — which is the difference between
 * a face that goes soft on a phone and a face that goes to sawtooth.
 *
 * The back and the flanks get twice as much, because they are not a face:
 * behind the cutting is ground worked years ago and grown over, and it meets the
 * moor as a slump rather than as an edge. Not more than twice, and that is a
 * finding rather than a taste: at three the ramps ate most of an eleven-metre
 * face from both sides and the working photographed as a stain with soft edges
 * instead of as a rectangle somebody cut.
 */
const FACE_RAMP = 0.5
const EDGE_RAMP = 1

/** How far outside the footprint the drying ground reaches, as a fraction of it. */
const FLOOR_MARGIN = 1.12

/** Ground already spoken for, which no cutting may be dug into. */
function taken (layout: ScapeLayout, tarn: Tarn | null, x: number, z: number, radius: number): boolean {
  if (Math.hypot(x - layout.yard.x, z - layout.yard.z) < layout.yard.radius + radius)
    return true
  if (distanceToTrack(layout, x, z) < layout.track.width * 1.5 + radius)
    return true
  if (layout.plots.some(plot => plotInfluence(plot, x, z) > 0))
    return true
  if (pastureInfluence(layout, x, z) > 0)
    return true
  if (layout.mill && Math.hypot(x - layout.mill.x, z - layout.mill.z) < MILL_FOOTING + radius)
    return true
  if (layout.chapel && Math.hypot(x - layout.chapel.x, z - layout.chapel.z) < CHAPEL_FOOTING + radius)
    return true

  // The pool, explicitly, and it has to be: the cutting is sited against the
  // ground the basin has already been carved into, and the floor of a tarn is
  // the flattest, lowest ground on the island by a wide margin. Every bribe this
  // search pays would be paid to dig peat out from under standing water.
  if (tarn && Math.hypot(x - tarn.x, z - tarn.z) < tarn.radius + radius)
    return true

  // And the channel, for the reason the pool's carve keeps out of it: a cutting
  // across the beck is a cutting the beck runs through.
  return (layout.creek?.clearanceAt(x, z) ?? Infinity) < radius
}

/**
 * Which way the ground falls, as a unit vector, or `null` where it is level.
 *
 * Its own central difference rather than the height field's `normalAt`, because
 * the solver runs before the field it is sited against is the field anything
 * else reads — and because what is wanted here is the fall in the ground plane
 * rather than a surface normal. The reach is wide on purpose: the face is
 * fourteen metres long and the slope it has to stand across is the slope over
 * that span, not the slope over the half metre a normal is differenced across.
 */
function fallAt (ground: GroundAt, x: number, z: number, reach: number): { x: number, z: number } | null {
  const dx = ground(x + reach, z) - ground(x - reach, z)
  const dz = ground(x, z + reach) - ground(x, z - reach)

  const length = Math.hypot(dx, dz)

  // Level ground has no downhill, and inventing one out of floating-point noise
  // is how a cutting on a flat moor faces a different way for every seed that
  // does not change it. A working on ground this flat is worked from whichever
  // side the man came up, which is not a fact the scape has — so it is `null`,
  // and the caller declines the site rather than guessing.
  return length < 1e-4
    ? null
    : { x: -dx / length, z: -dz / length }
}

/** The claim, as a pure function of the rectangle. Shared by the solver and the result. */
function claimOf (
  bearing: number,
  face:    number,
  reach:   number,
  originX: number,
  originZ: number,
) {
  const cos  = Math.cos(bearing)
  const sin  = Math.sin(bearing)
  const half = face * 0.5

  return (x: number, z: number): number => {
    const dx = x - originX
    const dz = z - originZ

    // Along the face, and out from it on the downhill side. The normal is the
    // bearing turned a quarter, which is the direction the cutting is worked in.
    const along = dx * cos + dz * sin
    const out   = -dx * sin + dz * cos

    if (out <= 0 || out >= reach || Math.abs(along) >= half)
      return 0

    return smoothstep(0, FACE_RAMP, out) *
      (1 - smoothstep(reach - EDGE_RAMP, reach, out)) *
      (1 - smoothstep(half - EDGE_RAMP, half, Math.abs(along)))
  }
}

/**
 * The two things the ground under the working has to be, measured separately.
 *
 * They are separate because they are not the same question, and the first cut
 * of this search asked them as one — relief over the whole rectangle — which
 * threw away every honest site on the island. A peat bank *wants* the ground to
 * fall away from its face: that is the shape of the thing, a wall at the top and
 * a floor running out from under it. What it cannot have is a face that is
 * higher at one end than the other, because a face is cut along one level.
 *
 * So `alongRelief` is the relief measured **along the face**, which is the
 * flatness that matters and the number the config's `spread` is about; and
 * `fall` is how far the ground drops **across the reach**, which is allowed and
 * only has to stay inside the depth of the cut. Past that the hill has fallen
 * further than the spade goes and the downward-only carve leaves no floor at
 * all — a rectangle of dark paint on an untouched slope.
 */
interface FootprintGround {
  alongRelief: number
  fall:        number
  lowest:      number
}

function groundUnder (
  ground:  GroundAt,
  x:       number,
  z:       number,
  bearing: number,
  face:    number,
  reach:   number,
): FootprintGround {
  const cos = Math.cos(bearing)
  const sin = Math.sin(bearing)

  let highestFace = -Infinity
  let lowestFace  = Infinity
  let lowest      = Infinity
  let faceTotal   = 0
  let backTotal   = 0

  for (let index = 0; index < ALONG_SAMPLES; index += 1) {
    const along  = (index / (ALONG_SAMPLES - 1) - 0.5) * face
    const atX    = x + cos * along
    const atZ    = z + sin * along
    const onFace = ground(atX, atZ)
    const atBack = ground(atX - sin * reach, atZ + cos * reach)

    highestFace = Math.max(highestFace, onFace)
    lowestFace  = Math.min(lowestFace, onFace)
    lowest      = Math.min(lowest, onFace, atBack)
    faceTotal  += onFace
    backTotal  += atBack
  }

  return {
    alongRelief: highestFace - lowestFace,
    fall:        (faceTotal - backTotal) / ALONG_SAMPLES,
    lowest,
  }
}

/**
 * Whether the ground under a footprint is ground with peat in it.
 *
 * Three refusals, and its own function rather than three more clauses in the
 * search, which the lint config's complexity ceiling is right about: the search
 * is a question about the *composition* — what is already there and how far the
 * coast is — and this is the only part of it that is a question about the moor.
 *
 * A footprint that dips under the lift has the foreshore in it, however level
 * the rest of it measures. A face that is not level is not a face. And ground
 * that falls by more than {@link DRAINED_GRADE} drains, which is the one thing
 * peat is made by not doing.
 */
function holdsPeat (
  under:   FootprintGround,
  lowest:  number,
  allowed: number,
  reach:   number,
): boolean {
  return under.lowest >= lowest &&
    under.alongRelief <= allowed &&
    under.fall <= reach * DRAINED_GRADE
}

/**
 * Site the cutting: the flattest, lowest piece of moor with room for it.
 *
 * @param ground The ground with the pool already cut into it — the cutting is
 *   sited last of the two, so it is sited against what the pool left.
 *
 * @returns The bank, or `null` when nothing on the island is flat and low
 *   enough. An island of nothing but hillside has no peat on it, and that
 *   absence is the honest answer rather than a face cut into a slope.
 */
export function solvePeatBank (
  config: ScapeConfig,
  layout: ScapeLayout,
  ground: GroundAt,
  tarn:   Tarn | null = null,
): PeatBank | null {
  const { face, reach, depth, lift, spread: allowed } = config.peat

  if (depth <= 0 || face <= 0 || reach <= 0)
    return null

  const floorLevel = layout.waterLevel + lift

  // The rectangle's own half-diagonal, measured from its middle rather than from
  // the face. The first cut of this took the distance from the face to the far
  // corner and used it as a radius about the face — which is a circle nearly
  // twice the working's own, and on an island this thoroughly spoken for it
  // refused every site there was.
  const guard = Math.hypot(face, reach) * 0.5
  const step  = layout.landRadius * 2 / CANDIDATES

  let best: PeatBank | null = null
  let bestScore             = Infinity

  for (let ix = 0; ix <= CANDIDATES; ix += 1)
    for (let iz = 0; iz <= CANDIDATES; iz += 1) {
      const x     = -layout.landRadius + ix * step
      const z     = -layout.landRadius + iz * step
      const level = ground(x, z)

      if (level < floorLevel)
        continue

      const fall = fallAt(ground, x, z, reach)

      if (!fall)
        continue

      // The face stands across the fall, so its bearing is the downhill
      // direction turned a quarter — which is the same statement as saying the
      // cutting's own normal *is* the downhill direction.
      const bearing = Math.atan2(-fall.x, fall.z)
      const cos     = Math.cos(bearing)
      const sin     = Math.sin(bearing)

      // The candidate is the middle of the *face*; the working itself lies
      // downhill of it, so what has to clear the coast and the composition is
      // the middle of the rectangle. Which cannot be known before the bearing
      // is, and is why these two tests come after it rather than before.
      const midX = x - sin * reach * 0.5
      const midZ = z + cos * reach * 0.5

      if (Math.hypot(midX, midZ) > layout.landRadius - guard)
        continue
      if (taken(layout, tarn, midX, midZ, guard))
        continue

      const under = groundUnder(ground, x, z, bearing, face, reach)

      if (!holdsPeat(under, floorLevel, allowed, reach))
        continue

      // The fall is in the score as well as in the gate: between two level
      // faces the better bank is the one on the flatter ground, and without
      // this the search takes the steepest site it is still allowed to have.
      //
      // The wooded high points are in it too, and that is not a framing
      // decision: the conifers cluster toward the ridges, and ground that grows
      // a spruce wood is ground that drains. A cutting sited in the middle of
      // one is a cutting in soil rather than in peat — and it also photographs
      // as a dark patch behind four trees, which is the same fact from the
      // other side.
      const score = under.alongRelief + under.fall +
        (level - layout.waterLevel) * LOW_WORTH +
        ridgeInfluence(layout, midX, midZ) * WOODED_COST

      if (score < bestScore) {
        bestScore = score
        best      = {
          x,
          z,
          bearing,
          face,
          reach,
          depth,
          level,
          spread: under.alongRelief,
          floor:  {
            x:      midX,
            z:      midZ,
            radius: Math.max(face * 0.5, reach * 0.5) * FLOOR_MARGIN,
          },
          claimAt: claimOf(bearing, face, reach, x, z),
        }
      }
    }

  return best
}

/**
 * The ground with the turf taken off it.
 *
 * One spit below whatever was there, and that is the whole model: peat is cut
 * *out* of the ground rather than levelled into it, so the floor follows the
 * moor down rather than standing at one height across the rectangle. A level
 * floor was the first cut of this and it is what a quarry looks like — on ground
 * that fell faster than the spade goes it bit only at the face and left the rest
 * of the working untouched.
 *
 * Capped at the face's own level, so a bulge inside the rectangle is taken off
 * rather than followed up: the top of a cut face is one line, and a working with
 * a hummock standing in the middle of it has not been worked.
 *
 * What makes it read as a cutting is therefore the *edges* rather than the
 * floor, and they are guaranteed: the claim rises from nothing to one over half
 * a metre at the face, so the step there is at least the full depth however the
 * ground was lying, and it falls back to nothing over a metre and a half at the
 * back and the flanks, which is the slumped edge of ground worked years ago.
 */
export function carvePeat (bank: PeatBank | null, x: number, z: number, height: number): number {
  if (!bank)
    return height

  const claim = bank.claimAt(x, z)

  if (claim <= 0)
    return height

  const floor = Math.min(height, bank.level) - bank.depth

  return height + (floor - height) * claim
}

/**
 * How much of the face is actually standing, in metres of drop.
 *
 * The claim, as a number: a cutting whose face went flat is a rectangle of dark
 * paint on an untouched hillside — identical from every pose, and invisible in
 * every still the tour takes. The carve guarantees at least `depth` here, so a
 * reading below it is a bug rather than a siting outcome, and a reading well
 * above it says the working is on ground steeper than it looks.
 *
 * Measured along the face rather than at its middle, because a cutting can be
 * standing at one end and buried at the other.
 *
 * @param ground The ground *with* the cut in it.
 */
export function peatFaceStanding (bank: PeatBank, ground: GroundAt): number {
  const cos = Math.cos(bank.bearing)
  const sin = Math.sin(bank.bearing)
  let biggest = 0

  for (let index = 0; index < ALONG_SAMPLES; index += 1) {
    const along = (index / (ALONG_SAMPLES - 1) - 0.5) * bank.face * 0.9
    const x     = bank.x + cos * along
    const z     = bank.z + sin * along

    // A step across the ramp: the moor a whisker behind the face line, against
    // the floor a whisker in front of where the ramp has finished.
    const top    = ground(x + sin * FACE_RAMP, z - cos * FACE_RAMP)
    const bottom = ground(x - sin * FACE_RAMP * 2.4, z + cos * FACE_RAMP * 2.4)

    biggest = Math.max(biggest, top - bottom)
  }

  return biggest
}
