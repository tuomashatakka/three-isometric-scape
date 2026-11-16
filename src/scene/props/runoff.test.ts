import { describe, expect, test } from 'bun:test'
import { LEE_DAMP, RUN_WIDTH, leafShare, runHash, wallWet, wetFragment } from './runoff.ts'


describe('runoff', () => {
  test('a level field takes no wall wetness; the lie carries it', () => {
    expect(wallWet(1, -1, 0.1, 1)).toBe(0)
  })

  test('the weather face of a wall is wetter than its lee', () => {
    const across = [ ...Array(200).keys() ].map(index => index * RUN_WIDTH * 0.37)
    const mean   = (lee: number): number => across.reduce((sum, x) => sum + wallWet(0, lee, x, 1.3), 0) / across.length

    expect(mean(-1)).toBeGreaterThan(mean(1) * 2)
    expect(mean(1)).toBeGreaterThan(0)
    expect(mean(1)).toBeLessThanOrEqual(LEE_DAMP + 1e-9)
  })

  test('the runs streak the face: some columns run with water and some do not', () => {
    const runs = [ ...Array(400).keys() ].map(index => runHash(index))
    const wet  = runs.filter(hash => hash < 0.55).length / runs.length

    expect(wet).toBeGreaterThan(0.4)
    expect(wet).toBeLessThan(0.7)

    const lane = [ ...Array(60).keys() ].map(index => wallWet(0, -1, index * RUN_WIDTH * 0.25, 1))

    expect(Math.max(...lane) - Math.min(...lane)).toBeGreaterThan(0.3)
  })

  test('grass is a plant and slate and sand are not', () => {
    expect(leafShare(0x5d / 255, 0x6b / 255, 0x3c / 255)).toBeGreaterThan(0.5)
    expect(leafShare(0.35, 0.36, 0.38)).toBe(0)
    expect(leafShare(0.7, 0.62, 0.45)).toBe(0)
  })

  test('only a material with faces runs water down its walls', () => {
    expect(wetFragment('0.55', false)).not.toContain('vScapeFace')
    expect(wetFragment('1.0', true)).toContain('vScapeFace.z')
  })
})
