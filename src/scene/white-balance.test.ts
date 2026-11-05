import { describe, expect, it } from 'bun:test'
import { Color } from 'three'
import { SCAPE_CONFIG } from './config.ts'
import { createDaylight } from './daylight.ts'
import { ADAPT_DAY, adaptation, airlight, cardIlluminant, luminance, whiteBalance } from './white-balance.ts'

const MIDSUMMER = 0.5
const cast      = (c: Color): number => c.r / c.b

function card (time: number, year: number, balanced: boolean): Color {
  const config   = structuredClone(SCAPE_CONFIG)
  const daylight = createDaylight(() => config)
  const sky      = daylight.sample(time, year)
  const undo     = balanced ? new Color(1, 1, 1) : new Color(1 / sky.balance.r, 1 / sky.balance.g, 1 / sky.balance.b)
  const sun      = sky.sun.clone().multiply(undo)
  const hemi     = sky.hemiSky.clone().multiply(undo)

  return cardIlluminant(sun, sky.sunStrength, sky.direction.y, hemi, sky.hemiStrength)
}

describe('white balance', () => {
  it('prints a white card at a summer noon nearer neutral than the light it lies in', () => {
    const raw  = card(0.5, MIDSUMMER, false)
    const kept = card(0.5, MIDSUMMER, true)

    expect(Math.abs(cast(kept) - 1)).toBeLessThan(Math.abs(cast(raw) - 1) * (1 - ADAPT_DAY) * 1.5)
  })

  it('moves the hue of the frame and never its exposure', () => {
    for (const [ time, year ] of [ [ 0.5, MIDSUMMER ], [ 0.85, MIDSUMMER ], [ 0.02, 0.78 ], [ 0.5, 0.02 ] ])
      expect(luminance(card(time, year, true))).toBeCloseTo(luminance(card(time, year, false)), 6)
  })

  it('leaves an evening warm and a night cold', () => {
    expect(cast(card(0.85, MIDSUMMER, true))).toBeGreaterThan(1.15)
    expect(cast(card(0.02, 0.78, true))).toBeLessThan(0.9)
  })

  it('is the identity on a neutral light, and on darkness', () => {
    const grey = whiteBalance(new Color(0.4, 0.4, 0.4), 1)
    const none = whiteBalance(new Color(0, 0, 0), 1)

    for (const gain of [ grey, none ]) {
      expect(gain.r).toBeCloseTo(1, 9)
      expect(gain.g).toBeCloseTo(1, 9)
      expect(gain.b).toBeCloseTo(1, 9)
    }
  })

  it('adapts less at night and at a golden sun than at full day', () => {
    expect(adaptation(1, 0)).toBeCloseTo(ADAPT_DAY, 12)
    expect(adaptation(0, 0)).toBeLessThan(adaptation(1, 0))
    expect(adaptation(1, 1)).toBeLessThan(adaptation(1, 0))
  })

  it('reddens the sun as it sinks, through the same air the haze is', () => {
    const high = airlight(0.8)
    const low  = airlight(0.08)

    expect(high.r).toBe(1)
    expect(high.b).toBeGreaterThan(0.6)
    expect(low.b).toBeLessThan(high.b * 0.25)
    expect(low.g).toBeLessThan(high.g)
  })

  it('is deterministic', () => {
    expect(card(0.37, 0.61, true).getHex()).toBe(card(0.37, 0.61, true).getHex())
  })
})
