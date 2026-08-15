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
import { createNoiseTexture, createSeamlessNoiseTexture } from 'threejs-scene/modules/assets'
import type { ScapeConfig } from '../config.ts'
import type { AtmosphereQuality } from '../quality.ts'
import type { SeasonState } from '../season.ts'
import type { HeightField } from './height.ts'


/**
 * The lake.
 *
 * One plane, gently swelling. Everything that makes it read as water happens
 * in the shader: depth tint and a foam band from a baked shore mask, a rolling
 * swell in the vertex stage, and a field of sun glints struck from two
 * decorrelated noise fetches — that speckle is what the surface reads as from
 * any orbit angle, where a specular lobe alone only reads from one.
 *
 * The year reaches it through one uniform. Winter shuts the shallows first and
 * works outward, and everywhere the ice takes hold the surface gives up its
 * swell, its ripple, its foam and its glitter — all of which is the same
 * bathymetry the depth tint was already reading, so the freeze costs no fetch
 * the lake was not making anyway.
 */
export interface Water {
  mesh: Mesh

  /** Advance swell, ripple and foam phase, and take the year's freeze. Allocation-free. */
  update(elapsed: number, season: SeasonState): void
  dispose(): void
}

const SHORE_RESOLUTION = 192
const MAX_DEPTH        = 3.2

/**
 * The swell, shared verbatim by both stages.
 *
 * The vertex shader displaces by it and the fragment shader differences it for
 * a slope — sampling the *same* function is the only way the shading agrees
 * with the silhouette. Three octaves of plain sine, because a Gerstner sum
 * buys nothing at an amplitude the eye reads as "slight".
 */
const WAVE_GLSL = /* glsl */`
  uniform float uWaveTime;
  uniform float uWaveHeight;

  float scapeWave (vec2 p) {
    return sin(p.x * 0.09 + uWaveTime * 0.55) * 0.55 +
      sin(p.y * 0.13 - uWaveTime * 0.41) * 0.3 +
      sin((p.x + p.y) * 0.062 + uWaveTime * 0.29) * 0.4;
  }
`

/**
 * The freeze, shared verbatim by both stages, for the same reason the swell is.
 *
 * The vertex stage needs it to stop displacing water that has stopped moving
 * and the fragment stage needs it to paint what is lying there instead; two
 * approximations of the same ice front would show up as a swell running under a
 * shelf that is not rising with it.
 *
 * The one texture fetch in here is the bathymetry mask, which the vertex stage
 * did not previously read. That is a vertex texture fetch on at most 16k
 * vertices — the whole lake is one plane of 24 to 128 segments a side — against
 * a mask with no mipmaps and linear filtering, so there is no derivative to go
 * looking for and nothing to stall on.
 */
const ICE_GLSL = /* glsl */`
  uniform sampler2D uShoreMap;
  uniform float uShoreScale;
  uniform float uFreeze;
  uniform float uIceReach;
  uniform float uIceBreak;

  float scapeDepth (vec2 ground) {
    return texture2D(uShoreMap, ground * uShoreScale + 0.5).r;
  }

  // The floe field. Three sines rather than a noise fetch, because the vertex
  // stage would otherwise need the same map the fragment stage reads and the
  // cheap tier has a tap budget of two — and because a white-noise fetch
  // thresholded into an edge gives salt and pepper where this gives lobes.
  float scapeFloe (vec2 p) {
    return 0.5 + 0.34 * sin(p.x * 0.081 + p.y * 0.043) +
      0.26 * sin(p.y * 0.117 - p.x * 0.052) +
      0.16 * sin((p.x - p.y) * 0.207);
  }

  /**
   * How much ice is lying on the water at a point, 0..1.
   *
   * Depth is the whole physics of it: a bank a foot deep gives its heat up in a
   * week and a sound five metres deep takes the season, so the freeze starts at
   * the shoreline and walks outward as the year deepens rather than arriving
   * everywhere at once. The 1.7 is what lets a fully committed winter push past
   * the upper threshold in the shallows while the middle is still open.
   */
  float scapeIce (vec2 ground, float depth) {
    float shelter = 1.0 - uIceReach * smoothstep(0.0, 0.55, depth);
    float local   = uFreeze * shelter * 1.7 + (scapeFloe(ground) - 0.5) * uIceBreak;

    return smoothstep(0.45, 0.85, local);
  }
`

const WATER_PARS_VERTEX = /* glsl */`
  varying vec2 vWaterGround;
${WAVE_GLSL}
${ICE_GLSL}
`

const WATER_SWELL_VERTEX = /* glsl */`
  #include <begin_vertex>
  float swellIce = scapeIce(transformed.xz, scapeDepth(transformed.xz));
  transformed.y += scapeWave(transformed.xz) * uWaveHeight * (1.0 - swellIce);
`

const WATER_WORLD_VERTEX = /* glsl */`
  #include <project_vertex>
  vWaterGround = (modelMatrix * vec4(transformed, 1.0)).xz;
`

const WATER_PARS_FRAGMENT = /* glsl */`
  uniform sampler2D uRippleMap;
  uniform sampler2D uWaveMap;
  uniform vec2 uRippleOffset;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uIce;
  uniform float uRippleScale;
  uniform float uRippleStrength;
  uniform float uSparkleScale;
  uniform float uSparkle;
  varying vec2 vWaterGround;
${WAVE_GLSL}
${ICE_GLSL}
`

/**
 * The ice, laid over the finished water rather than mixed into its albedo.
 *
 * What is under a shelf stops mattering the moment the shelf is thick, and a
 * depth tint showing through frozen water is the one thing that reads as blue
 * plastic sheeting rather than as a winter.
 *
 * The rim is where the cover is passing through a half — the front between the
 * sheet and the open water. That is the only part of a frozen bay that is
 * actually white, because that is where the floes grind against each other and
 * pile; the rest of it is the sea seen through a lid.
 */
const WATER_ICE_FRAGMENT = /* glsl */`
  float iceRim = 4.0 * iceCover * (1.0 - iceCover);
  vec3 iceTone = mix(uIce, uFoam, iceRim * 0.65) * (0.9 + 0.2 * sheen);
  diffuseColor.rgb = mix(diffuseColor.rgb, iceTone, iceCover);
`

/**
 * Ice is matte, and deliberately rougher than the water it replaces.
 *
 * The tempting move is the opposite one — new ice is glassy, so drop the
 * roughness and let it glare. But the camera's elevation sweeps across the
 * sun's as it zooms, and a near-mirror plane at that crossing reflects the sun
 * into every fragment at once; that is the whole reason `water.roughness` sits
 * where it does. A frozen bay is the same flat plane with the swell taken out
 * of it, which makes it a *better* candidate for that white-out, not a worse
 * one. Snow-blown ice reads correctly matte and cannot blow out.
 */
const WATER_ROUGHNESS_FRAGMENT = /* glsl */`
  #include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.88, iceCover);
`

const WATER_COLOR_FRAGMENT = /* glsl */`
  #include <map_fragment>
  float waterDepth = scapeDepth(vWaterGround);
  float iceCover   = scapeIce(vWaterGround, waterDepth);
  float openWater  = smoothstep(0.04, 0.3, waterDepth);

  // Foam is a band hugging the bank, not a wash over everything shallow: it
  // fades in off the shore and back out into open water. Ice takes it away —
  // surf is what a swell does at a bank, and the bank is where the ice is.
  float shoreline = smoothstep(0.0, 0.035, waterDepth) * smoothstep(0.14, 0.05, waterDepth);
  vec2 foamUv = vWaterGround * uRippleScale * 0.55 + uRippleOffset * 1.6;
  float foam = shoreline * (0.35 + 0.5 * texture2D(uRippleMap, foamUv).r) * (1.0 - iceCover);

  diffuseColor.rgb = mix(uShallow, uDeep, smoothstep(0.0, 0.5, waterDepth));
  diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, clamp(foam, 0.0, 0.55));

  // Texture the albedo, not just the normal. A normal-only ripple is invisible
  // wherever the specular lobe does not reach, so the sea reads as flat paint
  // from half the angles the camera can orbit to.
  float sheen = texture2D(uRippleMap, vWaterGround * uRippleScale + uRippleOffset).r;
  diffuseColor.rgb *= 0.93 + 0.15 * sheen;

  // Sun glitter. Two noise fields at incommensurate scales, multiplied and then
  // raised to a high power: the product is near zero almost everywhere and
  // spikes only where both crests coincide, which is how glints are actually
  // distributed on water — isolated, and never a pattern you can read. The
  // exponent is the whole control. Threshold it gently instead and the mean of
  // the product clears the cut, every fragment lights up, and the lake becomes
  // a sheet of white paper.
  vec2 sparkUv = vWaterGround * uSparkleScale;
  float glintA = texture2D(uRippleMap, sparkUv + uRippleOffset * 2.1).r;
  float glintB = texture2D(uRippleMap, sparkUv * 1.37 - uRippleOffset * 1.63).r;
  float glint  = pow(clamp(glintA * glintB * 1.42, 0.0, 1.0), 5.0);
  diffuseColor.rgb += uFoam * glint * uSparkle * openWater * (1.0 - iceCover);

${WATER_ICE_FRAGMENT}

  // The plane spans the whole map, so it has to vanish wherever there is no
  // water under it — otherwise dry land gets painted lake.
  diffuseColor.a *= smoothstep(0.0, 0.03, waterDepth) * clamp(0.5 + waterDepth * 1.7, 0.0, 1.0);
`

/**
 * The lake, for a gpu that cannot afford seven looks at it.
 *
 * Two dependent texture reads instead of seven: the depth mask, which decides
 * the colour and where the plane is water at all, and the albedo sheen. The
 * foam band and the sun glitter go, and so do the ripple normals — but the
 * swell is procedural (`scapeWave`), so the surface still moves and still
 * catches the sun along the wave fronts. See `quality.detailTaps`.
 */
const WATER_COLOR_FRAGMENT_LITE = /* glsl */`
  #include <map_fragment>
  float waterDepth = scapeDepth(vWaterGround);
  float iceCover   = scapeIce(vWaterGround, waterDepth);

  diffuseColor.rgb = mix(uShallow, uDeep, smoothstep(0.0, 0.5, waterDepth));

  float sheen = texture2D(uRippleMap, vWaterGround * uRippleScale + uRippleOffset).r;
  diffuseColor.rgb *= 0.93 + 0.15 * sheen;

${WATER_ICE_FRAGMENT}

  diffuseColor.a *= smoothstep(0.0, 0.03, waterDepth) * clamp(0.5 + waterDepth * 1.7, 0.0, 1.0);
`

const WATER_NORMAL_FRAGMENT_LITE = /* glsl */`
  #include <normal_fragment_begin>
  float swell  = scapeWave(vWaterGround);
  float swellX = scapeWave(vWaterGround + vec2(1.6, 0.0));
  float swellZ = scapeWave(vWaterGround + vec2(0.0, 1.6));

  normal = normalize(normal + vec3(
    -(swellX - swell) * uWaveHeight * 2.4,
    0.0,
    -(swellZ - swell) * uWaveHeight * 2.4
  ) * (1.0 - iceCover));
`

const WATER_NORMAL_FRAGMENT = /* glsl */`
  #include <normal_fragment_begin>

  // The ripple normal reads from the *smooth* field, never from the white-noise
  // one the albedo uses. White noise minified past one texel per pixel lands a
  // different random normal in every pixel; wherever the sun's mirror direction
  // drifts into that spray, a full-strength highlight fires in a scatter of
  // isolated pixels and the lake turns into tinfoil. Which angles trigger it is
  // pure luck — so it stays invisible until something moves the camera's
  // elevation, and then the whole sea blows out at once.
  vec2 rippleUv = vWaterGround * uRippleScale;
  float ripplA = texture2D(uWaveMap, rippleUv + uRippleOffset).r;
  float ripplB = texture2D(uWaveMap, rippleUv * 1.73 - uRippleOffset * 1.31).r;

  float swell  = scapeWave(vWaterGround);
  float swellX = scapeWave(vWaterGround + vec2(1.6, 0.0));
  float swellZ = scapeWave(vWaterGround + vec2(0.0, 1.6));

  // Everything the surface does to its own normal goes away under ice, in one
  // multiply: a shelf is flat, and a ripple normal on it is the giveaway that
  // the freeze is paint rather than a state the water is in.
  normal = normalize(normal + vec3(
    (ripplA - 0.5) * uRippleStrength - (swellX - swell) * uWaveHeight * 2.4,
    0.0,
    (ripplB - 0.5) * uRippleStrength - (swellZ - swell) * uWaveHeight * 2.4
  ) * (1.0 - iceCover));
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

export function createWater (
  config:  ScapeConfig,
  field:   HeightField,
  quality: AtmosphereQuality,
): Water {
  // Seven dependent texture reads is what the full lake costs, and a tile-based
  // gpu pays for those in stalls rather than in bandwidth. Below the full tap
  // budget the surface draws from two.
  const lite = quality.detailTaps < 6

  // Two spans, deliberately. The bathymetry mask only covers the terrain, but
  // the surface runs far past it so the island sits in open water that reaches
  // the fog instead of ending on a visible edge. The mask clamps at its border,
  // and because the island falloff drowns the terrain rim, that border already
  // reads as full depth — so everything outside is simply deep water.
  //
  // How *far* past it is a tier decision. The plane only has to outrun the fog,
  // and the fog closes within `groundRadius * 2` of the camera — so the cheap
  // tiers can carry a third of the surface for the same horizon, which is a
  // third of the vertices in the one mesh that is guaranteed to fill the frame.
  const maskSpan = config.terrain.size * 1.02
  const surface  = config.terrain.size * quality.waterSpan
  const segments = quality.waterSegments
  const geometry = new PlaneGeometry(surface, surface, segments, segments)
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

  // Fractal value noise, so neighbouring texels agree on which way the surface
  // is leaning. This one drives the shading; the speckled one only ever tints.
  const waveMap       = createSeamlessNoiseTexture({ size: 256, seed: config.seed ^ 0x51b7, frequency: 5, octaves: 4 })
  waveMap.wrapS       = RepeatWrapping
  waveMap.wrapT       = RepeatWrapping
  waveMap.minFilter   = LinearMipmapLinearFilter
  waveMap.magFilter   = LinearFilter
  waveMap.needsUpdate = true

  const rippleOffset: IUniform<Vector2>    = { value: new Vector2() }
  const waveTime: IUniform<number>         = { value: 0 }
  const iceColor: IUniform<Color>          = { value: new Color(config.palette.ice) }
  const uniforms: Record<string, IUniform> = {
    uShoreMap:       { value: shoreMap },
    uRippleMap:      { value: rippleMap },
    uWaveMap:        { value: waveMap },
    uRippleOffset:   rippleOffset,
    uDeep:           { value: new Color(config.palette.deepWater) },
    uShallow:        { value: new Color(config.palette.shallowWater) },
    uFoam:           { value: new Color(config.palette.foam) },
    uIce:            iceColor,
    uShoreScale:     { value: 1 / maskSpan },
    uFreeze:         { value: 0 },
    uIceReach:       { value: config.water.iceReach },
    uIceBreak:       { value: config.water.iceBreak },
    uRippleScale:    { value: 1 / 34 },
    uRippleStrength: { value: config.water.rippleStrength },
    uSparkleScale:   { value: 1 / 14 },
    uSparkle:        { value: config.water.sparkle },
    uWaveTime:       waveTime,
    uWaveHeight:     { value: config.water.waveHeight },
  }

  // Opaque at the material level, and let the shader's alpha ramp do the
  // fading. At 0.92 the deep water leaks 8% of whatever is behind it, which
  // over open sea means the terrain plane's own square edge shows through as a
  // faint rectangle around the island.
  // Rough, and barely lit by the environment. Those two settle the same
  // argument from opposite ends.
  //
  // Tilt is bound to zoom now, so the camera's elevation sweeps a range that
  // crosses the sun's. A near-mirror surface at that crossing reflects the sun
  // into *every* fragment of a flat plane at once — the lake stops being water
  // and becomes one white highlight the size of the sea. Roughness spreads that
  // lobe out until no angle can concentrate it.
  //
  // Rough dielectrics then pick up the whole sky instead, which is overcast and
  // pale, and the depth tint drowns under it. Cutting `envMapIntensity` is what
  // gives the water back its own colour; the glitter above supplies the sharp
  // highlights the roughness gave away.
  const material = new MeshStandardMaterial({
    name:            'water-surface',
    color:           0xffffff,
    transparent:     true,
    opacity:         1,
    roughness:       config.water.roughness,
    metalness:       0.02,
    envMapIntensity: 0.3,
    depthWrite:      false,
  })

  material.onBeforeCompile = (program: WebGLProgramParametersWithUniforms) => {
    Object.assign(program.uniforms, uniforms)

    program.vertexShader = program.vertexShader
      .replace('#include <common>', `#include <common>\n${WATER_PARS_VERTEX}`)
      .replace('#include <begin_vertex>', WATER_SWELL_VERTEX)
      .replace('#include <project_vertex>', WATER_WORLD_VERTEX)

    program.fragmentShader = program.fragmentShader
      .replace('#include <common>', `#include <common>\n${WATER_PARS_FRAGMENT}`)
      .replace('#include <map_fragment>', lite ? WATER_COLOR_FRAGMENT_LITE : WATER_COLOR_FRAGMENT)
      .replace('#include <roughnessmap_fragment>', WATER_ROUGHNESS_FRAGMENT)
      .replace('#include <normal_fragment_begin>', lite ? WATER_NORMAL_FRAGMENT_LITE : WATER_NORMAL_FRAGMENT)
  }
  material.customProgramCacheKey = () => `scape-water:${lite ? 'lite' : 'full'}`

  const mesh         = new Mesh(geometry, material)
  mesh.name          = 'water'
  mesh.position.y    = config.terrain.waterLevel
  mesh.receiveShadow = true

  return {
    mesh,

    // Read back from the config every frame rather than captured at build, so
    // the tuning overlay can drive the lake without rebuilding the scene. Four
    // uniform writes and a scalar compare is nothing next to the draw itself.
    update (elapsed, season) {
      rippleOffset.value.set(elapsed * 0.014, elapsed * 0.0092)
      waveTime.value                 = elapsed
      uniforms.uSparkle.value        = config.water.sparkle
      uniforms.uWaveHeight.value     = config.water.waveHeight
      uniforms.uRippleStrength.value = config.water.rippleStrength
      uniforms.uFreeze.value         = season.freeze
      uniforms.uIceReach.value       = config.water.iceReach
      uniforms.uIceBreak.value       = config.water.iceBreak

      iceColor.value.copy(season.iceColor)

      if (material.roughness !== config.water.roughness)
        material.roughness = config.water.roughness
    },

    dispose () {
      geometry.dispose()
      material.dispose()
      shoreMap.dispose()
      rippleMap.dispose()
      waveMap.dispose()
    },
  }
}

// perf: one transparent draw. The shore mask is baked once at build from the
// same height field the terrain uses, so bathymetry costs one texture fetch and
// the swell costs three sines per vertex plus three more per lit fragment. The
// freeze adds one vertex texture fetch of that same mask and three sines to
// each stage — no draw, no material, no pass, and no fragment tap, which is why
// every tier including `minimal` gets the winter.
