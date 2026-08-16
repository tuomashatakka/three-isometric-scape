import { describe, expect, test } from 'bun:test'
import { Material, Mesh, Vector3 } from 'three'
import type { BufferAttribute } from 'three'
import { createSeededRng } from 'threejs-scene'
import { buildProp, resolvePalette } from './index.ts'
import { Ploppable, baseFootprint } from './ploppable.ts'
import type { Footprint } from './ploppable.ts'


const palette = resolvePalette()

/** The buildings that go through `raiseBuilding`, and so grow a foundation. */
const RAISED = [ 'farmhouse', 'barn', 'aitta', 'woodshed', 'sauna', 'meadowBarn' ] as const

const build = (name: typeof RAISED[number]) =>
  buildProp(name, createSeededRng(7_319).fork(`hero-${name}`), palette)


describe('the footprint a building stands on', () => {
  test('it is the base, never the roof over it', () => {
    for (const name of RAISED) {
      const geometry = build(name)

      geometry.computeBoundingBox()

      const bounds = geometry.boundingBox!
      const base   = baseFootprint(geometry)

      // Every one of these overhangs its own sill somewhere. The footprint that
      // grows the plinth has to be the smaller of the two, or the plinth stands
      // outside the wall it is supposed to be under.
      expect(base.halfW).toBeLessThanOrEqual((bounds.max.x - bounds.min.x) * 0.5 + 1e-6)
      expect(base.halfD).toBeLessThanOrEqual((bounds.max.z - bounds.min.z) * 0.5 + 1e-6)
      expect(base.halfW).toBeGreaterThan(0)
      expect(base.halfD).toBeGreaterThan(0)
    }
  })

  test('it carries its own centre, because a prop is not symmetric about its origin', () => {
    // The barn's extent sits the better part of a metre off in z. A footprint
    // that assumed the origin was the middle hung the plinth over one sill and
    // left the opposite one standing on air.
    const offset = RAISED.map(name => Math.abs(baseFootprint(build(name)).z))

    expect(Math.max(...offset)).toBeGreaterThan(0.1)
  })

  test('a geometry with nothing at its base still answers with a square', () => {
    const empty = build('barn').clone()

    empty.deleteAttribute('position')
    empty.setAttribute('position', build('barn').getAttribute('position')
      .clone())

    expect(baseFootprint(empty).halfW).toBeGreaterThan(0)
  })
})


describe('the foundation band', () => {
  const flat: Footprint = { x: 0, z: 0, halfW: 2, halfD: 1.5 }

  /**
   * Raise one on ground of a known shape and hand back its foundation's
   * vertices. The skirt is only built when a material is given, and nothing
   * here draws, so a bare `Material` stands in for the scape's ground one.
   */
  function foundation (ground: (x: number, z: number) => number): BufferAttribute {
    const prop = new Ploppable('test', ground)

    prop.plop(0, 0, { footprint: flat, skirt: new Material() })

    const mesh = prop.getObjectByName('test-foundation')

    expect(mesh).toBeInstanceOf(Mesh)

    return (mesh as Mesh).geometry.getAttribute('position') as BufferAttribute
  }

  test('every face points away from the building, not into it', () => {
    // This is the bug that put a building on nothing: wound the other way, the
    // whole plinth is back-facing, and the scape's ground material culls it.
    // `flatShading` means the winding is also what lights it, so the normal
    // attribute cannot rescue a reversed quad.
    const position = foundation(() => 0)

    for (let triangle = 0; triangle < position.count / 3; triangle += 1) {
      const index = triangle * 3
      const a     = new Vector3(position.getX(index), position.getY(index), position.getZ(index))
      const b     = new Vector3(position.getX(index + 1), position.getY(index + 1), position.getZ(index + 1))
      const c     = new Vector3(position.getX(index + 2), position.getY(index + 2), position.getZ(index + 2))

      const normal = new Vector3().subVectors(b, a)
        .cross(new Vector3().subVectors(c, a))
        .normalize()

      // The centroid's horizontal offset from the middle of the footprint is
      // the direction "outward" means for this face.
      const outward = new Vector3(
        (a.x + b.x + c.x) / 3 - flat.x,
        0,
        (a.z + b.z + c.z) / 3 - flat.z,
      ).normalize()

      expect(normal.dot(outward)).toBeGreaterThan(0)
    }
  })

  test('its lower edge follows the ground it is standing on', () => {
    // A slope of one in four across the footprint. The band has to reach the
    // low side, or the building hovers over the dip the plinth exists to fill.
    const slope    = (x: number): number => x * 0.25
    const position = foundation(slope)

    let worst = 0

    for (let index = 0; index < position.count; index += 1) {
      const y = position.getY(index)

      // Skip the constant top edge; only the lower one tracks the ground.
      if (y > 0.2)
        continue

      // World height of this sample, against the ground under it.
      const floor = slope(flat.halfW)

      worst = Math.max(worst, y + floor - slope(position.getX(index)))
    }

    // Never left standing above the ground it meets — the whole point of it.
    expect(worst).toBeLessThanOrEqual(0)
  })
})
