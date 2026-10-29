import type { ScapeConfig } from '../config.ts'
import type { ArchipelagoSurvey, LandmassSurvey } from './archipelago.ts'
import type { HeightField } from './height.ts'
import { isBirdCliff, ledgeTiers } from './ledges.ts'
import { toWorld } from './archipelago.ts'


/**
 * What a colony is over.
 *
 * Not decoration on the readout: the two are sited by different searches from
 * different anchors, and telling them apart is what makes `scape:map` able to
 * say *why* a flock went missing — a harbour that lost its landing and a rock
 * that never carried a light fail for unrelated reasons.
 */
export type ColonyKind = 'harbour' | 'rock' | 'ledge'

/**
 * One wheeling flock, in world metres.
 *
 * A centre and a radius, and deliberately nothing else. How high the birds fly,
 * how fast they go round and how big they are is read per frame from the config
 * by `scene/birds.ts` — this is only the survey's answer to *where* a flock can
 * hang without any part of its ring crossing dry land.
 */
export interface Colony {

  /** Which landmass fed it, so the map can name the flock after the place. */
  id:   string
  kind: ColonyKind

  x: number
  z: number

  /** Metres from the centre to the outermost bird's ring. */
  radius: number

  /**
   * The air the flock is pinned to, in metres over mean water, or `null`.
   *
   * `null` is every ring over open sea, and it means *the gulls' own ceiling* —
   * `birds.ceiling` read live, the way it always was, so the slider still moves
   * the flock it was written for. A band is the other answer and the one a
   * cliff gives: a colony that comes off a face flies between its lowest row of
   * ledges and `ledges.wheel` over the lip, and no slider in the overlay should
   * be able to lift it off the rock it belongs to.
   */
  band: { low: number, high: number } | null

  /**
   * How many of the archipelago's birds this ring is worth, against the others.
   *
   * The deal used to be flat and a count was a count: twelve birds over three
   * colonies were four birds each. It still is a count — the total is the
   * tier's `birdCount` whatever the weights are — but the shares are no longer
   * equal, because a bird cliff and a fishing boat's attendant gulls are not
   * the same quantity of bird. See `ledges.flock`.
   */
  wheel: number
}

/** Metres a search steps seaward while it looks for water to hang a flock over. */
const SEAWARD_STEP = 2

/** Metres out from the anchor the search gives up at. */
const SEAWARD_LIMIT = 54

/**
 * Metres of water under a colony's centre before a flock will settle on it.
 *
 * Gulls wheel over the fishing, and the fishing is off the bank rather than on
 * it. Without a depth the first candidate a step out from a shelving beach
 * passes, and the ring ends up half over the sand.
 */
const OPEN_DEPTH = 1.6

/**
 * Metres between the bearings tested around a candidate ring.
 *
 * A count would be the wrong shape here. Sixteen bearings around a ring the
 * width of the harbour mouth is four metres between samples, which steps clean
 * over a skerry — and the ring is a circle a bird flies all the way round, so
 * the gaps are exactly where the answer is wrong. Spaced instead, the check gets
 * finer as the ring gets wider, which is when it has more coast to miss.
 */
const RING_SPACING = 1.5

/** Bearings tested around the tightest ring, however small it gets. */
const RING_FLOOR = 128


/**
 * Bearings the sweep is quantised to.
 *
 * The count is rounded up to a multiple of this rather than left wherever the
 * radius put it, and that is the whole point: "every bearing is wet" is really
 * "every bearing we looked at was wet", so a search walking 72 bearings and a
 * check walking 64 share only eight angles between them — and a spit that falls
 * in one of the other fifty-six passes the search and fails the check. Any
 * sweep whose count divides into this one samples a subset of these angles, so
 * a ring this accepts cannot be refused by a coarser sweep taken later.
 */
const RING_QUANTUM = 64


/**
 * How much clear water a bearing needs under it, in metres.
 *
 * A ring is accepted by walking a finite number of bearings, so "every bearing
 * is wet" is really "every bearing we looked at was wet" — and a spit narrower
 * than the sample spacing passes between two of them. Testing against the
 * waterline exactly makes that an equality: ground a few millimetres proud
 * counts as dry, and a ring the search accepted fails a finer sweep taken
 * later, which is what `colony.test.ts` walks at sixty-four bearings.
 *
 * Asking for a handspan of depth instead of none costs nothing — a gull's ring
 * wants open water rather than a wet toe — and it holds however coarsely the
 * bearings happen to fall.
 */
const RING_DEPTH = 0.1

/** How much a ring gives up per attempt, and how small it may get. */
const SHRINK       = 0.86
const SHRINK_FLOOR = 0.4

/** Whether every bearing around a ring of this radius is over open water. */
function ringIsWet (
  field:  HeightField,
  x:      number,
  z:      number,
  radius: number,
  water:  number,
): boolean {
  const wanted  = Math.max(RING_FLOOR, Math.ceil(Math.PI * 2 * radius / RING_SPACING))
  const samples = Math.ceil(wanted / RING_QUANTUM) * RING_QUANTUM

  for (let step = 0; step < samples; step += 1) {
    const around = step / samples * Math.PI * 2

    if (field.heightAt(x + Math.cos(around) * radius, z + Math.sin(around) * radius) > water - RING_DEPTH)
      return false
  }

  return true
}

/**
 * Walk seaward from an anchor and keep the widest ring the coast will hold.
 *
 * The ring is fitted at each candidate rather than after one is chosen, because
 * a centre over deep water is not the same claim as a *ring* clear of the land —
 * a flock a step off a headland has its centre in the sound and half its circle
 * over the rock. Where the full ring will not fit, it is shrunk rather than
 * moved, down to a floor past which a colony is a knot of birds over a puddle
 * and is better absent.
 *
 * Widest rather than nearest, and that is the whole difference between a flock
 * and a clot. The first candidate that fits anything at all is a step off a
 * warped shore, where a ring is squeezed to a third of what it was asked for and
 * every bird in it flies through its neighbours; a few metres further out the
 * bay opens and the same flock has room to be a wheel. Distance only breaks a
 * tie, so a colony never drifts further out to sea than it had a reason to.
 */
function findColony (
  field:   HeightField,
  fromX:   number,
  fromZ:   number,
  bearing: number,
  spread:  number,
  water:   number,
): { x: number, z: number, radius: number } | null {
  const dirX  = Math.cos(bearing)
  const dirZ  = Math.sin(bearing)
  const floor = spread * SHRINK_FLOOR

  let best: { x: number, z: number, radius: number } | null = null

  for (let distance = SEAWARD_STEP; distance <= SEAWARD_LIMIT; distance += SEAWARD_STEP) {
    const x = fromX + dirX * distance
    const z = fromZ + dirZ * distance

    if (water - field.heightAt(x, z) < OPEN_DEPTH)
      continue

    for (let radius = spread; radius >= floor; radius *= SHRINK) {
      if (best && radius <= best.radius)
        break

      if (ringIsWet(field, x, z, radius, water)) {
        best = { x, z, radius }
        break
      }
    }

    if (best && best.radius >= spread)
      break
  }

  return best
}

/** One place a flock can be hung from, with the band it is pinned to if it has one. */
interface ColonyAnchor {
  kind:    ColonyKind
  x:       number
  z:       number
  bearing: number
  band:    { low: number, high: number } | null
  wheel:   number
}

/**
 * The anchors one landmass offers a flock, seaward bearing included.
 *
 * Three now rather than two: the harbour it lands its boats at, the outer rock
 * it built its light on, and — where the sea left it a face tall enough for
 * `ledges.face` — the headland its guillemots breed on. The first two are
 * places a gull has a *reason* to be; the third is the place most of the birds
 * on this coast actually are, and it was the one anchor the flocks did not know
 * about.
 */
export function anchorsOf (landmass: LandmassSurvey, config: ScapeConfig): ColonyAnchor[] {
  const { landing, beacon, crag } = landmass.survey
  const anchors: ColonyAnchor[]   = []

  if (landing) {
    const world = toWorld(landmass, landing)

    // `landing.angle` is the bearing the shore search walked out on from the
    // yard, so following it further is following it out to sea.
    anchors.push({
      kind:    'harbour',
      x:       world.x,
      z:       world.z,
      bearing: landing.angle,
      band:    null,
      wheel:   1,
    })
  }

  if (beacon) {
    const world = toWorld(landmass, beacon)

    // The tower's own bearing faces landward — back at the island it is warning
    // boats off — so the open water is behind it.
    anchors.push({
      kind:    'rock',
      x:       world.x,
      z:       world.z,
      bearing: beacon.bearing + Math.PI,
      band:    null,
      wheel:   1,
    })
  }

  // The island's own config for the water it stands in and the archipelago's
  // for the colony, which is the split `planCliffColonies` already makes: how
  // far up a face a ledge sits is a fact about the colony, and where mean water
  // is on this island is a fact about its profile.
  const local = { ...landmass.config, ledges: config.ledges }
  const tiers = isBirdCliff(crag, local) ? ledgeTiers(crag, local) : []

  if (crag && tiers.length > 0) {
    const shore = crag.shoreAt(crag.bearing)
    const world = toWorld(landmass, {
      x: Math.cos(crag.bearing) * shore,
      z: Math.sin(crag.bearing) * shore,
    })

    anchors.push({
      kind: 'ledge',

      // The waterline under the middle of the headland, walked out to sea on
      // the crag's own bearing — the same line the ledges are dealt along, so
      // the ring hangs off the face the birds are standing on rather than off
      // whichever part of the coast happened to be nearest the island's centre.
      x:       world.x,
      z:       world.z,
      bearing: crag.bearing,

      // From the lowest row of ledges to `wheel` over the lip, in metres of air
      // over the archipelago's one waterline — which is the datum the shader
      // adds them to, and is not the island's own.
      band: {
        low:  tiers[0] - config.terrain.waterLevel,
        high: crag.lip - config.terrain.waterLevel + Math.max(0, config.ledges.wheel),
      },
      wheel: Math.max(0, config.ledges.flock),
    })
  }

  return anchors
}

/**
 * Every flock the archipelago can carry, sited over open water.
 *
 * Pure, and a function of the survey rather than of anything drawn: the same
 * seed puts the same colonies in the same places whether the scape is being
 * rendered, mapped or tested. Three anchors per landmass at most — the harbour
 * it lands its boats at, the outer rock it built its light on, and the bird
 * cliff its guillemots breed on — because those are the three places on a coast
 * that a bird has a reason to be.
 *
 * A landmass with neither simply contributes nothing. There is no fallback that
 * puts a flock somewhere arbitrary: birds over nothing are birds nobody can
 * account for, and an absence reads as an absence.
 */
export function planColonies (
  archipelago: ArchipelagoSurvey,
  config:      ScapeConfig,
): Colony[] {
  const { field, waterLevel } = archipelago
  const spread                = config.birds.spread

  if (spread <= 0)
    return []

  return archipelago.landmasses.flatMap(landmass =>
    anchorsOf(landmass, config).flatMap(anchor => {
      const found = findColony(
        field,
        anchor.x,
        anchor.z,
        anchor.bearing,
        spread,
        waterLevel,
      )

      if (!found)
        return []

      return [{
        id:    landmass.id,
        kind:  anchor.kind,
        band:  anchor.band,
        wheel: anchor.wheel,
        ...found,
      }]
    }))
}
