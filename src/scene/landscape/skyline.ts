import { BufferAttribute, BufferGeometry, Color, Mesh } from 'three'
import { smoothstep } from 'threejs-scene'
import type { Material } from 'three'
import type { ScapeConfig } from '../config.ts'
import { valueNoise } from '../noise.ts'
import { SHORE_STEPS, ringNoise } from './farshore.ts'
import type { FarShore, ShoreSample } from './farshore.ts'


/**
 * The far coast, as one static mesh — a mountain range, not a band.
 *
 * ## a coast, not a reef
 *
 * The cross-section runs from a toe under the water, up the seaward face to the
 * coastal ridge, down into a vale and back up to an outer rim past the corner
 * of the widest frame the camera has. A cross-section that came back down into
 * the water behind the ridge would be an island: what makes a far shore a far
 * shore is that *the sea ends*. `farShore.hinterland` is how far out the rim is.
 *
 * ## a range, not a cutout
 *
 * The first coast was four rings a bearing — toe, ridge, vale, rim — and from
 * the archipelago frame that is a smooth cardboard collar with a clean outline
 * at the water: no spur, no gully, no summit, and a coastline drawn with a
 * compass. Two things make a range read as one from a kilometre off, and this
 * sweep now has both:
 *
 * - **relief that runs down the slopes.** {@link reliefAt} is ridged value
 *   noise in *world* space, so it has no seam at due east and no spokes along
 *   the bearings, and it only ever *carves*: spurs stand at the surveyed
 *   height and the gullies between them are cut down from it. The summit is
 *   therefore never higher than the survey says, and a shore light placed on
 *   the face can never be inside a hill that was not there when it was placed.
 * - **a waterline that wanders.** {@link bayAt} drops the foot of the face
 *   under the sea in patches, so the coastline is where the ground happens to
 *   cross the water rather than a ring a fixed share of the way up. The rings
 *   are packed toward the toe ({@link FACE}) because that is where the
 *   coastline is decided.
 *
 * ## the sounds cost a few triangles rather than a branch
 *
 * Where the sea runs out the survey's `land` falls to zero, and every radial
 * offset and every height is scaled by it toward the seabed, so an open bearing
 * collapses to a single point on the bottom. The strip stays one unbroken ring
 * and the index buffer a loop with no special case.
 *
 * ## what it is made of
 *
 * The shared `ground` material: no program, uniform or texture of its own. It
 * picks up the fog, the snow line, the wet pass and the cloud shadow for
 * nothing. It casts no shadow and receives none — a kilometre-wide ring in the
 * caster list would spend the islands' shadow resolution on a thing the air has
 * half dissolved.
 */

/**
 * Where each ring stands, as a multiple of the half-width between the toe and
 * the ridge (`-1` is the toe, `0` the ridge, {@link VALE} the vale floor), and
 * then {@link INLAND} more spread out to the rim, which `farShore.hinterland`
 * places per bearing.
 *
 * Packed toward the toe: the coastline is decided in the first fifth of the
 * face, and a face drawn in four even steps has one chord where the coast is.
 */
const VALE   = 1.6
const FACE   = [ -1, -0.86, -0.72, -0.58, -0.44, -0.3, -0.15, 0, 0.35, 0.85, VALE ]
const INLAND = 4
const RINGS  = FACE.length + INLAND
const RIDGE  = FACE.indexOf(0)

/** The section parameter of one ring, given where this bearing's rim is. */
function ringAt (ring: number, rimU: number): number {
  return ring < FACE.length
    ? FACE[ring]
    : VALE + (rimU - VALE) * (ring - FACE.length + 1) / INLAND
}

/** The vale keeps half the ridge, the rim comes back up to most of it. */
const VALE_HIGH = 0.5
const RIM_HIGH  = 0.86

/** The seaward face is concave — steep under the crest, gentle at the foot. */
const FACE_CURVE = 1.4

/**
 * How deep a gully is cut, as a share of the ground standing above the water
 * there. The ridged noise is ~1 on a spur and falls to 0 in a gully floor.
 */
const GULLY = 0.55

/**
 * The massif's octaves, in metres. Only broad ones: the sweep is a degree a
 * bearing on mobile — 14 m at the crest — and rings 25 m apart on the face, and
 * a world-space octave finer than about twice that aliases into streaks.
 */
const MASSIF_SCALES = [ 170, 75 ]

/**
 * The drainage: gullies down the face, as ridged noise *along the bearing* —
 * periodic by construction, so the ring closes — and wandered sideways by a
 * world-space warp so no gully runs straight. A gully runs downslope, so a
 * pattern that is fine across the face and long down it is the right shape,
 * and it needs fine bearings rather than fine rings. {@link GULLIES} round the
 * whole horizon is about 50 m apart at the crest line: three bearings a gully
 * on the coarsest tier.
 */
const GULLIES = 110
const MEANDER = 1.6

/**
 * How far a bay drops the foot of the face, as a share of the crest, and the
 * feature size of the bays in metres. Sized so the deepest bay reaches about a
 * third of the way up the face before the ground wins.
 */
const BAY       = 0.26
const BAY_SCALE = 46

/** The toe stands this far under the bottom of a spring tide. */
const TOE_MARGIN = 1

/**
 * Bearings per survey sample, from the tier's terrain density. The survey is
 * one degree a step; at the crest line that is 14 m, coarser than the gullies,
 * so the tiers that draw fine terrain draw this finely too. One number for
 * both, for the reason `terrainSegments` and the scatter share one: the far
 * coast is terrain.
 */
export function skylineSubdivision (terrainSegments: number): number {
  return Math.min(4, Math.max(1, Math.round(terrainSegments / 72)))
}

/** Ridged, 0 in a valley floor and 1 on a crest. */
function ridged (value: number): number {
  const fold = 1 - Math.abs(value * 2 - 1)

  return fold * fold
}

/**
 * The relief at one point of the coast, 0 in a gully floor and 1 on a spur.
 * Deterministic, and only ever used to *carve*. `drain` is how much of it is
 * the drainage: all of it on the seaward face, none of it far inland, where a
 * gully kept straight for a kilometre would be a spoke.
 */
export function reliefAt (x: number, z: number, bearing: number, seed: number, drain: number): number {
  const massif = ridged(valueNoise(x / MASSIF_SCALES[0], z / MASSIF_SCALES[0], seed)) * 0.65 +
    ridged(valueNoise(x / MASSIF_SCALES[1], z / MASSIF_SCALES[1], seed + 7.13)) * 0.35
  const wander = (valueNoise(x / 130, z / 130, seed - 4.4) - 0.5) * MEANDER * Math.PI * 2 / GULLIES
  const gully  = ridged(ringNoise(bearing + wander, GULLIES, 41.9 + seed * 0.013))

  return massif * (1 - 0.45 * drain) + gully * 0.45 * drain
}

/** 0..1 — how far a bay has eaten into the foot of the face here. */
export function bayAt (x: number, z: number, seed: number): number {
  return smoothstep(0.42, 0.82, valueNoise(x / BAY_SCALE, z / BAY_SCALE, seed - 31.7))
}

/** One point of the cross-section, in world space. */
export interface SectionPoint {
  x:      number
  y:      number
  z:      number
  radius: number
}

/** Mean water, the toe, and the seabed the sounds collapse to. */
interface Levels {
  water:  number
  toe:    number
  seabed: number
}

function levelsOf (config: ScapeConfig): Levels {
  const { terrain, tide } = config

  return {
    water:  terrain.waterLevel,
    toe:    terrain.waterLevel - tide.range * 0.5 - TOE_MARGIN,
    seabed: terrain.waterLevel - terrain.seabedDrop,
  }
}

/** How much of the crest a ring past the ridge keeps. */
function inlandHigh (u: number, rimU: number): number {
  if (u <= VALE)
    return 1 - (1 - VALE_HIGH) * smoothstep(0, VALE, u)

  return VALE_HIGH + (RIM_HIGH - VALE_HIGH) * smoothstep(VALE, rimU, u)
}

/**
 * The ground at `u` across one bearing's section — the one definition of the
 * far coast's surface. The sweep draws it and `shore-lights.ts` stands its
 * lamps on it, so the two cannot disagree about where the hillside is.
 */
export function sectionAt (
  config: ScapeConfig,
  sample: ShoreSample,
  u:      number,
  out:    SectionPoint = { x: 0, y: 0, z: 0, radius: 0 },
): SectionPoint {
  const { farShore, seed }                 = config
  const { water, toe, seabed }             = levelsOf(config)
  const { bearing, distance, crest, land } = sample
  const half                               = distance * farShore.width * 0.5
  const rimU                               = distance * farShore.hinterland / Math.max(1e-6, half)
  const radius                             = distance + half * Math.min(u, rimU) * land
  const x                                  = Math.cos(bearing) * radius
  const z                                  = Math.sin(bearing) * radius

  let base  = water
  let share = inlandHigh(u, rimU)
  let dip   = 0

  if (u < 0) {
    const s = u + 1
    base  = toe + (water - toe) * s
    share = Math.pow(s, FACE_CURVE)
    dip   = BAY * crest * bayAt(x, z, seed) * (1 - s) * (1 - s)
  }

  // The gullies bite deeper the higher up the face they are — a foot of
  // shingle is not carved the way a summit is.
  const bite   = GULLY * Math.min(1, 0.3 + (u + 1) * 0.7)
  const ground = base + crest * share * (1 - bite * (1 - reliefAt(x, z, bearing, seed, 1 - smoothstep(0.2, VALE, u)))) - dip

  out.x      = x
  out.z      = z
  out.radius = radius
  out.y      = seabed + (ground - seabed) * land
  return out
}

/** Survey samples are a degree apart; the sweep reads between them. */
function sampleBetween (shore: FarShore, at: number, out: ShoreSample): ShoreSample {
  const first = Math.floor(at)
  const blend = at - first
  const a     = shore.samples[first % SHORE_STEPS]
  const b     = shore.samples[(first + 1) % SHORE_STEPS]

  out.bearing  = at / SHORE_STEPS * Math.PI * 2
  out.distance = a.distance + (b.distance - a.distance) * blend
  out.crest    = a.crest + (b.crest - a.crest) * blend
  out.land     = a.land + (b.land - a.land) * blend
  return out
}

const tones = {
  rock:   new Color(),
  wet:    new Color(),
  scree:  new Color(),
  forest: new Color(),
  heath:  new Color(),
  haze:   new Color(),
}
const blend = new Color()

/**
 * What the ground is made of at one vertex, after the normals are known.
 *
 * Wet rock at the water; forest over the gentle low ground, broken into
 * stands and heath clearings by world-space noise (the old bearing-swept
 * stands drew spokes at any fine octave); bare rock wherever the face is too
 * steep to hold soil; scree above a treeline that climbs where the stand is
 * thick. Then aerial perspective by *radial* distance past the ridge, because
 * the shader's haze is measured from the point the camera looks at and the
 * rim is barely further from that than the ridge is.
 */
function groundTone (
  height: number,
  share:  number,
  steep:  number,
  stand:  number,
  haze:   number,
  out:    Color,
): Color {
  out.lerpColors(tones.heath, tones.forest, smoothstep(0.3, 0.6, stand))

  const treeline = 0.5 + 0.3 * stand
  out.lerp(tones.scree, smoothstep(treeline - 0.15, treeline + 0.1, share))
  out.lerp(tones.rock, smoothstep(0.3, 0.6, steep))
  out.lerp(tones.wet, 1 - smoothstep(0.5, 3, height))

  return out.lerp(tones.haze, haze)
}

function setTones (config: ScapeConfig): void {
  const { palette } = config

  tones.rock.set(palette.scree).lerp(blend.set(palette.seaRock), 0.6)
  tones.wet.set(palette.seaRock).multiplyScalar(0.7)
  tones.scree.set(palette.scree)
  tones.forest.set(palette.farForest)
  tones.heath.set(palette.heath)
  tones.haze.set(palette.fog)
}

/** Positions, ring by ring, bearing by bearing. */
function sweepRing (config: ScapeConfig, shore: FarShore, bearings: number): Float32Array {
  const rings    = RINGS
  const position = new Float32Array(bearings * rings * 3)
  const sample   = { bearing: 0, distance: 0, crest: 0, land: 0 }
  const point    = { x: 0, y: 0, z: 0, radius: 0 }

  for (let step = 0; step < bearings; step += 1) {
    sampleBetween(shore, step / bearings * SHORE_STEPS, sample)

    const half = sample.distance * config.farShore.width * 0.5
    const rimU = sample.distance * config.farShore.hinterland / Math.max(1e-6, half)

    for (let ring = 0; ring < rings; ring += 1) {
      sectionAt(config, sample, ringAt(ring, rimU), point)
      position.set([ point.x, point.y, point.z ], (step * rings + ring) * 3)
    }
  }

  return position
}

/** Colours, from the swept positions and the normals they gave. */
function paintRing (
  config:   ScapeConfig,
  shore:    FarShore,
  position: Float32Array,
  normal:   ArrayLike<number>,
): Float32Array {
  const rings  = RINGS
  const colour = new Float32Array(position.length)
  const rise   = Math.max(1e-6, shore.summit?.crest ?? config.farShore.rise)
  const water  = config.terrain.waterLevel

  setTones(config)

  for (let at = 0; at < position.length / 3; at += 1) {
    const ring  = at % rings
    const x     = position[at * 3]
    const y     = position[at * 3 + 1]
    const z     = position[at * 3 + 2]
    const stand = valueNoise(x / 90, z / 90, config.seed + 3.1) * 0.7 +
      valueNoise(x / 31, z / 31, config.seed + 9.7) * 0.3
    const haze   = 0.3 * smoothstep(RIDGE, rings - 1, ring)

    groundTone(y - water, (y - water) / rise, 1 - normal[at * 3 + 1], stand, haze, blend)
      .toArray(colour, at * 3)
  }

  return colour
}

/**
 * Wind every band of the sweep so its face looks up.
 *
 * For an inner ring `a` and the ring `b` outside it, the triangles
 * `(aᵢ, bⱼ, bᵢ)` and `(aᵢ, aⱼ, bⱼ)` give a normal whose vertical part is the
 * radial step between the two rings — positive whatever the slope does, so a
 * face that climbs from the sea and one that falls back toward it wind the same
 * way. `skyline.test.ts` asserts it against the geometry.
 */
function windRing (bearings: number, rings: number): Uint32Array {
  const bands = rings - 1
  const index = new Uint32Array(bearings * bands * 6)

  for (let step = 0; step < bearings; step += 1) {
    const here = step * rings
    const next = (step + 1) % bearings * rings

    for (let band = 0; band < bands; band += 1)
      index.set([
        here + band, next + band + 1, here + band + 1,
        here + band, next + band, next + band + 1,
      ], (step * bands + band) * 6)
  }

  return index
}

/**
 * Build the far coast, or `null` when the scape has none — `farShore.rise` at
 * zero is open ocean on every bearing, and an empty draw is still a draw.
 */
export function createFarShore (
  config:      ScapeConfig,
  shore:       FarShore,
  material:    Material,
  subdivision: number = 1,
): Mesh | null {
  if (!shore.headlands.length)
    return null

  const bearings = SHORE_STEPS * Math.max(1, Math.round(subdivision))
  const position = sweepRing(config, shore, bearings)
  const geometry = new BufferGeometry()

  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setIndex(new BufferAttribute(windRing(bearings, RINGS), 1))
  geometry.computeVertexNormals()
  geometry.setAttribute('color', new BufferAttribute(
    paintRing(config, shore, position, geometry.getAttribute('normal').array),
    3,
  ))

  const mesh         = new Mesh(geometry, material)
  mesh.name          = 'far-shore'
  mesh.castShadow    = false
  mesh.receiveShadow = false
  mesh.updateMatrix()
  mesh.matrixAutoUpdate = false
  return mesh
}

/** Rings a bearing, for the tests and the census. */
export const SKYLINE_RINGS = RINGS
