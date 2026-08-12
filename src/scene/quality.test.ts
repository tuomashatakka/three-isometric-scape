import { describe, expect, test } from 'bun:test'
import { selectAtmosphereQuality } from './quality.ts'
import type { QualitySignals } from './quality.ts'


const signals = (overrides: Partial<QualitySignals> = {}): QualitySignals => ({
  coarsePointer:       false,
  compactViewport:     false,
  pixelRatio:          1,
  hardwareConcurrency: 8,
  wideViewport:        false,
  ...overrides,
})

describe('selectAtmosphereQuality', () => {
  test('keeps a touch laptop on the desktop effects tier', () => {
    const quality = selectAtmosphereQuality(signals({ coarsePointer: true, pixelRatio: 2 }))

    expect(quality.tier).toBe('desktop')
    expect(quality.bloom).toBe(true)
    expect(quality.mistLayers).toBe(4)
  })

  test('reduces fullscreen effects on compact touch devices', () => {
    const quality = selectAtmosphereQuality(signals({
      coarsePointer:   true,
      compactViewport: true,
      pixelRatio:      2,
    }))

    expect(quality.tier).toBe('mobile')
    expect(quality.bloom).toBe(false)
    expect(quality.grain).toBe(false)
    expect(quality.tiltShiftPairs).toBe(1)
  })

  test('treats very dense displays as a mobile framebuffer budget', () => {
    const quality = selectAtmosphereQuality(signals({ pixelRatio: 3 }))

    expect(quality.tier).toBe('mobile')
    expect(quality.pixelRatioMax).toBe(1.25)
  })

  test('unlocks the ultra tier on a wide, many-core, mouse-driven machine', () => {
    const quality = selectAtmosphereQuality(signals({
      hardwareConcurrency: 16,
      wideViewport:        true,
      pixelRatio:          2,
    }))

    expect(quality.tier).toBe('ultra')
    expect(quality.ao).toBe(true)
    expect(quality.ssr).toBe(true)
    expect(quality.traa).toBe(true)
    expect(quality.terrainSegments).toBe(224)
  })

  test('withholds ultra from a wide viewport without the cores to drive it', () => {
    const quality = selectAtmosphereQuality(signals({ hardwareConcurrency: 4, wideViewport: true }))

    expect(quality.tier).toBe('desktop')
    expect(quality.ssr).toBe(false)
  })

  test('scales the dressing budget with the tier', () => {
    const mobile = selectAtmosphereQuality(signals({ coarsePointer: true, compactViewport: true }))
    const ultra  = selectAtmosphereQuality(signals({ hardwareConcurrency: 16, wideViewport: true }))

    expect(mobile.scatterScale).toBeLessThan(1)
    expect(ultra.scatterScale).toBeGreaterThan(1)
  })
})
