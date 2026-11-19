import { describe, expect, it } from 'bun:test'
import { SCAPE_PALETTE } from '../config-palette.ts'
import {
  LEAF_KEY, STRAND_GAP, STRAND_HALF, STRAND_MEAN, STRAND_REPEATS, STRAND_ROOT, STRAND_WIDTH, SWARD_FRAGMENT,
  SWARD_PARS_FRAGMENT, TUFT_CELL, TUFT_RADIUS, TUFT_REPEATS, leafiness, swardHash, tuft,
} from './sward.ts'


const linear = (hex: number): [number, number, number] => {
  const c = (v: number): number => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return [ c(hex >> 16 & 255), c(hex >> 8 & 255), c(hex & 255) ]
}

const leaf = (name: keyof typeof SCAPE_PALETTE.palette): number => leafiness(...linear(SCAPE_PALETTE.palette[name]))

describe('sward', () => {
  it('is a pure function of the cell', () => {
    expect(tuft(4, -9)).toEqual(tuft(4, -9))
    expect(tuft(4, -9)).not.toEqual(tuft(5, -9))
    expect(swardHash(3, 7)).toBe(swardHash(3, 7))
  })

  it('never lets a tuft leave its cell, so one cell is the whole search', () => {
    for (let i = -50; i < 50; i += 1)
      for (let j = -50; j < 50; j += 1) {
        const { cx, cy } = tuft(i, j)

        expect(cx - TUFT_RADIUS).toBeGreaterThanOrEqual(0)
        expect(cx + TUFT_RADIUS).toBeLessThanOrEqual(1)
        expect(cy - TUFT_RADIUS).toBeGreaterThanOrEqual(0)
        expect(cy + TUFT_RADIUS).toBeLessThanOrEqual(1)
      }
  })

  it('keeps a strand inside its column, with a gap beside it', () => {
    expect(STRAND_HALF[0]).toBeGreaterThan(0)
    expect(STRAND_HALF[1]).toBeLessThanOrEqual(0.5)
  })

  it('takes the greens and leaves the track, the peat, the stone and the snow', () => {
    for (const name of [ 'meadow', 'pasture', 'moss', 'dryGrass', 'crop' ] as const)
      expect(leaf(name)).toBeGreaterThan(0.95)
    for (const name of [ 'track', 'trodden', 'tilled', 'peat', 'scree', 'seaRock', 'snow', 'shore', 'glacier' ] as const)
      expect(leaf(name)).toBe(0)
  })

  it('comes in over the turf the terrain actually carries, not only the raw palette', () => {
    // Measured on the home island's turf after the season and the heath: 0.25–0.45.
    expect(LEAF_KEY[0]).toBeLessThan(0.25)
    expect(LEAF_KEY[1]).toBeLessThanOrEqual(0.45)
  })

  it('fades to the mean it would average to, so the field does not step with the zoom', () => {
    expect(STRAND_MEAN).toBeGreaterThan(1 - STRAND_GAP - STRAND_ROOT)
    expect(STRAND_MEAN).toBeLessThan(1)
    expect(SWARD_FRAGMENT).toContain(STRAND_MEAN.toFixed(4).replace(/0+$/, ''))
  })

  it('lets each scale go before it goes under a couple of pixels on a 1600-px frame', () => {
    const metresAtGone = (cell: number, repeats: readonly [number, number]): number => cell * repeats[1]
    expect(metresAtGone(STRAND_WIDTH, STRAND_REPEATS) / STRAND_WIDTH).toBeLessThanOrEqual(1600 / 2)
    expect(metresAtGone(TUFT_CELL, TUFT_REPEATS) / TUFT_CELL).toBeLessThanOrEqual(1600 / 4)
  })

  it('is the terrain variant only, and reads the drift compass rather than a new uniform', () => {
    expect(SWARD_FRAGMENT).toContain('#ifdef USE_COLOR_ALPHA')
    expect(SWARD_PARS_FRAGMENT).toContain('uniform vec2 uDriftDir')
    expect(SWARD_FRAGMENT).not.toContain('texture2D')
  })
})
