import { createSeededRng, smoothstep } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { toWorld } from './archipelago.ts'
import type { ArchipelagoSurvey, LandmassSurvey } from './archipelago.ts'
import { cragClaim, cragFoot } from './crag.ts'
import type { Crag } from './crag.ts'
import type { HeightField } from './height.ts'


/**
 * Where the birds are on the cliff, and how white they have made it.
 *
 * The half of the colony with no mesh in it. `landscape/seabirds.ts` puts one
 * instanced draw over the archipelago and answers the only question that
 * changes — what month it is; this decides which headlands carry a colony at
 * all, which ledge every bird is standing on, and how far down the rock the
 * whitewash under them runs.
 *
 * Both halves read the same crag. `cragClaim` is the one authority for whether a
 * point is on the headland, so the stain the painter lays, the birds the mesh
 * stamps and the number `scape:map` prints describe one cliff rather than three
 * that happen to agree today.
 */

/** One bird on one ledge, in world metres, facing the sea it feeds in. */
export interface LedgeBird {

  /** Which island's headland it is on, so the map can name the colony. */
  id: string

  x: number
  z: number

  /** World height of the ledge, with the bird standing on top of it. */
  y: number

  /** Radians of yaw. Outward: a bird on a ledge faces the drop. */
  angle: number

  /** Body scale. A cliff of identical birds reads as a printed pattern. */
  size: number

  /**
   * Where in the colony's own arrival this bird sits, 0..1.
   *
   * The cliff does not fill in a day and it does not empty in one. This is the
   * share of the landing window already gone when this bird comes ashore, so a
   * colony assembles over a fortnight of the year rather than appearing whole.
   */
  keen: number
}

/** One headland's colony. */
export interface CliffColony {
  id:   string
  crag: Crag

  /** Metres of rock between mean water and the clifftop — what the gate reads. */
  face: number

  /** World heights of the rows of ledges, lowest first. */
  tiers: readonly number[]

  birds: readonly LedgeBird[]
}

/** Radians either side of the colony a bird's bearing may be jittered. */
const SCATTER = 0.34

/** Metres a bird stands proud of the ledge it is on. */
const PERCH = 0.04

/** Metres between samples as the search walks a bearing in off the sea. */
const STEP = 0.4

/** Metres past the waterline the search starts, so a face that overhangs is caught. */
const OFFING = 4

/** Metres inland the search gives up. Past this the ground is the hill, not the cliff. */
const INLAND = 30

/** How much crag a point needs under it before a bird will stand there, 0..1. */
const ROOTED = 0.25


/** Metres of rock between mean water and the clifftop. See `ledges.face`. */
export function faceHeight (crag: Crag, config: ScapeConfig): number {
  return crag.lip - config.terrain.waterLevel
}

/** Whether a headland is one birds would take at all. */
export function isBirdCliff (crag: Crag | null, config: ScapeConfig): crag is Crag {
  return !!crag && faceHeight(crag, config) >= config.ledges.face
}

/**
 * World heights of the rows of ledges on one face, lowest first.
 *
 * Shares of the face's own height rather than metres over the sea, which is the
 * whole of `foot` and `brow`: a taller cliff takes a heavier sea and its birds
 * start proportionally higher up it.
 */
export function ledgeTiers (crag: Crag, config: ScapeConfig): readonly number[] {
  const { foot, brow, tiers } = config.ledges
  const { waterLevel }        = config.terrain
  const height                = faceHeight(crag, config)
  const rows                  = Math.max(0, Math.floor(tiers))
  const levels: number[]      = []

  for (let row = 0; row < rows; row += 1) {
    const share = rows === 1 ? (foot + brow) * 0.5 : foot + (brow - foot) * (row / (rows - 1))

    levels.push(waterLevel + height * share)
  }

  return levels
}

/**
 * The outermost point on a bearing whose ground stands at a height, or `null`.
 *
 * Walked in off the sea rather than out from the middle of the island, and that
 * is the whole reason it finds a *cliff*: every one of these heights is crossed
 * twice on a bearing that runs over a headland — once on the face and once on
 * the hillside behind it — and the first crossing from seaward is the one with
 * the drop under it. Bisected after the bracket because the face falls about a
 * metre through a step of it, which is three birds' worth of error.
 */
function faceRadius (
  field:   HeightField,
  bearing: number,
  shore:   number,
  height:  number,
): number | null {
  const cos = Math.cos(bearing)
  const sin = Math.sin(bearing)
  const at  = (r: number): number => field.heightAt(cos * r, sin * r)
  const end = Math.max(1, shore - INLAND)

  for (let r = shore + OFFING; r >= end; r -= STEP) {
    if (at(r) < height)
      continue

    let low  = r
    let high = Math.min(shore + OFFING, r + STEP)

    for (let pass = 0; pass < 12; pass += 1) {
      const mid = (low + high) * 0.5

      if (at(mid) >= height)
        low = mid
      else
        high = mid
    }

    return low
  }

  return null
}

/** Seats one row of a colony offers: the arc it runs along, divided by a berth. */
function seatsPerTier (crag: Crag, config: ScapeConfig): number {
  const { berth, spread } = config.ledges
  const reach             = crag.shoreAt(crag.bearing)
  const run               = 2 * crag.arc * Math.max(0, Math.min(1, spread)) * reach

  return Math.max(1, Math.floor(run / Math.max(0.2, berth)))
}

function perchOne (
  landmass: LandmassSurvey,
  crag:     Crag,
  bearing:  number,
  height:   number,
): { x: number, z: number, y: number } | null {
  const { field } = landmass.survey
  const shore     = crag.shoreAt(bearing)

  if (shore <= 0)
    return null

  const radius = faceRadius(field, bearing, shore, height)

  if (radius === null)
    return null

  const localX = Math.cos(bearing) * radius
  const localZ = Math.sin(bearing) * radius

  if (cragClaim(crag, localX, localZ) < ROOTED)
    return null

  // Straight up off the point the bisection landed on, and nothing sideways.
  // The first cut stood the bird out along the rock's own normal, which reads
  // as the right thing to do on a face and is not: moving a point *outward*
  // from a seventy-degree slope takes it to ground three times the offset
  // lower, so every bird in the colony floated a quarter of its own height off
  // the cliff. The bisected radius is already on the surface at exactly this
  // height, so the only lift wanted is enough to keep the feet out of the rock.
  const world = toWorld(landmass, { x: localX, z: localZ })

  return { x: world.x, z: world.z, y: height + PERCH }
}

/**
 * Every bird in the archipelago, on the headlands that will carry one.
 *
 * Deterministic: one rng forked per island off the scape's seed, so a cliff that
 * gains a row does not reshuffle the colony on every other headland — the same
 * discipline every scatter in the scape is held to.
 *
 * @param heads Birds one headland may carry, from the tier. A count per *cliff*
 *   rather than for the archipelago, for the reason `sealCount` is per rock:
 *   five headlands of four different heights dealt one number between them
 *   would put eight birds on each and photograph as nothing. 0 is a coast whose
 *   cliffs are bare — the staining stays, because that is rock rather than
 *   birds, and it is most of what a colony looks like at this camera's range.
 */
export function planCliffColonies (
  survey: ArchipelagoSurvey,
  config: ScapeConfig,
  heads:  number,
): readonly CliffColony[] {
  const budget                  = Math.max(0, Math.floor(heads))
  const colonies: CliffColony[] = []

  if (budget < 1 || config.ledges.ashore <= 0)
    return colonies

  for (const landmass of survey.landmasses) {
    const { crag } = landmass.survey

    // The island's own config for the water, and the archipelago's for the
    // colony. A profile scales an island's sea and its rock; how much room one
    // bird needs on a ledge is not a fact about which island the ledge is on,
    // and reading the knobs off the projection is how a headland ends up with a
    // different brow from the one the map printed.
    const local = { ...landmass.config, ledges: config.ledges }

    if (!isBirdCliff(crag, local))
      continue

    const tiers = ledgeTiers(crag, local)

    if (!tiers.length)
      continue

    const seats              = seatsPerTier(crag, local)
    const share              = Math.min(1, budget / (seats * tiers.length))
    const row                = Math.max(1, Math.round(seats * share))
    const half               = crag.arc * Math.max(0, Math.min(1, config.ledges.spread))
    const rng                = createSeededRng(config.seed ^ 0xc11f).fork(landmass.id)
    const birds: LedgeBird[] = []

    for (const [ index, height ] of tiers.entries())
      for (let seat = 0; seat < row; seat += 1) {
        // Dealt along the arc by division rather than drawn at random, then
        // jittered off it: a bearing per bird piles three of them in one place
        // and leaves a gap the length of the headland beside it.
        const step    = (seat + 0.5) / row
        const bearing = crag.bearing - half + step * 2 * half +
          rng.range(-SCATTER, SCATTER) * half / row
        const perch   = perchOne(landmass, crag, bearing, height)

        if (!perch)
          continue

        birds.push({
          id: landmass.id,
          ...perch,

          // Facing the drop, give or take. A row all pointing dead outward
          // reads as a fence of birds rather than as a ledge of them.
          angle: bearing + rng.range(-0.5, 0.5),
          size:  0.86 + rng.next() * 0.3,

          // The lowest row lands first and leaves last, which is what a colony
          // does: the best ledges are taken by the birds already holding them.
          keen: index / Math.max(1, tiers.length - 1) * 0.7 + rng.next() * 0.3,
        })
      }

    if (birds.length)
      colonies.push({ id: landmass.id, crag, face: faceHeight(crag, local), tiers, birds })
  }

  return colonies
}

/** Every bird in the archipelago, flattened out of the cliffs that carry them. */
export function ledgeBirds (colonies: readonly CliffColony[]): readonly LedgeBird[] {
  return colonies.flatMap(cliff => cliff.birds)
}

/**
 * How much of the colony is ashore at a phase of the year, 0..1.
 *
 * A window centred on midsummer, because that is what the breeding half of the
 * year is: an auk comes to the rock to lay and for nothing else, and the phase
 * the scape keeps has 0 at midwinter. Ramped at both ends over a tenth of the
 * window rather than switched, so the cliff fills and empties over a fortnight
 * — four hundred birds appearing between two frames is the sort of thing a diff
 * catches and a reader never forgives.
 *
 * It integrates nothing and remembers nothing: the year is where the published
 * season says it is, so a still taken with every clock stopped shows the cliff
 * that week actually has on it.
 */
export function colonyAshore (time: number, ashore: number): number {
  if (ashore <= 0)
    return 0

  if (ashore >= 1)
    return 1

  // Distance from midsummer round the ring, 0 at 0.5 and 0.5 at the new year.
  const phase = Math.abs((time % 1 + 1) % 1 - 0.5)
  const edge  = ashore * 0.5

  return 1 - smoothstep(edge * 0.78, edge, phase)
}

/**
 * How much whitewash is on the rock at a point, 0..1.
 *
 * Shaped like `cragFoot` and read by the painter in the same place, but it is
 * the opposite fact about the same cliff: the foot is where the sea keeps the
 * rock dark, and this is where the birds keep it pale. The second is held under
 * the first rather than left to miss it — the streaks below the lowest ledge run
 * straight down into the wash, and rock the sea scrubs twice a day is rock with
 * nothing left on it. So the foot is subtracted out: where the wash is full the
 * stain is nothing at all, and the test beside the search states that bound as a
 * fact about the data rather than leaving it to a still.
 *
 * Four things multiplied. *Where round the headland* — the middle of the arc,
 * which is the steep part the birds are on. *How far up the face* — full across
 * the nesting band and streaked below it, because guano runs downhill and a
 * band with a clean edge under it reads as paint. *How much crag is here at
 * all*, which is `cragClaim` and which is what keeps the stain off the ordinary
 * shore either side.
 *
 * Deliberately without an rng: this runs per terrain vertex on six islands and
 * the streaks come out of a hash of the bearing, so the same cliff paints the
 * same way on every build without a seeded stream being threaded through the
 * painter.
 */
export function guanoClaim (
  crag:   Crag | null,
  config: ScapeConfig,
  x:      number,
  z:      number,
  height: number,
): number {
  const { stain, foot, brow, spread } = config.ledges

  if (stain <= 0 || !isBirdCliff(crag, config))
    return 0

  const rock = cragClaim(crag, x, z)

  if (rock <= 0)
    return 0

  const up = (height - config.terrain.waterLevel) / faceHeight(crag, config)

  if (up >= brow + 0.14 || up <= foot * 0.2)
    return 0

  const bearing = Math.atan2(z, x)
  const off     = Math.abs(Math.atan2(
    Math.sin(bearing - crag.bearing),
    Math.cos(bearing - crag.bearing),
  ))
  const along = 1 - smoothstep(crag.arc * spread * 0.55, crag.arc * spread, off)

  if (along <= 0)
    return 0

  // Full through the band, gone just over the brow, and trailing out below the
  // lowest ledge in streaks a bearing wide — which is how far a run of it gets
  // before the next rain takes it off.
  const band  = up >= foot
    ? 1 - smoothstep(brow, brow + 0.14, up)
    : smoothstep(foot * 0.2, foot, up)
  const drip  = up >= foot ? 1 : 0.35 + 0.65 * streakAt(bearing)

  // And off the wash. The platform and the talus ramp at the bottom of the face
  // are the one part of a headland the sea reaches, and a stain that ran down
  // onto them would be paint rather than guano.
  const dry = 1 - Math.max(0, Math.min(1, cragFoot(crag, x, z)))

  return rock * along * band * drip * dry * stain
}

/**
 * A stripe down the face, 0..1, stable with height and varying with bearing.
 *
 * Two harmonics of the bearing rather than a hash, and that is deliberate: a
 * hash of a continuous angle gives a different value to every vertex and paints
 * as noise at this grid's spacing, where what is wanted is a handful of runs
 * each a bird's width across.
 */
function streakAt (bearing: number): number {
  const fine = Math.sin(bearing * 47.3) * 0.5 + 0.5
  const wide = Math.sin(bearing * 11.7 + 1.9) * 0.5 + 0.5

  return Math.min(1, fine * 0.55 + wide * 0.65)
}
