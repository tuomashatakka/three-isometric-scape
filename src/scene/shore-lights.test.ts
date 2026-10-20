import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from './config.ts'
import type { ScapeConfig } from './config.ts'
import { shoreLightLevel } from './shore-lights.ts'
import { householdWake, lampLevel } from './windows.ts'


/** The same scape with one knob moved, and nothing else touched. */
function withLights (overrides: Partial<ScapeConfig['shoreLights']>): ScapeConfig {
  return { ...SCAPE_CONFIG, shoreLights: { ...SCAPE_CONFIG.shoreLights, ...overrides }}
}

/** Mid-evening: the sun is down and the household is still up. */
const EVENING = (SCAPE_CONFIG.windows.rising + SCAPE_CONFIG.windows.bedtime) / 2

describe('how hard the far coast burns', () => {
  test('the sun puts it out', () => {
    expect(shoreLightLevel(SCAPE_CONFIG, 1, EVENING)).toBe(0)
    expect(shoreLightLevel(SCAPE_CONFIG, 0, EVENING)).toBeGreaterThan(0)
  })

  test('it comes up on the same dusk the farmstead does', () => {
    // The reuse, stated rather than hoped for. Two coasts in one frame that
    // disagreed about when dusk was would be the more obvious of the two bugs,
    // so the ratio between them is `glow` against `glow` at every hour of the
    // evening and nothing else.
    const ratio = SCAPE_CONFIG.shoreLights.glow / SCAPE_CONFIG.windows.glow

    for (const day of [ 0, 0.1, 0.35, 0.6, 0.9 ])
      expect(shoreLightLevel(SCAPE_CONFIG, day, EVENING))
        .toBeCloseTo(lampLevel(SCAPE_CONFIG, day, EVENING) * ratio, 10)
  })

  test('it banks down when the households turn in', () => {
    const small = EVENING + (1 - EVENING) * 0.9

    expect(householdWake(SCAPE_CONFIG, small)).toBeLessThan(1)
    expect(shoreLightLevel(SCAPE_CONFIG, 0, small))
      .toBeLessThan(shoreLightLevel(SCAPE_CONFIG, 0, EVENING))
  })

  test('the glow is the switch and there is no second one', () => {
    expect(shoreLightLevel(withLights({ glow: 0 }), 0, EVENING)).toBe(0)
    expect(shoreLightLevel(withLights({ glow: -1 }), 0, EVENING)).toBe(0)
    expect(shoreLightLevel(withLights({ glow: 2 }), 0, EVENING))
      .toBeCloseTo(shoreLightLevel(withLights({ glow: 1 }), 0, EVENING) * 2, 10)
  })
})
