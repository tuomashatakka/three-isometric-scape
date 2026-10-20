import { hash2, smoothstep } from 'threejs-scene'
import { landmassTerrain } from '../config.ts'
import type { ScapeConfig } from '../config.ts'


/**
 * The coast the scape can see and can never reach.
 *
 * ## why a ring, and why it is solved rather than drawn
 *
 * The archipelago plane has always ended in open water. Six islands, a sea
 * four times the world wide to hide the edge of it, and on every bearing
 * nothing — which is the one thing an island group never is. An archipelago is
 * the fringe of somewhere, and until now this one had no somewhere to be the
 * fringe of.
 *
 * The cheap version of that is a painted backdrop hung off the camera. It is
 * wrong for a reason this scape has had to learn twice already: the camera is
 * orthographic and the user turns it. A flat hung at a bearing is a flat the
 * moment the view swings off that bearing, and a flat hung at the *view* is
 * land that slides when you zoom. So the coast is a ring in world space, built
 * once, standing still, and the camera is free to do whatever it likes with
 * it.
 *
 * ## three fields on one ring, and why they are not `valueNoise`
 *
 * Everything here is a function of one angle, and an angle wraps. A field that
 * does not wrap with it leaves a seam at due east, which on a ring of mountains
 * is a cliff with nothing on the other side of it.
 *
 * The first draft read the scape's own `valueNoise` round a circle in
 * noise space, on the reasoning that a closed path through a continuous field
 * is continuous. It is — and it is also useless here. A circle whose
 * circumference is the wanted number of features has a *radius* of that number
 * over two pi, so seven summits is a circle 1.1 lattice units across: every
 * sample on it lands inside the same two cells, bilinear interpolation makes
 * one smooth bump of them, and the coast came out as a single headland of two
 * hundred and eighty degrees with one sound in it. The arc-length argument was
 * right and the resolution was not.
 *
 * So the fields are a one-dimensional value noise over a whole number of
 * control points, wrapped with a modulo — exactly periodic by construction
 * rather than by geometry, with the feature count as the thing that is chosen
 * instead of a radius that has to be inferred from it. {@link ringNoise} is
 * eleven lines and it is the right eleven.
 *
 * - **the skyline** is the ridge field, two octaves of it, shaped by
 *   `farShore.relief`: 1 at a summit, `1 − relief` at a col.
 * - **the sounds** are a second, coarser field thresholded at
 *   `farShore.openness`. Below it there is no land on that bearing at all.
 * - **the standing distance** is the *same* ridge field again, swung in and out
 *   by {@link SWING}. One field rather than a third, because that is the
 *   coupling a real coast has: the high ground is the headland and the low
 *   ground is the back of the bay. A separate noise would have put summits in
 *   the bays as often as not.
 *
 * ## the archipelago decides where it can stand
 *
 * `farShore.reach` is a multiple of the world size and the ring is a circle;
 * the archipelago is a scatter of square terrain patches and is not. A single
 * radius therefore either clears everything — in which case it is too far out
 * to photograph — or it runs a mountain range through the two southern
 * islands.
 *
 * So the radius is a floor rather than an answer. {@link patchReach} is the
 * support function of the patches in a direction, the coast stands at the
 * further of that plus `farShore.standOff` and the configured reach, and the
 * bearings the big islands occupy get a wider sound rather than a mountain in
 * the middle of them. That is also the whole of the guarantee that this thing
 * never intrudes: it is not checked afterwards, it is where the coast is
 * defined to be.
 *
 * ## what it costs
 *
 * One draw call and about seven hundred triangles, on every tier, with no
 * texture, no uniform of its own and no work in `update` — the land does not
 * move. There is no `AtmosphereQuality` number for it for the same reason
 * there is none for the ice cap: a system that costs a phone exactly what it
 * costs a workstation does not need a budget, and a tier knob that is the same
 * on all five tiers is a knob that lies about having a choice in it.
 */

/**
 * How many bearings the ring is solved at.
 *
 * One per degree, fixed, on every tier and in the report. Fixed because the
 * survey is the *authority*: `scape:map` reads the same ring the mesh is built
 * from, so a headland the report counts is a headland the picture has. A tier
 * that subsampled it would have the two disagree about how many sounds this
 * coast has, which is exactly the class of thing the structural check exists to
 * catch.
 */
export const SHORE_STEPS = 360

/**
 * How far the coast swings in and out, as a share of its standing distance.
 *
 * Read off the ridge noise rather than given a field of its own — see the
 * module note. Just under a fifth is a coast with headlands and bays in it;
 * past about a third the inner swing starts fighting the stand-off on the
 * crowded bearings and the ring stops being a ring.
 */
const SWING = 0.18

/** One sampled bearing of the far coast. */
export interface ShoreSample {

  /** Radians, measured the way `Math.atan2(z, x)` measures them. */
  bearing: number

  /** Metres from the middle of the world to the crest line. */
  distance: number

  /**
   * Metres the crest stands over mean water.
   *
   * 0 on a bearing the sea runs out through, and 0 for the whole ring on a
   * scape whose `farShore.rise` is zero. Nothing else in this record is
   * conditional: an open bearing still has a distance, because the geometry
   * still has a cross-section there and the cross-section is simply collapsed.
   */
  crest: number

  /**
   * How much of a coast this bearing has, 0..1.
   *
   * The taper, published rather than folded away into {@link crest}, because
   * the two are not the same question and the mesh needs both. The crest says
   * how high the land stands; this says whether there is any, and it is what
   * the sweep sinks the collapsed cross-section by — to the seabed on an open
   * bearing rather than to a metre or two under the surface, which the water's
   * own depth tint drew as a bar across every sound.
   */
  land: number
}

/** A contiguous run of the horizon — either land or the water between two of them. */
export interface ShoreRun {

  /** Degrees, the bearing the run starts at. */
  from: number

  /** Degrees of arc the run covers. */
  arc: number

  /**
   * Metres of the highest crest in the run, or 0 for a sound.
   *
   * On a sound this is 0 by definition rather than by measurement, and it is
   * here so the two run lists are one shape.
   */
  summit: number
}

export interface FarShore {

  /** The ring, {@link SHORE_STEPS} long, starting at bearing 0 and going round once. */
  samples: readonly ShoreSample[]

  /** The runs of land, in bearing order. Empty on a scape with no far coast. */
  headlands: readonly ShoreRun[]

  /** The water between them. One entry covering the whole ring when there is no land. */
  sounds: readonly ShoreRun[]

  /** Share of the horizon standing out of the water, 0..1. */
  land: number

  /** The highest sample, or `null` when nothing stands. */
  summit: ShoreSample | null

  /** Metres to the nearest and furthest the crest line comes. */
  nearest:  number
  furthest: number
}

/**
 * Two octaves make a range; one makes a row of hills.
 *
 * The second octave runs at three times the feature count and {@link DETAIL}
 * of the amplitude, which is what puts a shoulder on a summit and a notch in a
 * col. Three rather than two because a doubling lands every other peak of the
 * fine octave exactly on a peak of the coarse one, and a skyline with that in
 * it reads as a waveform.
 */
const OCTAVE = 3
const DETAIL = 0.42

/**
 * The sounds' control points, as a multiple of `farShore.grain`.
 *
 * Over one, and still much coarser than the skyline: the ridge carries a
 * second octave at {@link OCTAVE} times the grain, so at the default nine the
 * horizon has twenty-seven summits' worth of detail on it and twelve places a
 * sound could open. Three of them do. A sound is a bigger thing than a peak —
 * a coast with as many ways out of it as it has mountains is a reef — and the
 * ratio that matters is this against `grain * OCTAVE`, not this against one.
 *
 * Rounded to a whole number of control points inside {@link ringNoise},
 * because a fractional one is a ring that does not close.
 */
const SOUND_GRAIN = 1.3

/**
 * Which hash row each field is read from.
 *
 * Far apart and not adjacent: two fields a row apart share the lattice's own
 * correlation, and a sound that always opened on the same flank of a summit is
 * what that looks like on the horizon.
 */
const RIDGE_ROW = 17.31
const SOUND_ROW = -58.07

/**
 * Smooth periodic value noise on a ring of `features` control points, 0..1.
 *
 * The same interpolation `noise.ts` does on a lattice, in one dimension and
 * with the index taken modulo the feature count — so the last control point's
 * neighbour is the first, the field closes on itself to the last bit, and no
 * caller has to feather a seam it cannot see.
 */
export function ringNoise (bearing: number, features: number, row: number): number {
  const span  = Math.max(1, Math.round(features))
  const along = bearing / (Math.PI * 2) * span
  const first = Math.floor(along)
  const blend = smoothstep(0, 1, along - first)
  const left  = hash2((first % span + span) % span, row)
  const right = hash2(((first + 1) % span + span) % span, row)

  return left + (right - left) * blend
}

/** The ridge field, 0..1: two octaves of {@link ringNoise}, normalised. */
function ridgeAt (bearing: number, grain: number, seed: number): number {
  const row    = RIDGE_ROW + seed * 0.019
  const coarse = ringNoise(bearing, grain, row)
  const fine   = ringNoise(bearing, grain * OCTAVE, row + 0.5)

  return (coarse + fine * DETAIL) / (1 + DETAIL)
}

/** The land mask, 0..1. Coarser than the ridge by {@link SOUND_GRAIN}. */
function soundAt (bearing: number, grain: number, seed: number): number {
  return ringNoise(bearing, grain * SOUND_GRAIN, SOUND_ROW - seed * 0.023)
}

/**
 * The furthest any terrain patch reaches along a bearing, in metres.
 *
 * The support function of the union of the patches — for a square of half-size
 * `h` centred at `o`, the furthest projection onto a unit direction `d` is
 * `o·d + h·(|dx| + |dz|)`. Projection rather than radial distance, which is
 * what makes it the right test: a ring point further out than the support in
 * its own direction is outside every patch, and no second check is needed.
 *
 * Floored at zero so a bearing with every island behind it reports open water
 * rather than a negative clearance.
 */
export function patchReach (config: ScapeConfig, bearing: number): number {
  const dirX = Math.cos(bearing)
  const dirZ = Math.sin(bearing)
  let reach  = 0

  for (const spec of config.archipelago.landmasses) {
    const half   = landmassTerrain(config, spec).size * 0.5
    const extent =
      spec.origin[0] * dirX + spec.origin[1] * dirZ +
      half * (Math.abs(dirX) + Math.abs(dirZ))

    reach = Math.max(reach, extent)
  }

  return reach
}

/**
 * Degrees of arc from each sample to the nearest open bearing.
 *
 * Two wrapped passes over the ring — forward then back, each relaxing against
 * its neighbour — which is the one-dimensional case of the same chamfer the
 * roost's gate search runs. `Infinity` for every sample on a coast with no
 * sounds in it at all, which is what makes that case taper nothing.
 *
 * Exported for `shore-lights.ts`, which asks the ring the same question for a
 * different reason: the taper wants to know where a headland ends, and a
 * village wants to know how far it is to the way out to sea. One chamfer and
 * not two, because a second implementation of this is a second answer to
 * "where are the sounds" that can drift from the one the geometry used.
 */
export function openDistance (land: readonly boolean[]): number[] {
  const steps = land.length
  const step  = 360 / steps
  const far   = Number.POSITIVE_INFINITY
  const gaps  = land.map(standing => standing ? far : 0)

  for (let pass = 0; pass < 2; pass += 1)
    for (let index = 0; index < steps * 2; index += 1) {
      const at   = pass === 0 ? index % steps : (steps * 2 - index - 1) % steps
      const from = pass === 0 ? (at + steps - 1) % steps : (at + 1) % steps

      gaps[at] = Math.min(gaps[at], gaps[from] + step)
    }

  return gaps
}

/** Collect the contiguous runs of one state, in bearing order, from a ring. */
function runsOf (land: readonly boolean[], wanted: boolean, crest: readonly number[]): ShoreRun[] {
  const steps            = land.length
  const step             = 360 / steps
  const runs: ShoreRun[] = []

  if (land.every(standing => standing === wanted))
    return [{ from: 0, arc: 360, summit: wanted ? Math.max(...crest) : 0 }]

  for (let index = 0; index < steps; index += 1) {
    const previous = (index + steps - 1) % steps

    if (land[index] !== wanted || land[previous] === wanted)
      continue

    let arc    = 0
    let summit = 0

    for (let along = 0; along < steps && land[(index + along) % steps] === wanted; along += 1) {
      arc    += step
      summit  = Math.max(summit, crest[(index + along) % steps])
    }

    runs.push({ from: index * step, arc, summit: wanted ? summit : 0 })
  }

  return runs
}

/**
 * Solve the far coast, once, for a configuration.
 *
 * Pure and deterministic: the same seed and the same section give the same ring
 * to the last float, which is what lets the mesh and `scape:map` read one
 * answer rather than two that agree today.
 */
export function surveyFarShore (config: ScapeConfig): FarShore {
  const { farShore, archipelago, seed } = config
  const standing                        = farShore.reach * archipelago.worldSize
  const ridge: number[]                 = []
  const land: boolean[]                 = []

  for (let index = 0; index < SHORE_STEPS; index += 1) {
    const bearing = index / SHORE_STEPS * Math.PI * 2

    ridge.push(ridgeAt(bearing, farShore.grain, seed))
    land.push(
      farShore.rise > 0 &&
      soundAt(bearing, farShore.grain, seed) > farShore.openness,
    )
  }

  const gaps    = openDistance(land)
  const samples = ridge.map((height, index) => {
    const bearing = index / SHORE_STEPS * Math.PI * 2
    const profile = 1 - farShore.relief * (1 - height)
    const taper   = smoothstep(0, Math.max(1e-3, farShore.taper), gaps[index])

    return {
      bearing,
      land:     taper,
      // The stand-off is a clearance for the *near toe*, which is half the
      // range's depth in front of the crest line this distance measures — so
      // the floor is divided back out by what the sweep will subtract. Written
      // the other way round it clears the patches by the report's reckoning and
      // puts eighty metres of mountain through the sound island in the picture.
      distance: Math.max(
        standing * (1 + (height - 0.5) * SWING),
        (patchReach(config, bearing) + farShore.standOff) / (1 - farShore.width * 0.5),
      ),
      crest: farShore.rise * profile * taper,
    }
  })

  const crest   = samples.map(sample => sample.crest)
  const summits = samples.filter(sample => sample.crest > 0)

  return {
    samples,
    headlands: land.some(Boolean) ? runsOf(land, true, crest) : [],
    sounds:    land.every(Boolean) ? [] : runsOf(land, false, crest),
    land:      land.filter(Boolean).length / SHORE_STEPS,
    summit:    summits.reduce<ShoreSample | null>(
      (best, sample) => !best || sample.crest > best.crest ? sample : best,
      null,
    ),
    nearest:  Math.min(...samples.map(sample => sample.distance)),
    furthest: Math.max(...samples.map(sample => sample.distance)),
  }
}
