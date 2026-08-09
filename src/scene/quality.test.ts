import { describe, expect, test } from 'bun:test'
import { selectAtmosphereQuality } from './quality.ts'


describe('selectAtmosphereQuality', () => {
  test('keeps a touch laptop on the desktop effects tier', () => {
    const quality = selectAtmosphereQuality({
      coarsePointer:   true,
      compactViewport: false,
      pixelRatio:      2,
    })

    expect(quality.tier).toBe('desktop')
    expect(quality.bloom).toBe(true)
    expect(quality.mistLayers).toBe(4)
  })

  test('reduces fullscreen effects on compact touch devices', () => {
    const quality = selectAtmosphereQuality({
      coarsePointer:   true,
      compactViewport: true,
      pixelRatio:      2,
    })

    expect(quality.tier).toBe('mobile')
    expect(quality.bloom).toBe(false)
    expect(quality.grain).toBe(false)
    expect(quality.tiltShiftPairs).toBe(1)
  })

  test('treats very dense displays as a mobile framebuffer budget', () => {
    const quality = selectAtmosphereQuality({
      coarsePointer:   false,
      compactViewport: false,
      pixelRatio:      3,
    })

    expect(quality.tier).toBe('mobile')
    expect(quality.pixelRatioMax).toBe(1.25)
  })
})
