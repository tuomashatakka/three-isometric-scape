import { BufferGeometry, Color, Float32BufferAttribute, DoubleSide, Mesh, MeshStandardMaterial } from 'three'
import type { IUniform, WebGLProgramParametersWithUniforms } from 'three'
import { smoothstep } from 'threejs-scene'
import { mergeGeometryList, ribbonIndices, traceSections } from 'threejs-scene/modules/assets'
import type { LiveConfig } from '../config.ts'
import type { AtmosphereQuality } from '../quality.ts'
import type { SeasonState } from '../season.ts'
import type { ArchipelagoSurvey } from './archipelago.ts'
import { beckFreeze } from './beck.ts'
import type { Creek } from './creek.ts'
import { drawnSurfaceOf, patchSegments } from './terrain.ts'


/**
 * The water going over the step.
 *
 * `knickpoint.ts` is the other half and the ground's half: it rearranges the
 * beck's long profile so the steepest reach falls as one step, and `height.ts`
 * folds that into the terrain, so the mesh, the placement searches and the
 * instruments all read a hillside with a lip in it. This module finds that lip
 * again in the ground *as drawn*, and hangs a sheet off it.
 *
 * It deliberately re-finds what the carve made rather than being handed it. The
 * sheet has to agree with the triangles the camera sees, not with the continuous
 * field they were sampled from, and those two differ by tens of centimetres
 * wherever the ground curves — which is most of a metre out of a two metre drop.
 * It is the same rule the beck and the cart ruts follow, and it is what stops
 * the fall hanging in the air above its own lip.
 */

/** Metres between cross-sections of the sheet. */
const STEP = 0.4

/**
 * The gradient at which the drawn ground counts as a face rather than a reach.
 *
 * Just under the beck's own riffle grade of 0.6, so anything this calls
 * a fall is also water the beck itself is already breaking white — the two
 * instruments agree about where the rough water is, and the sheet is never hung
 * over a reach that is running black underneath it.
 */
const FACE_GRADE = 0.55

/**
 * How much of the steepest grade a neighbouring section must hold to belong to
 * the same face.
 *
 * The knob that separates a step from the hillside it is cut into. At 1 the face
 * is one section wide and the sheet is a postage stamp; at 0 it is every metre
 * of the course that breaks at all, which on the shield — a course that falls
 * twenty-two metres — is most of the island.
 */
const FACE_HOLD = 0.6

/** The cross-section of the sheet, in multiples of its half-width. */
const ACROSS: readonly number[] = [ -1, -0.55, 0, 0.55, 1 ]

/** Rows down the sheet. Enough for the curve off the lip to be a curve. */
const ROWS = 10

/** How much wider the sheet is at the plunge than at the lip. */
const SPREAD = 0.25

/** Metres of sheet a streak of broken water occupies, across and down. */
const STREAK_ACROSS = 0.3
const STREAK_DOWN   = 0.9

/** Where the surface texture starts to break, and how fast it goes white. */
const BREAK = 0.48
const GAIN  = 2.4

/** How much darker than the sea's deep tint the unbroken water at the lip is. */
const DEEP = 0.42

/** The fall, as the drawn ground carries it. */
export interface Fall {

  /** The lip, in the island's own frame. */
  x: number
  z: number

  /** Which way the water is going, as a unit vector in the ground plane. */
  headingX: number
  headingZ: number

  /** World height of the sheet at the lip and at the plunge. */
  lip:  number
  foot: number

  /** Metres between the two, and metres of channel crossed getting there. */
  drop: number
  run:  number

  /** Half the wetted width of the channel at the lip. */
  half: number
}

export interface FallOptions {
  creek: Creek

  /** Metres the sheet stands above the channel floor — the beck's own depth. */
  depth: number

  /** How much of the channel floor the water covers, 0..1. */
  fill: number

  /** Where the sea takes the channel over, in world height. */
  waterLevel: number

  /** Metres of drop below which a reach is a riffle rather than a fall. */
  least: number

  /** The terrain as drawn, for the reason `beck.ts` gives. */
  surfaceAt(x: number, z: number): number
}

/** A traced section of a course, as `traceSections` returns one. */
interface Section {
  x:     number
  z:     number
  along: number
}

/**
 * The steep core of a course, as a pair of section indices.
 *
 * Anchored on the steepest single section and grown outward while its neighbours
 * hold most of that grade. A fixed threshold alone would swallow a whole steep
 * hillside into the face on the islands that are one; a share of the peak keeps
 * the sheet on the step and off the slope it stands in.
 */
function steepCore (
  sections: readonly Section[],
  levels:   readonly number[],
  last:     number,
): { head: number, tail: number } | null {
  // `grades[at]` is the fall from the section before it to this one. Index 0 has
  // no section before it and is left at zero, so the walks below can start
  // anywhere without a bounds test of their own.
  const grades = levels.map((level, at) =>
    at === 0 || at > last
      ? 0
      : (levels[at - 1] - level) / Math.max(0.01, sections[at].along - sections[at - 1].along))

  let peak   = 0
  let peakAt = -1

  for (let at = 1; at <= last; at += 1)
    if (grades[at] > peak) {
      peak   = grades[at]
      peakAt = at
    }

  if (peakAt < 0 || peak < FACE_GRADE)
    return null

  const hold = Math.max(FACE_GRADE, peak * FACE_HOLD)

  let head = peakAt - 1
  let tail = peakAt

  while (head > 0 && grades[head] >= hold)
    head -= 1

  while (tail + 1 <= last && grades[tail + 1] >= hold)
    tail += 1

  return { head, tail }
}

/**
 * The face on one island's course — the steepest of it, not the longest.
 *
 * Built on the same construction the beck's own sheet is — a running minimum of
 * the drawn bed, lifted by the beck's depth, cut off at the tideline — so the
 * lip this returns is a point on the ribbon the beck is already drawing rather
 * than an independent guess at where the water is.
 *
 * Anchored on the steepest single section and grown outward while its
 * neighbours hold most of that grade, rather than on the reach with the greatest
 * drop in it. The first version did the latter and it could not see its own
 * landform: a knickpoint preserves the fall of the window it was cut from, so on
 * a course that was already breaking white end to end the total drop over the
 * reach is the same number before and after the carve. What changes is the
 * *grade*, which is the thing a fall actually is.
 *
 * @returns The fall, or `null` when the course has no face steep enough. That
 *   absence is a normal answer: a short even course simply has no force on it.
 */
export function findFall (options: FallOptions): Fall | null {
  const { creek, depth, fill, waterLevel, least, surfaceAt } = options
  const sections                                             = traceSections(creek.points, STEP)

  if (sections.length < 3)
    return null

  let floor = Infinity

  const levels = sections.map(section => {
    floor = Math.min(floor, surfaceAt(section.x, section.z))
    return floor + depth
  })

  // The last cut that still stands over the sea, and *not* the first one under
  // it: the beck keeps that one so its ribbon tucks under the water plane rather
  // than ending on a visible edge, and a fall must do the opposite. A plunge
  // below the waterline is a sheet of white water standing in the sea.
  const drowned = levels.findIndex(level => level <= waterLevel)
  const last    = drowned < 0 ? sections.length - 1 : drowned - 1
  const core    = last < 2 ? null : steepCore(sections, levels, last)

  if (!core)
    return null

  const { head, tail } = core
  const drop           = levels[head] - levels[tail]

  if (drop < least)
    return null

  const lip    = sections[head]
  const plunge = sections[tail]
  const reach  = Math.hypot(plunge.x - lip.x, plunge.z - lip.z)

  return {
    x:        lip.x,
    z:        lip.z,
    headingX: reach > 0 ? (plunge.x - lip.x) / reach : 0,
    headingZ: reach > 0 ? (plunge.z - lip.z) / reach : 1,
    lip:      levels[head],
    foot:     levels[tail],
    drop,
    run:      plunge.along - lip.along,
    half:     creek.halfWidthAt(creek.sampleAt(lip.x, lip.z).course) * fill,
  }
}

export interface SheetOptions {

  /** Where the water goes over, as {@link findFall} measured it. */
  fall: Fall

  /** Width of the sheet, as a multiple of the channel's wetted width. */
  breadth: number

  /** Metres the water carries forward from the lip before it lands. */
  reach: number

  /** Metres the sheet stands off the face behind it. */
  standoff: number

  /** Unbroken water at the lip, and the broken water at the plunge. */
  water: Color
  foam:  Color
}

/**
 * The sheet hanging off one lip.
 *
 * Thrown rather than draped. Water leaving an edge keeps the speed it arrived
 * with and gains the fall on top of it, so the horizontal travel is linear in
 * time and the drop goes as its square — which is the whole silhouette. Drawn as
 * a plain ramp between the lip and the foot it reads as a wet slab lying on the
 * face, and the one thing that separates a fall from a steep reach is the gap
 * behind the top of it.
 *
 * The base is the lip rather than `y = 0`: this is landform geometry like the
 * beck's ribbon, not a prop, and it is built in the island's own frame for the
 * same reason the beck is — that is the only frame the creek solver and the
 * height field agree in.
 */
export function sheetGeometry (options: SheetOptions): BufferGeometry {
  const { fall, breadth, reach, standoff, water, foam } = options

  // Perpendicular to the heading, in the ground plane. The sheet is laid across
  // the channel's own direction rather than across the world's axes, so a fall
  // that goes over on a diagonal is still as wide as the beck feeding it.
  const acrossX = -fall.headingZ
  const acrossZ = fall.headingX
  const travel  = fall.run + reach

  const position: number[] = []
  const colors: number[]   = []
  const frame: number[]    = []
  const tint               = new Color()

  for (let row = 0; row <= ROWS; row += 1) {
    const time = row / ROWS
    const down = fall.drop * time * time
    const wide = fall.half * breadth * (1 + SPREAD * time)
    const at   = standoff + travel * time

    for (let step = 0; step < ACROSS.length; step += 1) {
      const offset = ACROSS[step] * wide

      position.push(
        fall.x + fall.headingX * at + acrossX * offset,
        fall.lip - down,
        fall.z + fall.headingZ * at + acrossZ * offset,
      )

      // Green at the lip and white by the plunge, in the vertices rather than
      // only in the shader: the cheapest tier compiles no surface texture at
      // all, and a fall that is one flat colour on it would read as a pane of
      // glass leaning against the hill.
      tint.copy(water).lerp(foam, smoothstep(0.1, 0.9, time) * 0.7)
      colors.push(tint.r, tint.g, tint.b)

      // Metres across the sheet, metres fallen, and how far down it that is as a
      // fraction. The texture is scrolled in this frame rather than in world
      // space, so a streak travels down the sheet whichever way the beck faces.
      frame.push(offset, down, time)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setAttribute('aForce', new Float32BufferAttribute(frame, 3))
  geometry.setIndex(ribbonIndices(0, ROWS + 1, ACROSS.length))
  geometry.computeVertexNormals()

  return geometry
}

const FORCE_PARS_VERTEX = /* glsl */ `
attribute vec3 aForce;
varying vec3 vForce;
`

const FORCE_BEGIN_VERTEX = /* glsl */ `
#include <begin_vertex>
vForce = aForce;
`

const FORCE_PARS_FRAGMENT = /* glsl */ `
uniform float uForceTravel;
uniform float uForceWhite;
uniform float uForceSpray;
uniform float uForceFreeze;
uniform vec3  uForceIce;
uniform vec3  uForceFoam;
varying vec3  vForce;

float forceHash (vec2 p) {
  return fract(sin(dot(p, vec2(37.9, 271.1))) * 43758.5453);
}

float forceNoise (vec2 p) {
  vec2 cell = floor(p);
  vec2 f    = fract(p);
  vec2 w    = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(forceHash(cell), forceHash(cell + vec2(1.0, 0.0)), w.x),
    mix(forceHash(cell + vec2(0.0, 1.0)), forceHash(cell + vec2(1.0, 1.0)), w.x),
    w.y);
}
`

/**
 * What the sheet does between the lip and the plunge.
 *
 * `ripples` is the tier's octave count, read from the same `quality.beckRipples`
 * the beck's own surface is — one decision about how much texture the running
 * water in this scape can afford, taken once. At zero the whole term is left out
 * of the source rather than multiplied by nothing, and the fall is the vertex
 * gradient alone: still a fall, and free.
 */
function forceColorFragment (ripples: number): string {
  const weights = Array.from({ length: ripples }, (_unused, index) => 1 / 2 ** index)

  const octaves = weights
    .map((weight, index) =>
      `streak += forceNoise(sheet * ${(2 ** index).toFixed(1)}) * ${weight.toFixed(3)};`)
    .join('\n  ')

  const norm = weights.reduce((sum, weight) => sum + weight, 0)

  const texture = ripples > 0
    ? /* glsl */ `
  vec2 sheet = vec2(vForce.x / ${STREAK_ACROSS.toFixed(3)}, (vForce.y - uForceTravel) / ${STREAK_DOWN.toFixed(3)});
  float streak = 0.0;
  ${octaves}
  streak /= ${norm.toFixed(3)};

  // Broken in proportion to how far it has fallen: the lip is a clear green tongue
  // and only the last of the drop is properly white.
  float broken = uForceWhite * smoothstep(0.0, 0.55, vForce.z);
  float white  = clamp(broken * (streak - ${BREAK.toFixed(2)}) * ${GAIN.toFixed(1)}, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, uForceFoam, white);

  // The spray standing in the plunge. A band rather than a particle system: what
  // is visible from any pose this scape is photographed at is a brightening in
  // the last of the sheet, and the cheapest honest way to draw one is here.
  float haze = smoothstep(1.0 - uForceSpray, 1.0, vForce.z) * uForceSpray;
  diffuseColor.rgb = mix(diffuseColor.rgb, uForceFoam, haze);
`
    : ''

  return /* glsl */ `
#include <color_fragment>
${texture}
diffuseColor.rgb = mix(diffuseColor.rgb, uForceIce, uForceFreeze);
`
}

/** Every fall in the archipelago, as one draw. */
export interface Force {
  mesh: Mesh

  /** What was found, island by island, for the instruments to report. */
  falls: readonly Fall[]

  update(delta: number, season: SeasonState): void
  dispose(): void
}

/**
 * Every island's fall, merged into one mesh with one material.
 *
 * Built in each island's local frame and translated into the world afterwards,
 * exactly the way the terrain patches, the cart ruts and the beck are.
 *
 * @returns The water, or `null` when nothing in the archipelago has a step in it
 *   — which is what `force.drop = 0` means, and also what a set of short even
 *   courses would mean on their own.
 */
export function createForce (
  config:       LiveConfig,
  archipelago:  ArchipelagoSurvey,
  quality:      AtmosphereQuality,
  baseSegments: number,
): Force | null {
  const scape                    = config()
  const pieces: BufferGeometry[] = []
  const falls: Fall[]            = []

  const water = new Color(scape.palette.deepWater).multiplyScalar(DEEP)
  const foam  = new Color(scape.palette.foam)

  for (const landmass of archipelago.landmasses) {
    const { creek } = landmass.survey.layout

    if (!creek)
      continue

    const segments = patchSegments(
      scape.terrain.size,
      landmass.config.terrain.size,
      baseSegments,
      landmass.detail,
    )

    const fall = findFall({
      creek,
      depth:      scape.beck.depth,
      fill:       scape.beck.fill,
      waterLevel: scape.terrain.waterLevel,
      least:      scape.force.least,
      surfaceAt:  drawnSurfaceOf(landmass.survey.field, landmass.config.terrain.size, segments),
    })

    if (!fall)
      continue

    const geometry = sheetGeometry({
      fall,
      breadth:  scape.force.breadth,
      reach:    scape.force.reach,
      standoff: scape.force.standoff,
      water,
      foam,
    })

    geometry.translate(landmass.origin.x, 0, landmass.origin.z)
    pieces.push(geometry)

    falls.push({
      ...fall,
      x: fall.x + landmass.origin.x,
      z: fall.z + landmass.origin.z,
    })
  }

  if (pieces.length === 0)
    return null

  const geometry = mergeGeometryList(pieces, false)
  for (const piece of pieces)
    piece.dispose()

  geometry.computeBoundingSphere()

  const uniforms: Record<string, IUniform> = {
    uForceTravel: { value: 0 },
    uForceWhite:  { value: scape.force.white },
    uForceSpray:  { value: scape.force.spray },
    uForceFreeze: { value: 0 },
    uForceIce:    { value: new Color(scape.palette.ice) },
    uForceFoam:   { value: foam.clone() },
  }

  // Opaque, and double-sided. Opaque for the reason the beck's sheet is — this
  // scape has been bitten twice by the ordering of overlapping transparent
  // surfaces, see `scene/layers.ts`. Double-sided because the camera goes all
  // the way round: a sheet a metre from the hillside behind it is seen from
  // upstream at half the headings the scape can be turned to.
  const material = new MeshStandardMaterial({
    name:            'force-water',
    vertexColors:    true,
    side:            DoubleSide,
    roughness:       0.16,
    metalness:       0.03,
    envMapIntensity: 0.6,
  })

  material.onBeforeCompile = (program: WebGLProgramParametersWithUniforms) => {
    Object.assign(program.uniforms, uniforms)

    program.vertexShader = program.vertexShader
      .replace('#include <common>', `#include <common>\n${FORCE_PARS_VERTEX}`)
      .replace('#include <begin_vertex>', FORCE_BEGIN_VERTEX)

    program.fragmentShader = program.fragmentShader
      .replace('#include <common>', `#include <common>\n${FORCE_PARS_FRAGMENT}`)
      .replace('#include <color_fragment>', forceColorFragment(quality.beckRipples))
  }

  material.customProgramCacheKey = () => `scape-force:${quality.beckRipples}`

  const mesh = new Mesh(geometry, material)
  mesh.name  = 'force'

  // It takes the light the beck takes and casts nothing. A sheet of water a
  // metre off a hillside would cast a hard black stripe down the face behind it,
  // which is the one thing the inside of a fall is not.
  mesh.receiveShadow = true
  mesh.updateMatrix()
  mesh.matrixAutoUpdate = false

  // Metres of sheet the water has run, carried rather than derived from the
  // elapsed clock, for the reason the beck carries its own: an elapsed time
  // multiplied by a live speed jumps the pattern every time either changes.
  let travel = 0

  return {
    mesh,
    falls,

    update (delta, season) {
      // The same winter the beck reads, and the fall keeps it a little longer
      // still — but not by a second knob, which would be a second winter to keep
      // in step with the first. What holds a fall open is that it is falling,
      // and that is already what `beckFreeze` is a curve about.
      const locked = beckFreeze(season.freeze)
      const force  = config().force

      travel += delta * force.flow * (1 - locked)

      uniforms.uForceTravel.value = travel
      uniforms.uForceWhite.value  = force.white * (1 - locked)
      uniforms.uForceSpray.value  = force.spray * (1 - locked)
      uniforms.uForceFreeze.value = locked;
      (uniforms.uForceIce.value as Color).copy(season.iceColor)
    },

    dispose () {
      geometry.dispose()
      material.dispose()
    },
  }
}

// perf: one draw for every fall in the archipelago — five columns by eleven rows
// per island that has one, which is about 330 vertices in total. The fragment
// cost is `quality.beckRipples` value-noise lobes over a sheet that is a couple
// of metres square, and none at all on the tier that compiles the texture out.
