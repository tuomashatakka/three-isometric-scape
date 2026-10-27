import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { HJELL_BEARER, HJELL_CLEARING, HJELL_LOWER_RAIL } from '../landscape/hjell.ts'
import { buildHjellRun, buildStockfish } from './hjell.ts'
import { resolvePalette } from './palette.ts'


const palette = resolvePalette()

/** Six bays of rack on ground that falls a metre from end to end. */
function stations (fall = 1): { x: number, z: number, level: number }[] {
  return Array.from({ length: 7 }, (_, index) => ({
    x:     index * 2.6,
    z:     0,
    level: 4 - index / 6 * fall,
  }))
}

function run (over: Record<string, unknown> = {}) {
  const laid = (over.stations as ReturnType<typeof stations>) ?? stations()

  return buildHjellRun({
    stations: laid,
    angle:    0,
    deck:     Math.max(...laid.map(station => station.level)) + 2.3,
    height:   2.3,
    lower:    HJELL_LOWER_RAIL,
    bearer:   HJELL_BEARER,
    rng:      createSeededRng(91),
    palette,
    ...over,
  })
}

type GeometryType = { getAttribute(name: string): { array: ArrayLike<number> }}

function bounds (geometry: GeometryType): Box3 {
  return new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)
}


describe('the hjell run', () => {
  test('it is one geometry, vertex-coloured, and finite everywhere', () => {
    const geometry = run()

    for (const name of [ 'position', 'normal', 'uv', 'color' ]) {
      const attribute = geometry.getAttribute(name)

      expect(attribute).toBeDefined()
      expect((attribute.array as Float32Array).every(Number.isFinite)).toBe(true)
    }

    expect(geometry.index).toBeNull()
    geometry.dispose()
  })

  test('it refuses a run with nothing to span', () => {
    expect(() => run({ stations: []})).toThrow()
    expect(() => run({ stations: stations().slice(0, 1) })).toThrow()
  })

  /**
   * The claim the structure makes, as a fact about the vertices: the rails are
   * level, so the top of the timber is one height however the ground under it
   * falls. A rack whose head followed the slope would have been invisible in
   * every still taken from above, which is most of them.
   */
  test('the head of the run is level however far the ground falls', () => {
    // Both runs crest at the same foot, so both are handed the same deck. What
    // differs is how far the ground gets away underneath them.
    const flat = bounds(run({ stations: stations(0) }))
    const bank = bounds(run({ stations: stations(1.8) }))

    expect(bank.max.y).toBeCloseTo(flat.max.y, 1)
    expect(flat.min.y - bank.min.y).toBeCloseTo(1.8, 1)
  })

  test('every leg is driven into the ground it stands on', () => {
    const laid = stations(1.8)

    expect(bounds(run({ stations: laid })).min.y).toBeLessThan(laid[6]!.level)
  })

  /**
   * The claim the survey makes on the scatter, checked against the timber that
   * actually gets built rather than against a number somebody remembered. A
   * clearing cut too tight is a juniper growing out of a trestle, and it is the
   * sort of thing nobody notices until a run retunes the splay.
   */
  test('the timber fits inside the ground the survey reserves for it', () => {
    const box = bounds(run({ stations: stations(0) }))

    // The run is laid along +x by `stations`, so what has to fit inside the
    // clearing is its width across z.
    expect(Math.max(Math.abs(box.min.z), Math.abs(box.max.z))).toBeLessThan(HJELL_CLEARING)
  })

  test('it grows with the line it is given', () => {
    const six   = bounds(run())
    const three = bounds(run({ stations: stations().slice(0, 4) }))

    expect(six.max.x - six.min.x).toBeGreaterThan(three.max.x - three.min.x + 7)
  })

  test('it is deterministic for one seed', () => {
    const first  = run()
    const second = run()

    expect(Array.from(first.getAttribute('position').array))
      .toEqual(Array.from(second.getAttribute('position').array))

    first.dispose()
    second.dispose()
  })
})

describe('the stockfish', () => {
  test('it hangs from the origin rather than standing on it', () => {
    const geometry = buildStockfish(createSeededRng(5), palette)
    const box      = bounds(geometry)

    // Only the fold of the nape stands over the rail, and it has to: the roster
    // holds every prop to `max.y > 0`, and a fish entirely under its own origin
    // passes its own test and fails that one.
    expect(box.max.y).toBeGreaterThan(0)
    expect(box.max.y).toBeLessThan(0.05)
    expect(box.min.y).toBeLessThan(-0.3)

    // The roster's own floor. A fish that hung deeper than this would pass its
    // own test and fail the one in `props.test.ts` that holds every prop to a
    // common frame.
    expect(box.min.y).toBeGreaterThan(-0.75)

    geometry.dispose()
  })

  test('it falls open into a V rather than hanging flat', () => {
    const geometry = buildStockfish(createSeededRng(5), palette)
    const box      = bounds(geometry)

    // Wider across the fold at the bottom than the nape is thick at the top.
    expect(box.max.z - box.min.z).toBeGreaterThan(0.08)
    expect(box.max.y - box.min.y).toBeGreaterThan(box.max.z - box.min.z)

    geometry.dispose()
  })

  test('it is deterministic for one seed and varies with another', () => {
    const first = buildStockfish(createSeededRng(5), palette)
    const same  = buildStockfish(createSeededRng(5), palette)
    const other = buildStockfish(createSeededRng(6), palette)

    expect(Array.from(first.getAttribute('position').array))
      .toEqual(Array.from(same.getAttribute('position').array))
    expect(Array.from(first.getAttribute('position').array))
      .not.toEqual(Array.from(other.getAttribute('position').array))

    for (const geometry of [ first, same, other ])
      geometry.dispose()
  })
})
