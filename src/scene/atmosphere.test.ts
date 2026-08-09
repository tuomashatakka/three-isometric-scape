import { describe, expect, test } from 'bun:test'
import { calculateFogRange } from './atmosphere.ts'


describe('calculateFogRange', () => {
  test('keeps the foreground clear and thickens with density', () => {
    const clear = calculateFogRange(100, 54, 68, 0.1)
    const foggy = calculateFogRange(100, 54, 68, 0.8)

    expect(clear.near).toBeCloseTo(51.4)
    expect(foggy.near).toBe(clear.near)
    expect(foggy.far).toBeLessThan(clear.far)
    expect(foggy.far).toBeGreaterThan(foggy.near)
  })

  test('caps the fade before the landscape edge can appear', () => {
    const range = calculateFogRange(100, 92, 40, 0)

    expect(range.far).toBe(180)
  })

  test('clamps breathing fog to a safe maximum', () => {
    const dense = calculateFogRange(100, 54, 68, 1, 2)
    const maxed = calculateFogRange(100, 54, 68, 0.94)

    expect(dense).toEqual(maxed)
  })
})
