import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from './config.ts'
import {
  createDaylight,
  darkAmount,
  dayAmount,
  dayLength,
  declination,
  goldenAmount,
  sunHeight,
  sunSwing,
} from './daylight.ts'


const { latitude, axialTilt } = SCAPE_CONFIG.daylight

const MIDWINTER = 0
const SPRING    = 0.25
const MIDSUMMER = 0.5
const AUTUMN    = 0.75

describe('declination', () => {
  test('stands a full axial tilt either side of the equator at the solstices', () => {
    expect(declination(MIDWINTER, axialTilt)).toBeCloseTo(-axialTilt * Math.PI / 180, 12)
    expect(declination(MIDSUMMER, axialTilt)).toBeCloseTo(axialTilt * Math.PI / 180, 12)
  })

  test('crosses the equator at both equinoxes', () => {
    expect(declination(SPRING, axialTilt)).toBeCloseTo(0, 12)
    expect(declination(AUTUMN, axialTilt)).toBeCloseTo(0, 12)
  })

  test('is a straight axis with no lean in it', () => {
    for (const phase of [ 0, 0.17, 0.5, 0.83 ])
      expect(Math.abs(declination(phase, 0))).toBe(0)
  })
})

describe('sunHeight', () => {
  test('peaks at noon and bottoms out at midnight', () => {
    const noon     = sunHeight(0.5, MIDSUMMER, latitude, axialTilt)
    const midnight = sunHeight(0, MIDSUMMER, latitude, axialTilt)

    expect(noon).toBeGreaterThan(midnight)

    for (let step = 1; step < 12; step += 1) {
      expect(sunHeight(0.5 + step / 24, MIDSUMMER, latitude, axialTilt)).toBeLessThan(noon)
      expect(sunHeight(step / 24, MIDSUMMER, latitude, axialTilt)).toBeGreaterThan(midnight)
    }
  })

  test('is symmetric about noon', () => {
    for (const offset of [ 0.04, 0.13, 0.28, 0.45 ])
      expect(sunHeight(0.5 - offset, AUTUMN, latitude, axialTilt))
        .toBeCloseTo(sunHeight(0.5 + offset, AUTUMN, latitude, axialTilt), 12)
  })

  test('climbs through the spring and falls through the autumn at noon', () => {
    for (let week = 0; week < 26; week += 1) {
      const rising  = sunHeight(0.5, week / 52, latitude, axialTilt)
      const higher  = sunHeight(0.5, (week + 1) / 52, latitude, axialTilt)
      const falling = sunHeight(0.5, (26 + week) / 52, latitude, axialTilt)
      const lower   = sunHeight(0.5, (27 + week) / 52, latitude, axialTilt)

      expect(higher).toBeGreaterThan(rising)
      expect(lower).toBeLessThan(falling)
    }
  })

  test('wraps both phases onto the same instant', () => {
    expect(sunHeight(2.31, -1.7, latitude, axialTilt))
      .toBeCloseTo(sunHeight(0.31, 0.3, latitude, axialTilt), 12)
  })
})

describe('dayLength', () => {
  test('is a polar night at midwinter and a midnight sun at midsummer', () => {
    expect(dayLength(MIDWINTER, latitude, axialTilt)).toBe(0)
    expect(dayLength(MIDSUMMER, latitude, axialTilt)).toBe(1)
  })

  test('is twelve hours at both equinoxes, at every latitude', () => {
    for (const north of [ 0, 23, 51, latitude, 80 ]) {
      expect(dayLength(SPRING, north, axialTilt)).toBeCloseTo(0.5, 12)
      expect(dayLength(AUTUMN, north, axialTilt)).toBeCloseTo(0.5, 12)
    }
  })

  test('has no year in it on the equator, or on an axis that does not lean', () => {
    for (const phase of [ 0, 0.19, 0.5, 0.81 ]) {
      expect(dayLength(phase, 0, axialTilt)).toBeCloseTo(0.5, 12)
      expect(dayLength(phase, latitude, 0)).toBeCloseTo(0.5, 12)
    }
  })

  test('lengthens without a step from midwinter to midsummer', () => {
    let previous = dayLength(MIDWINTER, latitude, axialTilt)

    for (let week = 1; week <= 26; week += 1) {
      const length = dayLength(week / 52, latitude, axialTilt)

      expect(length).toBeGreaterThanOrEqual(previous)
      expect(length - previous).toBeLessThan(0.2)
      previous = length
    }

    expect(previous).toBe(1)
  })

  test('agrees with the sun it is derived from, hour by hour', () => {
    for (const phase of [ 0.08, 0.3, 0.55, 0.92 ]) {
      let up = 0

      for (let hour = 0; hour < 1_440; hour += 1)
        if (sunHeight(hour / 1_440, phase, latitude, axialTilt) > 0)
          up += 1

      expect(up / 1_440).toBeCloseTo(dayLength(phase, latitude, axialTilt), 2)
    }
  })
})

describe('sunSwing', () => {
  test('puts the sun on its noon bearing at noon', () => {
    expect(Math.abs(sunSwing(0.5, MIDSUMMER, latitude, axialTilt))).toBeCloseTo(0, 6)
  })

  test('sweeps one way across the day', () => {
    let previous = sunSwing(0.02, AUTUMN, latitude, axialTilt)

    for (let step = 2; step < 48; step += 1) {
      const swing = sunSwing(step / 48, AUTUMN, latitude, axialTilt)

      expect(swing).toBeGreaterThan(previous)
      previous = swing
    }
  })

  test('carries the summer sun round the sky and the equinox one across half of it', () => {
    // Only the arc the sun is *up* for is a bearing anybody sees. Below the
    // horizon the solution keeps swinging, and comparing the whole circle
    // would be comparing two identical circles.
    const swept = (year: number): number => {
      let lowest  = Math.PI
      let highest = -Math.PI

      for (let step = 0; step < 720; step += 1) {
        const time = step / 720

        if (sunHeight(time, year, latitude, axialTilt) <= 0)
          continue

        const swing = sunSwing(time, year, latitude, axialTilt)

        lowest  = Math.min(lowest, swing)
        highest = Math.max(highest, swing)
      }

      return highest - lowest
    }

    expect(swept(MIDSUMMER)).toBeGreaterThan(Math.PI * 1.9)
    expect(swept(SPRING)).toBeGreaterThan(Math.PI * 0.9)
    expect(swept(SPRING)).toBeLessThan(Math.PI * 1.1)
  })

  test('stands the midnight sun due north', () => {
    expect(Math.abs(sunSwing(0, MIDSUMMER, latitude, axialTilt))).toBeCloseTo(Math.PI, 1)
  })
})

describe('darkAmount', () => {
  test('is fully dark well under the horizon and gone the moment the sun touches it', () => {
    expect(darkAmount(Math.sin(-30 * Math.PI / 180))).toBe(1)
    expect(darkAmount(0)).toBe(0)
    expect(darkAmount(0.4)).toBe(0)
    expect(darkAmount(Math.sin(-9 * Math.PI / 180))).toBeGreaterThan(0)
    expect(darkAmount(Math.sin(-9 * Math.PI / 180))).toBeLessThan(1)
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

  test('never points the key light below the horizon, on any week of the year', () => {
    for (let week = 0; week < 52; week += 1)
      for (let step = 0; step < 24; step += 1)
        expect(daylight.sample(step / 24, week / 52).direction.y).toBeGreaterThan(0)
  })

  test('dims the rig at night and restores it by noon', () => {
    const midnight = { ...daylight.sample(0, AUTUMN) }
    const noon     = { ...daylight.sample(0.5, AUTUMN) }

    expect(midnight.day).toBe(0)
    expect(noon.day).toBe(1)
    expect(midnight.sunStrength).toBeLessThan(noon.sunStrength * 0.3)
    expect(midnight.environment).toBeLessThan(noon.environment)
  })

  test('leaves the midsummer night no darkness, and the midwinter day no sun', () => {
    const whiteNight = { ...daylight.sample(0, MIDSUMMER) }
    const polarNoon  = { ...daylight.sample(0.5, MIDWINTER) }
    const polarNight = { ...daylight.sample(0, MIDWINTER) }
    const summerNoon = { ...daylight.sample(0.5, MIDSUMMER) }

    expect(whiteNight.dark).toBe(0)
    expect(whiteNight.day).toBeGreaterThan(0)
    expect(polarNight.dark).toBe(1)

    // The sun never clears the horizon on midwinter's day, so the brightest
    // hour of it is a twilight rather than a noon: never a full day, and never
    // the blackout a civil-twilight cutoff turned it into either.
    expect(sunHeight(0.5, MIDWINTER, latitude, axialTilt)).toBeLessThan(0)
    expect(polarNoon.day).toBeGreaterThan(0.2)
    expect(polarNoon.day).toBeLessThan(summerNoon.day * 0.5)
    expect(polarNoon.day).toBeGreaterThan(polarNight.day)
    expect(polarNight.day).toBe(0)
  })

  test('takes the year back out when the axis is straightened', () => {
    const level  = createDaylight({
      ...SCAPE_CONFIG,
      daylight: { ...SCAPE_CONFIG.daylight, axialTilt: 0 },
    })
    const summer = level.sample(0.3, MIDSUMMER).direction.clone()
    const winter = level.sample(0.3, MIDWINTER).direction.clone()

    expect(winter.x).toBeCloseTo(summer.x, 12)
    expect(winter.y).toBeCloseTo(summer.y, 12)
    expect(winter.z).toBeCloseTo(summer.z, 12)
  })

  test('wraps phases outside 0..1 onto the same instant', () => {
    const noon    = daylight.sample(0.5, 0.4).direction.clone()
    const nextDay = daylight.sample(2.5, 3.4).direction.clone()

    expect(nextDay.x).toBeCloseTo(noon.x, 6)
    expect(nextDay.y).toBeCloseTo(noon.y, 6)
  })

  test('resolves the same instant into the same state object', () => {
    const once  = { ...daylight.sample(0.31, 0.66), direction: daylight.sample(0.31, 0.66).direction.clone() }
    const twice = daylight.sample(0.31, 0.66)

    expect(daylight.sample(0.31, 0.66)).toBe(daylight.state)
    expect(twice.day).toBe(once.day)
    expect(twice.dark).toBe(once.dark)
    expect(twice.direction.x).toBe(once.direction.x)
  })
})
