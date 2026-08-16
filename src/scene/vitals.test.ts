import { describe, expect, test } from 'bun:test'
import type { WebGLRenderer } from 'three'
import type { FrameContext, SceneContext } from 'threejs-scene'
import { createVitals } from './vitals.ts'
import type { VitalsSample } from './vitals.ts'


/**
 * Enough of a renderer to be counted.
 *
 * `info` is the whole surface vitals touches, plus a context that answers
 * `getError`. Nothing here draws, and nothing needs to — the module deliberately
 * measures off the wall clock rather than off the frame it is handed, so real
 * elapsed time is the only input a test has to supply.
 */
function stubRenderer (calls = 41, triangles = 812_000): WebGLRenderer {
  const info = {
    autoReset: true,
    render:    { calls, triangles },
    memory:    { geometries: 12, textures: 8 },
    programs:  [],
    reset () {
      info.render.calls     = calls
      info.render.triangles = triangles
    },
  }

  return {
    info,
    getContext: () => ({ getError: () => 0 }),
  } as unknown as WebGLRenderer
}

function frameAt (index: number): FrameContext {
  return { delta: 1 / 60, elapsed: index / 60, frame: index }
}

describe('createVitals', () => {
  test('reports the first frame as a build cost rather than a frame time', () => {
    const notices: string[] = []
    const renderer          = stubRenderer()

    const vitals = createVitals({
      renderer,
      verbose: false,
      report:  () => undefined,
      notice:  message => notices.push(message),
    })

    const ctx = { renderer } as unknown as SceneContext

    vitals.module.build(ctx)
    vitals.module.update?.({}, frameAt(0), ctx)

    // The first frame carries every shader compile and every texture upload in
    // the scene, so counting it as a frame would put a number in `worst` that
    // says nothing about how the scape runs.
    expect(notices[0]).toStartWith('first frame')
    expect(vitals.snapshot()).toContain('worst 0ms')
  })

  test('turns off the renderer\'s own counter reset, and puts it back', () => {
    const renderer = stubRenderer()
    const vitals   = createVitals({
      renderer,
      verbose: false,
      report:  () => undefined,
      notice:  () => undefined,
    })

    vitals.module.build({ renderer } as unknown as SceneContext)

    // Per-frame totals only add up with the automatic reset off — the post chain
    // renders many times per frame and each pass would clear the one before it.
    expect(renderer.info.autoReset).toBe(false)
    vitals.module.dispose?.()
    expect(renderer.info.autoReset).toBe(true)
  })

  test('hands a readout the window that just closed', async () => {
    const samples: VitalsSample[] = []
    const renderer                = stubRenderer()

    const vitals = createVitals({
      renderer,
      verbose: false,
      report:  () => undefined,
      notice:  () => undefined,
      sample:  next => samples.push(next),
    })

    const ctx = { renderer } as unknown as SceneContext

    vitals.module.build(ctx)

    // Real time, because the module measures real time. Six frames spread over
    // rather more than the quarter-second sample window.
    for (let index = 0; index < 6; index += 1) {
      await Bun.sleep(50)
      vitals.module.update?.({}, frameAt(index), ctx)
    }

    expect(samples.length).toBeGreaterThan(0)

    const [ first ] = samples

    expect(first.fps).toBeGreaterThan(0)
    expect(first.ms).toBeGreaterThan(0)
    expect(first.calls).toBe(41)
    expect(first.triangles).toBe(812_000)
  })

  test('counts resizes, because a phone can fire dozens a second', () => {
    const renderer = stubRenderer()
    const vitals   = createVitals({
      renderer,
      verbose: false,
      report:  () => undefined,
      notice:  () => undefined,
    })

    const ctx = { renderer } as unknown as SceneContext

    vitals.module.build(ctx)
    for (let index = 0; index < 3; index += 1)
      vitals.module.resize?.({ width: 800, height: 600 }, ctx)

    expect(vitals.snapshot()).toContain('resize 3')
  })
})
