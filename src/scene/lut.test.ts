import { describe, expect, test } from 'bun:test'
import { createGradeLUTs } from './lut.ts'


describe('createGradeLUTs', () => {
  test('caches each baked grade and keeps recipes distinct', () => {
    const luts      = createGradeLUTs()
    const cinematic = luts.get('cinematic')
    const warm      = luts.get('warm')

    expect(luts.get('cinematic')).toBe(cinematic)
    expect(warm).not.toBe(cinematic)
    expect(cinematic.image.width).toBe(33)
    expect(cinematic.image.data).not.toBeNull()
    expect(cinematic.image.data?.length).toBe(33 ** 3 * 4)

    luts.dispose()
  })
})
