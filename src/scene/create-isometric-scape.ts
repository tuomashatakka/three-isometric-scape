import { Vector3 } from 'three'
import { aimIsoCamera, createApp, createIsoCamera } from 'threejs-scene'
import type { ScapeConfig } from './config.ts'
import { createAtmosphereLayer } from './atmosphere.ts'
import { createCameraControls } from './camera-controls.ts'
import { createLandscape } from './landscape.ts'
import { createMistLayer } from './mist.ts'
import { createAtmospherePost } from './post.ts'
import { detectAtmosphereQuality } from './quality.ts'


export interface IsometricScape {
  dispose(): void
}

export interface IsometricScapeOptions {
  reducedMotion: boolean
  onFocus(point: Vector3): void
  onManualControl(): void
}

export function createIsometricScape (
  canvas: HTMLCanvasElement,
  config: ScapeConfig,
  options: IsometricScapeOptions,
): IsometricScape {
  const aspect = canvas.clientWidth / canvas.clientHeight || 1
  const camera = createIsoCamera(aspect, {
    viewSize: config.camera.viewSize,
    flavor:   'dimetric',
    rotation: config.camera.rotation,
    near:     0.1,
    far:      320,
  })
  aimIsoCamera(camera, { tilt: config.camera.tilt })

  const quality    = detectAtmosphereQuality()
  const landscape  = createLandscape(config)
  const atmosphere = createAtmosphereLayer({
    camera,
    config,
    quality,
    groundRadius: config.terrain.size * 0.8,
  })
  const mist     = createMistLayer({ camera, config, quality })
  const post     = createAtmospherePost({ camera, config, quality })
  const controls = createCameraControls({
    camera,
    canvas,
    landscape,
    minViewSize:     config.camera.minViewSize,
    maxViewSize:     config.camera.maxViewSize,
    maxFocus:        config.terrain.size * 0.48,
    reducedMotion:   options.reducedMotion,
    onFocus:         options.onFocus,
    onManualControl: options.onManualControl,
  })

  const app = createApp<Record<string, never>>(canvas, {
    state:    {},
    seed:     config.seed,
    camera,
    renderer: {
      antialias:           quality.antialias,
      pixelRatioMax:       quality.pixelRatioMax,
      shadows:             true,
      toneMappingExposure: 0.92,
    },
    use: [
      landscape.module,
      controls,
      atmosphere,
      mist,
      post,
    ],
  })

  app.ctx.renderer.domElement.addEventListener('webglcontextlost', () => {
    app.stop()
  })
  app.ctx.renderer.compile(app.ctx.scene, camera)
  app.start()

  return {
    dispose () {
      app.dispose()
    },
  }
}

// perf: createApp owns the only render loop, resize observer, renderer and
// teardown path. scene modules share that lifecycle rather than adding raf work.
