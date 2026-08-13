import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from './config.ts'
import { createDaylight, dayAmount, goldenAmount, sunHeight } from './daylight.ts'


describe('sunHeight', () => {
  test('peaks at noon and bottoms out at midnight', () => {
    expect(sunHeight(0.5, 52)).toBeCloseTo(Math.sin(52 * Math.PI / 180), 5)
    expect(sunHeight(0, 52)).toBeCloseTo(-Math.sin(52 * Math.PI / 180), 5)
  })

  test('crosses the horizon at dawn and dusk', () => {
    expect(sunHeight(0.25, 52)).toBeCloseTo(0, 6)
    expect(sunHeight(0.75, 52)).toBeCloseTo(0, 6)
  })
})

describe('dayAmount', () => {
  test('is fully dark below the horizon and fully lit well above it', () => {
    expect(dayAmount(-0.5)).toBe(0)
    expect(dayAmount(0.5)).toBe(1)
    expect(dayAmount(0)).toBeGreaterThan(0)
    expect(dayAmount(0)).toBeLessThan(1)
  })
})

describe('goldenAmount', () => {
  test('peaks near the horizon rather than at noon or midnight', () => {
    const low = goldenAmount(0.1)

    expect(low).toBeGreaterThan(goldenAmount(0.8))
    expect(low).toBeGreaterThan(goldenAmount(-0.4))
  })
})

describe('createDaylight', () => {
  const daylight = createDaylight(SCAPE_CONFIG)

  test('never points the key light below the horizon', () => {
    for (let step = 0; step < 24; step += 1)
      expect(daylight.sample(step / 24).direction.y).toBeGreaterThan(0)
  })

  test('dims the rig at night and restores it by noon', () => {
    const midnight = { ...daylight.sample(0) }
    const noon     = { ...daylight.sample(0.5) }

    expect(midnight.day).toBe(0)
    expect(noon.day).toBe(1)
    expect(midnight.sunStrength).toBeLessThan(noon.sunStrength * 0.3)
    expect(midnight.environment).toBeLessThan(noon.environment)
  })

  test('wraps phases outside 0..1 onto the same instant', () => {
    const noon    = daylight.sample(0.5).direction.clone()
    const nextDay = daylight.sample(2.5).direction.clone()

    expect(nextDay.x).toBeCloseTo(noon.x, 6)
    expect(nextDay.y).toBeCloseTo(noon.y, 6)
  })
})
