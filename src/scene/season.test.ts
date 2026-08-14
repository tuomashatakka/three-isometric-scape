import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from './config.ts'
import { createSeason, growthAmount, snowAmount, turnAmount } from './season.ts'


describe('growthAmount', () => {
  test('is lush in summer and sere in winter', () => {
    expect(growthAmount(0.5)).toBeGreaterThan(0.95)
    expect(growthAmount(0)).toBe(0)
  })

  test('lags the sun, so the same distance either side of midsummer is not the same week', () => {
    expect(growthAmount(0.7)).toBeGreaterThan(growthAmount(0.3))
    expect(growthAmount(0.85)).toBeGreaterThan(growthAmount(0.15))
  })
})

describe('turnAmount', () => {
  test('turns nothing in spring and everything in autumn', () => {
    expect(turnAmount(0.25)).toBe(0)
    expect(turnAmount(0.75)).toBe(1)
  })

  test('is zero at both solstices', () => {
    expect(turnAmount(0)).toBe(0)
    expect(turnAmount(0.5)).toBe(0)
  })
})

describe('snowAmount', () => {
  test('covers midwinter and clears midsummer', () => {
    expect(snowAmount(0)).toBe(1)
    expect(snowAmount(0.5)).toBe(0)
  })

  test('is symmetric about midwinter', () => {
    expect(snowAmount(0.08)).toBeCloseTo(snowAmount(-0.08), 6)
  })
})

describe('createSeason', () => {
  const season = createSeason(SCAPE_CONFIG)

  test('leaves the authored palette alone at midsummer', () => {
    const summer = season.sample(0.5)

    expect(summer.tintAmount).toBe(0)
    expect(summer.snow).toBe(0)
  })

  test('withers and whitens midwinter', () => {
    const winter = season.sample(0)

    expect(winter.tintAmount).toBeGreaterThan(0)
    expect(winter.snow).toBeGreaterThan(0.8)
  })

  test('leans the tint toward gold only in the turn', () => {
    const sere = season.sample(0.02).tint.clone()
    const gold = season.sample(0.75).tint.clone()

    expect(gold.r - gold.b).toBeGreaterThan(sere.r - sere.b)
  })

  test('holds the snow line above the waterline', () => {
    expect(season.sample(0).snowLine).toBeGreaterThan(SCAPE_CONFIG.terrain.waterLevel)
  })

  test('wraps phases outside 0..1 onto the same week', () => {
    const autumn = season.sample(0.75)
    const amount = autumn.tintAmount
    const later  = season.sample(3.75)

    expect(later.phase).toBeCloseTo(0.75, 6)
    expect(later.tintAmount).toBeCloseTo(amount, 6)
  })

  test('resolves the same year from the same phase', () => {
    const once  = { ...season.sample(0.31), tint: season.sample(0.31).tint.getHex() }
    const twice = { ...season.sample(0.31), tint: season.sample(0.31).tint.getHex() }

    expect(twice).toEqual(once)
  })
})
