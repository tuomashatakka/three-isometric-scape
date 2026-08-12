import { RepeatWrapping, Vector2 } from 'three'
import type { IUniform, MeshStandardMaterial, Texture, WebGLProgramParametersWithUniforms } from 'three'
import { createSeamlessNoiseTexture, kitMaterial, markShared } from 'threejs-scene/modules/assets'


export interface ScapeMaterialOptions {

  /** Drifting cloud-shadow darkness, 0..1. */
  cloudShadow: number

  /** World units per cloud-map tile. */
  cloudScale: number

  /** Cloud drift speed in tiles per second. */
  cloudSpeed: number

  /** Foliage sway amplitude. */
  windStrength: number

  /** Foliage sway rate. */
  windSpeed: number

  /** Deterministic cloud-map seed. */
  seed: number

  /** World units per tile of the ground detail grain. */
  detailScale: number

  /** Ground grain contrast, 0..1. */
  detailStrength: number
}

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
 */
const CLOUD_PARS_VERTEX = /* glsl */`
  varying vec3 vScapeWorld;
  varying vec3 vScapeNormal;
`

const CLOUD_WORLD_VERTEX = /* glsl */`
  #include <project_vertex>
  vec4 scapeLocal  = vec4(transformed, 1.0);
  vec3 scapeNormal = objectNormal;
  #ifdef USE_INSTANCING
    scapeLocal  = instanceMatrix * scapeLocal;
    scapeNormal = mat3(instanceMatrix) * scapeNormal;
  #endif
  vScapeWorld  = (modelMatrix * scapeLocal).xyz;
  vScapeNormal = normalize(mat3(modelMatrix) * scapeNormal);
`

const CLOUD_PARS_FRAGMENT = /* glsl */`
  uniform sampler2D uCloudMap;
  uniform vec2 uCloudOffset;
  uniform float uCloudScale;
  uniform float uCloudStrength;
  varying vec3 vScapeWorld;
  varying vec3 vScapeNormal;
`

const CLOUD_FRAGMENT = /* glsl */`
  #include <color_fragment>
  float scapeCloud = texture2D(uCloudMap, vScapeWorld.xz * uCloudScale + uCloudOffset).r;
  diffuseColor.rgb *= mix(1.0, 0.52 + 0.48 * scapeCloud, uCloudStrength);
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
 */
const DETAIL_PARS_FRAGMENT = /* glsl */`
  uniform sampler2D uDetailMap;
  uniform float uDetailScale;
  uniform float uDetailStrength;
`

const DETAIL_FRAGMENT = /* glsl */`
  #include <normal_fragment_begin>
  float scapeFlat = smoothstep(0.3, 0.9, vScapeNormal.y);
  vec2 scapeUv    = vScapeWorld.xz * uDetailScale;
  float grain     = texture2D(uDetailMap, scapeUv).r;
  float grainX    = texture2D(uDetailMap, scapeUv + vec2(0.015, 0.0)).r;
  float grainZ    = texture2D(uDetailMap, scapeUv + vec2(0.0, 0.015)).r;

  diffuseColor.rgb *= 1.0 + uDetailStrength * scapeFlat * (grain - 0.5) * 1.6;
  normal = normalize(normal + mat3(viewMatrix) *
    vec3(grainX - grain, 0.0, grainZ - grain) * scapeFlat * uDetailStrength * 3.0);
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

export function createScapeMaterials (options: ScapeMaterialOptions): ScapeMaterials {
  const cloudMap  = buildCloudMap(options.seed)
  const detailMap = buildDetailMap(options.seed ^ 0x77c1)

  const cloudOffset: IUniform<Vector2>   = { value: new Vector2() }
  const shared: Record<string, IUniform> = {
    uCloudMap:      { value: cloudMap },
    uCloudOffset:   cloudOffset,
    uCloudScale:    { value: 1 / Math.max(1, options.cloudScale) },
    uCloudStrength: { value: options.cloudShadow },
  }
  const wind: Record<string, IUniform> = {
    uWindTime:     { value: 0 },
    uWindSpeed:    { value: options.windSpeed },
    uWindStrength: { value: options.windStrength },
  }
  const detail: Record<string, IUniform> = {
    uDetailMap:      { value: detailMap },
    uDetailScale:    { value: 1 / Math.max(0.5, options.detailScale) },
    uDetailStrength: { value: options.detailStrength },
  }

  interface Injection {
    wind?:   Record<string, IUniform>
    detail?: Record<string, IUniform>
  }

  function attachScape (material: MeshStandardMaterial, key: string, extra: Injection = {}): void {
    material.onBeforeCompile = (program: WebGLProgramParametersWithUniforms) => {
      Object.assign(program.uniforms, shared, extra.wind, extra.detail)

      program.vertexShader = program.vertexShader
        .replace('#include <common>', `#include <common>\n${CLOUD_PARS_VERTEX}${extra.wind ? WIND_PARS_VERTEX : ''}`)
        .replace('#include <project_vertex>', CLOUD_WORLD_VERTEX)

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
  }

  const ground  = kitMaterial({ roughness: 0.96, metalness: 0, flatShading: true })
  const foliage = kitMaterial({ roughness: 0.92, metalness: 0, flatShading: true })

  attachScape(ground, 'scape-ground', { detail })
  attachScape(foliage, 'scape-foliage', { wind })

  markShared(ground)
  markShared(foliage)

  const drift = options.cloudSpeed

  return {
    ground,
    foliage,

    update (elapsed) {
      cloudOffset.value.set(elapsed * drift * 0.06, elapsed * drift * 0.021)
      wind.uWindTime.value = elapsed
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
