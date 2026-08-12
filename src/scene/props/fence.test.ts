import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { buildFenceRun } from './fence.ts'
import { resolvePalette } from './palette.ts'


const palette = resolvePalette()
const square  = [
  { x: -6, z: -4 },
  { x: 6, z: -4 },
  { x: 6, z: 4 },
  { x: -6, z: 4 },
]

const run = (over: (x: number, z: number) => number, options = {}) => buildFenceRun({
  points:   square,
  heightAt: over,
  rng:      createSeededRng(3),
  palette,
  closed:   true,
  ...options,
})

describe('buildFenceRun', () => {
  test('follows the ground rather than floating over it', () => {
    const slope    = (x: number) => x * 0.25
    const geometry = run(slope)

    expect(geometry).not.toBeNull()

    const bounds = new Box3().setFromArray(geometry!.getAttribute('position').array as Float32Array)

    // The run spans x = -6..6, so a 0.25 slope puts its feet 3 units apart. A
    // fence built from level segments would have a flat base instead.
    expect(bounds.min.y).toBeLessThan(slope(-6))
    expect(bounds.max.y).toBeGreaterThan(slope(6) + 1)
    expect(bounds.max.y - bounds.min.y).toBeGreaterThan(3)

    geometry!.dispose()
  })

  test('spans the whole outline it was given', () => {
    const geometry = run(() => 0)
    const bounds   = new Box3().setFromArray(geometry!.getAttribute('position').array as Float32Array)

    expect(bounds.min.x).toBeCloseTo(-6, 0)
    expect(bounds.max.x).toBeCloseTo(6, 0)
    expect(bounds.min.z).toBeCloseTo(-4, 0)
    expect(bounds.max.z).toBeCloseTo(4, 0)

    geometry!.dispose()
  })

  test('closer spacing means more posts', () => {
    const sparse = run(() => 0, { spacing: 4 })!
    const dense  = run(() => 0, { spacing: 1.5 })!

    expect(dense.getAttribute('position').count)
      .toBeGreaterThan(sparse.getAttribute('position').count)

    sparse.dispose()
    dense.dispose()
  })

  test('skips ground below the minimum, and does not rail across the gap', () => {
    const dry = run(() => 2, { minHeight: 0 })!
    const wet = run((x: number) => x > 0 ? -5 : 2, { minHeight: 0 })!

    expect(wet.getAttribute('position').count).toBeLessThan(dry.getAttribute('position').count)

    const bounds = new Box3().setFromArray(wet.getAttribute('position').array as Float32Array)
    expect(bounds.min.y).toBeGreaterThan(0)

    dry.dispose()
    wet.dispose()
  })

  test('is deterministic and refuses a degenerate line', () => {
    const a = run(() => 1)!
    const b = run(() => 1)!

    expect(Array.from(a.getAttribute('position').array))
      .toEqual(Array.from(b.getAttribute('position').array))
    expect(buildFenceRun({
      points:   [{ x: 0, z: 0 }],
      heightAt: () => 0,
      rng:      createSeededRng(1),
      palette,
    })).toBeNull()

    a.dispose()
    b.dispose()
  })
})
