import { describe, expect, test } from 'bun:test'
import { Color } from 'three'
import { SCAPE_CONFIG } from '../config.ts'
import type { ScapeConfig } from '../config.ts'
import { dampBand, shadeAmount, shadeDirection } from './aspect.ts'
import type { Footpaths } from './footpath.ts'
import type { GroundNormal, HeightField } from './height.ts'
import { createScapeLayout } from './layout.ts'
import { createTerrainPainter } from './terrain.ts'


const DEGREES = Math.PI / 180

/** A unit normal leaning `lean` of the way over onto a compass bearing. */
function leaning (bearing: number, lean: number): GroundNormal {
  const radians = bearing * DEGREES

  return {
    x: Math.sin(radians) * lean,
    y: Math.sqrt(Math.max(0, 1 - lean * lean)),
    z: Math.cos(radians) * lean,
  }
}

describe('which way the ground is turned', () => {
  test('points away from the bearing the sun transits on', () => {
    const shade = shadeDirection(-106)

    expect(shade.x).toBeCloseTo(-Math.sin(-106 * DEGREES), 12)
    expect(shade.z).toBeCloseTo(-Math.cos(-106 * DEGREES), 12)
    expect(Math.hypot(shade.x, shade.z)).toBeCloseTo(1, 12)
  })

  test('follows the azimuth round rather than holding a fixed north', () => {
    // The claim the config makes: swing the sun and the shaded side of every
    // hill swings with it. A quarter turn of the sun is a quarter turn here.
    const noon    = shadeDirection(0)
    const quarter = shadeDirection(90)

    expect(noon.x * quarter.x + noon.z * quarter.z).toBeCloseTo(0, 12)
  })

  test('writes into a caller-owned record, so the frame loop allocates nothing', () => {
    const target = { x: 0, z: 0 }

    expect(shadeDirection(-106, target)).toBe(target)
    expect(target.x).toBeCloseTo(shadeDirection(-106).x, 12)
  })

  test('is 1 turned fully from the sun, -1 turned fully to it, 0 level', () => {
    const azimuth = SCAPE_CONFIG.daylight.azimuth
    const shade   = shadeDirection(azimuth)

    // A face lying right over onto the shaded bearing, and its opposite. `lean`
    // of 1 is a vertical face, which is as far as an aspect can go.
    expect(shadeAmount(leaning(azimuth + 180, 1), shade)).toBeCloseTo(1, 12)
    expect(shadeAmount(leaning(azimuth, 1), shade)).toBeCloseTo(-1, 12)
    expect(shadeAmount({ x: 0, y: 1, z: 0 }, shade)).toBeCloseTo(0, 12)
  })

  test('is gated by the slope, but over the grades this ground actually has', () => {
    const shade = shadeDirection(0)
    const away  = 180

    // Level ground has no aspect and must never be given one; a fifth of a
    // grade is what most of this island runs at, and it has to read. The
    // difference between the two is the whole reason the gate is shaped rather
    // than taken straight off the horizontal normal.
    expect(shadeAmount(leaning(away, 0), shade)).toBeCloseTo(0, 12)
    expect(shadeAmount(leaning(away, 0.01), shade)).toBeCloseTo(0, 12)
    expect(shadeAmount(leaning(away, 0.09), shade)).toBeGreaterThan(0.3)
    expect(shadeAmount(leaning(away, 0.2), shade)).toBeCloseTo(1, 6)

    expect(shadeAmount(leaning(away, 0.09), shade))
      .toBeLessThan(shadeAmount(leaning(away, 0.14), shade))
  })

  test('never leaves -1..1, at any lean', () => {
    const shade = shadeDirection(-106)

    for (let lean = 0; lean <= 1; lean += 0.05)
      for (const bearing of [ 0, 61, 143, 250, 311 ]) {
        const turned = shadeAmount(leaning(bearing, lean), shade)

        expect(turned).toBeGreaterThanOrEqual(-1)
        expect(turned).toBeLessThanOrEqual(1)
      }
  })

  test('is antisymmetric, so the two sides of a ridge cancel', () => {
    const shade = shadeDirection(41)

    for (const bearing of [ 0, 37, 90, 214, 359 ])
      expect(shadeAmount(leaning(bearing, 0.6), shade))
        .toBeCloseTo(-shadeAmount(leaning(bearing + 180, 0.6), shade), 12)
  })
})

describe('the band the damp holds in', () => {
  const line = SCAPE_CONFIG.terrain.aspectLine

  test('is nothing on the shore and nothing above the soil', () => {
    expect(dampBand(-1, line)).toBe(0)
    expect(dampBand(0, line)).toBe(0)
    expect(dampBand(line, line)).toBe(0)
    expect(dampBand(line * 3, line)).toBe(0)
  })

  test('is full through the ground that grows things', () => {
    expect(dampBand(1.5, line)).toBeCloseTo(1, 6)
    expect(dampBand(line * 0.6, line)).toBeCloseTo(1, 6)
  })

  test('never leaves 0..1, at any line a knob can be set to', () => {
    for (const knob of [ 0, 0.2, 1, 5, 40 ])
      for (let relative = -4; relative < 60; relative += 0.25) {
        const held = dampBand(relative, knob)

        expect(held).toBeGreaterThanOrEqual(0)
        expect(held).toBeLessThanOrEqual(1)
      }
  })
})

describe('the ground the aspect paints', () => {
  const layout           = createScapeLayout(SCAPE_CONFIG)
  const paths: Footpaths = { paths: [], wearAt: () => 0 }

  /**
   * A hillside whose bearing is ours to choose, at a fixed height and slope.
   *
   * The real field would answer with a different height and a different band on
   * every sample, and the claim under test is about the *aspect alone* — so the
   * only thing that varies between two calls here is which way the ground faces.
   */
  function hillside (bearing: number, lean = 0.7): HeightField {
    const normal = leaning(bearing, lean)

    return {
      heightAt: () => SCAPE_CONFIG.terrain.waterLevel + 2,
      slopeAt:  () => 0,

      normalAt: (_x, _z, target: GroundNormal) => {
        target.x = normal.x
        target.y = normal.y
        target.z = normal.z
        return target
      },
    }
  }

  function groundOn (bearing: number, config: ScapeConfig = SCAPE_CONFIG): Color {
    const painter = createTerrainPainter(config, layout, paths, hillside(bearing))

    // Far out on the water side of the island, clear of the yard, the track,
    // the plots and the paths — every one of which paints over the aspect on
    // purpose, and any of which would swamp the difference being measured.
    return painter.paint(config.terrain.waterLevel + 2, 0, 240, 240, new Color())
  }

  const azimuth = SCAPE_CONFIG.daylight.azimuth

  test('is greener on the face turned from the sun than on the one turned to it', () => {
    const shaded = groundOn(azimuth + 180)
    const sunned = groundOn(azimuth)

    // Green as a share of the whole, not in absolute terms: the moss is darker
    // as well as greener, and a raw `g` comparison would be measuring both.
    const share = (color: Color): number => color.g / (color.r + color.g + color.b)

    expect(share(shaded)).toBeGreaterThan(share(sunned))
    expect(shaded.g / shaded.r).toBeGreaterThan(sunned.g / sunned.r)
  })

  test('leaves the two sides of a ridge identical once the knobs are zero', () => {
    const flat: ScapeConfig = {
      ...SCAPE_CONFIG,
      terrain: { ...SCAPE_CONFIG.terrain, aspectMoss: 0, aspectBleach: 0 },
    }

    const shaded = groundOn(azimuth + 180, flat)
    const sunned = groundOn(azimuth, flat)

    expect(shaded.getHex()).toBe(sunned.getHex())
  })

  test('follows the azimuth, so the mossy side is not a hard-coded north', () => {
    const swung: ScapeConfig = {
      ...SCAPE_CONFIG,
      daylight: { ...SCAPE_CONFIG.daylight, azimuth: azimuth + 180 },
    }

    // The same hillside under a sun that has been moved to the other side of
    // it. What was the damp face is now the dry one.
    const before = groundOn(azimuth + 180)
    const after  = groundOn(azimuth + 180, swung)

    expect(after.g / after.r).toBeLessThan(before.g / before.r)
  })

  test('is the same colour twice for the same ground', () => {
    expect(groundOn(azimuth + 180).getHex()).toBe(groundOn(azimuth + 180).getHex())
  })
})
