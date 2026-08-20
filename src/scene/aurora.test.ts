import { describe, expect, test } from 'bun:test'
import { auroraBrightness, auroraTileSize } from './aurora.ts'
import { SCAPE_CONFIG } from './config.ts'
import { createDaylight, darkAmount, sunHeight } from './daylight.ts'


const STRENGTH                = SCAPE_CONFIG.atmosphere.aurora
const { latitude, axialTilt } = SCAPE_CONFIG.daylight

/** The sky's darkness at an hour of a week, through the arc the scape's sun is on. */
function sky (time: number, year: number): number {
  return darkAmount(sunHeight(time, year, latitude, axialTilt))
}

describe('auroraTileSize', () => {
  test('keeps one broad curtain in the widest archipelago frame', () => {
    const maximum = SCAPE_CONFIG.camera.maxViewSize
    const tile    = auroraTileSize(maximum)

    expect(tile / maximum).toBeCloseTo(1.575, 6)
    expect(tile).toBeGreaterThan(maximum)
  })

  test('scales with the frame instead of the home island', () => {
    const maximum = SCAPE_CONFIG.camera.maxViewSize

    expect(auroraTileSize(maximum * 2)).toBeCloseTo(auroraTileSize(maximum) * 2)
  })
})

describe('auroraBrightness', () => {
  test('lights a winter midnight and nothing else about that day', () => {
    expect(auroraBrightness(sky(0, 0), STRENGTH)).toBeCloseTo(STRENGTH, 5)
    expect(auroraBrightness(sky(0.5, 0.25), STRENGTH)).toBe(0)
  })

  test('is gone from a midsummer night, because that night never gets dark', () => {
    expect(auroraBrightness(sky(0, 0.5), STRENGTH)).toBe(0)
  })

  test('fades in through the dusk rather than switching on at it', () => {
    const dusk = auroraBrightness(sky(0.79, 0.75), STRENGTH)

    expect(dusk).toBeGreaterThan(0)
    expect(dusk).toBeLessThan(STRENGTH)
    expect(dusk).toBeLessThan(auroraBrightness(sky(0.85, 0.75), STRENGTH))
  })

  test('is the switch — nothing lights a sky authored at zero', () => {
    expect(auroraBrightness(1, 0)).toBe(0)
    expect(auroraBrightness(1, -1)).toBe(0)
  })

  test('never exceeds the brightness it was authored at', () => {
    for (let year = 0; year < 1; year += 0.02)
      for (let time = 0; time < 1; time += 0.01) {
        const light = auroraBrightness(sky(time, year), STRENGTH)

        expect(light).toBeGreaterThanOrEqual(0)
        expect(light).toBeLessThanOrEqual(STRENGTH)
      }
  })

  test('reads the same sky the lighting rig reads', () => {
    const daylight = createDaylight(() => SCAPE_CONFIG)
    const winter   = daylight.sample(0, 0.02)

    expect(auroraBrightness(winter.dark, STRENGTH))
      .toBeCloseTo(auroraBrightness(sky(0, 0.02), STRENGTH), 10)
  })

  test('gives the polar night an aurora at noon, and midsummer none at midnight', () => {
    expect(auroraBrightness(sky(0.5, 0), STRENGTH)).toBeLessThan(STRENGTH * 0.2)
    expect(auroraBrightness(sky(0, 0), STRENGTH)).toBeGreaterThan(STRENGTH * 0.9)
    expect(auroraBrightness(sky(0, 0.5), STRENGTH)).toBe(0)
  })
})
