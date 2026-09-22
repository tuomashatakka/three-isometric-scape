import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { buildArchSpan } from './arch.ts'
import type { ArchSpanOptions } from './arch.ts'
import { resolvePalette } from './index.ts'


const palette = resolvePalette()

const SPRINGING = 1.35
const CROWN     = 3.79

/** The soffit curve the survey hands over, written out here so the test owns its shape. */
const soffitAt = (across: number): number =>
  SPRINGING + (CROWN - SPRINGING) * 0.45 * Math.sin(Math.PI * Math.min(1, Math.max(0, across)))

/** One span over a portal, in the frame the dressing hands over. */
function options (overrides: Partial<ArchSpanOptions> = {}): ArchSpanOptions {
  return {
    inner:     { x: 0, z: 0, bed: -1.1 },
    outer:     { x: 9, z: 0, bed: -4.4 },
    girth:     2.2,
    springing: SPRINGING,
    crown:     CROWN,
    soffitAt,
    blocks:    9,
    water:     -1.25,
    rng:       createSeededRng(23),
    palette,
    ...overrides,
  }
}

function bounds (geometry: ReturnType<typeof buildArchSpan>): Box3 {
  return new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)
}

describe('the sea arch', () => {
  test('it is a mergeable, vertex-coloured geometry', () => {
    const geometry = buildArchSpan(options())

    expect(geometry.index).toBeNull()
    for (const attribute of [ 'position', 'normal', 'uv', 'color' ])
      expect(geometry.getAttribute(attribute)).toBeDefined()

    geometry.dispose()
  })

  // The claim, as a fact about the vertices rather than about the intention:
  // the whole landform exists because a height field cannot leave a hole, so a
  // span whose rock reaches down into the water under it is a span that did not
  // need to be geometry. Stated against the tide rather than against the soffit
  // curve, because the curve is what was *asked* for and a deformed icosahedron
  // wanders a third of its own radius either side of what it was given — what
  // has to hold is that the sea still runs through at the top of the biggest
  // tide of the year.
  test('the opening is empty: nothing over it reaches the high spring tide', () => {
    const geometry = buildArchSpan(options())
    const position = geometry.getAttribute('position')
    const springs  = -1.25 + 0.4
    const run      = 9

    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index)

      // Only the rock over the hole — the legs themselves stand in the water at
      // either end, which is what holds the span up.
      if (x <= 2.6 || x >= run - 2.6)
        continue

      expect(position.getY(index)).toBeGreaterThan(springs)
    }

    geometry.dispose()
  })

  test('it reaches the bed under both legs and stops at the crown', () => {
    const box = bounds(buildArchSpan(options()))

    expect(box.min.y).toBeLessThanOrEqual(-4.4)
    expect(box.max.y).toBeGreaterThan(CROWN - 0.6)
    expect(box.max.y).toBeLessThan(CROWN + 1.4)
  })

  test('it spans the portal it was handed, and no more', () => {
    const box = bounds(buildArchSpan(options()))

    expect(box.min.x).toBeLessThan(0)
    expect(box.max.x).toBeGreaterThan(9)
    expect(box.max.x - box.min.x).toBeLessThan(9 + 2.2 * 2 + 3)
  })

  test('the tier only changes how coarse it is, not where it is', () => {
    const coarse = bounds(buildArchSpan(options({ blocks: 5, rng: createSeededRng(23) })))
    const fine   = bounds(buildArchSpan(options({ blocks: 12, rng: createSeededRng(23) })))

    expect(coarse.max.y).toBeCloseTo(fine.max.y, 0)
    expect(coarse.min.x).toBeCloseTo(fine.min.x, 4)
  })

  test('it is the same rock every time, for one seed', () => {
    const first  = buildArchSpan(options({ rng: createSeededRng(5) })).getAttribute('position').array
    const second = buildArchSpan(options({ rng: createSeededRng(5) })).getAttribute('position').array

    expect(first.length).toBe(second.length)
    expect(Array.from(first)).toEqual(Array.from(second))
  })

  test('a leg whose foot stands above mean water gets no wrack band', () => {
    const dry = buildArchSpan(options({ outer: { x: 9, z: 0, bed: 0.4 }, water: -1.25 }))
    const wet = buildArchSpan(options())

    expect(dry.getAttribute('position').count).toBeLessThan(wet.getAttribute('position').count)

    dry.dispose()
    wet.dispose()
  })
})
