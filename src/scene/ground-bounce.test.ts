import { describe, expect, test } from 'bun:test'
import { Color } from 'three'
import { SCAPE_CONFIG } from './config.ts'
import { groundBounce } from './ground-bounce.ts'
import type { GroundBounce } from './ground-bounce.ts'


const luma = (c: Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b

function floor (over: Partial<GroundBounce> = {}): Color {
  return groundBounce(new Color(), {
    turf:         new Color(SCAPE_CONFIG.palette.meadow),
    snow:         new Color(SCAPE_CONFIG.palette.snow),
    cover:        0,
    sky:          new Color(SCAPE_CONFIG.atmosphere.hemiSky),
    skyIntensity: SCAPE_CONFIG.atmosphere.hemiStrength * 2.6,
    key:          new Color(1, 0.96, 0.9),
    keyIntensity: SCAPE_CONFIG.atmosphere.sunStrength,
    keyHeight:    0.5,
    shade:        0.4,
    bounce:       1,
    ...over,
  })
}

describe('ground bounce', () => {
  test('a snowfield lights a face from below several times brighter than turf', () => {
    expect(luma(floor({ cover: 1 }))).toBeGreaterThan(4 * luma(floor()))
  })

  test('the sun on the ground lights the floor; the deck and the night take it away', () => {
    const sunlit = luma(floor({ shade: 0 }))
    expect(sunlit).toBeGreaterThan(luma(floor({ shade: 0.84 })))
    expect(luma(floor({ shade: 1 }))).toBeCloseTo(luma(floor({ keyHeight: 0 })), 6)
    expect(luma(floor({ keyHeight: -0.3 }))).toBeCloseTo(luma(floor({ keyHeight: 0 })), 6)
  })

  test('the indirect-light row at zero leaves the sky-lit ground alone', () => {
    expect(luma(floor({ bounce: 0 }))).toBeCloseTo(luma(floor({ keyHeight: 0 })), 6)
    expect(luma(floor({ bounce: 2 }))).toBeGreaterThan(luma(floor()))
  })

  test('the floor is never brighter than the light falling on the ground', () => {
    const sky   = new Color(SCAPE_CONFIG.atmosphere.hemiSky)
    const top   = floor({ cover: 1, shade: 0, keyHeight: 1, bounce: 1 })
    const keyed = SCAPE_CONFIG.atmosphere.sunStrength / (SCAPE_CONFIG.atmosphere.hemiStrength * 2.6)
    expect(luma(top)).toBeLessThan(luma(sky) + keyed)
  })

  test('deterministic, and writes only into out', () => {
    const a = floor()
    const b = floor()
    expect(a.equals(b)).toBe(true)
  })
})
