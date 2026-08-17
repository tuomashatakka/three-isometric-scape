import { describe, expect, test } from 'bun:test'
import { createCameraPath, legCount, samplePath, unwrapHeadings } from './camera-path.ts'
import type { CameraPathTween, CameraWaypoint } from './camera-path.ts'


const at = (x: number, z: number, viewSize = 40, heading = 0): CameraWaypoint =>
  ({ x, z, viewSize, heading })

const SQUARE: CameraWaypoint[] = [
  at(-40, -40, 30, 0),
  at(40, -40, 60, 90),
  at(40, 40, 30, 180),
  at(-40, 40, 60, 270),
]

function sample (points: CameraWaypoint[], travel: number, loop: boolean): CameraPathTween {
  const out: CameraPathTween = { x: 0, z: 0, viewSize: 1, heading: 0 }
  return { ...samplePath(points, unwrapHeadings(points), travel, loop, out) }
}


describe('a tour’s headings', () => {
  test('unroll onto one number line, so a turn is the short way round', () => {
    // 350 to 10 is twenty degrees east, not three hundred and forty west.
    expect(unwrapHeadings([ at(0, 0, 40, 350), at(1, 0, 40, 10) ])).toEqual([ 350, 370 ])
    expect(unwrapHeadings([ at(0, 0, 40, 10), at(1, 0, 40, 350) ])).toEqual([ 10, -10 ])
  })

  test('keep going when the tour really does keep going', () => {
    const round = [ at(0, 0, 40, 0), at(1, 0, 40, 120), at(2, 0, 40, 240) ]

    expect(unwrapHeadings(round)).toEqual([ 0, 120, 240 ])
  })
})

describe('how many legs a tour has', () => {
  test('one per gap, plus the way home when it loops', () => {
    expect(legCount(4, false)).toBe(3)
    expect(legCount(4, true)).toBe(4)
  })

  test('none at all below two stops — one place is not a tour', () => {
    expect(legCount(1, true)).toBe(0)
    expect(legCount(0, false)).toBe(0)
  })
})

describe('flying the tour', () => {
  test('passes through every stop it was given, rather than near them', () => {
    for (const [ index, point ] of SQUARE.entries()) {
      const there = sample(SQUARE, index, true)

      expect(there.x).toBeCloseTo(point.x, 6)
      expect(there.z).toBeCloseTo(point.z, 6)
      expect(there.viewSize).toBeCloseTo(point.viewSize, 6)
      expect(there.heading).toBeCloseTo(point.heading, 6)
    }
  })

  test('a loop comes back to the first stop, exactly', () => {
    const home = sample(SQUARE, SQUARE.length, true)

    expect(home.x).toBeCloseTo(SQUARE[0].x, 6)
    expect(home.z).toBeCloseTo(SQUARE[0].z, 6)
    expect(home.heading).toBeCloseTo(SQUARE[0].heading, 6)
  })

  test('a run clamps at both ends instead of flying off the path', () => {
    const before = sample(SQUARE, -8, false)
    const after  = sample(SQUARE, 99, false)

    expect(before.x).toBeCloseTo(SQUARE[0].x, 6)
    expect(after.x).toBeCloseTo(SQUARE[SQUARE.length - 1].x, 6)
  })

  test('never zooms through the ground on its way between two good places', () => {
    for (let step = 0; step <= 200; step += 1)
      expect(sample(SQUARE, step / 50, true).viewSize).toBeGreaterThan(0)
  })

  test('crosses north without going the long way round to do it', () => {
    const seam = [ at(0, 0, 40, 350), at(10, 0, 40, 10) ]

    // Every heading on the leg is within the twenty degrees the leg spans,
    // read either side of north. A spline that unrolled the wrong way would
    // spend the middle of this leg pointing due south.
    for (let step = 0; step <= 20; step += 1) {
      const heading = sample(seam, step / 20, false).heading
      const east    = heading <= 12
      const west    = heading >= 348

      expect(east || west).toBe(true)
    }
  })

  test('one stop is somewhere to be, not something to fly', () => {
    const only = sample([ at(5, 6, 12, 44) ], 3, true)

    expect(only).toEqual({ x: 5, z: 6, viewSize: 12, heading: 44 })
  })
})

describe('the tour’s clock', () => {
  test('will not play a path that is not one', () => {
    const path = createCameraPath({ legSeconds: 2, loop: false })

    path.add(at(0, 0))
    path.play()

    expect(path.playing).toBe(false)
    expect(path.advance(1)).toBeNull()
  })

  test('runs a leg in the seconds it was given', () => {
    const path = createCameraPath({ legSeconds: 4, loop: false })

    path.replace([ at(0, 0), at(100, 0) ])
    path.play()
    path.advance(2)

    expect(path.progress).toBeCloseTo(0.5, 6)
  })

  test('stops itself at the end of a run, and starts over on the next play', () => {
    const path = createCameraPath({ legSeconds: 1, loop: false })

    path.replace([ at(0, 0), at(10, 0) ])
    path.play()
    path.advance(5)

    expect(path.playing).toBe(false)
    expect(path.progress).toBe(1)

    path.play()
    expect(path.progress).toBe(0)
  })

  test('a loop keeps going round rather than ending', () => {
    const path = createCameraPath({ legSeconds: 1, loop: true })

    path.replace(SQUARE)
    path.play()
    path.advance(4.5)

    expect(path.playing).toBe(true)
    expect(path.progress).toBeCloseTo(0.125, 6)
  })

  test('stopping holds where it stopped, and playing again carries on from there', () => {
    const path = createCameraPath({ legSeconds: 2, loop: false })

    path.replace([ at(0, 0), at(10, 0), at(20, 0) ])
    path.play()
    path.advance(1)
    path.stop()

    expect(path.advance(10)).toBeNull()

    path.play()
    expect(path.progress).toBeCloseTo(0.25, 6)
  })

  test('losing every stop stops the tour rather than leaving it running on nothing', () => {
    const path = createCameraPath({ legSeconds: 1, loop: true })

    path.replace(SQUARE)
    path.play()
    path.clear()

    expect(path.playing).toBe(false)
    expect(path.waypoints).toHaveLength(0)
  })

  test('holds its stops rather than the caller’s array', () => {
    const path  = createCameraPath({ legSeconds: 1, loop: true })
    const given = [ at(0, 0), at(1, 1) ]

    path.replace(given)
    given[0].x = 999

    expect(path.waypoints[0].x).toBe(0)
  })

  test('never runs a leg in no time at all', () => {
    const path = createCameraPath({ legSeconds: 1, loop: false })

    path.set({ legSeconds: 0 })
    expect(path.options.legSeconds).toBeGreaterThan(0)
  })
})
