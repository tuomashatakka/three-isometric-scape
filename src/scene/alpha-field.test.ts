import { describe, expect, test } from 'bun:test'
import {
  LinearFilter,
  MirroredRepeatWrapping,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three'
import { bakeAlphaField } from './alpha-field.ts'


describe('bakeAlphaField', () => {
  test('produces the requested dimensions', () => {
    const tex = bakeAlphaField(128, () => {})
    const img = tex.image as { width: number, height: number }

    expect(img.width).toBe(128)
    expect(img.height).toBe(128)
  })

  test('fills a square RGBA field', () => {
    const tex = bakeAlphaField(16, () => {})
    const img = tex.image as { data: Uint8Array }

    expect(img.data).toBeInstanceOf(Uint8Array)
    expect(img.data.length).toBe(16 * 16 * 4)
  })

  test('defaults to mirrored-repeat wrapping', () => {
    const tex = bakeAlphaField(128, () => {})

    expect(tex.wrapS).toBe(MirroredRepeatWrapping)
    expect(tex.wrapT).toBe(MirroredRepeatWrapping)
  })

  test('honours an explicit wrap mode', () => {
    const tex = bakeAlphaField(128, () => {}, { wrap: RepeatWrapping })

    expect(tex.wrapS).toBe(RepeatWrapping)
    expect(tex.wrapT).toBe(RepeatWrapping)
  })

  test('sets linear filtering', () => {
    const tex = bakeAlphaField(128, () => {})

    expect(tex.magFilter).toBe(LinearFilter)
    expect(tex.minFilter).toBe(LinearFilter)
  })

  test('leaves colorSpace unset by default', () => {
    const tex = bakeAlphaField(128, () => {})

    expect(tex.colorSpace).toBeFalsy()
  })

  test('applies the requested colorSpace', () => {
    const tex = bakeAlphaField(128, () => {}, { colorSpace: SRGBColorSpace })

    expect(tex.colorSpace).toBe(SRGBColorSpace)
  })

  test('marks the texture ready for upload', () => {
    const tex = bakeAlphaField(128, () => {})

    expect(tex.version).toBeGreaterThan(0)
  })

  test('calls the sampler exactly once', () => {
    let calls = 0

    bakeAlphaField(10, field => {
      calls += 1

      expect(field.length).toBe(10 * 10 * 4)
    })

    expect(calls).toBe(1)
  })

  test('sampler receives a mutable Uint8Array', () => {
    const tex = bakeAlphaField(4, field => {
      field[0] = 42
    })
    const img = tex.image as { data: Uint8Array }

    expect(img.data[0]).toBe(42)
  })
})
