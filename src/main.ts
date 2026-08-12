import './style.css'
import { SCAPE_CONFIG } from './scene/config.ts'
import { createIsometricScape } from './scene/create-isometric-scape.ts'
import { createGraphicsPanel } from './ui/graphics-panel.ts'
import { createScapeControls } from './ui/scape-controls.ts'


const canvas = document.querySelector<HTMLCanvasElement>('[data-scape]')
const status = document.querySelector<HTMLOutputElement>('#scape-status')

if (!canvas || !status)
  throw new Error('three-iso requires the scape canvas and status output')

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const compactLayout = window.matchMedia('(max-width: 40rem)').matches
const coarsePointer = window.matchMedia('(pointer: coarse)').matches
let disposed = false

try {
  const scape = createIsometricScape(canvas, SCAPE_CONFIG, {
    reducedMotion,
    onFocus (point) {
      status.value = reducedMotion
        ? `focused at ${point.x.toFixed(1)}, ${point.z.toFixed(1)}`
        : `orbiting ${point.x.toFixed(1)}, ${point.z.toFixed(1)}`
    },
    onManualControl () {
      status.value = 'manual camera · click or tap a place to orbit'
    },
  })

  // The overlay writes straight into `SCAPE_CONFIG`, which every scene module
  // already reads per frame — so it is a view of the scene's settings rather
  // than a copy that has to be pushed anywhere.
  const panel = createGraphicsPanel({
    sections:  createScapeControls(SCAPE_CONFIG, scape.quality),
    tier:      scape.quality.tier,
    collapsed: compactLayout || coarsePointer,
  })

  canvas.parentElement?.append(panel.element)

  status.value = compactLayout
    ? 'scape ready · tap and drag anywhere to explore'
    : 'scape ready · select the canvas to use keyboard controls'

  canvas.addEventListener('webglcontextlost', () => {
    status.value = 'webgl context lost · reload to rebuild the scape'
  })

  window.addEventListener('pagehide', () => {
    if (disposed)
      return
    disposed = true
    panel.dispose()
    scape.dispose()
  }, { once: true })
}
catch (error) {
  status.value = 'could not build the webgl scape'
  throw error
}
