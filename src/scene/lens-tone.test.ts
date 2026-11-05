import { describe, expect, it } from 'bun:test'
import { LIGHT_TINT, SHADE_TINT, splitTone } from './lens'

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
