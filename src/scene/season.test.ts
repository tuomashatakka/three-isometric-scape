import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from './config.ts'
import { createSeason, freezeAmount, growthAmount, snowAmount, turnAmount } from './season.ts'


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

describe('freezeAmount', () => {
  test('shuts the water in deep winter and leaves it open in summer', () => {
    expect(freezeAmount(0.06)).toBe(1)
    expect(freezeAmount(0.5)).toBe(0)
  })

  test('arrives after the snow does', () => {
    // Early winter: the land is already whitening and the sea has not started.
    expect(snowAmount(0.8)).toBeGreaterThan(0)
    expect(freezeAmount(0.8)).toBe(0)
  })

  test('outlasts the snow it arrived behind', () => {
    // Early spring: the fields are bare again and the bays are still shut.
    expect(snowAmount(0.24)).toBe(0)
    expect(freezeAmount(0.24)).toBeGreaterThan(0)
  })

  test('claims a smaller part of the year than the snow does', () => {
    // A water column holds its heat, so the sea is shut for fewer weeks than
    // the ground is white — even though it is the later of the two to open.
    const weeks  = Array.from({ length: 520 }, (_, index) => index / 520)
    const frozen = weeks.filter(phase => freezeAmount(phase) > 0).length
    const white  = weeks.filter(phase => snowAmount(phase) > 0).length

    expect(frozen).toBeLessThan(white)
  })

  test('wraps phases outside 0..1 onto the same week', () => {
    expect(freezeAmount(2.13)).toBeCloseTo(freezeAmount(0.13), 6)
  })
})

describe('createSeason', () => {
  const season = createSeason(SCAPE_CONFIG)

  test('leaves the authored palette alone at midsummer', () => {
    const summer = season.sample(0.5)

    expect(summer.tintAmount).toBe(0)
    expect(summer.snow).toBe(0)
    expect(summer.freeze).toBe(0)
  })

  test('withers and whitens midwinter', () => {
    const winter = season.sample(0)

    expect(winter.tintAmount).toBeGreaterThan(0)
    expect(winter.snow).toBeGreaterThan(0.8)
  })

  test('scales the freeze by how hard the winter is configured to be', () => {
    const mild = createSeason({ ...SCAPE_CONFIG, season: { ...SCAPE_CONFIG.season, ice: 0 }})

    expect(season.sample(0.06).freeze).toBeCloseTo(SCAPE_CONFIG.season.ice, 6)
    expect(mild.sample(0.06).freeze).toBe(0)
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
