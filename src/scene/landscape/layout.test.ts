import { describe, expect, test } from 'bun:test'
import { Vector3 } from 'three'
import { SCAPE_CONFIG } from '../config.ts'
import { createHeightField } from './height.ts'
import { createScapeLayout, pastureInfluence, yawAlong } from './layout.ts'


describe('the upland pasture', () => {
  const layout  = createScapeLayout(SCAPE_CONFIG)
  const field   = createHeightField(SCAPE_CONFIG, layout)
  const pasture = layout.pasture

  test('the authored scape has one', () => {
    expect(pasture).not.toBeNull()
  })

  test('its whole wall line stands on dry ground', () => {
    // The failure this exists to catch: a centre chosen on its own height alone
    // scores well on a shoulder above a cove and drowns a third of its wall.
    for (let step = 0; step < 48; step += 1) {
      const angle = step / 48 * Math.PI * 2
      const x     = pasture!.x + Math.cos(angle) * pasture!.radius
      const z     = pasture!.z + Math.sin(angle) * pasture!.radius

      expect(field.heightAt(x, z)).toBeGreaterThan(SCAPE_CONFIG.terrain.waterLevel + 1)
    }
  })

  test('it sits above the farm and clear of the yard shelf', () => {
    const fromYard = Math.hypot(pasture!.x - layout.yard.x, pasture!.z - layout.yard.z)

    expect(fromYard).toBeGreaterThan(layout.yard.radius * 1.25)
    expect(pasture!.level).toBeGreaterThan(layout.yard.level + 2)
  })

  test('its gateway looks back at the farm', () => {
    const toYard = Math.atan2(layout.yard.z - pasture!.z, layout.yard.x - pasture!.x)

    expect(Math.cos(pasture!.gateway - toYard)).toBeCloseTo(1, 6)
  })

  test('the claim is full across the middle and gone at the wall', () => {
    expect(pastureInfluence(layout, pasture!.x, pasture!.z)).toBe(1)
    expect(pastureInfluence(layout, pasture!.x + pasture!.radius * 0.7, pasture!.z)).toBe(1)
    expect(pastureInfluence(layout, pasture!.x + pasture!.radius, pasture!.z)).toBe(0)
    expect(pastureInfluence(layout, pasture!.x + pasture!.radius * 2, pasture!.z)).toBe(0)
  })

  test('a layout with no pasture claims nothing, rather than throwing', () => {
    expect(pastureInfluence({ ...layout, pasture: null }, 0, 0)).toBe(0)
  })

  test('the same seed sites it in the same place', () => {
    const again = createScapeLayout(SCAPE_CONFIG).pasture

    expect(again).toEqual(pasture)
  })
})

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
