import type { VitalsSample } from '../scene/vitals.ts'


export interface FpsMeter {
  element: HTMLElement

  /** Write a fresh sample. Called about four times a second. */
  update(sample: VitalsSample): void
  dispose(): void
}

export interface FpsMeterOptions {

  /**
   * Add what the frame was spent on, not just how long it took.
   *
   * Set from `?debug`, the same switch that opens the log. Draw calls and
   * triangle counts are how you tell a scape that is slow because of the picture
   * from one that is slow because of the device, and that question only comes up
   * once somebody is already debugging.
   */
  verbose?: boolean
}

/**
 * The frame rate, where it can be read without opening anything.
 *
 * Deliberately not part of the card or the graphics panel. Both of those are
 * things you put away, and a frame counter you have to open is a frame counter
 * that is not measuring the thing you were looking at when it got slow. It reads
 * from `scene/vitals.ts` rather than timing anything itself — there is one
 * measurement of the frame in this program and this is a view of it.
 */
export function createFpsMeter ({ verbose = false }: FpsMeterOptions = {}): FpsMeter {
  const element = document.createElement('output')

  element.className = 'fps'

  // An `<output>` is the element for a live figure the page computed, so the
  // semantics are free. `aria-live` is off on purpose: four announcements a
  // second is not a readout, it is a filibuster.
  element.setAttribute('aria-live', 'off')
  element.setAttribute('aria-label', 'performance and camera position')
  element.textContent = '— fps'

  return {
    element,

    update (sample) {
      const performance = [
        `${sample.fps.toFixed(0)} fps`,
        `${sample.ms.toFixed(1)} ms`,
      ]

      if (verbose)
        performance.push(`${sample.calls} calls`, `${Math.round(sample.triangles / 1000)}k tris`)

      const camera = [
        `xyz ${sample.cameraX.toFixed(1)} ${sample.cameraY.toFixed(1)} ${sample.cameraZ.toFixed(1)}`,
        `zoom ${sample.viewSize.toFixed(1)}m`,
      ]

      element.textContent = `${performance.join(' · ')}\n${camera.join(' · ')}`
    },

    dispose () {
      element.remove()
    },
  }
}

// perf: two small string joins and one `textContent` write four times a second. No
// timers, no listeners, and nothing at all on the frames between samples.
