import { describe, expect, test } from 'bun:test'
import { depthDefocus } from './focal.ts'
import { APERTURE_MAX, apertureReach } from './lens.ts'


describe('the aperture', () => {
  test('closes as the frame widens, as one over the frame', () => {
    expect(apertureReach(24)).toBeCloseTo(apertureReach(48) * 2, 6)
    expect(apertureReach(140)).toBeCloseTo(apertureReach(1400) * 10, 6)
  })

  test('has no floor: the archipelago frame is sharp to a tenth of a pixel of disc per unit', () => {
    // The miniature was a clamp at 0.7 of nominal, at every zoom.
    expect(apertureReach(1400)).toBeLessThan(0.01)
  })

  test('opens to its ceiling and no further on a close frame', () => {
    expect(apertureReach(1)).toBe(APERTURE_MAX)
    expect(apertureReach(0)).toBe(APERTURE_MAX)
  })
})

describe('the focal plane', () => {
  test('defocuses flat ground fully at half a frame, as the screen band did', () => {
    // A camera at 45°: half a frame up the screen is half a frame of depth.
    const viewHeight = 40
    const perMetre   = depthDefocus(viewHeight, 1)
    expect(perMetre * viewHeight / 2).toBeCloseTo(1, 6)
  })

  test('a steeper camera sees less depth across the same frame, so each metre counts for more', () => {
    expect(depthDefocus(40, Math.tan(1.1))).toBeGreaterThan(depthDefocus(40, Math.tan(0.6)))
  })

  test('is finite for a camera looking straight down or along the ground', () => {
    for (const tan of [ 0, 1e9 ])
      expect(Number.isFinite(depthDefocus(40, tan))).toBe(true)
    expect(Number.isFinite(depthDefocus(0, 1))).toBe(true)
  })
})
