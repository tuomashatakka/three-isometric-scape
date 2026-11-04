import { describe, expect, test } from 'bun:test'
import { createSeamlessNoiseTexture } from 'threejs-scene/modules/assets'
import { SCAPE_CONFIG } from '../config.ts'
import { SLICK_CHOP, SLICK_GLASS, seaChop, seaChopGlsl, setSlick, slickCut } from './water-slick.ts'


/** The same field `catalogue.ts` bakes `water.wave` from, red channel, 0..1. */
function wave (seed = SCAPE_CONFIG.seed): number[] {
  const texture         = createSeamlessNoiseTexture({ size: 256, seed: seed ^ 0x51b7, frequency: 5, octaves: 4 })
  const data            = (texture.image as { data: Uint8Array }).data
  const field: number[] = []

  for (let i = 0; i < data.length; i += 4)
    field.push(data[i] / 255)

  return field
}

const mean = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length

/** The share of open sea the wind has up at this strength, over the real map. */
function roughShare (field: number[], strength: number): number {
  const cut = slickCut(strength)

  return mean(field.map(value => seaChop(value, 0, cut)))
}


describe('the wind on the water', () => {
  const field = wave()

  test('more wind is more rough water, and a gale takes nearly all of it', () => {
    let last = -1

    for (let strength = 0; strength <= 3; strength += 0.1) {
      const share = roughShare(field, strength)

      expect(share).toBeGreaterThanOrEqual(last)
      last = share
    }

    expect(roughShare(field, 3)).toBeGreaterThan(0.85)
  })

  /**
   * A still zeroes `wind.strength`, and a photograph of this coast in a calm
   * is still a sea with cat's paws on it — not a mirror, and not a plate.
   */
  test('a still is glassy water with rough patches on it, not either alone', () => {
    const share = roughShare(field, 0)

    expect(share).toBeGreaterThan(0.1)
    expect(share).toBeLessThan(0.5)
  })

  /**
   * The slicks replaced one roughness for the whole sea (0.62). At the
   * authored wind the mean of the surface they draw sits within a tenth of it,
   * so the sound's average sheen did not move — only where it lies.
   */
  test('the authored wind keeps the sea as rough on average as the knob it retired', () => {
    const share     = roughShare(field, SCAPE_CONFIG.wind.strength)
    const roughness = SLICK_GLASS + (SLICK_CHOP - SLICK_GLASS) * share

    expect(Math.abs(roughness - 0.62)).toBeLessThan(0.1)
  })

  test('a lee is calmer than the open sea at every wind', () => {
    for (const strength of [ 0, 0.9, 2 ]) {
      const cut = slickCut(strength)

      for (const value of [ 0.4, 0.55, 0.7, 0.85 ]) {
        expect(seaChop(value, 1, cut)).toBeLessThanOrEqual(seaChop(value, 0, cut))
        expect(seaChop(value, 1, cut)).toBeLessThan(0.2)
      }
    }
  })

  test('deterministic: the same seed draws the same field, and a still holds it', () => {
    expect(wave()).toEqual(field)

    const slick = { x: 0, y: 0 }

    setSlick(slick, 0, 0)
    expect(slick.x).toBe(0)
    expect(slick.y).toBe(slickCut(0))
  })

  test('the phone reads the field once and the full lake through both lattices', () => {
    expect(seaChopGlsl(false)).toContain('texture2D(uWaveMap, uv).r')
    expect(seaChopGlsl(true)).toContain('scapeUntiled(uWaveMap, uv)')
  })
})
