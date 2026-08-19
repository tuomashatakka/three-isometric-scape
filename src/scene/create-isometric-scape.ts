import { Vector2, Vector3 } from 'three'
import type { Mesh, WebGLRenderer } from 'three'
import { createApp, createIsoCamera, createRenderer } from 'threejs-scene'
import type { AppModule } from 'threejs-scene'
import { NOTHING_SKIPPED, reportPrograms } from './audit.ts'
import type { ScapeFamily, ScapeSkips } from './audit.ts'
import type { ScapeConfig } from './config.ts'
import { createAtmosphereLayer } from './atmosphere.ts'
import { createAuroraLayer } from './aurora.ts'
import { createBeaconLight } from './beacon.ts'
import { createCameraControls } from './camera-controls.ts'
import type { CameraOpening } from './camera-controls.ts'
import type { CameraPath } from './camera-path.ts'
import { createCloudLayer } from './clouds.ts'
import { createLandscape } from './landscape/index.ts'
import { createMistLayer } from './mist.ts'
import { createAtmospherePost } from './post.ts'
import type { AtmosphereQuality } from './quality.ts'
import { createRainLayer } from './rain.ts'
import { createRuntime } from './runtime.ts'
import { createVitals } from './vitals.ts'
import type { VitalsSample } from './vitals.ts'


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

  /** What `?skip=` asked to leave out. See `scene/audit.ts`. */
  skip?: ScapeSkips

  /**
   * Build everything, measure it, and never draw.
   *
   * `?audit` — the scape is assembled exactly as it would be, every program is
   * linked by `renderer.compile`, and then the loop simply never starts. The
   * report is the whole output. On a device that loses its context to a bad
   * program this is the only way to read the shape of the scene it died in.
   */
  auditOnly?: boolean
  onFocus(point: Vector3): void
  onManualControl(): void

  /** A waypoint tour, when the reader has built one. Drives the same camera target a drag does. */
  path?: CameraPath

  /** Where to open, when a previous session left an answer. Overrules `camera.focusX`/`focusZ`. */
  opening?: CameraOpening | null

  /** Where the camera came to rest, each time it does. */
  onPoseSettled?(pose: CameraOpening): void

  /** Fresh frame numbers, four times a second, for an on-screen readout. */
  onVitals?(sample: VitalsSample): void

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

/**
 * The budget a shader has to fit inside, said out loud.
 *
 * `MAX_VARYING_COMPONENTS` is the number that mattered and nobody was looking at
 * it. A PowerVR D-Series handset reports 60 — 15 vec4, the floor GLES 3.0
 * allows — where a desktop reports 120, and a `MeshStandardMaterial` with
 * shadows, fog and instancing spends most of that before this scape adds a
 * thing. Past the ceiling the driver declines to link, three binds the unlinked
 * program regardless, and the context goes away a few seconds later looking for
 * all the world like a thermal failure. Two integers in the log are cheaper than
 * the four device logs it took to find that out.
 *
 * Firefox reports a canned adapter string here, so the numbers are also the only
 * honest description of the device it will give up.
 */
/**
 * The renderer, with one door closed behind it.
 *
 * Built here rather than left to `createApp` so that `setSize` can be wrapped
 * before anything is allowed to call it. The library's resize observer has no
 * debounce, and a phone's collapsing url bar fires it dozens of times a second
 * with fractional css sizes — most of which round to the *same* drawing buffer.
 * Every one of those reallocates the swap chain for no change at all, and swap
 * chain allocation is exactly what this scape has already watched fail on a
 * handset. So a resize to a buffer the renderer already has is not a resize.
 */
function buildRenderer (
  canvas:  HTMLCanvasElement,
  quality: AtmosphereQuality,
  shadows: boolean,
): WebGLRenderer {
  const renderer = createRenderer({
    canvas,
    antialias:           quality.antialias,
    pixelRatioMax:       quality.pixelRatioMax,
    shadows,
    toneMappingExposure: 0.98,
  })

  const resize = renderer.setSize.bind(renderer)
  const buffer = renderer.getDrawingBufferSize(new Vector2())

  // Seeded from the buffer `createRenderer` just allocated, so the first thing
  // to ask for that same buffer — the runtime module, applying a pixel ratio the
  // tier already chose — does not reallocate it to arrive where it already is.
  let width  = buffer.x
  let height = buffer.y

  renderer.setSize = (nextWidth: number, nextHeight: number, updateStyle?: boolean): void => {
    // The ratio is part of the comparison because it is part of the buffer. A
    // live pixel-ratio change keeps the css box and replaces everything behind
    // it, and that is a resize even though nothing on screen moved.
    const ratio        = renderer.getPixelRatio()
    const bufferWidth  = Math.round(nextWidth * ratio)
    const bufferHeight = Math.round(nextHeight * ratio)

    if (bufferWidth === width && bufferHeight === height)
      return

    width  = bufferWidth
    height = bufferHeight
    resize(nextWidth, nextHeight, updateStyle)
  }

  return renderer
}

function describeBudget (gl: WebGL2RenderingContext): string {
  return [
    `varyings ${gl.getParameter(gl.MAX_VARYING_COMPONENTS)}c`,
    `attribs ${gl.getParameter(gl.MAX_VERTEX_ATTRIBS)}`,
    `vtx uniforms ${gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)}`,
    `texture units ${gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)}`,
  ].join(' · ')
}

/**
 * Build a layer unless the url asked for it to be left out.
 *
 * A function rather than four ternaries in the composition root, because four
 * ternaries are four branches in one already long function — and every optional
 * layer the scape gains would add another. The thunk is what keeps it honest:
 * a skipped family must never have its builder run, only its result discarded.
 */
function unless<T> (skip: ScapeSkips, family: ScapeFamily, build: () => T): T | null {
  return skip.has(family) ? null : build()
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
  const skip        = options.skip ?? NOTHING_SKIPPED

  // Built before anything that asks it a question. It owns the shadow map's
  // refresh rate, and the atmosphere has to know the answer before it decides
  // whether fitting a frustum is worth doing this frame.
  const runtime    = createRuntime(config)
  const landscape  = createLandscape(config, quality, skip)
  const atmosphere = createAtmosphereLayer({
    camera,
    config,
    quality,
    groundRadius: config.archipelago.worldSize * 0.8,
    shadowDue:    runtime.shadowDue,
  })

  // Both clocks, live. The landscape and the atmosphere are both mounted ahead
  // of the mist, so the hour and the week the sheets read have already been
  // resolved for this frame by the time they are asked for.
  const mist = unless(skip, 'mist', () => createMistLayer({
    camera,
    config,
    quality,
    daylight: atmosphere.daylight,
    season:   landscape.season,
  }))

  const clouds = unless(skip, 'clouds', () =>
    createCloudLayer({ camera, config, quality, daylight: atmosphere.daylight }))

  // One clock, because there is only one question: how much sky the sun has
  // left. The arc it is on already knows what week of the year it is, so the
  // aurora does not need the year a second time. Returns null on any tier with
  // no veils to give, so the cheapest device simply has a plain sky rather than
  // a dimmer one.
  const aurora = unless(skip, 'aurora', () => createAuroraLayer({
    camera,
    config,
    quality,
    daylight: atmosphere.daylight,
  }))

  // The second and third clocks — the weather for how hard it is falling, the
  // year for what it falls as. Mounted after the landscape, which is what
  // resolves both of them, so the column draws the same instant the ground
  // beneath it is wet from. Returns null on the tier with no drops to give.
  const rain = unless(skip, 'rain', () => createRainLayer({
    camera,
    config,
    quality,
    weather: landscape.weather,
    season:  landscape.season,
  }))

  // The coastal light, mounted after the atmosphere because what decides whether
  // a lamp is burning is how far the sun is down — and after the landscape,
  // because where the lamp *is* comes out of the survey. Returns null when no
  // island in the archipelago had a rock far enough out to build a tower on.
  const beacon = unless(skip, 'beacon', () => createBeaconLight({
    config,
    quality,
    hubs:     landscape.lanternHubs,
    daylight: atmosphere.daylight,
  }))

  // The whole optical chain is one module, and on the cheapest tier it is simply
  // absent — with nothing claiming the `render` hook the app falls back to
  // drawing the scene straight to the canvas, which is two HDR ping-pong targets
  // and every fullscreen pass cheaper than the composer that would replace it.
  const post = quality.post && !skip.has('post')
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
    boatFleet:       landscape.boatFleet,
    limits:          config.camera,
    maxFocus:        config.archipelago.worldSize * 0.48,
    reducedMotion:   options.reducedMotion,
    onFocus:         options.onFocus,
    onManualControl: options.onManualControl,
    path:            options.path,
    opening:         options.opening,
    onPoseSettled:   options.onPoseSettled,
  })

  const modules = [
    // First, so everything it changes is already in force on the frame it
    // changed them on — and so `shadowDue` is settled before it is asked.
    runtime.module,
    landscape.module,
    controls,
    atmosphere.module,
    mist,
    clouds,
    aurora,
    rain,
    beacon,
    post,
  ].filter((module): module is AppModule<Record<string, never>> => module !== null)

  const app = createApp<Record<string, never>>(canvas, {
    state: {},
    seed:  config.seed,
    camera,

    // Always passed, including the 0 that means "every animation frame" — the
    // framecapper's rate is a shared singleton, so a tier that wants no cap has
    // to say so rather than inherit whatever the last scape asked for.
    loop:     { fps: quality.frameRate },
    renderer: buildRenderer(canvas, quality, quality.shadows && !skip.has('shadows')),
    use:      modules,
  })

  // Mounted after everything it measures, and last of all so that nothing it
  // does can come between a module and the frame. It declares no `render` hook,
  // so the post chain — or the bare renderer — still owns the draw.
  const vitals = createVitals({
    renderer: app.ctx.renderer,
    camera,
    verbose:  diagnostics.verbose,
    report:   line => diagnostics.vitals(line),
    notice:   message => diagnostics.say(message),
    sample:   options.onVitals,
  })

  app.use(vitals.module)

  const gl = app.ctx.renderer.getContext() as WebGL2RenderingContext

  diagnostics.say([
    `${quality.tier} tier`,
    `buffer ${gl.drawingBufferWidth}×${gl.drawingBufferHeight}`,
    `ratio ${app.ctx.renderer.getPixelRatio()}`,
    `${quality.frameRate || 'un'}capped`,
    `post ${quality.post ? 'on' : 'off'}`,
    `shadows ${quality.shadows && !skip.has('shadows') ? 'on' : 'off'}`,
    `built in ${Math.round(performance.now() - buildStarted)}ms`,
  ].join(' · '))

  diagnostics.say(`gpu ${describeGpu(gl)}`)
  diagnostics.say(describeBudget(gl))

  // The ordinary path also checks the programs compiled during mount. An audit
  // run deliberately stops here; it proves the scene can be assembled without
  // submitting a frame to a driver that has already refused a program.
  const stoppedByAudit = reportPrograms(app.ctx.renderer, diagnostics, options.auditOnly ?? false)
  let contextLost      = false

  /**
   * Run only when there is something to run for.
   *
   * A backgrounded phone that keeps drawing is a phone heating up for nobody,
   * and heat is what the GPU gives up the context over in the first place.
   */
  function settle (): void {
    if (contextLost || document.hidden || stoppedByAudit)
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

// perf: createApp owns the only render loop, resize observer and teardown path.
// scene modules share that lifecycle rather than adding raf work. The loop is
// paced to `config.runtime.frameCap` and parked whenever the document is
// hidden, so the gpu is only ever asked for frames somebody is looking at, and
// a resize to a buffer the renderer already has costs nothing at all.
