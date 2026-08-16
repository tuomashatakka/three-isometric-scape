import { describe, expect, test } from 'bun:test'
import { Box3, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import type { BufferGeometry } from 'three'
import { createSeededRng } from 'threejs-scene'
import { buildRowboat } from './objects.ts'
import { resolvePalette } from './palette.ts'


const palette = resolvePalette()

function boundsOf (geometry: BufferGeometry): Box3 {
  return new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)
}

function halfWidthIn (geometry: BufferGeometry, accept: (z: number) => boolean): number {
  const positions = geometry.getAttribute('position')
  let width       = 0

  for (let index = 0; index < positions.count; index += 1) {
    const y = positions.getY(index)
    const z = positions.getZ(index)

    // Leave the oars out of a measurement of the hull itself.
    if (y < 0.74 && accept(z))
      width = Math.max(width, Math.abs(positions.getX(index)))
  }

  return width
}

describe('the rowboat', () => {
  test('rests on its keel with both oars lying horizontally', () => {
    const geometry = buildRowboat(createSeededRng(31), palette)
    const bounds   = boundsOf(geometry)
    const size     = bounds.getSize(new Vector3())

    expect(bounds.min.y).toBeCloseTo(0, 5)
    expect(bounds.max.y).toBeLessThan(0.9)
    expect(size.z).toBeGreaterThan(size.y * 3.5)

    geometry.dispose()
  })

  test('tapers symmetrically into narrow bow and stern', () => {
    const geometry = buildRowboat(createSeededRng(31), palette)
    const bounds   = boundsOf(geometry)
    const middle   = halfWidthIn(geometry, z => Math.abs(z) < 0.6)
    const ends     = halfWidthIn(geometry, z => Math.abs(z) > 1.45)

    expect(bounds.min.x).toBeCloseTo(-bounds.max.x, 5)
    expect(bounds.min.z).toBeCloseTo(-bounds.max.z, 5)
    expect(ends).toBeLessThan(middle * 0.7)

    geometry.dispose()
  })

  test('leaves an open well inside the strakes', () => {
    const geometry = buildRowboat(createSeededRng(31), palette)
    const material = new MeshBasicMaterial({ side: DoubleSide })
    const boat     = new Mesh(geometry, material)
    const ray      = new Raycaster(new Vector3(0, 2, 0.42), new Vector3(0, -1, 0))
    const hits     = ray.intersectObject(boat)

    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].point.y).toBeLessThan(0.3)
    expect(boundsOf(geometry).max.y - hits[0].point.y).toBeGreaterThan(0.45)

    geometry.dispose()
    material.dispose()
  })
})
