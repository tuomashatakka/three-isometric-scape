import { describe, expect, test } from 'bun:test'
import { atmosphereQuality, reduceAtmosphereQuality, selectAtmosphereQuality } from './quality.ts'
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
    expect(quality.shadows).toBe(false)
    expect(quality.tiltShiftPairs).toBe(0)
  })

  test('sends a very dense display to the capped mobile tier', () => {
    const quality = selectAtmosphereQuality(signals({ pixelRatio: 3 }))

    expect(quality.tier).toBe('mobile')
    expect(quality.pixelRatioMax).toBe(1)
  })

  test('paces the touch tier and lets the desktop tiers run free', () => {
    const mobile  = selectAtmosphereQuality(signals({ pixelRatio: 3 }))
    const desktop = selectAtmosphereQuality(signals())

    expect(mobile.frameRate).toBe(30)
    expect(desktop.frameRate).toBe(0)
  })

  test('drops the image-based fill below the desktop tier', () => {
    expect(atmosphereQuality('mobile').environment).toBe(false)
    expect(atmosphereQuality('desktop').environment).toBe(true)
  })

  test('never detects the minimal tier — it is only reachable by degrading', () => {
    const every = [
      selectAtmosphereQuality(signals({ pixelRatio: 3 })),
      selectAtmosphereQuality(signals()),
      selectAtmosphereQuality(signals({ hardwareConcurrency: 16, wideViewport: true })),
    ]

    for (const quality of every)
      expect(quality.tier).not.toBe('minimal')
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
    expect(quality.terrainSegments).toBe(288)
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

describe('reduceAtmosphereQuality', () => {
  test('walks one tier down the ladder', () => {
    expect(reduceAtmosphereQuality(atmosphereQuality('ultra'))?.tier).toBe('desktop')
    expect(reduceAtmosphereQuality(atmosphereQuality('desktop'))?.tier).toBe('mobile')
    expect(reduceAtmosphereQuality(atmosphereQuality('mobile'))?.tier).toBe('minimal')
  })

  test('bottoms out rather than looping on a device that keeps failing', () => {
    expect(reduceAtmosphereQuality(atmosphereQuality('minimal'))).toBeNull()
  })

  test('every step down is cheaper on the things that cost a phone its context', () => {
    let quality = atmosphereQuality('ultra')

    for (let step = 0; step < 3; step += 1) {
      const next = reduceAtmosphereQuality(quality)

      expect(next).not.toBeNull()
      expect(next!.terrainSegments).toBeLessThan(quality.terrainSegments)
      expect(next!.scatterScale).toBeLessThan(quality.scatterScale)
      expect(next!.shadowMapSize).toBeLessThanOrEqual(quality.shadowMapSize)
      expect(next!.detailTaps).toBeLessThanOrEqual(quality.detailTaps)
      quality = next!
    }
  })

  test('removes shadow maps from both phone tiers', () => {
    expect(atmosphereQuality('mobile').shadows).toBe(false)
    expect(atmosphereQuality('minimal').shadows).toBe(false)
    expect(atmosphereQuality('desktop').shadows).toBe(true)
  })

  test('keeps every floor-tier frame cost below mobile', () => {
    const mobile  = atmosphereQuality('mobile')
    const minimal = atmosphereQuality('minimal')

    expect(minimal.frameRate).toBeLessThan(mobile.frameRate)
    expect(minimal.terrainSegments).toBeLessThan(mobile.terrainSegments)
    expect(minimal.pixelRatioMax).toBeLessThan(mobile.pixelRatioMax)
  })

  test('keeps the optical chain off mobile and minimal', () => {
    expect(atmosphereQuality('mobile').post).toBe(false)
    expect(atmosphereQuality('minimal').post).toBe(false)
  })
})
