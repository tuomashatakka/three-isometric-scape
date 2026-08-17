import { describe, expect, test } from 'bun:test'
import { drawnSurfaceOf } from './terrain.ts'
import type { HeightField } from './height.ts'


const SIZE     = 40
const SEGMENTS = 10
const STEP     = SIZE / SEGMENTS

/** A ground with real curvature in it, so a chord and the field disagree. */
const rolling: HeightField = {
  heightAt: (x, z) => Math.sin(x * 0.31) * 2.4 + Math.cos(z * 0.22) * 1.7,
  slopeAt:  () => 0,
}

const surface = drawnSurfaceOf(rolling, SIZE, SEGMENTS)


describe('the ground as the terrain draws it', () => {
  test('agrees with the height field exactly on the vertices', () => {
    for (let column = 0; column <= SEGMENTS; column += 1)
      for (let row = 0; row <= SEGMENTS; row += 1) {
        const x = -SIZE / 2 + column * STEP
        const z = -SIZE / 2 + row * STEP

        expect(surface(x, z)).toBeCloseTo(rolling.heightAt(x, z), 6)
      }
  })

  test('runs straight between them, because a triangle is flat', () => {
    const x    = -SIZE / 2
    const near = -SIZE / 2 + 3 * STEP

    for (let part = 1; part < 8; part += 1) {
      const z     = near + STEP * part / 8
      const blend = part / 8

      expect(surface(x, z)).toBeCloseTo(
        rolling.heightAt(x, near) * (1 - blend) + rolling.heightAt(x, near + STEP) * blend,
        6,
      )
    }
  })

  test('stands off the field it was sampled from, which is the whole point', () => {
    // Anything laid flat on the terrain has to be laid on this surface. The gap
    // here is what swallows a ribbon lifted by a couple of centimetres off
    // `heightAt` instead.
    let worst = 0

    for (let column = 0; column < SEGMENTS; column += 1)
      for (let row = 0; row < SEGMENTS; row += 1) {
        const x = -SIZE / 2 + (column + 0.5) * STEP
        const z = -SIZE / 2 + (row + 0.5) * STEP

        worst = Math.max(worst, Math.abs(surface(x, z) - rolling.heightAt(x, z)))
      }

    expect(worst).toBeGreaterThan(0.1)
  })

  test('answers inside the patch for a point off its edge, rather than reading past the grid', () => {
    expect(Number.isFinite(surface(-SIZE, -SIZE))).toBe(true)
    expect(Number.isFinite(surface(SIZE, SIZE))).toBe(true)
  })
})
