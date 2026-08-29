import type { ScapeConfig } from '../config.ts'
import type { ArchipelagoSurvey, LandmassSurvey } from './archipelago.ts'
import { createZoneTests } from './dressing-zones.ts'
import type { DressingZones } from './dressing-zones.ts'


/**
 * How far a flock stands from the farm that owns it.
 *
 * `infield` is the rough grazing within sight of the yard — the ground the
 * stock is turned out onto between the buildings and the moor. `outfield` is
 * the hill: further out, poorer, and the reason a farm this size keeps sheep at
 * all rather than only a cow.
 *
 * Kept apart on the readout for the reason the gull colonies are: the two are
 * found by the same search in two different bands, so a scape that lost its
 * outfield and a scape that lost its infield failed for different reasons.
 */
export type GrazingKind = 'infield' | 'outfield'

/**
 * One flock's ground, in world metres.
 *
 * A centre, a radius and how much of that disc is actually grazeable — and
 * deliberately nothing about the animals. How many sheep stand on it is a
 * budget (`dressing.sheep`), scaled by the device tier like every other scatter
 * in the scape; this is only the survey's answer to *where* a farm would turn
 * its stock out, and how good the ground is when it gets there.
 */
export interface Grazing {

  /** The landmass that owns it, so the map can name the flock after the farm. */
  id:   string
  kind: GrazingKind

  x: number
  z: number

  /** Metres from the centre to the edge of the ground the flock spreads over. */
  radius: number

  /** Fraction of that disc a sheep can actually stand and feed on, 0..1. */
  cover: number
}

/** Bearings the search walks out from the yard on. */
const BEARINGS = 24

/** Metres a search steps outward between candidates. */
const STEP = 4

/**
 * Rings of sample points inside a candidate disc, as fractions of its radius.
 *
 * A centre test alone would site a flock on the one clear square metre in a
 * spruce stand. What is being asked is whether a *disc* is grazing ground, and
 * the answer has to be sampled across it — sparsely, because this runs at
 * twenty-four bearings by thirty steps by five landmasses and the honest answer
 * at twenty-five points is the same as the answer at four hundred.
 */
const RINGS = [ 0.4, 0.75, 1 ]

/** Bearings sampled around each of those rings. */
const RING_SAMPLES = 8

/**
 * How much of a disc must be grazeable before it is worth calling a pasture.
 *
 * High, and deliberately: the failure this prevents is a flock sited half in
 * the sea or half in the forest, where the placement rule then rejects most of
 * the darts thrown at it and the ground carries three sheep instead of twelve.
 * A disc that cannot clear this is not a poorer pasture — it is a pasture with
 * something else already standing on it.
 */
const COVER_FLOOR = 0.72

/**
 * Flock centres nearer than this, in multiples of the disc's radius, are one
 * flock.
 *
 * Three rather than two, so two flocks are a field apart rather than merely
 * not overlapping. Every candidate a step along the same bearing overlaps the
 * one before it, and the ground either side of a good hillside is usually good
 * too — so at any smaller figure a farm's whole quota is spent on one slope and
 * the second flock is a bulge on the first.
 */
const SEPARATION = 3

/** Fraction of the search's reach that separates the infield from the hill. */
const INFIELD_SHARE = 0.45

/**
 * Whether one point is ground an animal can stand and feed on.
 *
 * The same predicate answers both halves of this module's job and the scatter
 * that follows it: the search uses it to find the ground, and `dressing.ts`
 * uses it to accept each dart thrown at what the search found. Two readings of
 * "grazeable" is how a flock ends up sited on ground its own sheep are then
 * rejected from, and the field carries four animals instead of twelve.
 */
export function createGrazingTest (
  survey: ArchipelagoSurvey,
  config: ScapeConfig,
  zones:  DressingZones = createZoneTests(survey),
): (x: number, z: number) => boolean {
  const { minLift, maxSlope } = config.grazing
  const floor                 = survey.waterLevel + minLift

  return (x, z) => {
    // On an island, not merely somewhere in the archipelago: without the
    // landmass test a disc can straddle open water between two patches and
    // every sample in it still passes on the seabed's own height.
    if (!survey.field.landmassAt(x, z))
      return false

    if (survey.field.heightAt(x, z) < floor || survey.field.slopeAt(x, z) > maxSlope)
      return false

    // Everything the composition has already claimed — the yard, the cart
    // track, the worn paths, the crop plots, and the walled hay meadow. That
    // last one is the whole point of the wall: a hay meadow is shut up to grow
    // a crop, and sheep in it in July are what the wall was built against.
    return zones.clear(x, z)
  }
}

/** What fraction of a candidate disc is grazing ground. */
function coverAt (
  grazeable: (x: number, z: number) => boolean,
  x:         number,
  z:         number,
  radius:    number,
): number {
  let taken = 1
  let clear = grazeable(x, z) ? 1 : 0

  for (const ring of RINGS)
    for (let step = 0; step < RING_SAMPLES; step += 1) {
      // Offset per ring so the three rings do not stack their samples on the
      // same eight bearings and leave the ground between them unlooked at.
      const around = (step + ring * 0.5) / RING_SAMPLES * Math.PI * 2
      const sx     = x + Math.cos(around) * radius * ring
      const sz     = z + Math.sin(around) * radius * ring

      taken += 1
      if (grazeable(sx, sz))
        clear += 1
    }

  return clear / taken
}

/** Every disc around one farm that would carry stock, best ground first. */
function candidatesOf (
  grazeable: (x: number, z: number) => boolean,
  config:    ScapeConfig,
  landmass:  LandmassSurvey,
): Grazing[] {
  const { spread, reach }    = config.grazing
  const { yard, landRadius } = landmass.survey.layout
  const fromX                = landmass.origin.x + yard.x
  const fromZ                = landmass.origin.z + yard.z
  const found: Grazing[]     = []

  // The whole disc inside the island's own land radius, for the reason the
  // walled meadow's search keeps its whole enclosure inside it: past that the
  // falloff has begun taking height away, and a flock sited out there is a
  // flock standing on ground that is partly sea. It is also what keeps stock
  // off the islets — a sheep does not swim to work.
  const inland = Math.max(0, landRadius - spread)

  // The search starts one disc out from the yard and no further: the yard is
  // trodden bare and the zone test rejects it anyway, so the only thing a
  // larger clearance would do is push the infield off the island.
  const start  = spread

  for (let bearing = 0; bearing < BEARINGS; bearing += 1) {
    const angle = bearing / BEARINGS * Math.PI * 2
    const dirX  = Math.cos(angle)
    const dirZ  = Math.sin(angle)

    for (let distance = start; distance <= reach; distance += STEP) {
      const x = fromX + dirX * distance
      const z = fromZ + dirZ * distance

      if (Math.hypot(x - landmass.origin.x, z - landmass.origin.z) > inland)
        continue

      const cover = coverAt(grazeable, x, z, spread)

      if (cover < COVER_FLOOR)
        continue

      found.push({
        id:     landmass.id,
        kind:   distance < start + (reach - start) * INFIELD_SHARE ? 'infield' : 'outfield',
        x,
        z,
        radius: spread,
        cover,
      })
    }
  }

  // Best ground first, and a tie broken by the ground nearest the yard: a farm
  // walks to its stock twice a day. `sort` is stable and nothing here is drawn
  // from the rng, so the same seed lands the same flocks in the same order.
  return found.sort((a, b) =>
    b.cover - a.cover ||
    Math.hypot(a.x - fromX, a.z - fromZ) - Math.hypot(b.x - fromX, b.z - fromZ))
}

/**
 * Every flock the archipelago's farms can turn out, sited on open ground.
 *
 * Pure, and a function of the survey rather than of anything drawn — the same
 * seed puts the same flocks on the same hillsides whether the scape is being
 * rendered, mapped or tested.
 *
 * The search walks out from each yard rather than over the island at large,
 * because grazing is a fact about a *farm* and not about terrain: the ground a
 * flock stands on is ground somebody drives stock to and gathers them off
 * again, so a hillside on the far side of the island with nobody living under
 * it is not pasture, it is a hillside.
 *
 * A landmass whose search finds nothing simply contributes no flock. There is
 * no fallback that puts sheep somewhere arbitrary: animals standing in a spruce
 * stand are worse than an empty hill.
 */
export function planGrazing (
  archipelago: ArchipelagoSurvey,
  config:      ScapeConfig,
): Grazing[] {
  const { spread, flocks } = config.grazing

  if (spread <= 0 || flocks <= 0)
    return []

  const grazeable         = createGrazingTest(archipelago, config)
  const chosen: Grazing[] = []

  for (const landmass of archipelago.landmasses) {
    const candidates       = candidatesOf(grazeable, config, landmass)
    const taken: Grazing[] = []

    for (const candidate of candidates) {
      if (taken.length >= flocks)
        break

      // Kept apart so two flocks are two flocks. Every candidate a step along
      // the same bearing overlaps the one before it, so without this the whole
      // quota is spent on one hillside.
      if (taken.some(other =>
        Math.hypot(other.x - candidate.x, other.z - candidate.z) < candidate.radius * SEPARATION))
        continue

      taken.push(candidate)
    }

    // The infield first on the readout, then the hill, so a map line reads the
    // way a farm is walked rather than in the order the search happened to
    // accept the ground.
    chosen.push(...taken.sort((a, b) => a.kind === b.kind ? 0 : a.kind === 'infield' ? -1 : 1))
  }

  return chosen
}
