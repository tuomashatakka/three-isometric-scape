import { describe, expect, it } from 'bun:test'
import { FILM_SHOULDER, LIGHT_TINT, SHADE_TINT, SHOULDER_PULL, shoulder, splitTone } from './lens'


const channels = [ 0, 1, 2 ] as const

describe('the split tone', () => {
  it('leaves the mid-tones and a zero strength alone', () => {
    for (const channel of channels) {
      expect(splitTone(0.3, channel, 1)).toBe(1)
      expect(splitTone(0.01, channel, 0)).toBe(1)
    }
  })

  it('cools the shade and warms the light', () => {
    expect(splitTone(0, 2, 1)).toBeGreaterThan(splitTone(0, 0, 1))
    expect(splitTone(2, 0, 1)).toBeGreaterThan(splitTone(2, 2, 1))
  })

  it('does not change how bright either end is', () => {
    const luma = (tint: readonly number[]) => 0.2126 * tint[0] + 0.7152 * tint[1] + 0.0722 * tint[2]
    expect(luma(SHADE_TINT)).toBeCloseTo(1, 1)
    expect(luma(LIGHT_TINT)).toBeCloseTo(1, 1)
  })
})

describe('the film shoulder', () => {
  it('leaves everything under paper white alone, and a zero grade', () => {
    expect(shoulder(0.5, 1)).toBe(0)
    expect(shoulder(FILM_SHOULDER[0], 1)).toBe(0)
    expect(shoulder(3, 0)).toBe(0)
  })

  it('takes more colour the brighter the highlight, never all of it', () => {
    let last = 0
    for (let l = 0.7; l <= 3; l += 0.1) {
      const pull = shoulder(l, 1)
      expect(pull).toBeGreaterThanOrEqual(last)
      last = pull
    }
    expect(last).toBeCloseTo(SHOULDER_PULL, 6)
    expect(last).toBeLessThan(1)
  })
})
