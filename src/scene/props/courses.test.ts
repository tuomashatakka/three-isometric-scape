import { describe, expect, test } from 'bun:test'
import { Color } from 'three'
import { COURSE_FRAGMENT, COURSE_GAUGE, courseAt, courseShare } from './courses.ts'
import { NORDIC_PALETTE } from './palette.ts'


type Name = keyof typeof NORDIC_PALETTE

/** The palette entry, as the linear albedo the shader sees. */
function linear (name: Name): [number, number, number] {
  const c = new Color(NORDIC_PALETTE[name])
  return [ c.r, c.g, c.b ]
}

/** A 40° roof's normal-up. */
const PITCHED = Math.cos(40 * Math.PI / 180)

describe('courses', () => {
  test('both shingles lay courses on a pitched roof', () => {
    for (const name of [ 'shingle', 'shingleWorn' ] as const)
      expect(courseShare(...linear(name), PITCHED)).toBeGreaterThan(0.8)
  })

  test('stone, timber, peat and turf do not', () => {
    for (const name of [ 'granite', 'graniteDark', 'graniteWarm', 'wood', 'tarWood', 'peat', 'peatDry', 'soil', 'moss', 'faluRed', 'trimWhite' ] as const)
      expect(courseShare(...linear(name), PITCHED)).toBeLessThan(0.05)
  })

  test('walls, flats and ridge caps are not roofing', () => {
    for (const up of [ 0, 0.2, 1 ])
      expect(courseShare(...linear('shingle'), up)).toBe(0)
  })

  test('a course is one gauge up the slope, and every point is in exactly one', () => {
    expect(courseAt(0).course).toBe(0)
    expect(courseAt(COURSE_GAUGE * 3.5).course).toBe(3)
    expect(courseAt(COURSE_GAUGE * 3.5).into).toBeCloseTo(0.5)
    expect(courseAt(-COURSE_GAUGE * 0.5).course).toBe(-1)
  })

  test('the terrain never evaluates it, and it costs no texture, uniform or varying', () => {
    expect(COURSE_FRAGMENT).toContain('#ifndef USE_COLOR_ALPHA')
    expect(COURSE_FRAGMENT).not.toContain('texture2D')
    expect(COURSE_FRAGMENT).not.toMatch(/uniform|varying/)
  })
})
