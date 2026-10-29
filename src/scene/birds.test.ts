import { describe, expect, test } from 'bun:test'
import type { BufferAttribute } from 'three'
import { beatEffort, birdGeometry, birdsAloft, dealFlock, flockSeats } from './birds.ts'
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

  /**
   * Dealt by weight rather than thrown at the colonies.
   *
   * The deal was flat until the bird cliffs were given rings, and the test that
   * said so compared the fullest ring with the emptiest. That is now a
   * comparison between a cliff and a harbour, which are not the same quantity
   * of bird on purpose — so the claim is stated *within* a weight instead, plus
   * the one it always carried: no ring the survey sited is left empty.
   */
  test('the flock is dealt by weight, and no ring the survey sited is left empty', () => {
    const orbit = read('aOrbit')
    const seen  = new Map<string, number>()

    // One vertex of the eight is enough to name the bird's colony.
    for (let bird = 0; bird < COUNT; bird += 1) {
      const key = `${orbit.getX(bird * 8)},${orbit.getY(bird * 8)}`

      seen.set(key, (seen.get(key) ?? 0) + 1)
    }

    expect(seen.size).toBe(colonies.length)

    for (const weight of new Set(colonies.map(colony => colony.wheel))) {
      const counts = colonies
        .filter(colony => colony.wheel === weight)
        .map(colony => seen.get(`${Math.fround(colony.x)},${Math.fround(colony.z)}`) ?? 0)

      expect(Math.min(...counts)).toBeGreaterThan(0)
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
    }
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

describe('the wingbeat and the wind it is held against', () => {
  test('a still day is a beat the bird makes on its own', () => {
    expect(beatEffort(0)).toBeCloseTo(0.72, 6)
  })

  test('beats harder the harder it blows, and stops asking past a gale', () => {
    expect(beatEffort(1)).toBeGreaterThan(beatEffort(0))
    expect(beatEffort(2)).toBeGreaterThan(beatEffort(1))
    expect(beatEffort(9)).toBeCloseTo(beatEffort(2), 6)
  })

  test('never stops the wings, because that is `birds.flap`’s job and not the wind’s', () => {
    for (const strength of [ 0, 0.5, 1, 3 ])
      expect(beatEffort(strength)).toBeGreaterThan(0)
  })
})

/**
 * The deal, which stopped being flat when the cliffs were given rings.
 *
 * A budget that does not add up is the bug this would hide: a share lost to
 * rounding is a bird the archipelago silently does not have, and it is a
 * *different* bird every time the scape gains an island.
 */
describe('dealing the flock across the rings', () => {
  test('every bird in the budget is dealt to somebody', () => {
    for (const weights of [[ 1, 1, 1 ], [ 3, 1, 1 ], [ 5, 2, 2, 1, 1, 1 ], [ 1 ]])
      for (const count of [ 0, 1, 7, 90, 140, 421 ])
        expect(dealFlock(weights, count).reduce((sum, birds) => sum + birds, 0)).toBe(count)
  })

  /** The flat deal this scape had before the weights, to the bird. */
  test('equal weights deal exactly what a round robin dealt', () => {
    for (const rings of [ 2, 3, 7, 12 ])
      for (const count of [ 0, 5, 140 ]) {
        const flat  = Array.from({ length: count }, (_, which) => which % rings)
        const tally = Array.from({ length: rings }, (_, ring) =>
          flat.filter(seat => seat === ring).length)

        expect(dealFlock(Array.from({ length: rings }, () => 1), count)).toEqual(tally)
      }
  })

  test('a heavier ring takes proportionally more, to within a bird', () => {
    const share = dealFlock([ 3, 1, 1 ], 140)

    expect(share[0]).toBeCloseTo(84, -1)
    expect(share[1]).toBe(share[2])
    expect(share[0]).toBeGreaterThan(share[1] * 2)
  })

  /** A weight of zero is a ring nothing flies over — and still a ring. */
  test('a ring asked for nothing gets nothing', () => {
    expect(dealFlock([ 1, 0, 1 ], 10)).toEqual([ 5, 0, 5 ])
  })

  test('no weight anywhere is a budget with nowhere to go, not an empty sky', () => {
    expect(dealFlock([ 0, 0 ], 10).reduce((sum, birds) => sum + birds, 0)).toBe(10)
  })

  test('the seats are the deal, laid out one round of the robin at a time', () => {
    const seats = flockSeats([ 3, 1 ], 8)

    expect(seats.length).toBe(8)
    expect(seats.filter(seat => seat === 0).length).toBe(6)
    expect(seats.slice(0, 2)).toEqual([ 0, 1 ])
  })
})


/**
 * The band, which is the whole of what a cliff flock is.
 *
 * `aPerch` is the one attribute that says a bird is off a face rather than over
 * the sea, and it says it twice — metres of air in `x`, and the flag the
 * fragment stage fades the year with in `y`. Both halves are stated here
 * because a bird with one and not the other is either a gull at sea level or a
 * cliff that never empties, and neither reads as wrong in a still.
 */
describe('the birds pinned to a face', () => {
  const ledges = colonies.filter(colony => colony.kind === 'ledge')
  const perch  = read('aPerch')
  const flier  = read('aBird')

  test('the buffer carries a perch beside every corner', () => {
    expect(perch.count).toBe(COUNT * 8)
    expect(perch.itemSize).toBe(2)
  })

  test('the archipelago has a cliff to fly off', () => {
    expect(ledges.length).toBeGreaterThan(0)
  })

  /**
   * Every bird is one kind or the other and never both: a pinned bird reads no
   * ceiling and a gull reads no metres, so `birds.ceiling` cannot lift a colony
   * off its rock and a band cannot drag a harbour flock into the sea.
   */
  test('a bird takes its height from the band or from the ceiling, never from both', () => {
    for (let vertex = 0; vertex < perch.count; vertex += 1) {
      const cliff = perch.getY(vertex)

      expect([ 0, 1 ]).toContain(cliff)

      if (cliff === 1)
        expect(flier.getY(vertex)).toBe(0)
      else
        expect(perch.getX(vertex)).toBe(0)
    }
  })

  test('every pinned bird is inside the band its own cliff gave it', () => {
    const bands = ledges.map(colony => colony.band!)
    const low   = Math.min(...bands.map(band => band.low))
    const high  = Math.max(...bands.map(band => band.high))

    const pinned = Array.from({ length: perch.count }, (_, vertex) => vertex)
      .filter(vertex => perch.getY(vertex) === 1)
      .map(vertex => perch.getX(vertex))

    expect(pinned.length).toBeGreaterThan(0)
    expect(Math.min(...pinned)).toBeGreaterThanOrEqual(low)
    expect(Math.max(...pinned)).toBeLessThanOrEqual(high)
  })

  /**
   * The headline, as a count. A cliff ring is dealt `ledges.flock` times what a
   * harbour ring is, so the densest thing on this coast is also the densest
   * thing in the air over it.
   */
  test('the cliffs carry more of the flock than the harbours do', () => {
    const share    = dealFlock(colonies.map(colony => colony.wheel), COUNT)
    const onCliffs = share
      .filter((_, which) => colonies[which].kind === 'ledge')
      .reduce((sum, birds) => sum + birds, 0)

    expect(onCliffs).toBeGreaterThan(COUNT - onCliffs)
  })

  test('the same seed deals the same buffer, byte for byte', () => {
    const again = birdGeometry(colonies, COUNT, 0x6c11).getAttribute('aPerch') as BufferAttribute

    expect(Array.from(again.array)).toEqual(Array.from(perch.array))
  })
})
