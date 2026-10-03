import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { DAN_HEIGHT, FLOAT_RADIUS, FLOAT_WATERLINE, buildCreelBuoy, buildCreelStack } from './creel.ts'
import { resolvePalette } from './palette.ts'


const palette = resolvePalette()
const seeds   = [ 1, 7, 11, 42, 99, 4_242 ]

const positionsOf = (build: typeof buildCreelBuoy, seed: number): Float32Array =>
  build(createSeededRng(seed), palette).getAttribute('position').array as Float32Array


describe('the creel float', () => {
  test.each(seeds)('seed %i keeps its base at the waterline datum', seed => {
    const bounds = new Box3().setFromArray(positionsOf(buildCreelBuoy, seed))

    // Base at `y = 0` like every other prop in the roster, so the placement
    // decides where the sea is rather than the geometry assuming a level.
    expect(bounds.min.y).toBeGreaterThan(-0.05)
  })

  test.each(seeds)('seed %i floats with most of itself out of the water', seed => {
    const bounds = new Box3().setFromArray(positionsOf(buildCreelBuoy, seed))

    // The claim `landscape/creels.ts` rests on. It puts the sea at
    // `FLOAT_WATERLINE` up the prop, so a float built with its belly above that
    // line would ride with daylight under it at every state of the tide, and
    // one built with its shoulders below it would be a mark permanently awash.
    expect(bounds.min.y).toBeLessThan(FLOAT_WATERLINE)
    expect(bounds.max.y).toBeGreaterThan(FLOAT_WATERLINE)
  })

  test.each(seeds)('seed %i is mostly staff, because a sphere is not a mark', seed => {
    const bounds = new Box3().setFromArray(positionsOf(buildCreelBuoy, seed))

    // The whole reason a dan carries a pole. The float itself is 0.6 m across,
    // which is under a pixel at the zoom most of this sea is read at; what
    // carries is the flagged staff over it. If the prop ever stops standing
    // most of a dan's height, the fishery goes back to being invisible and no
    // still of it would say so.
    expect(bounds.max.y).toBeGreaterThan(DAN_HEIGHT * 0.85)
    expect(bounds.max.y).toBeLessThan(DAN_HEIGHT * 1.1)
  })

  test.each(seeds)('seed %i keeps the gear inside its own float, in plan', seed => {
    const bounds = new Box3().setFromArray(positionsOf(buildCreelBuoy, seed))
    const size   = bounds.getSize(bounds.max.clone())

    // A mark is a vertical thing. Anything that made it wide would be a float
    // whose flag overhangs the next pot on the backline, and the spacing is
    // metres rather than centimetres for exactly the opposite reason.
    expect(Math.max(size.x, size.z)).toBeLessThan(FLOAT_RADIUS * 4)
  })

  test('it is byte-for-byte stable per seed', () => {
    expect(positionsOf(buildCreelBuoy, 11)).toEqual(positionsOf(buildCreelBuoy, 11))
  })
})

describe('the stack of creels ashore', () => {
  test.each(seeds)('seed %i stands on the ground it was placed on', seed => {
    const bounds = new Box3().setFromArray(positionsOf(buildCreelStack, seed))

    expect(bounds.min.y).toBeGreaterThan(-0.05)
  })

  test.each(seeds)('seed %i is a stack rather than a single pot', seed => {
    const bounds = new Box3().setFromArray(positionsOf(buildCreelStack, seed))

    // Two pots is the fewest the builder deals, and one pot is 0.44 m tall. A
    // stack that came out under that is a loop that ran zero times.
    expect(bounds.max.y).toBeGreaterThan(0.7)
    expect(bounds.max.y).toBeLessThan(2)
  })

  test('it is byte-for-byte stable per seed', () => {
    expect(positionsOf(buildCreelStack, 7)).toEqual(positionsOf(buildCreelStack, 7))
  })
})
