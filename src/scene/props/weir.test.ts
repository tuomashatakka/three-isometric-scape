import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import type { BufferGeometry } from 'three'
import { createSeededRng } from 'threejs-scene'
import { resolvePalette } from './index.ts'
import { buildWeirRun } from './weir.ts'
import type { WeirRunOptions } from './weir.ts'


const palette = resolvePalette()

/** A flat bed a hand's breadth under mean water, the way the dressing hands it over. */
const BED = -0.1

/** A leader out along `+x` and a three-quarter ring at the end of it. */
function options (overrides: Partial<WeirRunOptions> = {}): WeirRunOptions {
  const head  = { x: 14, z: 0 }
  const pound = Array.from({ length: 13 }, (_, step) => {
    const around = Math.PI + Math.PI / 4 + step / 12 * (Math.PI * 1.5)

    return { x: head.x + Math.cos(around) * 4, z: head.z + Math.sin(around) * 4 }
  })

  return {
    leader:   Array.from({ length: 15 }, (_, step) => ({ x: step, z: 0 })),
    pound,
    heightAt: () => BED,
    height:   0.34,
    width:    1.8,
    spacing:  0.8,
    stakes:   0.8,
    rng:      createSeededRng(31),
    palette,
    ...overrides,
  }
}

function bounds (geometry: BufferGeometry): Box3 {
  return new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)
}

describe('the weir run', () => {
  test('it is a mergeable, vertex-coloured geometry', () => {
    const geometry = buildWeirRun(options())!

    expect(geometry).not.toBeNull()
    for (const attribute of [ 'position', 'normal', 'color' ])
      expect(geometry.getAttribute(attribute)).toBeDefined()

    geometry.dispose()
  })

  test('the wall is founded on the bed and the wattle stands over it', () => {
    // The claim a still cannot make, because a weir is only ever seen through
    // water: the stone sits *on* the bed rather than floating at mean water like
    // the deck beside it, and nothing in the run reaches higher than the stakes
    // the pound is woven with.
    const woven = buildWeirRun(options())!
    const bare  = buildWeirRun(options({ stakes: 0 }))!
    const wall  = bounds(bare)
    const whole = bounds(woven)

    expect(wall.min.y).toBeLessThan(BED)
    expect(wall.max.y).toBeGreaterThan(BED)
    expect(wall.max.y).toBeLessThan(BED + 0.34 * 1.3)

    // The wattle is the silhouette, and it is the only thing that rises over the
    // stone — so the run with it in stands half a metre higher than the run
    // without, and no lower.
    expect(whole.max.y).toBeGreaterThan(wall.max.y + 0.4)
    expect(whole.min.y).toBeCloseTo(wall.min.y, 6)

    for (const geometry of [ woven, bare ])
      geometry.dispose()
  })

  test('the wattle is on the pound and nowhere else', () => {
    // The leader is a wall the fish run along; the pound is the thing they
    // cannot leave, and it is the one that is woven. A stake on the leader would
    // be a fence across the flat, which is a different structure entirely.
    const woven = buildWeirRun(options())!
    const crest = BED + 0.34 * 1.3
    const array = woven.getAttribute('position').array as Float32Array
    let standing = 0
    let furthest = 0

    for (let index = 0; index < array.length; index += 3)
      if (array[index + 1] > crest) {
        standing += 1
        furthest = Math.max(furthest, Math.hypot(array[index] - 14, array[index + 2]))
      }

    expect(standing).toBeGreaterThan(0)
    // Every vertex standing over the stone is on the pound's own ring, within a
    // stake's girth and lean of it — so nothing is woven along the leader, where
    // a stake would read as a fence across the flat.
    expect(furthest).toBeLessThan(4.5)

    woven.dispose()
  })

  test('the tier buys stone, and losing the wattle is not losing the weir', () => {
    const coarse = buildWeirRun(options({ spacing: 1.4, stakes: 0 }))!
    const fine   = buildWeirRun(options({ spacing: 0.6, stakes: 0.55 }))!

    expect(fine.getAttribute('position').count)
      .toBeGreaterThan(coarse.getAttribute('position').count)

    // The graceful absence the brief asks for: the cheapest tier still has the
    // whole structure, laid coarsely, rather than an island whose trap went away
    // with the hardware.
    const stone = bounds(coarse)

    expect(stone.max.x - stone.min.x).toBeGreaterThan(16)

    for (const geometry of [ coarse, fine ])
      geometry.dispose()
  })

  test('the same seed builds the same weir, byte for byte', () => {
    const first  = buildWeirRun(options({ rng: createSeededRng(4_242) }))!
    const second = buildWeirRun(options({ rng: createSeededRng(4_242) }))!

    expect(Array.from(first.getAttribute('position').array as Float32Array))
      .toEqual(Array.from(second.getAttribute('position').array as Float32Array))
    expect(Array.from(first.getAttribute('color').array as Float32Array))
      .toEqual(Array.from(second.getAttribute('color').array as Float32Array))

    for (const geometry of [ first, second ])
      geometry.dispose()
  })

  test('a course with no run in it builds nothing', () => {
    expect(buildWeirRun(options({ leader: [], pound: []}))).toBeNull()
  })
})
