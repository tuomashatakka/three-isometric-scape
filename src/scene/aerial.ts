import { ShaderChunk } from 'three'
import { FRAME_VARYING } from './film.ts'


/**
 * Aerial perspective: the haze every fogged material in the scape is drawn
 * through.
 *
 * three's linear fog is a function of camera depth, and the scape's camera is
 * orthographic and high: the whole ground sits inside a narrow band of depth,
 * so the fog was one flat veil over the frame. It greyed the yard at the focus
 * as much as the mountains a kilometre off, and it could not tell a summit from
 * the sea at its foot — the far shore stood at full contrast against a washed
 * sea, and read as a cardboard rim.
 *
 * So the depth is replaced, in three's own fog chunks, by what a viewer at the
 * focus would look through: the ground distance from the point the camera looks
 * at, longer on the far side of it than on the near, and an optical depth that
 * thins with height the way air does. The yard is clear, the far islands go
 * blue-grey, the feet of the far range dissolve while its summits stand out of
 * the haze.
 *
 * The uniforms are three's, re-read: `fogFar` is the extinction length in world
 * metres, and `fogNear` is the ground fog's amount (see {@link groundFog}) — the
 * clear radius around the focus is a constant, compiled in. Nothing in
 * here is frame-sized — a mountain a kilometre away is a kilometre away at
 * every zoom — so a close frame carries no haze and the archipelago frame
 * carries a lot of it, which is what distance does.
 */

/** How much further the far side of the focus is than the near side, 0..1. */
export const AERIAL_SKEW = 0.5

export interface HazeRange {

  /** Metres of clear air around the focus. Compiled into the chunk; not the `fogNear` uniform. */
  near: number

  /** Metres of air that take away 63% of what is behind them, at sea level. */
  far: number
}

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
const CLEAR_RADIUS     = 30

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

/** How much of what is behind it the ground fog takes, 0..1. `amount` is the `fogNear` uniform. */
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

/** The fog uniforms for a density, with the breath applied and clamped. */
export function hazeRange (density: number, breath = 1, maxDensity = 0.94): HazeRange {
  const amount = Math.min(maxDensity, Math.max(0, density * breath))
  const open   = (1 - amount) ** 2

  return { near: CLEAR_RADIUS, far: THICK_EXTINCTION + (CLEAR_EXTINCTION - THICK_EXTINCTION) * open }
}

/**
 * The haze over one point, 0..1 — the function the fragment shader evaluates,
 * kept here so a test can state what it does.
 *
 * `along` is the point's ground offset from the focus projected on the view's
 * ground direction (positive is further away), `across` the rest of it.
 */
export function aerialHaze (along: number, across: number, height: number, range: HazeRange, hazeHeight: number): number {
  const ground = Math.sqrt(along * along + across * across)
  const path   = Math.max(0, ground + AERIAL_SKEW * along - range.near)
  const tau    = path / range.far * Math.exp(-Math.max(0, height) / hazeHeight)

  return 1 - Math.exp(-tau)
}

/** The same haze, per channel — what the fragment mixes each of r, g and b by. */
export function aerialHazeRgb (
  along: number,
  across: number,
  height: number,
  range: HazeRange,
  hazeHeight: number,
): [number, number, number] {
  const tau = -Math.log(1 - aerialHaze(along, across, height, range, hazeHeight))

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
// focus is where the camera's axis meets the sea.
const VERTEX = /* glsl */`
#ifdef USE_FOG
  {
    vec3 aerialWorld   = ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix );
    vec3 aerialForward = -vec3( viewMatrix[ 0 ][ 2 ], viewMatrix[ 1 ][ 2 ], viewMatrix[ 2 ][ 2 ] );
    float aerialReach  = -cameraPosition.y / min( aerialForward.y, -1e-3 );
    vec2 aerialFocus   = cameraPosition.xz + aerialForward.xz * aerialReach;
    vec2 aerialAhead   = normalize( aerialForward.xz + vec2( 1e-6, 0.0 ) );
    vec2 aerialOffset  = aerialWorld.xz - aerialFocus;
    vec2 bankBroad     = aerialWorld.xz * ${glsl(BANK_WAVES[0])} + vec2( 1.7, 1.3 ) * sin( aerialWorld.zx * ${glsl(BANK_WAVES[1])} );
    vec2 bankFine      = vec2( dot( aerialWorld.xz, vec2( ${glsl(BANK_WAVES[2])}, ${glsl(BANK_WAVES[3])} ) ), dot( aerialWorld.xz, vec2( ${glsl(-BANK_WAVES[3])}, ${glsl(BANK_WAVES[2])} ) ) );
    float bankField    = 0.5 + 0.22 * ( sin( bankBroad.x ) + sin( bankBroad.y ) ) + 0.16 * sin( bankFine.x ) * sin( bankFine.y );
    ${FRAME_VARYING} = gl_Position.xyw;
    vAerial = vec4( length( aerialOffset ), dot( aerialOffset, aerialAhead ), aerialWorld.y, 0.12 + 0.88 * smoothstep( 0.18, 0.82, bankField ) );
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
const FRAGMENT = (hazeHeight: number, waterLevel: number) => /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float aerialTau = fogDensity * fogDensity * vAerial.x * vAerial.x;
  #else
    float aerialPath = max( 0.0, vAerial.x + ${AERIAL_SKEW.toFixed(3)} * vAerial.y - ${glsl(CLEAR_RADIUS)} );
    float aerialTau  = aerialPath / fogFar * exp( - max( vAerial.z, 0.0 ) / ${hazeHeight.toFixed(3)} );
    if ( fogNear > 0.0 ) {
      float fogAbove = max( vAerial.z - ${glsl(waterLevel)}, 0.0 );
      float fogTau   = fogNear * vAerial.w * ( 1.0 - exp( - fogAbove / ${glsl(GROUND_FOG_FOOT)} ) ) * exp( - fogAbove / ${glsl(GROUND_FOG_HEIGHT)} );
      vec3 fogBank   = mix( fogColor, vec3( 1.0 ), ${glsl(GROUND_FOG_WHITEN)} * dot( fogColor, vec3( 0.2126, 0.7152, 0.0722 ) ) );
      gl_FragColor.rgb = mix( gl_FragColor.rgb, fogBank, 1.0 - exp( - fogTau ) );
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
export function installAerialPerspective (hazeHeight: number, waterLevel = 0): void {
  ShaderChunk.fog_pars_vertex   = PARS_VERTEX
  ShaderChunk.fog_vertex        = VERTEX
  ShaderChunk.fog_pars_fragment = PARS_FRAGMENT
  ShaderChunk.fog_fragment      = FRAGMENT(Math.max(1, hazeHeight), waterLevel)
}
