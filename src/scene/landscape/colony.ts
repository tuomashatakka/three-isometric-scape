import type { ScapeConfig } from '../config.ts'
import type { ArchipelagoSurvey, LandmassSurvey } from './archipelago.ts'
import type { HeightField } from './height.ts'
import { toWorld } from './archipelago.ts'


/**
 * What a colony is over.
 *
 * Not decoration on the readout: the two are sited by different searches from
 * different anchors, and telling them apart is what makes `scape:map` able to
 * say *why* a flock went missing — a harbour that lost its landing and a rock
 * that never carried a light fail for unrelated reasons.
 */
export type ColonyKind = 'harbour' | 'rock'

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
const RING_FLOOR = 24

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
  const samples = Math.max(RING_FLOOR, Math.ceil(Math.PI * 2 * radius / RING_SPACING))

  for (let step = 0; step < samples; step += 1) {
    const around = step / samples * Math.PI * 2

    if (field.heightAt(x + Math.cos(around) * radius, z + Math.sin(around) * radius) > water)
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

/** The two anchors one landmass offers a flock, seaward bearing included. */
function anchorsOf (landmass: LandmassSurvey): {
  kind: ColonyKind, x: number, z: number, bearing: number
}[] {
  const { landing, beacon }                                                    = landmass.survey
  const anchors: { kind: ColonyKind, x: number, z: number, bearing: number }[] = []

  if (landing) {
    const world = toWorld(landmass, landing)

    // `landing.angle` is the bearing the shore search walked out on from the
    // yard, so following it further is following it out to sea.
    anchors.push({ kind: 'harbour', x: world.x, z: world.z, bearing: landing.angle })
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
    })
  }

  return anchors
}

/**
 * Every flock the archipelago can carry, sited over open water.
 *
 * Pure, and a function of the survey rather than of anything drawn: the same
 * seed puts the same colonies in the same places whether the scape is being
 * rendered, mapped or tested. Two anchors per landmass at most — the harbour it
 * lands its boats at, and the outer rock it built its light on — because those
 * are the two places on a coast that a gull has a reason to be.
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
    anchorsOf(landmass).flatMap(anchor => {
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

      return [{ id: landmass.id, kind: anchor.kind, ...found }]
    }))
}
