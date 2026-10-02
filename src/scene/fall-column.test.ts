import { describe, expect, test } from 'bun:test'
import { Vector3 } from 'three'
import {
  FALL_RATE_STEPS,
  FALL_RISE,
  FALL_SPAN,
  fallColumnBase,
  fallGeometry,
  fallTilt,
  fallWrap,
  screenSize,
  sizeFallColumn,
} from './fall-column.ts'


/** Pixels a view-space offset lands from where it started, on an ortho frustum. */
function pixels (offset: number, viewSize: number, height: number): number {
  return offset * height / viewSize
}

describe('screenSize', () => {
  test('is the same number of pixels at every zoom, which is the claim', () => {
    const share  = 0.008
    const height = 1_080
    const wide   = pixels(screenSize(share, 1_400), 1_400, height)

    for (const viewSize of [ 8, 10, 48, 260, 520, 1_400, 1_600 ])
      expect(pixels(screenSize(share, viewSize), viewSize, height)).toBeCloseTo(wide, 9)

    // And the share is the share: eight thousandths of a 1080-line frame.
    expect(wide).toBeCloseTo(share * height, 9)
  })

  test('grows with the view rather than against it', () => {
    // The whole of the bug this module was cut to state. The old form divided,
    // which made a mark go as the inverse square of the zoom on screen.
    expect(screenSize(0.008, 1_400)).toBeGreaterThan(screenSize(0.008, 260))
  })

  test('never goes negative on a view that has', () => {
    expect(screenSize(0.008, -5)).toBe(0)
  })
})

describe('sizeFallColumn', () => {
  test('sizes the box against the frame and nothing else', () => {
    const box  = new Vector3()
    const rise = sizeFallColumn(260, box)

    expect(rise).toBeCloseTo(260 * FALL_RISE, 9)
    expect(box.y).toBeCloseTo(rise, 9)
    expect(box.x).toBeCloseTo(260 * FALL_SPAN, 9)
  })

  test('runs deeper than it is wide, because the camera is tilted', () => {
    const box = new Vector3()

    sizeFallColumn(1_400, box)
    expect(box.z).toBeGreaterThan(box.x)
    expect(box.z).toBeCloseTo(box.x / fallTilt(1_400), 9)
  })

  test('doubling the view doubles every extent', () => {
    const near = new Vector3()
    const far  = new Vector3()

    sizeFallColumn(100, near)
    sizeFallColumn(200, far)
    expect(far.x / near.x).toBeCloseTo(2, 9)
    expect(far.y / near.y).toBeCloseTo(2, 9)
  })

  test('allocates nothing: the box handed in is the box written', () => {
    const box = new Vector3()

    expect(sizeFallColumn(48, box)).toBeCloseTo(box.y, 9)
  })
})

describe('fallTilt', () => {
  test('is read at the minimum, the middle and the maximum view', () => {
    const close = fallTilt(8)
    const mid   = fallTilt(804)
    const wide  = fallTilt(1_600)

    expect(close).toBeLessThan(mid)
    expect(mid).toBeLessThan(wide)
    expect(close).toBeGreaterThanOrEqual(0.5)
    expect(wide).toBeLessThanOrEqual(1)
  })

  test('is flat outside the zoom range rather than running away', () => {
    expect(fallTilt(-100)).toBeCloseTo(fallTilt(8), 9)
    expect(fallTilt(100_000)).toBeCloseTo(fallTilt(1_600), 9)
  })
})

describe('fallColumnBase', () => {
  test('hangs the column below the focus it follows', () => {
    expect(fallColumnBase(0, 100)).toBeLessThan(0)
    expect(fallColumnBase(12, 0)).toBe(12)
  })
})

describe('fallWrap', () => {
  test('is a whole number of column heights for every rate in the buffer', () => {
    // The claim the quantised rates exist for: wrapping the integral is only
    // invisible if every falling thing is back where it started when it happens.
    const rise = 221
    const wrap = fallWrap(rise)

    for (let step = 0; step < FALL_RATE_STEPS; step += 1) {
      const rate   = (step + 3) / FALL_RATE_STEPS
      const cycles = wrap * rate / rise

      expect(cycles).toBeCloseTo(Math.round(cycles), 9)
    }
  })

  test('never collapses on a column with no height', () => {
    expect(fallWrap(0)).toBeGreaterThan(0)
  })
})

describe('fallGeometry', () => {
  const count = 64

  test('carries a corner, a cell and a rate, and indexes two triangles each', () => {
    const geometry = fallGeometry(count, 7_319)

    expect(geometry.getAttribute('position').count).toBe(count * 4)
    expect(geometry.getAttribute('aCell').count).toBe(count * 4)
    expect(geometry.getAttribute('aRate').count).toBe(count * 4)
    expect(geometry.getIndex()?.count).toBe(count * 6)
  })

  test('is byte-for-byte stable per seed', () => {
    const one = fallGeometry(count, 7_319).getAttribute('aCell').array as Float32Array
    const two = fallGeometry(count, 7_319).getAttribute('aCell').array as Float32Array

    expect(Array.from(one)).toEqual(Array.from(two))
  })

  test('is a different shower on a different seed', () => {
    const one = fallGeometry(count, 7_319).getAttribute('aCell').array as Float32Array
    const two = fallGeometry(count, 7_320).getAttribute('aCell').array as Float32Array

    expect(Array.from(one)).not.toEqual(Array.from(two))
  })

  test('keeps every cell inside the unit box the shader scales by', () => {
    const cell = fallGeometry(count, 4_242).getAttribute('aCell').array as Float32Array

    for (const value of cell) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  test('quantises the rates, and spreads them over every step', () => {
    const rate = fallGeometry(600, 11).getAttribute('aRate').array as Float32Array
    const seen = new Set<number>()

    for (const value of rate) {
      expect(Number.isInteger(Math.round(value * FALL_RATE_STEPS))).toBe(true)
      expect(value * FALL_RATE_STEPS).toBeCloseTo(Math.round(value * FALL_RATE_STEPS), 5)
      seen.add(Math.round(value * FALL_RATE_STEPS))
    }

    expect(seen.size).toBe(FALL_RATE_STEPS)
  })

  test('gives all four corners of one quad the same cell and rate', () => {
    const cell = fallGeometry(4, 99).getAttribute('aCell').array as Float32Array
    const rate = fallGeometry(4, 99).getAttribute('aRate').array as Float32Array

    for (let drop = 0; drop < 4; drop += 1)
      for (let corner = 1; corner < 4; corner += 1) {
        expect(cell[(drop * 4 + corner) * 3]).toBe(cell[drop * 4 * 3])
        expect(rate[drop * 4 + corner]).toBe(rate[drop * 4])
      }
  })
})
