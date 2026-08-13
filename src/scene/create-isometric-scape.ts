import { Vector3 } from 'three'
import type { Mesh } from 'three'
import { createApp, createIsoCamera } from 'threejs-scene'
import type { ScapeConfig } from './config.ts'
import { createAtmosphereLayer } from './atmosphere.ts'
import { createCameraControls } from './camera-controls.ts'
import { createCloudLayer } from './clouds.ts'
import { createLandscape } from './landscape/index.ts'
import { createMistLayer } from './mist.ts'
import { createAtmospherePost } from './post.ts'
import type { AtmosphereQuality } from './quality.ts'


export interface IsometricScape {
  dispose(): void
}

export interface IsometricScapeOptions {

  /** The resolved tier. Passed in so the overlay can be built before the scene is. */
  quality:       AtmosphereQuality
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

    // Far enough to contain the open-water plane at any pan or zoom. An
    // orthographic camera has linear depth, so a distant far plane costs no
    // precision — and a near one clips the sea into a visible horizon line.
    far: 1_600,
  })

  // No initial aim: `camera-controls` owns tilt outright — it derives it from
  // the zoom level — and its `build` hook runs before anything reads the pose.
  const { quality } = options
  const landscape   = createLandscape(config, quality)
  const atmosphere  = createAtmosphereLayer({
    camera,
    config,
    quality,
    groundRadius: config.terrain.size * 0.8,
  })
  const mist   = createMistLayer({ camera, config, quality, daylight: atmosphere.daylight })
  const clouds = createCloudLayer({ camera, config, quality, daylight: atmosphere.daylight })
  const post   = createAtmospherePost({
    camera,
    config,
    quality,
    sunPosition: atmosphere.sunPosition,
    // Resolved lazily: post builds last, so the lake already exists by the time
    // the composer asks what it should be reflecting.
    water:       () => landscape.surfaces.find(surface => surface.name === 'water') as Mesh | null ?? null,
  })
  const controls = createCameraControls({
    camera,
    canvas,
    landscape,
    limits:          config.camera,
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
      toneMappingExposure: 0.98,
    },
    use: [
      landscape.module,
      controls,
      atmosphere.module,
      mist,
      clouds,
      post,
    ],
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
