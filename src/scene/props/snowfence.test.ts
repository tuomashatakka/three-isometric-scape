import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { resolvePalette } from './palette.ts'
import { buildSnowFenceRun } from './snowfence.ts'


const palette = resolvePalette()
const line    = [{ x: 0, z: 0 }, { x: 14.4, z: 0 }]

/** One run on level ground, so a test can measure the timber rather than the hill. */
function run (over: Record<string, unknown> = {}) {
  return buildSnowFenceRun({
    points:   line,
    heightAt: () => 4,
    height:   1.3,
    spacing:  2.4,
    palings:  7,
    lean:     { x: 0, z: 1 },
    rng:      createSeededRng(77),
    palette,
    ...over,
  })
}

describe('the snow fence run', () => {
  test('it is one geometry, vertex-coloured, and finite everywhere', () => {
    const geometry = run()!

    expect(geometry).not.toBeNull()

    for (const name of [ 'position', 'normal', 'color' ]) {
      const attribute = geometry.getAttribute(name)

      expect(attribute).toBeDefined()
      expect((attribute.array as Float32Array).every(Number.isFinite)).toBe(true)
    }

    geometry.dispose()
  })

  test('the cladding stands clear of the ground and reaches the top of the posts', () => {
    // The bottom gap is the one proportion here that is load-bearing: a fence
    // standing on the ground is buried by the first bank it throws. The posts
    // are driven below it, so the floor of the whole run is the post foot and
    // the floor of the *laths* is a tenth of the height above the turf.
    const geometry = run()!
    const bounds   = new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)

    expect(bounds.min.y).toBeLessThan(4)
    expect(bounds.max.y).toBeGreaterThan(4 + 1.3 - 0.1)
    expect(bounds.max.y).toBeLessThan(4 + 1.3 + 0.2)
    geometry.dispose()
  })

  test('the braces rake downwind and only downwind', () => {
    // The one part of a fence that says, in a still, which way the weather on
    // this island comes from — and the reason the run is handed a bearing at
    // all. Everything else about it is symmetrical about the line.
    const downwind = run({ lean: { x: 0, z: 1 }})!
    const upwind   = run({ lean: { x: 0, z: -1 }})!
    const reach    = (geometry: ReturnType<typeof run>): Box3 =>
      new Box3().setFromArray(geometry!.getAttribute('position').array as Float32Array)

    expect(reach(downwind).max.z).toBeGreaterThan(0.5)
    expect(reach(downwind).min.z).toBeGreaterThan(-0.3)
    expect(reach(upwind).min.z).toBeLessThan(-0.5)
    downwind.dispose()
    upwind.dispose()
  })

  test('a run with its boards off is still a fence', () => {
    // `quality.fencePalings` reaches zero on the cheapest tier, and what is left
    // has to be a railed run rather than a broken-looking cheap version — see
    // the note on that knob.
    const clad     = run()!
    const stripped = run({ palings: 0 })!

    expect(stripped.getAttribute('position').count).toBeGreaterThan(0)
    expect(stripped.getAttribute('position').count).toBeLessThan(clad.getAttribute('position').count)
    clad.dispose()
    stripped.dispose()
  })

  test('posts standing in the water are dropped, and a drowned line builds nothing', () => {
    expect(run({ heightAt: () => 0.2, minHeight: 1 })).toBeNull()
    expect(run({ points: [{ x: 0, z: 0 }]})).toBeNull()
    expect(run({ height: 0 })).toBeNull()
  })

  test('the same seed builds the same fence, byte for byte', () => {
    const first  = run()!
    const second = run()!

    expect(Array.from(first.getAttribute('position').array as Float32Array))
      .toEqual(Array.from(second.getAttribute('position').array as Float32Array))
    first.dispose()
    second.dispose()
  })
})
