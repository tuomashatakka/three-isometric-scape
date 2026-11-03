import { describe, expect, test } from 'bun:test'
import type { BufferGeometry } from 'three'
import { BoxGeometry } from 'three'
import { createSeededRng } from 'threejs-scene'
import { createRockGeometry, part } from 'threejs-scene/modules/assets'
import { resolvePalette } from './palette.ts'
import { soften } from './soften.ts'
import { buildErratic, buildTalusBlock, STONE_CREASE, stonePart } from './stone.ts'


const palette = resolvePalette()

/**
 * How many corner pairs at one point disagree on their normal by more than
 * ~0.5°, against how many there are: the share of the stone's edges that are
 * still drawn as edges.
 */
function hardShare (geometry: BufferGeometry): number {
  const position = geometry.getAttribute('position')
  const normal   = geometry.getAttribute('normal')
  const points   = new Map<string, number[]>()

  for (let corner = 0; corner < position.count; corner += 1) {
    const key = [ position.getX(corner), position.getY(corner), position.getZ(corner) ]
      .map(value => Math.round(value * 1e4)).join()

    points.set(key, [ ...points.get(key) ?? [], corner ])
  }

  let hard  = 0
  let pairs = 0

  for (const point of points.values())
    for (let a = 0; a < point.length; a += 1)
      for (let b = a + 1; b < point.length; b += 1) {
        const agree = normal.getX(point[a]) * normal.getX(point[b]) +
          normal.getY(point[a]) * normal.getY(point[b]) +
          normal.getZ(point[a]) * normal.getZ(point[b])

        pairs += 1
        if (agree < 0.99996)
          hard += 1
      }

  return hard / pairs
}

describe('a stone, worn rather than cut', () => {
  test('a rolled stone shades round: at most one edge in ten is drawn, its sharpest joints', () => {
    const raw  = part(createRockGeometry({ radius: 0.6, detail: 1, rng: createSeededRng(4), roughness: 0.26 }))
    const worn = stonePart(createRockGeometry({ radius: 0.6, detail: 1, rng: createSeededRng(4), roughness: 0.26 }), {})

    expect(hardShare(raw)).toBeGreaterThan(0.95)
    expect(hardShare(worn)).toBeLessThan(0.1)
  })

  test('a fresh block keeps the joints it split along', () => {
    expect(hardShare(buildTalusBlock(createSeededRng(9), palette))).toBeGreaterThan(0.5)
  })

  test('a cube keeps every edge: 90° is past any crease a stone uses', () => {
    const normal = soften(part(new BoxGeometry(1, 1, 1)), STONE_CREASE).getAttribute('normal')

    // Every corner still points straight out of its own face.
    for (let corner = 0; corner < normal.count; corner += 1)
      expect(Math.max(Math.abs(normal.getX(corner)), Math.abs(normal.getY(corner)), Math.abs(normal.getZ(corner))))
        .toBeCloseTo(1, 6)
  })

  test('the facet colours grade across the stone instead of jumping', () => {
    const worn  = buildErratic(createSeededRng(3), palette)
    const color = worn.getAttribute('color')
    let jumps    = 0

    // The three corners of a raw facet are one colour; on a worn stone they
    // differ, because each corner is the average of the facets around it.
    for (let first = 0; first < color.count; first += 3)
      if (Math.abs(color.getX(first) - color.getX(first + 1)) < 1e-6 &&
        Math.abs(color.getX(first) - color.getX(first + 2)) < 1e-6)
        jumps += 1

    expect(jumps / (color.count / 3)).toBeLessThan(0.2)
  })

  test('triangles are unchanged, normals stay unit, and it is deterministic', () => {
    const first  = buildErratic(createSeededRng(11), palette)
    const second = buildErratic(createSeededRng(11), palette)
    const normal = first.getAttribute('normal')

    expect(first.getAttribute('normal').array).toEqual(second.getAttribute('normal').array)
    expect(first.getAttribute('color').array).toEqual(second.getAttribute('color').array)

    for (let corner = 0; corner < normal.count; corner += 1)
      expect(Math.hypot(normal.getX(corner), normal.getY(corner), normal.getZ(corner))).toBeCloseTo(1, 5)
  })

  test('the rng is consumed exactly as the bare rock and part were', () => {
    const bare = createSeededRng(21)
    const worn = createSeededRng(21)

    // The placement draws from the rng too, so the order of the two matters.
    part(createRockGeometry({ radius: 0.3, detail: 0, rng: bare }), { rotate: [ 0, bare.next(), 0 ], rng: bare })
    stonePart(createRockGeometry({ radius: 0.3, detail: 0, rng: worn }), { rotate: [ 0, worn.next(), 0 ], rng: worn })

    expect(worn.next()).toBe(bare.next())
  })

  test('refuses an indexed geometry rather than shading it wrongly', () => {
    expect(() => soften(new BoxGeometry(1, 1, 1), STONE_CREASE)).toThrow()
  })
})
