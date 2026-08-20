import { describe, expect, test } from 'bun:test'
import { MeshStandardMaterial, Vector3 } from 'three'
import { SCAPE_CONFIG } from '../config.ts'
import { createMillSails } from './mill-sails.ts'
import type { MillHub } from './mill-sails.ts'


const HUBS: MillHub[] = [
  { x: 29, y: 12.4, z: -19.7, yaw: 0.6 },
  { x: 168, y: 9.1, z: 157.5, yaw: -1.2 },
]

function withConfig (mill: Partial<typeof SCAPE_CONFIG.mill>, wind = SCAPE_CONFIG.wind) {
  return { ...SCAPE_CONFIG, mill: { ...SCAPE_CONFIG.mill, ...mill }, wind }
}

describe('the turning sails', () => {
  test('every mill in the archipelago is one draw', () => {
    const sails = createMillSails({
      config:   () => SCAPE_CONFIG,
      hubs:     HUBS,
      material: new MeshStandardMaterial(),
    })!

    expect(sails.mesh.count).toBe(HUBS.length)
    sails.dispose()
  })

  test('no mill is no mesh', () => {
    expect(createMillSails({
      config:   () => SCAPE_CONFIG,
      hubs:     [],
      material: new MeshStandardMaterial(),
    })).toBeNull()
  })

  test('the bound holds every wheel, so none of them is culled', () => {
    const sails = createMillSails({
      config:   () => SCAPE_CONFIG,
      hubs:     HUBS,
      material: new MeshStandardMaterial(),
    })!
    const bound = sails.mesh.boundingSphere!

    for (const hub of HUBS)
      expect(bound.containsPoint(new Vector3(hub.x, hub.y, hub.z))).toBe(true)

    // And with room for the wheel itself, not just its hub.
    expect(bound.radius).toBeGreaterThan(SCAPE_CONFIG.mill.sailSpan / 2)
    sails.dispose()
  })

  test('turns with the wind', () => {
    const sails = createMillSails({
      config:   () => withConfig({ spin: 1.15 }, { strength: 0.9, speed: 1.35 }),
      hubs:     HUBS,
      material: new MeshStandardMaterial(),
    })!

    sails.update(0.5)
    expect(sails.phase).toBeCloseTo(1.15 * 0.9 * 0.5, 6)
    sails.dispose()
  })

  test('stops dead on a still day, and on a braked mill', () => {
    for (const config of [
      withConfig({ spin: 1.15 }, { strength: 0, speed: 1.35 }),
      withConfig({ spin: 0 }, { strength: 0.9, speed: 1.35 }),
    ]) {
      const sails = createMillSails({
        config:   () => config,
        hubs:     HUBS,
        material: new MeshStandardMaterial(),
      })!

      sails.update(4)
      sails.update(4)

      // Not merely slow: a capture that advanced by however long the page took
      // to be ready is a capture that is different on every run.
      expect(sails.phase).toBe(0)
      sails.dispose()
    }
  })

  test('stays inside one turn however long it runs', () => {
    const sails = createMillSails({
      config:   () => withConfig({ spin: 2 }, { strength: 1, speed: 1 }),
      hubs:     HUBS,
      material: new MeshStandardMaterial(),
    })!

    for (let frame = 0; frame < 200; frame += 1)
      sails.update(0.1)

    expect(sails.phase).toBeGreaterThanOrEqual(0)
    expect(sails.phase).toBeLessThan(Math.PI * 2)
    sails.dispose()
  })

  test('disposing twice is not an error, and stops the wheel', () => {
    const sails = createMillSails({
      config:   () => withConfig({ spin: 1.15 }, { strength: 1, speed: 1 }),
      hubs:     HUBS,
      material: new MeshStandardMaterial(),
    })!

    sails.dispose()
    sails.dispose()
    sails.update(1)
    expect(sails.phase).toBe(0)
  })
})
