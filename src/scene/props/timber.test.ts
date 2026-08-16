import { describe, expect, test } from 'bun:test'
import type { BufferGeometry } from 'three'
import { createSeededRng } from 'threejs-scene'
import { resolvePalette } from './palette.ts'
import { dormer, gableEnd, gabledRoof, monoRoof, roofUnderside } from './timber.ts'


/**
 * The roof-plane contract.
 *
 * This is the file that stops the scape's longest-lived visual bug from coming
 * back. Every gabled building used to describe its roof twice — once as a pitch
 * from the overhang tip, once as a stack of shrinking courses — and the two
 * descriptions disagreed by up to 0.66 m, which showed up in play as dark red
 * blocks scattered across the shingles of the farmhouse and the barn.
 *
 * So the assertions here are not about how a gable *looks*. They are about the
 * one thing that has to stay true no matter what anyone changes: a gable end
 * lies under the roof plane, and the roof plane lands on the wall head.
 */

const palette = resolvePalette()
const rng     = (): ReturnType<typeof createSeededRng> => createSeededRng(11)
const EPSILON = 1e-6

function positions (geometry: BufferGeometry): [number, number, number][] {
  const array                           = geometry.getAttribute('position').array as ArrayLike<number>
  const out: [number, number, number][] = []

  for (let i = 0; i < array.length; i += 3)
    out.push([ array[i], array[i + 1], array[i + 2] ])

  return out
}

describe('the roof plane', () => {
  const roof = { eaveY: 3.9, peakY: 6.3, halfDepth: 3 }

  test('it reads eave at the wall face and peak at the ridge', () => {
    expect(roofUnderside(roof, 0)).toBeCloseTo(6.3, 9)
    expect(roofUnderside(roof, 3)).toBeCloseTo(3.9, 9)
    expect(roofUnderside(roof, -3)).toBeCloseTo(3.9, 9)

    // Valid past the wall too — the overhang is on the same plane, which is the
    // whole reason the overhang is not part of the plane's definition.
    expect(roofUnderside(roof, 3.45)).toBeCloseTo(3.54, 9)
  })

  test('a gable end fits exactly under it, and never through it', () => {
    const parts: BufferGeometry[] = []
    gableEnd(parts, rng(), palette.faluDark, { ...roof, thick: 0.22, at: 4.5 })

    const points = positions(parts[0])

    for (const [ , y, z ] of points)
      expect(y).toBeLessThanOrEqual(roofUnderside(roof, z) + EPSILON)

    const ys = points.map(([ , y ]) => y)
    const zs = points.map(([ , , z ]) => z)

    // It fills the wall head to head and eave to ridge — a gable that merely
    // avoids poking through by being small leaves a hole instead.
    expect(Math.min(...ys)).toBeCloseTo(roof.eaveY, 6)
    expect(Math.max(...ys)).toBeCloseTo(roof.peakY, 6)
    expect(Math.min(...zs)).toBeCloseTo(-roof.halfDepth, 6)
    expect(Math.max(...zs)).toBeCloseTo(roof.halfDepth, 6)
  })

  test('a gable end on a z ridge fits the same way, with x and z swapped', () => {
    const parts: BufferGeometry[] = []
    gableEnd(parts, rng(), palette.tarWood, { ...roof, thick: 0.16, at: 2.7, ridge: 'z' })

    const points = positions(parts[0])

    for (const [ x, y ] of points)
      expect(y).toBeLessThanOrEqual(roofUnderside(roof, x) + EPSILON)

    const xs = points.map(([ x ]) => x)

    expect(Math.min(...xs)).toBeCloseTo(-roof.halfDepth, 6)
    expect(Math.max(...xs)).toBeCloseTo(roof.halfDepth, 6)
  })

  test('it costs twelve triangles, not forty-eight', () => {
    const parts: BufferGeometry[] = []
    gableEnd(parts, rng(), palette.faluDark, { ...roof, thick: 0.22, at: 0 })

    // Three side quads and two caps. The four stacked boxes this replaced were
    // four times the geometry for a silhouette that did not close.
    expect(positions(parts[0]).length / 3).toBe(12)
  })

  test('a roof lands on the wall head rather than floating above it', () => {
    const parts: BufferGeometry[] = []

    gabledRoof(parts, rng(), palette.shingle, palette.shingleWorn, { ...roof, length: 9.9, overhang: 0.45 })

    // Read the slabs against the plane rather than against one expected corner
    // height: a slab's lowest *vertex* is pulled in from the overhang tip by
    // half its thickness, so a corner-height expectation would encode the slab
    // thickness into a test about where the roof sits.
    const clearance = positions(parts[0]).map(([ , y, z ]) => y - roofUnderside(roof, z))

    // Nothing below the plane, and the underside actually on it — which is the
    // pair of facts that used to be one fact short. Placing the slabs by their
    // centre-line lifted the whole roof half a slab, measured vertically, and
    // that gap was the slot of daylight under every eave in the scape.
    expect(Math.min(...clearance)).toBeGreaterThan(-EPSILON)
    expect(Math.min(...clearance)).toBeLessThan(EPSILON)
  })

  test('a single pitch touches both of the eaves it is carried on', () => {
    const frontY                  = 2.4
    const backY                   = 3
    const halfDepth               = 1.3
    const parts: BufferGeometry[] = []

    monoRoof(parts, rng(), palette.shingle, { length: 4.6, frontY, backY, halfDepth, overhang: 0.3 })

    const fall      = (backY - frontY) / (halfDepth * 2)
    const under     = (z: number): number => (frontY + backY) / 2 - fall * z
    const clearance = positions(parts[0]).map(([ , y, z ]) => y - under(z))

    expect(Math.min(...clearance)).toBeGreaterThan(-EPSILON)
    expect(Math.min(...clearance)).toBeLessThan(EPSILON)
  })
})

describe('a dormer', () => {
  const roof = { eaveY: 3.9, peakY: 6.3, halfDepth: 3 }

  function build (rise: number): [number, number, number][] {
    const parts: BufferGeometry[] = []

    dormer(parts, rng(), palette.faluDark, palette.shingleWorn, palette.shingle, palette.trimWhite, palette.glass, {
      roof, at: 1.5, width: 1.5, depth: 1.2, height: 0.75, rise,
    })

    return parts.flatMap(positions)
  }

  test('its skirt buries itself in the pitch without dangling through it', () => {
    const front  = roofUnderside(roof, 2.1)
    const lowest = Math.min(...build(0.5).map(([ , y ]) => y))

    // It has to run down past the shingle surface or a seam opens at the joint,
    // and it has to stop close under the soffit or it hangs into the attic. A
    // fixed skirt could not do both, because how far the slab reaches below its
    // own surface depends on the pitch it is lying on.
    expect(lowest).toBeLessThan(front)
    expect(lowest).toBeGreaterThan(front - 0.15)
  })

  test('it never out-tops the roof it is set into, however greedy the ask', () => {
    // A dormer whose ridge clears the main ridge is a second storey. The clamp
    // has to cover the dormer's own shingles and cap too, not just the ridge
    // line they sit on — which is why it is 0.3 m and not a hair.
    for (const rise of [ 0.3, 0.5, 2, 20 ])
      expect(Math.max(...build(rise).map(([ , y ]) => y))).toBeLessThan(roof.peakY)
  })
})
