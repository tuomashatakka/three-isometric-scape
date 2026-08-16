import { Vector2 } from 'three'
import type { WebGLRenderer } from 'three'
import { frameLoopManager } from '@tuomashatakka/canvas-loop-framecapper'
import { defineModule } from 'threejs-scene'
import type { AppModule } from 'threejs-scene'
import type { ScapeConfig } from './config.ts'


/** The knobs that cost frames, and the one answer anyone else needs from them. */
export interface Runtime {
  module: AppModule<Record<string, never>>

  /**
   * Whether the shadow map is being rebuilt on the frame currently in flight.
   *
   * Mount this module first and the answer is settled before anything that
   * feeds the map has run. `atmosphere.ts` uses it to skip fitting a frustum
   * nothing is going to read.
   */
  shadowDue(): boolean
}

/**
 * The three settings that cost frames rather than describe the place.
 *
 * Mounted first, so everything it changes is already in force by the time the
 * frame it changed them on is drawn. It reads `config.runtime` every frame the
 * way every other module reads its own section, and does nothing at all on a
 * frame where none of the three moved — which is almost all of them.
 *
 * The one thing it takes away from three is the shadow map. Left alone, the
 * renderer rebuilds the whole depth pass — the terrain, the merged steading and
 * every scattered instance — on every single frame it draws, at up to 4096².
 * Nothing here moves fast enough to need that.
 */
export function createRuntime (config: ScapeConfig): Runtime {
  const surface = new Vector2()

  let renderer: WebGLRenderer | null = null

  // Deliberately impossible starting values: the first frame should apply all
  // three rather than discover that it happens to agree with the tier.
  let ratio  = -1
  let cap    = -1
  let waited = 0

  // The scape has to start with a map, so the frame nothing has drawn yet is
  // always a frame one is due on.
  let due = true

  /**
   * Re-scale the drawing buffer.
   *
   * Only the renderer's own surface. The composer keeps a pixel ratio of its
   * own, snapshotted when it was built, and follows this on its own terms — see
   * the same read in `post.ts`.
   */
  function resurface (next: number): void {
    if (!renderer || next === ratio)
      return

    ratio = next
    renderer.setPixelRatio(next)

    // The css size is unchanged; the buffer behind it is not. Passing the size
    // back in is what makes the renderer reallocate at the new ratio.
    renderer.getSize(surface)
    renderer.setSize(surface.x, surface.y, false)
  }

  function pace (next: number): void {
    if (next === cap)
      return

    cap = next
    frameLoopManager.setFixedFrameRate(next)
  }

  const module = defineModule<Record<string, never>>({
    name: 'runtime',

    build (ctx) {
      renderer = ctx.renderer

      renderer.shadowMap.autoUpdate  = false
      renderer.shadowMap.needsUpdate = true

      resurface(config.runtime.pixelRatio)
      pace(config.runtime.frameCap)
    },

    update () {
      resurface(config.runtime.pixelRatio)
      pace(config.runtime.frameCap)

      if (!renderer?.shadowMap.enabled)
        return

      waited += 1

      // Rounded and floored at one, because the knob is a slider and a cadence
      // of zero would be a scape whose shadows never arrive at all.
      due = waited >= Math.max(1, Math.round(config.runtime.shadowCadence))

      if (!due)
        return

      // Cleared by the renderer as soon as it has drawn the map, so this is a
      // request for the frame in flight rather than a flag anyone has to unset.
      waited                         = 0
      renderer.shadowMap.needsUpdate = true
    },

    dispose () {
      // Handed back, so a renderer that outlives this module is not left with a
      // shadow map nobody is refreshing.
      if (renderer)
        renderer.shadowMap.autoUpdate = true

      renderer = null
    },
  })

  return { module, shadowDue: () => due }
}

// perf: three comparisons per frame and nothing else on the frames where
// nothing changed. Takes the per-frame shadow-map rebuild off the renderer and
// hands it out on a cadence instead.
