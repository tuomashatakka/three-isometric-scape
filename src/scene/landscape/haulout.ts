import { createSeededRng } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import type { ArchipelagoSurvey } from './archipelago.ts'
import { SKERRY_WATERLINE, warpedRadius } from './skerry.ts'
import type { Skerry } from './skerry.ts'


/**
 * The rocks the seals lie on, and where on them each animal is.
 *
 * The guard has been fifty-nine rocks of scoured granite with a weed band round
 * the bottom and a lichen crust on top, and nothing on it has ever been alive.
 * This is what uses it. A haul-out is not a decoration on a skerry — it is a
 * statement about *which* skerry, because a seal is particular in a way that is
 * easy to state and would be wrong to fudge:
 *
 * - a rock that never dries is a shoal, and there is nothing to lie on
 * - a rock that stands too proud is a cliff, and there is no way up it out of
 *   deep water
 * - a rock too small is a perch, and a two-metre animal does not fit on it
 *
 * Those three are `haulout.sill`, `haulout.reach` and `haulout.stone`, and there
 * is no fourth switch anywhere that says "this rock has seals on it". The search
 * either finds ground or it does not.
 *
 * ### where on the rock
 *
 * The interesting half, and the reason this is a survey rather than a scatter.
 * A seal hauls out at the water's edge and not on the summit — it came out of
 * the sea and it intends to go back — so the animals are dealt across the
 * *outer* band of the dry crown, which by the skerry profile is the part barely
 * over mean water. Which means the colony is worked by the tide for free: the
 * lowest animals are covered at high springs and the highest are never covered
 * at all, and the count ashore is a falling function of the water level with
 * nothing anywhere integrating a clock. See `landscape/seals.ts` for the half
 * that draws it.
 *
 * **Every length here is metres and stays metres.** A seal is the size a seal
 * is, and a world that grew again puts its rocks further apart; it does not
 * breed larger animals or raise the tide they live in.
 */

/**
 * One animal's place on the stone, in world metres.
 *
 * A position, a bearing and the height of the ledge it is lying on — and
 * deliberately nothing about the tide. Whether this seal is ashore *now* is
 * read per frame from the published tide by `landscape/seals.ts`; this is only
 * the survey's answer to where an animal can be and how high that is.
 */
export interface HauledSeal {

  /** The chain the rock belongs to, so the map can say which guard is used. */
  guard: number

  x: number
  z: number

  /** Absolute world height of the stone under it. What the tide is measured against. */
  ledge: number

  /** Which way it is facing, in radians. */
  angle: number

  /** Nose-to-tail scale, around 1. A colony is cows, bulls and last year's pups. */
  size: number

  /**
   * How readily this animal is out of the water at all, 0..1.
   *
   * The per-seal half of `haulout.ashore`: an animal is on the rock while its
   * keenness is under the share the config asks for, so turning the knob down
   * thins the colony the same way every time instead of reshuffling which
   * animals are out. 0 on the knob is a guard whose seals are all fishing, and
   * that is the switch — there is no boolean beside it.
   */
  keen: number
}

/**
 * One rock in use, and the animals on it.
 *
 * Carries the rock itself rather than a copy of its position and freeboard: a
 * haul-out *is* a skerry that seals use, and restating three of its fields here
 * would be three numbers nothing checks against the rock they came from.
 */
export interface Haulout {
  skerry: Skerry

  /** Mean metres from the centre to where the crown falls back into the water. */
  crown: number
  seals: readonly HauledSeal[]
}

/**
 * How much of a rock's radius is dry crown, by the skerry's own profile.
 *
 * Read from `SKERRY_WATERLINE` rather than authored, for the reason that
 * constant is exported at all: a second copy of 0.42 here is a colony that walks
 * off its stone the first time the rock profile is retuned.
 */
const CROWN = 1 - SKERRY_WATERLINE

/**
 * Metres of stone between an animal's middle and the edge of the crown.
 *
 * The outer limit of the band, and it is a *length* rather than a fraction —
 * which is the whole point. A seal lies with its nose toward the water it came
 * out of, so what decides how close to the edge it can be is how long a seal is,
 * not how big the rock is. The first cut of this band was a fraction of the
 * crown and it put the animals on the widest rocks with their heads out over the
 * drop: `prop:map` cannot see that, and the close pose in `--poses haulout` can,
 * and did.
 *
 * A little over half of the 2.2 m the builder actually produces, so the muzzle
 * is on stone at the yaw the placement deals and the tail is well inboard.
 */
const NOSE = 1.3

/**
 * How far up the crown the band stops, as a fraction of it.
 *
 * Not a knob, for the reason `LOBE` and `SHELF` in `skerry.ts` are not: it is
 * read off the profile rather than chosen. Short of 1 because the top of a
 * skerry is its flattest, driest ground and an animal there has hauled a long
 * way for nothing — and because the band has to keep a top that is dry at every
 * state of the tide, which is what makes the count ashore fall rather than
 * collapse.
 */
const BAND_OUT = 0.86

/** Metres of stone a hauled animal needs to itself, measured along the band. */
const BERTH = 2.6

/**
 * Radians between one animal and the next round the band.
 *
 * The golden angle, and it is here for the determinism rule rather than for the
 * look of it. Dealing bearings as `head / count` makes the count part of every
 * animal's position, so a tier with one seal fewer moves every seal on the rock
 * — which is the same failure as a scatter that reshuffles when a prop is added
 * to the roster. A golden-angle sequence has no such divisor: *any* prefix of it
 * is spread evenly round the circle, so a phone's four animals are the first
 * four of a workstation's twelve, in the places the workstation puts them.
 */
const TURN = Math.PI * (3 - Math.sqrt(5))

/** Height of the crown at a fraction of the way in from its edge, over mean water. */
export function crownHeight (crest: number, inward: number): number {
  const rise = Math.max(0, Math.min(1, inward))

  return crest * (1 - (1 - rise) * (1 - rise))
}

/**
 * How many animals a band of stone will take.
 *
 * The circumference of the middle of the band divided by the room one seal
 * needs, capped by the tier's budget. A rock is not given more seals for being
 * asked for more: the guard's widest stone is twenty-four metres across and its
 * narrowest ten, and dealing one number of animals to both would either crowd
 * the small rocks or leave the large ones empty.
 */
export function berths (crown: number): number {
  const mid = crown * (1 - (NOSE / Math.max(NOSE, crown) + BAND_OUT) * 0.5)

  return Math.max(1, Math.floor(Math.PI * 2 * mid / BERTH))
}

/** Whether a rock is one seals would use at all. See the three rules above. */
export function isHaulout (skerry: Skerry, haulout: ScapeConfig['haulout']): boolean {
  return skerry.crest >= haulout.sill &&
    skerry.crest <= haulout.reach &&
    skerry.radius >= haulout.stone
}

/**
 * Every seal in the archipelago, on the rocks that will carry one.
 *
 * Deterministic: one rng forked per rock off the scape's seed, so a rock that
 * gains an animal does not reshuffle the colony on every other rock in the
 * guard — the same discipline every scatter in the scape is held to.
 *
 * @param heads Animals a rock may carry, from the tier. 0 is a coast with no
 *   seals on it, and the whole system is then absent rather than cheap.
 */
export function planHaulouts (
  survey: ArchipelagoSurvey,
  config: ScapeConfig,
  heads:  number,
): readonly Haulout[] {
  const budget = Math.max(0, Math.floor(heads))

  if (budget < 1)
    return []

  const { waterLevel }      = config.terrain
  const rng                 = createSeededRng(config.seed ^ 0x5ea1)
  const haulouts: Haulout[] = []

  for (const [ which, skerry ] of survey.skerries.skerries.entries()) {
    if (!isHaulout(skerry, config.haulout))
      continue

    const crown               = skerry.radius * CROWN
    const count               = Math.min(budget, berths(crown))
    const stone               = rng.fork(`rock-${which}`)
    const start               = stone.next() * Math.PI * 2
    const seals: HauledSeal[] = []

    for (let head = 0; head < count; head += 1) {
      // Spread round the band by the golden angle from a start of this rock's
      // own, and jittered off it. A bearing drawn at random per seal piles three
      // of them on one side; a bearing divided by the count moves all of them
      // when the count changes.
      const bearing = start + head * TURN + stone.range(-0.18, 0.18)
      // Squared, so the deal crowds the *bottom* of the band. That is what a
      // haul-out looks like — the animals are at the water's edge and the ones
      // higher up the rock are the ones that could not get a place there — and
      // it is also what gives the tide something to work on, because the ledges
      // are then packed into the few centimetres the sea actually swings
      // through rather than spread evenly up a two-metre rock.
      // Against the *warped* radius at this bearing rather than against the
      // nominal one. A skerry's outline is two cosine lobes deep, so a fifth of
      // the circle has its edge pulled a fifth of a radius in — an animal placed
      // off the mean would be standing in the sea there and buried in the rock a
      // quarter turn away. Reading it here is also what makes the ledge below
      // exactly the height the terrain draws, rather than nearly it.
      const reach  = warpedRadius(skerry, bearing) * CROWN
      const edge   = Math.min(BAND_OUT, NOSE / Math.max(NOSE, reach))
      const along  = stone.next()
      const inward = edge + (BAND_OUT - edge) * along * along
      const radius = reach * (1 - inward)

      seals.push({
        guard: skerry.guard,
        x:     skerry.x + Math.cos(bearing) * radius,
        z:     skerry.z + Math.sin(bearing) * radius,
        ledge: waterLevel + crownHeight(skerry.crest, inward),

        // Facing the water it came out of, give or take. A colony all pointing
        // dead outward reads as a compass rose rather than as animals.
        angle: bearing + stone.range(-0.7, 0.7),
        size:  0.82 + stone.next() * 0.42,
        keen:  stone.next(),
      })
    }

    haulouts.push({ skerry, crown, seals })
  }

  return haulouts
}

/** Every animal in the archipelago, flattened out of the rocks that carry them. */
export function hauledSeals (haulouts: readonly Haulout[]): readonly HauledSeal[] {
  return haulouts.flatMap(rock => rock.seals)
}

/**
 * How far out of the water one animal's ledge is, in metres.
 *
 * The whole of the tide coupling, in one line, and it is a subtraction rather
 * than a state: the sea is where the published tide says it is, the stone is
 * where the survey left it, and the difference is whether there is anywhere to
 * lie. Nothing here integrates and nothing here remembers, which is why a still
 * taken with every clock stopped shows the colony the hour actually puts ashore.
 */
export function sealClearance (seal: HauledSeal, waterLevel: number, tideLevel: number): number {
  return seal.ledge - (waterLevel + tideLevel)
}

/**
 * How much of one animal is ashore, 0..1.
 *
 * A ramp rather than a step, over the last few centimetres of clearance. A seal
 * that vanished the instant the water touched its ledge would pop, and forty of
 * them popping together as the flood came over a rock is the sort of thing a
 * diff catches and a reader never forgives.
 */
export function sealAshore (clearance: number, emerge: number): number {
  if (emerge <= 0)
    return clearance > 0 ? 1 : 0

  return Math.max(0, Math.min(1, clearance / emerge))
}

/** How many of a colony are out of the water at a state of the tide. */
export function countAshore (
  seals:      readonly HauledSeal[],
  waterLevel: number,
  tideLevel:  number,
): number {
  return seals.filter(seal => sealClearance(seal, waterLevel, tideLevel) > 0).length
}
