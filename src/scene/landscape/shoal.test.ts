import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { SURVEY_BUDGET_MS, surveyArchipelago } from './archipelago.ts'
import { solveCoastline } from './coast.ts'
import { MAX_DEPTH } from './shore-mask.ts'
import { WADE, surveyShoals } from './shoal.ts'


const archipelago       = surveyArchipelago(SCAPE_CONFIG)
const shoals            = archipelago.shoals
const { shoals: banks } = shoals

const { waterLevel, seabedDrop } = SCAPE_CONFIG.terrain
const seabed                     = waterLevel - seabedDrop
const spring                     = SCAPE_CONFIG.tide.range * 0.5

/** Walk one bank's own footprint, a metre a step, in world coordinates. */
function* footprint (index: number): Generator<{ x: number, z: number, along: number, across: number }> {
  const bank = banks[index]
  const half = bank.halfWidth * (1 + bank.spread)

  for (let along = 0; along <= bank.length; along += 1)
    for (let across = -half; across <= half; across += 1)
      yield {
        along,
        across,
        x: bank.root.x + Math.cos(bank.bearing) * along - Math.sin(bank.bearing) * across,
        z: bank.root.z + Math.sin(bank.bearing) * along + Math.cos(bank.bearing) * across,
      }
}

describe('the banks the archipelago sheds', () => {
  test('one an island, on the islands the sound leaves room for', () => {
    // The headline as a fact about the data. Five of the six shed a bank and
    // the sixth is refused rather than stubbed — see `shoals.minReach`.
    expect(banks.map(bank => bank.island)).toEqual([ 'home', 'meadow', 'sound', 'fell', 'shield' ])

    for (const bank of banks)
      expect(bank.length).toBeGreaterThanOrEqual(SCAPE_CONFIG.shoals.minReach)
  })

  test('every bank leaves the waterline of the island that shed it', () => {
    // A spit comes off a coast. A bar that starts in open water is a different
    // landform and would read as one, so this is the claim the root has to keep.
    for (const bank of banks) {
      const island = archipelago.landmasses.find(landmass => landmass.id === bank.island)!
      const ground = island.survey.field.heightAt(
        bank.root.x - island.origin.x,
        bank.root.z - island.origin.z,
      )

      // Under water, and within a wade of the last dry metre on its bearing:
      // the root is walked out from the coastline until the island's own ground
      // gives up, so a bank leaves the sea rather than a cliff top, and leaves
      // it at the shore rather than out in the sound. See `WADE` in `shoal.ts`.
      const local = Math.hypot(bank.root.x - island.origin.x, bank.root.z - island.origin.z)
      const dry   = solveCoastline(island.config).shoreAt(Math.atan2(
        bank.root.z - island.origin.z,
        bank.root.x - island.origin.x,
      ))

      expect(ground).toBeLessThan(waterLevel)
      expect(local).toBeGreaterThan(dry - 1e-6)
      expect(local - dry).toBeLessThanOrEqual(WADE)
    }
  })
})

describe('a bank is water, and stays water', () => {
  test('no bank dries, even at the bottom of a spring tide', () => {
    // The one thing that would break the scape rather than look wrong: nothing
    // draws a bank, so a crest that came out of the water would be a hole in
    // the sea with the seabed quad nine metres down at the bottom of it.
    for (let index = 0; index < banks.length; index += 1)
      for (const point of footprint(index)) {
        const height = shoals.heightAt(point.x, point.z)

        expect(height).toBeLessThanOrEqual(waterLevel - spring - SCAPE_CONFIG.shoals.dry)
      }
  })

  test('the crest stands exactly where the config asked, and only on the plateau', () => {
    const [ first ] = banks
    const crown     = shoals.heightAt(first.root.x, first.root.z)

    expect(waterLevel - crown).toBeCloseTo(first.crest, 6)

    // And falls away to the seabed at both ends of its own footprint, so the
    // bank has a shape rather than an edge. The tip is the harder of the two:
    // it is where a taper that stopped short would leave a step in the depth
    // channel, and the surf reads that channel's gradient.
    const tipX = first.root.x + Math.cos(first.bearing) * first.length
    const tipZ = first.root.z + Math.sin(first.bearing) * first.length

    expect(shoals.heightAt(tipX, tipZ)).toBeCloseTo(seabed, 6)
  })

  test('a crest that would dry is refused rather than clamped', () => {
    const drying = surveyShoals(
      { ...SCAPE_CONFIG, shoals: { ...SCAPE_CONFIG.shoals, crest: spring }},
      archipelago.landmasses,
    )

    expect(drying.shoals).toEqual([])
  })

  test('zero reach is the off switch, and there is no second one', () => {
    const none = surveyShoals(
      { ...SCAPE_CONFIG, shoals: { ...SCAPE_CONFIG.shoals, reach: 0 }},
      archipelago.landmasses,
    )

    expect(none.shoals).toEqual([])
    expect(none.heightAt(banks[0].root.x, banks[0].root.z)).toBe(seabed)
  })
})

describe('a bank can be seen', () => {
  test('most of every bank stands in water the depth mask can still resolve', () => {
    // The claim the run is actually making. A bank under `MAX_DEPTH` of water
    // is in the field, in the ferry grid and in the report while being the same
    // flat blue as the sound beside it — which is the failure mode this whole
    // profile is shaped against, and it is invisible in a still by definition.
    for (let index = 0; index < banks.length; index += 1) {
      let shelf = 0
      let total = 0

      for (const point of footprint(index)) {
        total += 1

        if (waterLevel - archipelago.field.heightAt(point.x, point.z) < MAX_DEPTH)
          shelf += 1
      }

      // Against the bank's whole bounding footprint, which is the honest
      // denominator: the rectangle is as wide at the root as it is at the tip
      // and the bank is not, so a third of it is what a spit that fans out can
      // ever fill.
      expect(shelf / total).toBeGreaterThan(0.3)
      expect(shelf).toBeGreaterThan(3_000)
    }
  })

  test('the crest is inside the surf band at every state of the tide', () => {
    // Broken water over the bank is half of what the run claims to have added,
    // and it is `water.surfDepth` that decides whether there is any: past that
    // depth the swell does not feel the bottom and nothing stands up.
    for (const bank of banks)
      expect(bank.crest + spring).toBeLessThan(SCAPE_CONFIG.water.surfDepth)
  })
})

describe('a bank is folded in like the bar and the guard', () => {
  test('it raises the seabed it lies on and cuts into nothing', () => {
    const bare = surveyShoals(
      { ...SCAPE_CONFIG, shoals: { ...SCAPE_CONFIG.shoals, reach: 0 }},
      archipelago.landmasses,
    )

    for (let index = 0; index < banks.length; index += 1)
      for (const point of footprint(index)) {
        expect(archipelago.field.heightAt(point.x, point.z))
          .toBeGreaterThanOrEqual(bare.heightAt(point.x, point.z))
        expect(shoals.heightAt(point.x, point.z)).toBeGreaterThanOrEqual(seabed)
      }
  })

  test('the ferry lanes still keep their clearance over every bank', () => {
    // The banks are in the field before the waterways are planned over it, so
    // this is a claim about the order they are surveyed in as much as about the
    // crest. A bank shallower than the lanes need would reroute the fleet, and
    // a bank shallower than `boats.clearance` would strand it.
    expect(archipelago.waterways.minimumClearance)
      .toBeGreaterThanOrEqual(SCAPE_CONFIG.boats.clearance)

    for (const leg of archipelago.waterways.route.legs)
      for (const point of leg.points)
        expect(waterLevel - archipelago.field.heightAt(point.x, point.z))
          .toBeGreaterThan(SCAPE_CONFIG.boats.clearance)
  })
})

describe('the banks are deterministic', () => {
  test('a second survey of the same seed lands them byte for byte', () => {
    const again = surveyShoals(SCAPE_CONFIG, archipelago.landmasses)

    expect(again.shoals).toEqual(banks)
  }, SURVEY_BUDGET_MS)

  test('the field is a pure function of the point', () => {
    for (const point of footprint(0))
      expect(shoals.heightAt(point.x, point.z)).toBe(shoals.heightAt(point.x, point.z))
  })
})
