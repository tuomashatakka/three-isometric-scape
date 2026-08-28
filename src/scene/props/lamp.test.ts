import { describe, expect, test } from 'bun:test'
import type { BufferAttribute } from 'three'
import { resolvePalette } from './index.ts'
import { LAMP_PANE_PROUD, LAMP_SPILL_PROUD, buildWindowGlow } from './lamp.ts'
import { WINDOW_FRAME_PROUD, WINDOW_GLASS_PROUD } from './timber.ts'


const palette = resolvePalette()

const glow = (rings: number, halo = 1): BufferAttribute[] => {
  const built = buildWindowGlow(palette, { rings, halo })

  return [ 'position', 'normal', 'uv', 'color' ].map(name => built.getAttribute(name) as BufferAttribute)
}

const [ position, normal, uv, color ] = glow(3)

/** Vertices in one quad, and the pane is one quad. */
const A_PANE = 6


describe('the glow behind a lit window', () => {
  test('carries every attribute the merge and the material need', () => {
    for (const attribute of [ position, normal, uv, color ])
      expect(attribute.count).toBe(position.count)

    expect(color.itemSize).toBe(3)
    expect(position.count).toBeGreaterThan(A_PANE)
  })

  /**
   * It is built in *pane units* across — see the note at the top of `lamp.ts` —
   * and the carrier scales each instance by its own window's width and height. So
   * the pane itself has to be the unit square about the origin, or every lamp in
   * the archipelago is the wrong size and off its own glass by the same amount.
   */
  test('the pane is the unit square, centred', () => {
    const pane = Array.from({ length: A_PANE }, (_value, index) => ({
      x: position.getX(index),
      y: position.getY(index),
      z: position.getZ(index),
    }))

    for (const point of pane) {
      expect(Math.abs(point.x)).toBeCloseTo(0.5, 9)
      expect(Math.abs(point.y)).toBeCloseTo(0.5, 9)
      expect(point.z).toBeCloseTo(LAMP_PANE_PROUD, 6)
    }

    expect(new Set(pane.map(point => `${point.x},${point.y}`)).size).toBe(4)
  })

  /**
   * The claim this whole geometry got wrong for two runs, stated as a fact about
   * the vertices.
   *
   * It used to be flat — every vertex at `z = 0` — and a test here said so in as
   * many words: *nothing leaves the plane the wall is*. Which sounded like
   * discipline and was the bug: `scene/windows.ts` then pushed the flat thing
   * 0.10 m *into* the house to get light "coming out through the opening", the
   * depth test threw all of it away, and every window in the archipelago drew
   * nothing at all. `--skip windows` changed a 400,000-pixel frame by one channel
   * level on one pixel.
   *
   * A window is not a plane. It is a surround standing proud of a wall with glass
   * down in the reveal behind it, so the light has *two* depths: the lit pane
   * belongs in the reveal, between the glass and the front of the surround, and
   * the haze belongs in front of the surround, because it is wider than the
   * opening and anything in the reveal would be clipped by the jambs.
   */
  test('the pane sits in the reveal and the haze stands clear of the surround', () => {
    expect(LAMP_PANE_PROUD).toBeGreaterThan(WINDOW_GLASS_PROUD)
    expect(LAMP_PANE_PROUD).toBeLessThan(WINDOW_FRAME_PROUD)
    expect(LAMP_SPILL_PROUD).toBeGreaterThan(WINDOW_FRAME_PROUD)

    for (let index = A_PANE; index < position.count; index += 1)
      expect(position.getZ(index)).toBeCloseTo(LAMP_SPILL_PROUD, 6)
  })

  /**
   * The claim the whole geometry exists to make: the haze *dies* at its rim. An
   * additive edge lives in the vertex colours, not in the opacity — a spill that
   * ends at any brightness above zero ends in a visible disc, whatever the blend
   * is asked to do about it.
   */
  test('the spill falls to nothing at its outer ring', () => {
    let dimmest = Infinity
    let outer   = 0

    for (let index = A_PANE; index < position.count; index += 1) {
      const radius = Math.hypot(position.getX(index), position.getY(index))
      const level  = color.getX(index) + color.getY(index) + color.getZ(index)

      outer = Math.max(outer, radius)

      if (radius > 1e-6)
        dimmest = Math.min(dimmest, level)
    }

    expect(outer).toBeGreaterThan(0.5)
    expect(dimmest).toBeCloseTo(0, 9)
  })

  test('the pane is brighter than anything spilling off it', () => {
    const paneLevel = color.getX(0)

    for (let index = A_PANE; index < position.count; index += 1)
      expect(color.getX(index)).toBeLessThan(paneLevel + 1e-9)
  })

  test('the uv is inside the unit square the pane occupies', () => {
    for (let index = 0; index < A_PANE; index += 1) {
      expect(uv.getX(index)).toBeGreaterThanOrEqual(0)
      expect(uv.getX(index)).toBeLessThanOrEqual(1)
    }

    expect(normal.getZ(0)).toBe(1)
  })

  /**
   * The graceful absence the cheapest tier gets: a lit pane and nothing around
   * it, which is a real window on a clear night rather than a coarse spill.
   */
  test('no rings leaves the pane alone rather than leaving nothing', () => {
    const [ bare ] = glow(0)

    expect(bare.count).toBe(A_PANE)
  })

  test('no reach is the same absence', () => {
    const [ bare ] = glow(3, 0)

    expect(bare.count).toBe(A_PANE)
  })

  test('more rings is more geometry and the same pane', () => {
    const [ thin ] = glow(2)
    const [ rich ] = glow(4)

    expect(rich.count).toBeGreaterThan(thin.count)

    for (let index = 0; index < A_PANE * 3; index += 1)
      expect(rich.array[index]).toBe(thin.array[index])
  })

  test('is byte-for-byte stable for the same options', () => {
    const [ again ] = glow(3)

    expect(Array.from(again.array)).toEqual(Array.from(position.array))
  })
})
