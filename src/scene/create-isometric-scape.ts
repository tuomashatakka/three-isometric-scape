import { Vector2, Vector3 } from 'three'
import type { Mesh, OrthographicCamera, WebGLRenderer } from 'three'
import { createApp, createIsoCamera, createRenderer, reportPrograms } from 'threejs-scene'
import type { Store } from 'threejs-scene'
import { NOTHING_SKIPPED } from './audit.ts'
import type { ScapeFamily, ScapeSkips } from './audit.ts'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import { createAtmosphereLayer } from './atmosphere.ts'
import { createAuroraLayer } from './aurora.ts'
import { createBeaconLight } from './beacon.ts'
import { createBirdFlocks } from './birds.ts'
import { createCameraControls } from './camera-controls.ts'
import type { CameraOpening } from './camera-controls.ts'
import type { CameraPath } from './camera-path.ts'
import { createCloudLayer } from './clouds.ts'
import { createHearthSmoke } from './hearth.ts'
import type { DaylightState } from './daylight.ts'
import { createLandscape } from './landscape/index.ts'
import type { Landscape } from './landscape/index.ts'
import { createMistLayer } from './mist.ts'
import { createNightSky } from './nightsky.ts'
import type { SeasonState } from './season.ts'
import { createAtmospherePost } from './post.ts'
import type { AtmosphereQuality } from './quality.ts'
import { createRainLayer } from './rain.ts'
import { createRuntime } from './runtime.ts'
import { createVitals } from './vitals.ts'
import { createWindowLamps } from './windows.ts'
import type { VitalsSample } from './vitals.ts'
import { createWind } from './wind.ts'
import type { WindState } from './wind.ts'


export interface IsometricScape {

  /**
   * Where the config lives once the scape has mounted.
   *
   * `createApp` puts it in the store, and from that moment the store is its
   * single writer — the overlay, the settings snapshot and anything else that
   * moves a knob go through here rather than reaching for the module singleton,
   * which is one write out of date the moment the first slider moves.
   */
  store: Store<ScapeConfig>

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

interface SkyOptions {
  camera:   OrthographicCamera
  config:   LiveConfig
  quality:  AtmosphereQuality
  skip:     ScapeSkips
  daylight: DaylightState
  season:   SeasonState

  /** The one wind. The mist and the deck answer it; the aurora deliberately does not. */
  wind: WindState
}

/**
 * Everything hung above the water, in the order it is hung.
 *
 * Four sheets that differ only in what they carry: the landscape and the
 * atmosphere are both mounted ahead of them, so the hour and the week each one
 * reads have already been resolved for this frame by the time it asks. The
 * mist takes both clocks; the cloud deck and the aurora take the day, because
 * the arc it is on already knows what week of the year it is; the night sky
 * takes the two phases themselves rather than what the rig derived from them,
 * since the hour *is* the star wheel's angle and the week is what the month is
 * counted off. Each returns null on a tier with nothing to give, so the
 * cheapest device gets a plain sky rather than a poor one.
 */
function hangSkies ({ camera, config, quality, skip, daylight, season, wind }: SkyOptions): ScapeModule[] {
  return [
    unless(skip, 'mist', () => createMistLayer({ camera, config, quality, daylight, season, wind })),
    unless(skip, 'clouds', () => createCloudLayer({ camera, config, quality, daylight, wind })),
    unless(skip, 'aurora', () => createAuroraLayer({ camera, config, quality, daylight })),
    unless(skip, 'nightsky', () => createNightSky({ camera, config, quality, daylight })),
  ].filter((module): module is ScapeModule => module !== null)
}

interface GroundLayerOptions {
  camera:    OrthographicCamera
  config:    LiveConfig
  quality:   AtmosphereQuality
  skip:      ScapeSkips
  landscape: Landscape

  /** The hour, as the atmosphere resolved it for this frame. */
  daylight: DaylightState

  /** The one wind. */
  wind: WindState
}

/**
 * Everything that stands over the islands rather than over the world.
 *
 * Five layers that differ only in what they answer to, and they are grouped for
 * the same reason the skies are: each needs the landscape *and* the atmosphere
 * to exist first, so none of them can be built where the two are being built.
 * The fall takes the weather for how hard it comes down and the year for what it
 * comes down as; the gulls take the day for whether they are up; the coastal
 * light takes the day for whether the lamp is lit; the hearth smoke takes the
 * year for how hard the fires are banked; and the window lamps take the day for
 * dusk and the *clock* for whether anybody is up to have lit one. Four of the
 * five are also *sited* by the survey, and every one of them returns null on a
 * tier — or an archipelago — with nothing to give, so the cheapest device gets a
 * graceful absence rather than a poor version.
 */
function hangOverTheGround (
  { camera, config, quality, skip, landscape, daylight, wind }: GroundLayerOptions,
): ScapeModule[] {
  return [
    unless(skip, 'rain', () => createRainLayer({
      camera,
      config,
      quality,
      weather: landscape.weather,
      season:  landscape.season,
      wind,
    })),
    unless(skip, 'birds', () => createBirdFlocks({
      camera,
      config,
      quality,
      colonies: landscape.colonies,
      daylight,
      weather:  landscape.weather,
      wind,
    })),
    unless(skip, 'beacon', () => createBeaconLight({
      config,
      quality,
      hubs: landscape.lanternHubs,
      daylight,
    })),
    unless(skip, 'hearth', () => createHearthSmoke({
      config,
      quality,
      stacks: landscape.hearths,
      daylight,
      season: landscape.season,
      wind,
    })),
    unless(skip, 'windows', () => createWindowLamps({
      config,
      quality,
      panes: landscape.windows,
      daylight,
    })),
  ].filter((module): module is ScapeModule => module !== null)
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

  // Which config object is current.
  //
  // The store commits a *new* one on every write, so anything that outlives a
  // single tick reads through `readConfig` rather than holding what it was
  // built with. This is the only place that knows, and the subscription below —
  // the store telling us it has committed — is the only thing that writes it.
  let live = config

  const readConfig: LiveConfig = () => live

  // Built before anything that asks it a question. It owns the shadow map's
  // refresh rate, and the atmosphere has to know the answer before it decides
  // whether fitting a frustum is worth doing this frame.
  const runtime = createRuntime(readConfig)

  // The fourth clock, and mounted ahead of everything that answers to it. One
  // wind, resolved once a frame: the grass, the mist, the deck overhead, the
  // fall, the sails, the swell and the ice all read this same record, so a gust
  // is one event crossing the scape rather than five that happen to coincide.
  const wind       = createWind(readConfig)
  const landscape  = createLandscape(readConfig, quality, wind.state, skip)
  const atmosphere = createAtmosphereLayer({
    camera,
    config:       readConfig,
    quality,
    groundRadius: config.archipelago.worldSize * 0.8,
    shadowDue:    runtime.shadowDue,
  })

  const skies = hangSkies({
    camera,
    config:   readConfig,
    quality,
    skip,
    daylight: atmosphere.daylight,
    season:   landscape.season,
    wind:     wind.state,
  })

  // Everything mounted after *both* the landscape and the atmosphere. Each of
  // these reads a state one of those two resolves, and three of the four are
  // sited from the survey, so none of them can be built before either exists.
  const overGround = hangOverTheGround({
    camera,
    config:   readConfig,
    quality,
    skip,
    landscape,
    daylight: atmosphere.daylight,
    wind:     wind.state,
  })

  // The whole optical chain is one module, and on the cheapest tier it is simply
  // absent — with nothing claiming the `render` hook the app falls back to
  // drawing the scene straight to the canvas, which is two HDR ping-pong targets
  // and every fullscreen pass cheaper than the composer that would replace it.
  const post = quality.post && !skip.has('post')
    ? createAtmospherePost({
      camera,
      config:        readConfig,
      quality,
      reducedMotion: options.reducedMotion,
      sunPosition:   atmosphere.sunPosition,
      // Resolved lazily: post builds last, so the lake already exists by the
      // time the composer asks what it should be reflecting.
      water:         () => landscape.surfaces.find(surface => surface.name === 'water') as Mesh | null ?? null,
    })
    : null

  const controls = createCameraControls({
    camera,
    canvas,
    landscape,
    boatFleet:       landscape.boatFleet,
    limits:          () => readConfig().camera,
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

    // Before the landscape, because the landscape's materials and its lake read
    // the wind this resolves. A module that sampled it a second time would be
    // reading a different gust in the same frame.
    wind.module,
    landscape.module,
    controls,
    atmosphere.module,
    ...skies,
    ...overGround,
    post,
  ].filter((module): module is ScapeModule => module !== null)

  const app = createApp<ScapeConfig>(canvas, {
    state: config,
    seed:  config.seed,
    camera,

    // Always passed, including the 0 that means "every animation frame" — the
    // framecapper's rate is a shared singleton, so a tier that wants no cap has
    // to say so rather than inherit whatever the last scape asked for.
    loop:     { fps: quality.frameRate },
    renderer: buildRenderer(canvas, quality, quality.shadows && !skip.has('shadows')),
    use:      modules,
  })

  // From here the store is the config's owner, and every module that reads a
  // knob per frame is reading whatever this hands back.
  const forget = app.store.subscribe(next => {
    live = next
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
    store: app.store,

    dispose () {
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      canvas.removeEventListener('webglcontextcreationerror', handleCreationError)
      document.removeEventListener('visibilitychange', handleVisibility)
      forget()
      app.dispose()
    },
  }
}

// perf: createApp owns the only render loop, resize observer and teardown path.
// scene modules share that lifecycle rather than adding raf work. The loop is
// paced to `config.runtime.frameCap` and parked whenever the document is
// hidden, so the gpu is only ever asked for frames somebody is looking at, and
// a resize to a buffer the renderer already has costs nothing at all.
