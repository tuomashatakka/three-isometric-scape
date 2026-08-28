import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { CHAPEL_DOOR_REACH, CHAPEL_FOOTING } from '../landscape/chapel.ts'
import { CHAPEL_EAVE, CHAPEL_WINDOWS, buildChapel, buildGraveMarker } from './chapel.ts'
import { resolvePalette } from './palette.ts'


const palette = resolvePalette()

type GeometryType = { getAttribute(name: string): { array: ArrayLike<number> }}

function boundsOf (geometry: GeometryType): Box3 {
  return new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)
}

describe('the chapel', () => {
  test('stands on its socle, and the spire is the top of it', () => {
    const geometry = buildChapel(createSeededRng(7_319), palette)
    const bounds   = boundsOf(geometry)

    expect(bounds.min.y).toBeGreaterThan(-0.2)

    // Taller than the farmhouse and shorter than the light. The chapel is the
    // second landmark on the island and it is meant to read as the second one.
    expect(bounds.max.y).toBeGreaterThan(9)
    expect(bounds.max.y).toBeLessThan(13)

    geometry.dispose()
  })

  test('every part of it is inside the footing the survey reserved', () => {
    const geometry = buildChapel(createSeededRng(7_319), palette)
    const position = geometry.getAttribute('position')

    for (let index = 0; index < position.count; index += 1)
      expect(Math.hypot(position.getX(index), position.getZ(index)))
        .toBeLessThanOrEqual(CHAPEL_FOOTING)

    geometry.dispose()
  })

  /**
   * The claim the footpath network is planned against: the doorstep is a pace of
   * ground *in front of* the door, not a point inside the tower. Both halves
   * matter — short of the geometry and the path ends in a wall, far past it and
   * the last few metres of the walk to church are across open grass.
   */
  test('the doorstep stands clear of the west face, and within a pace of it', () => {
    const geometry = buildChapel(createSeededRng(7_319), palette)
    const face     = -boundsOf(geometry).min.x

    expect(CHAPEL_DOOR_REACH).toBeGreaterThan(face)
    expect(CHAPEL_DOOR_REACH).toBeLessThan(face + 2)

    geometry.dispose()
  })

  /**
   * A pane cut above the eave is a pane cut through the roof, and from the
   * default pose that reads as a window which is simply not there — which is how
   * a missing window survives review. Stated here as a fact about the list.
   */
  test('no pane is cut through the roof it is under', () => {
    for (const pane of CHAPEL_WINDOWS) {
      expect(pane.y - pane.height / 2).toBeGreaterThan(0.5)
      expect(pane.y + pane.height / 2).toBeLessThan(CHAPEL_EAVE)
    }
  })

  test('the glass is in a wall face, and looking out of it', () => {
    const geometry = buildChapel(createSeededRng(7_319), palette)
    const bounds   = boundsOf(geometry)

    for (const pane of CHAPEL_WINDOWS) {
      const across = pane.axis === 'x' ? pane.x : pane.z

      // Outside the middle of the building and inside its outline: a pane on
      // the centreline is a lamp burning in the aisle.
      expect(Math.abs(across)).toBeGreaterThan(1)
      expect(pane.x).toBeGreaterThan(bounds.min.x)
      expect(pane.x).toBeLessThan(bounds.max.x)
      expect(Math.sign(across)).toBe(pane.facing)
    }

    geometry.dispose()
  })

  test('is byte-for-byte the same chapel for one seed', () => {
    const first  = buildChapel(createSeededRng(11), palette)
    const second = buildChapel(createSeededRng(11), palette)

    expect(Array.from(first.getAttribute('position').array))
      .toEqual(Array.from(second.getAttribute('position').array))

    first.dispose()
    second.dispose()
  })
})

describe('the grave markers', () => {
  test('stand on the ground and stay under a metre', () => {
    for (let seed = 0; seed < 12; seed += 1) {
      const geometry = buildGraveMarker(createSeededRng(seed), palette)
      const bounds   = boundsOf(geometry)

      expect(bounds.min.y).toBeGreaterThan(-0.1)
      expect(bounds.max.y).toBeGreaterThan(0.3)
      expect(bounds.max.y).toBeLessThan(1.1)

      geometry.dispose()
    }
  })

  /**
   * The reason this is one builder rather than two props: a churchyard of
   * nothing but slabs reads as a rockery, and one of nothing but crosses reads
   * as a decal repeated fourteen times. If a change ever collapses the seed onto
   * one branch, the yard goes uniform and nothing else here would say so.
   */
  test('a dozen seeds give both a stone and a cross', () => {
    const widths = new Set<number>()

    for (let seed = 0; seed < 12; seed += 1) {
      const geometry = buildGraveMarker(createSeededRng(seed), palette)

      widths.add(Math.round(boundsOf(geometry).max.x * 100))
      geometry.dispose()
    }

    // A slab is a third of a metre wide and a cross is barely a twentieth, so
    // two shapes cannot possibly share a bounding width.
    expect(widths.size).toBeGreaterThan(4)
  })

  test('is byte-for-byte the same marker for one seed', () => {
    const first  = buildGraveMarker(createSeededRng(5), palette)
    const second = buildGraveMarker(createSeededRng(5), palette)

    expect(Array.from(first.getAttribute('position').array))
      .toEqual(Array.from(second.getAttribute('position').array))

    first.dispose()
    second.dispose()
  })
})
