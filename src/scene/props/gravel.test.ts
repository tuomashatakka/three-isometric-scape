import { describe, expect, it } from 'bun:test'
import { SCAPE_PALETTE } from '../config-palette.ts'
import { GRAVEL_FRAGMENT, GRAVEL_PARS_FRAGMENT, STONE_RADIUS, bareness, stone } from './gravel.ts'

const linear = (hex: number): [number, number, number] => {
  const c = (v: number): number => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return [ c((hex >> 16) & 255), c((hex >> 8) & 255), c(hex & 255) ]
}

const bare = (name: keyof typeof SCAPE_PALETTE.palette): number => bareness(...linear(SCAPE_PALETTE.palette[name]))

describe('gravel', () => {
  it('is a pure function of the cell', () => {
    expect(stone(12, -40)).toEqual(stone(12, -40))
    expect(stone(12, -40)).not.toEqual(stone(13, -40))
  })

  it('never lets a stone leave its cell, so one cell is the whole search', () => {
    for (let i = -60; i < 60; i += 1)
      for (let j = -60; j < 60; j += 1) {
        const { cx, cy, radius, squash } = stone(i, j)

        expect(radius).toBeGreaterThanOrEqual(STONE_RADIUS[0])
        expect(radius).toBeLessThanOrEqual(STONE_RADIUS[1])
        expect(squash).toBeGreaterThanOrEqual(1)
        // The long axis is the radius, in any turn: the circle bounds the stone.
        expect(cx - radius).toBeGreaterThanOrEqual(0)
        expect(cx + radius).toBeLessThanOrEqual(1)
        expect(cy - radius).toBeGreaterThanOrEqual(0)
        expect(cy + radius).toBeLessThanOrEqual(1)
      }
  })

  it('thins by density evenly: the draw is uniform across cells', () => {
    let held = 0
    const n  = 200

    for (let i = 0; i < n; i += 1)
      for (let j = 0; j < n; j += 1)
        held += stone(i, j).chance < 0.5 ? 1 : 0

    expect(held / (n * n)).toBeGreaterThan(0.45)
    expect(held / (n * n)).toBeLessThan(0.55)
  })

  it('lies in bare earth and on the strand, never in turf, snow, rock or dune', () => {
    for (const name of [ 'track', 'trodden', 'tilled', 'peat', 'shore', 'slob' ] as const)
      expect(bare(name)).toBeGreaterThan(0.3)

    for (const name of [ 'meadow', 'moss', 'pasture', 'snow', 'scree', 'dune', 'glacier' ] as const)
      expect(bare(name)).toBeLessThan(0.05)
  })

  it('is compiled into the terrain variant only', () => {
    for (const glsl of [ GRAVEL_PARS_FRAGMENT, GRAVEL_FRAGMENT ])
      expect(glsl.trim().startsWith('#ifdef USE_COLOR_ALPHA')).toBe(true)
  })
})
