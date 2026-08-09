import { Vector3 } from 'three'
import type { OrthographicCamera } from 'three'
import type { LUTPass } from 'three/addons/postprocessing/LUTPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js'
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js'
import { defineModule } from 'threejs-scene'
import type { AppModule } from 'threejs-scene'
import {
  createFilmGrainPass,
  createGradePass,
  postProcessing,
} from 'threejs-scene/modules/post'
import type { GradePass } from 'threejs-scene/modules/post'
import { createLUT } from 'threejs-scene/modules/post/webgl'
import type { ScapeConfig } from './config.ts'
import { createGradeLUTs } from './lut.ts'
import type { AtmosphereQuality } from './quality.ts'


export interface PostOptions {
  camera:  OrthographicCamera
  config:  ScapeConfig
  quality: AtmosphereQuality
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

export function createAtmospherePost ({
  camera,
  config,
  quality,
}: PostOptions): AppModule<Record<string, never>> {
  const luts = createGradeLUTs()

  let pairs: TiltShiftPair[]  = []
  let grade: GradePass | null = null
  let lut: LUTPass | null     = null
  let film: ShaderPass | null = null
  let size                    = { width: 1, height: 1 }
  let amount                  = config.look.tiltShift

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

  const inner = postProcessing<Record<string, never>>({
    bloom: quality.bloom
      ? {
        strength:  config.look.bloom,
        radius:    0.7,
        threshold: 0.86,
      }
      : false,

    effects (ctx) {
      if (quality.msaaSamples > 0) {
        ctx.composer.renderTarget1.samples = quality.msaaSamples
        ctx.composer.renderTarget2.samples = quality.msaaSamples
      }

      size  = { width: ctx.width, height: ctx.height }
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

      grade = createGradePass({
        contrast:   1.04,
        saturation: 1.06,
        vignette:   config.look.vignette,
      })

      lut = createLUT({
        lut:       luts.get(config.look.grade),
        intensity: config.look.intensity,
      }) as LUTPass
      ctx.composer.addPass(lut)

      if (quality.grain && config.look.grain > 0) {
        film = createFilmGrainPass({
          intensity: config.look.grain * GRAIN_SCALE,
          luma:      0.65,
        })
        ctx.composer.addPass(film)
      }

      aimFocus()
      return [ ...pairs.flatMap(pair => [ pair.horizontal, pair.vertical ]), grade ]
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
      if (film)
        film.uniforms.uTime.value = frame.elapsed
      inner.update?.(state, frame, ctx)
    },

    resize (next, ctx) {
      inner.resize?.(next, ctx)
      lut?.setSize(next.width, next.height)
      film?.setSize(next.width, next.height)
    },

    render (frame, ctx) {
      inner.render?.(frame, ctx)
    },

    dispose () {
      lut?.dispose()
      film?.dispose()
      inner.dispose?.()
      luts.dispose()

      pairs = []
      grade = null
      lut   = null
      film  = null
    },
  })
}

// perf: mobile runs two tilt-shift passes plus the grade and lut; desktop adds
// a second blur pair, bloom, grain and 4x composer msaa.
