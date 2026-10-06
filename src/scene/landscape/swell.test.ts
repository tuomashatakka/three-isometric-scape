import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { MAX_DEPTH } from './shore-mask.ts'
import {
  SWELL_GRAVITY,
  SWELL_TRAINS,
  shoalGain,
  swellBearings,
  swellPeriod,
  swellRate,
  swellStats,
  swellWavenumber,
} from './swell.ts'


const { swellLength, swellSpread, swellShoal, surfDepth } = SCAPE_CONFIG.water

/** Metres of water, as the fraction of {@link MAX_DEPTH} the mask stores. */
const fraction = (metres: number): number => metres / MAX_DEPTH


describe('the dispersion the swell runs on', () => {
  test('a longer swell is a slower one, and the relation is the square root', () => {
    expect(swellRate(70)).toBeCloseTo(Math.sqrt(SWELL_GRAVITY * Math.PI * 2 / 70), 9)

    // Four times the wavelength is half the angular rate. The claim, not a
    // sample of it: ω = sqrt(gk) and k goes as 1/L.
    for (const length of [ 12, 40, 70, 140, 220 ])
      expect(swellRate(length * 4)).toBeCloseTo(swellRate(length) / 2, 9)
  })

  test('a longer swell travels faster over the ground, which is the other half', () => {
    const speed = (length: number): number => length / swellPeriod(length)

    expect(speed(220)).toBeGreaterThan(speed(70))
    expect(speed(70)).toBeGreaterThan(speed(12))

    // A 70 m swell runs at about ten and a half metres a second. The three
    // axis-locked sines this replaced ran at about six, and nothing said why.
    expect(speed(swellLength)).toBeCloseTo(10.45, 2)
  })

  test('the wavenumber survives a wavelength of zero rather than dividing by it', () => {
    expect(Number.isFinite(swellWavenumber(0))).toBe(true)
    expect(Number.isFinite(swellRate(0))).toBe(true)
  })
})

describe('the fan the wind turns', () => {
  test('every train is a unit bearing, whatever the wind hands it', () => {
    for (const [ x, z ] of [[ 1, 0 ], [ 0, -1 ], [ 0.3, 0.4 ], [ -7, 11 ]])
      for (const [ runX, runZ ] of swellBearings(swellSpread, x, z))
        expect(Math.hypot(runX, runZ)).toBeCloseTo(1, 9)
  })

  test('a wind with no direction in it still leaves a sea with one', () => {
    const [ dominant ] = swellBearings(swellSpread, 0, 0)

    expect(Math.hypot(dominant[0], dominant[1])).toBeCloseTo(1, 9)
  })

  /**
   * The claim the whole run is about, stated as a fact about the bearings
   * rather than as a comment: turn the wind and the crests turn with it. The
   * surface this replaced was three sines locked to the world axes, so this
   * test fails on the old sea by construction.
   */
  test('the crests turn with the wind, through the whole compass', () => {
    for (let turn = 0; turn < 1; turn += 0.05) {
      const angle                             = turn * Math.PI * 2
      const wind: readonly [ number, number ] = [ Math.cos(angle), Math.sin(angle) ]
      const [ dominant ]                      = swellBearings(swellSpread, wind[0], wind[1])

      expect(dominant[0]).toBeCloseTo(wind[0], 9)
      expect(dominant[1]).toBeCloseTo(wind[1], 9)
    }
  })

  test('the fan opens off that bearing and nowhere else', () => {
    const [ dominant, ...fanned ] = swellBearings(swellSpread, 1, 0)

    for (const [ index, run ] of fanned.entries()) {
      const between = Math.acos(Math.min(1, dominant[0] * run[0] + dominant[1] * run[1]))

      expect(between).toBeCloseTo(Math.abs(SWELL_TRAINS[index + 1].fan) * swellSpread, 9)
    }
  })

  test('a long-crested swell is one bearing three times over', () => {
    for (const run of swellBearings(0, 0, 1)) {
      expect(run[0]).toBeCloseTo(0, 9)
      expect(run[1]).toBeCloseTo(1, 9)
    }
  })

  test('the same wind deals the same bearings, byte for byte', () => {
    expect(swellBearings(swellSpread, 0.6, -0.8))
      .toEqual(swellBearings(swellSpread, 0.6, -0.8))
  })
})

describe('what a bank does to what crosses it', () => {
  test('deep water is exactly the authored height, at every shoal setting', () => {
    for (const shoal of [ 0, 0.3, swellShoal, 1 ])
      expect(shoalGain(1, shoal)).toBeCloseTo(1, 9)
  })

  test('the authored share is the switch for the shoaling, and the only one', () => {
    // Out of the breaking band, where the lip is at one. The lip itself is
    // deliberately not gated on this: it is the limit a wave runs into when it
    // runs out of water, which is true of a sea nobody shoaled.
    for (let depth = 0.32; depth <= 1; depth += 0.05)
      expect(shoalGain(depth, 0)).toBeCloseTo(1, 9)
  })

  /**
   * The readme's claim about the drowned bank, as a fact about the number: the
   * swell trips on its weather flank and stands up in sets. Before this there
   * was no term anywhere that could make that true of the surface.
   */
  test('the swell stands up over the bank the archipelago already has', () => {
    const { crest } = SCAPE_CONFIG.shoals

    expect(shoalGain(fraction(crest), swellShoal)).toBeGreaterThan(1.25)
    expect(shoalGain(fraction(crest), swellShoal))
      .toBeGreaterThan(shoalGain(fraction(surfDepth), swellShoal))
  })

  test('it rises the whole way in, from the shelf to where the surf takes over', () => {
    let previous = shoalGain(1, swellShoal)

    for (let metres = MAX_DEPTH; metres >= 1; metres -= 0.05) {
      const gain = shoalGain(fraction(metres), swellShoal)

      expect(gain).toBeGreaterThanOrEqual(previous - 1e-9)
      previous = gain
    }
  })

  test('and is capped rather than running to infinity at the waterline', () => {
    for (let depth = 0; depth <= 1; depth += 0.001) {
      const gain = shoalGain(depth, 1)

      expect(Number.isFinite(gain)).toBe(true)
      expect(gain).toBeLessThanOrEqual(2)
      expect(gain).toBeGreaterThanOrEqual(0)
    }
  })

  test('and falls away again once the water runs out from under it', () => {
    // The breaking limit, as a band. A swell that went on growing into water
    // shallower than itself would be a crest standing over dry sand.
    let previous = shoalGain(fraction(0.8), swellShoal)

    for (let metres = 0.75; metres >= 0; metres -= 0.05) {
      const gain = shoalGain(fraction(metres), swellShoal)

      expect(gain).toBeLessThanOrEqual(previous + 1e-9)
      previous = gain
    }

    expect(previous).toBeLessThan(0.02)
    expect(shoalGain(0, swellShoal)).toBe(0)
  })

  test('nothing is drawn on dry ground', () => {
    expect(shoalGain(0, swellShoal)).toBe(0)
    expect(shoalGain(-0.2, swellShoal)).toBe(0)
  })
})

describe('what scape:map is told', () => {
  test('the reported sea is the one the config describes', () => {
    const stats = swellStats(swellLength, swellSpread, swellShoal, 0.9, surfDepth)

    expect(stats.length).toBe(swellLength)
    expect(stats.spread).toBe(swellSpread)
    expect(stats.period).toBeCloseTo(swellPeriod(swellLength), 9)
    expect(stats.speed).toBeCloseTo(swellLength / swellPeriod(swellLength), 9)
    expect(stats.deep).toBeCloseTo(1, 9)
    expect(stats.crest).toBeGreaterThan(stats.breaker)
    expect(stats.breaker).toBeGreaterThan(stats.deep)
  })
})
