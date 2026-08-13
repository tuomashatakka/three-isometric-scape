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
import { createVitals } from './vitals.ts'


export interface IsometricScape {
  dispose(): void
}

/** The channel the scape reports itself through. See `ui/diagnostics.ts`. */
export interface ScapeDiagnostics {
  say(message: string): void
  fail(message: string): void
  vitals(line: string): void
  readonly verbose: boolean
}

export interface IsometricScapeOptions {

  /** The resolved tier. Passed in so the overlay can be built before the scene is. */
  quality:       AtmosphereQuality
  reducedMotion: boolean
  diagnostics:   ScapeDiagnostics
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

/**
 * What the driver said, if it said anything.
 *
 * `WebGLContextEvent.statusMessage` is where Chrome puts the reason a context
 * went away — "GPU process crashed", a guilty-context note, an out-of-memory —
 * and it is very often the only description of the failure that exists.
 */
function lossReason (event: Event): string {
  const message = (event as WebGLContextEvent).statusMessage

  return message ? `"${message}"` : 'no reason given by the driver'
}

/** Which gpu actually picked the scape up, where the browser will admit it. */
function describeGpu (gl: WebGL2RenderingContext): string {
  const debug = gl.getExtension('WEBGL_debug_renderer_info')

  if (!debug)
    return String(gl.getParameter(gl.RENDERER))

  return [
    gl.getParameter(debug.UNMASKED_VENDOR_WEBGL),
    gl.getParameter(debug.UNMASKED_RENDERER_WEBGL),
  ].filter(Boolean).join(' ')
}

export function createIsometricScape (
  canvas: HTMLCanvasElement,
  config: ScapeConfig,
  options: IsometricScapeOptions,
): IsometricScape {
  const { diagnostics } = options
  const buildStarted    = performance.now()
  const aspect          = canvas.clientWidth / canvas.clientHeight || 1
  const camera          = createIsoCamera(aspect, {
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

  // Mounted after everything it measures, and last of all so that nothing it
  // does can come between a module and the frame. It declares no `render` hook,
  // so the post chain — or the bare renderer — still owns the draw.
  const vitals = createVitals({
    renderer: app.ctx.renderer,
    verbose:  diagnostics.verbose,
    report:   line => diagnostics.vitals(line),
    notice:   message => diagnostics.say(message),
  })

  app.use(vitals.module)

  const gl = app.ctx.renderer.getContext() as WebGL2RenderingContext

  diagnostics.say([
    `${quality.tier} tier`,
    `buffer ${gl.drawingBufferWidth}×${gl.drawingBufferHeight}`,
    `ratio ${app.ctx.renderer.getPixelRatio()}`,
    `${quality.frameRate || 'un'}capped`,
    `post ${quality.post ? 'on' : 'off'}`,
    `built in ${Math.round(performance.now() - buildStarted)}ms`,
  ].join(' · '))

  diagnostics.say(`gpu ${describeGpu(gl)}`)

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

    // The state of the scape at the moment it died, while it is still readable.
    // After this the info counters are the only trace of what it was doing, and
    // the next mount resets them.
    diagnostics.fail(`context lost · ${lossReason(event)}`)
    diagnostics.fail(`at loss · ${vitals.snapshot()}`)
    options.onContextLost()
  }

  function handleContextRestored (): void {
    diagnostics.say('the browser offered the context back')
  }

  function handleCreationError (event: Event): void {
    diagnostics.fail(`context could not be created · ${lossReason(event)}`)
  }

  function handleVisibility (): void {
    diagnostics.say(document.hidden ? 'hidden · loop parked' : 'visible · loop running')
    settle()
  }

  canvas.addEventListener('webglcontextlost', handleContextLost)
  canvas.addEventListener('webglcontextrestored', handleContextRestored)
  canvas.addEventListener('webglcontextcreationerror', handleCreationError)
  document.addEventListener('visibilitychange', handleVisibility)

  settle()

  return {
    dispose () {
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      canvas.removeEventListener('webglcontextcreationerror', handleCreationError)
      document.removeEventListener('visibilitychange', handleVisibility)
      app.dispose()
    },
  }
}

// perf: createApp owns the only render loop, resize observer, renderer and
// teardown path. scene modules share that lifecycle rather than adding raf work.
// The loop is paced to `quality.frameRate` and parked whenever the document is
// hidden, so the gpu is only ever asked for frames somebody is looking at.
