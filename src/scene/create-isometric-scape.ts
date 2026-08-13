import { Vector3 } from 'three'
import type { Mesh } from 'three'
import { createApp, createIsoCamera } from 'threejs-scene'
import type { AppModule } from 'threejs-scene'
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

  /**
   * The GPU took the context away.
   *
   * The scape has already stopped its loop and will not draw again — every
   * texture, buffer and program it owned died with the context. Recovery is the
   * host's call, because coming back means deciding what to come back *as*: the
   * budget that just failed is the one thing it must not be.
   */
  onContextLost(): void
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

  // The whole optical chain is one module, and on the cheapest tier it is simply
  // absent — with nothing claiming the `render` hook the app falls back to
  // drawing the scene straight to the canvas, which is two HDR ping-pong targets
  // and every fullscreen pass cheaper than the composer that would replace it.
  const post = quality.post
    ? createAtmospherePost({
      camera,
      config,
      quality,
      sunPosition: atmosphere.sunPosition,
      // Resolved lazily: post builds last, so the lake already exists by the
      // time the composer asks what it should be reflecting.
      water:       () => landscape.surfaces.find(surface => surface.name === 'water') as Mesh | null ?? null,
    })
    : null

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

  const modules: AppModule<Record<string, never>>[] = [
    landscape.module,
    controls,
    atmosphere.module,
    mist,
    clouds,
  ]

  if (post)
    modules.push(post)

  const app = createApp<Record<string, never>>(canvas, {
    state: {},
    seed:  config.seed,
    camera,

    // Always passed, including the 0 that means "every animation frame" — the
    // framecapper's rate is a shared singleton, so a tier that wants no cap has
    // to say so rather than inherit whatever the last scape asked for.
    loop:     { fps: quality.frameRate },
    renderer: {
      antialias:           quality.antialias,
      pixelRatioMax:       quality.pixelRatioMax,
      shadows:             true,
      toneMappingExposure: 0.98,
    },
    use: modules,
  })

  let contextLost = false

  /**
   * Run only when there is something to run for.
   *
   * A backgrounded phone that keeps drawing is a phone heating up for nobody,
   * and heat is what the GPU gives up the context over in the first place.
   */
  function settle (): void {
    if (contextLost || document.hidden)
      app.stop()
    else
      app.start()
  }

  function handleContextLost (event: Event): void {
    // `preventDefault` is what makes the loss recoverable at all — without it
    // the browser never offers the context back. three's renderer calls it too,
    // but the scape's own recovery must not rest on that staying true.
    event.preventDefault()
    contextLost = true
    app.stop()
    options.onContextLost()
  }

  function handleVisibility (): void {
    settle()
  }

  canvas.addEventListener('webglcontextlost', handleContextLost)
  document.addEventListener('visibilitychange', handleVisibility)

  settle()

  return {
    dispose () {
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      document.removeEventListener('visibilitychange', handleVisibility)
      app.dispose()
    },
  }
}

// perf: createApp owns the only render loop, resize observer, renderer and
// teardown path. scene modules share that lifecycle rather than adding raf work.
// The loop is paced to `quality.frameRate` and parked whenever the document is
// hidden, so the gpu is only ever asked for frames somebody is looking at.
