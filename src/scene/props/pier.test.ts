import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { resolvePalette } from './index.ts'
import { PIER_WIDTH, buildPierRun } from './pier.ts'
import type { PierRunOptions } from './pier.ts'


const palette = resolvePalette()

/** A three-bay run on a bed that falls away, in the frame the dressing hands over. */
function options (overrides: Partial<PierRunOptions> = {}): PierRunOptions {
  return {
    bents: [
      { x: 0, z: 0, bed: -1.2 },
      { x: 3, z: 0, bed: -2.4 },
      { x: 6, z: 0, bed: -3.9 },
      { x: 9, z: 0, bed: -5.1 },
    ],
    deck:   -0.2,
    angle:  0,
    width:  PIER_WIDTH,
    boards: 1.6,
    rng:    createSeededRng(11),
    palette,
    ...overrides,
  }
}

function bounds (geometry: ReturnType<typeof buildPierRun>): Box3 {
  return new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)
}

describe('the pier run', () => {
  test('it is a mergeable, vertex-coloured geometry', () => {
    const geometry = buildPierRun(options())

    expect(geometry.index).toBeNull()
    for (const attribute of [ 'position', 'normal', 'uv', 'color' ])
      expect(geometry.getAttribute(attribute)).toBeDefined()

    geometry.dispose()
  })

  test('the deck is level, and the piles reach the bed under every bent', () => {
    // The two claims the whole shape rests on, stated as facts about the
    // vertices. A trestle whose piles were one length would be a ramp into the
    // sea, and one whose deck followed the bottom would be the same thing seen
    // from the other end — both look plausible in a still at the far zoom.
    const geometry = buildPierRun(options())
    const box      = bounds(geometry)

    // Down to the deepest bed, and past it: a pile is driven, not stood.
    expect(box.min.y).toBeLessThan(-5.1)
    expect(box.min.y).toBeGreaterThan(-6.2)

    // Up to the deck and the bollards on it, and no further.
    expect(box.max.y).toBeGreaterThan(-0.2)
    expect(box.max.y).toBeLessThan(0.7)

    geometry.dispose()
  })

  test('it spans the run it was given, and no more', () => {
    const geometry = buildPierRun(options())
    const box      = bounds(geometry)

    // The run is nine metres on `x` with the ladder hung off the head, so the
    // far end carries a little past it and the near end does not.
    expect(box.min.x).toBeGreaterThan(-0.6)
    expect(box.max.x).toBeLessThan(9.9)
    expect(box.max.z - box.min.z).toBeLessThan(PIER_WIDTH + 1)

    geometry.dispose()
  })

  test('a turned run is the same pier, turned', () => {
    const along  = buildPierRun(options())
    const across = buildPierRun(options({
      angle: Math.PI / 2,
      bents: options().bents.map(bent => ({ x: 0, z: bent.x, bed: bent.bed })),
    }))
    const flat   = bounds(along)
    const turned = bounds(across)

    // To a decimetre rather than exactly: the piles are hexagonal prisms drawn
    // at a fixed roll, so a run turned a right angle presents a facet where the
    // other presented a corner. That is the tessellation, not the pier.
    expect(turned.max.z - turned.min.z).toBeCloseTo(flat.max.x - flat.min.x, 1)
    expect(turned.max.x - turned.min.x).toBeCloseTo(flat.max.z - flat.min.z, 1)

    along.dispose()
    across.dispose()
  })

  test('the tier buys boards and nothing else', () => {
    // What `quality.pierBoards` is allowed to change, and what it is not. A tier
    // that moved the deck or lost a pile would be an island whose harbour
    // changed shape with the hardware.
    const cheap = buildPierRun(options({ boards: 0.9 }))
    const rich  = buildPierRun(options({ boards: 2 }))
    const low   = bounds(cheap)
    const high  = bounds(rich)

    expect(rich.getAttribute('position').count)
      .toBeGreaterThan(cheap.getAttribute('position').count)
    expect(high.min.y).toBeCloseTo(low.min.y, 4)
    expect(high.max.y).toBeCloseTo(low.max.y, 4)

    cheap.dispose()
    rich.dispose()
  })

  test('one seed builds one pier', () => {
    const first  = buildPierRun(options({ rng: createSeededRng(4_242) }))
    const second = buildPierRun(options({ rng: createSeededRng(4_242) }))

    expect(Array.from(first.getAttribute('position').array))
      .toEqual(Array.from(second.getAttribute('position').array))
    expect(Array.from(first.getAttribute('color').array))
      .toEqual(Array.from(second.getAttribute('color').array))

    first.dispose()
    second.dispose()
  })

  test('a run with no head is refused rather than drawn', () => {
    expect(() => buildPierRun(options({ bents: [{ x: 0, z: 0, bed: -1 }]}))).toThrow()
  })
})
