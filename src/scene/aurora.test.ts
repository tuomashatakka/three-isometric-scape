import { describe, expect, test } from 'bun:test'
import { auroraBrightness } from './aurora.ts'
import { SCAPE_CONFIG } from './config.ts'
import { createSeason, darkAmount } from './season.ts'


const STRENGTH = SCAPE_CONFIG.atmosphere.aurora

describe('auroraBrightness', () => {
  test('lights a winter midnight and nothing else about that day', () => {
    expect(auroraBrightness(0, darkAmount(0), STRENGTH)).toBeCloseTo(STRENGTH, 5)
    expect(auroraBrightness(1, darkAmount(0), STRENGTH)).toBe(0)
  })

  test('is gone from a midsummer night, dark or not', () => {
    expect(auroraBrightness(0, darkAmount(0.5), STRENGTH)).toBe(0)
  })

  test('fades out through the dusk rather than switching off at it', () => {
    const dusk = auroraBrightness(0.15, 1, STRENGTH)

    expect(dusk).toBeGreaterThan(0)
    expect(dusk).toBeLessThan(STRENGTH)
    expect(dusk).toBeLessThan(auroraBrightness(0.08, 1, STRENGTH))
  })

  test('is the switch — nothing lights a sky authored at zero', () => {
    expect(auroraBrightness(0, 1, 0)).toBe(0)
    expect(auroraBrightness(0, 1, -1)).toBe(0)
  })

  test('never exceeds the brightness it was authored at', () => {
    for (let day = 0; day <= 1; day += 0.05)
      for (let phase = 0; phase < 1; phase += 0.02) {
        const light = auroraBrightness(day, darkAmount(phase), STRENGTH)

        expect(light).toBeGreaterThanOrEqual(0)
        expect(light).toBeLessThanOrEqual(STRENGTH)
      }
  })

  test('reads the same darkness the rest of the year reads', () => {
    const season = createSeason(SCAPE_CONFIG)
    const winter = season.sample(0.02)

    expect(auroraBrightness(0, winter.dark, STRENGTH))
      .toBeCloseTo(auroraBrightness(0, darkAmount(0.02), STRENGTH), 10)
  })
})
