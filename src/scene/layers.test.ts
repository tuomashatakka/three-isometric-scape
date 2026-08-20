import { describe, expect, test } from 'bun:test'
import { LAYER } from './layers.ts'
import { LADDER, atmosphereQuality, unlockEffects } from './quality.ts'


/** The order the stack has to be painted in, cheapest reading upward. */
const ORDER = [
  'water',
  'seaSmoke',
  'beacon',
  'mist',
  'birds',
  'rain',
  'clouds',
  'aurora',
  'stars',
  'moon',
] as const

/** The widest each multi-sheet band can get, across every tier and the unlocked floor. */
function widest (pick: (quality: ReturnType<typeof atmosphereQuality>) => number): number {
  return Math.max(...LADDER.flatMap(tier => {
    const quality = atmosphereQuality(tier)

    return [ pick(quality), pick(unlockEffects(quality)) ]
  }))
}


describe('the transparent layer ladder', () => {
  test('is strictly ascending in the order the stack is painted', () => {
    const values = ORDER.map(name => LAYER[name])

    expect(values).toEqual([ ...values ].sort((a, b) => a - b))
    expect(new Set(values).size).toBe(values.length)
  })

  /**
   * The bug this file exists for.
   *
   * Three's transparent sort falls through `renderOrder` to a projected depth,
   * and the beams carry a hand-set bounding sphere centred out at the rim while
   * the water's is centred near the origin — so a tie is broken by whichever the
   * camera happens to be nearer, and a rotation flips it. Both the beams and the
   * sea smoke sat at three's default of 0, tied with the water they draw over.
   */
  test('nothing shares the sea floor, because a tie is decided by the camera', () => {
    for (const name of ORDER)
      if (name !== 'water')
        expect(LAYER[name]).toBeGreaterThan(LAYER.water)
  })

  test('the beams are over the water and under the fog', () => {
    expect(LAYER.beacon).toBeGreaterThan(LAYER.water)
    expect(LAYER.beacon).toBeLessThan(LAYER.mist)
  })

  /**
   * A band with several sheets indexes up from its own base, so a tier that
   * grants more of them must not walk into the band above. Checked against the
   * richest tier *and* `unlockEffects`, which lifts several counts to a floor.
   */
  test('no multi-sheet band can index into the one above it', () => {
    // The mist band is the tightest: sheets index from its base, then the
    // upright slices start again above those.
    const mist = widest(quality => quality.mistLayers)

    expect(LAYER.mist + mist * 2).toBeLessThan(LAYER.rain)
    expect(LAYER.seaSmoke + mist).toBeLessThan(LAYER.mist)
    expect(LAYER.clouds + 8).toBeLessThan(LAYER.aurora)
    expect(LAYER.aurora + widest(quality => quality.auroraLayers)).toBeLessThan(LAYER.stars)
  })

  test('every layer is a non-negative integer, as three compares them numerically', () => {
    for (const name of ORDER) {
      expect(Number.isInteger(LAYER[name])).toBe(true)
      expect(LAYER[name]).toBeGreaterThanOrEqual(0)
    }
  })
})
