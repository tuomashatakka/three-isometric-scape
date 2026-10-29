import { describe, expect, test } from 'bun:test'
import { aerialHaze, hazeRange } from './aerial.ts'


describe('aerial perspective', () => {
  const range = hazeRange(0.3)

  test('keeps the focus clear and hazes the far shore', () => {
    expect(aerialHaze(0, 0, 0, range, 42)).toBe(0)
    expect(aerialHaze(0, 20, 2, range, 42)).toBe(0)
    expect(aerialHaze(800, 0, 0, range, 42)).toBeGreaterThan(0.5)
  })

  test('is metre-sized: a close frame carries almost none', () => {
    expect(aerialHaze(25, 25, 0, range, 42)).toBeLessThan(0.02)
  })

  test('the far side of the focus is hazier than the near side', () => {
    expect(aerialHaze(400, 0, 0, range, 42)).toBeGreaterThan(aerialHaze(-400, 0, 0, range, 42))
  })

  test('summits stand out of the haze their feet are in', () => {
    expect(aerialHaze(800, 0, 100, range, 42)).toBeLessThan(aerialHaze(800, 0, 0, range, 42) / 3)
  })

  test('thickens with density and clamps the breath', () => {
    expect(hazeRange(0.8).far).toBeLessThan(range.far)
    expect(hazeRange(1, 2)).toEqual(hazeRange(0.94))
  })
})
