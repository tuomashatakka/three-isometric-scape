import { describe, expect, test } from 'bun:test'
import { Color } from 'three'
import { NORDIC_PALETTE } from './palette.ts'
import { weatherable, weatheringFragment } from './weathering.ts'

/** The palette entry, as the linear albedo the shader sees. */
function weathers (name: keyof typeof NORDIC_PALETTE): number {
  const c = new Color(NORDIC_PALETTE[name])
  return weatherable(c.r, c.g, c.b)
}

describe('weathering', () => {
  test('stone, slate and old wood take moss and lichen', () => {
    for (const name of [ 'granite', 'graniteDark', 'graniteWarm', 'shingle', 'shingleWorn', 'deadWood', 'driftwood' ] as const)
      expect(weathers(name)).toBeGreaterThan(0.6)
  })

  test('paint, plants, sand, straw, soil and whitewash keep their colour', () => {
    for (const name of [ 'faluRed', 'trimWhite', 'birchBark', 'grass', 'spruce', 'sand', 'hay', 'soil', 'rye' ] as const)
      expect(weathers(name)).toBeLessThan(0.05)
  })

  test('the glsl twin is deterministic and reads the map it is given', () => {
    expect(weatheringFragment('uDetailMap')).toBe(weatheringFragment('uDetailMap'))
    expect(weatheringFragment('uWearMap')).toContain('texture2D(uWearMap')
  })
})
