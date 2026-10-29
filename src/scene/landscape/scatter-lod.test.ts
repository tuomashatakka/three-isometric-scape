import { describe, expect, test } from 'bun:test'
import { BoxGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, OrthographicCamera, Vector3 } from 'three'
import { createScatterLod, familyReach, tileFamily, viewHeight } from './scatter-lod.ts'


const LOD = { pixels: 1, tile: 100, wide: 400 }

/** A family of `count` unit boxes in a row along x, `spacing` metres apart. */
function family (count: number, spacing: number, size = 1): InstancedMesh {
  const mesh = new InstancedMesh(new BoxGeometry(size, size, size), new MeshBasicMaterial(), count)

  for (let index = 0; index < count; index += 1)
    mesh.setMatrixAt(index, new Matrix4().makeTranslation(index * spacing - count * spacing / 2, 0, 0))

  return mesh
}

function camera (view: number): OrthographicCamera {
  return new OrthographicCamera(-view, view, view / 2, -view / 2)
}

describe('the scatter, at the zoom it is seen at', () => {
  test('tiling keeps every instance exactly once, and where it was', () => {
    const mesh           = family(50, 13)
    const tiles          = tileFamily(mesh, 100)
    const seen: number[] = []

    for (const tile of tiles)
      for (let index = 0; index < tile.count; index += 1) {
        const at = new Vector3().setFromMatrixPosition(new Matrix4().fromArray(tile.instanceMatrix.array, index * 16))

        seen.push(Math.round(at.x * 1000))
        expect(tile.boundingSphere).not.toBeNull()
      }

    const expected = Array.from({ length: 50 }, (_, index) => Math.round((index * 13 - 325) * 1000))

    expect(tiles.length).toBeGreaterThan(1)
    expect(seen.sort((a, b) => a - b)).toEqual(expected.sort((a, b) => a - b))
  })

  test('a family is as big as its typical instance', () => {
    expect(familyReach(family(9, 2, 2))).toBeCloseTo(2 * Math.sqrt(3), 5)
  })

  test('wide: one world-wide draw per family; close: only tiles; sub-pixel: nothing', () => {
    const trees = family(40, 20, 8)
    const grass = family(40, 20, 0.3)
    const lod   = createScatterLod([ trees, grass ], LOD.tile)
    const tiles = lod.meshes.filter(mesh => mesh !== trees && mesh !== grass)

    // 1400 m of view on 500 px: a tree is about three pixels, a tuft a tenth.
    lod.update(camera(1400), 500, LOD)
    expect(trees.visible).toBe(true)
    expect(grass.visible).toBe(false)
    expect(tiles.every(tile => !tile.visible)).toBe(true)

    // 60 m of view: both are seen, as tiles the renderer can cull.
    lod.update(camera(60), 500, LOD)
    expect(trees.visible).toBe(false)
    expect(grass.visible).toBe(false)
    expect(tiles.every(tile => tile.visible)).toBe(true)

    // 0 pixels is "draw everything", at every zoom.
    lod.update(camera(1400), 500, { ...LOD, pixels: 0 })
    expect(grass.visible).toBe(true)

    lod.dispose()
  })

  test('a tile size of zero is the world-wide mesh at every zoom', () => {
    const grass = family(10, 20, 1)
    const lod   = createScatterLod([ grass ], 0)

    expect(lod.meshes).toEqual([ grass ])
    lod.update(camera(30), 500, LOD)
    expect(grass.visible).toBe(true)
  })

  test('the view height is the orthographic frame, zoom included', () => {
    const ortho = camera(100)

    ortho.zoom = 2
    expect(viewHeight(ortho)).toBe(50)
  })
})
