import { describe, expect, test } from 'bun:test'
import { createRockGeometry } from 'threejs-scene/modules/assets'
import { createSeededRng } from 'threejs-scene'
import { CHISEL_CUT, CHISEL_SUBDIVIDE, chisel } from './chisel.ts'


const rock = (radius: number, seed = 4) =>
  createRockGeometry({ radius, detail: 1, rng: createSeededRng(seed), roughness: 0.3 })

function farthest (geometry: ReturnType<typeof rock>): number {
  const at = geometry.getAttribute('position')
  let most = 0

  for (let index = 0; index < at.count; index += 1)
    most = Math.max(most, Math.hypot(at.getX(index), at.getY(index), at.getZ(index)))

  return most
}

describe('chisel', () => {
  test('a stone big enough to be seen is subdivided once; a small one keeps its count', () => {
    expect(chisel(rock(CHISEL_SUBDIVIDE * 2)).getAttribute('position').count).toBe(80 * 3 * 4)
    expect(chisel(rock(CHISEL_SUBDIVIDE / 2)).getAttribute('position').count).toBe(80 * 3)
    expect(chisel(rock(CHISEL_SUBDIVIDE * 2), false).getAttribute('position').count).toBe(80 * 3)
  })

  test('cuts into a stone and never grows it past its hull', () => {
    const raw  = rock(1.4)
    const hull = farthest(raw)

    expect(farthest(chisel(rock(1.4)))).toBeLessThanOrEqual(hull + 1e-6)
  })

  test('leaves flat joint faces: many facets sharing one plane', () => {
    const normal = chisel(rock(1.4, 9)).getAttribute('normal')
    const planes = new Map<string, number>()

    for (let first = 0; first < normal.count; first += 3) {
      const key = [ normal.getX(first), normal.getY(first), normal.getZ(first) ].map(v => v.toFixed(3)).join()
      planes.set(key, (planes.get(key) ?? 0) + 1)
    }

    // A weathered body has no two facets facing the same way; a joint is a
    // dozen of them, and both cuts depths sit inside the stone.
    expect(Math.max(...planes.values())).toBeGreaterThanOrEqual(6)
    expect(CHISEL_CUT[1]).toBeLessThan(1)
  })

  test('is deterministic in the rock alone, and watertight', () => {
    const a = chisel(rock(0.8, 2)).getAttribute('position').array
    const b = chisel(rock(0.8, 2)).getAttribute('position').array

    expect(Array.from(a)).toEqual(Array.from(b))

    // Every corner position is shared by at least two other corners: no torn edge.
    const seen = new Map<string, number>()
    for (let index = 0; index < a.length; index += 3) {
      const key = `${a[index].toFixed(5)},${a[index + 1].toFixed(5)},${a[index + 2].toFixed(5)}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    expect(Math.min(...seen.values())).toBeGreaterThanOrEqual(3)
  })
})
