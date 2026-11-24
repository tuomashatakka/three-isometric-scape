import { describe, expect, test } from 'bun:test'
import { Color } from 'three'
import { SCAPE_CONFIG } from './config.ts'
import { createDaylight } from './daylight.ts'
import {
  ADAPT_RATE, EXPOSURE_NIGHT, EXPOSURE_NOON, EXPOSURE_OPEN, FRONT_VEIL,
  adaptExposure, exposureCeiling, frontVeil, incidentLight, meteredExposure, overcast,
} from './exposure.ts'
import { luminance } from './white-balance.ts'

/** The rig's sky fill, as `atmosphere.ts` casts the hemisphere. */
const SKY_FILL = 2.6

interface Reading {
  incident: number
  day:      number
}

/** The meter's reading for an instant under the opening config, as the rig would cast it. */
function reading (time: number, season: number, fall = 0): Reading {
  const config   = structuredClone(SCAPE_CONFIG)
  const sky      = createDaylight(() => config).sample(time, season)
  const veil     = frontVeil(fall)
  const shade    = config.atmosphere.cloudCover * config.atmosphere.cloudShadow
  const incident = incidentLight(sky.sun, sky.sunStrength * (1 - veil), sky.direction.y, sky.hemiSky, sky.hemiStrength * SKY_FILL, shade)

  return { incident, day: sky.day }
}

function exposureAt (time: number, season: number, fall = 0): number {
  const { incident, day } = reading(time, season, fall)

  return meteredExposure(incident, day)
}

describe('the meter', () => {
  test('a clear midsummer noon meters to the noon stop', () => {
    expect(exposureAt(0.5, 0.5)).toBeCloseTo(EXPOSURE_NOON, 1)
  })

  test('opens up under a front, for a low sun and for a winter noon, and stops down in sun', () => {
    const noon = exposureAt(0.5, 0.5)
    expect(exposureAt(0.5, 0.5, 0.9)).toBeGreaterThan(noon * 1.15)
    expect(exposureAt(0.2, 0.5)).toBeGreaterThan(noon * 1.15)
    expect(exposureAt(0.5, 0.02)).toBeGreaterThan(noon * 1.3)
  })

  test('a night is opened no further than an adapted eye', () => {
    expect(exposureAt(0.02, 0.78)).toBeLessThanOrEqual(EXPOSURE_NIGHT + 1e-9)
    expect(meteredExposure(0, 0)).toBeCloseTo(EXPOSURE_NIGHT, 9)
    expect(meteredExposure(0, 1)).toBeCloseTo(EXPOSURE_OPEN, 9)
    expect(exposureCeiling(0.5)).toBeGreaterThan(EXPOSURE_NIGHT)
  })

  test('is monotone: more light never opens the iris', () => {
    let last = Infinity
    for (let light = 0.05; light < 6; light *= 1.3) {
      const value = meteredExposure(light, 1)
      expect(value).toBeLessThanOrEqual(last + 1e-12)
      last = value
    }
  })

  test('the front veils the key, but never all of it', () => {
    expect(frontVeil(0)).toBe(0)
    expect(frontVeil(1)).toBeCloseTo(FRONT_VEIL, 9)
    expect(frontVeil(0.25)).toBeGreaterThan(0)
    expect(frontVeil(0.25)).toBeLessThan(FRONT_VEIL)
    expect(reading(0.5, 0.5, 1).incident).toBeLessThan(reading(0.5, 0.5).incident)
  })

  test('an overcast greys a sky colour and keeps its brightness', () => {
    const blue = new Color(0.3, 0.5, 0.9)
    const lum  = luminance(blue)
    overcast(blue, FRONT_VEIL)
    expect(luminance(blue)).toBeCloseTo(lum, 6)
    expect(blue.b - blue.r).toBeLessThan(0.1)

    const kept = new Color(0.3, 0.5, 0.9)
    expect(overcast(kept, 0).equals(new Color(0.3, 0.5, 0.9))).toBe(true)
  })

  test('the iris approaches its target, never overshoots, and is frame-rate independent', () => {
    const once = adaptExposure(1.16, 0.92, 1)
    expect(once).toBeGreaterThan(0.92)
    expect(once).toBeLessThan(1.16)
    expect(adaptExposure(1, 1, 0.5)).toBe(1)

    const halves = adaptExposure(adaptExposure(1.16, 0.92, 0.5), 0.92, 0.5)
    expect(halves).toBeCloseTo(once, 9)
    expect(ADAPT_RATE).toBeGreaterThan(0)
  })
})
