import { describe, expect, test } from 'bun:test'
import { Color } from 'three'
import { SCAPE_CONFIG } from './config.ts'
import {
  LUNATIONS,
  createDaylight,
  darkAmount,
  dayAmount,
  dayLength,
  declination,
  goldenAmount,
  keyPlace,
  keyShare,
  moonAmount,
  moonIllumination,
  moonPhase,
  moonPlace,
  sunHeight,
  sunSwing,
} from './daylight.ts'


const { latitude, axialTilt } = SCAPE_CONFIG.daylight

/** The week of the year whose month lands on a wanted phase. */
function weekAtPhase (phase: number): number {
  return phase / LUNATIONS
}

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
  const daylight = createDaylight(() => SCAPE_CONFIG)

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
    const level  = createDaylight(() => ({
      ...SCAPE_CONFIG,
      daylight: { ...SCAPE_CONFIG.daylight, axialTilt: 0 },
    }))
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

describe('moonPhase', () => {
  test('turns a whole month for every lunation of the year', () => {
    expect(moonPhase(0)).toBeCloseTo(0, 10)
    expect(moonPhase(weekAtPhase(0.5))).toBeCloseTo(0.5, 10)
    expect(moonPhase(weekAtPhase(1))).toBeCloseTo(0, 10)
    expect(moonPhase(weekAtPhase(12.5))).toBeCloseTo(0.5, 10)
  })

  test('stays inside one month however many years have run', () => {
    for (const year of [ -3.4, -0.2, 0, 0.37, 4.9, 41 ]) {
      expect(moonPhase(year)).toBeGreaterThanOrEqual(0)
      expect(moonPhase(year)).toBeLessThan(1)
    }
  })
})

describe('moonIllumination', () => {
  test('is dark at new, full at full and exactly half at both quarters', () => {
    expect(moonIllumination(0)).toBeCloseTo(0, 10)
    expect(moonIllumination(0.25)).toBeCloseTo(0.5, 10)
    expect(moonIllumination(0.5)).toBeCloseTo(1, 10)
    expect(moonIllumination(0.75)).toBeCloseTo(0.5, 10)
    expect(moonIllumination(1)).toBeCloseTo(0, 10)
  })

  test('waxes and wanes rather than jumping at the turn of the month', () => {
    expect(moonIllumination(0.24)).toBeLessThan(moonIllumination(0.26))
    expect(moonIllumination(0.74)).toBeGreaterThan(moonIllumination(0.76))
    expect(moonIllumination(1.1)).toBeCloseTo(moonIllumination(0.1), 10)
  })
})

describe('moonPlace', () => {
  test('a full moon transits at midnight and is under the ground at noon', () => {
    const year = weekAtPhase(0.5)

    expect(moonPlace(0, year, latitude, axialTilt).height)
      .toBeGreaterThan(moonPlace(0.5, year, latitude, axialTilt).height)
  })

  test('a new moon keeps the sun company — up in the day, gone at night', () => {
    const year = weekAtPhase(0.02)
    const noon = moonPlace(0.5, year, latitude, axialTilt).height

    expect(noon).toBeGreaterThan(moonPlace(0, year, latitude, axialTilt).height)
    expect(noon).toBeCloseTo(sunHeight(0.5, year, latitude, axialTilt), 2)
  })

  // The claim the whole ecliptic term is here to make. Sharing the sun's own
  // declination would make these two equal; a real northern winter has the
  // opposite of that.
  test('the midwinter full moon rides high over the midwinter sun', () => {
    const year = weekAtPhase(0.5)
    const moon = moonPlace(0, year, latitude, axialTilt).height
    const sun  = sunHeight(0.5, year, latitude, axialTilt)

    expect(year).toBeLessThan(0.05)
    expect(sun).toBeLessThan(0)
    expect(moon).toBeGreaterThan(0.3)
  })

  test('a bearing is resolved wherever the moon is, and never runs off the circle', () => {
    for (let step = 0; step <= 24; step += 1) {
      const place = moonPlace(step / 24, 0.31, latitude, axialTilt)

      expect(Number.isFinite(place.swing)).toBe(true)
      expect(Math.abs(place.swing)).toBeLessThanOrEqual(Math.PI)
      expect(Math.abs(place.height)).toBeLessThanOrEqual(1)
    }
  })
})

describe('moonAmount', () => {
  test('is the lit share of the disc with the moon up and the sky properly dark', () => {
    expect(moonAmount(0.5, 0.5, 1)).toBeCloseTo(1, 6)
    expect(moonAmount(0.5, 0.25, 1)).toBeCloseTo(0.5, 6)
  })

  test('a new moon lights nothing however high it stands', () => {
    expect(moonAmount(0.9, 0, 1)).toBeCloseTo(0, 10)
  })

  test('a moon under the sea lights nothing however full it is', () => {
    expect(moonAmount(-0.01, 0.5, 1)).toBe(0)
    expect(moonAmount(-0.6, 0.5, 1)).toBe(0)
  })

  // The gate the stars and the aurora already open on, and the reason there is
  // no curve of the year here: a midsummer midnight at this latitude never gets
  // dark, so it never gets a moonlit hillside either.
  test('a sky the sun has not left keeps its moonlight off the ground', () => {
    const summer = darkAmount(sunHeight(0, MIDSUMMER, latitude, axialTilt))
    const autumn = darkAmount(sunHeight(0.02, 0.78, latitude, axialTilt))

    expect(moonAmount(0.5, 0.5, summer)).toBe(0)
    expect(moonAmount(0.5, 0.5, autumn)).toBeGreaterThan(0.9)
  })
})

describe('keyShare', () => {
  test('is the brighter of the two bodies, weighed in one unit', () => {
    expect(keyShare(1, 0)).toBe(0)
    expect(keyShare(0, 0.1)).toBe(1)
    expect(keyShare(0.1, 0.1)).toBeCloseTo(0.5, 12)
  })

  // The house rule, as a fact about the numbers: an effect is off when its
  // strength is zero, and a moon worth no light must not move a shadow either.
  test('no moonlight leaves the key exactly where the sun left it', () => {
    expect(keyShare(0, 0)).toBe(0)
    expect(keyShare(0.4, 0)).toBe(0)
    expect(keyShare(-1, -1)).toBe(0)
  })
})

describe('keyPlace', () => {
  const sun  = { height: -0.4, swing: 2.9 }
  const moon = { height: 0.58, swing: -2.9 }

  /** A bearing is a direction rather than a number: one turn round is the same one. */
  const bearing = (swing: number): number => Math.atan2(Math.sin(swing), Math.cos(swing))

  test('is one body or the other at the ends of the crossfade', () => {
    expect(bearing(keyPlace(sun, moon, 0).swing)).toBeCloseTo(sun.swing, 12)
    expect(keyPlace(sun, moon, 0).height).toBeCloseTo(sun.height, 12)
    expect(bearing(keyPlace(sun, moon, 1).swing)).toBeCloseTo(moon.swing, 12)
    expect(keyPlace(sun, moon, 1).height).toBeCloseTo(moon.height, 12)
  })

  // The reason the crossfade is done in the sky rather than on two vectors.
  // Halfway between two bodies a quarter turn either side of due north is due
  // north — not the zenith, which is where lerping the vectors would put it.
  test('walks the short way round the compass rather than back through noon', () => {
    const half = keyPlace(sun, moon, 0.5)

    expect(Math.abs(half.swing)).toBeGreaterThan(Math.PI - 1e-9)
    expect(half.height).toBeCloseTo((sun.height + moon.height) / 2, 12)
  })

  test('holds a share outside the crossfade at its ends', () => {
    expect(bearing(keyPlace(sun, moon, -3).swing)).toBeCloseTo(sun.swing, 12)
    expect(bearing(keyPlace(sun, moon, 4).swing)).toBeCloseTo(moon.swing, 12)
  })
})

describe('the key light, through a night that has a moon in it', () => {
  // The tour's own night frame: an autumn midnight with the sun 26° under and a
  // waning gibbous moon a third of the way up the sky.
  const NIGHT = { time: 0.02, year: 0.78 }

  const lit = (moonStrength: number) => createDaylight(() => ({
    ...SCAPE_CONFIG,
    daylight: { ...SCAPE_CONFIG.daylight, moonStrength },
  })).sample(NIGHT.time, NIGHT.year)

  test('stands on the moon rather than on a sun that set hours ago', () => {
    const place   = moonPlace(NIGHT.time, NIGHT.year, latitude, axialTilt)
    const bearing = SCAPE_CONFIG.daylight.azimuth * Math.PI / 180 + place.swing
    const sky     = lit(SCAPE_CONFIG.daylight.moonStrength)

    expect(sky.moon).toBeGreaterThan(0.1)
    expect(sky.direction.x).toBeCloseTo(Math.sin(bearing) * Math.sqrt(1 - place.height ** 2), 2)
    expect(sky.direction.y).toBeCloseTo(place.height, 2)
  })

  test('lights the ground harder than the floor it replaced, and pales with it', () => {
    const dark  = lit(0)
    const moon  = lit(SCAPE_CONFIG.daylight.moonStrength)
    const white = new Color(SCAPE_CONFIG.palette.moon)

    expect(moon.sunStrength).toBeGreaterThan(dark.sunStrength * 2)
    expect(moon.sun.r).toBeGreaterThan(dark.sun.r)
    expect(Math.abs(moon.sun.b - white.b)).toBeLessThan(Math.abs(dark.sun.b - white.b))
  })

  test('the knob at zero is the night this scape had, shadows included', () => {
    const dark    = lit(0)
    const bearing = SCAPE_CONFIG.daylight.azimuth * Math.PI / 180 +
      sunSwing(NIGHT.time, NIGHT.year, latitude, axialTilt)

    const height = sunHeight(NIGHT.time, NIGHT.year, latitude, axialTilt)
    const flat   = Math.sqrt(1 - height ** 2)

    expect(dark.moon).toBe(0)
    expect(dark.direction.y).toBeCloseTo(0.16 / Math.hypot(flat, 0.16), 6)
    expect(Math.atan2(dark.direction.x, dark.direction.z)).toBeCloseTo(
      Math.atan2(Math.sin(bearing), Math.cos(bearing)), 6,
    )
  })

  test('noon is the light it always was, whatever the moon is doing', () => {
    const on  = createDaylight(() => SCAPE_CONFIG).sample(0.5, MIDSUMMER)
    const off = createDaylight(() => ({
      ...SCAPE_CONFIG,
      daylight: { ...SCAPE_CONFIG.daylight, moonStrength: 0 },
    })).sample(0.5, MIDSUMMER)

    expect(on.moon).toBe(0)
    expect(on.sunStrength).toBeCloseTo(SCAPE_CONFIG.atmosphere.sunStrength, 12)
    expect(on.sunStrength).toBe(off.sunStrength)
    expect(on.direction.x).toBeCloseTo(off.direction.x, 12)
  })
})
