import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import type { ScapeConfig } from '../config.ts'
import { tideAmplitudeAt } from '../tide.ts'
import { SURVEY_BUDGET_MS, surveyArchipelago, toWorld } from './archipelago.ts'
import { kelpDepth, kelpLean, kelpPlants, planKelp } from './kelpbed.ts'
import type { KelpPlant } from './kelpbed.ts'


const clone  = (): ScapeConfig => structuredClone(SCAPE_CONFIG) as ScapeConfig
const config = clone()
const world  = surveyArchipelago(config)
const water  = config.terrain.waterLevel
const spring = tideAmplitudeAt(1, config.tide)

/** The budget the desktop tier deals, which is what `scape:map` reports against. */
const BUDGET = 250

const skirts = planKelp(world, config, BUDGET)
const plants = kelpPlants(skirts)

/** How high the tip of a plant stands, at a state of the tide. */
function headOf (plant: KelpPlant, tide: number): number {
  return plant.bed + plant.length * Math.cos(kelpLean(kelpDepth(plant, water, tide), plant.length))
}

/** The mean lean of the whole archipelago's weed, in radians. */
function meanLean (tide: number): number {
  return plants.reduce(
    (sum, plant) => sum + kelpLean(kelpDepth(plant, water, tide), plant.length),
    0,
  ) / plants.length
}


describe('where the weed grows', () => {
  test('the search finds beds on every coast', () => {
    expect(skirts.length).toBe(world.landmasses.length)
    expect(plants.length).toBeGreaterThan(100)

    for (const skirt of skirts)
      expect(skirt.plants.length).toBeGreaterThan(0)
  }, SURVEY_BUDGET_MS)

  test('every plant stands in water between the sill and the reach', () => {
    const { sill, reach } = config.kelp

    // The whole siting rule, as a fact about the data. Written against mean
    // water because that is the water the survey was run against — what the
    // tide does to a plant afterwards is the lean's business and not the
    // placement's.
    for (const plant of plants) {
      const depth = kelpDepth(plant, water, 0)

      expect(depth).toBeGreaterThanOrEqual(sill)
      expect(depth).toBeLessThanOrEqual(reach)
    }
  }, SURVEY_BUDGET_MS)

  test('a plant is longer than the water it grew in, by the ratio asked for', () => {
    for (const plant of plants)
      expect(plant.length).toBeCloseTo(kelpDepth(plant, water, 0) * config.kelp.over, 6)
  }, SURVEY_BUDGET_MS)

  test('the harbours are kept cut', () => {
    // The claim `kelp.clear` exists to make: there is no weed in the one place
    // in the parish where boats come alongside.
    for (const landmass of world.landmasses) {
      if (!landmass.survey.landing)
        continue

      const jetty = toWorld(landmass, landmass.survey.landing)

      for (const plant of plants)
        expect(Math.hypot(plant.x - jetty.x, plant.z - jetty.z))
          .toBeGreaterThanOrEqual(config.kelp.clear)
    }
  }, SURVEY_BUDGET_MS)

  test('no coast wears an unbroken ring of weed', () => {
    // The claim `kelp.bare` exists to make. A skirt of one bed is a rubber ring
    // round an island, which is the one shape a kelp bed never has — and it is
    // what the meadow's coast actually came out as at the first value tried, so
    // this is a measurement rather than an assumption.
    for (const skirt of skirts)
      expect(skirt.beds).toBeGreaterThan(1)
  }, SURVEY_BUDGET_MS)

  test('the clearings are what breaks the skirt up, and what thins it', () => {
    const calm     = clone()
    calm.kelp.bare = 0

    const unbroken = planKelp(world, calm, BUDGET)
    const beds     = (of: readonly { beds: number }[]): number =>
      of.reduce((sum, skirt) => sum + skirt.beds, 0)
    const offered  = (of: readonly { offered: number }[]): number =>
      of.reduce((sum, skirt) => sum + skirt.offered, 0)

    // Two directions, because a clearing does two things and a test of one of
    // them would pass on a field that had quietly stopped cutting: it takes
    // weed *out* of the band, and in doing so it cuts one run of coast into
    // several. Stated as a relation between two scapes rather than as a count,
    // so retuning the field moves both sides together.
    expect(beds(skirts)).toBeGreaterThan(beds(unbroken))
    expect(offered(skirts)).toBeLessThan(offered(unbroken))
  }, SURVEY_BUDGET_MS)

  test('a sea with no depth the weed will take has no beds at all', () => {
    const bare      = clone()
    bare.kelp.reach = 0

    expect(planKelp(world, bare, BUDGET)).toEqual([])
    expect(planKelp(world, config, 0)).toEqual([])
  }, SURVEY_BUDGET_MS)

  test('one seed lays the same beds twice', () => {
    const again = kelpPlants(planKelp(world, clone(), BUDGET))

    expect(again).toEqual([ ...plants ])
  }, SURVEY_BUDGET_MS)
})


describe('what the tier buys', () => {
  const thin = kelpPlants(planKelp(world, config, 12))

  test('a phone gets weed on every coast rather than one island of it', () => {
    // The point of the golden-ratio ordering: a prefix of the walk is one side
    // of one island, and a tier thinned that way would leave five of the six
    // coasts bare.
    expect(new Set(thin.map(plant => plant.island)).size).toBe(world.landmasses.length)
  }, SURVEY_BUDGET_MS)

  test('raising the budget adds plants without moving the ones already there', () => {
    const kept = new Set(plants.map(plant => `${plant.x},${plant.z}`))

    for (const plant of thin)
      expect(kept.has(`${plant.x},${plant.z}`)).toBe(true)
  }, SURVEY_BUDGET_MS)
})


describe('what the tide does to it', () => {
  test('no plant ever stands out of the water, at any state of the tide', () => {
    // The invariant the whole system rests on, and the reason the lean is an
    // arccosine rather than a knob: the tip of a leaning plant is *at* the
    // surface by construction, so a bed that could stand up too far would push
    // several hundred heads through the top of the sea twice a cycle.
    for (const tide of [ -spring, -spring * 0.5, 0, spring * 0.5, spring ])
      for (const plant of plants)
        expect(headOf(plant, tide)).toBeLessThanOrEqual(water + tide + 1e-9)
  }, SURVEY_BUDGET_MS)

  test('the canopy lies over at low water and stands up at high', () => {
    // The relation, as a fact rather than as an intention. Two states of one
    // tide, which is the thing no still can show.
    expect(meanLean(-spring)).toBeGreaterThan(meanLean(spring))
  }, SURVEY_BUDGET_MS)

  test('a plant in water deeper than itself stands straight up', () => {
    expect(kelpLean(9, 4)).toBe(0)
  })

  test('a plant the sea has left lies flat rather than inverting', () => {
    expect(kelpLean(0, 4)).toBeCloseTo(Math.PI * 0.5, 6)
    expect(kelpLean(-2, 4)).toBeCloseTo(Math.PI * 0.5, 6)
  })
})
