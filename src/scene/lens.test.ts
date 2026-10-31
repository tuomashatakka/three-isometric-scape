import { describe, expect, test } from 'bun:test'
import { vogelDisc } from './lens.ts'


describe('the lens defocus disc', () => {
  test('is deterministic, and every tap sits inside the aperture', () => {
    expect(vogelDisc(16)).toEqual(vogelDisc(16))
    for (const [ x, y ] of vogelDisc(24))
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(1)
  })

  test('is centred, so a uniform frame defocuses to itself without drifting', () => {
    for (const taps of [ 12, 16, 24 ]) {
      const disc = vogelDisc(taps)
      const mean = disc.reduce(([ ax, ay ], [ x, y ]) => [ ax + x / taps, ay + y / taps ], [ 0, 0 ])
      expect(Math.hypot(mean[0], mean[1])).toBeLessThan(0.08)
    }
  })

  test('covers the disc evenly: each half of the radius holds its share of the area', () => {
    const disc  = vogelDisc(24)
    const inner = disc.filter(([ x, y ]) => Math.hypot(x, y) < Math.SQRT1_2).length
    expect(inner).toBe(12)
  })
})
