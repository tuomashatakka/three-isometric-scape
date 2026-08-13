import './style.css'
import { SCAPE_CONFIG } from './scene/config.ts'
import { createIsometricScape } from './scene/create-isometric-scape.ts'
import type { AtmosphereQuality } from './scene/quality.ts'
import {
  atmosphereQuality,
  describeQualitySignals,
  isAtmosphereQualityTier,
  readQualitySignals,
  reduceAtmosphereQuality,
  selectAtmosphereQuality,
} from './scene/quality.ts'
import { createTierMemory } from './scene/tier-memory.ts'
import { createDiagnostics } from './ui/diagnostics.ts'
import { createGraphicsPanel } from './ui/graphics-panel.ts'
import { createScapeControls } from './ui/scape-controls.ts'
import { createSettingsStore } from './ui/settings-store.ts'


const firstCanvas = document.querySelector<HTMLCanvasElement>('[data-scape]')
const statusSlot  = document.querySelector<HTMLOutputElement>('#scape-status')

if (!firstCanvas || !statusSlot)
  throw new Error('three-iso requires the scape canvas and status output')

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

interface Mounted {
  dispose(): void
}

/**
 * The optical chain, forced either way from the url.
 *
 * `?post=1` on a phone is how the diagnosis gets tested rather than assumed: the
 * mobile tier no longer builds the chain, so turning it back on by hand is the
 * only remaining way to ask the device whether the chain was really the thing
 * that killed it. `?post=0` does the same from the other side on a desktop.
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
 * Which tier to open on: what the signals ask for, held down by what the device
 * has already proven, unless the url overrules both.
 */
function startingQuality (): AtmosphereQuality {
  const forced = params.get('tier')

  if (forced && isAtmosphereQualityTier(forced)) {
    // An explicit tier is a question about this build, and a stored verdict
    // would keep answering the old one over the top of it.
    memory.forget()
    diagnostics.say(`tier forced to ${forced} by the url`)

    return withPostOverride(atmosphereQuality(forced))
  }

  const picked  = selectAtmosphereQuality(signals)
  const clamped = memory.clamp(picked.tier)

  if (clamped !== picked.tier)
    diagnostics.say(`${picked.tier} tier held down to ${clamped} · this device has dropped a context before`)

  return withPostOverride(atmosphereQuality(clamped))
}

// Built once, before anything has been loaded over the config: the store keeps
// the authored values so `reset` can give them back, and after a rebuild the
// config no longer holds them. The control list is the same shape at every tier
// — only which knobs render as available differs — so one store covers them all.
const initialQuality = startingQuality()

const settings = createSettingsStore(SCAPE_CONFIG, createScapeControls(initialQuality))

settings.load()

let canvas                  = firstCanvas
let quality                 = initialQuality
let mounted: Mounted | null = null
let recovering              = 0
let proving                 = 0

function mount (): void {
  const scape = createIsometricScape(canvas, SCAPE_CONFIG, {
    quality,
    reducedMotion,
    diagnostics,

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
  const panel = createGraphicsPanel({
    config:    SCAPE_CONFIG,
    sections:  createScapeControls(quality),
    tier:      quality.tier,
    collapsed: compactLayout || coarsePointer,
    onChange:  () => settings.save(),
    onReset:   () => settings.reset(),
  })

  canvas.parentElement?.append(panel.element)

  // A tier that holds this long without dropping the context is a tier the
  // device can simply be handed next time, rather than being walked down to
  // through another crash. Cancelled by `unmount`, so a loss inside the window
  // never gets recorded as a survival.
  window.clearTimeout(proving)
  proving = window.setTimeout(() => memory.remember(quality.tier), GRACE)

  mounted = {
    dispose () {
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

  unmount()

  if (!next) {
    diagnostics.fail('no tier left to fall back to · reload to rebuild the scape')
    return
  }

  // Written now, not once the rebuild survives: whatever the reader does next —
  // reload, background the tab, give up and come back tomorrow — should start
  // from what we just learned rather than repeat the crash to learn it again.
  memory.remember(next.tier)

  diagnostics.say(`falling back to the ${next.tier} tier in ${RECOVERY_DELAY}ms`)
  quality = next

  window.clearTimeout(recovering)
  recovering = window.setTimeout(() => {
    renewCanvas()

    try {
      mount()
    }
    catch (error) {
      // A rebuild that cannot even get a context is the end of the line, and
      // throwing out of a timer would only lose the message the reader needs.
      diagnostics.fail(`rebuild failed · ${error instanceof Error ? error.message : String(error)}`)
    }
  }, RECOVERY_DELAY)
}

try {
  mount()
  diagnostics.say(compactLayout ? 'ready · tap and drag to explore' : 'ready · select the canvas for keys')
}
catch (error) {
  diagnostics.fail(`could not build the scape · ${error instanceof Error ? error.message : String(error)}`)
  throw error
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
  settings.dispose()
  unmount()
})
