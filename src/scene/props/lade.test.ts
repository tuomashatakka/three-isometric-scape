import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import type { BufferGeometry } from 'three'
import { createSeededRng } from 'threejs-scene'
import { buildLadeRun } from './lade.ts'
import type { LadeRunOptions } from './lade.ts'
import { resolvePalette } from './palette.ts'


const palette = resolvePalette()

/** A bank falling one in three toward the feed, which is what a beck bank is. */
function bank (x: number, z: number): number {
  return 2 + z / 3 + Math.sin(x * 0.7) * 0.15
}

function run (over: Partial<LadeRunOptions> = {}) {
  return buildLadeRun({
    feed:     { x: 0, y: 3.4, z: 0 },
    intake:   { x: 0, y: 5, z: 9 },
    heightAt: bank,
    rng:      createSeededRng(7).fork('lade'),
    palette,
    ...over,
  })
}

function boundsOf (geometry: BufferGeometry): Box3 {
  return new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)
}

describe('the lade run', () => {
  test('it is one mergeable, vertex-coloured geometry', () => {
    const lade = run()!

    expect(lade.index).toBeNull()
    for (const attribute of [ 'position', 'normal', 'uv', 'color' ])
      expect(lade.getAttribute(attribute)).toBeDefined()

    lade.dispose()
  })

  test('it reaches from the wheel to the mouth and no further', () => {
    // Both ends are given rather than found, so this is the claim that the
    // trough actually spans them — a run that stopped short would leave the
    // wheel dry and the mouth hanging, and neither shows in a stats block.
    const lade   = run()!
    const bounds = boundsOf(lade)

    expect(bounds.min.z).toBeLessThan(0.4)
    expect(bounds.max.z).toBeGreaterThan(8.6)
    expect(bounds.min.z).toBeGreaterThan(-1.2)
    expect(bounds.max.z).toBeLessThan(10)

    lade.dispose()
  })

  test('the trough itself never dips below the line it was given', () => {
    // The whole of what makes this a launder rather than a ditch. The deck is
    // straight between its two ends, and the only geometry allowed below it is
    // the trestle reaching for the ground.
    const lade     = run()!
    const position = lade.getAttribute('position').array as Float32Array

    for (let index = 0; index < position.length; index += 3) {
      const share = position[index + 2] / 9
      const deck  = 3.4 + 1.6 * share

      // Either on the deck, within a board's thickness, or below it and inside
      // the ground the bent is standing on.
      expect(position[index + 1]).toBeLessThan(deck + 0.45)
    }

    lade.dispose()
  })

  test('every bent stands on its own patch of ground', () => {
    // The fence's rule, at a steeper pitch: a run whose legs are all one length
    // floats at one end and is buried at the other. Measured as the lowest
    // timber in the run, which on this bank is the leg nearest the wheel.
    const level = buildLadeRun({
      feed:     { x: 0, y: 3.4, z: 0 },
      intake:   { x: 0, y: 5, z: 9 },
      heightAt: () => 3,
      rng:      createSeededRng(7).fork('lade'),
      palette,
    })!
    const dug = run()!

    expect(boundsOf(level).min.y).toBeGreaterThan(boundsOf(dug).min.y)

    level.dispose()
    dug.dispose()
  })

  test('two ends in the same place is no lade at all', () => {
    expect(run({ intake: { x: 0, y: 3.4, z: 0.2 }})).toBeNull()
  })

  test('one seed gives one lade', () => {
    const first  = run()!
    const second = run()!

    expect(Array.from(first.getAttribute('position').array))
      .toEqual(Array.from(second.getAttribute('position').array))

    first.dispose()
    second.dispose()
  })
})
