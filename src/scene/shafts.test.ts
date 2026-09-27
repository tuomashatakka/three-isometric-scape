import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from './config.ts'
import {
  shaftAmount,
  shaftLift,
  shaftSheetHeights,
  shaftSheetSize,
  shaftSheetWeight,
  shaftStackGeometry,
  shaftColumnTop,
} from './shafts.ts'


const { cloudHeight } = SCAPE_CONFIG.atmosphere
const { waterLevel }  = SCAPE_CONFIG.terrain

describe('shaftAmount', () => {
  test('the switch takes it to nothing on its own', () => {
    expect(shaftAmount(0, 0.5, 1)).toBe(0)
  })

  test('a night has no beams in it however broken the sky', () => {
    expect(shaftAmount(1, 0.5, 0)).toBe(0)
  })

  // The claim the curve exists to make, and the one thing about this section a
  // still cannot show: a shadow rides the cover linearly and a beam does not.
  test('a clear sky and an overcast both have nothing, and a half sky has most', () => {
    expect(shaftAmount(1, 0, 1)).toBe(0)
    expect(shaftAmount(1, 1, 1)).toBe(0)
    expect(shaftAmount(1, 0.5, 1)).toBe(1)
  })

  test('the curve is symmetric about a half-clouded sky', () => {
    expect(shaftAmount(1, 0.3, 1)).toBeCloseTo(shaftAmount(1, 0.7, 1), 12)
  })

  test('it never leaves 0..1, at any cover or any light', () => {
    for (let step = 0; step <= 40; step += 1) {
      const cover = step / 40

      for (const day of [ 0, 0.31, 0.5, 1 ]) {
        const amount = shaftAmount(1.4, cover, day)

        expect(amount).toBeGreaterThanOrEqual(0)
        expect(amount).toBeLessThanOrEqual(1)
      }
    }
  })

  test('the authored default is out at the authored sky', () => {
    const amount = shaftAmount(
      SCAPE_CONFIG.shafts.strength,
      SCAPE_CONFIG.atmosphere.cloudCover,
      1,
    )

    expect(amount).toBeGreaterThan(0)
    expect(amount).toBeLessThan(0.5)
  })
})

describe('shaftLift', () => {
  // The whole claim of the section, stated as arithmetic: the bottom of the
  // stack reads the cloud map at exactly the offset `CLOUD_SHADOW_GLSL` reads
  // it at for the ground, so a beam and the bright patch under it are one hole
  // in one deck rather than two that happen to agree.
  test('ground level is a full throw, which is the shadow lookup itself', () => {
    expect(shaftLift(0, cloudHeight)).toBe(1)
  })

  test('the deck itself is no throw at all', () => {
    expect(shaftLift(cloudHeight, cloudHeight)).toBe(0)
  })

  test('halfway up is half a throw', () => {
    expect(shaftLift(cloudHeight / 2, cloudHeight)).toBeCloseTo(0.5, 12)
  })

  test('it falls monotonically with height and stays in 0..1', () => {
    let previous = Infinity

    for (let step = 0; step <= 50; step += 1) {
      const lift = shaftLift(-4 + step / 50 * (cloudHeight + 8), cloudHeight)

      expect(lift).toBeGreaterThanOrEqual(0)
      expect(lift).toBeLessThanOrEqual(1)
      expect(lift).toBeLessThanOrEqual(previous)
      previous = lift
    }
  })

  test('a deck at nothing cannot divide by nothing', () => {
    expect(Number.isFinite(shaftLift(2, 0))).toBe(true)
  })
})

describe('shaftSheetHeights', () => {
  test('the stack stands between the water and the reach up the deck', () => {
    const heights = shaftSheetHeights(waterLevel, cloudHeight, 0.84, 6)

    expect(heights).toHaveLength(6)
    expect(heights[0]).toBeCloseTo(waterLevel, 12)
    expect(heights[5]).toBeCloseTo(waterLevel + cloudHeight * 0.84, 12)
  })

  test('it rises, and never reaches the deck at the authored reach', () => {
    const heights = shaftSheetHeights(waterLevel, cloudHeight, SCAPE_CONFIG.shafts.reach, 8)

    for (let index = 1; index < heights.length; index += 1)
      expect(heights[index]).toBeGreaterThan(heights[index - 1])

    expect(heights[heights.length - 1]).toBeLessThan(cloudHeight)
  })

  test('one sheet is the bright top of the column rather than its bottom', () => {
    const [ only ] = shaftSheetHeights(waterLevel, cloudHeight, 0.84, 1)

    expect(only).toBeCloseTo(waterLevel + cloudHeight * 0.84, 12)
  })

  test('a reach of nothing stacks up on the waterline rather than under it', () => {
    for (const height of shaftSheetHeights(waterLevel, cloudHeight, 0, 4))
      expect(height).toBeCloseTo(waterLevel, 12)
  })
})

describe('shaftColumnTop', () => {
  // `update` reads the top of the column and `scape:map` reads the whole stack,
  // and a second closed form for the same height is how those two end up
  // disagreeing about where the light stops.
  test('it is the top of the stack the sheets are dealt through', () => {
    for (const reach of [ 0, 0.3, SCAPE_CONFIG.shafts.reach, 1 ]) {
      const heights = shaftSheetHeights(waterLevel, cloudHeight, reach, 5)

      expect(shaftColumnTop(waterLevel, cloudHeight, reach))
        .toBeCloseTo(heights[heights.length - 1], 12)
    }
  })

  test('a reach past 1 cannot put the column through the deck', () => {
    expect(shaftColumnTop(waterLevel, cloudHeight, 4))
      .toBeCloseTo(waterLevel + cloudHeight, 12)
  })
})

describe('shaftSheetWeight', () => {
  test('it is brightest at the top of the column', () => {
    const count = 8

    for (let index = 1; index < count; index += 1)
      expect(shaftSheetWeight(index, count, 0.35))
        .toBeGreaterThan(shaftSheetWeight(index - 1, count, 0.35))
  })

  // What the divide by the count is for: a phone and a workstation light the
  // same air by about the same amount rather than one being a glare.
  test('a tier with three sheets and one with eight sum to within a tenth', () => {
    const sum = (count: number): number => Array
      .from({ length: count }, (_unused, index) => shaftSheetWeight(index, count, 0.35))
      .reduce((total, weight) => total + weight, 0)

    expect(Math.abs(sum(3) - sum(8))).toBeLessThan(0.1)
  })

  test('an even taper is an even column', () => {
    expect(shaftSheetWeight(0, 4, 1)).toBeCloseTo(shaftSheetWeight(3, 4, 1), 12)
  })

  test('no taper leaves nothing at the bottom and the full share at the top', () => {
    expect(shaftSheetWeight(0, 4, 0)).toBe(0)
    expect(shaftSheetWeight(3, 4, 0)).toBeGreaterThan(0)
  })

  test('a share never leaves 0..1', () => {
    for (const count of [ 1, 3, 6, 8 ])
      for (let index = 0; index < count; index += 1) {
        const weight = shaftSheetWeight(index, count, 0.35)

        expect(weight).toBeGreaterThanOrEqual(0)
        expect(weight).toBeLessThanOrEqual(1)
      }
  })
})

describe('shaftSheetSize', () => {
  test('it follows the world rather than the frame', () => {
    expect(shaftSheetSize(1_520)).toBeGreaterThan(1_520)
    expect(shaftSheetSize(3_040)).toBe(shaftSheetSize(1_520) * 2)
  })
})

describe('shaftStackGeometry', () => {
  // The bug that made the first cut of this section draw a frame byte-for-byte
  // identical to the one with its strength at zero. A camera that is always
  // over the stack sees nothing of a stack wound to face away from it, and no
  // amount of looking at the picture can tell that apart from an effect that
  // was never switched on.
  test('every sheet faces up, at every tier', () => {
    for (const count of [ 1, 3, 6, 8 ]) {
      const geometry = shaftStackGeometry(1_000, count)
      const position = geometry.getAttribute('position')
      const index    = geometry.getIndex()

      expect(index).not.toBeNull()

      for (let triangle = 0; triangle * 3 < index!.count; triangle += 1) {
        const [ a, b, c ] = [ 0, 1, 2 ].map(corner => index!.getX(triangle * 3 + corner))

        const ax = position.getX(b) - position.getX(a)
        const az = position.getZ(b) - position.getZ(a)
        const bx = position.getX(c) - position.getX(a)
        const bz = position.getZ(c) - position.getZ(a)

        // The y component of the cross product, which is the whole of a
        // horizontal face's normal. Positive is up, at the camera.
        expect(az * bx - ax * bz).toBeGreaterThan(0)
      }

      geometry.dispose()
    }
  })

  // The config discipline, stated as a fact about the buffer: a knob that only
  // takes effect on a reload is not a knob, so neither the height of a sheet
  // nor its share of the light may be baked into a vertex. `aSlot` is all a
  // vertex is allowed to carry, and both `shafts.reach` and `shafts.taper` are
  // resolved from uniforms against it.
  test('a vertex carries its slot and nothing else that a knob could move', () => {
    const geometry = shaftStackGeometry(1_000, 6)

    expect(Object.keys(geometry.attributes).sort()).toEqual([ 'aSlot', 'position' ])
    expect(geometry.getAttribute('position').count).toBe(24)
    expect(geometry.getIndex()?.count).toBe(36)

    for (let vertex = 0; vertex < 24; vertex += 1)
      expect(geometry.getAttribute('position').getY(vertex)).toBe(0)

    geometry.dispose()
  })

  test('the slots run 0..1 up the stack, four vertices at a time', () => {
    const slot = shaftStackGeometry(1_000, 4).getAttribute('aSlot')

    for (let sheet = 0; sheet < 4; sheet += 1)
      for (let corner = 0; corner < 4; corner += 1)
        expect(slot.getX(sheet * 4 + corner)).toBeCloseTo(sheet / 3, 6)
  })

  test('a single-sheet tier gets the top of the column', () => {
    expect(shaftStackGeometry(1_000, 1).getAttribute('aSlot')
      .getX(0)).toBe(1)
  })
})
