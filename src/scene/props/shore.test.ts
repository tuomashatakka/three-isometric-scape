import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { buildBoathouse, buildMooringPost, buildNetRack } from './shore.ts'
import { resolvePalette } from './palette.ts'


const palette = resolvePalette()

type GeometryType = { getAttribute(name: string): { array: ArrayLike<number> }}

function boundsOf (geometry: GeometryType): Box3 {
  return new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)
}

describe('the boat harbour', () => {
  test('the boathouse opens to +z, with its slipway running out under the water', () => {
    const geometry = buildBoathouse(createSeededRng(31), palette)
    const bounds   = boundsOf(geometry)

    // The slipway reaches past the shed on the water side and dips below the
    // waterline the caller anchors the building to.
    expect(bounds.max.z).toBeGreaterThan(-bounds.min.z + 2)
    expect(bounds.min.y).toBeLessThan(-0.2)

    geometry.dispose()
  })

  test('the net rack stands broadside — longer across x than through z', () => {
    const geometry = buildNetRack(createSeededRng(31), palette)
    const size     = boundsOf(geometry).getSize(boundsOf(geometry).max.clone())

    expect(size.x).toBeGreaterThan(size.z * 2)

    geometry.dispose()
  })

  test('a mooring stake clears the deepest water it is scattered into', () => {
    // `dressing.ts` places stakes down to 1.7 m of water at 0.8 scale, so the
    // shortest post the rng can produce still has to break the surface.
    for (const seed of [ 1, 2, 3, 5, 8, 13 ]) {
      const geometry = buildMooringPost(createSeededRng(seed), palette)

      expect(boundsOf(geometry).max.y * 0.8).toBeGreaterThan(1.7)
      geometry.dispose()
    }
  })

  test('every shore prop is byte-for-byte stable per seed', () => {
    for (const build of [ buildBoathouse, buildNetRack, buildMooringPost ]) {
      const first  = build(createSeededRng(909), palette)
      const second = build(createSeededRng(909), palette)

      expect(Array.from(first.getAttribute('position').array))
        .toEqual(Array.from(second.getAttribute('position').array))

      first.dispose()
      second.dispose()
    }
  })
})
