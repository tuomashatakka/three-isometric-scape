import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { surveyArchipelago } from './archipelago.ts'
import { ROOST_RESOLUTION, roostAmount, surveyRoosts } from './roost.ts'
import { bakeDepthGrid } from './shore-mask.ts'


const SIZE = 128
const SPAN = 512
const STEP = SPAN / (SIZE - 1)

const ROOST = SCAPE_CONFIG.roost

/** World metres to a texel of the synthetic grids below. */
function texel (metres: number): number {
  return Math.round((metres + SPAN / 2) / STEP)
}

/** What the field says at a world position. */
function at (field: Float32Array, x: number, z: number): number {
  return field[texel(z) * SIZE + texel(x)]
}

/**
 * A grid of open water with dry ground wherever `land` says so.
 *
 * Synthetic on purpose, and the same argument `shore-mask.test.ts` makes for
 * its cone: the claim under test is "narrow water with a way out of both ends
 * runs, and nothing else does", and a shape whose answer is known everywhere is
 * the only place a transposed axis or an inverted test is a failure with a
 * number on it rather than a picture to squint at. The composite archipelago is
 * exercised at the bottom, where being unable to predict the answer is the
 * point.
 */
function water (land: (x: number, z: number) => boolean): Float32Array {
  const depth = new Float32Array(SIZE * SIZE)

  for (let row = 0; row < SIZE; row += 1)
    for (let column = 0; column < SIZE; column += 1) {
      const x = -SPAN / 2 + column * STEP
      const z = -SPAN / 2 + row * STEP

      depth[row * SIZE + column] = land(x, z) ? 0 : 1
    }

  return depth
}

/**
 * Two headlands reaching at each other across open sea, leaving a gap of `gap`
 * metres on the `z` axis at `x = 0`.
 *
 * The strait runs north-south through the middle of the grid and the sea is
 * open east and west of it, which is the shape a gate actually is.
 */
function strait (gap: number): Float32Array {
  return water((x, z) => Math.abs(x) < 46 && Math.abs(z) > gap / 2)
}

describe('the gates the tide runs through', () => {
  test('a strait runs, and the open water either side of it does not', () => {
    const { field } = surveyRoosts(strait(40), SIZE, SPAN, ROOST)

    expect(at(field, 0, 0)).toBeGreaterThan(0.5)
    expect(at(field, 0, -200)).toBe(0)
    expect(at(field, 0, 200)).toBe(0)
  })

  test('the tighter of two straits runs harder', () => {
    const tight = surveyRoosts(strait(24), SIZE, SPAN, ROOST).field
    const wide  = surveyRoosts(strait(80), SIZE, SPAN, ROOST).field

    expect(at(tight, 0, 0)).toBeGreaterThan(at(wide, 0, 0))
  })

  test('a strait wider than the gate does not run at all', () => {
    const { field, gates } = surveyRoosts(strait(ROOST.gate * 1.6), SIZE, SPAN, ROOST)

    expect(at(field, 0, 0)).toBe(0)
    expect(gates).toHaveLength(0)
  })

  /**
   * The claim the whole search exists to make. A cove is exactly as narrow as a
   * gate and has no tide going through it, because the water in it is a dead
   * end — and a build that only measured narrowness put a race up every inlet
   * in the archipelago.
   */
  test('a cove of the same width does not run', () => {
    const cove = water((x, z) =>
      Math.abs(x) < 46 && Math.abs(z) > 20 || x > 30 && x < 46)
    const { field } = surveyRoosts(cove, SIZE, SPAN, ROOST)

    expect(at(field, 0, 0)).toBe(0)
  })

  test('an enclosed pool does not run', () => {
    const pool             = water((x, z) => Math.hypot(x, z) > 18)
    const { field, gates } = surveyRoosts(pool, SIZE, SPAN, ROOST)

    expect(at(field, 0, 0)).toBe(0)
    expect(gates).toHaveLength(0)
  })

  test('nothing is ever written onto dry ground', () => {
    const depth     = strait(40)
    const { field } = surveyRoosts(depth, SIZE, SPAN, ROOST)

    for (let index = 0; index < depth.length; index += 1)
      if (depth[index] <= 0)
        expect(field[index]).toBe(0)
  })

  /**
   * The width, and not the place. A strait of one width is the same gate at
   * every point along it, and the mouth at either end is the same water opening
   * out — so which of those the clustering names is its own business. What it
   * may not do is report a gate off the channel's own line, or a gap wider than
   * the section the search is allowed to call one.
   */
  test('the gate is reported on the channel, at about the width it is', () => {
    const { gates } = surveyRoosts(strait(40), SIZE, SPAN, ROOST)

    expect(gates.length).toBeGreaterThan(0)
    expect(gates.some(gate => Math.abs(gate.gap - 40) < STEP * 3)).toBe(true)

    for (const gate of gates) {
      expect(Math.abs(gate.z)).toBeLessThanOrEqual(20 + ROOST.spread)
      expect(gate.gap).toBeLessThanOrEqual(ROOST.gate)
    }
  })

  test('the strength is the switch, and the only one', () => {
    const { field, gates } = surveyRoosts(strait(40), SIZE, SPAN, { ...ROOST, strength: 0 })

    expect(field.every(value => value === 0)).toBe(true)
    expect(gates).toHaveLength(0)
  })

  test('the same water twice is the same field, byte for byte', () => {
    const once  = surveyRoosts(strait(40), SIZE, SPAN, ROOST)
    const again = surveyRoosts(strait(40), SIZE, SPAN, ROOST)

    expect(Array.from(again.field)).toEqual(Array.from(once.field))
    expect(again.gates).toEqual(once.gates)
  })
})

describe('how hard a race runs', () => {
  test('a stream that is not running leaves no white', () => {
    expect(roostAmount(0, 0.72)).toBe(0)
  })

  test('the ebb and the flood run the same', () => {
    expect(roostAmount(-0.6, 0.72)).toBeCloseTo(roostAmount(0.6, 0.72), 12)
  })

  /**
   * Squared rather than straight, which is the physics: what a stream does to
   * the surface goes as the square of how fast it is running, so a neap at half
   * a spring's rate gets a quarter of the white and not half of it.
   */
  test('half the stream is a quarter of the white', () => {
    expect(roostAmount(0.5, 1)).toBeCloseTo(0.25, 12)
    expect(roostAmount(1, 1)).toBeCloseTo(1, 12)
  })

  test('a strength of zero is white of zero at every rate', () => {
    for (const stream of [ 0.1, 0.5, 1 ])
      expect(roostAmount(stream, 0)).toBe(0)
  })
})

/** What share of the water in a grid is in a gate, 0..1. */
function litShare (depth: Float32Array, field: Float32Array): number {
  let water = 0
  let lit   = 0

  for (let index = 0; index < depth.length; index += 1)
    if (depth[index] > 0) {
      water += 1
      lit += field[index] > 0 ? 1 : 0
    }

  return water ? lit / water : 0
}

describe('the archipelago the scape actually has', () => {
  const span  = SCAPE_CONFIG.archipelago.worldSize * 1.02
  const world = surveyArchipelago(SCAPE_CONFIG)
  const depth = bakeDepthGrid(SCAPE_CONFIG, world.field, span, ROOST_RESOLUTION)
  const found = surveyRoosts(depth, ROOST_RESOLUTION, span, ROOST)

  test('the sounds have gates in them, and every one is on the map', () => {
    expect(found.gates.length).toBeGreaterThan(0)

    for (const gate of found.gates) {
      expect(gate.gap).toBeGreaterThan(0)
      expect(gate.gap).toBeLessThanOrEqual(SCAPE_CONFIG.roost.gate)
      expect(Math.abs(gate.x)).toBeLessThanOrEqual(span / 2)
      expect(Math.abs(gate.z)).toBeLessThanOrEqual(span / 2)
    }
  })

  /**
   * The finding `scape:map` prints, stated as a fact. Past about a tenth of the
   * water the gates have run into one another and what is drawn is a wash over
   * the whole inshore sea rather than a set of places — which is exactly what a
   * `roost.spread` of 34 m did, and how it was caught.
   */
  test('the races are places rather than a wash over the sea', () => {
    expect(litShare(depth, found.field)).toBeGreaterThan(0)
    expect(litShare(depth, found.field)).toBeLessThan(0.1)
  })

  /**
   * The search is capped at {@link ROOST_RESOLUTION} so that the tiers baking a
   * finer mask than that still draw the races the instruments report — see the
   * constant. The claim is the *places*, not the bytes: decimating a 1024 mask
   * is not the same grid as sampling the height field at 512, so a headland can
   * come out a texel fatter and a gate's reported gap move by a texel with it.
   * What may not happen is a second archipelago, with races in water the
   * instruments say is open.
   */
  test('a finer mask finds the same amount of running water', () => {
    const fine = bakeDepthGrid(SCAPE_CONFIG, world.field, span, ROOST_RESOLUTION * 2)
    const same = surveyRoosts(fine, ROOST_RESOLUTION * 2, span, ROOST)

    expect(same.field).toHaveLength(ROOST_RESOLUTION * 2 * ROOST_RESOLUTION * 2)
    expect(same.gates.length).toBe(found.gates.length)
    expect(litShare(fine, same.field)).toBeCloseTo(litShare(depth, found.field), 2)
  }, 60_000)
})
