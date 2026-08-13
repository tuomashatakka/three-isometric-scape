import { RepeatWrapping, Vector2 } from 'three'
import type { IUniform, MeshStandardMaterial, Texture, WebGLProgramParametersWithUniforms } from 'three'
import { createSeamlessNoiseTexture, kitMaterial, markShared } from 'threejs-scene/modules/assets'
import type { ScapeConfig } from '../config.ts'

/** The two materials every solid thing in the scape draws with. */
export interface ScapeMaterials {

  /** Terrain, buildings, stone, anything that does not move. */
  ground: MeshStandardMaterial

  /** Instanced vegetation — same look, plus a vertex sway. */
  foliage: MeshStandardMaterial

  /** Advance cloud drift and wind phase. Allocation-free. */
  update(elapsed: number): void
  dispose(): void
}

const CLOUD_SIZE  = 256
const DETAIL_SIZE = 256

/**
 * World-space cloud shadow, injected into a stock `MeshStandardMaterial`.
 *
 * Darkening the albedo before lighting is not physically a shadow, but at this
 * scale it reads as one for the cost of a single texture fetch — and unlike a
 * real shadow caster it costs nothing per light and never aliases.
 *
 * Two floats, not three, and on a strict diet for a reason. A PowerVR D-Series
 * handset reports `MAX_VARYING_COMPONENTS` of 60 — 15 vec4, the bare minimum
 * GLES 3.0 permits, against 120 on a desktop. A stock `MeshStandardMaterial`
 * with shadows, fog and instancing already sits close to that ceiling, because
 * every shadow coordinate is a whole vec4. Anything this file adds is spent out
 * of what is left, and when it runs out the driver declines to link with
 * `Could not pack varying v15` — after which three binds the unlinked program
 * regardless, every draw raises INVALID_OPERATION, and ANGLE takes the context
 * away. That is the entire mechanism behind a scape that displayed correctly and
 * then died a few seconds later, and it took four device logs to see it.
 *
 * So the ground plane is carried as `xz` alone, because the fragment side never
 * reads `y`, and the surface normal as its `y` alone, because the only thing
 * that reads it wants to know how horizontal the surface is. Six components
 * become three, and foliage — which reads no normal at all — spends two.
 */
const CLOUD_PARS_VERTEX = /* glsl */`
  varying vec2 vScapeGround;
`

const CLOUD_WORLD_VERTEX = /* glsl */`
  #include <project_vertex>
  vec4 scapeLocal = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    scapeLocal = instanceMatrix * scapeLocal;
  #endif
  vScapeGround = (modelMatrix * scapeLocal).xz;
`

const CLOUD_PARS_FRAGMENT = /* glsl */`
  uniform sampler2D uCloudMap;
  uniform vec2 uCloudOffset;
  uniform float uCloudScale;
  uniform float uCloudStrength;
  varying vec2 vScapeGround;
`

const CLOUD_FRAGMENT = /* glsl */`
  #include <color_fragment>
  float scapeCloud = texture2D(uCloudMap, vScapeGround * uCloudScale + uCloudOffset).r;
  diffuseColor.rgb *= mix(1.0, 0.52 + 0.48 * scapeCloud, uCloudStrength);
`

/**
 * The surface normal's `y`, and only where something reads it.
 *
 * Emitted with the ground detail rather than with the cloud shadow, because the
 * detail pass is the only reader and foliage never receives it — a varying that
 * is written and declared but never read still occupies a slot on drivers that
 * pack before they eliminate, which is exactly the driver that failed here.
 */
const DETAIL_PARS_VERTEX = /* glsl */`
  varying float vScapeUp;
`

const DETAIL_WORLD_VERTEX = /* glsl */`
  vec3 scapeNormal = objectNormal;
  #ifdef USE_INSTANCING
    scapeNormal = mat3(instanceMatrix) * scapeNormal;
  #endif
  vScapeUp = normalize(mat3(modelMatrix) * scapeNormal).y;
`

/**
 * Per-instance foliage sway. The phase is derived from the instance's own world
 * translation so a field of grass never pulses in unison, and the amplitude is
 * weighted by local height so trunks stay planted while tips travel.
 */
const WIND_PARS_VERTEX = /* glsl */`
  uniform float uWindTime;
  uniform float uWindSpeed;
  uniform float uWindStrength;
`

const WIND_VERTEX = /* glsl */`
  #include <begin_vertex>
  #ifdef USE_INSTANCING
    vec3 swayOrigin = instanceMatrix[3].xyz;
  #else
    vec3 swayOrigin = vec3(0.0);
  #endif
  float swayPhase  = uWindTime * uWindSpeed + swayOrigin.x * 0.35 + swayOrigin.z * 0.27;
  float swayAmount = pow(max(transformed.y, 0.0), 1.4) * uWindStrength * 0.03;
  transformed.x += sin(swayPhase) * swayAmount;
  transformed.z += cos(swayPhase * 0.77 + 1.3) * swayAmount * 0.62;
`

/**
 * Ground grain.
 *
 * Vertex colour alone gives the terrain its *palette* but not its *surface* —
 * at this camera distance a metre of ground is a few pixels wide, and without
 * something at that scale it reads as coloured paper. Two things fix it and
 * both are one texture: a fine albedo mottle, and a normal perturbation taken
 * as the finite difference of the same fetch, which is what makes the light
 * catch on soil rather than sliding over it.
 *
 * World-space projection, weighted by how horizontal the surface is — so the
 * shared material can carry it without smearing streaks down every barn wall.
 *
 * Two octaves, not one. A single scale gives ground a *texture* but not a
 * *history*: real soil has metre-wide patches of wear and damp under the
 * centimetre-wide grit, and without the broad octave the fine one tiles into a
 * visible weave the moment you zoom out past its repeat. The broad fetch is the
 * same texture at a fraction of the frequency, so it costs a sampler read and no
 * memory at all.
 *
 * The third thing here is roughness. Uniform roughness is the giveaway that a
 * surface is a render — nothing outdoors reflects evenly — so the fine grain
 * also polishes and dulls the specular by a few percent, which is what makes wet
 * silt read as different material from dry heath under the same vertex colour.
 */
const DETAIL_PARS_FRAGMENT = /* glsl */`
  uniform sampler2D uDetailMap;
  uniform float uDetailScale;
  uniform float uDetailStrength;
  uniform float uDetailMacro;
  varying float vScapeUp;
`

const DETAIL_FRAGMENT = /* glsl */`
  #include <normal_fragment_begin>
  float scapeFlat = smoothstep(0.3, 0.9, vScapeUp);
  float scapeAmt  = uDetailStrength * scapeFlat;
  vec2 scapeUv    = vScapeGround * uDetailScale;
  vec2 macroUv    = scapeUv * 0.16;
  float grain     = texture2D(uDetailMap, scapeUv).r;
  float grainX    = texture2D(uDetailMap, scapeUv + vec2(0.015, 0.0)).r;
  float grainZ    = texture2D(uDetailMap, scapeUv + vec2(0.0, 0.015)).r;
  float macro     = texture2D(uDetailMap, macroUv).r;
  float macroX    = texture2D(uDetailMap, macroUv + vec2(0.02, 0.0)).r;
  float macroZ    = texture2D(uDetailMap, macroUv + vec2(0.0, 0.02)).r;

  diffuseColor.rgb *= 1.0 + scapeAmt * (grain - 0.5) * 1.6;
  diffuseColor.rgb *= 1.0 + scapeAmt * uDetailMacro * (macro - 0.5) * 1.15;

  // Dirt collects in the low ground and it never comes back out.
  diffuseColor.rgb *= 1.0 - scapeAmt * 0.22 * pow(1.0 - grain, 2.0);

  roughnessFactor = clamp(roughnessFactor + scapeAmt * (0.5 - grain) * 0.24, 0.05, 1.0);

  vec3 scapeBump = vec3(grainX - grain, 0.0, grainZ - grain) * 3.0 +
    vec3(macroX - macro, 0.0, macroZ - macro) * uDetailMacro * 2.2;
  normal = normalize(normal + mat3(viewMatrix) * scapeBump * scapeAmt);
`

function buildCloudMap (seed: number): Texture {
  const texture = createSeamlessNoiseTexture({ size: CLOUD_SIZE, seed, frequency: 3, octaves: 4 })
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  return texture
}

function buildDetailMap (seed: number): Texture {
  const texture = createSeamlessNoiseTexture({ size: DETAIL_SIZE, seed, frequency: 12, octaves: 5 })
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  return texture
}

export function createScapeMaterials (config: ScapeConfig): ScapeMaterials {
  const cloudMap  = buildCloudMap(config.seed)
  const detailMap = buildDetailMap(config.seed ^ 0x77c1)

  const cloudOffset: IUniform<Vector2>   = { value: new Vector2() }
  const shared: Record<string, IUniform> = {
    uCloudMap:      { value: cloudMap },
    uCloudOffset:   cloudOffset,
    uCloudScale:    { value: 1 / Math.max(1, config.atmosphere.cloudScale) },
    uCloudStrength: { value: config.atmosphere.cloudShadow },
  }
  const wind: Record<string, IUniform> = {
    uWindTime:     { value: 0 },
    uWindSpeed:    { value: config.wind.speed },
    uWindStrength: { value: config.wind.strength },
  }
  const detail: Record<string, IUniform> = {
    uDetailMap:      { value: detailMap },
    uDetailScale:    { value: 1 / Math.max(0.5, config.terrain.detailScale) },
    uDetailStrength: { value: config.terrain.detailGrain },
    uDetailMacro:    { value: config.terrain.detailMacro },
  }

  interface Injection {
    wind?:   Record<string, IUniform>
    detail?: Record<string, IUniform>
  }

  function attachScape (material: MeshStandardMaterial, key: string, extra: Injection = {}): void {
    material.onBeforeCompile = (program: WebGLProgramParametersWithUniforms) => {
      Object.assign(program.uniforms, shared, extra.wind, extra.detail)

      // The normal varying rides with `detail` rather than with the cloud
      // shadow, so foliage — which has no detail pass to read it — never
      // declares a varying it cannot use. On a driver with 15 vec4 to spend,
      // that unread slot was the difference between linking and not.
      program.vertexShader = program.vertexShader
        .replace('#include <common>', [
          '#include <common>',
          CLOUD_PARS_VERTEX,
          extra.wind ? WIND_PARS_VERTEX : '',
          extra.detail ? DETAIL_PARS_VERTEX : '',
        ].join('\n'))
        .replace('#include <project_vertex>', CLOUD_WORLD_VERTEX + (extra.detail ? DETAIL_WORLD_VERTEX : ''))

      if (extra.wind)
        program.vertexShader = program.vertexShader.replace('#include <begin_vertex>', WIND_VERTEX)

      program.fragmentShader = program.fragmentShader
        .replace('#include <common>', `#include <common>\n${CLOUD_PARS_FRAGMENT}${extra.detail ? DETAIL_PARS_FRAGMENT : ''}`)
        .replace('#include <color_fragment>', CLOUD_FRAGMENT)

      if (extra.detail)
        program.fragmentShader = program.fragmentShader
          .replace('#include <normal_fragment_begin>', DETAIL_FRAGMENT)
    }
    material.customProgramCacheKey = () => key

    // The same key doubles as the material's name, because a name is the only
    // thing three prints when a program fails to link — `Material Name:` on an
    // unnamed material is blank, and a driver that refuses to link without
    // filling in the info log leaves a blank line as the entire diagnosis. An
    // android handset produced six of those in one run.
    material.name = key
  }

  const ground  = kitMaterial({ roughness: 0.96, metalness: 0, flatShading: true })
  const foliage = kitMaterial({ roughness: 0.92, metalness: 0, flatShading: true })

  attachScape(ground, 'scape-ground', { detail })
  attachScape(foliage, 'scape-foliage', { wind })

  markShared(ground)
  markShared(foliage)

  return {
    ground,
    foliage,

    // Uniforms are refreshed from the config every frame rather than captured
    // at build. The scape's tuning surface is the config object, and a knob
    // that only takes effect on reload is not a knob.
    update (elapsed) {
      const drift = config.atmosphere.cloudSpeed

      cloudOffset.value.set(elapsed * drift * 0.06, elapsed * drift * 0.021)
      wind.uWindTime.value         = elapsed
      wind.uWindSpeed.value        = config.wind.speed
      wind.uWindStrength.value     = config.wind.strength
      shared.uCloudStrength.value  = config.atmosphere.cloudShadow
      shared.uCloudScale.value     = 1 / Math.max(1, config.atmosphere.cloudScale)
      detail.uDetailStrength.value = config.terrain.detailGrain
      detail.uDetailScale.value    = 1 / Math.max(0.5, config.terrain.detailScale)
      detail.uDetailMacro.value    = config.terrain.detailMacro
    },

    dispose () {
      cloudMap.dispose()
      detailMap.dispose()
      ground.dispose()
      foliage.dispose()
    },
  }
}

// perf: two materials for the entire scape — two shader compiles, and every
// mesh and InstancedMesh shares them, so the renderer never changes program.
