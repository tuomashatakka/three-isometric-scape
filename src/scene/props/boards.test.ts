import { describe, expect, test } from 'bun:test'
import { Color } from 'three'
import { BOARD_FRAGMENT, BOARD_WIDTH, boardShare, lapShare } from './boards.ts'
import { NORDIC_PALETTE } from './palette.ts'
import { RUN_WIDTH } from './runoff.ts'
import { weatherable } from './weathering.ts'

/** The palette entry, as the linear albedo the shader sees. */
function linear (name: keyof typeof NORDIC_PALETTE): [number, number, number] {
  const c = new Color(NORDIC_PALETTE[name])
  return [ c.r, c.g, c.b ]
}

describe('boards', () => {
  test('paint, limewash and timber are built of boards', () => {
    for (const name of [ 'faluRed', 'faluDark', 'faluWorn', 'trimWhite', 'wood', 'plank', 'woodLight' ] as const)
      expect(boardShare(...linear(name))).toBeGreaterThan(0.6)
  })

  test('stone, plants and the conifers are not', () => {
    for (const name of [ 'granite', 'graniteDark', 'shingle', 'grass', 'spruce', 'pine', 'moss' ] as const)
      expect(boardShare(...linear(name))).toBeLessThan(0.05)
  })

  test('a surface is boards or weathered stone, never both at full', () => {
    for (const name of Object.keys(NORDIC_PALETTE) as (keyof typeof NORDIC_PALETTE)[]) {
      const rgb = linear(name)
      expect(Math.min(boardShare(...rgb), weatherable(...rgb))).toBeLessThan(0.5)
    }
  })

  test('falu red stands in battens and limewash laps', () => {
    expect(lapShare(...linear('faluRed'))).toBe(0)
    expect(lapShare(...linear('trimWhite'))).toBe(1)
  })

  test('one rain run per board, and no texture, uniform or varying of its own', () => {
    expect(BOARD_WIDTH).toBe(RUN_WIDTH)
    expect(BOARD_FRAGMENT).not.toContain('texture2D')
    expect(BOARD_FRAGMENT).not.toMatch(/uniform|varying/)
  })
})
