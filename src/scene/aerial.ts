import { ShaderChunk } from 'three'


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
 * The uniforms are three's, re-read: `fogNear` is the clear radius around the
 * focus and `fogFar` the extinction length, both in world metres. Nothing in
 * here is frame-sized — a mountain a kilometre away is a kilometre away at
 * every zoom — so a close frame carries no haze and the archipelago frame
 * carries a lot of it, which is what distance does.
 */

/** How much further the far side of the focus is than the near side, 0..1. */
export const AERIAL_SKEW = 0.5

export interface HazeRange {

  /** Metres of clear air around the focus. */
  near: number

  /** Metres of air that take away 63% of what is behind them, at sea level. */
  far: number
}

/** Extinction length at zero and at full density, metres. */
const CLEAR_EXTINCTION = 1800
const THICK_EXTINCTION = 240
const CLEAR_RADIUS     = 30

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

const PARS_VERTEX = /* glsl */`
#ifdef USE_FOG
  varying vec3 vAerial;
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
    vAerial = vec3( length( aerialOffset ), dot( aerialOffset, aerialAhead ), aerialWorld.y );
  }
#endif
`

const PARS_FRAGMENT = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying vec3 vAerial;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`

const FRAGMENT = (hazeHeight: number) => /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vAerial.x * vAerial.x );
  #else
    float aerialPath = max( 0.0, vAerial.x + ${AERIAL_SKEW.toFixed(3)} * vAerial.y - fogNear );
    float fogFactor  = 1.0 - exp( - aerialPath / fogFar * exp( - max( vAerial.z, 0.0 ) / ${hazeHeight.toFixed(3)} ) );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`

/**
 * Swap three's fog chunks for the aerial ones. Global, because the fog is: it
 * must run before the first program compiles, and every scape on the page shares
 * one haze height (the last one installed).
 */
export function installAerialPerspective (hazeHeight: number): void {
  ShaderChunk.fog_pars_vertex   = PARS_VERTEX
  ShaderChunk.fog_vertex        = VERTEX
  ShaderChunk.fog_pars_fragment = PARS_FRAGMENT
  ShaderChunk.fog_fragment      = FRAGMENT(Math.max(1, hazeHeight))
}
