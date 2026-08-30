import { describe, expect, test } from 'bun:test'
import { Color } from 'three'
import type { BufferAttribute, BufferGeometry } from 'three'
import { SCAPE_CONFIG } from '../config.ts'
import { beckFreeze, beckGeometry } from './beck.ts'
import type { BeckOptions } from './beck.ts'
import { createScapeLayout } from './layout.ts'
import type { Creek } from './creek.ts'


const BED   = new Color(SCAPE_CONFIG.palette.streambed)
const WATER = new Color(SCAPE_CONFIG.palette.deepWater)

/** The home island's own beck, traced by the same solver the scape uses. */
function homeCreek (): Creek {
  const creek = createScapeLayout(SCAPE_CONFIG).creek

  if (!creek)
    throw new Error('the authored seed is supposed to have a beck in it')

  return creek
}

/**
 * A hillside falling steadily along +z, so a level is readable off the geometry
 * without the terrain's own noise in the way.
 */
function slope (x: number, z: number): number {
  return 8 - z * 0.2 + Math.sin(x * 0.3) * 0.05
}

function options (over: Partial<BeckOptions> = {}): BeckOptions {
  return {
    creek:      homeCreek(),
    depth:      SCAPE_CONFIG.beck.depth,
    fill:       SCAPE_CONFIG.beck.fill,
    waterLevel: SCAPE_CONFIG.terrain.waterLevel,
    surfaceAt:  slope,
    bed:        BED,
    water:      WATER,
    ...over,
  }
}

function attribute (geometry: BufferGeometry, name: string): BufferAttribute {
  return geometry.getAttribute(name) as BufferAttribute
}

/** Every vertex's height, in build order. */
function levels (geometry: BufferGeometry): number[] {
  const position = attribute(geometry, 'position')

  return Array.from({ length: position.count }, (_unused, index) => position.getY(index))
}

describe('beckGeometry', () => {
  test('builds a sheet with the attributes the material reads', () => {
    const course = beckGeometry(options())

    expect(course).not.toBeNull()

    const { geometry } = course!

    for (const name of [ 'position', 'normal', 'color', 'aBeck' ])
      expect(attribute(geometry, name).count).toBeGreaterThan(0)

    // One position, one colour, one channel frame and one normal per vertex.
    const count = attribute(geometry, 'position').count
    expect(attribute(geometry, 'color').count).toBe(count)
    expect(attribute(geometry, 'aBeck').count).toBe(count)
    expect(attribute(geometry, 'normal').count).toBe(count)
    expect(geometry.getIndex()?.count).toBeGreaterThan(0)

    // Five edges to a cross-section, and every section complete.
    expect(count % 5).toBe(0)
  })

  test('is byte-for-byte the same beck twice', () => {
    const first  = beckGeometry(options())!
    const second = beckGeometry(options())!

    expect(Array.from(attribute(second.geometry, 'position').array))
      .toEqual(Array.from(attribute(first.geometry, 'position').array))
    expect(Array.from(attribute(second.geometry, 'color').array))
      .toEqual(Array.from(attribute(first.geometry, 'color').array))
    expect(second.wetted).toBe(first.wetted)
    expect(second.fall).toBe(first.fall)
  })

  // The claim the module is built on, stated as a fact about the data rather
  // than as a re-implementation of the running minimum that produces it.
  test('water never runs uphill', () => {
    const { geometry } = beckGeometry(options())!
    const heights      = levels(geometry)

    for (let index = 5; index < heights.length; index += 1)
      expect(heights[index]).toBeLessThanOrEqual(heights[index - 5] + 1e-6)
  })

  test('lies flat across the channel', () => {
    const heights = levels(beckGeometry(options())!.geometry)

    for (let section = 0; section < heights.length; section += 5)
      for (let step = 1; step < 5; step += 1)
        expect(heights[section + step]).toBe(heights[section])
  })

  // A sheet standing over the waterline where the sea has already drawn the
  // estuary is two surfaces at one level, which is a z-fight the whole width of
  // the mouth. Every cut but the last has to be above it; the last is the one
  // deliberately tucked under.
  test('stops at the tideline', () => {
    const heights = levels(beckGeometry(options())!.geometry)

    for (let section = 0; section + 5 < heights.length; section += 5)
      expect(heights[section]).toBeGreaterThan(SCAPE_CONFIG.terrain.waterLevel)

    expect(heights[heights.length - 1]).toBeLessThanOrEqual(SCAPE_CONFIG.terrain.waterLevel)
  })

  test('stands the sheet its depth above the bed it was given', () => {
    const shallow = beckGeometry(options({ depth: 0.1 }))!
    const deep    = beckGeometry(options({ depth: 0.5 }))!

    expect(levels(deep.geometry)[0] - levels(shallow.geometry)[0]).toBeCloseTo(0.4, 6)
  })

  // The channel widens threefold toward the mouth — `creek.halfWidthAt` — and
  // the water has to open out with it rather than running down the island at
  // one width.
  test('opens out with the channel it lies in', () => {
    const geometry = beckGeometry(options())!.geometry
    const across   = attribute(geometry, 'aBeck')
    const count    = across.count

    const spring = Math.abs(across.getX(4) - across.getX(0))
    const lower  = Math.abs(across.getX(count - 1) - across.getX(count - 5))

    expect(lower).toBeGreaterThan(spring * 1.5)
  })

  test('a wetted channel is narrower than the floor it lies on', () => {
    const creek  = homeCreek()
    const narrow = beckGeometry(options({ creek, fill: 0.5 }))!
    const brim   = beckGeometry(options({ creek, fill: 1 }))!

    const width = (course: BufferGeometry): number =>
      Math.abs(attribute(course, 'aBeck').getX(4) - attribute(course, 'aBeck').getX(0))

    expect(width(narrow.geometry)).toBeCloseTo(width(brim.geometry) * 0.5, 6)
    expect(width(brim.geometry) / 2).toBeCloseTo(creek.halfWidthAt(0), 1)
  })

  test('reports the reach it wet and the fall over it', () => {
    const course  = beckGeometry(options())!
    const heights = levels(course.geometry)

    expect(course.wetted).toBeGreaterThan(10)
    expect(course.fall).toBeCloseTo(heights[0] - heights[heights.length - 1], 6)
  })

  test('a dry bed is no geometry at all', () => {
    expect(beckGeometry(options({ depth: 0 }))).toBeNull()
    expect(beckGeometry(options({ fill: 0 }))).toBeNull()
  })

  // A course whose every cut is already under the sea is an estuary, not a
  // beck, and there is nothing for this module to draw over it.
  test('a drowned course is no geometry either', () => {
    expect(beckGeometry(options({ surfaceAt: () => -40 }))).toBeNull()
  })

  test('paints its outer edge the colour of the bed it lies on', () => {
    const color = attribute(beckGeometry(options())!.geometry, 'color')

    expect(color.getX(0)).toBeCloseTo(BED.r, 6)
    expect(color.getY(0)).toBeCloseTo(BED.g, 6)
    expect(color.getZ(0)).toBeCloseTo(BED.b, 6)

    // And the middle of the channel is water rather than gravel.
    expect(color.getX(2)).toBeLessThan(BED.r)
  })
})

describe('beckFreeze', () => {
  test('holds out well past the week the sea shuts', () => {
    expect(beckFreeze(0)).toBe(0)
    expect(beckFreeze(0.45)).toBe(0)
    expect(beckFreeze(0.6)).toBeGreaterThan(0)
    expect(beckFreeze(0.6)).toBeLessThan(0.5)
    expect(beckFreeze(1)).toBe(1)
  })

  test('never runs backwards', () => {
    let previous = -1

    for (let step = 0; step <= 20; step += 1) {
      const locked = beckFreeze(step / 20)
      expect(locked).toBeGreaterThanOrEqual(previous)
      previous = locked
    }
  })
})
