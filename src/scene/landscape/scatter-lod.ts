import { Color, InstancedMesh, Matrix4, Vector3 } from 'three'
import type { Camera, OrthographicCamera } from 'three'


/**
 * What the scatter costs at the zoom it is seen at.
 *
 * Every scattered family — grass, cobbles, weed, trees — used to be one
 * `InstancedMesh` over the whole archipelago with culling off, so a frame drew
 * every blade of grass on six islands whether the camera was on one yard or
 * over the whole map. Two levers, both decided per frame from the camera:
 *
 * - **too small to see.** A family whose typical instance projects under
 *   `lod.pixels` on screen is hidden. At the default whole-archipelago frame a
 *   grass tuft is a fifth of a pixel; drawing four thousand of them bought
 *   nothing but vertex work.
 * - **too far to matter.** Each family is also cut into square tiles of
 *   `lod.tile` metres, each its own culled draw. Close in, only the tiles in
 *   frame are drawn; pulled out past `lod.wide` metres of view, the one
 *   world-wide mesh is drawn instead, so the draw count does not multiply by
 *   the tile count exactly when everything is in frame anyway.
 *
 * The tiles share the family's geometry and material, so the cost is the
 * instance matrices twice over — kilobytes — and no program.
 */
export interface ScatterLod {

  /** Every mesh to add to the scene: the world-wide ones and their tiles. */
  readonly meshes: readonly InstancedMesh[]

  /** Show the right set for this camera. Allocation-free. */
  update(camera: Camera, canvasHeight: number, lod: ScatterLodConfig): void
  dispose(): void
}

export interface ScatterLodConfig {

  /** Smallest on-screen size, in pixels, a family is drawn at. 0 draws everything. */
  pixels: number

  /** Edge of a tile, in metres. Build-time. */
  tile: number

  /** Metres of view beyond which the world-wide mesh is drawn in place of the tiles. */
  wide: number
}

interface Family {
  whole: InstancedMesh
  tiles: InstancedMesh[]

  /** The typical instance's size, in metres. */
  reach: number
}

const scratch = new Matrix4()
const scale   = new Vector3()
const tint    = new Color()

/** The median instance's size: the geometry's diameter times its median scale. */
export function familyReach (mesh: InstancedMesh): number {
  mesh.geometry.computeBoundingSphere()

  const radius           = mesh.geometry.boundingSphere?.radius ?? 0
  const scales: number[] = []

  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getMatrixAt(index, scratch)
    scale.setFromMatrixScale(scratch)
    scales.push(Math.max(scale.x, scale.y, scale.z))
  }

  scales.sort((a, b) => a - b)

  return radius * 2 * (scales[Math.floor(scales.length / 2)] ?? 1)
}

/** Cut one family into square tiles of `size` metres, each a culled draw. */
export function tileFamily (mesh: InstancedMesh, size: number): InstancedMesh[] {
  const buckets = new Map<string, number[]>()

  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getMatrixAt(index, scratch)

    const key = `${Math.floor(scratch.elements[12] / size)},${Math.floor(scratch.elements[14] / size)}`
    const set = buckets.get(key) ?? []

    set.push(index)
    buckets.set(key, set)
  }

  return [ ...buckets.values() ].map(indices => {
    const tile = new InstancedMesh(mesh.geometry, mesh.material, indices.length)

    for (const [ slot, index ] of indices.entries()) {
      mesh.getMatrixAt(index, scratch)
      tile.setMatrixAt(slot, scratch)
      if (mesh.instanceColor) {
        mesh.getColorAt(index, tint)
        tile.setColorAt(slot, tint)
      }
    }

    tile.name             = mesh.name
    tile.castShadow       = mesh.castShadow
    tile.receiveShadow    = mesh.receiveShadow
    tile.renderOrder      = mesh.renderOrder
    tile.frustumCulled    = true
    tile.matrixAutoUpdate = false
    tile.updateMatrix()
    tile.computeBoundingSphere()
    tile.visible = false

    return tile
  })
}

/** World metres the camera shows top to bottom. */
export function viewHeight (camera: Camera): number {
  const ortho = camera as OrthographicCamera

  return ortho.isOrthographicCamera ? (ortho.top - ortho.bottom) / ortho.zoom : Number.POSITIVE_INFINITY
}

export function createScatterLod (families: readonly InstancedMesh[], tile: number): ScatterLod {
  const sets: Family[] = families.map(whole => ({
    whole,
    tiles: tile > 0 ? tileFamily(whole, tile) : [],
    reach: familyReach(whole),
  }))

  return {
    meshes: sets.flatMap(set => [ set.whole, ...set.tiles ]),

    update (camera, canvasHeight, lod) {
      const view     = viewHeight(camera)
      const perMetre = canvasHeight / view
      const wide     = view > lod.wide || !sets.some(set => set.tiles.length)

      for (const set of sets) {
        const seen  = set.reach * perMetre >= lod.pixels
        const whole = seen && (wide || !set.tiles.length)

        set.whole.visible = whole
        for (const tile of set.tiles)
          tile.visible = seen && !whole
      }
    },

    dispose () {
      for (const set of sets)
        for (const tile of set.tiles) {
          tile.removeFromParent()
          tile.dispose()
        }
    },
  }
}
