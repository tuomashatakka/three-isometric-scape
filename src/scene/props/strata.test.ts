import { describe, expect, test } from 'bun:test'
import { BED, BED_DARK, LAMINA_DARK, STRATA_GLSL, bedWarp, parting, strataShade } from './strata.ts'
import { weatheringFragment } from './weathering.ts'


describe('strata', () => {
  test('rides the stone block: inside weathering, binding nothing of its own', () => {
    const glsl = weatheringFragment('uDetailMap')

    expect(glsl).toContain(STRATA_GLSL)
    expect(glsl.indexOf(STRATA_GLSL)).toBeGreaterThan(glsl.indexOf('float alt'))
    expect(STRATA_GLSL).not.toMatch(/uniform|varying|texture2D/)
  })

  test('the parting is dark at the foot of a bed and gone by its middle', () => {
    expect(parting(0)).toBe(1)
    expect(parting(0.5)).toBeLessThan(0.02)
    expect(parting(0.999)).toBeLessThan(1e-6)
  })

  test('a bed repeats at its spacing, and the wander is bounded', () => {
    for (const [ x, z ] of [[ 0, 0 ], [ 310, -82 ], [ -900, 455 ]]) {
      expect(Math.abs(bedWarp(x, z))).toBeLessThanOrEqual(6 + 1e-9)
      expect(parting((12.3 + bedWarp(x, z)) / BED)).toBeCloseTo(parting((12.3 + BED + bedWarp(x, z)) / BED), 9)
    }
  })

  test('the faded mean keeps a face its tone: the profile averages to a seventh', () => {
    const steps = 20000
    let sum     = 0

    for (let step = 0; step < steps; step += 1)
      sum += parting((step + 0.5) / steps)

    expect(sum / steps).toBeCloseTo(1 / 7, 3)
  })

  test('never darker than both partings stacked, never lighter than the rock', () => {
    for (let alt = -5; alt < 140; alt += 0.37) {
      const shade = strataShade(17, alt, -40)

      expect(shade).toBeGreaterThanOrEqual(0)
      expect(shade).toBeLessThanOrEqual(1 - (1 - BED_DARK) * (1 - LAMINA_DARK) + 1e-9)
    }
  })
})
