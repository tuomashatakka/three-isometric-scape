import './style.css'
import { SCAPE_CONFIG } from './scene/config.ts'
import type { ScapeConfig } from './scene/config.ts'
import { createConfigAccess } from './scene/config-access.ts'
import { createIsometricScape } from './scene/create-isometric-scape.ts'
import type { AtmosphereQuality } from './scene/quality.ts'
import {
  describeQualitySignals,
  readQualitySignals,
  withEffects,
} from './scene/quality.ts'
import { readSkips } from './scene/audit.ts'
import { createCameraPath } from './scene/camera-path.ts'
import { createTierMemory } from './scene/tier-memory.ts'
import { createContextRecovery, createScapeStatus } from './context-recovery.ts'
import { createUrlOverrides } from './url-overrides.ts'
import { createCameraPathPanel } from './ui/camera-path-panel.ts'
import { createCameraStore } from './ui/camera-state.ts'
import { createDiagnostics } from './ui/diagnostics.ts'
import { createFpsMeter } from './ui/fps-meter.ts'
import { createGraphicsPanel } from './ui/graphics-panel.ts'
import { readCardHidden, writeCardHidden } from './ui/overlay-state.ts'
import { createScapeCard } from './ui/scape-card.ts'
import { createScapeControls } from './ui/scape-controls.ts'
import { createSettingsStore } from './ui/settings-store.ts'


const firstCanvas = document.querySelector<HTMLCanvasElement>('[data-scape]')
const statusSlot  = document.querySelector<HTMLOutputElement>('#scape-status')
const cardSlot    = document.querySelector<HTMLElement>('#scape-card')
const drawerSlot  = document.querySelector<HTMLElement>('#gfx')

if (!firstCanvas || !statusSlot || !drawerSlot)
  throw new Error('three-iso requires the scape canvas, status output and graphics drawer')

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const compactLayout = window.matchMedia('(max-width: 40rem)').matches
const coarsePointer = window.matchMedia('(pointer: coarse)').matches

// Installed first, and deliberately before anything that could fail: on a phone
// this log is the only place an error can be read at all. `?debug` adds the
// live frame-and-memory line on top of the events.
const params = new URLSearchParams(window.location.search)

const diagnostics = createDiagnostics({
  output:  statusSlot,
  verbose: params.has('debug'),
})

/**
 * Build it, measure it, never draw it.
 *
 * The scape is assembled exactly as it would be and the loop simply never
 * starts, so every program gets linked and reported without a single draw going
 * near the driver. On a handset that loses its context to a program three bound
 * without checking, this is the only way to read the scene it died in.
 */
const auditing = params.has('audit')

// Which families to leave out — the axis that turns "this program failed" into
// "and the scape lives without the thing that built it".
const skip = readSkips(params.get('skip'), message => diagnostics.say(message))

const signals = readQualitySignals()
const memory  = createTierMemory()

diagnostics.say(describeQualitySignals(signals))
diagnostics.say(navigator.userAgent)

// From here `SCAPE_CONFIG` is the authored defaults and nothing else. Every
// read and every write in this file goes through the access, which knows
// whether the scape has mounted and taken the config into its store yet.
const scape = createConfigAccess<ScapeConfig>(SCAPE_CONFIG)

const urls = createUrlOverrides({
  params,
  signals,
  memory,
  config: scape,
  say:    message => diagnostics.say(message),
})

/**
 * Frames between shadow-map rebuilds, on the tiers that have shadows.
 *
 * Three rebuilds the entire depth pass — the terrain, the merged steading and
 * every scattered instance — on every frame it draws, at up to 4096². The sun
 * crosses this sky over minutes and the foliage sway is a slow shader animation,
 * so a map that is one frame old is a map nobody can tell from a fresh one, and
 * it costs half the pass. The panel exposes it; this is only where it starts.
 */
const SHADOW_CADENCE = 2

/** Whatever the last `mount` built, held only so it can be taken down again. */
interface Mounted {
  dispose(): void
}

/**
 * Point the runtime knobs at whatever tier is in force.
 *
 * These three are the only values in the config that are not authored, and the
 * only ones the settings snapshot deliberately forgets — so this is the whole
 * story of where they come from. Called before the store captures the authored
 * values, again when a reset asks for them back, and again after a context loss
 * has bought a cheaper tier, because the budget that just failed is the one
 * thing the rebuild must not be handed.
 */
function seedRuntime (from: AtmosphereQuality): void {
  // The tier's number is a *ceiling* on the display's, and the knob is applied
  // straight to the renderer — so seeding the ceiling on a device below it would
  // hand the scape more pixels than it has ever drawn.
  scape.write('runtime.pixelRatio', Math.min(globalThis.devicePixelRatio || 1, from.pixelRatioMax))
  scape.write('runtime.frameCap', from.frameRate)
  scape.write('runtime.shadowCadence', from.shadows ? SHADOW_CADENCE : 1)
}

// Built once, before anything has been loaded over the config: the store keeps
// the authored values so `reset` can give them back, and after a rebuild the
// config no longer holds them. The control list is the same shape at every tier
// — only which knobs render as available differs — so one store covers them all.
const initialQuality = urls.startingQuality()

seedRuntime(initialQuality)

const status   = createScapeStatus(initialQuality)
const settings = createSettingsStore(scape, createScapeControls(initialQuality))

settings.load()
urls.startingEffects()

/**
 * Where the reader last was, and the tour they last built.
 *
 * Loaded before the scape so the first frame is already framed on it, rather
 * than opening on the middle of the sea and jumping.
 *
 * `?camera=fresh` opts out, and every capture sends it. Storage is per origin,
 * not per page load, so six poses shot through one browser context would
 * otherwise each inherit the camera the pose before it settled at — which is
 * not a tour of six poses, it is one pose photographed six times. The same rule
 * the url overrides already follow for the sliders: a capture that silently
 * inherited somebody else's camera is a capture of the wrong scape.
 */
const cameraStore   = createCameraStore()
const cameraSession = params.get('camera') === 'fresh'
  ? { opening: null, waypoints: [], legSeconds: 6, loop: true }
  : cameraStore.load()
const cameraPath    = createCameraPath({
  legSeconds: cameraSession.legSeconds,
  loop:       cameraSession.loop,
})

cameraPath.replace(cameraSession.waypoints)

let opening = cameraSession.opening

function saveCameraSession (): void {
  cameraStore.save({
    opening,
    waypoints:  [ ...cameraPath.waypoints ],
    legSeconds: cameraPath.options.legSeconds,
    loop:       cameraPath.options.loop,
  })
}

urls.applyToConfig()

// Built once and outside `mount`: the card is markup that shipped with the page
// and it survives the canvas being replaced under it after a context loss.
//
// `?debug` opens it whatever was last chosen. The log inside is the only crash
// report a phone gives, and a debugging surface you have to already know a
// keyboard shortcut to reach is not one.
const card = cardSlot && firstCanvas.parentElement
  ? createScapeCard({
    card:     cardSlot,
    host:     firstCanvas.parentElement,
    hidden:   params.has('debug') ? false : readCardHidden() ?? true,
    onToggle: hidden => writeCardHidden(hidden),
  })
  : null

let mounted: Mounted | null = null

// the loading overlay ships in index.html so it is visible on the very first
// paint. dismissed here once data-scape-state reaches 'ready' — meaning the
// first frame is genuinely drawn, not merely that the module finished importing.
// re-shown on context loss ('lost') so the reader is not left staring at a dead
// canvas, and left visible on 'failed' so the error message is not hidden behind
// a spinner that never stops.
const loader = document.querySelector<HTMLElement>('#loader')

if (loader) {
  const observer = new MutationObserver(() => {
    const state = document.documentElement.dataset.scapeState

    // Never disconnected. A context loss remounts the canvas and drives the
    // state back to 'lost', and an observer torn down on the first 'ready'
    // could not hear it — which is the whole re-show this exists for, working
    // exactly once and then silently not.
    if (state === 'ready')
      loader.dataset.hidden = ''
    else if (state === 'lost' || state === 'booting')
      delete loader.dataset.hidden
  })

  observer.observe(document.documentElement, {
    attributes:      true,
    attributeFilter: [ 'data-scape-state' ],
  })
}

/**
 * Assemble the scape, on the canvas and at the budget the ladder hands over.
 *
 * Both arrive as arguments rather than as module state: the recovery ladder is
 * the single writer of which canvas is live and which tier it is allowed to
 * spend, and a second copy here is a second answer waiting to disagree.
 */
function mount (canvas: HTMLCanvasElement, quality: AtmosphereQuality): void {
  // Built before the scape, because the scape is handed the callback that feeds
  // it. Verbose adds what the frame was spent on to what it cost.
  const meter = createFpsMeter({ verbose: params.has('debug') })

  // The tier, plus whatever the reader asked to be built on top of it. `quality`
  // stays the tier as detected — folding the reader's answer to the effects
  // switch into it would make a device that survived `mobile` with everything
  // turned on look like a device that survived `desktop`.
  const active = withEffects(quality, scape.read().runtime.effects)

  const built = createIsometricScape(canvas, scape.read(), {
    quality: active,
    reducedMotion,
    path:    cameraPath,
    opening,

    // Written back to the module-level `opening` as well as to storage, so a
    // rebuild — a context loss, or the effects switch — reopens on where the
    // reader was rather than throwing them back out to sea.
    onPoseSettled (pose) {
      opening = pose
      saveCameraSession()
    },
    diagnostics,
    skip,
    auditOnly: auditing,

    // The readout on the canvas is for a person watching; the same numbers go
    // onto the root element for whatever is driving the page from outside it.
    // A scape that has issued a draw call has drawn, which is the only
    // definition of ready that does not depend on how fast the device is — and
    // the store decides whether that still means anything by the time it lands.
    onVitals (sample) {
      const root = document.documentElement.dataset

      meter.update(sample)

      root.scapeFps   = sample.fps.toFixed(1)
      root.scapeCalls = String(sample.calls)
      root.scapeTris  = String(sample.triangles)
      root.scapeDrawn = String(sample.drawn)

      if (sample.calls > 0)
        status.dispatch({ type: 'drawn' })
    },

    // The camera talks constantly, and none of it survives a crash worth
    // reading. It stays out of the log and off the one surface the log owns.
    onFocus () {
      // nothing to report — the frame is the feedback
    },
    onManualControl () {
      // as above
    },
    onContextLost () {
      recovery.lost()
    },
  })

  // The overlay writes through the access, which after this mount is the app's
  // own store — and every scene module reads that store's state per frame. So
  // the panel is a view of the scene's settings rather than a copy that has to
  // be pushed anywhere, and there is still exactly one of them.
  const tour = createCameraPathPanel({
    path:     cameraPath,
    poseNow:  () => opening ?? { x: 0, z: 0, viewSize: scape.read().camera.viewSize, heading: 0 },
    onChange: saveCameraSession,
  })

  // Built against the tier the scape was *actually* built with, so a knob whose
  // effect is now present stops rendering as unavailable the moment it is.
  const panel = createGraphicsPanel({
    root:      drawerSlot!,
    config:    scape,
    sections:  createScapeControls(active),
    extras:    [{ group: 'camera', title: 'waypoint tour', content: tour.content, dispose: tour.dispose }],
    tier:      active === quality ? `${quality.tier} tier` : `${quality.tier} tier · all effects`,
    collapsed: compactLayout || coarsePointer,
    onChange:  () => settings.save(),

    // The performance section is outside the snapshot, so `reset` cannot give
    // its values back the way it gives the others back — they are re-derived
    // from the tier instead, which is where they came from in the first place.
    onReset: () => {
      seedRuntime(status.get().quality)
      settings.reset()
      recovery.rebuild()
    },

    onRebuild: () => recovery.rebuild(),
  })

  // The store the app just built is the config's owner until this mount comes
  // down again, so every knob the reader moves from here lands in it.
  const release = scape.adopt(built.store)

  canvas.parentElement?.append(meter.element)

  mounted = {
    dispose () {
      meter.dispose()
      panel.dispose()
      release()
      built.dispose()
    },
  }
}

function unmount (): void {
  mounted?.dispose()
  mounted = null
}

const recovery = createContextRecovery({
  status,
  canvas: firstCanvas,
  diagnostics,
  memory,
  config: scape,
  mount,
  unmount,
  seed:   seedRuntime,
  save:   () => settings.save(),

  // A scape that never drew has not survived anything, so an audit run must not
  // leave a verdict behind for the next ordinary load to inherit.
  remember: !auditing,
})

if (recovery.build())
  diagnostics.say(compactLayout ? 'ready · tap and drag to explore' : 'ready · select the canvas for keys')

window.addEventListener('pagehide', event => {
  // A frozen page comes back through `pageshow` with everything it had, so the
  // scape has to still be there when it does — and on a phone `pagehide` fires
  // every time the browser is backgrounded. Tearing down on that is what left a
  // dead canvas behind on the way back. Freezing already parks the loop, so
  // there is nothing to release until the page is really going away.
  if (event.persisted)
    return

  settings.dispose()
  card?.dispose()
  recovery.dispose()
})
