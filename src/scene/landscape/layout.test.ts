import { describe, expect, test } from 'bun:test'
import { Vector3 } from 'three'
import { yawAlong } from './layout.ts'


describe('yawAlong', () => {
  test('points a +z-long prop along the bearing it is given', () => {
    for (const bearing of [ 0, 0.7, 2.4, -1.1, Math.PI ]) {
      const along = new Vector3(0, 0, 1).applyAxisAngle(new Vector3(0, 1, 0), yawAlong(bearing))

      expect(along.x).toBeCloseTo(Math.cos(bearing), 6)
      expect(along.z).toBeCloseTo(Math.sin(bearing), 6)
    }
  })

  test('puts a +x-long prop broadside to it', () => {
    for (const bearing of [ 0.3, 1.9, -2.2 ]) {
      const across = new Vector3(1, 0, 0).applyAxisAngle(new Vector3(0, 1, 0), yawAlong(bearing))

      expect(across.x * Math.cos(bearing) + across.z * Math.sin(bearing)).toBeCloseTo(0, 6)
    }
  })
})
