import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from './config.ts'
import { dayAmount, sunHeight } from './daylight.ts'
import { ShaderChunk } from 'three'
import { installAerialPerspective, packFogNear, unpackFogNear } from './aerial.ts'
import { haarAmount, haarColumn, haarFog } from './haar.ts'
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
   * The trap the whitecaps' retired onset fell into once already, stated here as a fact
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


const CEILING = WATER + HAAR.top

describe('the bank as a fog term', () => {
  test('stands the whole band over the sea and nothing over the tops', () => {
    expect(haarColumn(WATER, CEILING, HAAR.depth)).toBeCloseTo(Math.min(HAAR.depth, HAAR.top), 6)
    expect(haarColumn(CEILING + 0.01, CEILING, HAAR.depth)).toBe(0)
    expect(haarFog(SCAPE_CONFIG.terrain.waterLevel + 8.6, CEILING, HAAR.depth, 1)).toBe(0)
  })

  test('thins up every slope rather than cutting it at a line', () => {
    let last = 1

    for (let height = WATER; height <= CEILING; height += 0.25) {
      const fog = haarFog(height, CEILING, HAAR.depth, 0.85)

      expect(fog).toBeLessThanOrEqual(last + 1e-9)
      last = fog
    }
  })

  test('fills the sound on a dark calm night and leaves lanes in it', () => {
    const amount = haarAmount(HAAR, NIGHT, 0, WET)

    expect(haarFog(WATER, CEILING, HAAR.depth, amount, 1)).toBeGreaterThan(0.45)
    expect(haarFog(WATER, CEILING, HAAR.depth, amount, 0)).toBeLessThan(haarFog(WATER, CEILING, HAAR.depth, amount, 1) * 0.6)
  })

  test('rides the fog chunk every program already has, on every tier', () => {
    const before = { ...ShaderChunk }

    installAerialPerspective(60, WATER, { ceiling: CEILING, depth: HAAR.depth })
    expect(ShaderChunk.fog_fragment).toContain('haarColumn')
    expect(ShaderChunk.fog_fragment).toContain(CEILING.toFixed(4))
    Object.assign(ShaderChunk, before)

    for (const [ ground, haar ] of [[ 0, 0 ], [ 1.83, 0.4 ], [ 5.4, 0.85 ]]) {
      const back = unpackFogNear(packFogNear(ground, haar))

      expect(back.ground).toBeCloseTo(ground, 1)
      expect(back.haar).toBeCloseTo(haar, 4)
    }
  })
})
