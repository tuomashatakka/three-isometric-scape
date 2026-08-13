import './style.css'
import { SCAPE_CONFIG } from './scene/config.ts'
import { createIsometricScape } from './scene/create-isometric-scape.ts'
import {
  describeQualitySignals,
  readQualitySignals,
  reduceAtmosphereQuality,
  selectAtmosphereQuality,
} from './scene/quality.ts'
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
const diagnostics = createDiagnostics({
  output:  statusSlot,
  verbose: new URLSearchParams(window.location.search).has('debug'),
})

const signals = readQualitySignals()

diagnostics.say(describeQualitySignals(signals))
diagnostics.say(navigator.userAgent)

/**
 * How long to leave the GPU alone before asking it for another context.
 *
 * A driver that has just reset is in no state to hand out a new context, and
 * asking immediately is how one loss turns into a loop of them.
 */
const RECOVERY_DELAY = 900

interface Mounted {
  dispose(): void
}

// Built once, before anything has been loaded over the config: the store keeps
// the authored values so `reset` can give them back, and after a rebuild the
// config no longer holds them. The control list is the same shape at every tier
// — only which knobs render as available differs — so one store covers them all.
const settings = createSettingsStore(SCAPE_CONFIG, createScapeControls(selectAtmosphereQuality(signals)))

settings.load()

let canvas                  = firstCanvas
let quality                 = selectAtmosphereQuality(signals)
let mounted: Mounted | null = null
let recovering              = 0

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

  mounted = {
    dispose () {
      panel.dispose()
      scape.dispose()
    },
  }
}

function unmount (): void {
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
