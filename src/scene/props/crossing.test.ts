import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { buildFootbridge } from './crossing.ts'
import type { FootbridgeOptions } from './crossing.ts'
import { resolvePalette } from './palette.ts'


const palette = resolvePalette()

/** A flat bed well under the deck, so a test can measure against a known floor. */
const BED = -1.4

const trench = (): number => BED

function options (over: Partial<FootbridgeOptions> = {}): FootbridgeOptions {
  return {
    near:     { x: -3, z: 0 },
    far:      { x: 3, z: 0 },
    deck:     0.4,
    width:    1.1,
    rail:     0.95,
    bay:      4.5,
    boards:   1.2,
    heightAt: trench,
    rng:      createSeededRng(7).fork('bridge'),
    palette,
    ...over,
  }
}

function bounds (over: Partial<FootbridgeOptions> = {}): Box3 {
  const geometry = buildFootbridge(options(over))

  if (!geometry)
    throw new Error('the bridge refused a span it should have built')

  const box = new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)

  geometry.dispose()

  return box
}

describe('the footbridge', () => {
  // The three claims this builder makes that the survey cannot make for it: the
  // deck is where it was asked to be, the structure stays over the gap it was
  // given, and a span longer than a beam grows legs rather than hanging.

  test('the boards lie at the deck level they were given', () => {
    // Not near it, and not above it. The survey proves a freeboard against this
    // number, so a deck that drifted up or down by a board's thickness would be
    // a clearance the instruments report and the picture does not have.
    for (const deck of [ -0.6, 0.4, 3.1 ]) {
      const box = bounds({ deck, rail: 0 })

      expect(box.max.y).toBeCloseTo(deck, 1)
    }
  })

  test('nothing reaches past the abutments it was built between', () => {
    // The ends are the ground the dressing reserved against the scatter. A
    // stringer overhanging its own abutment is a beam standing in open air with
    // a juniper allowed to grow under it.
    const box = bounds()

    expect(box.min.x).toBeGreaterThan(-3.4)
    expect(box.max.x).toBeLessThan(3.4)
  })

  test('the rail is the only thing that stands over the deck', () => {
    // And it is a real absence at zero rather than a flattened one — the cart's
    // crossing is built by passing `rail: 0`, so this is the test that says a
    // cart bridge has nothing on it for a hub to take off.
    const railed = bounds({ rail: 0.95 })
    const bare   = bounds({ rail: 0 })

    expect(railed.max.y - bare.max.y).toBeCloseTo(0.95, 1)
  })

  test('a span longer than a beam is carried on trestles in the water', () => {
    // The claim the `bay` knob makes, as a fact about the data: the long run
    // reaches down to the bed and the short one does not. Both are built over
    // the same trench, so the only thing that can put a vertex down there is a
    // pile.
    const short = bounds({ near: { x: -1.6, z: 0 }, far: { x: 1.6, z: 0 }})
    const long  = bounds({ near: { x: -6, z: 0 }, far: { x: 6, z: 0 }})

    expect(long.min.y).toBeLessThan(BED)
    expect(short.min.y).toBeGreaterThan(BED)
  })

  test('the same seed builds the same bridge, vertex for vertex', () => {
    const first  = buildFootbridge(options())
    const second = buildFootbridge(options())

    expect(first).not.toBeNull()
    expect(Array.from(first!.getAttribute('position').array))
      .toEqual(Array.from(second!.getAttribute('position').array))
    expect(first!.getAttribute('color')).toBeDefined()

    first!.dispose()
    second!.dispose()
  })

  test('two places that are the same place get no bridge', () => {
    expect(buildFootbridge(options({ far: { x: -2.8, z: 0 }}))).toBeNull()
    expect(buildFootbridge(options({ width: 0 }))).toBeNull()
  })
})
