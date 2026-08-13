import './style.css'
import { SCAPE_CONFIG } from './scene/config.ts'
import { createIsometricScape } from './scene/create-isometric-scape.ts'
import { detectAtmosphereQuality, reduceAtmosphereQuality } from './scene/quality.ts'
import { createGraphicsPanel } from './ui/graphics-panel.ts'
import { createScapeControls } from './ui/scape-controls.ts'
import { createSettingsStore } from './ui/settings-store.ts'


const firstCanvas = document.querySelector<HTMLCanvasElement>('[data-scape]')
const statusSlot  = document.querySelector<HTMLOutputElement>('#scape-status')

if (!firstCanvas || !statusSlot)
  throw new Error('three-iso requires the scape canvas and status output')

// Re-bound past the guard so the hoisted functions below see the narrowed type
// rather than the nullable one `querySelector` hands back.
const status = statusSlot

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const compactLayout = window.matchMedia('(max-width: 40rem)').matches
const coarsePointer = window.matchMedia('(pointer: coarse)').matches

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
const settings = createSettingsStore(SCAPE_CONFIG, createScapeControls(detectAtmosphereQuality()))

settings.load()

let canvas                  = firstCanvas
let quality                 = detectAtmosphereQuality()
let mounted: Mounted | null = null
let recovering              = 0

function mount (): void {
  const scape = createIsometricScape(canvas, SCAPE_CONFIG, {
    quality,
    reducedMotion,
    onFocus (point) {
      status.value = reducedMotion
        ? `focused at ${point.x.toFixed(1)}, ${point.z.toFixed(1)}`
        : `orbiting ${point.x.toFixed(1)}, ${point.z.toFixed(1)}`
    },
    onManualControl () {
      status.value = 'manual camera · click or tap a place to orbit'
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

  if (!next) {
    status.value = 'webgl context lost · reload to rebuild the scape'
    unmount()
    return
  }

  status.value = `webgl context lost · rebuilding on the ${next.tier} tier`
  quality      = next
  unmount()

  window.clearTimeout(recovering)
  recovering = window.setTimeout(() => {
    renewCanvas()

    try {
      mount()
      status.value = `scape rebuilt · ${quality.tier} tier`
    }
    catch {
      // A rebuild that cannot even get a context is the end of the line. There
      // is no tier below this one worth trying, and throwing out of a timer
      // would only lose the message the reader needs.
      status.value = 'webgl context lost · reload to rebuild the scape'
    }
  }, RECOVERY_DELAY)
}

try {
  mount()

  status.value = compactLayout
    ? 'scape ready · tap and drag anywhere to explore'
    : 'scape ready · select the canvas to use keyboard controls'
}
catch (error) {
  status.value = 'could not build the webgl scape'
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
