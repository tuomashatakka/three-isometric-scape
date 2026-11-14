import { ShaderChunk } from 'three'

/**
 * The sky as a light, in every lit program.
 *
 * three's hemisphere light is two colours mixed by how far a normal tips toward
 * the zenith: every wall gets the same half-and-half grey whichever way it
 * faces, and a wall is lit as brightly by the ground under it as by the bright
 * band of horizon in front of it. A photograph of a coast says otherwise in
 * two ways, and both are functions of the normal alone, so they ride the
 * hemisphere term every material already evaluates — no uniform, no program,
 * no draw, on every tier:
 *
 * - **the horizon band.** The sky's brightest ring under overcast and under
 *   haze is the one a wall looks straight into. A face loses its share of the
 *   dark ground to it in proportion to how upright it is (`HORIZON_BAND`), at
 *   the sky's own luminance and half its chroma — so walls, boulder flanks and
 *   tree trunks open up, and a roof and a field do not move.
 * - **the aspect.** Under a sun, the sky beside it is brighter and warmer than
 *   the sky behind you. An upright face turned toward the key light gains up to
 *   `ASPECT_GAIN` of its sky light, leaning to the key's hue; one turned away
 *   loses as much, leaning to the sky's own blue. The lean is weighted by the
 *   key's share of the light (`keyShare`), so under a full overcast the sky is
 *   one colour all round, as it is.
 *
 * The key light is `directionalLights[0]`: the sun is the rig's first
 * directional light and the only one that casts, which three sorts first.
 */
export const HORIZON_BAND = 0.42
export const ASPECT_GAIN  = 0.34
export const ASPECT_LEAN  = 0.4

const LUMA = 'vec3( 0.2126, 0.7152, 0.0722 )'

/** three's own hemisphere function, whatever its whitespace. */
const STOCK = /vec3 getHemisphereLightIrradiance\([\s\S]*?return irradiance;\s*\}/

const KEY_TERMS = `
    #if NUM_DIR_LIGHTS > 0
      vec3 keyDir   = directionalLights[ 0 ].direction;
      vec3 keyColor = directionalLights[ 0 ].color;
      vec3 keyFlat  = keyDir - up * dot( keyDir, up );
      float keyLen  = length( keyFlat );
      float aspect  = keyLen > 1e-3 ? dot( normal - up * dotNL, keyFlat / keyLen ) : 0.0;
      float keyLuma = dot( keyColor, ${LUMA} );
      float share   = keyLuma / ( keyLuma + 3.14159 * skyLuma + 1e-4 );
      float lean    = aspect * share;
      vec3 keyHue   = keyColor / max( keyLuma, 1e-4 );
      vec3 tint     = lean > 0.0
        ? mix( vec3( 1.0 ), keyHue, ${ASPECT_LEAN.toFixed(3)} * lean )
        : mix( vec3( 1.0 ), skyHue, ${ASPECT_LEAN.toFixed(3)} * -lean );
      skyLight *= tint * ( 1.0 + ${ASPECT_GAIN.toFixed(3)} * lean );
    #endif`

const SKY_LIGHT = `vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {

    vec3 up        = hemiLight.direction;
    float dotNL    = dot( normal, up );
    float skyLuma  = dot( hemiLight.skyColor, ${LUMA} );
    vec3 skyHue    = hemiLight.skyColor / max( skyLuma, 1e-4 );
    vec3 horizon   = mix( vec3( skyLuma ), hemiLight.skyColor, 0.5 );
    float upright  = 1.0 - dotNL * dotNL;
    vec3 skyLight  = mix( hemiLight.skyColor, horizon, upright );
    float skyShare = 0.5 * dotNL + 0.5;
    skyShare      += ( 1.0 - skyShare ) * ${HORIZON_BAND.toFixed(3)} * upright;
    ${KEY_TERMS}
    return mix( hemiLight.groundColor, skyLight, skyShare );

  }`

/** Whether three's light chunk carries the sky light yet. */
export function skyLightInstalled (): boolean {
  return ShaderChunk.lights_pars_begin.includes('skyShare')
}

/**
 * Put the sky light into three's light chunk. Global, because the chunk is, and
 * idempotent; it must run before the first program compiles.
 */
export function installSkyLight (): void {
  if (!skyLightInstalled())
    ShaderChunk.lights_pars_begin = ShaderChunk.lights_pars_begin.replace(STOCK, SKY_LIGHT)
}

/**
 * The share of the ground's light an upright face trades for the horizon's —
 * the same arithmetic as the glsl, for tests and for the readme's numbers.
 */
export function skyShare (up: number): number {
  const base = 0.5 * up + 0.5
  return base + (1 - base) * HORIZON_BAND * (1 - up * up)
}

// perf: ~30 scalar operations per fragment in the hemisphere term every lit
// program already evaluates; no uniform, no varying, no texture, no program.
