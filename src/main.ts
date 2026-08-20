import './style.css'
import { writePath } from 'threejs-scene'
import { SCAPE_CONFIG } from './scene/config.ts'
import { createIsometricScape } from './scene/create-isometric-scape.ts'
import type { AtmosphereQuality } from './scene/quality.ts'
import {
  atmosphereQuality,
  describeQualitySignals,
  isAtmosphereQualityTier,
  isQualityEffects,
  readQualitySignals,
  reduceAtmosphereQuality,
  selectAtmosphereQuality,
  withEffects,
} from './scene/quality.ts'
import { readSkips } from './scene/audit.ts'
import { createCameraPath } from './scene/camera-path.ts'
import { createTierMemory } from './scene/tier-memory.ts'
import { createCameraPathPanel } from './ui/camera-path-panel.ts'
import { createCameraStore } from './ui/camera-state.ts'
import { createDiagnostics } from './ui/diagnostics.ts'
import { createFpsMeter } from './ui/fps-meter.ts'
import { createGraphicsPanel } from './ui/graphics-panel.ts'
import { readCardHidden, writeCardHidden } from './ui/overlay-state.ts'
import { createScapeCard } from './ui/scape-card.ts'
import { createScapeControls } from './ui/scape-controls.ts'
import { createSettingsStore } from './ui/settings-store.ts'


/**
 * What the scape is doing, on the root element.
 *
 * Deliberately *not* `data-scape` — that attribute already marks the canvas,
 * and a document-order `querySelector` for it would find `<html>` first the
 * moment this was written. The screenshot tool waits on `ready` here rather
 * than on a timeout, because a timeout long enough for the slowest tier is a
 * timeout wasted on every other one.
 */
type ScapeState = 'booting' | 'ready' | 'lost' | 'failed'

function announce (state: ScapeState): void {
  document.documentElement.dataset.scapeState = state
}

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

/**
 * How long to leave the GPU alone before asking it for another context.
 *
 * A driver that has just reset is in no state to hand out a new context, and
 * asking immediately is how one loss turns into a loop of them.
 */
const RECOVERY_DELAY = 900

/**
 * How long a tier has to survive before it counts as survivable.
 *
 * Long enough to clear the window every loss on record has landed inside — the
 * device log showed one at 0.7s and one at 6.3s — and short enough that the
 * verdict is written before anyone navigates away from a scape that is working.
 */
const GRACE = 9000

/**
 * How many contexts one page load is allowed to spend.
 *
 * Not a guess at what the device can take — a guess at what the *browser* will
 * tolerate. Chrome counts context losses per origin and, past some threshold,
 * refuses to create another one at all: `A WebGL context could not be created.
 * Reason: Web page caused context loss and was blocked`. That state is strictly
 * worse than the crash it followed, because the scape then cannot start at any
 * tier, and it outlives the tab. Two is enough to walk one step down the ladder
 * and see whether the step helped; a third is spending the reader's goodwill
 * with their browser on a device that has already answered twice.
 */
const MAX_LOSSES = 2

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
  SCAPE_CONFIG.runtime.pixelRatio    = Math.min(globalThis.devicePixelRatio || 1, from.pixelRatioMax)
  SCAPE_CONFIG.runtime.frameCap      = from.frameRate
  SCAPE_CONFIG.runtime.shadowCadence = from.shadows ? SHADOW_CADENCE : 1
}

/**
 * The optical chain, forced either way from the url.
 *
 * A tier is a bundle of decisions, so a device that fails on one cannot say which
 * decision it failed on. `?post=0` takes the whole optical chain out from under a
 * tier that otherwise keeps its geometry, resolution and frame cap, and `?post=1`
 * puts it back where a tier would not have built one — which is how the chain was
 * ruled out as the cause of the context loss rather than assumed either way.
 */
function withPostOverride (quality: AtmosphereQuality): AtmosphereQuality {
  const forced = params.get('post')

  if (forced !== '0' && forced !== '1')
    return quality

  const post = forced === '1'

  diagnostics.say(`post chain forced ${post ? 'on' : 'off'} by the url`)

  return { ...quality, post }
}

/**
 * One knob at a time, over the top of whatever tier was chosen.
 *
 * A tier changes fifteen things at once, so a tier that survives where another
 * dies cannot say which of the fifteen mattered. `?ratio=` and `?aa=` pull the
 * two that touch the *surface* rather than the workload out on their own —
 * which is the difference between the tiers this device lives on and the ones
 * it dies on, once frame cost has been ruled out.
 */
function withSurfaceOverrides (quality: AtmosphereQuality): AtmosphereQuality {
  const ratio = Number(params.get('ratio'))
  const aa    = params.get('aa')
  let forced  = quality

  if (Number.isFinite(ratio) && ratio > 0) {
    diagnostics.say(`pixel ratio forced to ${ratio} by the url`)
    forced = { ...forced, pixelRatioMax: ratio }
  }

  if (aa === '0' || aa === '1') {
    diagnostics.say(`antialias forced ${aa === '1' ? 'on' : 'off'} by the url`)
    forced = { ...forced, antialias: aa === '1' }
  }

  return forced
}

/**
 * Which tier to open on: what the signals ask for, held down by what the device
 * has already proven, unless the url overrules both.
 */
/**
 * The effects mode, forced from the url.
 *
 * `?effects=all` is the capture-time equivalent of the drawer's switch, and the
 * only way to photograph a phone tier with the whole optical chain on it.
 */
function startingEffects (): void {
  const forced = params.get('effects')

  if (forced && isQualityEffects(forced)) {
    SCAPE_CONFIG.runtime.effects = forced
    diagnostics.say(`effects forced to ${forced} by the url`)
  }
}

function startingQuality (): AtmosphereQuality {
  const forced = params.get('tier')

  if (forced && isAtmosphereQualityTier(forced)) {
    // An explicit tier is a question about this build, and a stored verdict
    // would keep answering the old one over the top of it.
    memory.forget()
    diagnostics.say(`tier forced to ${forced} by the url`)

    return withSurfaceOverrides(withPostOverride(atmosphereQuality(forced)))
  }

  const picked  = selectAtmosphereQuality(signals)
  const clamped = memory.clamp(picked.tier)

  if (clamped !== picked.tier)
    diagnostics.say(`${picked.tier} tier held down to ${clamped} · this device has dropped a context before`)

  return withSurfaceOverrides(withPostOverride(atmosphereQuality(clamped)))
}

// Built once, before anything has been loaded over the config: the store keeps
// the authored values so `reset` can give them back, and after a rebuild the
// config no longer holds them. The control list is the same shape at every tier
// — only which knobs render as available differs — so one store covers them all.
const initialQuality = startingQuality()

seedRuntime(initialQuality)

const settings = createSettingsStore(SCAPE_CONFIG, createScapeControls(initialQuality))

settings.load()
startingEffects()
announce('booting')

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

/**
 * Every knob in the config, addressable from the url.
 *
 * `?set=camera.rotation=30,daylight.time=0.85`. The paths are the same dotted
 * strings the graphics overlay and the settings snapshot already use, written
 * with the same `writePath` — so there is exactly one vocabulary for "which
 * number", and a knob added to the config is reachable from here on the day it
 * lands without anyone wiring a parameter for it.
 *
 * Applied *after* `settings.load`, so a url beats whatever the last session
 * left in local storage. A capture that silently inherited someone else's
 * dragged sliders would be a capture of the wrong scape.
 */
function applyUrlOverrides (): void {
  const raw = params.get('set')

  if (!raw)
    return

  for (const entry of raw.split(',')) {
    const split = entry.indexOf('=')

    if (split === -1) {
      diagnostics.say(`?set wants path=value, ignoring "${entry}"`)
      continue
    }

    const path  = entry.slice(0, split).trim()
    const text  = entry.slice(split + 1).trim()
    const value = text === 'true' || text === 'false'
      ? text === 'true'
      : Number.isFinite(Number(text)) && text !== '' ? Number(text) : text

    writePath(SCAPE_CONFIG, path, value)
    diagnostics.say(`${path} set to ${String(value)} by the url`)
  }
}

applyUrlOverrides()

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

let canvas                  = firstCanvas
let quality                 = initialQuality
let mounted: Mounted | null = null
let recovering              = 0
let proving                 = 0
let losses                  = 0
let rebuilding              = 0

/**
 * The tier, plus whatever the reader asked to be built on top of it.
 *
 * `quality` stays the tier as detected — that is what the memory, the fallback
 * ladder and the runtime seeding all reason about, and folding the reader's
 * choice into it would make a device that survived `mobile` with everything
 * turned on look like a device that survived `desktop`. This is the resolved
 * budget the scape is actually built from.
 */
function activeQuality (): AtmosphereQuality {
  return withEffects(quality, SCAPE_CONFIG.runtime.effects)
}

function mount (): void {
  // Built before the scape, because the scape is handed the callback that feeds
  // it. Verbose adds what the frame was spent on to what it cost.
  const meter = createFpsMeter({ verbose: params.has('debug') })

  const active = activeQuality()

  const scape = createIsometricScape(canvas, SCAPE_CONFIG, {
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
    // definition of ready that does not depend on how fast the device is.
    onVitals (sample) {
      const root = document.documentElement.dataset

      meter.update(sample)

      root.scapeFps   = sample.fps.toFixed(1)
      root.scapeCalls = String(sample.calls)
      root.scapeTris  = String(sample.triangles)
      root.scapeDrawn = String(sample.drawn)

      if (sample.calls > 0 && root.scapeState === 'booting')
        announce('ready')
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
      loseContext()
    },
  })

  // The overlay writes straight into `SCAPE_CONFIG`, which every scene module
  // already reads per frame — so it is a view of the scene's settings rather
  // than a copy that has to be pushed anywhere.
  const tour = createCameraPathPanel({
    path:     cameraPath,
    poseNow:  () => opening ?? { x: 0, z: 0, viewSize: SCAPE_CONFIG.camera.viewSize, heading: 0 },
    onChange: saveCameraSession,
  })

  // Built against the tier the scape was *actually* built with, so a knob whose
  // effect is now present stops rendering as unavailable the moment it is.
  const panel = createGraphicsPanel({
    root:      drawerSlot!,
    config:    SCAPE_CONFIG,
    sections:  createScapeControls(active),
    extras:    [{ group: 'camera', title: 'waypoint tour', content: tour.content, dispose: tour.dispose }],
    tier:      active === quality ? `${quality.tier} tier` : `${quality.tier} tier · all effects`,
    collapsed: compactLayout || coarsePointer,
    onChange:  () => settings.save(),

    // The performance section is outside the snapshot, so `reset` cannot give
    // its values back the way it gives the others back — they are re-derived
    // from the tier instead, which is where they came from in the first place.
    onReset: () => {
      seedRuntime(quality)
      settings.reset()
      rebuild()
    },

    onRebuild: () => rebuild(),
  })

  canvas.parentElement?.append(meter.element)

  // A tier that holds this long without dropping the context is a tier the
  // device can simply be handed next time, rather than being walked down to
  // through another crash. Cancelled by `unmount`, so a loss inside the window
  // never gets recorded as a survival.
  // A scape that never drew has not survived anything, so an audit run must not
  // leave a verdict behind for the next ordinary load to inherit.
  window.clearTimeout(proving)

  if (!auditing)
    proving = window.setTimeout(() => memory.remember(quality.tier), GRACE)

  mounted = {
    dispose () {
      meter.dispose()
      panel.dispose()
      scape.dispose()
    },
  }
}

function unmount (): void {
  window.clearTimeout(proving)
  mounted?.dispose()
  mounted = null
}

/**
 * Build it again, on the same canvas and the same tier.
 *
 * For the handful of decisions that are taken once rather than read per frame —
 * whether there is a post chain, whether shadow maps compile, how many drops the
 * rain's one static buffer holds. Deferred by a tick so the control that asked
 * for it has finished its own event first, and coalesced, because a reader
 * flicking the effects switch back and forth should cost one rebuild.
 *
 * The canvas is *not* renewed: its context is alive and well, and asking for a
 * second one is exactly what the loss recovery is careful not to do lightly.
 */
function rebuild (): void {
  window.clearTimeout(rebuilding)
  rebuilding = window.setTimeout(() => {
    unmount()

    try {
      announce('booting')
      mount()
    }
    catch (error) {
      diagnostics.fail(`rebuild failed · ${error instanceof Error ? error.message : String(error)}`)
      announce('failed')
    }
  }, 0)
}

/**
 * A fresh canvas for a fresh context.
 *
 * A canvas hands out exactly one WebGL context for its whole life, so a canvas
 * whose context died is a canvas that can only ever be handed the corpse back —
 * and whether the browser bothers to restore it at all is a per-platform
 * accident. Replacing the element sidesteps the question: the new one has never
 * had a context, so it gets a clean one on request.
 */
function renewCanvas (): void {
  // Deep, so the no-webgl fallback text inside it survives the swap.
  const replacement = canvas.cloneNode(true) as HTMLCanvasElement

  canvas.replaceWith(replacement)
  canvas = replacement
}

/**
 * Come back, but cheaper.
 *
 * The device has just said, in the only way it can, that the budget it was
 * given is more than it has. Rebuilding on the same settings would only ask it
 * the same question again, so every recovery costs a tier — and once there is
 * no tier left to give up, the scape says so instead of thrashing.
 */
function loseContext (): void {
  const next = reduceAtmosphereQuality(quality)

  losses += 1
  announce('lost')
  unmount()

  // The browser is keeping score too, and its penalty is worse than the crash.
  // Chrome blocks an origin from getting *any* further context once a page has
  // lost too many — "Web page caused context loss and was blocked" — and after
  // that the scape cannot even start, on a device where a cheaper tier might
  // have run perfectly. Rebuilding is a budget, so it is spent like one.
  if (losses >= MAX_LOSSES) {
    diagnostics.fail(`${losses} contexts lost · stopping before the browser blocks this page · reload to try again`)
    announce('failed')
    return
  }

  if (!next) {
    diagnostics.fail('no tier left to fall back to · reload to rebuild the scape')
    announce('failed')
    return
  }

  // Written now, not once the rebuild survives: whatever the reader does next —
  // reload, background the tab, give up and come back tomorrow — should start
  // from what we just learned rather than repeat the crash to learn it again.
  memory.remember(next.tier)

  diagnostics.say(`falling back to the ${next.tier} tier in ${RECOVERY_DELAY}ms`)
  quality = next

  // Including whatever the reader had dragged the performance knobs to, and
  // their answer to the effects switch. A device that has just given up its
  // context does not get to keep the budget it gave it up on — and unlocking
  // every effect is the most expensive answer there is to give.
  if (SCAPE_CONFIG.runtime.effects !== 'tier') {
    SCAPE_CONFIG.runtime.effects = 'tier'
    settings.save()
    diagnostics.say('effects put back to the tier default · the device has just refused the unlocked budget')
  }

  seedRuntime(next)

  window.clearTimeout(recovering)
  recovering = window.setTimeout(() => {
    renewCanvas()

    try {
      announce('booting')
      mount()
    }
    catch (error) {
      // A rebuild that cannot even get a context is the end of the line, and
      // throwing out of a timer would only lose the message the reader needs.
      diagnostics.fail(`rebuild failed · ${error instanceof Error ? error.message : String(error)}`)
      announce('failed')
    }
  }, RECOVERY_DELAY)
}

try {
  mount()
  diagnostics.say(compactLayout ? 'ready · tap and drag to explore' : 'ready · select the canvas for keys')
}
catch (error) {
  const message = error instanceof Error ? error.message : String(error)

  diagnostics.fail(`could not build the scape · ${message}`)
  announce('failed')

  // three throws a flat "Error creating WebGL context" whatever the reason, and
  // the reason is the only part worth reading — it arrives separately, through
  // `webglcontextcreationerror`, one line earlier in the log. When the browser
  // has blocklisted the origin after too many losses, "context creation failed"
  // reads as a broken page and sends the reader to reload, which is the one
  // thing that cannot help. So say what actually clears it.
  if ((/creating webgl context|context could not be created/iu).test(message))
    diagnostics.fail('if that says the page was blocked, this origin has lost too many contexts · fully close the browser and reopen, or use a private tab')

  // Deliberately not rethrown. The log *is* the error report on a phone, and an
  // uncaught error on top of a message that already explains itself only buries
  // it under a stack trace nobody can read on a 400-pixel screen.
}

window.addEventListener('pagehide', event => {
  // A frozen page comes back through `pageshow` with everything it had, so the
  // scape has to still be there when it does — and on a phone `pagehide` fires
  // every time the browser is backgrounded. Tearing down on that is what left a
  // dead canvas behind on the way back. Freezing already parks the loop, so
  // there is nothing to release until the page is really going away.
  if (event.persisted)
    return

  window.clearTimeout(recovering)
  window.clearTimeout(rebuilding)
  settings.dispose()
  card?.dispose()
  unmount()
})
