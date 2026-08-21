import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { GLAZING, isGlazed, paneToWorld } from './glazing.ts'
import type { GlazedProp } from './glazing.ts'
import { PROPS } from './index.ts'
import { resolvePalette } from './palette.ts'


const palette = resolvePalette()

function boundsOf (name: GlazedProp): Box3 {
  const geometry = PROPS[name](createSeededRng(7_319).fork(name), palette)
  const bounds   = new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)

  geometry.dispose()

  return bounds
}

describe('the glazing table', () => {
  // The claim the whole system rests on: `buildings.ts` sets the glass in from
  // this table and `lamplight.ts` hangs the lamps from it, so a pane that is not
  // inside the building it names is a glow burning in mid-air. Stated as a fact
  // about the geometry rather than re-derived from the same numbers.
  test('puts every pane inside the building it belongs to', () => {
    for (const name of Object.keys(GLAZING) as GlazedProp[]) {
      const bounds = boundsOf(name)

      for (const pane of GLAZING[name]) {
        expect(pane.x - pane.width / 2).toBeGreaterThan(bounds.min.x)
        expect(pane.x + pane.width / 2).toBeLessThan(bounds.max.x)
        expect(pane.y - pane.height / 2).toBeGreaterThan(bounds.min.y)
        expect(pane.y + pane.height / 2).toBeLessThan(bounds.max.y)
        expect(pane.z).toBeGreaterThan(bounds.min.z)
        expect(pane.z).toBeLessThan(bounds.max.z)
      }
    }
  })

  // A pane in the middle of the floor is a lamp inside the building. The glass
  // has to be out at a wall — and the bounding box is not the wall, because a
  // roof overhang and the farmhouse's porch both reach a metre past one. So the
  // claim is the weaker true one: the pane is in the outer half of the depth the
  // building occupies on its own side.
  test('sets every pane in a wall rather than in the middle of the floor', () => {
    for (const name of Object.keys(GLAZING) as GlazedProp[]) {
      const bounds = boundsOf(name)

      for (const pane of GLAZING[name]) {
        const reach = pane.z >= 0 ? bounds.max.z : Math.abs(bounds.min.z)

        expect(Math.abs(pane.z)).toBeGreaterThan(reach * 0.5)
      }
    }
  })

  // The claim the lamps rest on, stated as a fact about the buffer rather than
  // about the table: the builder reads this table, so there is glass at every
  // position in it. A pane the geometry has nothing at is a glow on a blank wall.
  test('has glass in the geometry at every pane it names', () => {
    for (const name of Object.keys(GLAZING) as GlazedProp[]) {
      const geometry = PROPS[name](createSeededRng(7_319).fork(name), palette)
      const position = geometry.getAttribute('position')

      for (const pane of GLAZING[name]) {
        let nearest = Infinity

        for (let index = 0; index < position.count; index += 1)
          nearest = Math.min(nearest, Math.hypot(
            position.getX(index) - pane.x,
            position.getY(index) - pane.y,
            position.getZ(index) - pane.z,
          ))

        // Half the diagonal of the frame around the glass, and a little over —
        // the frame's own corners are the nearest vertices a pane ever has.
        expect(nearest).toBeLessThan(Math.hypot(pane.width + 0.22, pane.height + 0.22) * 0.5 + 0.15)
      }

      geometry.dispose()
    }
  })

  test('only claims buildings the roster actually has', () => {
    for (const name of Object.keys(GLAZING))
      expect(name in PROPS).toBe(true)

    expect(isGlazed('farmhouse')).toBe(true)
    expect(isGlazed('woodshed')).toBe(false)
  })
})

describe('carrying a pane into the world', () => {
  test('leaves an unturned building where it stands', () => {
    const pane  = { x: 2, y: 2.4, z: 3.06, width: 0.8, height: 1.1 }
    const world = paneToWorld(pane, 100, 5, -40, 0)

    expect(world.x).toBeCloseTo(102, 6)
    expect(world.y).toBeCloseTo(7.4, 6)
    expect(world.z).toBeCloseTo(-36.94, 6)

    // Local `+z` at a yaw of zero is world `+z`, which is the convention every
    // building in the kit is modelled to and the one `steading.ts` faces doors by.
    expect(world.nx).toBeCloseTo(0, 6)
    expect(world.nz).toBeCloseTo(1, 6)
  })

  test('turns a pane with its building, normal and all', () => {
    const pane  = { x: 0, y: 2, z: 3, width: 0.8, height: 1.1 }
    const world = paneToWorld(pane, 0, 0, 0, Math.PI / 2)

    expect(world.x).toBeCloseTo(3, 6)
    expect(world.z).toBeCloseTo(0, 6)
    expect(world.nx).toBeCloseTo(1, 6)
    expect(world.nz).toBeCloseTo(0, 6)
  })

  test('looks the other way out of a back wall', () => {
    const world = paneToWorld({ x: 0, y: 2, z: -3, width: 0.8, height: 1.1 }, 0, 0, 0, 0)

    expect(world.z).toBeCloseTo(-3, 6)
    expect(world.nz).toBeCloseTo(-1, 6)
  })

  test('keeps every normal a unit vector at any yaw', () => {
    for (const angle of [ 0, 0.4, 1.9, -2.7, Math.PI ]) {
      const world = paneToWorld({ x: 1, y: 2, z: 2.75, width: 0.7, height: 0.7 }, 12, 3, -8, angle)

      expect(Math.hypot(world.nx, world.nz)).toBeCloseTo(1, 6)
    }
  })

  test('halves the glass into the extents the glow is scaled by', () => {
    const world = paneToWorld({ x: 0, y: 2, z: 3, width: 0.8, height: 1.1 }, 0, 0, 0, 0)

    expect(world.halfW).toBeCloseTo(0.4, 6)
    expect(world.halfH).toBeCloseTo(0.55, 6)
  })
})
