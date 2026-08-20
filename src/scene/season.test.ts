import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from './config.ts'
import {
  createSeason,
  freezeAmount,
  growthAmount,
  seaSmokeAmount,
  snowAmount,
  turnAmount,
} from './season.ts'


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

describe('seaSmokeAmount', () => {
  const weeks = Array.from({ length: 520 }, (_, index) => index / 520)

  test('needs a winter, so there is none in summer', () => {
    expect(seaSmokeAmount(0.5)).toBe(0)
    expect(seaSmokeAmount(0.4)).toBe(0)
  })

  test('needs open water, so there is none at the depth of the winter', () => {
    // The land and the sea have both taken the season by now: nothing to steam.
    expect(seaSmokeAmount(0)).toBeLessThan(0.02)
  })

  test('smokes on the way into the winter and not on the way out', () => {
    // The lag runs the other way in spring — the air is back and the bays are
    // still shut — which is the difference going negative and being clamped.
    expect(seaSmokeAmount(0.87)).toBeGreaterThan(0.5)
    expect(seaSmokeAmount(0.13)).toBe(0)
  })

  test('peaks in the weeks between the land freezing and the sea doing it', () => {
    const peak = weeks.reduce((best, phase) =>
      seaSmokeAmount(phase) > seaSmokeAmount(best) ? phase : best, 0)

    expect(peak).toBeGreaterThan(0.8)
    expect(peak).toBeLessThan(1)
  })

  test('is never negative, anywhere in the year', () => {
    for (const phase of weeks)
      expect(seaSmokeAmount(phase)).toBeGreaterThanOrEqual(0)
  })

  test('claims fewer weeks than either winter it is the gap between', () => {
    const steaming = weeks.filter(phase => seaSmokeAmount(phase) > 0.01).length
    const frozen   = weeks.filter(phase => freezeAmount(phase) > 0).length
    const white    = weeks.filter(phase => snowAmount(phase) > 0).length

    expect(steaming).toBeLessThan(frozen)
    expect(steaming).toBeLessThan(white)
  })

  test('wraps phases outside 0..1 onto the same week', () => {
    expect(seaSmokeAmount(-1.13)).toBeCloseTo(seaSmokeAmount(0.87), 6)
  })
})

describe('createSeason', () => {
  const season = createSeason(() => SCAPE_CONFIG)

  test('leaves the authored palette alone at midsummer', () => {
    const summer = season.sample(0.5)

    expect(summer.tintAmount).toBe(0)
    expect(summer.snow).toBe(0)
    expect(summer.freeze).toBe(0)
    expect(summer.smoke).toBe(0)
  })

  test('withers and whitens midwinter', () => {
    const winter = season.sample(0)

    expect(winter.tintAmount).toBeGreaterThan(0)
    expect(winter.snow).toBeGreaterThan(0.8)
  })

  test('scales the freeze by how hard the winter is configured to be', () => {
    const mild = createSeason(() => ({ ...SCAPE_CONFIG, season: { ...SCAPE_CONFIG.season, ice: 0 }}))

    expect(season.sample(0.06).freeze).toBeCloseTo(SCAPE_CONFIG.season.ice, 6)
    expect(mild.sample(0.06).freeze).toBe(0)
  })

  test('scales the sea smoke by how hard the coast is configured to steam', () => {
    const still = createSeason(() => ({ ...SCAPE_CONFIG, season: { ...SCAPE_CONFIG.season, seaSmoke: 0 }}))

    expect(season.sample(0.87).smoke).toBeGreaterThan(0)
    expect(still.sample(0.87).smoke).toBe(0)
  })

  test('steams before it shuts, on the same instant of the year', () => {
    // The whole of the effect in two readings: the weeks the smoke has are the
    // weeks the freeze has not started, and both come off the one sample. Read
    // out rather than held — `sample` is allocation-free, so the state it hands
    // back is the same object every time.
    const early                       = season.sample(0.87)
    const [ earlySmoke, earlyFreeze ] = [ early.smoke, early.freeze ]
    const deep                        = season.sample(0)

    expect(earlySmoke).toBeGreaterThan(deep.smoke)
    expect(earlyFreeze).toBeLessThan(deep.freeze)
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
