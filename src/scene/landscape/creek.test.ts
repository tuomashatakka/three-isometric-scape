import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { createHeightField } from './height.ts'
import { createScapeLayout } from './layout.ts'
import { createPathQuery, pathLength, smoothPolyline } from './path.ts'


const WATER = SCAPE_CONFIG.terrain.waterLevel
const HALF  = SCAPE_CONFIG.terrain.size * 0.5

describe('the beck', () => {
  const layout = createScapeLayout(SCAPE_CONFIG)
  const field  = createHeightField(SCAPE_CONFIG, layout)
  const creek  = layout.creek

  test('the authored scape has one', () => {
    expect(creek).not.toBeNull()
  })

  test('it springs on dry ground and ends in open sea', () => {
    const head  = Math.hypot(creek!.head.x, creek!.head.z)
    const mouth = Math.hypot(creek!.mouth.x, creek!.mouth.z)

    expect(field.heightAt(creek!.head.x, creek!.head.z)).toBeGreaterThan(WATER)
    expect(mouth / HALF).toBeGreaterThan(SCAPE_CONFIG.terrain.islandOuter)
    expect(head).toBeLessThan(mouth)
  })

  test('its bed only ever descends, for as long as it is still a channel', () => {
    // The failure this exists to catch: a steepest-descent walk that escapes a
    // hollow by climbing out of it carries the climb into the carved profile,
    // and the scape gets a stream running uphill.
    //
    // Only down to the tide floor, though. Below that the beck has become sea,
    // and the seabed out there answers to the archipelago — an islet skirt lying
    // across the mouth is a bar, which is a thing river mouths actually have.
    let previous = Infinity
    let checked  = 0

    for (const point of creek!.points) {
      const level = field.heightAt(point.x, point.z)

      if (level < creek!.tideFloor)
        break

      expect(level).toBeLessThanOrEqual(previous + 1e-9)
      previous = level
      checked += 1
    }

    expect(checked).toBeGreaterThan(3)
  })

  test('the lower reach is under water and the upper reach is not', () => {
    const levels = creek!.points.map(point => field.heightAt(point.x, point.z))

    expect(levels.filter(level => level > WATER).length).toBeGreaterThan(1)
    expect(levels.filter(level => level < WATER).length).toBeGreaterThan(2)
  })

  test('the mouth is broader than the spring', () => {
    expect(creek!.halfWidthAt(1)).toBeGreaterThan(creek!.halfWidthAt(0) * 1.5)
  })

  test('the claim is full on the centreline and gone well off it', () => {
    const points = creek!.points
    const middle = points[Math.floor(points.length / 2)]

    /** Distance from a point to the nearest point of the course, whichever bend it is on. */
    const toCourse = (x: number, z: number): number =>
      Math.min(...points.map(point => Math.hypot(point.x - x, point.z - z)))

    expect(creek!.claimAt(middle.x, middle.z)).toBeGreaterThan(0.9)

    // Stepped out on a ray and stopped at the first point that is genuinely
    // clear of the *whole* course, rather than at a fixed multiple of the
    // channel width. A beck that meanders is a beck that comes back: on this
    // island the course doubles within twenty metres of its own midpoint, so a
    // fixed sideways step lands in another bend and reads — correctly — as
    // channel. The claim is a fact about distance to the water, and that is what
    // this asks about.
    const clear = creek!.halfWidthAt(1) * 4

    for (const [ dx, dz ] of [[ 1, 0 ], [ -1, 0 ], [ 0, 1 ], [ 0, -1 ]]) {
      let step = clear

      while (step < HALF && toCourse(middle.x + dx * step, middle.z + dz * step) < clear)
        step += clear

      if (step >= HALF)
        continue

      expect(creek!.claimAt(middle.x + dx * step, middle.z + dz * step)).toBe(0)
    }
  })

  test('the course runs 0 at the spring and 1 at the mouth', () => {
    expect(creek!.sampleAt(creek!.head.x, creek!.head.z).course).toBeCloseTo(0, 2)
    expect(creek!.sampleAt(creek!.mouth.x, creek!.mouth.z).course).toBeCloseTo(1, 2)
  })

  test('it keeps out of the farmyard, the fields and the walled meadow', () => {
    for (const point of creek!.points) {
      expect(Math.hypot(point.x - layout.yard.x, point.z - layout.yard.z))
        .toBeGreaterThan(layout.yard.radius)

      for (const plot of layout.plots)
        expect(Math.hypot(point.x - plot.x, point.z - plot.z))
          .toBeGreaterThan(Math.max(plot.halfW, plot.halfD))

      if (layout.pasture)
        expect(Math.hypot(point.x - layout.pasture.x, point.z - layout.pasture.z))
          .toBeGreaterThan(layout.pasture.radius)
    }
  })

  test('the carve only ever lowers the ground', () => {
    // The blend toward the bed is symmetric, so past the mouth — where the
    // seabed is already lower than any floor the channel would ask for — it
    // would build a causeway out into the sea if it were not clamped.
    const plain = createHeightField(SCAPE_CONFIG, { ...layout, creek: null })

    for (let ix = 0; ix <= 40; ix += 1)
      for (let iz = 0; iz <= 40; iz += 1) {
        const x = -HALF + ix / 40 * HALF * 2
        const z = -HALF + iz / 40 * HALF * 2

        expect(field.heightAt(x, z)).toBeLessThanOrEqual(plain.heightAt(x, z) + 1e-9)
      }
  })

  test('the same seed cuts the same channel', () => {
    const again = createScapeLayout(SCAPE_CONFIG).creek

    expect(again!.points).toEqual(creek!.points)
    expect(again!.length).toBe(creek!.length)
  })

  test('a layout with no beck carves nothing, rather than throwing', () => {
    const plain = createHeightField(SCAPE_CONFIG, { ...layout, creek: null })

    expect(Number.isFinite(plain.heightAt(0, 0))).toBe(true)
  })
})

describe('route geometry', () => {
  const zigzag = [
    { x: 0, z: 0 }, { x: 2, z: 1 }, { x: 4, z: -1 }, { x: 6, z: 1 }, { x: 8, z: 0 },
  ]

  test('smoothing leaves the two ends exactly where they were', () => {
    const smoothed = smoothPolyline(zigzag, 4)

    expect(smoothed[0]).toEqual(zigzag[0])
    expect(smoothed[smoothed.length - 1]).toEqual(zigzag[zigzag.length - 1])
  })

  test('smoothing shortens the line, because it takes the kinks out', () => {
    expect(pathLength(smoothPolyline(zigzag, 4))).toBeLessThan(pathLength(zigzag))
  })

  test('a query reports where a point falls along the line', () => {
    const query = createPathQuery([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 0 }], 5)

    expect(query(5, 3).distance).toBeCloseTo(3, 6)
    expect(query(5, 3).at).toBeCloseTo(0.5, 6)
    expect(query(15, 0).at).toBeCloseTo(1.5, 6)
  })

  test('a point outside the line’s bounds costs nothing to reject', () => {
    const query = createPathQuery([{ x: 0, z: 0 }, { x: 10, z: 0 }], 5)

    expect(query(100, 0).distance).toBe(Infinity)
    expect(query(9, 4).distance).toBeCloseTo(4, 6)
  })
})
