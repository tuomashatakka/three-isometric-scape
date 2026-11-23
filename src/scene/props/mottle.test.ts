import { describe, expect, it } from 'bun:test'
import { SCAPE_PALETTE } from '../config-palette.ts'
import { MOTTLE_FINE, MOTTLE_PARS_FRAGMENT, mottleClass, mottleField, mottleFragment, mottleNoise } from './mottle.ts'


const linear = (hex: number): [number, number, number] => {
  const c = (v: number): number => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return [ c(hex >> 16 & 255), c(hex >> 8 & 255), c(hex & 255) ]
}

const kind = (name: keyof typeof SCAPE_PALETTE.palette): ReturnType<typeof mottleClass> =>
  mottleClass(...linear(SCAPE_PALETTE.palette[name]))

describe('mottle', () => {
  it('reads snow as snow, scree as stone and turf as turf', () => {
    expect(kind('snow').snow).toBeGreaterThan(0.9)
    expect(kind('glacier').snow).toBeGreaterThan(0.6)
    expect(kind('scree').stone).toBeGreaterThan(0.7)
    expect(kind('seaRock').stone).toBeGreaterThan(0.6)
    expect(kind('meadow').leaf).toBeGreaterThan(0.6)
    expect(kind('moss').leaf).toBeGreaterThan(0.6)
  })

  it('never treats a green as snow or a snowfield as turf', () => {
    for (const name of [ 'meadow', 'moss', 'pasture', 'crop' ] as const)
      expect(kind(name).snow).toBe(0)
    expect(kind('snow').leaf).toBe(0)
  })

  it('never hands out more than the whole colour', () => {
    for (const hex of Object.values(SCAPE_PALETTE.palette)) {
      const { snow, stone, leaf } = mottleClass(...linear(hex))
      for (const share of [ snow, stone, leaf ])
        expect(share).toBeGreaterThanOrEqual(0)
      expect(snow + stone + leaf).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('is a smooth field in -1..1, deterministic, with patches tens of metres across', () => {
    expect(mottleField(123.4, -56.7, true)).toBe(mottleField(123.4, -56.7, true))

    let low  = 0
    let high = 0
    let jump = 0
    for (let i = 0; i < 400; i += 1) {
      const x = i * 3.7 - 700
      const z = i * 1.3 + 40
      const v = mottleField(x, z, true)
      expect(Math.abs(v)).toBeLessThanOrEqual(1)
      if (v < -0.3)
        low += 1
      if (v > 0.3)
        high += 1
      // A metre apart is the same patch: no salt.
      jump = Math.max(jump, Math.abs(mottleField(x + 1, z, true) - v))
    }
    expect(low).toBeGreaterThan(20)
    expect(high).toBeGreaterThan(20)
    expect(jump).toBeLessThan(0.35)
  })

  it('is value noise that matches its lattice and stays in range', () => {
    for (let i = 0; i < 50; i += 1) {
      const n = mottleNoise(i * 0.37, i * -0.61)
      expect(n).toBeGreaterThanOrEqual(-1)
      expect(n).toBeLessThanOrEqual(1)
    }
    expect(MOTTLE_FINE).toBeGreaterThan(10)
  })

  it('costs the phone no texture fetch', () => {
    expect(mottleFragment(false)).not.toContain('texture')
    expect(mottleFragment(true)).not.toContain('texture')
    expect(MOTTLE_PARS_FRAGMENT).not.toContain('uniform')
    expect(mottleFragment(true).length).toBeGreaterThan(mottleFragment(false).length)
  })
})
