import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import type { ScapeConfig } from '../config.ts'
import type { GroundNormal, HeightField } from './height.ts'
import { atmosphereQuality } from '../quality.ts'
import { surveyArchipelago } from './archipelago.ts'
import { MAX_DEPTH, SHORE_RESOLUTION, bakeShoreData, decodeUnit } from './shore-mask.ts'


const SPAN = 400

/**
 * A cone of an island, centred on the origin.
 *
 * Synthetic on purpose. The claim under test is "the seaward channel points out
 * to sea", and on a shape whose answer is known everywhere — straight out from
 * the middle — a wrong sign, a transposed axis or a flipped row order is a
 * failure with a number attached rather than a picture to squint at. The
 * composite survey is exercised further down, where being unable to predict the
 * answer is the point.
 */
function coneIsland (): HeightField {
  return {
    heightAt: (x, z) => 6 - Math.hypot(x, z) * 0.09,
    slopeAt:  () => 0.09,

    normalAt: (x, z, target: GroundNormal) => {
      target.x = x
      target.y = 1
      target.z = z
      return target
    },
  }
}

function maskOf (field: HeightField, waterLevel = -1.25): Uint8Array {
  const config: ScapeConfig = { ...SCAPE_CONFIG, terrain: { ...SCAPE_CONFIG.terrain, waterLevel }}

  return bakeShoreData(config, field, SPAN)
}

/** Where a world-space point lands in the mask, in texels. */
type TexelOfReturnType = { column: number, row: number }

function texelOf (x: number, z: number): TexelOfReturnType {
  const step = SPAN / (SHORE_RESOLUTION - 1)

  return {
    column: Math.round((x + SPAN / 2) / step),
    row:    Math.round((z + SPAN / 2) / step),
  }
}

type ReadAtReturnType = { depth: number, seaward: [number, number]}

function readAt (data: Uint8Array, x: number, z: number): ReadAtReturnType {
  const { column, row } = texelOf(x, z)
  const index           = (row * SHORE_RESOLUTION + column) * 4

  return {
    depth:   data[index] / 255,
    seaward: [ decodeUnit(data[index + 1]), decodeUnit(data[index + 2]) ],
  }
}


describe('the shore mask', () => {
  const data = maskOf(coneIsland())

  test('is one rgba texel per point of a square grid', () => {
    expect(data.length).toBe(SHORE_RESOLUTION * SHORE_RESOLUTION * 4)
  })

  test('the depth channel is the water over the ground, saturating at the reach', () => {
    // The cone crosses the waterline at r = 80.6 m; ten metres out from there
    // the ground is 0.9 m further down, which is 0.28 of the 3.2 m reach.
    const near = readAt(data, 91, 0)
    const far  = readAt(data, 200, 0)

    expect(near.depth * MAX_DEPTH).toBeCloseTo(0.94, 1)
    expect(far.depth).toBe(1)
    expect(readAt(data, 0, 0).depth).toBe(0)
  })

  /**
   * The claim the surf is built on, stated as a fact about the bytes.
   *
   * Every breaker in the scape is `-dot(seaward, swell)`, so if this channel is
   * anything other than "away from the land" the white water appears on the lee
   * shore and nothing about the picture says which way round it went. On a cone
   * the answer is the radial direction at every bearing, so it is checked at
   * every bearing.
   */
  test('the seaward channel points out to sea, all the way round', () => {
    for (let bearing = 0; bearing < 16; bearing += 1) {
      const angle          = bearing / 16 * Math.PI * 2
      const x              = Math.cos(angle) * 92
      const z              = Math.sin(angle) * 92
      const { seaward }    = readAt(data, x, z)
      const [ outX, outZ ] = [ Math.cos(angle), Math.sin(angle) ]
      const alignment      = seaward[0] * outX + seaward[1] * outZ

      expect(alignment).toBeGreaterThan(0.9)
    }
  })

  test('open sea has no shore to face, and says so', () => {
    // Past the reach the depth is clamped flat, so the difference is zero and
    // the vector decodes to nothing. That is what fades the surf out to sea
    // rather than leaving it pointing at whichever way the noise last leaned.
    const { seaward } = readAt(data, 180, 0)

    expect(Math.hypot(seaward[0], seaward[1])).toBeLessThan(0.02)
  })

  test('the bearing is a unit vector wherever there is a shore', () => {
    const { seaward } = readAt(data, 88, 0)

    expect(Math.hypot(seaward[0], seaward[1])).toBeCloseTo(1, 1)
  })

  test('the byte encoding spans the whole signed range', () => {
    // The shader's `shore.gb * 2.0 - 1.0` is `decodeUnit`, so the two ends and
    // the middle are what a bearing of exactly east, west or nothing has to
    // survive the trip as.
    expect(decodeUnit(255)).toBe(1)
    expect(decodeUnit(0)).toBe(-1)
    expect(decodeUnit(128)).toBeCloseTo(0, 2)
  })

  test('a coast with no water over it is not a shore', () => {
    // The waterline dropped below the cone entirely: dry ground everywhere, so
    // no depth, no gradient, and nothing for the surf to break on.
    const dry = maskOf(coneIsland(), -40)

    expect(readAt(dry, 92, 0).depth).toBe(0)
    expect(Math.hypot(...readAt(dry, 92, 0).seaward)).toBeLessThan(0.02)
  })

  test('two bakes of one field agree byte for byte', () => {
    expect(maskOf(coneIsland())).toEqual(data)
  })
})

describe('the shore mask, over the archipelago it is actually baked from', () => {
  const size = atmosphereQuality('desktop').shoreMask
  const span = SCAPE_CONFIG.archipelago.worldSize * 1.02
  const data = bakeShoreData(SCAPE_CONFIG, surveyArchipelago(SCAPE_CONFIG).field, span, size)

  /** Depth as the gpu reads it: bilinear, in texel coordinates. */
  function depthAt (column: number, row: number): number {
    const clamp  = (value: number): number => Math.max(0, Math.min(size - 1, value))
    const left   = clamp(Math.floor(column))
    const top    = clamp(Math.floor(row))
    const right  = clamp(left + 1)
    const under  = clamp(top + 1)
    const alongX = column - left
    const alongZ = row - top
    const texel  = (x: number, z: number): number => data[(z * size + x) * 4] / 255

    return (texel(left, top) * (1 - alongX) + texel(right, top) * alongX) * (1 - alongZ) +
      (texel(left, under) * (1 - alongX) + texel(right, under) * alongX) * alongZ
  }

  /**
   * The same claim, on ground nobody authored.
   *
   * A cone proves the arithmetic; this proves it against five warped coastlines,
   * fifteen skerries, a beck mouth and a tidal bar — the shapes the surf will
   * actually break on, and the ones a sign error would hide behind.
   *
   * Read bilinearly, deliberately, because that is the only read there is: the
   * mask has linear filtering on both axes, so what the surf sees at a coast is
   * never one texel's byte. Sampled by nearest texel this same claim fails on an
   * eighth of the shoreline — not because the bearing is wrong, but because a
   * coast that falls away sheer is one texel wide and its neighbours are dry
   * ground and open sea.
   */
  test('the seaward bearing walks into deeper water, everywhere there is a coast', () => {
    let shorelines = 0
    let wrong      = 0

    for (let row = 2; row < size - 2; row += 1)
      for (let column = 2; column < size - 2; column += 1) {
        const index   = (row * size + column) * 4
        const depth   = data[index] / 255
        const towardX = decodeUnit(data[index + 1])
        const towardZ = decodeUnit(data[index + 2])

        // The band the surf lives in: wet, and not yet out of its depth.
        if (depth <= 0.01 || depth >= 0.7 || Math.hypot(towardX, towardZ) < 0.5)
          continue

        shorelines += 1

        // A texel out against a texel back, rather than out against here — a
        // real coast is rugged at the scale it is sampled at, so "the next
        // sample is never shallower" is a claim about the noise, and "out to
        // sea is deeper than inland" is the claim the surf rests on.
        if (depthAt(column + towardX, row + towardZ) <= depthAt(column - towardX, row - towardZ))
          wrong += 1
      }

    // A coast this size has thousands of them; a bake that found none would
    // pass the ratio below by saying nothing at all.
    expect(shorelines).toBeGreaterThan(3_000)
    expect(wrong / shorelines).toBeLessThan(0.02)
  })

  /**
   * The scale rule, as a fact rather than as an intention.
   *
   * The mask covers the whole inhabited world, so its metres-per-texel is set
   * by two numbers that have moved independently: `archipelago.worldSize` and
   * the tier's `shoreMask`. A run that grows the world and leaves the mask
   * alone coarsens every shoreline in the scape and nothing says so — which is
   * exactly what happened between the 196-metre island and this archipelago.
   */
  test('the tiers that can hold the upload resolve it at better than two metres to a texel', () => {
    expect(span / (atmosphereQuality('desktop').shoreMask - 1)).toBeLessThan(2)
    expect(span / (atmosphereQuality('ultra').shoreMask - 1)).toBeLessThan(1.1)
  })

  test('and the cheap tiers give up resolution in order, never out of it', () => {
    const perTexel = ([ 'minimal', 'mobile', 'desktop', 'ultra' ] as const)
      .map(tier => span / (atmosphereQuality(tier).shoreMask - 1))

    // Coarser as the budget falls, and never coarser than the shore band the
    // ground itself is shelved over — past that the mask stops resolving the
    // beach the terrain went to the trouble of building.
    for (let index = 1; index < perTexel.length; index += 1)
      expect(perTexel[index]).toBeLessThan(perTexel[index - 1])

    expect(perTexel[0]).toBeLessThan(4.5)
  })

  test('is one rgba texel per point of the tier grid', () => {
    expect(data.length).toBe(size * size * 4)
  })
})
