import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { buildLamb, buildSheep } from './livestock.ts'
import { resolvePalette } from './palette.ts'


const palette = resolvePalette()

type GeometryType = { getAttribute(name: string): { array: ArrayLike<number>, count: number }}

function boundsOf (geometry: GeometryType): Box3 {
  return new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)
}

/** The highest vertex in the forward tenth of an animal — where its head is. */
function frontHeight (geometry: GeometryType): number {
  const position = geometry.getAttribute('position').array
  const bounds   = boundsOf(geometry)
  const front    = bounds.max.z - (bounds.max.z - bounds.min.z) * 0.1

  let highest = -Infinity

  for (let index = 0; index < position.length; index += 3)
    if (position[index + 2] >= front)
      highest = Math.max(highest, position[index + 1])

  return highest
}

describe('the flock', () => {
  test('a ewe stands on her hooves and is longer than she is tall', () => {
    const geometry = buildSheep(createSeededRng(11), palette)
    const bounds   = boundsOf(geometry)

    // Base at the ground: the scatter drops every instance onto the surface, so
    // a builder that leaves its feet below zero buries the animal.
    expect(bounds.min.y).toBeGreaterThan(-0.06)
    expect(bounds.min.y).toBeLessThan(0.06)

    // A sheep is about a metre long and about two thirds of that at the withers.
    expect(bounds.max.z - bounds.min.z).toBeGreaterThan(1)
    expect(bounds.max.y).toBeLessThan(bounds.max.z - bounds.min.z)
    expect(bounds.max.y).toBeGreaterThan(0.6)

    geometry.dispose()
  })

  /**
   * The claim the head-down pose is *for*, as a fact about the geometry.
   *
   * This scape is looked at from above, so the silhouette that has to work is
   * the one seen from there — and what makes a grazing ewe read as an animal
   * rather than a pale boulder is that her outline is broken at one end. So the
   * test asks where the *front* of the animal is in y, rather than only how far
   * forward it reaches: a head modelled at the height of the back is a barrel
   * with a bump on it from every angle this scape is ever seen from.
   */
  test('the ewe’s head is down in the grass, and the lamb’s is up', () => {
    const ewe  = buildSheep(createSeededRng(11), palette)
    const lamb = buildLamb(createSeededRng(11), palette)

    // The muzzle is in the grass, well under the line of the fleece.
    expect(frontHeight(ewe)).toBeLessThan(boundsOf(ewe).max.y * 0.72)

    // And the lamb's is the highest thing on it.
    expect(frontHeight(lamb)).toBeGreaterThan(boundsOf(lamb).max.y * 0.86)

    ewe.dispose()
    lamb.dispose()
  })

  test('a lamb is a smaller animal, not a smaller copy', () => {
    const ewe  = boundsOf(buildSheep(createSeededRng(4), palette))
    const lamb = boundsOf(buildLamb(createSeededRng(4), palette))

    expect(lamb.min.y).toBeGreaterThan(-0.06)
    expect(lamb.max.y).toBeLessThan(ewe.max.y * 0.85)
    expect(lamb.max.z - lamb.min.z).toBeLessThan((ewe.max.z - ewe.min.z) * 0.8)

    // Head up rather than down: the lamb's highest point is its own head, which
    // stands above the line of its back.
    expect(lamb.max.y).toBeGreaterThan(0.5)
  })

  test('both animals are painted, and neither is a single blob', () => {
    for (const build of [ buildSheep, buildLamb ]) {
      const geometry = build(createSeededRng(23), palette)

      expect(geometry.getAttribute('color')).toBeDefined()
      expect(geometry.getAttribute('position').count).toBeGreaterThan(100)

      geometry.dispose()
    }
  })

  test('every animal is byte-for-byte stable per seed', () => {
    for (const build of [ buildSheep, buildLamb ]) {
      const first  = build(createSeededRng(606), palette)
      const second = build(createSeededRng(606), palette)

      expect(Array.from(first.getAttribute('position').array))
        .toEqual(Array.from(second.getAttribute('position').array))

      first.dispose()
      second.dispose()
    }
  })

  test('a second seed is a second animal', () => {
    const first  = buildSheep(createSeededRng(1), palette)
    const second = buildSheep(createSeededRng(2), palette)

    expect(Array.from(first.getAttribute('color').array))
      .not.toEqual(Array.from(second.getAttribute('color').array))

    first.dispose()
    second.dispose()
  })
})
