import { describe, expect, test } from 'bun:test'
import { createSeamlessNoiseTexture } from 'threejs-scene/modules/assets'
import { GRAIN_RELIEF, GROUND_NORMAL_GAIN, normalFromHeight, slopeFromHeight } from './normals.ts'


const SIZE = 512

/** The same field `catalogue.ts` bakes the ground normal off. */
function grain (seed = 7_319): Uint8Array {
  const texture = createSeamlessNoiseTexture({
    size:      SIZE,
    seed:      seed ^ 0x77c1,
    frequency: 12,
    octaves:   5,
  })

  return (texture.image as { data: Uint8Array }).data
}

function decode (map: Uint8Array, index: number): [number, number, number] {
  return [
    map[index] / 255 * 2 - 1,
    map[index + 1] / 255 * 2 - 1,
    map[index + 2] / 255 * 2 - 1,
  ]
}


describe('the baked ground normal', () => {
  const field = grain()
  const map   = normalFromHeight(field, SIZE)

  test('every texel is a unit normal', () => {
    for (let index = 0; index < map.length; index += 4 * 997) {
      const [ x, y, z ] = decode(map, index)

      // A byte per component, so the round trip cannot be exact — but a map that
      // is not close to unit length is a map that scales the light it perturbs.
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 2)
    }
  })

  test('every normal points out of the surface, never into it', () => {
    for (let index = 0; index < map.length; index += 4 * 397)
      expect(decode(map, index)[2]).toBeGreaterThan(0)
  })

  test('carries the height it was taken from, so the march has one to read', () => {
    for (let index = 0; index < map.length; index += 4 * 613)
      expect(map[index + 3]).toBe(field[index])
  })

  test('tiles without a seam', () => {
    // The wrap is modulo `size - 1`, because the field's own last row is a copy
    // of its first. Getting that wrong lays a line of dead-flat normal across
    // every repeat, which the light picks out as a grid.
    for (let along = 0; along < SIZE; along += 37) {
      const left  = decode(map, along * SIZE * 4)
      const right = decode(map, (along * SIZE + SIZE - 1) * 4)
      const top   = decode(map, along * 4)
      const foot  = decode(map, ((SIZE - 1) * SIZE + along) * 4)

      expect(right[0]).toBeCloseTo(left[0], 2)
      expect(right[1]).toBeCloseTo(left[1], 2)
      expect(foot[0]).toBeCloseTo(top[0], 2)
      expect(foot[1]).toBeCloseTo(top[1], 2)
    }
  })

  test('leans away from rising ground, which is the sign the difference had backwards', () => {
    // A ramp climbing in +x. Its normal has to tip toward -x; the six-tap
    // difference this replaced tipped it toward +x, and lit every grain of soil
    // in the scape as a pit.
    const ramp = new Uint8Array(16 * 16 * 4)

    for (let y = 0; y < 16; y += 1)
      for (let x = 0; x < 16; x += 1)
        ramp[(y * 16 + x) * 4] = Math.round(x / 15 * 255)

    const sloped = normalFromHeight(ramp, 16)
    const middle = decode(sloped, (8 * 16 + 8) * 4)

    expect(middle[0]).toBeLessThan(0)
    expect(middle[1]).toBeCloseTo(0, 2)
  })

  test('is byte-for-byte stable, and a different seed is a different surface', () => {
    expect([ ...normalFromHeight(grain(), SIZE).slice(0, 256) ]).toEqual([ ...map.slice(0, 256) ])
    expect([ ...normalFromHeight(grain(11), SIZE).slice(0, 256) ]).not.toEqual([ ...map.slice(0, 256) ])
  })

  /**
   * The calibration, as a fact rather than as a taste.
   *
   * The ground used to be perturbed by `(grainX - grain, grainZ - grain) * 3`
   * with the fetches 0.015 uv apart — eight texels of this 512² map. The two
   * constants exist to land the baked map on the same amount of relief, so this
   * change is the *sign* and the cost changing and not the look, and a run that
   * retunes either constant has to move this number knowingly.
   */
  test('perturbs the light by what the six taps it replaced did', () => {
    let differenced = 0
    let baked       = 0
    let samples     = 0

    const heightAt = (x: number, y: number): number =>
      field[(y % SIZE * SIZE + x % SIZE) * 4] / 255

    for (let y = 0; y < SIZE; y += 3)
      for (let x = 0; x < SIZE; x += 3) {
        const here                   = heightAt(x, y)
        const index                  = (y * SIZE + x) * 4
        const [ tangentX, tangentY ] = decode(map, index)

        differenced += Math.hypot(heightAt(x + 8, y) - here, heightAt(x, y + 8) - here) * 3
        baked       += Math.hypot(tangentX, tangentY) * GROUND_NORMAL_GAIN
        samples     += 1
      }

    expect(GRAIN_RELIEF).toBeGreaterThan(0)
    expect(baked / samples).toBeCloseTo(differenced / samples, 2)
  })
})

describe('the wave map carries its own slope', () => {
  const size   = 256
  const source = (createSeamlessNoiseTexture({ size, seed: 7319 ^ 0x51b7, frequency: 5, octaves: 4 }).image as { data: Uint8Array }).data
  const packed = slopeFromHeight(source, size)

  test('the height every other reader takes is untouched', () => {
    for (let index = 0; index < source.length; index += 4) {
      expect(packed[index]).toBe(source[index])
      expect(packed[index + 3]).toBe(source[index + 3])
    }
  })

  test('the slope tilts the sea by what the value used to, one component at a time', () => {
    // The ripple used to tilt by `v - 0.5`; the gradient replaces it at the
    // same mean, so the sea is as rough as it was and only the contours went.
    let value = 0
    let slope = 0

    for (let index = 0; index < source.length; index += 4) {
      value += Math.abs(source[index] / 255 - 0.5)
      slope += Math.abs(packed[index + 1] / 255 * 2 - 1)
    }

    const ratio = slope / value

    expect(ratio).toBeGreaterThan(0.75)
    expect(ratio).toBeLessThan(1.33)
  })

  test('the slope points uphill: a texel east of a rise leans the other way to one west of it', () => {
    // A gradient, not a value: where the height climbs to the east, green is
    // over mid-grey, so the shader's `normal - slope` tips the face away.
    let agree = 0
    let total = 0

    for (let y = 2; y < size - 2; y += 7)
      for (let x = 2; x < size - 2; x += 7) {
        const rise = source[(y * size + x + 1) * 4] - source[(y * size + x - 1) * 4]

        if (Math.abs(rise) < 3)
          continue

        total += 1
        if (Math.sign(packed[(y * size + x) * 4 + 1] - 127.5) === Math.sign(rise))
          agree += 1
      }

    expect(agree / total).toBeGreaterThan(0.9)
  })
})
