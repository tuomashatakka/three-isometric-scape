import { describe, expect, test } from 'bun:test'
import { AIR_SPECTRUM, aerialHaze, aerialHazeRgb, hazeRange } from './aerial.ts'


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

  test('distance takes the blue first and keeps the brightness the grey haze had', () => {
    const [ r, g, b ] = aerialHazeRgb(500, 0, 0, range, 42)
    const grey        = aerialHaze(500, 0, 0, range, 42)

    expect(b).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(r)
    expect(Math.abs(0.2126 * r + 0.7152 * g + 0.0722 * b - grey)).toBeLessThan(0.01)
    expect(Math.abs(0.2126 * AIR_SPECTRUM[0] + 0.7152 * AIR_SPECTRUM[1] + 0.0722 * AIR_SPECTRUM[2] - 1)).toBeLessThan(0.01)
  })

  test('the focus stays clear in every channel', () => {
    expect(aerialHazeRgb(0, 0, 0, range, 42)).toEqual([ 0, 0, 0 ])
  })
})
