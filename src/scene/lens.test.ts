import { describe, expect, test } from 'bun:test'
import { HALATION_TAPS, HALATION_THRESHOLD, createLensPass, halationSource, sharpenHeadroom } from './lens.ts'


describe('the lens', () => {
  test('has no depth of field: nothing in the pass reads a focal map or opens a disc', () => {
    for (const halation of [ false, true ]) {
      const pass   = createLensPass({ halation, grain: true })
      const shader = (pass.material as { fragmentShader: string }).fragmentShader
      expect(shader).not.toContain('tDefocus')
      expect(shader).not.toContain('DISC')
      expect(Object.keys(pass.uniforms)).not.toContain('uBlur')
      pass.dispose()
    }
  })

  test('sharpens flat ground fully and a hard edge hardly at all', () => {
    expect(sharpenHeadroom(0.3, 0.32)).toBeGreaterThan(0.9)
    expect(sharpenHeadroom(0.02, 0.9)).toBeLessThan(0.2)
    expect(sharpenHeadroom(0, 0)).toBe(0)
  })

  test('never pushes harder as the cross gains contrast', () => {
    let last = Infinity
    for (let hi = 0.3; hi <= 0.95; hi += 0.05) {
      const room = sharpenHeadroom(0.3, hi)
      expect(room).toBeLessThanOrEqual(last + 1e-9)
      last = room
    }
  })
})

describe('halation', () => {
  test('nothing at or under paper white spills, so the frame is not hazed', () => {
    expect(halationSource(0)).toBe(0)
    expect(halationSource(HALATION_THRESHOLD)).toBe(0)
    expect(halationSource(0.4)).toBe(0)
  })

  test('the excess spills, rising with brightness and capped for a hot pixel', () => {
    expect(halationSource(HALATION_THRESHOLD + 1)).toBeCloseTo(1)
    expect(halationSource(3)).toBeGreaterThan(halationSource(2))
    expect(halationSource(1e6)).toBe(4)
  })

  test('the ring has taps to cover it', () => {
    expect(HALATION_TAPS).toBeGreaterThanOrEqual(8)
  })
})
