import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { DECK_ALPHA, deckAlpha } from './clouds.ts'


describe('the cloud deck', () => {
  const source = readFileSync(new URL('clouds.ts', import.meta.url).pathname, 'utf8')

  test('draws the shadow\'s own field at the cloud\'s place, with no bake of its own', () => {
    expect(source).toContain('scapeCloudField(at)')
    expect(source).toContain('vDeckWorld.xz + uCloudThrow')
    expect(source).not.toContain('bakeAlphaField')
  })

  test('is clear between clouds, and gone with no cover or with the camera under it', () => {
    expect(deckAlpha(0, 1, 1)).toBe(0)
    expect(deckAlpha(1, 0, 1)).toBe(0)
    expect(deckAlpha(1, 1, 0)).toBe(0)
    expect(deckAlpha(1, 1, 1)).toBeCloseTo(DECK_ALPHA, 6)
  })

  test('a cloud\'s core hides more than its edge', () => {
    expect(deckAlpha(0.6, 0.5, 1)).toBeGreaterThan(deckAlpha(0.2, 0.5, 1))
  })
})
