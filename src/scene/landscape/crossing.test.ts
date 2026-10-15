import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { surveyArchipelago } from './archipelago.ts'
import { solveCrossings } from './crossing.ts'
import type { CrossingOptions, CrossingSite } from './crossing.ts'


const archipelago = surveyArchipelago(SCAPE_CONFIG)
const knobs       = SCAPE_CONFIG.crossing

/** Every island's crossings, with the island they came off. */
const surveyed = archipelago.landmasses.map(landmass => ({
  id:        landmass.id,
  crossings: landmass.survey.crossings,
  field:     landmass.survey.field,
  layout:    landmass.survey.layout,
}))

const built = surveyed.flatMap(island =>
  island.crossings.bridges.map(bridge => ({ ...island, bridge })))

/** The water a bridge was asked to clear, by the same rule the survey used. */
function sheetUnder (island: typeof surveyed[number], bridge: CrossingSite): number {
  const level = SCAPE_CONFIG.terrain.waterLevel

  return bridge.over === 'beck'
    ? Math.max(island.field.heightAt(bridge.x, bridge.z) + SCAPE_CONFIG.beck.depth, level)
    : level
}

/** A straight channel across a flat world, for the gates that need no island. */
function plain (over: Partial<CrossingOptions> = {}): CrossingOptions {
  return {
    creek:      null,
    ways:       [],
    // A gut four metres across with a metre of water in it and level banks.
    heightAt:   (x: number) => Math.abs(x) < 2 ? -1 : 1,
    water:      SCAPE_CONFIG.beck.depth,
    waterLevel: 0,
    landing:    knobs.landing,
    span:       knobs.span,
    least:      knobs.least,
    step:       knobs.step,
    freeboard:  knobs.freeboard,
    most:       knobs.most,
    ...over,
  }
}

describe('the crossings', () => {
  // The claims this run makes, each stated as a fact about the data rather than
  // as a re-implementation of the code that produced it.

  test('the archipelago bridges something', () => {
    // The whole structure's reason to exist. If this ever goes to zero the
    // survey has stopped finding crossings, not the farm stopped making them.
    expect(built.length).toBeGreaterThan(0)
  })

  test('no deck stands lower than a freeboard over its own water', () => {
    for (const island of built) {
      const clear = island.bridge.deck - sheetUnder(island, island.bridge)

      expect(clear).toBeGreaterThanOrEqual(knobs.freeboard - 1e-6)
      expect(island.bridge.freeboard).toBeCloseTo(clear, 5)
    }
  })

  test('both ends of every deck stand on ground, not in the water', () => {
    // The thing a picture shows and a number has to state: an abutment standing
    // in the stream is a bridge the ground never agreed to.
    for (const island of built) {
      const { near, far } = island.bridge
      const sheet         = sheetUnder(island, island.bridge)

      expect(island.field.heightAt(near.x, near.z)).toBeGreaterThanOrEqual(sheet)
      expect(island.field.heightAt(far.x, far.z)).toBeGreaterThanOrEqual(sheet)
    }
  })

  test('a level deck is never asked to reach between banks it cannot', () => {
    for (const island of built) {
      const { near, far } = island.bridge
      const fall          = Math.abs(
        island.field.heightAt(near.x, near.z) - island.field.heightAt(far.x, far.z))

      expect(fall).toBeLessThanOrEqual(knobs.step + 1e-6)
    }
  })

  test('every span is inside what a bridge will carry, and over real water', () => {
    for (const { bridge } of built) {
      expect(bridge.span).toBeLessThanOrEqual(knobs.span)
      expect(bridge.span).toBeCloseTo(
        Math.hypot(bridge.far.x - bridge.near.x, bridge.far.z - bridge.near.z), 6)
      expect(bridge.wet).toBeGreaterThanOrEqual(knobs.least)
      expect(bridge.wet).toBeLessThan(bridge.span)
    }
  })

  test('no island builds more than the farm has timber for', () => {
    for (const island of surveyed)
      expect(island.crossings.bridges.length).toBeLessThanOrEqual(knobs.most)
  })

  test('every ford either carries a bridge or says why it does not', () => {
    // The instrument's own contract. A ford with neither is a crossing that
    // vanished out of the survey between being found and being reported.
    for (const island of surveyed) {
      const decked = island.crossings.bridges.length
      const clean  = island.crossings.fords.filter(ford => ford.refused === null).length

      expect(clean).toBe(decked)

      for (const ford of island.crossings.fords)
        expect(ford.refused === null || [ 'tidal', 'dry', 'wide', 'uneven', 'budget' ]
          .includes(ford.refused)).toBe(true)
    }
  })

  test('a crossing in the beck knows where down the course it is', () => {
    for (const { bridge } of built)
      if (bridge.over === 'beck') {
        expect(bridge.course).not.toBeNull()
        expect(bridge.course!).toBeGreaterThanOrEqual(0)
        expect(bridge.course!).toBeLessThanOrEqual(1)
      }
      else
        expect(bridge.course).toBeNull()
  })

  test('the same ground settles the same crossings', () => {
    // On the fixture rather than on a second archipelago survey, which takes
    // half a minute: what is being tested is that this solver has no state and
    // no iteration-order dependence, and the whole-scape determinism is already
    // the archipelago's own test.
    const ways  = [{ points: [{ x: -8, z: 0 }, { x: 0, z: 0 }, { x: 8, z: 0 }], kind: 'foot' as const }]
    const first = solveCrossings(plain({ ways }))
    const again = solveCrossings(plain({ ways }))

    expect(JSON.stringify(again)).toBe(JSON.stringify(first))
    expect(first.bridges).toHaveLength(1)
  })

  test('the road outranks a tread at the same water', () => {
    // The fold rule, which is the one place two findings have to become one
    // structure. A deck both go over is the cart's deck, however many treads
    // also use it.
    const way         = [{ x: -8, z: 0 }, { x: 0, z: 0 }, { x: 8, z: 0 }]
    const { bridges } = solveCrossings(plain({
      ways: [
        { points: way, kind: 'foot' },
        { points: way.map(point => ({ x: point.x, z: point.z + 0.4 })), kind: 'cart' },
      ],
    }))

    expect(bridges).toHaveLength(1)
    expect(bridges[0].kind).toBe('cart')
    expect(bridges[0].routes).toBe(2)
  })

  test('the budget is the last refusal, and it names itself', () => {
    const across = (z: number) => ({
      points: [{ x: -8, z }, { x: 0, z }, { x: 8, z }],
      kind:   'foot' as const,
    })

    const { fords, bridges } = solveCrossings(plain({
      // Three crossings, each far enough apart not to fold into its neighbour.
      ways: [ across(0), across(30), across(60) ],
      most: 1,
    }))

    expect(bridges).toHaveLength(1)
    expect(fords.filter(ford => ford.refused === 'budget')).toHaveLength(2)
  })

  test('a stream you step over gets no deck', () => {
    const { fords, bridges } = solveCrossings(plain({
      // A groove a hand's breadth across: wet, and not worth timber.
      heightAt: (x: number) => Math.abs(x) < 0.2 ? -1 : 1,
      ways:     [{ points: [{ x: -8, z: 0 }, { x: 0, z: 0 }, { x: 8, z: 0 }], kind: 'foot' }],
    }))

    expect(bridges).toHaveLength(0)
    expect(fords[0]?.refused).toBe('dry')
  })

  test('an open shore is refused rather than decked', () => {
    // The seaward hand never finds firm ground, which is how a beach refuses
    // itself without needing a rule about beaches.
    const { fords, bridges } = solveCrossings(plain({
      heightAt: (x: number) => x * 0.05,
      ways:     [{ points: [{ x: -40, z: 0 }, { x: 0, z: 0 }, { x: 40, z: 0 }], kind: 'cart' }],
    }))

    expect(bridges).toHaveLength(0)
    expect(fords[0]?.refused).toBe('wide')
  })
})
