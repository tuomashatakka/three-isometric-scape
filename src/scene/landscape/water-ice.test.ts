import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { MAX_DEPTH } from './shore-mask.ts'
import { depthUnit, floeField, floeScale, freezeToClose, iceCover, WATER_ICE_GLSL } from './water-ice.ts'


const { iceReach, iceBreak } = SCAPE_CONFIG.water
const scale                  = floeScale(SCAPE_CONFIG.terrain.size, SCAPE_CONFIG.archipelago.worldSize)


describe('the floe field', () => {
  test('stays inside the range the shader threshold was cut against', () => {
    let low  = Infinity
    let high = -Infinity

    for (let x = -800; x <= 800; x += 7)
      for (let z = -800; z <= 800; z += 11) {
        const value = floeField(x, z, scale)

        low  = Math.min(low, value)
        high = Math.max(high, value)
      }

    // Three sines of amplitude 0.34, 0.26 and 0.16 about 0.5. The shader
    // subtracts 0.5 and multiplies by `iceBreak`, so a field that had wandered
    // outside this would be tearing bigger holes in the sheet than the knob says.
    expect(low).toBeGreaterThanOrEqual(-0.26)
    expect(high).toBeLessThanOrEqual(1.26)
  })

  test('is the arithmetic the chunk carries, term for term', () => {
    // The pack stands where this says the sheet is, so the two copies have to be
    // one copy. Checked as text because there is no gl context in a test runner,
    // and a drift here is a plate of ice on open water.
    for (const term of [ '0.34 * sin', '0.26 * sin', '0.16 * sin', '0.0545', '0.0788', '0.1394' ])
      expect(WATER_ICE_GLSL).toContain(term)

    expect(WATER_ICE_GLSL).toContain('smoothstep(0.45, 0.85, local)')
    expect(WATER_ICE_GLSL).toContain('1.0 - uIceReach * smoothstep(0.0, 0.55, depth)')
  })
})

describe('the ice front', () => {
  test('reads the world at the scale the uniform does', () => {
    expect(scale).toBeCloseTo(SCAPE_CONFIG.terrain.size / SCAPE_CONFIG.archipelago.worldSize, 12)
    expect(floeScale(196, 0)).toBe(1)
  })

  test('saturates the depth channel at the mask’s own reach', () => {
    expect(depthUnit(0)).toBe(0)
    expect(depthUnit(MAX_DEPTH)).toBe(1)
    expect(depthUnit(MAX_DEPTH * 4)).toBe(1)
    expect(depthUnit(-1)).toBe(0)
  })

  test('shuts the shallows before the deeps at every week of the winter', () => {
    for (const freeze of [ 0.4, 0.6, 0.8, 1 ]) {
      const shallow = iceCover(0, 0, depthUnit(0.2), freeze, iceReach, iceBreak, scale)
      const deep    = iceCover(0, 0, depthUnit(9), freeze, iceReach, iceBreak, scale)

      expect(shallow).toBeGreaterThanOrEqual(deep)
    }
  })

  test('never has ice on it in the summer', () => {
    for (let x = -700; x <= 700; x += 53)
      expect(iceCover(x, x * 0.7, depthUnit(2), 0, iceReach, iceBreak, scale)).toBe(0)
  })

  test('rises with the freeze and never falls', () => {
    let previous = -1

    for (let freeze = 0; freeze <= 1.0001; freeze += 0.02) {
      const cover = iceCover(120, -60, depthUnit(1.6), freeze, iceReach, iceBreak, scale)

      expect(cover).toBeGreaterThanOrEqual(previous)
      previous = cover
    }
  })
})

describe('the week the sheet closes', () => {
  test('is the freeze at which the cover is actually reached', () => {
    for (const depth of [ 0.4, 1.2, 2.5, 6 ])
      for (const x of [ -240, 0, 310 ]) {
        const onset = freezeToClose(x, 90, depthUnit(depth), 0.55, iceReach, iceBreak, scale)

        if (!Number.isFinite(onset))
          continue

        expect(iceCover(x, 90, depthUnit(depth), onset, iceReach, iceBreak, scale))
          .toBeGreaterThanOrEqual(0.55 - 1e-4)

        if (onset > 0)
          expect(iceCover(x, 90, depthUnit(depth), onset - 0.01, iceReach, iceBreak, scale))
            .toBeLessThan(0.55)
      }
  })

  test('refuses the water a full winter never closes', () => {
    // The break-up term is what leaves holes in the sheet: turn it up and the
    // lobes it cuts go under the gate whatever the freeze is doing.
    const torn = freezeToClose(0, 0, 1, 0.99, iceReach, 1, scale)

    expect(Number.isFinite(torn)).toBe(false)
  })

  test('arrives earlier in shallow water than in deep', () => {
    const shallow = freezeToClose(40, 40, depthUnit(1.2), 0.55, iceReach, iceBreak, scale)
    const deep    = freezeToClose(40, 40, depthUnit(8), 0.55, iceReach, iceBreak, scale)

    expect(shallow).toBeLessThanOrEqual(deep)
  })
})
