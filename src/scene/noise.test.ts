import { describe, expect, test } from 'bun:test'
import { sampleHeight } from './noise.ts'


describe('sampleHeight', () => {
  test('is deterministic for a seed and coordinate', () => {
    const first  = sampleHeight(12.5, -8.25, 7_319, 8.2)
    const second = sampleHeight(12.5, -8.25, 7_319, 8.2)

    expect(second).toBe(first)
  })

  test('changes when the world seed changes', () => {
    const first  = sampleHeight(12.5, -8.25, 7_319, 8.2)
    const second = sampleHeight(12.5, -8.25, 7_320, 8.2)

    expect(second).not.toBe(first)
  })

  test('stays inside the documented terrain envelope', () => {
    for (let x = -40; x <= 40; x += 4)
      for (let z = -40; z <= 40; z += 4) {
        const height = sampleHeight(x, z, 7_319, 8.2)
        expect(height).toBeGreaterThanOrEqual(-8.2)
        expect(height).toBeLessThanOrEqual(9.6)
      }
  })
})
