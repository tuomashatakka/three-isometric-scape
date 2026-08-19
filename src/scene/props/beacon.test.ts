import { describe, expect, test } from 'bun:test'
import { Box3, Vector3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { BEACON_FOOTING } from '../landscape/beacon.ts'
import { LANTERN_HEIGHT, buildBeaconOptic, buildLighthouse } from './beacon.ts'
import { resolvePalette } from './palette.ts'


const palette = resolvePalette()

type GeometryType = { getAttribute(name: string): { array: ArrayLike<number> }}

function boundsOf (geometry: GeometryType): Box3 {
  return new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)
}

describe('the lighthouse', () => {
  test('stands on its base and carries the lamp inside the lantern room', () => {
    const geometry = buildLighthouse(createSeededRng(7_319), palette)
    const bounds   = boundsOf(geometry)

    expect(bounds.min.y).toBeGreaterThan(-0.3)

    // The lamp is the height `landscape/index.ts` hangs the glow at. Above the
    // gallery and below the cap is the whole requirement, and it is the one that
    // silently breaks when a course height changes.
    expect(LANTERN_HEIGHT).toBeGreaterThan(bounds.max.y * 0.7)
    expect(LANTERN_HEIGHT).toBeLessThan(bounds.max.y - 1)

    geometry.dispose()
  })

  test('is the tallest thing in the settlement, and still inside the roster scale', () => {
    const geometry = buildLighthouse(createSeededRng(7_319), palette)
    const bounds   = boundsOf(geometry)

    expect(bounds.max.y).toBeGreaterThan(10)
    expect(bounds.max.y).toBeLessThan(14)

    geometry.dispose()
  })

  test('every stone of it is inside the footing the survey reserved', () => {
    const geometry = buildLighthouse(createSeededRng(7_319), palette)
    const position = geometry.getAttribute('position')

    for (let index = 0; index < position.count; index += 1)
      expect(Math.hypot(position.getX(index), position.getZ(index)))
        .toBeLessThanOrEqual(BEACON_FOOTING)

    geometry.dispose()
  })

  test('is byte-for-byte the same tower for one seed', () => {
    const first  = buildLighthouse(createSeededRng(11), palette)
    const second = buildLighthouse(createSeededRng(11), palette)

    expect(Array.from(first.getAttribute('position').array))
      .toEqual(Array.from(second.getAttribute('position').array))

    first.dispose()
    second.dispose()
  })
})

describe('the optic', () => {
  const options = { blades: 3, reach: 80, spread: 5 }

  test('throws one beam per panel, on evenly spread bearings', () => {
    const geometry = buildBeaconOptic(createSeededRng(3), palette, options)
    const position = geometry.getAttribute('position')
    const wanted   = [ 0, 120, -120 ]
    const found    = new Set<number>()

    // The far end of a beam is a five-sided ring around its axis, so every
    // vertex out there sits a few degrees either side of the bearing rather than
    // exactly on it. What the test states is the bearings themselves: each one is
    // reached, and nothing is thrown anywhere else.
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index)
      const z = position.getZ(index)

      if (Math.hypot(x, z) < options.reach * 0.9)
        continue

      const bearing = Math.atan2(x, z) * 180 / Math.PI
      const nearest = wanted
        .map(angle => ({ angle, off: Math.abs((bearing - angle + 540) % 360 - 180) }))
        .reduce((best, next) => next.off < best.off ? next : best)

      expect(nearest.off).toBeLessThan(6)
      found.add(nearest.angle)
    }

    expect(found.size).toBe(options.blades)
  })

  test('reaches exactly as far as it was asked to, level with the lamp', () => {
    const geometry = buildBeaconOptic(createSeededRng(3), palette, options)
    const position = geometry.getAttribute('position')
    const size     = boundsOf(geometry).getSize(new Vector3())
    let furthest   = 0

    for (let index = 0; index < position.count; index += 1)
      furthest = Math.max(furthest, Math.hypot(
        position.getX(index),
        position.getY(index),
        position.getZ(index),
      ))

    // The tips land at the reach; the rings around them are a spread further out
    // along their own radius, and nothing is above or below the lamp by more.
    expect(furthest).toBeCloseTo(Math.hypot(options.reach, options.spread), 1)
    expect(size.y).toBeLessThan(options.spread * 2 + 0.1)

    geometry.dispose()
  })

  test('fades out along the beam, so it has no lit end', () => {
    const geometry = buildBeaconOptic(createSeededRng(3), palette, options)
    const position = geometry.getAttribute('position')
    const color    = geometry.getAttribute('color')
    let atLamp  = 0
    let atReach = 1

    for (let index = 0; index < color.count; index += 1) {
      const distance = Math.hypot(position.getX(index), position.getY(index), position.getZ(index))

      if (distance < 0.7)
        atLamp = Math.max(atLamp, color.getX(index))

      if (distance > options.reach * 0.98)
        atReach = Math.min(atReach, color.getX(index))
    }

    expect(atLamp).toBeGreaterThan(0.4)
    expect(atReach).toBeLessThan(0.02)

    geometry.dispose()
  })

  test('is brightest along its axis and dark at its edges', () => {
    // One panel, so the axis is `+z` and the offset across the beam is `x`.
    const geometry = buildBeaconOptic(createSeededRng(3), palette, { ...options, blades: 1 })
    const position = geometry.getAttribute('position')
    const color    = geometry.getAttribute('color')
    let onAxis = 0
    let atEdge = 0

    // The claim the crossed fans exist to make: a beam has a middle. Sampled a
    // quarter of the way out, where the grade down the length has taken little
    // off yet, so what is left in the difference is the grade across the width.
    for (let index = 0; index < color.count; index += 1) {
      const along  = position.getZ(index)
      const across = Math.abs(position.getX(index))

      if (along < options.reach * 0.2 || along > options.reach * 0.3 || Math.abs(position.getY(index)) > 0.01)
        continue

      if (across < 0.2)
        onAxis = Math.max(onAxis, color.getX(index))

      if (across > options.spread * along / options.reach * 0.9)
        atEdge = Math.max(atEdge, color.getX(index))
    }

    expect(onAxis).toBeGreaterThan(0.2)
    expect(atEdge).toBeLessThan(onAxis * 0.4)

    geometry.dispose()
  })

  test('a tier with no panels still lights the lantern', () => {
    const geometry = buildBeaconOptic(createSeededRng(3), palette, { ...options, blades: 0 })
    const bounds   = boundsOf(geometry)

    expect(bounds.max.x).toBeLessThan(1)
    expect(bounds.max.y).toBeGreaterThan(0.5)

    geometry.dispose()
  })
})
