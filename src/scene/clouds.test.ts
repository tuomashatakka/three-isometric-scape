import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { CLOUD_CUT, CLOUD_EDGE } from './cloud-shadow.ts'
import { BILLOW_NEAR, BILLOW_TILES, BILLOW_WIDE, DECK_ALPHA, DECK_EDGE, deckAlpha, deckBody, deckLift, topLight } from './clouds.ts'
import { SCAPE_CONFIG } from './config.ts'


describe('the cloud deck', () => {
  test('no hill cuts it: its depth stands clear of the far shore\'s highest rise', () => {
    const { atmosphere, farShore } = SCAPE_CONFIG
    expect(atmosphere.cloudHeight + deckLift(atmosphere.cloudHeight, farShore.rise)).toBeGreaterThan(farShore.rise)
    expect(deckLift(200, 100)).toBeGreaterThan(0)
    expect(readFileSync(new URL('./clouds.ts', import.meta.url), 'utf8')).toContain('projectionMatrix[2][3] == 0.0')
  })

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

  test('a top is heaped of billows at two scales, a cumulus cell and its turrets, read off a slope-carrying map', () => {
    expect(BILLOW_TILES[0]).toBeGreaterThan(BILLOW_TILES[1] * 2)
    expect(source).toContain('uBillowMap')
    expect(source).toContain('cell.gb')
    expect(source).toContain('turret.gb')
  })

  test('the deck has an edge: clear to body over a sixth of the shadow\'s soft edge', () => {
    expect(DECK_EDGE).toBeLessThan(CLOUD_EDGE)
    expect(deckBody(CLOUD_CUT - 0.01, 0, 0)).toBe(0)
    expect(deckBody(CLOUD_CUT + DECK_EDGE, 0, 0)).toBe(1)
  })

  test('the billows move the edge most in the wide frame, where the field under them is the smooth bank alone', () => {
    expect(BILLOW_WIDE).toBeGreaterThan(BILLOW_NEAR)

    const raw = CLOUD_CUT + DECK_EDGE / 2
    expect(deckBody(raw, -0.3, 0)).toBe(0)
    expect(deckBody(raw, 0.3, 0)).toBe(1)
    expect(deckBody(raw, -0.3, 1)).toBeGreaterThan(deckBody(raw, -0.3, 0))
  })

  test('billows with no lean leave the cover where the shadow\'s field put it', () => {
    for (const raw of [ 0.2, 0.5, 0.6, 0.9 ])
      expect(deckBody(raw, 0, 0.5) > 0.5).toBe(raw > CLOUD_CUT + DECK_EDGE / 2)
  })
})
