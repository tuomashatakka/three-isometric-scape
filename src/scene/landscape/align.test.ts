import { describe, expect, test } from 'bun:test'
import { Euler, Quaternion, Vector3 } from 'three'
import { alignToSlope } from './align.ts'
import { surfaceQueries } from './height.ts'
import type { GroundNormal } from './height.ts'


const UP = new Vector3(0, 1, 0)

function scratch (): [number, number, number] {
  return [ 0, 0, 0 ]
}

/** Where a prop's own up axis ends up, given the euler that was written for it. */
function raised (euler: [number, number, number]): Vector3 {
  return UP.clone().applyEuler(new Euler(euler[0], euler[1], euler[2]))
}

/** The normal of a plane tipped `angle` radians toward +x. */
function slope (angle: number): GroundNormal {
  return { x: -Math.sin(angle), y: Math.cos(angle), z: 0 }
}


describe('standing a prop on a slope', () => {
  test('level ground is the yaw it always was, exactly', () => {
    // Not "close to": the flat case is most of the island, and a scape that
    // rebuilt every placement through a quaternion round trip would move every
    // prop in it by a rounding error for no reason at all.
    expect(alignToSlope({ x: 0, y: 1, z: 0 }, 1.37, 1, scratch())).toEqual([ 0, 1.37, 0 ])
    expect(alignToSlope(slope(0.4), 1.37, 0, scratch())).toEqual([ 0, 1.37, 0 ])
  })

  test('a full tilt puts the prop’s up axis on the ground’s normal', () => {
    for (const angle of [ 0.01, 0.2, 0.6, 1.1 ]) {
      const normal = slope(angle)
      const up     = raised(alignToSlope(normal, 0.9, 1, scratch()))

      expect(up.x).toBeCloseTo(normal.x, 6)
      expect(up.y).toBeCloseTo(normal.y, 6)
      expect(up.z).toBeCloseTo(normal.z, 6)
    }
  })

  test('half a tilt is half a lean, not half a prop', () => {
    const normal = slope(0.8)
    const up     = raised(alignToSlope(normal, 0, 0.5, scratch()))
    const full   = Math.acos(Math.min(1, normal.y))

    expect(up.length()).toBeCloseTo(1, 6)
    expect(Math.acos(Math.min(1, up.y))).toBeGreaterThan(full * 0.3)
    expect(Math.acos(Math.min(1, up.y))).toBeLessThan(full)
  })

  test('the yaw is applied in the prop’s own frame, so a turned rock stays flush', () => {
    // Tipping first and yawing after would spin the prop about the world's
    // vertical and slide it off the slope. Every yaw has to leave the up axis
    // exactly where the normal is.
    const normal = slope(0.55)

    for (const yaw of [ 0, 1, 2.5, -3 ]) {
      const up = raised(alignToSlope(normal, yaw, 1, scratch()))

      expect(up.y).toBeCloseTo(normal.y, 6)
      expect(up.x).toBeCloseTo(normal.x, 6)
    }
  })

  test('the yaw is really applied — two bearings are two rotations', () => {
    const normal = slope(0.4)
    const first  = new Quaternion().setFromEuler(new Euler(...alignToSlope(normal, 0, 1, scratch())))
    const second = new Quaternion().setFromEuler(new Euler(...alignToSlope(normal, 2, 1, scratch())))

    expect(first.angleTo(second)).toBeGreaterThan(1)
  })

  test('writes into the caller’s scratch and allocates nothing', () => {
    const target = scratch()

    expect(alignToSlope(slope(0.3), 0.2, 1, target)).toBe(target)
  })

  test('agrees with the field it is fed from, at the minimum, middle and maximum', () => {
    // The whole chain, end to end: a real height field, its own normal, and the
    // euler that stands something on it.
    const ground = (x: number): number => x * 0.5
    const field  = surfaceQueries(ground)
    const normal = field.normalAt(3, 0, { x: 0, y: 0, z: 0 })

    expect(field.slopeAt(3, 0)).toBeCloseTo(0.5, 6)

    for (const weight of [ 0, 0.5, 1 ]) {
      const up = raised(alignToSlope(normal, 0.3, weight, scratch()))

      expect(up.length()).toBeCloseTo(1, 6)
      expect(up.x).toBeLessThanOrEqual(1e-12)
    }
  })
})
