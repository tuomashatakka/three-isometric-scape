import { describe, expect, test } from 'bun:test'
import { Color } from 'three'
import { SCAPE_CONFIG } from './config.ts'
import { darkAmount, sunHeight } from './daylight.ts'
import { bakeField, moonlightAmount, starlightAmount } from './nightsky.ts'
import { atmosphereQuality } from './quality.ts'


const { latitude, axialTilt } = SCAPE_CONFIG.daylight
const STARLIGHT               = SCAPE_CONFIG.atmosphere.starlight

/** The sky's darkness at an hour of a week, through the arc the scape's sun is on. */
function sky (time: number, year: number): number {
  return darkAmount(sunHeight(time, year, latitude, axialTilt))
}

describe('starlightAmount', () => {
  test('comes out on an autumn midnight and on nothing about that day', () => {
    expect(starlightAmount(sky(0.02, 0.78), STARLIGHT)).toBeCloseTo(STARLIGHT, 5)
    expect(starlightAmount(sky(0.5, 0.78), STARLIGHT)).toBe(0)
  })

  test('never comes out at all on a midsummer night, because that night is never dark', () => {
    expect(starlightAmount(sky(0, 0.5), STARLIGHT)).toBe(0)
  })

  test('is the switch as well as the strength', () => {
    expect(starlightAmount(1, 0)).toBe(0)
    expect(starlightAmount(1, -2)).toBe(0)
  })
})

describe('moonlightAmount', () => {
  test('is up before the stars are, and out with them', () => {
    const dusk = 0.25

    expect(moonlightAmount(dusk, 0.5, 1)).toBeGreaterThan(starlightAmount(dusk, 1))
    expect(moonlightAmount(0, 0.5, 1)).toBe(0)
  })

  test('follows the month, and keeps an ashen sliver at the new', () => {
    expect(moonlightAmount(1, 0.5, 1)).toBeCloseTo(1, 6)
    expect(moonlightAmount(1, 0, 1)).toBeCloseTo(0.12, 6)
    expect(moonlightAmount(1, 0.25, 1)).toBeLessThan(moonlightAmount(1, 0.5, 1))
  })

  test('is the switch as well as the strength', () => {
    expect(moonlightAmount(1, 0.5, 0)).toBe(0)
  })
})

describe('bakeField', () => {
  const cool = new Color(SCAPE_CONFIG.palette.star)
  const warm = new Color(SCAPE_CONFIG.daylight.dusk)

  test('is byte-for-byte the same field for the same seed', () => {
    const first  = bakeField(300, 7_319, 1_144, cool, warm)
    const second = bakeField(300, 7_319, 1_144, cool, warm)

    expect(Array.from(first.position)).toEqual(Array.from(second.position))
    expect(Array.from(first.color)).toEqual(Array.from(second.color))
    expect(Array.from(first.size)).toEqual(Array.from(second.size))
  })

  test('is a different sky under a different seed', () => {
    const other = bakeField(300, 9_001, 1_144, cool, warm)
    const mine  = bakeField(300, 7_319, 1_144, cool, warm)

    expect(Array.from(other.position)).not.toEqual(Array.from(mine.position))
  })

  test('every star is on the deck, at its height, and inside its radius', () => {
    const radius = 1_144
    const field  = bakeField(800, 7_319, radius, cool, warm)

    for (let index = 0; index < 800; index += 1) {
      const x = field.position[index * 3]
      const y = field.position[index * 3 + 1]
      const z = field.position[index * 3 + 2]

      expect(y).toBe(0)
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(radius)
    }
  })

  test('carries a band, so the field is a sky and not a scatter', () => {
    const radius = 1_000
    const field  = bakeField(4_000, 7_319, radius, cool, warm)
    const near   = { x: 0, z: 0 }
    let inner    = 0

    for (let index = 0; index < 4_000; index += 1) {
      near.x = field.position[index * 3]
      near.z = field.position[index * 3 + 2]

      if (Math.hypot(near.x, near.z) < radius * 0.5)
        inner += 1
    }

    // A uniform disc puts a quarter of its stars inside half its radius. The
    // band runs through the middle, so a field that carries one puts more.
    expect(inner / 4_000).toBeGreaterThan(0.3)
  })

  test('fades to nothing before the rim, so the deck never draws its own edge', () => {
    const radius = 1_000
    const field  = bakeField(2_000, 7_319, radius, cool, warm)
    let brightestOutside = 0
    let outside          = 0

    for (let index = 0; index < 2_000; index += 1) {
      const reach = Math.hypot(field.position[index * 3], field.position[index * 3 + 2])

      if (reach > radius * 0.995) {
        outside         += 1
        brightestOutside = Math.max(brightestOutside, field.color[index * 3])
      }
    }

    expect(outside).toBeGreaterThan(0)
    expect(brightestOutside).toBeLessThan(0.02)
  })

  test('spends one vertex a star, whatever the tier asked for', () => {
    for (const count of [ 1, 64, 1_900 ]) {
      const field = bakeField(count, 7_319, 500, cool, warm)

      expect(field.position.length).toBe(count * 3)
      expect(field.size.length).toBe(count)
    }
  })
})

describe('the tiers', () => {
  test('every tier that gets an aurora gets a sky to hang it in', () => {
    for (const tier of [ 'mobile', 'desktop', 'ultra' ] as const) {
      const quality = atmosphereQuality(tier)

      expect(quality.auroraLayers).toBeGreaterThan(0)
      expect(quality.starCount).toBeGreaterThan(0)
    }
  })

  test('the fallback tier has no sky at all, rather than a poor one', () => {
    expect(atmosphereQuality('minimal').starCount).toBe(0)
  })
})
