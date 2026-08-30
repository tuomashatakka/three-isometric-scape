import { Color, Mesh, MeshStandardMaterial, BufferGeometry, Float32BufferAttribute } from 'three'
import type { IUniform, WebGLProgramParametersWithUniforms } from 'three'
import { smoothstep } from 'threejs-scene'
import { mergeGeometryList, ribbonIndices, traceSections } from 'threejs-scene/modules/assets'
import type { LiveConfig } from '../config.ts'
import type { AtmosphereQuality } from '../quality.ts'
import type { SeasonState } from '../season.ts'
import type { ArchipelagoSurvey } from './archipelago.ts'
import type { Creek } from './creek.ts'
import { drawnSurfaceOf, patchSegments } from './terrain.ts'


/**
 * Metres between cross-sections of the sheet.
 *
 * The channel is three metres across at the spring and eleven at the mouth, so
 * a cut every 0.6 m gives the water a length-to-width density close to square —
 * which is what a shaded sheet wants, because its whole shape is the *fall*
 * along it and a long thin quad cannot carry one.
 */
const STEP = 0.6

/**
 * The cross-section, in multiples of the wetted half-width.
 *
 * Five edges, the same shape the cart ruts use and for the same reason: the two
 * outer ones carry the streambed's own colour, so the water has no seam against
 * the gravel it is lying in, and the middle carries the full depth tint.
 */
const ACROSS: readonly number[] = [ -1, -0.6, 0, 0.6, 1 ]

/**
 * How steep a reach has to be before it breaks as hard as it ever will, as a
 * ground gradient.
 *
 * A fall of one metre in one and a half, which is steeper than anything the
 * home island's course does — so the beck there is never fully broken, which is
 * what it should look like. Below it the water is disturbed rather than white.
 */
const RIFFLE_GRADE = 0.6

/**
 * Where the surface texture starts to break, and how fast it goes white above
 * that.
 *
 * The noise is normalised to 0..1 with a mean at a half, so a threshold above
 * the mean is what leaves dark water between the white. Tuned by looking:
 * without it the whole reach came out as a chalk stripe rather than as a beck
 * with foam on it, because *most* of a value noise is near its middle.
 */
const RIFFLE_BREAK = 0.55
const RIFFLE_GAIN  = 2.2

/**
 * How much darker than the sea's own deep tint the middle of the channel is.
 *
 * Measured by looking rather than chosen. The sheet is flat and the hillside it
 * runs down is not, so it takes the full hemisphere where the ground either
 * side of it takes a fraction — and it carries none of the soil treatment the
 * terrain material puts on everything else. Painted at the sea's own
 * `deepWater` it came out a *pale* ribbon under this sky, which is the one
 * thing running water is not.
 */
const DEEP = 0.42

/** Metres of channel a streak of surface texture occupies, along and across. */
const STREAK_ALONG  = 1.4
const STREAK_ACROSS = 0.34

/**
 * How hard the beck is locked, given how hard the sea beside it is.
 *
 * Not the same number, and the difference is the whole reason this is a
 * function rather than a uniform copied straight across: a beck is moving water
 * over a shallow gravel bed, and it holds out well past the week the sound
 * shuts. The sea is half frozen before the channel has any ice in it at all,
 * and the beck only goes solid at the very bottom of the year.
 *
 * Derived rather than authored, so there is one winter in the scape — the same
 * `season.freeze` the lake reads. A second knob here would be a second winter
 * to keep in step with the first.
 */
export function beckFreeze (freeze: number): number {
  return smoothstep(0.45, 0.98, freeze)
}

export interface BeckOptions {

  /** The watercourse, in its island's local space. */
  creek: Creek

  /** Metres the sheet stands above the channel floor. */
  depth: number

  /** How much of the channel floor the water covers, 0..1. */
  fill: number

  /** Where the sea takes the channel over, in world height. */
  waterLevel: number

  /**
   * The terrain *as drawn* at a point.
   *
   * Not the height field, and for the reason the cart ruts give: the rendered
   * triangles stand off the continuous ground by tens of centimetres wherever
   * it curves, which is more than this sheet's own depth. Laid on the field
   * instead, most of the beck ends up under the bed it is meant to be running
   * over and comes out as a dashed line.
   */
  surfaceAt(x: number, z: number): number

  /** Wet gravel — what the outer edge of the sheet is painted to hide its seam. */
  bed: Color

  /** Standing water — what the middle of the channel is tinted toward. */
  water: Color
}

/** One island's beck, and the two numbers the survey wants back from it. */
export interface BeckCourse {
  geometry: BufferGeometry

  /** Metres of channel the water actually stands in, spring to tideline. */
  wetted: number

  /** Metres the sheet falls over that reach. */
  fall: number
}

/**
 * The water standing in one island's beck.
 *
 * A ribbon, not a paint pass, and not for the ruts' reason: the channel is
 * already coloured by the terrain painter and could have been made to read wet
 * there. What a painted bed cannot do is stand at a *level*. Water lies flat
 * across the channel and falls along it, and a colour on the terrain's own
 * vertices necessarily follows the V of the cut — which is a wet-looking hollow
 * rather than a stream with a surface in it.
 *
 * So each cross-section is laid at one height, taken from the drawn bed under
 * the centreline and made monotone down the course: the sheet never stands
 * higher than the reach above it, because water does not run uphill and a lip
 * in the drawn grid is an artefact of the grid rather than a weir. Where a lip
 * does buck the trend the sheet is briefly *under* the bed and simply not seen,
 * which is the safe direction for the error to go.
 *
 * The ribbon stops at the tideline. Past that the mouth is dredged below the
 * waterline and the sea's own surface is already drawing it — two surfaces at
 * one level is a z-fight across the whole estuary, and the beck has no business
 * being the one that wins it.
 */
export function beckGeometry (options: BeckOptions): BeckCourse | null {
  const { creek, depth, fill, waterLevel, surfaceAt, bed, water } = options

  if (depth <= 0 || fill <= 0 || creek.points.length < 2)
    return null

  const sections = traceSections(creek.points, STEP)

  if (sections.length < 2)
    return null

  // Monotone by construction: the running minimum of the drawn bed, lifted by
  // the depth. See the note above about which way the error goes.
  let floor = Infinity

  const levels = sections.map(section => {
    floor = Math.min(floor, surfaceAt(section.x, section.z))
    return floor + depth
  })

  // The first cut the sea has taken is kept, so the sheet tucks under the water
  // plane rather than ending on a visible edge above it.
  const end  = levels.findIndex(level => level <= waterLevel)
  const last = end < 0 ? sections.length - 1 : end

  if (last < 1)
    return null

  const weights = ACROSS.map(offset => 1 - smoothstep(0, 1, Math.abs(offset)))
  const target  = new Color()

  const position: number[] = []
  const colors: number[]   = []
  const along: number[]    = []

  for (let index = 0; index <= last; index += 1) {
    const section = sections[index]
    const course  = creek.sampleAt(section.x, section.z).course
    const half    = creek.halfWidthAt(course) * fill
    const span    = index === 0 ? STEP : section.along - sections[index - 1].along

    // The local fall, as a ground gradient. It is what decides where the water
    // breaks white, and it is geometry rather than a uniform because the shape
    // of the bed is not something a slider can move.
    const grade = index === 0 ? 0 : Math.max(0, (levels[index - 1] - levels[index]) / Math.max(0.01, span))

    for (let step = 0; step < ACROSS.length; step += 1) {
      const offset = ACROSS[step] * half

      position.push(
        section.x + section.normalX * offset,
        levels[index],
        section.z + section.normalZ * offset,
      )

      // Deeper toward the mouth as well as toward the middle: the channel is
      // three times as wide down there and carries everything the hill sheds.
      target.copy(bed).lerp(water, weights[step] * (0.58 + 0.42 * course))
      colors.push(target.r, target.g, target.b)
      along.push(offset, section.along, grade)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))

  // Where a fragment sits in the channel's own frame — metres across, metres
  // down the course, and the fall under it. The surface texture is scrolled in
  // that frame rather than in world space, which is what keeps a streak
  // travelling *along* the beck round every bend in it.
  geometry.setAttribute('aBeck', new Float32BufferAttribute(along, 3))
  geometry.setIndex(ribbonIndices(0, last + 1, ACROSS.length))
  geometry.computeVertexNormals()

  return {
    geometry,
    wetted: sections[last].along - sections[0].along,
    fall:   levels[0] - levels[last],
  }
}

const BECK_PARS_VERTEX = /* glsl */ `
attribute vec3 aBeck;
varying vec3 vBeck;
`

const BECK_BEGIN_VERTEX = /* glsl */ `
#include <begin_vertex>
vBeck = aBeck;
`

/**
 * One octave of value noise in the channel's own frame.
 *
 * Cheap on purpose: two hashes and a smoothstep per lobe, no texture fetch and
 * no derivative. The whole point of scrolling in `(across, along)` rather than
 * in world space is that the pattern needs no direction field to follow — the
 * attribute already says which way is downstream.
 */
const BECK_PARS_FRAGMENT = /* glsl */ `
uniform float uBeckTravel;
uniform float uBeckRiffle;
uniform float uBeckFreeze;
uniform vec3  uBeckIce;
uniform vec3  uBeckFoam;
varying vec3  vBeck;

float beckHash (vec2 p) {
  return fract(sin(dot(p, vec2(41.7, 289.3))) * 43758.5453);
}

float beckNoise (vec2 p) {
  vec2 cell = floor(p);
  vec2 f    = fract(p);
  vec2 w    = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(beckHash(cell), beckHash(cell + vec2(1.0, 0.0)), w.x),
    mix(beckHash(cell + vec2(0.0, 1.0)), beckHash(cell + vec2(1.0, 1.0)), w.x),
    w.y);
}
`

/**
 * The surface, and the ice that takes it.
 *
 * `ripples` is the tier's octave count. At zero the whole texture term is left
 * out of the source rather than multiplied by nothing, so the cheapest tier
 * compiles a sheet that lies still and pays for no hash at all.
 */
function beckColorFragment (ripples: number): string {
  const weights = Array.from({ length: ripples }, (_unused, index) => 1 / 2 ** index)

  const octaves = weights
    .map((weight, index) =>
      `streak += beckNoise(channel * ${(2 ** index).toFixed(1)}) * ${weight.toFixed(3)};`)
    .join('\n  ')

  // Normalised by the weights it was summed from, so a tier with three octaves
  // breaks as white as a tier with one rather than nearly twice as white.
  const norm = weights.reduce((sum, weight) => sum + weight, 0)

  const texture = ripples > 0
    ? /* glsl */ `
  vec2 channel = vec2(vBeck.x / ${STREAK_ACROSS.toFixed(3)}, (vBeck.y - uBeckTravel) / ${STREAK_ALONG.toFixed(3)});
  float streak = 0.0;
  ${octaves}
  streak /= ${norm.toFixed(3)};
  float white = clamp(uBeckRiffle * grade * (streak - ${RIFFLE_BREAK.toFixed(2)}) * ${RIFFLE_GAIN.toFixed(1)}, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, uBeckFoam, white);
`
    : ''

  return /* glsl */ `
#include <color_fragment>
float grade = clamp(vBeck.z / ${RIFFLE_GRADE.toFixed(3)}, 0.0, 1.0);
${texture}
diffuseColor.rgb = mix(diffuseColor.rgb, uBeckIce, uBeckFreeze);
`
}

/** The becks of the whole archipelago, as one draw. */
export interface Beck {
  mesh: Mesh

  /** Metres of running water in the archipelago, and the fall over it. */
  wetted: number
  fall:   number

  update(delta: number, season: SeasonState): void
  dispose(): void
}

/**
 * Every island's beck, merged into one mesh with one material.
 *
 * The becks are built in each island's local frame — that is the only frame the
 * creek solver, the height field and the terrain grid agree in — and translated
 * into the world afterwards, exactly the way the terrain patches and the cart
 * ruts are.
 *
 * @returns The water, or `null` when there is none: no depth, or no island in
 *   the archipelago whose ground carries a course.
 */
export function createBeck (
  config:       LiveConfig,
  archipelago:  ArchipelagoSurvey,
  quality:      AtmosphereQuality,
  baseSegments: number,
): Beck | null {
  const scape                    = config()
  const pieces: BufferGeometry[] = []

  let wetted = 0
  let fall   = 0

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

    const course = beckGeometry({
      ...scape.beck,
      creek,
      waterLevel: scape.terrain.waterLevel,
      surfaceAt:  drawnSurfaceOf(landmass.survey.field, landmass.config.terrain.size, segments),
      bed:        new Color(scape.palette.streambed),
      water:      new Color(scape.palette.deepWater).multiplyScalar(DEEP),
    })

    if (!course)
      continue

    course.geometry.translate(landmass.origin.x, 0, landmass.origin.z)
    pieces.push(course.geometry)
    wetted += course.wetted
    fall = Math.max(fall, course.fall)
  }

  if (pieces.length === 0)
    return null

  const geometry = mergeGeometryList(pieces, false)
  for (const piece of pieces)
    piece.dispose()

  geometry.computeBoundingSphere()

  const uniforms: Record<string, IUniform> = {
    uBeckTravel: { value: 0 },
    uBeckRiffle: { value: scape.beck.riffle },
    uBeckFreeze: { value: 0 },
    uBeckIce:    { value: new Color(scape.palette.ice) },
    uBeckFoam:   { value: new Color(scape.palette.foam) },
  }

  // Opaque, and that is a decision rather than an oversight. A transparent
  // sheet lying a hand's breadth over a bed it is exactly the colour of buys
  // nothing a depth tint cannot draw, and it would put a fourth overlapping
  // surface into a stack whose ordering this scape has already been bitten by
  // twice — see `scene/layers.ts`.
  const material = new MeshStandardMaterial({
    name:            'beck-water',
    vertexColors:    true,
    roughness:       0.2,
    metalness:       0.04,
    envMapIntensity: 0.55,
  })

  material.onBeforeCompile = (program: WebGLProgramParametersWithUniforms) => {
    Object.assign(program.uniforms, uniforms)

    program.vertexShader = program.vertexShader
      .replace('#include <common>', `#include <common>\n${BECK_PARS_VERTEX}`)
      .replace('#include <begin_vertex>', BECK_BEGIN_VERTEX)

    program.fragmentShader = program.fragmentShader
      .replace('#include <common>', `#include <common>\n${BECK_PARS_FRAGMENT}`)
      .replace('#include <color_fragment>', beckColorFragment(quality.beckRipples))
  }

  material.customProgramCacheKey = () => `scape-beck:${quality.beckRipples}`

  const mesh = new Mesh(geometry, material)
  mesh.name  = 'beck'

  // It takes the sun and the cloud shadow the ground takes, and casts nothing:
  // a sheet lying in its own channel has nothing to cast onto.
  mesh.receiveShadow = true
  mesh.updateMatrix()
  mesh.matrixAutoUpdate = false

  // Metres of channel the water has run, carried rather than derived from the
  // elapsed clock: the flow answers to the year, and an elapsed time multiplied
  // by a live speed jumps the pattern every time either changes.
  let travel = 0

  return {
    mesh,
    wetted,
    fall,

    update (delta, season) {
      const locked = beckFreeze(season.freeze)
      const beck   = config().beck

      travel += delta * beck.flow * (1 - locked)

      uniforms.uBeckTravel.value = travel
      uniforms.uBeckRiffle.value = beck.riffle * (1 - locked)
      uniforms.uBeckFreeze.value = locked;
      (uniforms.uBeckIce.value as Color).copy(season.iceColor)
    },

    dispose () {
      geometry.dispose()
      material.dispose()
    },
  }
}

// perf: one draw for every beck in the archipelago. About 2.6k vertices in
// total, no texture fetch, and a fragment cost of `quality.beckRipples` value-
// noise lobes over a few hundred pixels of channel.
