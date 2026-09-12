import type { ScapeConfig } from '../config.ts'
import { beaconCrown } from './beacon.ts'
import { resolveIsles } from './height.ts'
import type { HeightField } from './height.ts'
import type { Vec2 } from './path.ts'


/**
 * Which rock caught her.
 *
 * Every site in this survey so far is a decision somebody made. The farm is
 * sited for shelter, the mill for wind, the chapel for a knoll, the light for
 * the last rock a boat passes on its way in. This one is the only site in the
 * scape that is nobody's decision, and the search is written the other way round
 * to say so: where the beacon wants the rock that is highest and broadest, this
 * wants the rock that is **lowest** — the one nothing shows of until it is under
 * you, which is the rock a hull finds.
 *
 * That inversion is the whole of it, and it is why the two searches can share
 * `beaconCrown` without becoming the same search. They read the same ring and
 * the same crowns; they spend them in opposite directions. The light stands on
 * the rock the wreck argues for.
 *
 * Three questions, in the order they cost:
 *
 * - **does the rock show at all, and barely.** Its *crown* — the same highest
 *   point the light is built on, read through the same `beaconCrown`, because
 *   what a helmsman can see of a rock is its top. Above the water, so there is
 *   something to strike; under {@link WreckConfig.awash}, so it is something
 *   nobody could have seen in time. That upper bound is the switch.
 * - **will it hold her.** A hull aground bears on a length of her keel, not on a
 *   point, so the middle of the ledge has to be rock for {@link WRECK_BEARING}
 *   either side of her. She lies at that middle rather than on the crown, and
 *   the two are different questions: the crown is what could be seen, and the
 *   middle is where there is most rock to lie on.
 * - **which line is she on.** Straight in off the open water, unless that line
 *   runs her off the edge of the ledge — in which case the arc either side of it
 *   is swept and the least-turned bearing that holds her wins.
 *
 * Pure, and in the landmass's local frame like every other survey — the caller
 * projects it into the world, and `scape:map` reports the rock without building
 * a vertex of her. See `props/wreck.ts` for the timber.
 */
export interface WreckSite extends Vec2 {

  /** Rock height under the middle of her keel, in metres. */
  level: number

  /**
   * Metres between the rock's crown and mean water. Small, by construction.
   *
   * The crown rather than the ledge she is on, because this is the number the
   * search is *about*: it is how much of the rock there was to see. They differ
   * by a couple of centimetres on a plateau and by a good deal more on a rock
   * with a horn on it, and it is the horn a helmsman would have seen.
   */
  freeboard: number

  /**
   * The heading she is lying on, in radians — bow inward, toward the island.
   *
   * She came in off the open water, so the bow points the way she was going when
   * the rock stopped her. Feed it to `yawAlong` for the yaw she is raised with.
   */
  bearing: number

  /** Degrees that heading is turned off the line straight in from the open sea. */
  turn: number

  /** Worst the rock falls away under her bearing, in metres. */
  fall: number

  /** Metres from the island's centre. Reported for the reason the beacon's is. */
  reach: number

  /** Index of the islet in `terrain.isles`, so the map tools can name it. */
  isle: number
}

/**
 * How much ground she claims, in metres.
 *
 * The hull is seven metres of surviving midships between two broken posts, so
 * this is half that with the stem's rake added and a little over — measured from
 * her own origin, which is the middle of the keel. The stem is what sets it: a
 * raked post reaches further forward the taller it is left, so this moves every
 * time that timber does. Held in step with the
 * geometry by the test in `props/wreck.test.ts`, the same way `BEACON_FOOTING`
 * and `CROFT_FOOTING` are, and reserved against the scatter in `dressing.ts` so
 * nothing is seeded through her frames.
 */
export const WRECK_FOOTING = 4.2

/**
 * How much of her length is actually bearing on rock, either side of her, in
 * metres.
 *
 * Not her whole length, and the difference is the point: a wreck overhangs what
 * she is on. What has to be rock is the part of the keel taking her weight,
 * which on these skerries is the middle three metres of a seven metre hull — the
 * two broken ends hang out over the fall, which is what they look like. Held
 * under `wreck.minRock` by the test beside this file, so a rock that passes the
 * width gate is a rock the bearing can fit on.
 *
 * A craft fact rather than a tuning knob, which is why it is here and not in the
 * config: what a reader wants to turn is how low the rock is and how much of a
 * hollow she may bridge, not how long a boat is.
 */
export const WRECK_BEARING = 1.5

/** How the arc off the open sea is swept, in degrees. */
const TURN  = 40
const SWEEP = 10

/** Stations along the bearing the bed is probed at, each way from her middle. */
const BED_PROBES = 3

/**
 * The worst the rock falls away under one bearing, in metres.
 *
 * `Infinity` when any station of the bearing is under water, which is the answer
 * that does the work: a crown two metres across surrounded by eleven metres of
 * open sound passes a centre test and fails this one, and a hull that passed the
 * centre test alone would be lying on a pinnacle with her whole length in the
 * air. The same lesson the churchyard wall and the smokehouse sill both wrote
 * down, at the one scale where the ground falls away vertically.
 */
function bedFall (
  field:      HeightField,
  bed:        Vec2 & { level: number },
  bearing:    number,
  waterLevel: number,
): number {
  const cos = Math.cos(bearing)
  const sin = Math.sin(bearing)
  let worst = 0

  for (let probe = 1; probe <= BED_PROBES; probe += 1)
    for (const side of [ -1, 1 ]) {
      const along = side * probe / BED_PROBES * WRECK_BEARING
      const level = field.heightAt(bed.x + cos * along, bed.z + sin * along)

      if (level <= waterLevel)
        return Infinity

      worst = Math.max(worst, bed.level - level)
    }

  return worst
}

/** The line she came to rest on: the bearing itself, and what it cost to find it. */
interface Laid {
  bearing: number
  turn:    number
  fall:    number
}

/**
 * Lay her across one ledge, or refuse it.
 *
 * Straight in off the open water is the line she was making when the rock
 * stopped her, so that is where the sweep starts, and the score spends the arc
 * as reluctantly as the pier's does: the **least turned** bearing that holds her
 * wins, and the fall only breaks the ties. Scoring on the fall instead — which
 * the first cut of this did — turned her thirty degrees off her own course to
 * buy three centimetres of a ledge that is flat to within twelve, and a wreck
 * lying square along a skerry reads as a boat somebody put there.
 *
 * `null` when no bearing in the arc keeps her whole bearing length on rock,
 * which is a rock too narrow to have held her rather than a rock she missed.
 */
function layHer (
  field:      HeightField,
  bedded:     Vec2 & { level: number },
  bed:        number,
  waterLevel: number,
): Laid | null {
  const inward     = Math.atan2(-bedded.z, -bedded.x)
  let laid: Laid | null = null

  for (let turn = -TURN; turn <= TURN; turn += SWEEP) {
    const bearing = inward + turn * Math.PI / 180
    const fall    = bedFall(field, bedded, bearing, waterLevel)

    if (fall > bed)
      continue

    if (!laid || Math.abs(turn) < Math.abs(laid.turn) ||
      Math.abs(turn) === Math.abs(laid.turn) && fall < laid.fall)
      laid = { bearing, turn, fall }
  }

  return laid
}

/**
 * Site the wreck, or decide the ring has no rock low enough to have caught one.
 *
 * `null` is the ordinary answer rather than the exceptional one, and it is the
 * ordinary answer twice over: `terrain.isles` is empty on every landmass but the
 * home one, and even there most of the rocks stand too proud to be the one. An
 * archipelago whose every skerry is visible from a mile off is an archipelago
 * with no wrecks on it, which is a fact about that coast and not a gap.
 *
 * The score is the inversion stated as arithmetic: **the lowest qualifying rock
 * wins**, and the width of the rock breaks the ties. Scoring on reach instead —
 * the obvious first instinct, borrowed straight from the beacon beside it — put
 * her on the outermost rock every time, which is the rock in open water that
 * everybody already knows about. The one that catches boats is the one inshore
 * of the line, and inshore of the line is where the low rocks are.
 *
 * @param taken Rocks already spoken for — the light's and the croft's. A wreck
 *   inside the seamark's own storm boulders is a joke rather than a landform,
 *   and one against the croft's doorstep is somebody else's story.
 */
export function findWreckSite (
  config: ScapeConfig,
  field:  HeightField,
  taken:  readonly (number | null)[],
): WreckSite | null {
  const { waterLevel }          = config.terrain
  const { awash, minRock, bed } = config.wreck
  let best: WreckSite | null = null
  let held                   = 0

  for (const [ index, isle ] of resolveIsles(config).entries()) {
    if (isle.radius < minRock || taken.includes(index))
      continue

    const freeboard = beaconCrown(field, isle).level - waterLevel

    // Above the water and barely: something to hit, and nothing to see.
    if (freeboard <= 0 || freeboard > awash)
      continue

    // Scored before the bed is probed, because the bed is the expensive half —
    // a rock standing higher than the one already found cannot win however
    // squarely she would have sat on it. The wider rock breaks a tie, which is
    // the only place the beacon's own preference survives the inversion.
    if (best && (freeboard > best.freeboard ||
      freeboard === best.freeboard && isle.radius <= held))
      continue

    // The middle of the ledge, which is where there is most rock under her and
    // the one point on a plateau that is the same distance from every edge.
    const bedded = { x: isle.x, z: isle.z, level: field.heightAt(isle.x, isle.z) }

    if (bedded.level <= waterLevel)
      continue

    const laid = layHer(field, bedded, bed, waterLevel)

    if (!laid)
      continue

    held = isle.radius
    best = {
      x:       bedded.x,
      z:       bedded.z,
      level:   bedded.level,
      freeboard,
      bearing: laid.bearing,
      turn:    laid.turn,
      fall:    laid.fall,
      reach:   Math.hypot(isle.x, isle.z),
      isle:    index,
    }
  }

  return best
}
