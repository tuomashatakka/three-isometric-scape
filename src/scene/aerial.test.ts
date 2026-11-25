import { describe, expect, test } from 'bun:test'
import { ShaderChunk } from 'three'
import {
  AIR_MIST,
  airHaze,
  AIR_SPECTRUM, GROUND_FOG_HEIGHT, aerialHaze, aerialHazeRgb, groundFog, groundFogAmount, groundFogBank, groundFogProfile, hazeRange,
  SEA_SMOKE_PER_MIST, installAerialPerspective, packFogFar, seaSmoke, seaSmokeShare, unpackFogFar,
} from './aerial.ts'
import { seaSmokeAmount } from './season.ts'


describe('aerial perspective', () => {
  const range = hazeRange(0.3)

  test('keeps the focus clear and hazes the far shore', () => {
    expect(aerialHaze(0, 0, 0, range, 42)).toBe(0)
    expect(aerialHaze(0, 20, 2, range, 42)).toBe(0)
    expect(aerialHaze(800, 0, 0, range, 42)).toBeGreaterThan(0.5)
  })

  test('is metre-sized: a close frame carries almost none', () => {
    expect(aerialHaze(25, 25, 0, range, 42)).toBeLessThan(0.02)
  })

  test('the far side of the focus is hazier than the near side', () => {
    expect(aerialHaze(400, 0, 0, range, 42)).toBeGreaterThan(aerialHaze(-400, 0, 0, range, 42))
  })

  test('summits stand out of the haze their feet are in', () => {
    expect(aerialHaze(800, 0, 100, range, 42)).toBeLessThan(aerialHaze(800, 0, 0, range, 42) / 3)
  })

  test('thickens with density and clamps the breath', () => {
    expect(hazeRange(0.8).far).toBeLessThan(range.far)
    expect(hazeRange(1, 2)).toEqual(hazeRange(0.94))
  })

  test('distance takes the blue first and keeps the brightness the grey haze had', () => {
    const [ r, g, b ] = aerialHazeRgb(500, 0, 0, range, 42)
    const grey        = aerialHaze(500, 0, 0, range, 42)

    expect(b).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(r)
    expect(Math.abs(0.2126 * r + 0.7152 * g + 0.0722 * b - grey)).toBeLessThan(0.01)
    expect(Math.abs(0.2126 * AIR_SPECTRUM[0] + 0.7152 * AIR_SPECTRUM[1] + 0.0722 * AIR_SPECTRUM[2] - 1)).toBeLessThan(0.01)
  })

  test('the focus stays clear in every channel', () => {
    expect(aerialHazeRgb(0, 0, 0, range, 42)).toEqual([ 0, 0, 0 ])
  })
})


describe('ground fog', () => {
  const amount = groundFogAmount(0.34)

  test('nothing lies on the water, and the strand is the thickest of it', () => {
    expect(groundFog(0, amount)).toBe(0)
    expect(groundFog(-3, amount)).toBe(0)
    expect(groundFog(1, amount)).toBeGreaterThan(0.3)
    expect(groundFogProfile(1)).toBeGreaterThan(groundFogProfile(0.2))
  })

  test('a ridge stands out of the fog its sill is in', () => {
    expect(groundFog(6, amount)).toBeLessThan(groundFog(1, amount) / 4)
    expect(groundFog(20, 3)).toBeLessThan(0.01)
    expect(groundFogProfile(1 + GROUND_FOG_HEIGHT)).toBeLessThan(groundFogProfile(1) / 2)
  })

  test('is off at zero and thickens with the mist', () => {
    expect(groundFogAmount(0)).toBe(0)
    expect(groundFog(1, 0)).toBe(0)
    expect(groundFog(1, groundFogAmount(1))).toBeGreaterThan(groundFog(1, amount))
    expect(groundFogAmount(0.34, 1, 0)).toBeCloseTo(groundFogAmount(0.34) * 1.8)
    expect(groundFogAmount(0.34, 1, 7)).toBe(groundFogAmount(0.34))
  })

  test('lies in banks: deterministic, bounded, and neither solid nor absent', () => {
    let low = 1,
      high  = 0,
      sum   = 0

    for (let x = -400; x <= 400; x += 16)
      for (let z = -400; z <= 400; z += 16) {
        const bank = groundFogBank(x, z)

        low  = Math.min(low, bank)
        high = Math.max(high, bank)
        sum += bank
      }

    expect(groundFogBank(31, -77)).toBe(groundFogBank(31, -77))
    expect(low).toBeGreaterThanOrEqual(0.12)
    expect(low).toBeLessThan(0.2)
    expect(high).toBeGreaterThan(0.95)
    expect(high).toBeLessThanOrEqual(1)
    expect(sum / 51 ** 2).toBeGreaterThan(0.35)
    expect(sum / 51 ** 2).toBeLessThan(0.75)
  })

  test('the chunk carries the waterline and reads the amount from fogNear, with no clear-radius uniform', () => {
    const before = { ...ShaderChunk }

    installAerialPerspective(120, -1.25)
    expect(ShaderChunk.fog_fragment).toContain('vAerial.z - -1.2500')
    expect(ShaderChunk.fog_fragment).toContain('fogGround * 0.0156 * vAerial.w')
    expect(ShaderChunk.fog_fragment).not.toContain('- fogNear')
    expect(ShaderChunk.fog_vertex).toContain('vAerial = vec4(')
    Object.assign(ShaderChunk, before)
  })
})


describe('sea smoke', () => {
  test('the extinction length and the smoke share one uniform and both come back out', () => {
    for (const far of [ 240, 777.4, 1800 ])
      for (const smoke of [ 0, 0.31, 0.9 ]) {
        const back = unpackFogFar(packFogFar(far, smoke))

        expect(back.far).toBe(Math.round(far))
        expect(back.smoke).toBeCloseTo(smoke, 4)
      }
  })

  test('lies on the water and is gone two metres up, where the ground fog is the reverse', () => {
    expect(seaSmoke(0, 1)).toBeGreaterThan(0.75)
    expect(seaSmoke(2.5, 1)).toBeLessThan(0.25)
    expect(groundFog(0, 1)).toBe(0)
  })

  test('is one knob with the mist: none at midsummer, none with the mist off, the old strength at the authored mist', () => {
    expect(seaSmokeShare(seaSmokeAmount(0.5), 0.34)).toBe(0)
    expect(seaSmokeShare(seaSmokeAmount(0.87), 0)).toBe(0)
    expect(0.34 * SEA_SMOKE_PER_MIST).toBeCloseTo(0.9, 2)
    expect(seaSmokeShare(seaSmokeAmount(0.87), 0.34)).toBeGreaterThan(0.5)
  })

  test('the fog chunk reads the smoke out of the fraction and the length out of the floor', () => {
    installAerialPerspective(80)

    expect(ShaderChunk.fog_fragment).toContain('floor( fogFar )')
    expect(ShaderChunk.fog_fragment).toContain('smokeAmount')
  })
})

describe('one air', () => {
  test('the haze rides the mist: the authored density at the opening mist, half with none, more in a bank', () => {
    expect(airHaze(0.3, AIR_MIST)).toBeCloseTo(0.3, 6)
    expect(airHaze(0.3, 0)).toBeCloseTo(0.15, 6)
    expect(airHaze(0.3, 1)).toBeGreaterThan(0.3)
  })
})
