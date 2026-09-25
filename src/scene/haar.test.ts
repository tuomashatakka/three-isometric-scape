import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from './config.ts'
import { dayAmount, sunHeight } from './daylight.ts'
import { haarAmount, haarSheetHeights, haarSheetSize, haarSheetWeight } from './haar.ts'
import { LADDER, atmosphereQuality, unlockEffects } from './quality.ts'
import { wetAmount } from './weather.ts'


const HAAR  = SCAPE_CONFIG.haar
const WATER = SCAPE_CONFIG.terrain.waterLevel

/** What the ground has in it at the hour the config is parked on. */
const WET = wetAmount(SCAPE_CONFIG.weather.time)

/** How much sun is on the ground at an hour of a week, which is the only gate. */
function daylight (time: number, year: number): number {
  const { latitude, axialTilt } = SCAPE_CONFIG.daylight

  return dayAmount(sunHeight(time, year, latitude, axialTilt))
}

/** Late autumn, an hour past midnight: the sun twenty-six degrees under. */
const NIGHT = daylight(0.02, 0.78)

/** Midsummer midnight at latitude 68, which has better than half a noon in it. */
const WHITE_NIGHT = daylight(0, 0.5)

/** A midwinter afternoon: the polar night, with the sun under the horizon all day. */
const POLAR = daylight(0.42, 0.02)

/** Noon: the sun full on the ground, and nothing left to condense. */
const NOON = daylight(0.5, 0.5)


describe('haarAmount', () => {
  test('is the switch and the only one: at zero strength there is never a bank', () => {
    const off = { ...HAAR, strength: 0 }

    for (const wind of [ 0, 0.5, 2 ])
      for (const wet of [ 0, 0.5, 1 ])
        expect(haarAmount(off, NIGHT, wind, wet)).toBe(0)
  })

  test('is gone by noon whatever the calm and the wet', () => {
    expect(NOON).toBe(1)

    for (const wet of [ 0, 0.5, 1 ])
      expect(haarAmount(HAAR, NOON, 0, wet)).toBeCloseTo(0, 6)
  })

  test('fills the low ground on a dark, calm night at the authored numbers', () => {
    expect(NIGHT).toBe(0)
    expect(haarAmount(HAAR, NIGHT, 0, WET)).toBeGreaterThan(0.3)
  })

  /**
   * The whole of the seasonal response, and there is no curve of the year in the
   * scape doing it. `day` at latitude 68 is a fact about the week as much as the
   * hour: a midsummer midnight has better than half a noon's sun standing on the
   * ground and a midwinter *afternoon* has none at all, so raising the night to
   * a power orders the year correctly off the sun's own arc and nothing else.
   */
  test('a midsummer midnight gets a wash where a midwinter afternoon gets a bank', () => {
    const white = haarAmount(HAAR, WHITE_NIGHT, 0, WET)
    const polar = haarAmount(HAAR, POLAR, 0, WET)
    const night = haarAmount(HAAR, NIGHT, 0, WET)

    expect(WHITE_NIGHT).toBeGreaterThan(0.5)
    expect(white).toBeGreaterThan(0)
    expect(white).toBeLessThan(polar * 0.5)
    expect(polar).toBeGreaterThan(0.2)
    expect(polar).toBeLessThan(night)
  })

  test('thins with every increase in the wind and is gone at the scour', () => {
    const winds = [ 0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8 ]
    const bank  = winds.map(wind => haarAmount(HAAR, NIGHT, wind, WET))

    for (let index = 1; index < bank.length; index += 1)
      expect(bank[index]).toBeLessThan(bank[index - 1])

    expect(haarAmount(HAAR, NIGHT, HAAR.scour, WET)).toBe(0)
    expect(haarAmount(HAAR, NIGHT, HAAR.scour * 4, WET)).toBe(0)
  })

  /**
   * The trap `water.whitecapOnset` fell into once already, stated here as a fact
   * about the numbers rather than as prose. `STILL` zeroes `wind.strength`, so
   * every capture this scape takes is taken in a dead calm — set the scour at or
   * under the wind that is actually blowing and the bank exists only in
   * photographs, with no symptom in any one of them.
   */
  test('the authored wind, gusting, still leaves a bank for a reader to see', () => {
    const { strength, gust } = SCAPE_CONFIG.wind
    const gusted             = strength * (1 + gust)

    expect(HAAR.scour).toBeGreaterThan(gusted)
    expect(haarAmount(HAAR, NIGHT, gusted, WET)).toBeGreaterThan(0)
    expect(haarAmount(HAAR, NIGHT, strength, WET))
      .toBeGreaterThan(haarAmount(HAAR, NIGHT, gusted, WET))
  })

  test('a scour of zero is no threshold at all rather than a special case', () => {
    const none = { ...HAAR, scour: 0 }

    expect(haarAmount(none, NIGHT, 0, WET)).toBeGreaterThan(0)
    expect(haarAmount(none, NIGHT, 0.01, WET)).toBe(0)
  })

  test('the shower deepens it, and at damp zero it stops mattering', () => {
    const dry = haarAmount(HAAR, NIGHT, 0, 0)
    const wet = haarAmount(HAAR, NIGHT, 0, 1)

    expect(wet).toBeGreaterThan(dry)
    expect(dry).toBeGreaterThan(0)

    const indifferent = { ...HAAR, damp: 0 }

    expect(haarAmount(indifferent, NIGHT, 0, 0))
      .toBe(haarAmount(indifferent, NIGHT, 0, 1))
  })

  test('stays inside 0..1 and stays finite across the whole sweep', () => {
    for (const day of [ 0, 0.25, 0.5, 0.75, 1 ])
      for (const wind of [ 0, 0.9, 1.9, 5 ])
        for (const wet of [ 0, 0.4, 1 ]) {
          const bank = haarAmount(HAAR, day, wind, wet)

          expect(Number.isFinite(bank)).toBe(true)
          expect(bank).toBeGreaterThanOrEqual(0)
          expect(bank).toBeLessThanOrEqual(1)
          expect(haarAmount(HAAR, day, wind, wet)).toBe(bank)
        }
  })
})


/** Every sheet count the ladder can ask for, including the unlocked floor. */
const COUNTS = [ ...new Set(LADDER.flatMap(tier => {
  const quality = atmosphereQuality(tier)

  return [ quality.haarSheets, unlockEffects(quality).haarSheets ]
}).filter(count => count > 0)) ]


describe('haarSheetHeights', () => {
  test('the bank has a top, and it is exactly the one that was authored', () => {
    for (const count of COUNTS) {
      const heights = haarSheetHeights(WATER, HAAR.top, HAAR.depth, count)

      expect(heights).toHaveLength(count)
      expect(Math.max(...heights)).toBeCloseTo(WATER + HAAR.top, 6)
    }
  })

  test('deals the sheets upward through the band, lowest first', () => {
    const heights = haarSheetHeights(WATER, HAAR.top, HAAR.depth, 5)

    for (let index = 1; index < heights.length; index += 1)
      expect(heights[index]).toBeGreaterThan(heights[index - 1])

    expect(Math.min(...heights)).toBeCloseTo(WATER + HAAR.top - HAAR.depth, 6)
  })

  /**
   * A band set deeper than the water is deep must stack up rather than sink
   * into the lake's own plane: a sheet lying exactly on the surface fights it
   * for the same pixels at every zoom, and the camera decides who wins.
   */
  test('never puts a sheet in the sea, however deep the band is set', () => {
    for (const depth of [ 0, 3, 40, 400 ])
      for (const height of haarSheetHeights(WATER, HAAR.top, depth, 5))
        expect(height).toBeGreaterThan(WATER)
  })

  test('one sheet is the top itself, because the band is measured down from it', () => {
    expect(haarSheetHeights(WATER, HAAR.top, HAAR.depth, 1)).toEqual([ WATER + HAAR.top ])
  })
})


describe('haarSheetWeight', () => {
  test('is heaviest at the bottom, so the stack has a top rather than a lid', () => {
    const weights = Array.from({ length: 5 }, (_unused, index) => haarSheetWeight(index, 5))

    for (let index = 1; index < weights.length; index += 1)
      expect(weights[index]).toBeLessThan(weights[index - 1])
  })

  test('every share is a usable opacity', () => {
    for (const count of [ 1, 2, 4, 5, 8 ])
      for (let index = 0; index < count; index += 1) {
        const weight = haarSheetWeight(index, count)

        expect(weight).toBeGreaterThan(0)
        expect(weight).toBeLessThanOrEqual(1)
      }
  })

  /**
   * The claim the tier gate makes: a phone gets the same bank with a harder edge
   * on it, not a fifth of the fog. Checked on what the stack actually composites
   * to rather than on the sum, because that is what a reader sees.
   */
  test('a thin stack composites to about the same bank as a deep one', () => {
    const cover = (count: number): number =>
      1 - Array.from({ length: count }, (_unused, index) => 1 - haarSheetWeight(index, count) * 0.6)
        .reduce((product, pass) => product * pass, 1)

    const thin = cover(2)
    const deep = cover(5)

    expect(Math.abs(thin - deep)).toBeLessThan(0.12)
  })
})


describe('haarSheetSize', () => {
  test('reaches past the widest frame the camera can open, from any pan', () => {
    const size = haarSheetSize(SCAPE_CONFIG.archipelago.worldSize)

    expect(size).toBeGreaterThan(SCAPE_CONFIG.camera.maxViewSize * 2)
    expect(size).toBeGreaterThan(SCAPE_CONFIG.archipelago.worldSize)
  })

  test('is world-sized: a wider archipelago gets a wider sheet', () => {
    expect(haarSheetSize(2000)).toBeCloseTo(haarSheetSize(1000) * 2, 6)
  })
})
