import { describe, expect, test } from 'bun:test'
import { Box3, Vector3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { buildFarmhouse } from './buildings.ts'
import { CHAPEL_HEIGHT, CHAPEL_WINDOWS, buildChapel } from './chapel.ts'
import { resolvePalette } from './palette.ts'


const palette = resolvePalette()

type GeometryType = { getAttribute(name: string): { array: ArrayLike<number> }}

function boundsOf (geometry: GeometryType): Box3 {
  return new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)
}

describe('the chapel', () => {
  test('stands on its own sill, long axis on x, door on +z', () => {
    const geometry = buildChapel(createSeededRng(17), palette)
    const bounds   = boundsOf(geometry)

    expect(bounds.min.y).toBeGreaterThan(-0.2)
    expect(bounds.max.x - bounds.min.x).toBeGreaterThan(bounds.max.z - bounds.min.z)

    // The nave's roof overhangs both long walls equally, so the whole prop's
    // bounds say nothing about which way it faces. The *tower's* own metre does:
    // the flight of steps comes out of its `+z` face and nothing comes out of
    // the other, which is the only thing in the geometry that fixes the door.
    const position = geometry.getAttribute('position').array
    const west     = bounds.min.x + 1
    let front = 0
    let back  = 0

    for (let index = 0; index < position.length; index += 3)
      if (position[index] < west) {
        front = Math.max(front, position[index + 2])
        back  = Math.min(back, position[index + 2])
      }

    expect(front).toBeGreaterThan(-back + 0.3)

    geometry.dispose()
  })

  test('the tower stands over the west end, and the cross tops the scape', () => {
    const geometry = buildChapel(createSeededRng(17), palette)
    const bounds   = boundsOf(geometry)

    // The claim the whole building exists to make. A spire that did not clear
    // the farmhouse ridge would be a chapel nobody can pick out of a farmyard
    // from the zoom this scape is usually read at.
    const house = buildFarmhouse(createSeededRng(17), palette)

    expect(bounds.max.y).toBeCloseTo(CHAPEL_HEIGHT, 1)
    expect(bounds.max.y).toBeGreaterThan(boundsOf(house).max.y + 2.5)

    // And it is at the west end rather than over the middle of the nave: the
    // tallest geometry in the prop has to be on the `-x` half of it.
    const position = geometry.getAttribute('position').array
    const top      = new Vector3()

    for (let index = 0; index < position.length; index += 3)
      if (position[index + 1] > top.y)
        top.set(position[index], position[index + 1], position[index + 2])

    expect(top.x).toBeLessThan(-2)

    geometry.dispose()
    house.dispose()
  })

  test('every published pane is a pane the building actually has', () => {
    // The list is the survey *and* the source — `scene/windows.ts` hangs a lamp
    // on each of these, so a pane written outside the walls is light coming out
    // of thin air. Checked against the geometry's own bounds rather than
    // against the constants, which is the half of it that can drift.
    const geometry = buildChapel(createSeededRng(17), palette)
    const bounds   = boundsOf(geometry)

    expect(CHAPEL_WINDOWS.length).toBeGreaterThan(0)

    for (const pane of CHAPEL_WINDOWS) {
      expect(bounds.containsPoint(new Vector3(pane.x, pane.y, pane.z))).toBe(true)

      // Under the eaves and over the plinth. A lancet in the roof void is a
      // lamp in an attic nobody has, and one at the sill is a lamp in the
      // foundation.
      expect(pane.y - pane.height / 2).toBeGreaterThan(0.5)
      expect(pane.y + pane.height / 2).toBeLessThan(4)
    }

    geometry.dispose()
  })

  test('is deterministic for one seed and varies with another', () => {
    const first  = buildChapel(createSeededRng(9), palette)
    const second = buildChapel(createSeededRng(9), palette)
    const other  = buildChapel(createSeededRng(10), palette)

    expect(Array.from(first.getAttribute('position').array))
      .toEqual(Array.from(second.getAttribute('position').array))
    expect(Array.from(first.getAttribute('color').array))
      .not.toEqual(Array.from(other.getAttribute('color').array))

    for (const geometry of [ first, second, other ])
      geometry.dispose()
  })
})
