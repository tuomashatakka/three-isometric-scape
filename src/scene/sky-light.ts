import { ShaderChunk } from 'three'
import type { Material } from 'three'

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

/**
 * The sky as a mirror, in every standard program.
 *
 * With no environment map three's indirect specular is black: a wet slate, the
 * chapel's paint and a polished boulder reflect nothing, and at a grazing angle
 * every surface goes as dull as felt. The sky it should reflect is the same
 * hemisphere the diffuse term already reads, so the radiance along the
 * reflected ray is that function's irradiance over pi (a uniform sky's
 * irradiance is pi times its radiance) — horizon band, aspect and all. The ray
 * leans to the normal with roughness the way three's own IBL lookup does, so a
 * rough field takes the sky over its normal and a smooth stone takes the sky
 * behind the viewer; three's `EnvironmentBRDF` then weighs it by fresnel and
 * roughness. A material scales its share with a `SKY_GLOSS` define (water,
 * which carries its own mirror, takes a fraction).
 *
 * This replaced the PMREM room environment the desktop tiers baked: a studio
 * interior, which every surface on a coast was mirroring.
 */
export const SKY_MIRROR = /* glsl */ `
#if defined( RE_IndirectSpecular ) && !defined( USE_ENVMAP ) && NUM_HEMI_LIGHTS > 0
  {
    #ifndef SKY_GLOSS
      #define SKY_GLOSS 1.0
    #endif
    vec3 skyRay  = reflect( - geometryViewDir, geometryNormal );
    float rough4 = pow4( material.roughness );
    skyRay       = normalize( mix( skyRay, geometryNormal, rough4 ) );
    radiance    += float( SKY_GLOSS ) * RECIPROCAL_PI * getHemisphereLightIrradiance( hemisphereLights[ 0 ], skyRay );
  }
#endif
`

/** Give a standard material `share` of the sky mirror; returns it. */
export function skyGloss<M extends Material> (material: M, share: number): M {
  material.defines = { ...material.defines, SKY_GLOSS: share.toFixed(2) }
  return material
}

/** Whether three's light chunks carry the sky light and mirror yet. */
export function skyLightInstalled (): boolean {
  return ShaderChunk.lights_pars_begin.includes('skyShare') && ShaderChunk.lights_fragment_maps.includes('skyRay')
}

/**
 * Put the sky light into three's light chunk and the sky mirror after its
 * environment lookup. Global, because the chunks are, and idempotent; it must
 * run before the first program compiles.
 */
export function installSkyLight (): void {
  if (!ShaderChunk.lights_pars_begin.includes('skyShare'))
    ShaderChunk.lights_pars_begin = ShaderChunk.lights_pars_begin.replace(STOCK, SKY_LIGHT)
  if (!ShaderChunk.lights_fragment_maps.includes('skyRay'))
    ShaderChunk.lights_fragment_maps += SKY_MIRROR
}

/**
 * Where the mirror looks: the reflected ray leaned to the normal by roughness
 * to the fourth, as three's IBL does — the same arithmetic as the glsl.
 */
export function skyRay (view: readonly [number, number, number], normal: readonly [number, number, number], roughness: number): [number, number, number] {
  const d = view[0] * normal[0] + view[1] * normal[1] + view[2] * normal[2]
  const r = [ 2 * d * normal[0] - view[0], 2 * d * normal[1] - view[1], 2 * d * normal[2] - view[2] ]
  const t = roughness ** 4
  const m = r.map((c, i) => c + (normal[i] - c) * t)
  const l = Math.sqrt(m[0] * m[0] + m[1] * m[1] + m[2] * m[2]) || 1
  return [ m[0] / l, m[1] / l, m[2] / l ]
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
// program already evaluates, and the same again for the mirror in standard
// programs; no uniform, no varying, no texture, no program.
