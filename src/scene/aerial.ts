import { ShaderChunk } from 'three'
import { FRAME_VARYING } from './film.ts'
import { EYE_DISTANCE } from './frame.ts'
import { HAAR_DENSITY, HAAR_LANE } from './haar.ts'


/**
 * Aerial perspective: the haze every fogged material in the scape is drawn
 * through.
 *
 * three's linear fog is a function of camera depth, and the scape's camera is
 * orthographic and high: the whole ground sits inside a narrow band of depth,
 * so the fog was one flat veil over the frame.
 *
 * It was then replaced by the ground distance from the focus, as if a viewer
 * stood at the frame's centre and looked out. That reads at the yard, where
 * the far shore is out of the frame, and it is wrong at every frame that shows
 * the archipelago: a camera over the sound looks *down* through the air, and a
 * ring keyed on the focus drew a clear spotlight in the middle of the frame
 * and a milky rim around it — the frame read as a lit table, not as a coast
 * seen from the air.
 *
 * So the haze is the air between the fragment and the eye. The eye is the one
 * the water already uses (`EYE_DISTANCE` frame widths back along the camera's
 * axis, see `frame.ts`): a wide frame is a camera far away and high, a close
 * one is a camera on the hill. The optical depth is the path through an
 * atmosphere whose density falls off with height (`atmosphere.hazeHeight`), so
 * the frame takes a near-even veil that deepens toward its far edge, a summit
 * stands out of the haze its foot is in, and the yard — a camera metres away —
 * is clear without a radius compiled in to make it so.
 *
 * The uniforms are three's, re-read: `fogFar` is the extinction length in whole
 * world metres with the sea smoke in its fraction (see {@link packFogFar}), and
 * `fogNear` is the ground fog's amount with the night bank in its fraction
 * (see {@link packFogNear}).
 */

/**
 * How much more of each channel a metre of air takes, relative to the grey
 * extinction `fogFar` names: red, green, blue.
 *
 * Air scatters short wavelengths out of a ray before long ones — Rayleigh goes
 * as one over the fourth power, and the salt haze over a coast is grey Mie
 * scattering that does not care — so a coast's air is part of each. A single
 * grey factor turned every far island and the whole open sea toward one olive
 * veil; with the blue taken out first, a dark sea and a far shore go to the
 * blue-grey of distance before they go to the horizon's colour, and a sunlit
 * strand keeps its warmth longer. Weighted so its luminance (rec. 709) is one,
 * which is what keeps every frame exactly as bright as the grey haze left it —
 * this moves the hue of distance and not the amount of it.
 */
export const AIR_SPECTRUM = [ 0.85, 1, 1.4 ] as const

/** Extinction length at zero and at full density, metres. */
const CLEAR_EXTINCTION = 1800
const THICK_EXTINCTION = 240

/**
 * The fog on the low ground — the second thing the fog chunk paints.
 *
 * Ground mist was a stack of world-sized transparent sheets: every one a
 * full-frame blend on every tier, cut by a baked mask, and flat — a sheet has no
 * idea a roof stands above it. It is a function of the fragment now. Radiation
 * fog is cold air that has run downhill and stopped, so its density is a profile
 * in height above the waterline: nothing on the water itself (the sea is warmer
 * than the night air, which is why the bank stops at the shore), thickest a
 * metre up the strand, and thinning by e every {@link GROUND_FOG_HEIGHT} metres
 * above that. A house stands with its sill in it and its ridge out; a slope
 * climbs out of it; a summit never knew it was there.
 *
 * It lies in banks rather than as one veil — {@link groundFogBank}, a field in
 * world metres evaluated per vertex — and it is grey: droplets scatter every
 * wavelength alike, so it does not go through {@link AIR_SPECTRUM}.
 *
 * The amount arrives in `fogNear`. The clear radius that uniform used to carry
 * never moved, so it is compiled in and the uniform is free: every fogged
 * program in the scape already has it, which is how a term reaches every
 * material on every tier without one `onBeforeCompile`.
 */
export const GROUND_FOG_HEIGHT = 2.6

/** Metres above the waterline over which the fog builds from nothing. */
export const GROUND_FOG_FOOT = 0.45

/** Optical depth of the thickest bank at `atmosphere.mistAmount` one. */
export const GROUND_FOG_DEPTH = 3

/** How far toward white the fog stands from the horizon's colour, at a bright sky. */
const GROUND_FOG_WHITEN = 0.3

/** The bank field's two wavelengths, as radians a metre: banks, and the wisps in them. */
const BANK_WAVES = [ 0.043, 0.029, 0.151, 0.117 ] as const

/**
 * How much of the fog stands over a point of the map, 0..1 — the vertex
 * shader's field. Two warped sines: banks a hundred and fifty metres across
 * with forty-metre wisps in them. No texture, no uniform, no clock.
 */
export function groundFogBank (x: number, z: number): number {
  const [ a, b, c, d ] = BANK_WAVES
  const broad          = Math.sin(x * a + 1.7 * Math.sin(z * b)) + Math.sin(z * a + 1.3 * Math.sin(x * b))
  const fine           = Math.sin(x * c + z * d) * Math.sin(z * c - x * d)
  const field          = 0.5 + 0.22 * broad + 0.16 * fine
  const t              = Math.min(1, Math.max(0, (field - 0.18) / 0.64))

  return 0.12 + 0.88 * t * t * (3 - 2 * t)
}

/** The fog's density profile over height above the waterline, 0..~0.7. */
export function groundFogProfile (above: number): number {
  const h = Math.max(0, above)

  return (1 - Math.exp(-h / GROUND_FOG_FOOT)) * Math.exp(-h / GROUND_FOG_HEIGHT)
}

/** How much of what is behind it the ground fog takes, 0..1. `amount` is the ground half of `fogNear` (see `unpackFogNear`). */
export function groundFog (above: number, amount: number, bank = 1): number {
  return 1 - Math.exp(-amount * bank * groundFogProfile(above))
}

/** How much thicker the fog lies with the sun down than at noon: it is the night's cold air, and the day burns it off. */
export const GROUND_FOG_NIGHT = 0.8

/**
 * The `fogNear` uniform for a mist density: the optical depth of the thickest
 * bank. `day` is the daylight's own 0..1, so the same `atmosphere.mistAmount`
 * is a dawn with the strand gone and a noon with a trace in the hollows.
 */
export function groundFogAmount (mist: number, breath = 1, day = 1): number {
  const night = 1 - Math.min(1, Math.max(0, day))

  return Math.max(0, mist * breath) * GROUND_FOG_DEPTH * (1 + GROUND_FOG_NIGHT * night)
}

/**
 * Sea smoke — the fog chunk's third term, and the reverse of the ground fog.
 *
 * In the weeks the sea is still open under a winter sky the water is warmer
 * than the air, and it steams: a layer a metre or two deep lying *on* the
 * water, densest at the surface, where the ground fog has nothing at all. It
 * was a stack of world-sized transparent sheets cut by a baked offshore mask;
 * it is a profile in height above the waterline now, in every fogged program,
 * with the same banks the ground fog lies in. Whiter than the mist, because it
 * is water that has just condensed out of the air standing on it.
 */
export const SEA_SMOKE_HEIGHT = 1.1

/** Optical depth of the steam on the water at full smoke. */
export const SEA_SMOKE_DEPTH = 1.7

/** How far toward white the steam stands from the fog's colour, under a bright sky (it is unlit, so a dark one keeps it dark). */
const SEA_SMOKE_WHITEN = 0.62

/**
 * The steam per unit of `atmosphere.mistAmount`: one knob for the fog on the
 * ground, whichever surface it is lying on. The authored mist (0.34) steams at
 * the 0.9 the retired `season.seaSmoke` knob held.
 */
export const SEA_SMOKE_PER_MIST = 2.65

/** The sea smoke amount for a week's open water (`seaSmokeAmount`) and a mist density, 0..1. */
export function seaSmokeShare (week: number, mist: number): number {
  return Math.max(0, week) * Math.min(1, Math.max(0, mist) * SEA_SMOKE_PER_MIST)
}

/** How much of what is behind it the sea smoke takes, 0..1. `smoke` is the unpacked amount. */
export function seaSmoke (above: number, smoke: number, bank = 1): number {
  return 1 - Math.exp(-smoke * SEA_SMOKE_DEPTH * bank * Math.exp(-Math.max(0, above) / SEA_SMOKE_HEIGHT))
}

/**
 * `fogFar` carries the extinction length in whole metres and the sea smoke in
 * its fraction: the uniform is the only free channel every fogged program has
 * left, and a metre of extinction length is far below anything the eye reads.
 */
export function packFogFar (far: number, smoke: number): number {
  return Math.round(far) + Math.min(0.99, Math.max(0, smoke))
}

/** The two numbers `fogFar` carries. */
export interface FogFar {
  far:   number
  smoke: number
}

/** The inverse of {@link packFogFar} — what the fragment does with the uniform. */
export function unpackFogFar (packed: number): FogFar {
  const far = Math.floor(packed)

  return { far, smoke: packed - far }
}

/**
 * Steps of ground fog optical depth per unit of `fogNear`'s whole part. The
 * ground fog's amount is quantised to a sixty-fourth, far under what the eye
 * reads, so the fraction is free for the haar's.
 */
export const FOG_NEAR_STEPS = 64

/**
 * `fogNear` carries the ground fog's optical depth in its whole part and the
 * night bank (the haar) in its fraction — the way `fogFar` carries the sea
 * smoke. Two fogs, one uniform every fogged program already has.
 */
export function packFogNear (ground: number, haar: number): number {
  return Math.round(Math.max(0, ground) * FOG_NEAR_STEPS) + Math.min(0.99, Math.max(0, haar))
}

/** The two numbers `fogNear` carries. */
export interface FogNear {
  ground: number
  haar:   number
}

/** The inverse of {@link packFogNear}. */
export function unpackFogNear (packed: number): FogNear {
  const whole = Math.floor(packed)

  return { ground: whole / FOG_NEAR_STEPS, haar: packed - whole }
}

/** The mist at which the haze is exactly `atmosphere.fogDensity`: the opening config's. */
export const AIR_MIST = 0.34

/**
 * The haze the air carries, given its density at an ordinary day and the mist.
 *
 * The haze and the mist were two rows; they are one air — a damp day is hazy
 * as well as misty, a dry one clear to the far shore — so the mist row turns
 * both: half the haze with no mist at all, the authored density at
 * {@link AIR_MIST}, and twice it in a full bank. `atmosphere.fogDensity` stays
 * a config leaf for \`--set\` and the url.
 */
export function airHaze (density: number, mist: number): number {
  return density * (0.5 + 0.5 * Math.max(0, mist) / AIR_MIST)
}

/** The extinction length (metres of sea-level air that take 63 %) for a density, with the breath applied and clamped. */
export function hazeExtinction (density: number, breath = 1, maxDensity = 0.94): number {
  const amount = Math.min(maxDensity, Math.max(0, density * breath))
  const open   = (1 - amount) ** 2

  return THICK_EXTINCTION + (CLEAR_EXTINCTION - THICK_EXTINCTION) * open
}

type Point = readonly [number, number, number]

/**
 * Where the eye stands for an orthographic frame `frame` metres wide whose axis
 * (`forward`, unit, pointing down) meets the sea at `focus`.
 */
export function aerialEye (focus: Point, forward: Point, frame: number): Point {
  const back = EYE_DISTANCE * frame

  return [ focus[0] - forward[0] * back, focus[1] - forward[1] * back, focus[2] - forward[2] * back ]
}

/**
 * The air between a point and the eye, in metres of sea-level air: the path's
 * length times the mean of a density that falls off as `exp(-height / scale)`.
 * The glsl's twin.
 */
export function airColumn (point: Point, eye: Point, scale: number): number {
  const length = Math.hypot(eye[0] - point[0], eye[1] - point[1], eye[2] - point[2])
  const low    = Math.max(0, point[1])
  const high   = Math.max(0, eye[1])
  const rise   = high - low
  const thin   = Math.abs(rise) < 1
    ? Math.exp(-low / scale)
    : scale * (Math.exp(-low / scale) - Math.exp(-high / scale)) / rise

  return length * thin
}

/** The haze over one point, 0..1, for its air column and an extinction length. */
export function aerialHaze (column: number, extinction: number): number {
  return 1 - Math.exp(-Math.max(0, column) / extinction)
}

/** The same haze, per channel — what the fragment mixes each of r, g and b by. */
export function aerialHazeRgb (column: number, extinction: number): [number, number, number] {
  const tau = Math.max(0, column) / extinction

  return AIR_SPECTRUM.map(k => 1 - Math.exp(-tau * k)) as [number, number, number]
}

const AIR_SPECTRUM_GLSL = `vec3( ${AIR_SPECTRUM.map(k => k.toFixed(3)).join(', ')} )`

const glsl = (value: number): string => value.toFixed(4)

const PARS_VERTEX = /* glsl */`
#ifdef USE_FOG
  varying vec4 vAerial;
  varying vec3 ${FRAME_VARYING};
#endif
`

// The world position is recovered from the view position through the view
// matrix's transpose (it is rigid), which works for instanced, skinned and plain
// meshes alike — every program that fogs has `mvPosition` by this point. The
// focus is where the camera's axis meets the sea; an orthographic camera's eye
// stands `EYE_DISTANCE` frame widths back from it (a perspective one is where it
// is). `vAerial.x` is the air column (see `airColumn`), per vertex: the eye is
// hundreds of frame-metres off, so the column is near linear across a triangle.
const VERTEX = (hazeHeight: number) => /* glsl */`
#ifdef USE_FOG
  {
    vec3 aerialWorld   = ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix );
    vec3 aerialForward = -vec3( viewMatrix[ 0 ][ 2 ], viewMatrix[ 1 ][ 2 ], viewMatrix[ 2 ][ 2 ] );
    float aerialReach  = -cameraPosition.y / min( aerialForward.y, -1e-3 );
    float aerialFrame  = 2.0 / max( projectionMatrix[ 0 ][ 0 ], 1e-6 );
    vec3 aerialEye     = projectionMatrix[ 2 ][ 3 ] == 0.0
      ? cameraPosition + aerialForward * ( aerialReach - ${EYE_DISTANCE.toFixed(3)} * aerialFrame )
      : cameraPosition;
    float aerialLow    = max( aerialWorld.y, 0.0 );
    float aerialRise   = max( aerialEye.y, 0.0 ) - aerialLow;
    float aerialThin   = abs( aerialRise ) < 1.0
      ? exp( - aerialLow / ${hazeHeight.toFixed(3)} )
      : ${hazeHeight.toFixed(3)} * ( exp( - aerialLow / ${hazeHeight.toFixed(3)} ) - exp( - max( aerialEye.y, 0.0 ) / ${hazeHeight.toFixed(3)} ) ) / aerialRise;
    vec2 bankBroad     = aerialWorld.xz * ${glsl(BANK_WAVES[0])} + vec2( 1.7, 1.3 ) * sin( aerialWorld.zx * ${glsl(BANK_WAVES[1])} );
    vec2 bankFine      = vec2( dot( aerialWorld.xz, vec2( ${glsl(BANK_WAVES[2])}, ${glsl(BANK_WAVES[3])} ) ), dot( aerialWorld.xz, vec2( ${glsl(-BANK_WAVES[3])}, ${glsl(BANK_WAVES[2])} ) ) );
    float bankField    = 0.5 + 0.22 * ( sin( bankBroad.x ) + sin( bankBroad.y ) ) + 0.16 * sin( bankFine.x ) * sin( bankFine.y );
    ${FRAME_VARYING} = gl_Position.xyw;
    vAerial = vec4( distance( aerialEye, aerialWorld ) * aerialThin, 0.0, aerialWorld.y, 0.12 + 0.88 * smoothstep( 0.18, 0.82, bankField ) );
  }
#endif
`

const PARS_FRAGMENT = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying vec4 vAerial;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`

// The ground fog first, because it is at the surface and the air is between it
// and the eye: the haze of distance then takes the fog bank with the hill.
/** Where the night bank stands, compiled into the chunk: its ceiling in world metres and the band under it. */
export interface HaarBand {
  ceiling: number
  depth:   number
}

const FRAGMENT = (waterLevel: number, haar: HaarBand) => /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float aerialTau = fogDensity * fogDensity * vAerial.x * vAerial.x;
  #else
    float aerialFar  = floor( fogFar );
    float aerialTau  = vAerial.x / aerialFar;
    float fogAbove   = max( vAerial.z - ${glsl(waterLevel)}, 0.0 );
    float fogLuma    = dot( fogColor, vec3( 0.2126, 0.7152, 0.0722 ) );
    float fogGround = floor( fogNear );
    float haarAmount = fogNear - fogGround;
    if ( haarAmount > 0.004 ) {
      float haarColumn = clamp( ${glsl(haar.ceiling)} - vAerial.z, 0.0, ${glsl(Math.max(0, haar.depth))} );
      float haarTau    = haarAmount * ${glsl(HAAR_DENSITY)} * ( ${glsl(HAAR_LANE)} + ${glsl(1 - HAAR_LANE)} * vAerial.w ) * haarColumn;
      vec3 haarTone    = mix( fogColor, vec3( 1.0 ), clamp( 0.14 + 0.6 * fogLuma, 0.0, 1.0 ) );
      gl_FragColor.rgb = mix( gl_FragColor.rgb, haarTone, 1.0 - exp( - haarTau ) );
    }
    if ( fogGround > 0.0 ) {
      float fogTau   = fogGround * ${glsl(1 / FOG_NEAR_STEPS)} * vAerial.w * ( 1.0 - exp( - fogAbove / ${glsl(GROUND_FOG_FOOT)} ) ) * exp( - fogAbove / ${glsl(GROUND_FOG_HEIGHT)} );
      vec3 fogBank   = mix( fogColor, vec3( 1.0 ), ${glsl(GROUND_FOG_WHITEN)} * fogLuma );
      gl_FragColor.rgb = mix( gl_FragColor.rgb, fogBank, 1.0 - exp( - fogTau ) );
    }
    float smokeAmount = fogFar - aerialFar;
    if ( smokeAmount > 0.004 ) {
      float smokeTau = smokeAmount * ${glsl(SEA_SMOKE_DEPTH)} * vAerial.w * exp( - fogAbove / ${glsl(SEA_SMOKE_HEIGHT)} );
      vec3 smokeTone = mix( fogColor, vec3( 1.0 ), ${glsl(SEA_SMOKE_WHITEN)} * min( 1.0, 2.0 * fogLuma ) );
      gl_FragColor.rgb = mix( gl_FragColor.rgb, smokeTone, 1.0 - exp( - smokeTau ) );
    }
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, 1.0 - exp( - aerialTau * ${AIR_SPECTRUM_GLSL} ) );
#endif
`

/**
 * Swap three's fog chunks for the aerial ones. Global, because the fog is: it
 * must run before the first program compiles, and every scape on the page shares
 * one haze height (the last one installed).
 */
export function installAerialPerspective (hazeHeight: number, waterLevel = 0, haar: HaarBand = { ceiling: waterLevel, depth: 0 }): void {
  ShaderChunk.fog_pars_vertex   = PARS_VERTEX
  ShaderChunk.fog_vertex        = VERTEX(Math.max(1, hazeHeight))
  ShaderChunk.fog_pars_fragment = PARS_FRAGMENT
  ShaderChunk.fog_fragment      = FRAGMENT(waterLevel, haar)
}
