import { describe, expect, test } from 'bun:test'
import { ADAPT_RATE, EXPOSURE_NIGHT, EXPOSURE_NOON, adaptExposure, targetExposure } from './exposure.ts'

describe('exposure', () => {
  test('opens up in the dark and stops down in the sun', () => {
    expect(targetExposure(1, 0)).toBeCloseTo(EXPOSURE_NOON, 6)
    expect(targetExposure(0, 0)).toBeCloseTo(EXPOSURE_NIGHT, 6)
    expect(EXPOSURE_NIGHT).toBeGreaterThan(EXPOSURE_NOON)
  })

  test('is monotone in daylight and never leaves its two ends', () => {
    let last = Infinity
    for (let day = 0; day <= 1.0001; day += 0.1) {
      const value = targetExposure(day, 0)
      expect(value).toBeLessThanOrEqual(last)
      expect(value).toBeGreaterThanOrEqual(EXPOSURE_NOON - 1e-9)
      expect(value).toBeLessThanOrEqual(EXPOSURE_NIGHT + 1e-9)
      last = value
    }
    expect(targetExposure(5, 5)).toBeCloseTo(EXPOSURE_NOON, 6)
  })

  test('moonlight holds the iris a little shut', () => {
    expect(targetExposure(0, 1)).toBeLessThan(targetExposure(0, 0))
  })

  test('the iris approaches its target, never overshoots, and is frame-rate independent', () => {
    const once = adaptExposure(1.16, 0.92, 1)
    expect(once).toBeGreaterThan(0.92)
    expect(once).toBeLessThan(1.16)
    expect(adaptExposure(1, 1, 0.5)).toBe(1)
    const halves = adaptExposure(adaptExposure(1.16, 0.92, 0.5), 0.92, 0.5)
    expect(halves).toBeCloseTo(once, 9)
    expect(ADAPT_RATE).toBeGreaterThan(0)
  })
})
