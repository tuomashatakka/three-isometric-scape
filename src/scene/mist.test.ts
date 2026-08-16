import { describe, expect, test } from 'bun:test'
import { MathUtils } from 'three'
import { SCAPE_CONFIG } from './config.ts'
import { mistSheetSize, mistSliceReach, mistSliceSpacing } from './mist.ts'


describe('mist world scale', () => {
  test('keeps the faded sheet beyond a two-to-one maximum view at full pan', () => {
    const world      = SCAPE_CONFIG.archipelago.worldSize
    const view       = SCAPE_CONFIG.camera.maxViewSize
    const focusReach = world * 0.48 * Math.SQRT2
    const halfWidth  = view
    const halfDepth  = view * 0.5 / Math.sin(MathUtils.degToRad(SCAPE_CONFIG.camera.tiltFar))
    const frameReach = Math.hypot(halfWidth, halfDepth)
    const fadeOut    = mistSheetSize(world) * 0.5 * 0.96

    expect(fadeOut).toBeGreaterThan(focusReach + frameReach)
  })

  test('keeps upright slice density proportional to the live frame', () => {
    const maximum = SCAPE_CONFIG.camera.maxViewSize
    const spacing = mistSliceSpacing(maximum)

    expect(spacing / maximum).toBeCloseTo(0.445, 6)
    expect(mistSliceSpacing(maximum * 2)).toBeCloseTo(spacing * 2)
  })

  test('keeps every upright slice inside minimum, middle, and maximum views', () => {
    const { minViewSize, maxViewSize } = SCAPE_CONFIG.camera
    const views                        = [ minViewSize, (minViewSize + maxViewSize) / 2, maxViewSize ]

    for (const view of views)
      for (const count of [ 1, 2, 3 ])
        for (let index = 0; index < count; index += 1)
          expect(Math.abs(mistSliceReach(index, count, view))).toBeLessThan(view * 0.5)
  })
})
