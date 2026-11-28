import { describe, expect, test } from 'bun:test'
import { Color } from 'three'
import { NORDIC_PALETTE } from './palette.ts'
import { ROSETTE_CELL, ROSETTE_MARGIN, ROSETTE_RADIUS, ROSETTE_SHARE, rosetteAt, rosetteHashes, weatherable, weatheringFragment } from './weathering.ts'

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

  test('the olive sward is turf, not stone: the terrain meadow keeps its green', () => {
    // The two bins three quarters of the terrain's vertices fell in, as sqrt of
    // linear rgb — both read as stone by chroma alone, and took lichen and strata.
    for (const [ r, g, b ] of [[ 0.3, 0.32, 0.25 ], [ 0.31, 0.35, 0.26 ], [ 0.3, 0.33, 0.26 ]])
      expect(weatherable(r * r, g * g, b * b)).toBeLessThan(0.05)
  })

  test('the glsl twin is deterministic and reads the map it is given', () => {
    expect(weatheringFragment('uDetailMap')).toBe(weatheringFragment('uDetailMap'))
    expect(weatheringFragment('uWearMap')).toContain('texture2D(uWearMap')
  })

  test('lichen is rosettes, not a web: discs that never reach their cell edge, at their share', () => {
    let lit = 0
    let n   = 0
    // A rosette never touches its cell's edge, so no disc is cut and none joins its neighbour.
    for (let i = 0; i < 400; i++)
      for (let j = 0; j < 400; j++) {
        const u = (i + 0.5) * 0.02
        const v = (j + 0.5) * 0.02
        const a = rosetteAt(u, v)
        lit += a
        n   += 1

        const fu = u / ROSETTE_CELL - Math.floor(u / ROSETTE_CELL)
        const fv = v / ROSETTE_CELL - Math.floor(v / ROSETTE_CELL)
        if (Math.min(fu, fv, 1 - fu, 1 - fv) < ROSETTE_MARGIN - 1e-6)
          expect(a).toBe(0)
      }

    const mean = ROSETTE_SHARE * Math.PI * ((ROSETTE_RADIUS[0] + ROSETTE_RADIUS[1]) / 2) ** 2
    expect(lit / n).toBeGreaterThan(mean * 0.6)
    expect(lit / n).toBeLessThan(mean * 1.6)
  })

  test('the rosette hashes are deterministic and in 0..1', () => {
    for (let i = -50; i < 50; i++) {
      const h = rosetteHashes(i, i * 3 - 7)
      expect(rosetteHashes(i, i * 3 - 7)).toEqual(h)
      for (const v of h) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThan(1)
      }
    }
  })

  test('no growth thresholds the grit: moss and lichen read their own fields', () => {
    const glsl = weatheringFragment('uDetailMap')
    expect(glsl).toContain('scapeMottleNoise(mp)')
    expect(glsl).not.toMatch(/smoothstep\(0\.42, 0\.36/)
  })
})
