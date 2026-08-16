import { describe, expect, test } from 'bun:test'
import { cloudTileSize } from './clouds.ts'
import { SCAPE_CONFIG } from './config.ts'


describe('cloudTileSize', () => {
  test('keeps the authored cloud count in the widest archipelago frame', () => {
    const maximum = SCAPE_CONFIG.camera.maxViewSize
    const tile    = cloudTileSize(maximum)

    expect(tile / maximum).toBeCloseTo(0.809, 6)
    expect(tile).toBeGreaterThan(SCAPE_CONFIG.terrain.size)
  })

  test('scales with the frame instead of the home island', () => {
    const maximum = SCAPE_CONFIG.camera.maxViewSize

    expect(cloudTileSize(maximum * 2)).toBeCloseTo(cloudTileSize(maximum) * 2)
  })
})
