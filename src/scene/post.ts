import { Vector3 } from 'three'
import type { Mesh, OrthographicCamera } from 'three'
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import type { LUTPass } from 'three/addons/postprocessing/LUTPass.js'
import type { Pass } from 'three/addons/postprocessing/Pass.js'
import type { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js'
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js'
import { defineModule, smoothstep } from 'threejs-scene'
import type { AppModule } from 'threejs-scene'
import {
  createFilmGrainPass,
  createGodRaysPass,
  createGradePass,
  postProcessing,
} from 'threejs-scene/modules/post'
import type { EffectContext, GodRaysPass, GradePass } from 'threejs-scene/modules/post'
import { createAnamorphic, createAo, createLUT, createSsr, createTraa } from 'threejs-scene/modules/post/webgl'
import type { ScapeConfig } from './config.ts'
import { createGradeLUTs } from './lut.ts'
import type { AtmosphereQuality } from './quality.ts'


export interface PostOptions {
  camera:  OrthographicCamera
  config:  ScapeConfig
  quality: AtmosphereQuality

  /** Sun position in world space, owned by the atmosphere module. */
  sunPosition: Vector3

  /** The lake surface, so screen-space reflections know what to reflect in. */
  water(): Mesh | null
}

interface TiltShiftPair {
  horizontal: ShaderPass
  vertical:   ShaderPass
  step:       number
}

const BLUR_PIXELS      = 3.6
const BLUR_REFERENCE   = 54
const BLUR_MIN         = 0.7
const BLUR_MAX         = 1.8
const SECOND_PASS_STEP = 1.7
const GRAIN_SCALE      = 0.09

const projected = new Vector3()
const target    = new Vector3()
const sunNdc    = new Vector3()

// How far outside the frame the virtual sun may sit before the shafts are gone.
const RAY_EDGE_IN  = 0.55
const RAY_EDGE_OUT = 1.4

// Where to put the virtual sun, as a fraction of the visible half-height.
const RAY_REACH = 0.95

/**
 * The optics.
 *
 * Chain order, and why:
 *
 * ```
 * Render → AO → SSR → Bloom → Anamorphic → GodRays
 *        → TiltShift ×N → Grade → LUT → Grain → TRAA → Output
 * ```
 *
 * Ambient occlusion has to see a sharp image, so it goes first. God rays go
 * after bloom because a bloomed sun throws brighter shafts. Tilt-shift sits
 * after all of them because it is the *lens* — in a real miniature photograph
 * every one of those effects happens in the scene and then the lens defocuses
 * the result, not the other way round. Grade and LUT then run on the final
 * composed frame, and TRAA resolves last.
 *
 * All of it lands before `OutputPass`, which is where tone-mapping happens
 * exactly once. That matters more than it looks: passes appended with
 * `composer.addPass` land *after* OutputPass and end up grading display-space
 * values, which is not what a linear-HDR LUT was baked for. Everything here is
 * returned from `effects()` so `postProcessing` inserts it in the right place.
 */
export function createAtmospherePost ({
  camera,
  config,
  quality,
  sunPosition,
  water,
}: PostOptions): AppModule<Record<string, never>> {
  const luts = createGradeLUTs()

  let pairs: TiltShiftPair[]          = []
  let composer: EffectComposer | null = null
  let bloom: UnrealBloomPass | null   = null
  let grade: GradePass | null         = null
  let lut: LUTPass | null             = null
  let film: ShaderPass | null         = null
  let godRays: GodRaysPass | null     = null
  let extras: Pass[]                  = []
  let size                            = { width: 1, height: 1 }
  let amount                          = config.look.tiltShift

  // The chain's own copy of the surface. An `EffectComposer` snapshots the
  // renderer's pixel ratio when it is built and never looks again, so a live
  // ratio change has to be handed to it separately — and the last buffer it was
  // sized for is what tells a repeated resize apart from a real one.
  let surfaceRatio = 0
  let bufferWidth  = 0
  let bufferHeight = 0

  function applyBlur (): void {
    for (const pair of pairs) {
      pair.horizontal.uniforms.h.value = BLUR_PIXELS * pair.step * amount / Math.max(1, size.width)
      pair.vertical.uniforms.v.value   = BLUR_PIXELS * pair.step * amount / Math.max(1, size.height)
    }
  }

  function aimFocus (): void {
    const stored = camera.userData.target as readonly [number, number, number] | undefined
    target.set(stored?.[0] ?? 0, stored?.[1] ?? 0, stored?.[2] ?? 0)
    projected.copy(target).project(camera)

    const focusLine = (projected.y + 1) / 2
    for (const pair of pairs) {
      pair.horizontal.uniforms.r.value = focusLine
      pair.vertical.uniforms.r.value   = focusLine
    }

    const viewSize = camera.userData.viewSize as number ?? config.camera.viewSize
    const zoom     = Math.min(BLUR_MAX, Math.max(BLUR_MIN, BLUR_REFERENCE / Math.max(1, viewSize)))
    amount         = config.look.tiltShift * zoom
    applyBlur()
  }

  /**
   * Point the sun shafts, and know when to stop.
   *
   * `updateFromLight` projects the light and only disables the pass when the
   * light is *behind* the camera. Under an orthographic projection that test
   * almost never fires: the atmosphere models the sun 150 units from the focus,
   * which lands somewhere around NDC y = 3 — permanently off frame, still
   * "in front", so the radial march runs from every fragment toward a point
   * miles outside the image and smears the whole sky into a white wash.
   *
   * So the shafts get their own virtual sun, placed a fraction of the frame
   * away along the real sun direction, and faded out as it leaves the view.
   * The direction is honest; the distance is a framing decision, because an
   * orthographic camera has no vanishing point to inherit one from.
   */
  function aimSun (): void {
    if (!godRays)
      return

    const viewSize = camera.userData.viewSize as number ?? config.camera.viewSize

    // Direction is taken live from the atmosphere's sun rather than from config,
    // so the shafts track the rig if the light is ever moved at runtime.
    sunNdc.subVectors(sunPosition, target)

    if (sunNdc.lengthSq() < 1e-6) {
      godRays.enabled = false
      return
    }

    sunNdc.normalize()
      .multiplyScalar(viewSize * RAY_REACH)
      .add(target)
      .project(camera)

    const edge = Math.max(Math.abs(sunNdc.x), Math.abs(sunNdc.y))
    const fade = 1 - smoothstep(RAY_EDGE_IN, RAY_EDGE_OUT, edge)

    godRays.enabled = sunNdc.z < 1 && fade > 0.01

    if (!godRays.enabled)
      return

    // Hold the light just past the frame edge so the shafts stay parallel-ish
    // rather than converging on a point somewhere off in the next county.
    const rein = Math.min(1, RAY_EDGE_OUT / Math.max(edge, 1e-3))

    godRays.uniforms.uLightPos.value.set(
      sunNdc.x * rein * 0.5 + 0.5,
      sunNdc.y * rein * 0.5 + 0.5,
    )
    godRays.uniforms.uExposure.value = 0.16 * config.look.godRays * fade
  }

  /**
   * The tier-gated passes that operate on the *scene* rather than on the frame:
   * occlusion, reflections, and light that scatters. Everything here needs the
   * shared depth texture, which is why `depth` is on whenever any of them is.
   */
  function sceneEffects (ctx: EffectContext): Pass[] {
    const built: Pass[] = []
    const lake          = water()

    if (quality.ao && config.look.ao > 0)
      built.push(createAo(ctx))

    if (quality.ssr && lake)
      built.push(createSsr(ctx, {
        groundReflector: lake,
        selects:         [ lake ],
        opacity:         0.34,
        maxDistance:     40,
        thickness:       0.4,
      }))

    if (quality.anamorphic && config.look.anamorphic > 0)
      built.push(createAnamorphic({ threshold: 0.86, scale: config.look.anamorphic * 3 }))

    if (quality.godRays && config.look.godRays > 0) {
      godRays = createGodRaysPass({ threshold: 0.94 })
      godRays.uniforms.uDensity.value = 0.55
      godRays.uniforms.uWeight.value  = 0.26
      godRays.uniforms.uDecay.value   = 0.9
      godRays.uniforms.uSamples.value = quality.tier === 'ultra' ? 60 : 40
      built.push(godRays)
    }

    extras.push(...built)
    return built
  }

  /**
   * Push `config.look` into the passes that are already built.
   *
   * The chain's *shape* is a tier decision made once — which passes exist at
   * all is not something a slider gets to change without rebuilding the
   * composer. Their strengths are just uniforms, though, so every one of them
   * can follow the config live, which is what makes the tuning overlay
   * immediate rather than a reload.
   */
  /**
   * Keep the chain on the same surface the renderer is drawing to.
   *
   * `scene/runtime.ts` moves the renderer; this moves the composer after it.
   * Split in two on purpose — the cheapest tiers have no composer at all, and
   * the pixel ratio still has to work there.
   */
  function syncSurface (): void {
    const next = config.runtime.pixelRatio

    if (!composer || next === surfaceRatio)
      return

    surfaceRatio = next

    // Fans out to every pass in the chain on its own, which is all of ours —
    // they were added to this composer rather than kept beside it.
    composer.setPixelRatio(next)
  }

  function syncLook (): void {
    if (grade)
      grade.uniforms.uVignette.value = config.look.vignette

    if (lut) {
      lut.intensity = config.look.intensity
      lut.lut       = luts.get(config.look.grade)
    }

    if (film)
      film.uniforms.uIntensity.value = config.look.grain * GRAIN_SCALE

    // The bloom pass belongs to the composer rather than to `effects`, so it is
    // found once by the one property no other pass in the chain carries.
    bloom ??= composer?.passes.find(
      (pass): pass is UnrealBloomPass => typeof (pass as UnrealBloomPass).strength === 'number',
    ) ?? null

    if (bloom)
      bloom.strength = config.look.bloom
  }

  const inner = postProcessing<Record<string, never>>({
    depth: quality.ao || quality.ssr || quality.godRays,

    bloom: quality.bloom
      ? {
        strength: config.look.bloom,
        radius:   0.7,

        // Above the fog, deliberately. Bloom is for highlights, and the fog
        // colour scatters toward the sun until its linear luminance sits around
        // 0.85 — at the old 0.86 a frame full of lit haze crossed the threshold
        // everywhere at once and bloomed itself into a white-out.
        threshold: 0.94,
      }
      : false,

    effects (ctx) {
      if (quality.msaaSamples > 0) {
        ctx.composer.renderTarget1.samples = quality.msaaSamples
        ctx.composer.renderTarget2.samples = quality.msaaSamples
      }

      size         = { width: ctx.width, height: ctx.height }
      composer     = ctx.composer
      surfaceRatio = config.runtime.pixelRatio

      const chain: Pass[] = []
      extras = []

      chain.push(...sceneEffects(ctx))

      pairs = Array.from(
        { length: quality.tiltShiftPairs },
        (_unused, index): TiltShiftPair => ({
          horizontal: new ShaderPass(HorizontalTiltShiftShader),
          vertical:   new ShaderPass(VerticalTiltShiftShader),
          step:       SECOND_PASS_STEP ** index,
        }),
      )
      if (pairs.length === 1)
        pairs[0].step = SECOND_PASS_STEP

      chain.push(...pairs.flatMap(pair => [ pair.horizontal, pair.vertical ]))

      grade = createGradePass({
        contrast:   1.04,
        saturation: 1.06,
        vignette:   config.look.vignette,
      })
      chain.push(grade)

      lut = createLUT({
        lut:       luts.get(config.look.grade),
        intensity: config.look.intensity,
      }) as LUTPass
      chain.push(lut)

      if (quality.grain && config.look.grain > 0) {
        film = createFilmGrainPass({
          intensity: config.look.grain * GRAIN_SCALE,
          luma:      0.65,
        })
        chain.push(film)
      }

      if (quality.traa) {
        const traa = createTraa(ctx, { sampleLevel: 2 })
        chain.push(traa)
        extras.push(traa)
      }

      aimFocus()
      return chain
    },

    onResize (next) {
      size = { width: next.width, height: next.height }
      applyBlur()
    },
  })

  return defineModule<Record<string, never>>({
    name: 'atmosphere-post',

    build (ctx) {
      inner.build(ctx)
      aimFocus()
    },

    update (state, frame, ctx) {
      aimFocus()
      aimSun()
      syncSurface()
      syncLook()
      if (film)
        film.uniforms.uTime.value = frame.elapsed
      inner.update?.(state, frame, ctx)
    },

    resize (next, ctx) {
      // A phone's collapsing url bar fires the observer dozens of times a
      // second, and most of those are the same buffer arriving again behind a
      // fractional css size. Rebuilding two hdr ping-pong targets and every
      // pass's own target for a size they already have is how a resize becomes
      // a lost context — so the comparison is on the buffer, not on the css box.
      const ratio  = ctx.renderer.getPixelRatio()
      const width  = Math.round(next.width * ratio)
      const height = Math.round(next.height * ratio)

      if (width === bufferWidth && height === bufferHeight)
        return

      bufferWidth  = width
      bufferHeight = height

      inner.resize?.(next, ctx)
      lut?.setSize(next.width, next.height)
      film?.setSize(next.width, next.height)
      for (const pass of extras)
        pass.setSize?.(next.width, next.height)
    },

    render (frame, ctx) {
      inner.render?.(frame, ctx)
    },

    dispose () {
      lut?.dispose()
      film?.dispose()
      for (const pass of extras)
        pass.dispose?.()
      inner.dispose?.()
      luts.dispose()

      pairs        = []
      extras       = []
      grade        = null
      lut          = null
      film         = null
      godRays      = null
      bloom        = null
      composer     = null
      surfaceRatio = 0
      bufferWidth  = 0
      bufferHeight = 0
    },
  })
}

// perf: mobile runs one tilt-shift pair plus grade and lut. Desktop adds a
// second pair, bloom, god rays, grain and 4x msaa. Ultra adds GTAO, screen-space
// reflections on the lake, anamorphic streaks and a TRAA resolve. Every target
// in the chain is reallocated only when the drawing buffer behind it actually
// changed size.
