import { describe, expect, test } from 'bun:test'
import { MeshStandardMaterial, Matrix4, Vector3 } from 'three'
import { SCAPE_CONFIG } from '../config.ts'
import { LADDER, atmosphereQuality } from '../quality.ts'
import { createWaterWheels } from './mill-wheels.ts'
import type { WaterWheelHub } from './mill-wheels.ts'


const HUBS: WaterWheelHub[] = [
  { x: 16, y: 5.2, z: 34, yaw: 0.8, sense: 1 },
  { x: -321, y: 3.9, z: -498, yaw: -2.1, sense: -1 },
]

const material = (): MeshStandardMaterial => new MeshStandardMaterial()
const quality  = atmosphereQuality('desktop')

function wheels (spin = SCAPE_CONFIG.watermill.spin, hubs: readonly WaterWheelHub[] = HUBS) {
  return createWaterWheels({
    config:   () => ({ ...SCAPE_CONFIG, watermill: { ...SCAPE_CONFIG.watermill, spin }}),
    quality,
    hubs,
    material: material(),
  })
}

/** Just enough of an `InstancedMesh` to read one instance's placement back. */
interface Placed {
  getMatrixAt(index: number, target: Matrix4): void
}

/** The world direction one wheel's own `+x` points, which is what the spin moves. */
function rimOf (mesh: Placed, index: number): Vector3 {
  const matrix = new Matrix4()

  mesh.getMatrixAt(index, matrix)

  return new Vector3(1, 0, 0).applyMatrix4(matrix)
    .sub(
      new Vector3(0, 0, 0).applyMatrix4(matrix),
    )
}

describe('the turning wheels', () => {
  test('every watermill in the archipelago is one draw', () => {
    const fleet = wheels()!

    expect(fleet.mesh.count).toBe(HUBS.length)
    fleet.dispose()
  })

  test('no watermill is no mesh', () => {
    expect(wheels(SCAPE_CONFIG.watermill.spin, [])).toBeNull()
  })

  test('the bound holds every wheel, however far apart they stand', () => {
    // The whole reason the sphere is given rather than derived: three sizes an
    // instanced bound from the geometry at the identity, and these hubs are most
    // of an archipelago apart.
    const fleet = wheels()!
    const bound = fleet.mesh.boundingSphere!

    for (const hub of HUBS)
      expect(bound.containsPoint(new Vector3(hub.x, hub.y, hub.z))).toBe(true)

    fleet.dispose()
  })

  test('the wheel turns on the water and stops when the channel shuts', () => {
    const fleet = wheels()!

    fleet.update(1, 1)
    expect(fleet.phase).toBeGreaterThan(0)

    const turned = fleet.phase

    // A frozen beck is a stopped wheel, and stopped means *unchanged* rather
    // than slow: a capture taken in midwinter has to come back the same twice.
    fleet.update(1, 0)
    expect(fleet.phase).toBe(turned)

    fleet.dispose()
  })

  test('a spin of zero is a wheel a capture can be taken of', () => {
    const fleet = wheels(0)!

    fleet.update(5, 1)
    expect(fleet.phase).toBe(0)

    fleet.dispose()
  })

  test('the two ways a wheel can be filled turn it two ways', () => {
    // `sense` is what a sail wheel has no use for. Both hubs are given the same
    // yaw here so the only thing left that can separate them is the water.
    const fleet = createWaterWheels({
      config:   () => SCAPE_CONFIG,
      quality,
      hubs:     [{ ...HUBS[0], sense: 1 }, { ...HUBS[0], sense: -1 }],
      material: material(),
    })!

    fleet.update(0.4, 1)

    const left  = rimOf(fleet.mesh, 0)
    const right = rimOf(fleet.mesh, 1)

    expect(left.y).toBeGreaterThan(0.05)
    expect(right.y).toBeCloseTo(-left.y, 6)

    fleet.dispose()
  })

  test('a cheap tier keeps its buckets', () => {
    // The one tier handle the mill has, and the one that must not reach zero: a
    // shroud with nothing between its rims is a cartwheel, not a cheap wheel.
    for (const tier of LADDER)
      expect(atmosphereQuality(tier).wheelBuckets).toBeGreaterThanOrEqual(8)
  })
})
