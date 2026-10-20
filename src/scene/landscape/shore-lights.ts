import { createSeededRng } from 'threejs-scene'
import type { SeededRng } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { openDistance, SHORE_STEPS } from './farshore.ts'
import type { FarShore } from './farshore.ts'


/**
 * Where the people on the far coast live, and where their windows are.
 *
 * ## why the search is on the ring and not on a height field
 *
 * The far shore is the one landform in this scape with no terrain under it. It
 * is a ring of samples — a bearing, a standing distance, a crest and a taper —
 * swept into a cross-section by `skyline.ts`, and there is no ground to probe
 * for a level patch the way the mill, the chapel and the smokehouse all probe
 * for theirs. So this search asks the only questions the ring can answer, and
 * they turn out to be the two that matter anyway.
 *
 * **How low is it?** A coastal settlement is in the gap between two headlands.
 * It is not on the summit, and on a range with a hundred metres of relief in it
 * that is most of the answer on its own.
 *
 * **How near is the way out?** A place on this coast is a place with boats, and
 * boats need the sound. `shoreLights.harbour` is how much that second term is
 * worth against the first, and it is what moves the villages from the cols of
 * the range down to the mouths of the sounds.
 *
 * **Is there a hill to stand on at all?** This one was not in the first draft
 * and the report found it immediately: the shelter term is largest exactly
 * where the crest is *smallest*, so an unchecked search puts every village on
 * the last sliver of land before a sound, and the nine places came back
 * standing between 0.6 and 3.7 metres over the water — a string of lights along
 * the waterline rather than nine places. So the score is multiplied by
 * {@link roomFor}: a bearing whose crest cannot carry the village's own
 * roofline is not a place, however sheltered it is.
 *
 * Nothing else. In particular there is no prominence term and no view term,
 * because the far coast is looked *at* rather than from, and a term this
 * instrument cannot check is a term that can be wrong for a year.
 *
 * ## the places are taken greedily, and the spread is why
 *
 * Both terms are smooth around a col, so the nine highest-scoring samples on an
 * unconstrained ring are nine neighbours of one another — one village drawn
 * nine times, and eight bearings of coast left dark. The sites are therefore
 * taken best-first with `shoreLights.spread` degrees of horizon kept clear
 * around each, which is the same greedy-with-a-floor the roost's gates and the
 * footpath network's junctions already use.
 *
 * ## a light is placed on the face, not on the bearing
 *
 * The one thing that could go silently wrong here is a light that is *near* the
 * coast rather than on it: the seaward face is a slope between a toe three
 * metres under the water and a crest a hundred metres over it, and the two are
 * at different radii. So {@link placeLight} inverts the same cross-section
 * `skyline.ts` sweeps — toe to ridge, both in radius and in height — and solves
 * for the radius at which the face is a given height over mean water.
 * `shore-lights.test.ts` states that as a fact about every light rather than as
 * a comment here: on the face, over the water, under its own skyline.
 *
 * Pure, deterministic and free of `three`, so `scape:map` reports the places
 * without building a vertex of them.
 */

/** One lit window on the far coast, in world metres. */
export interface ShoreLight {
  x: number
  y: number
  z: number

  /** Radians, measured the way `Math.atan2(z, x)` measures them. */
  bearing: number

  /** Metres over mean water. Never over the crest of its own bearing. */
  height: number

  /**
   * How warm and how bright this one burns, 0..1.
   *
   * One number for both: a dimmer light a kilometre off is a redder light, and
   * splitting them would have been two rolls describing one paraffin lamp.
   */
  warmth: number
}

/** One place on the far coast, and the reason it is where it is. */
export interface ShoreSettlement {

  /** Index into the far shore's own ring. The lights are placed off this. */
  step: number

  /** Radians. */
  bearing: number

  /** Metres the range stands at this bearing. */
  crest: number

  /** How far below the range's own summit this bearing stands, 0..1. */
  shelter: number

  /** Degrees of arc from here to the nearest sound. */
  mouth: number

  /** How many windows are lit here. */
  lights: number
}

export interface ShoreLighting {
  settlements: readonly ShoreSettlement[]
  lights:      readonly ShoreLight[]

  /**
   * Places the coast was asked for and could not find room for.
   *
   * The shortfall, published rather than swallowed: a coast that asked for nine
   * and seated five is a coast whose `spread` has outgrown its standing land,
   * and that is a finding about the configuration rather than about the
   * picture. `scape:map` prints it, so it cannot go quiet.
   */
  refused: number
}

/**
 * How much of its own bearing's crest a light may climb, 0..1.
 *
 * A constant and not a knob. `shoreLights.climb` is the height a village
 * reaches on a hill that has the room for it; this is the share of a *small*
 * hill it is allowed to take, and it exists so a place in a shallow col keeps
 * its lights under its own skyline instead of hanging them in the air over it.
 * Four fifths rather than one, because a light exactly on the crest line is a
 * light that z-fights the ridge it stands on from half the bearings the camera
 * can be at.
 */
const ROOFLINE = 0.8

/**
 * Degrees of arc a light may sit from the middle of its own place.
 *
 * As a share of `shoreLights.spread`, so a coast whose places are further apart
 * gets bigger places rather than the same cluster with more water round it.
 * Under a half, because two neighbouring places whose jitter can overlap are
 * two places the spread floor was supposed to have kept separate.
 */
const SCATTER = 0.3

/** Where a single light sits across the face of its own hill, as a share of {@link ROOFLINE}. */
const LOWEST = 0.08

/**
 * Metres a light stands proud of the hillside it is on, toward the water.
 *
 * The far coast's own `LAMP_PANE_PROUD`, and for a sharper reason than the
 * window's. A point sprite has **one depth for the whole sprite** — the
 * vertex's — and the hill behind it does not: at the zoom that can see this
 * coast a six-pixel point covers a dozen metres of ground, and on a slope that
 * is several metres of depth. Placed exactly on the face, the upslope half of
 * every lamp fails the depth test and the light draws as a dash rather than as
 * a lamp, which is exactly what the first capture showed.
 *
 * Seaward rather than upward, because that is the one direction every pose can
 * see it from: the lights are all on the inward face of a ring, and an
 * orthographic camera over the middle of that ring is on the sea side of every
 * one of them.
 */
const PROUD = 4

/**
 * How far the harbour term reaches, in degrees of the horizon.
 *
 * Wide enough that a village at the back of a bay still scores for the sound
 * at its mouth, and narrow enough that one on the far side of a headland does
 * not.
 */
const MOUTH_REACH = 26

/**
 * How much of a hill a bearing has, 0..1.
 *
 * 1 once the crest can carry the whole of `shoreLights.climb` under
 * {@link ROOFLINE}, and down to 0 where the land runs out. It is read off the
 * village's own climb rather than given a threshold of its own, which is what
 * keeps the two in step: raising `climb` asks for a bigger place and therefore
 * for a bigger hill to put it on, rather than hanging a taller village off the
 * same sliver of coast.
 */
function roomFor (crest: number, climb: number): number {
  const wanted = Math.max(1e-6, climb) / ROOFLINE

  return Math.min(1, Math.max(0, crest / wanted))
}

/**
 * Score a bearing as a place to live: a hill, low ground, near a way out.
 *
 * `shelter` is already 0..1 against the range's own summit, so it and the
 * harbour term are commensurate without a second weight, and the room term
 * multiplies both because a bearing with no hill on it is not a worse place —
 * it is not one.
 */
function placeScore (shelter: number, mouth: number, room: number, harbour: number): number {
  return room * (shelter + Math.max(0, harbour) * Math.exp(-mouth / MOUTH_REACH))
}

/** Smallest arc between two bearings, in degrees. */
function arcBetween (from: number, to: number): number {
  const gap = Math.abs(from - to) % 360

  return Math.min(gap, 360 - gap)
}

/**
 * Put one light on the seaward face, at `height` metres over mean water.
 *
 * The inverse of the sweep in `skyline.ts`, and it has to be read against it:
 * the toe stands at `distance - half · land` and sinks to the seabed as the
 * taper closes, the ridge stands at `distance` and carries the crest, and
 * everything between the two is a straight line in both radius and height. So
 * the share of the way up the face is the share of the way up in *height*, and
 * the radius follows from it.
 *
 * Clamped at both ends rather than trusted: a bearing whose crest is under the
 * height asked for would otherwise put the light out past the ridge line and
 * into the vale behind it, where the hill it is supposed to be on is in front
 * of it.
 */
function placeLight (
  config: ScapeConfig,
  shore:  FarShore,
  step:   number,
  height: number,
  warmth: number,
): ShoreLight {
  const { terrain, farShore } = config
  const sample                = shore.samples[step]
  const half                  = sample.distance * farShore.width * 0.5
  const seabed                = terrain.waterLevel - terrain.seabedDrop
  const toeY                  = seabed + (terrain.waterLevel - farShore.sink - seabed) * sample.land
  const ridgeY                = seabed + (terrain.waterLevel + sample.crest - seabed) * sample.land
  const up                    = Math.min(1, Math.max(0, (terrain.waterLevel + height - toeY) / Math.max(1e-6, ridgeY - toeY)))
  const radius                = sample.distance - half * sample.land * (1 - up) - PROUD

  return {
    x:       Math.cos(sample.bearing) * radius,
    y:       terrain.waterLevel + height,
    z:       Math.sin(sample.bearing) * radius,
    bearing: sample.bearing,
    height,
    warmth,
  }
}

interface SettlementSearch {
  settlements: ShoreSettlement[]

  /** How many of the places asked for the spread floor could not seat. */
  refused: number
}

/**
 * The bearings the coast's places stand on, best first and spread apart.
 *
 * Its own function because the two halves of this survey are two subjects: this
 * one is about where a place goes, and {@link lightUp} is about what is lit
 * once it is there. The split is also what lets `scape:map` report the sites
 * and the refusals without the rng ever being forked.
 */
function findSettlements (config: ScapeConfig, shore: FarShore): SettlementSearch {
  const { climb, count, harbour, spread } = config.shoreLights
  const summit                            = shore.summit?.crest ?? 0
  const mouths                            = openDistance(shore.samples.map(sample => sample.crest > 0))
  const wanted                            = Math.max(0, Math.round(count))
  const settlements: ShoreSettlement[]    = []

  if (wanted === 0 || summit <= 0)
    return { settlements, refused: wanted }

  const ranked = shore.samples
    .map((sample, step) => ({
      step,
      bearing: sample.bearing,
      crest:   sample.crest,
      shelter: 1 - sample.crest / summit,
      mouth:   mouths[step],
      lights:  0,
    }))
    .filter(site => roomFor(site.crest, climb) > 0)
    .sort((a, b) =>
      placeScore(b.shelter, b.mouth, roomFor(b.crest, climb), harbour) -
      placeScore(a.shelter, a.mouth, roomFor(a.crest, climb), harbour) ||
      a.step - b.step)

  for (const site of ranked) {
    if (settlements.length >= wanted)
      break

    const degrees = site.step * 360 / SHORE_STEPS

    if (!settlements.some(taken => arcBetween(degrees, taken.step * 360 / SHORE_STEPS) < spread))
      settlements.push(site)
  }

  // In bearing order rather than in score order. Nothing downstream depends on
  // it, and a report that walks the horizon is a report a reader can check
  // against the picture.
  settlements.sort((a, b) => a.step - b.step)

  return { settlements, refused: wanted - settlements.length }
}

/** Hang the windows on one place, and roll how warm each of them burns. */
function lightUp (
  config: ScapeConfig,
  shore:  FarShore,
  site:   ShoreSettlement,
  rng:    SeededRng,
): ShoreLight[] {
  const { cluster, climb, spread } = config.shoreLights
  const most                       = Math.max(1, Math.round(cluster))
  const windows                    = 1 + Math.floor(rng.next() * most)
  const lights: ShoreLight[]       = []

  for (let index = 0; index < windows; index += 1) {
    const away = Math.round((rng.next() * 2 - 1) * spread * SCATTER)
    const step = (site.step + away + SHORE_STEPS) % SHORE_STEPS

    // The ceiling is the crest of the bearing this light actually landed on
    // and not the one the place is centred at. They are not the same hill: the
    // crest falls away fast toward a sound, and the harbour term puts most of
    // these places two degrees from one. Taking the middle's crest for the
    // whole cluster hung the outer lights of a tall village forty metres over
    // ground that stood nine, which is what `shore-lights.test.ts` caught the
    // moment it asked for a bigger climb.
    const ceiling = Math.max(0, Math.min(climb, shore.samples[step].crest * ROOFLINE))
    const height  = ceiling * (LOWEST + (1 - LOWEST) * rng.next() * rng.next())
    const warmth  = rng.range(0.55, 1)

    // A neighbour bearing that is a sound would put this light in the water:
    // the sweep collapses the whole cross-section there. The place to catch
    // that is here, where the ring can still be asked, rather than in a shader
    // that only has a position.
    if (shore.samples[step].crest > 0)
      lights.push(placeLight(config, shore, step, height, warmth))
  }

  // What was actually hung, rather than what was rolled. The two differ when a
  // light scattered onto a sound, and a report that printed the roll would be
  // reporting a window nothing drew.
  site.lights = lights.length

  return lights
}

/**
 * Solve the far coast's lit windows, once, for a configuration and its ring.
 *
 * Pure and deterministic: the same seed and the same two sections give the same
 * lights to the last float, which is what lets the points buffer and
 * `scape:map` read one answer rather than two that agree today. Forked by name
 * off the scape seed, so a later run adding a system does not move the villages.
 */
export function surveyShoreLights (config: ScapeConfig, shore: FarShore): ShoreLighting {
  const { settlements, refused } = findSettlements(config, shore)
  const rng                      = createSeededRng(config.seed).fork('shore-lights')
  const lights                   = settlements.flatMap(site => lightUp(config, shore, site, rng))

  return { settlements, lights, refused }
}
