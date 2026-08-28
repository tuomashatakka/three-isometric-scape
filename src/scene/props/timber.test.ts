import { describe, expect, test } from 'bun:test'
import type { BufferGeometry } from 'three'
import { createSeededRng } from 'threejs-scene'
import {
  BARN_WINDOWS,
  FARMHOUSE_WINDOWS,
  SAUNA_WINDOWS,
  buildBarn,
  buildFarmhouse,
  buildSauna,
} from './buildings.ts'
import type { WindowPane } from './buildings.ts'
import { CHAPEL_WINDOWS, buildChapel } from './chapel.ts'
import { resolvePalette } from './palette.ts'
import {
  WINDOW_FRAME_PROUD,
  WINDOW_GLASS_PROUD,
  dormer,
  gableEnd,
  gabledRoof,
  monoRoof,
  roofUnderside,
} from './timber.ts'


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


/**
 * The claim every window in the scape quietly failed for two runs.
 *
 * A window here is not a hole. The kit has no holes: a wall is a slab of
 * cladding and a window is drawn onto the face of it, so the surround and the
 * glass both have to stand *proud* of that face — and the pane table is read as
 * saying where the face is.
 *
 * When the surround was one solid slab covering the whole opening, the glass sat
 * 0.07 m behind its own front face and no camera in the scape could see a pane of
 * glass anywhere in the archipelago. Nothing failed: a window with no glass in it
 * looks exactly like a window from twenty metres away, which is the only distance
 * anything had ever looked from.
 *
 * So the claim is stated where it cannot hide — as a fact about the built
 * geometry, for every published pane in the kit at once. Standing at the middle
 * of a pane and looking straight at it, the nearest surface of the building is
 * the glass. If a later run thickens a wall, moves a plank or writes a pane table
 * at the wall's centre instead of its face, this is what says so.
 */
/**
 * The nearest surface to the eye at one point of a wall, looking along the
 * pane's own outward normal.
 *
 * A triangle counts when its footprint in the wall's plane covers the point.
 * The bounding box is enough for that here: everything in this kit that can
 * stand in front of a pane is an axis-aligned box.
 */
function outermostAt (geometry: BufferGeometry, pane: WindowPane): [number, number] {
  const points = geometry.getAttribute('position').array as ArrayLike<number>
  const colors = geometry.getAttribute('color').array as ArrayLike<number>
  const along  = pane.axis === 'x'
  const across = along ? pane.z : pane.x

  let face  = -Infinity
  let level = 1

  for (let corner = 0; corner < points.length; corner += 9) {
    let low    = Infinity
    let high   = -Infinity
    let lowUp  = Infinity
    let highUp = -Infinity
    let out    = -Infinity

    for (let step = 0; step < 3; step += 1) {
      const base = corner + step * 3
      const side = along ? points[base + 2] : points[base]

      low    = Math.min(low, side)
      high   = Math.max(high, side)
      lowUp  = Math.min(lowUp, points[base + 1])
      highUp = Math.max(highUp, points[base + 1])
      out    = Math.max(out, (along ? points[base] : points[base + 2]) * pane.facing)
    }

    if (across < low || across > high || pane.y < lowUp || pane.y > highUp || out <= face)
      continue

    face  = out
    level = Math.max(colors[corner], colors[corner + 1], colors[corner + 2])
  }

  return [ face, level ]
}

describe('a window is a hole with glass in it', () => {
  const glazed = [
    [ 'farmhouse', buildFarmhouse, FARMHOUSE_WINDOWS ],
    [ 'barn', buildBarn, BARN_WINDOWS ],
    [ 'sauna', buildSauna, SAUNA_WINDOWS ],
    [ 'chapel', buildChapel, CHAPEL_WINDOWS ],
  ] as const

  test.each(glazed)('%s: every pane is glass the eye can reach', (_name, build, panes) => {
    const geometry = build(rng(), palette)

    expect(panes.length).toBeGreaterThan(0)

    for (const pane of panes) {
      const [ face, level ] = outermostAt(geometry, pane)
      const wall            = (pane.axis === 'x' ? pane.x : pane.z) * pane.facing

      // Dark. Every wall colour in the kit — falu red, limewash, tarred board,
      // shingle — is far brighter than the glass, so this is what separates
      // "the pane is visible" from "something else is standing in front of it".
      expect(level).toBeLessThan(0.2)

      // And it is where the glass was asked to be: proud of the wall the pane
      // table names, by the width of the pane's own slab and no more.
      expect(face).toBeGreaterThan(wall)
      expect(face - wall).toBeCloseTo(WINDOW_GLASS_PROUD, 2)
    }

    geometry.dispose()
  })

  test('the surround stands proud of the glass, which is what makes a reveal', () => {
    expect(WINDOW_FRAME_PROUD).toBeGreaterThan(WINDOW_GLASS_PROUD)
  })
})
