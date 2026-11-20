import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { CAP_MAX, SEA_WIND, WATER_CAPS_GLSL, WIND_METRES, capsAmount, capsCut, setCaps, whitecapFraction } from './water-caps.ts'
import { Vector2 } from 'three'


const { whitecap, state, whitecapLee } = SCAPE_CONFIG.water
const { surfExposure }                 = SCAPE_CONFIG.water
const { strength, gust }               = SCAPE_CONFIG.wind

/** The hardest the gust front can drive the authored wind. See `wind.ts`. */
const GUSTING = strength * (1 + gust)


describe("Monahan's whitecaps", () => {
  test('the measured curve: nothing in a calm, a percent at force five, a tenth in a gale', () => {
    expect(whitecapFraction(0)).toBe(0)
    expect(whitecapFraction(4)).toBeLessThan(0.001)
    expect(whitecapFraction(9)).toBeGreaterThan(0.004)
    expect(whitecapFraction(9)).toBeLessThan(0.012)
    expect(whitecapFraction(20)).toBeGreaterThan(0.08)
    expect(whitecapFraction(60)).toBe(CAP_MAX)
  })

  /**
   * The run's claim, as a fact about the data: the still the tour takes is a
   * sea with a few percent of white on it, not the 15% the hand-tuned coverage
   * held — which, averaged at the wide frame, laid a milky sheet over the sound.
   */
  test('the authored sea is dark water with white flecks on it', () => {
    const still = capsAmount(whitecap, state, 0)

    expect(still).toBeGreaterThan(0.002)
    expect(still).toBeLessThan(0.03)
  })

  test('the scale is the switch, and so is a glass sea', () => {
    for (let wind = 0; wind <= 3; wind += 0.05) {
      expect(capsAmount(0, state, wind)).toBe(0)
      expect(capsAmount(whitecap, 0, wind)).toBe(0)
    }
    expect(capsAmount(-1, state, GUSTING)).toBe(0)
  })

  test('it rises with the wind once the wind outblows the sea state', () => {
    let previous = capsAmount(whitecap, state, 0)

    for (let wind = 0; wind <= 3; wind += 0.05) {
      const now = capsAmount(whitecap, state, wind)

      expect(now).toBeGreaterThanOrEqual(previous)
      previous = now
    }
    expect(SEA_WIND * state).toBeLessThan(GUSTING)
    expect(capsAmount(whitecap, state, GUSTING)).toBeGreaterThan(capsAmount(whitecap, state, 0))
    expect(capsAmount(whitecap, state, 2.4)).toBeGreaterThan(capsAmount(whitecap, state, GUSTING))
    expect(WIND_METRES * strength).toBeGreaterThan(7)
  })
})

describe('the cut', () => {
  test('a smaller share cuts higher in the map, and stays inside it', () => {
    let previous = 0

    for (const share of [ 0.5, 0.35, 0.2, 0.1, 0.05, 0.02, 0.01, 0.003, 0.001, 0.0001 ]) {
      const cut = capsCut(share)

      expect(cut).toBeGreaterThanOrEqual(previous)
      expect(cut).toBeLessThan(0.89)
      previous = cut
    }
    expect(capsCut(0.05)).toBeCloseTo(0.769, 3)
    expect(capsCut(0.01)).toBeCloseTo(0.831, 3)
  })
})

/**
 * The cost of this system, stated where a refactor has to walk past it: one
 * dependent read of its own, and neither mask probed again.
 */
describe('the chunk', () => {
  test('it takes exactly one texture read, and does not probe either mask', () => {
    expect(WATER_CAPS_GLSL.match(/texture2D/g)).toHaveLength(1)
    expect(WATER_CAPS_GLSL).not.toContain('scapeShore')
    expect(WATER_CAPS_GLSL).not.toContain('scapeShelter(')
  })

  test('the lee is the measured shelter, and spares more than the surf does', () => {
    expect(WATER_CAPS_GLSL).toContain('scapeShelterLee')
    expect(WATER_CAPS_GLSL).toContain('uCapsLee')
    expect(whitecapLee).toBeGreaterThan(surfExposure)
    expect(whitecapLee).toBeLessThanOrEqual(1)
  })

  test('its phase is the wind travel every scrolling surface shares', () => {
    expect(WATER_CAPS_GLSL).toContain('uSurgePhase')
    expect(WATER_CAPS_GLSL).not.toContain('uWaveTime')
  })
})

describe('the uniforms', () => {
  const caps = (seaState: number): Vector2 => {
    const uniforms = { uCaps: { value: new Vector2() }, uCapsLee: { value: 0 }}
    setCaps(uniforms, { ...SCAPE_CONFIG.water, state: seaState }, GUSTING)
    return uniforms.uCaps.value
  }

  test('the share and its cut travel together', () => {
    expect(caps(0).x).toBe(0)
    expect(caps(1).x).toBe(capsAmount(whitecap, 1, GUSTING))
    expect(caps(1).y).toBe(capsCut(caps(1).x))
    expect(caps(2).x).toBeGreaterThan(caps(1).x)
  })
})
