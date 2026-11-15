import { describe, expect, it } from 'bun:test'
import { HUMMOCK_FRAGMENT, HUMMOCK_HEIGHT, HUMMOCK_PARS_FRAGMENT, HUMMOCK_SPAN, hummock } from './hummock.ts'


describe('hummock', () => {
  it('is a pure function of where it stands', () => {
    expect(hummock(12.5, -40.25)).toEqual(hummock(12.5, -40.25))
  })

  it('stays within a hand of the mesh and averages out to it', () => {
    let sum = 0
    let max = 0
    const n = 120

    for (let i = 0; i < n; i += 1)
      for (let j = 0; j < n; j += 1) {
        const [ h ] = hummock(i * 0.37 - 20, j * 0.41 + 300)
        sum += h
        max  = Math.max(max, Math.abs(h))
      }

    expect(max).toBeLessThanOrEqual(HUMMOCK_HEIGHT * 2.1)
    expect(Math.abs(sum / (n * n))).toBeLessThan(HUMMOCK_HEIGHT * 0.2)
  })

  it('carries the slope of its own height, so light and shade agree', () => {
    const e = 1e-4

    for (const [ x, z ] of [[ 1.3, 2.7 ], [ -55.1, 18.9 ], [ 410.2, -233.6 ]]) {
      const [ , gx, gz ] = hummock(x, z)
      const dx           = (hummock(x + e, z)[0] - hummock(x - e, z)[0]) / (2 * e)
      const dz           = (hummock(x, z + e)[0] - hummock(x, z - e)[0]) / (2 * e)

      expect(gx).toBeCloseTo(dx, 3)
      expect(gz).toBeCloseTo(dz, 3)
    }
  })

  it('is a tussock, not a cliff: no slope past 45°', () => {
    for (let i = 0; i < 4000; i += 1) {
      const [ , gx, gz ] = hummock(i * 0.173, i * 0.311 - 90)

      expect(Math.hypot(gx, gz)).toBeLessThan(1)
    }
  })

  it('is varied at its own span, not flat over it', () => {
    const a = hummock(0, 0)[0]
    const b = hummock(HUMMOCK_SPAN * 0.5, HUMMOCK_SPAN * 0.5)[0]
    const c = hummock(HUMMOCK_SPAN * 3.3, -HUMMOCK_SPAN * 1.7)[0]

    expect(new Set([ a, b, c ].map(v => v.toFixed(3))).size).toBe(3)
  })

  it('only compiles into the terrain variant', () => {
    for (const glsl of [ HUMMOCK_PARS_FRAGMENT, HUMMOCK_FRAGMENT ]) {
      expect(glsl.trim().startsWith('#ifdef USE_COLOR_ALPHA')).toBe(true)
      expect(glsl.trim().endsWith('#endif')).toBe(true)
    }
  })
})
