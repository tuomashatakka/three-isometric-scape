import { Vector3 } from 'three'
import type { Mesh, OrthographicCamera } from 'three'
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import type { Pass } from 'three/addons/postprocessing/Pass.js'
import type { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { defineModule, smoothstep } from 'threejs-scene'
import { createGodRaysPass, postProcessing } from 'threejs-scene/modules/post'
import type { EffectContext, GodRaysPass } from 'threejs-scene/modules/post'
import { createAnamorphic, createSsr, createTraa } from 'threejs-scene/modules/post/webgl'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import { LENS_GRAIN, LENS_VIGNETTE, glareAmount, gradeAmount } from './film.ts'
import { createLensPass } from './lens.ts'
import type { LensPass } from './lens.ts'
import type { AtmosphereQuality } from './quality.ts'


export interface PostOptions {
  camera:  OrthographicCamera
  config:  LiveConfig
  quality: AtmosphereQuality

  /** Sun position in world space, owned by the atmosphere module. */
  sunPosition: Vector3

  /** The lake surface, so screen-space reflections know what to reflect in. */
  water(): Mesh | null
}

/**
 * What one unit of `look.lens` is, per effect of the glass.
 *
 * There is no blur. The lens had a depth of field — a tilt-shift disc that
 * opened with the distance off a focal plane — and every run that tuned it
 * found the same thing: a camera that frames twelve metres of yard from the
 * distance this one stands at has a hyperfocal distance shorter than its
 * subject, and *any* visible defocus across a frame that size is the trick
 * that makes a real town photograph as a model of one. The disc, the focal
 * map and its depth read are gone; the sharpen is contrast-adaptive and runs
 * over the whole frame instead of a focused band.
 */
const LENS_ABERRATION = 3.5
const LENS_SHARPEN    = 0.3
const LENS_HALATION   = 0.35

/**
 * What one unit of `look.glare` is: the bloom's strength and the anamorphic
 * streak's scale. One knob — it carries the sun shafts too — because they are one physical thing — the light a
 * bright point scatters inside the glass, round off the elements and drawn
 * into a line by a cylindrical one — and two sliders let a run tune a lens
 * that scatters a lot but streaks nothing, which no lens does.
 */
const GLARE_BLOOM  = 0.34
const GLARE_STREAK = 1.2

/** The sun's shafts are the same scattered light, smeared out of the bright pixels round the sun. */
const GLARE_RAYS = 0.26

const sunNdc = new Vector3()
const target = new Vector3()

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
 * Render → AO → SSR → Bloom → Anamorphic → GodRays → Lens → TRAA → Output
 * ```
 *
 * Ambient occlusion has to see a sharp image, so it goes first. God rays go
 * after bloom because a bloomed sun throws brighter shafts. The lens sits
 * after all of them — in a real photograph every one of those effects
 * happens in the scene and then the glass sharpens, fringes and darkens the
 * result, and the film grades and grains it (`lens.ts`, one pass
 * for all of that). TRAA resolves last.
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
}: PostOptions): ScapeModule {
  let composer: EffectComposer | null = null
  let bloom: UnrealBloomPass | null   = null
  let lens: LensPass | null           = null
  let godRays: GodRaysPass | null     = null
  let extras: Pass[]                  = []
  let elapsed                         = 0

  // The chain's own copy of the surface. An `EffectComposer` snapshots the
  // renderer's pixel ratio when it is built and never looks again, so a live
  // ratio change has to be handed to it separately — and the last buffer it was
  // sized for is what tells a repeated resize apart from a real one.
  let surfaceRatio = 0
  let bufferWidth  = 0
  let bufferHeight = 0

  /** The film's clock is the world's: `wind.speed` 0 holds the grain still too. */
  function tickFilm (): void {
    lens?.tick(config().wind.speed > 0 ? elapsed : 0)
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

    const viewSize = camera.userData.viewSize as number ?? config().camera.viewSize
    const stored   = camera.userData.target as readonly [number, number, number] | undefined
    target.set(stored?.[0] ?? 0, stored?.[1] ?? 0, stored?.[2] ?? 0)

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
    godRays.uniforms.uExposure.value = 0.16 * GLARE_RAYS * glareAmount(config().look) * fade
  }

  /**
   * The tier-gated passes that operate on the *scene* rather than on the frame:
   * reflections, and light that scatters. Everything here needs the
   * shared depth texture, which is why `depth` is on whenever any of them is.
   */
  function sceneEffects (ctx: EffectContext): Pass[] {
    const built: Pass[] = []
    const lake          = water()

    // No occlusion pass: the shade where things meet the ground is baked once
    // into the sky map every tier reads (`sky-occlusion.ts`), not re-guessed
    // from the depth buffer every frame on one tier.
    // `selects` and no `groundReflector`, which is not a simplification.
    //
    // Three's `SSRPass` calls `groundReflector.doRender()` on whatever it is
    // handed, and only a `ReflectorForSSRPass` has one — a plain `Mesh` throws
    // on the first frame and takes the whole chain with it. This scape had that
    // bug for as long as it has had reflections; it never showed because `ssr`
    // was only ever true on `ultra`, and every capture pins a cheaper tier.
    //
    // A reflector is also the wrong instrument here. It re-renders the scene
    // into a mirror plane, and the lake is not a mirror plane: it is a custom
    // shader surface with its own swell, foam, glitter, wakes and winter ice, so
    // a reflector would draw over exactly the thing worth looking at. Selecting
    // it instead ray-marches the depth buffer that is already being written.
    if (quality.ssr && lake)
      built.push(createSsr(ctx, {
        selects:     [ lake ],
        opacity:     0.34,
        maxDistance: 40,
        thickness:   0.4,
      }))

    if (quality.anamorphic && glareAmount(config().look) > 0)
      built.push(createAnamorphic({ threshold: 0.86, scale: glareAmount(config().look) * GLARE_STREAK }))

    if (quality.godRays && glareAmount(config().look) > 0) {
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
   * Keep the chain on the same surface the renderer is drawing to.
   *
   * `scene/runtime.ts` moves the renderer; this moves the composer after it.
   * Split in two on purpose — the cheapest tiers have no composer at all, and
   * the pixel ratio still has to work there.
   */
  function syncSurface (): void {
    const next = config().runtime.pixelRatio

    if (!composer || next === surfaceRatio)
      return

    surfaceRatio = next

    // Fans out to every pass in the chain on its own, which is all of ours —
    // they were added to this composer rather than kept beside it.
    composer.setPixelRatio(next)
  }

  /**
   * Push `config().look` into the passes that are already built.
   *
   * The chain's *shape* is a tier decision made once — which passes exist at
   * all is not something a slider gets to change without rebuilding the
   * composer. Their strengths are just uniforms, though, so every one of them
   * can follow the config live, which is what makes the tuning overlay
   * immediate rather than a reload.
   */
  function syncLook (): void {
    const look = config().look

    lens?.look({
      aberration: LENS_ABERRATION * look.lens,
      vignette:   LENS_VIGNETTE * look.lens,
      sharpen:    LENS_SHARPEN * Math.min(1, look.lens),
      halation:   quality.halation ? LENS_HALATION * Math.min(1, look.lens) : 0,
      grain:      quality.grain ? LENS_GRAIN * Math.min(1, look.lens) : 0,
      intensity:  gradeAmount(look),
    })

    // The bloom pass belongs to the composer rather than to `effects`, so it is
    // found once by the one property no other pass in the chain carries.
    bloom ??= composer?.passes.find(
      (pass): pass is UnrealBloomPass => typeof (pass as UnrealBloomPass).strength === 'number',
    ) ?? null

    if (bloom)
      bloom.strength = glareAmount(look) * GLARE_BLOOM
  }

  const inner = postProcessing<ScapeConfig>({
    depth: quality.ssr || quality.godRays,

    bloom: quality.bloom
      ? {
        strength: glareAmount(config().look) * GLARE_BLOOM,
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

      composer     = ctx.composer
      surfaceRatio = config().runtime.pixelRatio

      const chain: Pass[] = []
      extras = []

      chain.push(...sceneEffects(ctx))

      lens = createLensPass({ halation: quality.halation, grain: quality.grain })
      lens.size(ctx.width, ctx.height)
      chain.push(lens)
      syncLook()

      if (quality.traa) {
        const traa = createTraa(ctx, { sampleLevel: 2 })
        chain.push(traa)
        extras.push(traa)
      }

      return chain
    },

    onResize (next) {
      lens?.size(next.width, next.height)
    },
  })

  return defineModule<ScapeConfig>({
    name: 'atmosphere-post',

    build (ctx) {
      inner.build(ctx)
      tickFilm()
    },

    update (state, frame, ctx) {
      elapsed = frame.elapsed
      tickFilm()
      aimSun()
      syncSurface()
      syncLook()
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
      lens?.size(next.width, next.height)
      for (const pass of extras)
        pass.setSize?.(next.width, next.height)
    },

    render (frame, ctx) {
      inner.render?.(frame, ctx)
    },

    dispose () {
      lens?.dispose()
      for (const pass of extras)
        pass.dispose?.()
      inner.dispose?.()

      extras       = []
      lens         = null
      godRays      = null
      bloom        = null
      composer     = null
      surfaceRatio = 0
      bufferWidth  = 0
      bufferHeight = 0
    },
  })
}

// perf: the chain is off on mobile. Desktop runs bloom, god rays and the one
// lens pass (sharpen, fringe, halation, grain) over 4x msaa. Ultra adds screen-space
// reflections on the lake, anamorphic streaks and a TRAA resolve. Every target
// in the chain is reallocated only when the drawing buffer behind it actually
// changed size.
