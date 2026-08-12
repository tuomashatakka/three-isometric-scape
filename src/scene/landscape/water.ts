import {
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RGBAFormat,
  RepeatWrapping,
  Vector2,
} from 'three'
import type { IUniform, Texture, WebGLProgramParametersWithUniforms } from 'three'
import { createNoiseTexture } from 'threejs-scene/modules/assets'
import type { ScapeConfig } from '../config.ts'
import type { HeightField } from './height.ts'


/**
 * The lake.
 *
 * It stays one flat plane — the camera-controls raycast needs a predictable
 * surface to land clicks on — and does all of its work in the fragment shader:
 * depth tint and a foam band read from a baked shore mask, ripple from two
 * scrolling noise fetches. Bathymetry that the geometry never has to know about.
 */
export interface Water {
  mesh: Mesh

  /** Advance ripple and foam phase. Allocation-free. */
  update(elapsed: number): void
  dispose(): void
}

const SHORE_RESOLUTION = 192
const OPEN_WATER       = 16
const MAX_DEPTH        = 3.2

const WATER_PARS_VERTEX = /* glsl */`
  varying vec3 vWaterWorld;
`

const WATER_WORLD_VERTEX = /* glsl */`
  #include <project_vertex>
  vWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`

const WATER_PARS_FRAGMENT = /* glsl */`
  uniform sampler2D uShoreMap;
  uniform sampler2D uRippleMap;
  uniform vec2 uRippleOffset;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform float uShoreScale;
  uniform float uRippleScale;
  uniform float uRippleStrength;
  varying vec3 vWaterWorld;

  float scapeDepth () {
    return texture2D(uShoreMap, vWaterWorld.xz * uShoreScale + 0.5).r;
  }
`

const WATER_COLOR_FRAGMENT = /* glsl */`
  #include <map_fragment>
  float waterDepth = scapeDepth();

  // Foam is a band hugging the bank, not a wash over everything shallow: it
  // fades in off the shore and back out into open water.
  float shoreline = smoothstep(0.0, 0.035, waterDepth) * smoothstep(0.14, 0.05, waterDepth);
  vec2 foamUv = vWaterWorld.xz * uRippleScale * 0.55 + uRippleOffset * 1.6;
  float foam = shoreline * (0.35 + 0.5 * texture2D(uRippleMap, foamUv).r);

  diffuseColor.rgb = mix(uShallow, uDeep, smoothstep(0.0, 0.5, waterDepth));
  diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, clamp(foam, 0.0, 0.55));

  // Texture the albedo, not just the normal. A normal-only ripple is invisible
  // wherever the specular lobe does not reach, so the sea reads as flat paint
  // from half the angles the camera can orbit to.
  float sheen = texture2D(uRippleMap, vWaterWorld.xz * uRippleScale + uRippleOffset).r;
  diffuseColor.rgb *= 0.93 + 0.15 * sheen;

  // The plane spans the whole map, so it has to vanish wherever there is no
  // water under it — otherwise dry land gets painted lake.
  diffuseColor.a *= smoothstep(0.0, 0.03, waterDepth) * clamp(0.5 + waterDepth * 1.7, 0.0, 1.0);
`

const WATER_NORMAL_FRAGMENT = /* glsl */`
  #include <normal_fragment_begin>
  vec2 rippleUv = vWaterWorld.xz * uRippleScale;
  float ripplA = texture2D(uRippleMap, rippleUv + uRippleOffset).r;
  float ripplB = texture2D(uRippleMap, rippleUv * 1.73 - uRippleOffset * 1.31).r;
  normal = normalize(normal + vec3(
    (ripplA - 0.5) * uRippleStrength,
    0.0,
    (ripplB - 0.5) * uRippleStrength
  ));
`

/** Bake how deep the lake is at every point, from the same height field the terrain uses. */
function bakeShoreMask (config: ScapeConfig, field: HeightField, span: number): DataTexture {
  const data = new Uint8Array(SHORE_RESOLUTION * SHORE_RESOLUTION * 4)
  const step = span / (SHORE_RESOLUTION - 1)

  for (let row = 0; row < SHORE_RESOLUTION; row += 1)
    for (let column = 0; column < SHORE_RESOLUTION; column += 1) {
      const x     = -span / 2 + column * step
      const z     = -span / 2 + row * step
      const depth = Math.min(1, Math.max(0, (config.terrain.waterLevel - field.heightAt(x, z)) / MAX_DEPTH))
      const index = (row * SHORE_RESOLUTION + column) * 4
      const value = Math.round(depth * 255)

      data[index]     = value
      data[index + 1] = value
      data[index + 2] = value
      data[index + 3] = 255
    }

  const texture       = new DataTexture(data, SHORE_RESOLUTION, SHORE_RESOLUTION, RGBAFormat)
  texture.minFilter   = LinearFilter
  texture.magFilter   = LinearFilter
  texture.needsUpdate = true
  return texture
}

export function createWater (config: ScapeConfig, field: HeightField): Water {
  // Two spans, deliberately. The bathymetry mask only covers the terrain, but
  // the surface runs far past it so the island sits in open water that reaches
  // the fog instead of ending on a visible edge. The mask clamps at its border,
  // and because the island falloff drowns the terrain rim, that border already
  // reads as full depth — so everything outside is simply deep water.
  const maskSpan = config.terrain.size * 1.02
  const surface  = config.terrain.size * OPEN_WATER
  const geometry = new PlaneGeometry(surface, surface, 1, 1)
  geometry.rotateX(-Math.PI / 2)

  const shoreMap: Texture = bakeShoreMask(config, field, maskSpan)

  // Mipmaps are not optional here. A 128px noise map sampled at roughly one
  // texel per pixel aliases into a field of bright specks — and the god-ray
  // pass then smears every speck into a streak along the sun vector, which is
  // where the vertical bright lines came from.
  const rippleMap           = createNoiseTexture({ size: 128, seed: config.seed ^ 0x2f1a, monochrome: true, lift: 0.1 })
  rippleMap.wrapS           = RepeatWrapping
  rippleMap.wrapT           = RepeatWrapping
  rippleMap.generateMipmaps = true
  rippleMap.minFilter       = LinearMipmapLinearFilter
  rippleMap.magFilter       = LinearFilter
  rippleMap.needsUpdate     = true

  const rippleOffset: IUniform<Vector2>    = { value: new Vector2() }
  const uniforms: Record<string, IUniform> = {
    uShoreMap:       { value: shoreMap },
    uRippleMap:      { value: rippleMap },
    uRippleOffset:   rippleOffset,
    uDeep:           { value: new Color(config.palette.deepWater) },
    uShallow:        { value: new Color(config.palette.shallowWater) },
    uFoam:           { value: new Color(config.palette.foam) },
    uShoreScale:     { value: 1 / maskSpan },
    uRippleScale:    { value: 1 / 34 },
    uRippleStrength: { value: 0.14 },
  }

  // Opaque at the material level, and let the shader's alpha ramp do the
  // fading. At 0.92 the deep water leaks 8% of whatever is behind it, which
  // over open sea means the terrain plane's own square edge shows through as a
  // faint rectangle around the island.
  const material = new MeshStandardMaterial({
    color:       0xffffff,
    transparent: true,
    opacity:     1,
    roughness:   0.14,
    metalness:   0.06,
    depthWrite:  false,
  })

  material.onBeforeCompile = (program: WebGLProgramParametersWithUniforms) => {
    Object.assign(program.uniforms, uniforms)

    program.vertexShader = program.vertexShader
      .replace('#include <common>', `#include <common>\n${WATER_PARS_VERTEX}`)
      .replace('#include <project_vertex>', WATER_WORLD_VERTEX)

    program.fragmentShader = program.fragmentShader
      .replace('#include <common>', `#include <common>\n${WATER_PARS_FRAGMENT}`)
      .replace('#include <map_fragment>', WATER_COLOR_FRAGMENT)
      .replace('#include <normal_fragment_begin>', WATER_NORMAL_FRAGMENT)
  }
  material.customProgramCacheKey = () => 'scape-water'

  const mesh         = new Mesh(geometry, material)
  mesh.name          = 'water'
  mesh.position.y    = config.terrain.waterLevel
  mesh.receiveShadow = true

  return {
    mesh,

    update (elapsed) {
      rippleOffset.value.set(elapsed * 0.014, elapsed * 0.0092)
    },

    dispose () {
      geometry.dispose()
      material.dispose()
      shoreMap.dispose()
      rippleMap.dispose()
    },
  }
}

// perf: one transparent draw. The shore mask is baked once at build from the
// same height field the terrain uses, so bathymetry costs one texture fetch.
