import type { WebGLRenderer } from 'three'
import { defineModule } from 'threejs-scene'
import type { AppModule } from 'threejs-scene'


/**
 * The last quarter-second, as numbers rather than as a sentence.
 *
 * `snapshot` exists for the log, where a line of prose is what a phone screen
 * can carry. A readout on the canvas wants the figures, and wants them often
 * enough to twitch — so it gets its own cadence and its own shape rather than a
 * string somebody has to parse back apart.
 */
export interface VitalsSample {
  fps: number

  /** Mean frame time over the sample window, in milliseconds. */
  ms: number

  /** The worst frame of the whole run so far, in milliseconds. */
  worst:     number
  calls:     number
  triangles: number

  /**
   * Frames drawn since the scape started, and never reset.
   *
   * Everything else here describes a window; this describes the run. It is what
   * a capture waits on — a scape converges over a *number of frames*, not over
   * a number of seconds, and settling by wall clock on a machine whose speed
   * varies by a factor of twenty is how two captures of one scene end up with
   * different things faded into them.
   */
  drawn: number
}

/** What the scape reports about itself while it is running. */
export interface Vitals {
  module: AppModule<Record<string, never>>

  /** Everything worth knowing about the last few seconds, on one line. */
  snapshot(): string
}

export interface VitalsOptions {
  renderer: WebGLRenderer

  /** Emit the periodic line as well as answering `snapshot`. */
  verbose: boolean

  /** The live line. Overwritten in place, so nothing that matters goes here. */
  report(line: string): void

  /** An event worth a line of its own in the log. */
  notice(message: string): void

  /** Fresh numbers for an on-screen readout, four times a second. */
  sample?(sample: VitalsSample): void
}

/** How often the live line is pushed out, in seconds. */
const REPORT_EVERY = 4

/**
 * How often `sample` is handed fresh numbers, in seconds.
 *
 * Fast enough that a reader watching the counter sees the frame rate move when
 * they do something, slow enough that the digits stay readable rather than
 * strobing. Kept on its own accumulator so the four-second log window above is
 * unchanged by anything a readout wants.
 */
const SAMPLE_EVERY = 0.25

/**
 * How often `getError` is asked, while the run is still young.
 *
 * It is a synchronising call — it drains the command queue — so it is not free
 * and it does not belong in a frame. Once a second is enough to catch an
 * `OUT_OF_MEMORY` on its way to becoming a lost context.
 */
const ERROR_EVERY = 1

/**
 * And how often once the run has settled.
 *
 * Every loss on record landed inside the first few seconds, and a probe that
 * has been answering `NO_ERROR` for a quarter of a minute is buying very little.
 * The stall it costs, though, it costs for as long as the tab is open — so past
 * the window where the answer is interesting it backs off to the rate the log
 * runs at. `?debug` keeps the close watch for as long as anyone wants it.
 */
const ERROR_EVERY_SETTLED = 4

/** How long the close watch lasts, in seconds. See `ERROR_EVERY_SETTLED`. */
const WATCHFUL = 15

/** A frame this slow is long enough for a mobile driver watchdog to notice. */
const STALL = 250

/**
 * Seconds between stall lines.
 *
 * A device that is stalling is usually stalling on every frame, and forty
 * copies of the same line is a log that has thrown away the startup summary to
 * make room for saying one thing repeatedly. The running count lives on the
 * live line; only a stall that is *worse* than anything seen so far gets to
 * jump this queue.
 */
const STALL_QUIET = 3

const GL_ERRORS: Record<number, string> = {
  0x0500: 'INVALID_ENUM',
  0x0501: 'INVALID_VALUE',
  0x0502: 'INVALID_OPERATION',
  0x0505: 'OUT_OF_MEMORY',
  0x0506: 'INVALID_FRAMEBUFFER_OPERATION',
  0x9242: 'CONTEXT_LOST_WEBGL',
}

/**
 * The scape's own instrumentation.
 *
 * A module rather than a wrapper, and one that deliberately declares no
 * `render` hook: the app gives the frame draw to the last module that wants
 * it, and the point of this one is to watch without changing what is watched.
 *
 * Frame time is measured off the wall clock rather than taken from the frame
 * context, because the frame context reports the *nominal* delta once the loop
 * is paced — which is exactly the number that hides a device failing to keep up.
 */
export function createVitals ({ renderer, verbose, report, notice, sample }: VitalsOptions): Vitals {
  let last     = performance.now()
  let frames   = 0
  let span     = 0
  let slowest  = 0
  let sinceLog = 0
  let sinceGl  = 0
  let resizes  = 0

  // The readout's own window, and the age of the run that decides how closely
  // the driver is questioned.
  let sinceSample  = 0
  let sampleFrames = 0
  let drawn        = 0
  let sampleSpan   = 0
  let total        = 0

  // Sticky across windows: a stall that has already been reported still
  // explains a loss ten seconds later, so the worst frame of the whole run is
  // kept alongside the worst of the current window.
  let worst          = 0
  let peakResizeRate = 0
  let windowResizes  = 0
  let stalls         = 0
  let sinceStallLine = Infinity

  // The first frame carries the shader compiles and the first upload of every
  // texture in the scene, so it is not a frame time — counting it as one would
  // put a number in `worst` that says nothing about how the scape runs.
  let firstFrame = true

  // Per-frame draw totals only add up with the automatic reset off. The post
  // chain renders many times per frame, and each one would otherwise clear the
  // counters behind it — which is why an instrumented composer reads as one
  // draw call and no triangles at all.
  let calls     = 0
  let triangles = 0

  function line (): string {
    const fps = span > 0 ? frames / span : 0

    return [
      `${fps.toFixed(0)}fps`,
      `slow ${slowest.toFixed(0)}ms`,
      `worst ${worst.toFixed(0)}ms`,
      `stalls ${stalls}`,
      `calls ${calls}`,
      `tris ${Math.round(triangles / 1000)}k`,
      `geo ${renderer.info.memory.geometries}`,
      `tex ${renderer.info.memory.textures}`,
      `prog ${renderer.info.programs?.length ?? 0}`,
      `resize ${resizes}${peakResizeRate > 2 ? `@${peakResizeRate}/s` : ''}`,
    ].join(' · ')
  }

  /**
   * Hand the readout the window that just closed, and open another.
   *
   * Its own accumulator rather than the log's, because the two want opposite
   * things: the log wants a settled average of the last few seconds, and a
   * counter on the canvas wants to move when the scape does.
   */
  function emit (): void {
    if (!sample || sinceSample < SAMPLE_EVERY)
      return

    sample({
      fps: sampleSpan > 0 ? sampleFrames / sampleSpan : 0,
      ms:  sampleFrames > 0 ? sampleSpan * 1000 / sampleFrames : 0,
      worst,
      calls,
      triangles,
      drawn,
    })

    sinceSample  = 0
    sampleFrames = 0
    sampleSpan   = 0
  }

  /** Ask the driver whether anything has gone wrong since we last asked. */
  function probe (gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    if (sinceGl < (verbose || total < WATCHFUL ? ERROR_EVERY : ERROR_EVERY_SETTLED))
      return

    sinceGl = 0

    const code = gl.getError()

    if (code !== 0)
      notice(`gl error ${GL_ERRORS[code] ?? `0x${code.toString(16)}`}`)
  }

  return {
    snapshot: line,

    module: defineModule<Record<string, never>>({
      name: 'vitals',

      build () {
        last = performance.now()
        renderer.info.autoReset = false
      },

      update (_state, _frame, ctx) {
        const now   = performance.now()
        const delta = now - last
        last = now

        // Read before resetting: at this point the counters still hold what the
        // previous frame's draw cost, across every pass of it.
        calls     = renderer.info.render.calls
        triangles = renderer.info.render.triangles
        renderer.info.reset()

        if (firstFrame) {
          // No call count to report: nothing has been drawn yet, so this is the
          // cost of building and compiling rather than of a frame.
          firstFrame = false
          notice(`first frame ${delta.toFixed(0)}ms`)
        }
        else {
          frames       += 1
          drawn        += 1
          span         += delta / 1000
          sampleFrames += 1
          sampleSpan   += delta / 1000

          const record = delta > worst * 1.25

          slowest = Math.max(slowest, delta)
          worst   = Math.max(worst, delta)

          if (delta >= STALL) {
            stalls += 1

            if (record || sinceStallLine >= STALL_QUIET) {
              sinceStallLine = 0
              notice(`stalled ${delta.toFixed(0)}ms · ${calls} calls · ${Math.round(triangles / 1000)}k tris · ×${stalls}`)
            }
          }
        }

        sinceLog       += delta / 1000
        sinceGl        += delta / 1000
        sinceSample    += delta / 1000
        sinceStallLine += delta / 1000
        total          += delta / 1000

        emit()
        probe(ctx.renderer.getContext())

        if (sinceLog < REPORT_EVERY)
          return

        peakResizeRate = Math.max(peakResizeRate, Math.round(windowResizes / sinceLog))

        if (verbose)
          report(line())

        sinceLog      = 0
        frames        = 0
        span          = 0
        slowest       = 0
        windowResizes = 0
      },

      resize (size) {
        // Counted because a phone's collapsing url bar can fire this dozens of
        // times a second, and every one of them reallocates the drawing buffer
        // and every render target hanging off it. Churn at that rate is its own
        // way to lose a context, and it looks like nothing at all from the code.
        resizes       += 1
        windowResizes += 1

        if (resizes % 20 === 0)
          notice(`resize ×${resizes} · now ${Math.round(size.width)}×${Math.round(size.height)}`)
      },

      dispose () {
        renderer.info.autoReset = true
      },
    }),
  }
}

// perf: one wall-clock read and a handful of counters per frame, a readout
// sample four times a second, a synchronising `getError` once a second while
// the run is young and every four once it has settled, and a log line every
// four.
