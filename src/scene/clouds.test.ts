import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { DECK_ALPHA, deckAlpha, topLight } from './clouds.ts'


describe('the cloud deck', () => {
  const source = readFileSync(new URL('clouds.ts', import.meta.url).pathname, 'utf8')

  test('draws the shadow\'s own field at the cloud\'s place, with no bake of its own', () => {
    expect(source).toContain('scapeCloudRaw(at)')
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

  test('a cloud is dense: its core hides most of what is under it, and only the fringe is thin', () => {
    expect(deckAlpha(0.6, 1, 1)).toBeCloseTo(DECK_ALPHA, 6)
    expect(DECK_ALPHA).toBeGreaterThan(0.7)
    expect(deckAlpha(0.1, 1, 1)).toBeLessThan(DECK_ALPHA * 0.1)
  })

  test('a top has relief: lit where it faces the sun, never black in its lee', () => {
    expect(topLight(1)).toBe(1)
    expect(topLight(0)).toBeGreaterThan(0.25)
    expect(topLight(-1)).toBe(0)
    expect(topLight(0.5)).toBeGreaterThan(topLight(0))
  })

  test('the relief is read off the raw field, two reads a step apart, and no screen derivative', () => {
    expect(source).toContain('scapeCloudRaw(at + vec2(')
    expect(source).not.toMatch(/dFd[xy]\(/)
  })
})
