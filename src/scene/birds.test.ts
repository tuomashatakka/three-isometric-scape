import { describe, expect, test } from 'bun:test'
import type { BufferAttribute } from 'three'
import { birdGeometry, birdsAloft } from './birds.ts'
import { SCAPE_CONFIG } from './config.ts'
import { surveyArchipelago } from './landscape/archipelago.ts'
import { planColonies } from './landscape/colony.ts'
import { LADDER, atmosphereQuality, unlockEffects } from './quality.ts'


const survey   = surveyArchipelago(SCAPE_CONFIG)
const colonies = planColonies(survey, SCAPE_CONFIG)
const COUNT    = 140
const geometry = birdGeometry(colonies, COUNT, 0x6c11)

const read = (name: string): BufferAttribute => geometry.getAttribute(name) as BufferAttribute


describe('the flock buffer', () => {
  test('is two wings of four corners for every bird', () => {
    expect(read('position').count).toBe(COUNT * 8)
    expect(geometry.getIndex()?.count).toBe(COUNT * 12)
  })

  test('carries an orbit and a bird beside every corner', () => {
    for (const name of [ 'position', 'aOrbit', 'aBird' ])
      expect(read(name).count).toBe(COUNT * 8)

    expect(read('aOrbit').itemSize).toBe(4)
    expect(read('aBird').itemSize).toBe(4)
  })

  test('is byte for byte the same buffer for the same seed', () => {
    const again = birdGeometry(colonies, COUNT, 0x6c11)

    for (const name of [ 'position', 'aOrbit', 'aBird' ])
      expect(Array.from(read(name).array)).toEqual(Array.from(
        (again.getAttribute(name) as BufferAttribute).array,
      ))

    expect(Array.from(geometry.getIndex()!.array)).toEqual(Array.from(again.getIndex()!.array))
  })

  test('and a different one for a different seed', () => {
    const other = birdGeometry(colonies, COUNT, 0x6c12)

    expect(Array.from((other.getAttribute('aOrbit') as BufferAttribute).array))
      .not.toEqual(Array.from(read('aOrbit').array))
  })

  /**
   * The claim the whole buffer rests on: a bird's ring is inside the ring the
   * survey fitted over open water. A bird placed outside it is a bird flying
   * over the beach, and no shader uniform can put it back.
   */
  test('every bird stays inside the colony it was dealt to', () => {
    const orbit = read('aOrbit')

    // Keyed through `fround` on both sides: the buffer is float32, so a centre
    // read back out of it is not the double the survey computed.
    const at    = (x: number, z: number): string => `${Math.fround(x)},${Math.fround(z)}`
    const radii = new Map(colonies.map(colony => [ at(colony.x, colony.z), colony.radius ]))

    for (let vertex = 0; vertex < orbit.count; vertex += 1) {
      const outer = radii.get(at(orbit.getX(vertex), orbit.getY(vertex)))

      expect(outer).toBeDefined()
      expect(orbit.getZ(vertex)).toBeGreaterThan(0)
      expect(orbit.getZ(vertex)).toBeLessThanOrEqual(Math.fround(outer!))
    }
  })

  test('the flock is dealt evenly rather than thrown at the colonies', () => {
    const orbit = read('aOrbit')
    const seen  = new Map<string, number>()

    // One vertex of the eight is enough to name the bird's colony.
    for (let bird = 0; bird < COUNT; bird += 1) {
      const key = `${orbit.getX(bird * 8)},${orbit.getY(bird * 8)}`

      seen.set(key, (seen.get(key) ?? 0) + 1)
    }


    const counts = [ ...seen.values() ]

    expect(seen.size).toBe(colonies.length)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
  })

  test('every wing beats about its own shoulder, so no span leaves the wing', () => {
    const position = read('position')

    for (let vertex = 0; vertex < position.count; vertex += 1) {
      expect(Math.abs(position.getX(vertex))).toBeLessThanOrEqual(1)
      expect(Math.abs(position.getY(vertex))).toBe(1)
    }
  })

  test('a coast with no colonies costs no vertices at all', () => {
    const empty = birdGeometry([], COUNT, 0x6c11)

    expect((empty.getAttribute('position') as BufferAttribute).count).toBe(0)
  })
})

describe('how much of the colony is up', () => {
  test('a full flock flies at noon in fair weather', () => {
    expect(birdsAloft(1, 1, 0)).toBeCloseTo(1, 5)
  })

  test('and none of it after dark, whatever the strength says', () => {
    expect(birdsAloft(1, 0, 0)).toBe(0)
    expect(birdsAloft(1, 0.05, 0)).toBe(0)
  })

  test('a squall keeps most of what is left on the water', () => {
    expect(birdsAloft(1, 1, 1)).toBeLessThan(birdsAloft(1, 1, 0))
    expect(birdsAloft(1, 1, 1)).toBeGreaterThan(0)
  })

  test('zero flight is the switch, at every hour and in every weather', () => {
    for (const day of [ 0, 0.3, 0.7, 1 ])
      for (const fall of [ 0, 0.5, 1 ])
        expect(birdsAloft(0, day, fall)).toBe(0)
  })

  test('the day only ever adds birds as it brightens', () => {
    let previous = -1

    for (let step = 0; step <= 20; step += 1) {
      const aloft = birdsAloft(1, step / 20, 0)

      expect(aloft).toBeGreaterThanOrEqual(previous)
      previous = aloft
    }
  })
})

describe('what a tier is asked for', () => {
  test('every tier names a whole, non-negative count', () => {
    for (const tier of LADDER) {
      const { birdCount } = atmosphereQuality(tier)

      expect(Number.isInteger(birdCount)).toBe(true)
      expect(birdCount).toBeGreaterThanOrEqual(0)
    }
  })

  /**
   * The point of unlocking is that a system a tier zeroed should exist. The
   * floor is a phone's flock rather than a workstation's, so the tier that
   * already spends more keeps its own.
   */
  test('unlocking puts birds on the tier that has none, without inflating the rest', () => {
    expect(unlockEffects(atmosphereQuality('minimal')).birdCount).toBeGreaterThan(0)

    for (const tier of LADDER) {
      const quality = atmosphereQuality(tier)

      expect(unlockEffects(quality).birdCount).toBeGreaterThanOrEqual(quality.birdCount)
    }

    expect(unlockEffects(atmosphereQuality('ultra')).birdCount)
      .toBe(atmosphereQuality('ultra').birdCount)
  })
})
