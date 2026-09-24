import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import type { ScapeConfig } from '../config.ts'
import { freezeAmount } from '../season.ts'
import { surveyArchipelago } from './archipelago.ts'
import { fairwayClearance, floeExtent, planPackIce, sheetOver } from './packice.ts'


const clone  = (): ScapeConfig => structuredClone(SCAPE_CONFIG) as ScapeConfig
const config = clone()
const world  = surveyArchipelago(config)

/** The budget the desktop tier deals, which is what `scape:map` reports against. */
const BUDGET = 620

const floes = planPackIce(world, config, BUDGET)
const legs  = world.waterways.route.legs.map(leg => leg.points)


describe('the search for water a floe can stand on', () => {
  test('finds a field the tier can fill, and a little more than it', () => {
    // Both, because the pair is the search against the budget. A field short of
    // the budget is a search that has stopped offering water; a field the budget
    // does not reach into at all is a tier spending on plates it never draws.
    expect(floes.length).toBe(BUDGET)
    expect(planPackIce(world, config, 1e6).length).toBeGreaterThan(BUDGET)
  })

  test('never seats a plate in water too shallow to float it', () => {
    for (const floe of floes)
      expect(floe.depth).toBeGreaterThanOrEqual(config.pack.draught)
  })

  test('never seats a plate on ground the height field calls land', () => {
    for (const floe of floes)
      expect(world.field.heightAt(floe.x, floe.z)).toBeLessThan(config.terrain.waterLevel)
  })

  test('keeps every ferry leg open by the width the config asks for', () => {
    for (const floe of floes)
      expect(fairwayClearance(floe, legs)).toBeGreaterThanOrEqual(config.pack.fairway)
  })

  test('stands no plate on water the sheet has not closed over', () => {
    // The claim the whole system rests on. `sheetOver` is the surface's own
    // `scapeIce`, read at the plate's own place and at the week the plate says
    // it arrives, so this is the geometry and the shading agreeing about where
    // the sea is frozen rather than two numbers kept in step by hand.
    for (const floe of floes)
      expect(sheetOver(floe, config, floe.onset)).toBeGreaterThanOrEqual(config.pack.sheet - 1e-4)
  })

  test('refuses the whole archipelago when the gate asks for a cover the front never reaches', () => {
    const shut = clone()

    // Both, because either alone leaves water that still closes: a front held
    // right to the shallows never reaches a full cover anywhere a plate can
    // float, and a gate at a full cover refuses everything that front offers.
    shut.pack.sheet     = 1
    shut.water.iceReach = 1

    expect(planPackIce(world, shut, BUDGET)).toEqual([])
  })

  test('refuses the whole archipelago when nothing floats', () => {
    const dry = clone()

    dry.pack.draught = 200

    expect(planPackIce(world, dry, BUDGET)).toEqual([])
  })

  test('draws the pack back toward the shore when the front is held to the shallows', () => {
    const held = clone()

    held.water.iceReach = 0.95

    // The same survey: nothing in the archipelago's shape depends on the ice
    // front, which is the whole reason this knob can be read at plan time at
    // all.
    const shrunk = planPackIce(world, held, 1e6)
    const full   = planPackIce(world, config, 1e6)

    expect(shrunk.length).toBeLessThan(full.length * 0.1)
  })
})

describe('the deal', () => {
  test('is the same field twice for one seed', () => {
    expect(planPackIce(world, config, BUDGET)).toEqual(floes)
  })

  test('is a prefix, so a cheaper tier thins the pack rather than moving it', () => {
    // The tier rule. A phone's five hundred plates have to be five hundred of
    // the workstation's twelve hundred, in the places the workstation puts them
    // — an ordering by position would give the phone one solid raft and an empty
    // sound beside it.
    expect(planPackIce(world, config, 500)).toEqual(floes.slice(0, 500))
  })

  test('gives no plate a size that depends on the budget', () => {
    const wide = planPackIce(world, config, 1e6)

    for (const [ index, floe ] of floes.entries()) {
      expect(wide[index].length).toBe(floe.length)
      expect(wide[index].width).toBe(floe.width)
    }
  })

  test('deals plates across the range the raggedness asks for', () => {
    const lengths = floes.map(floe => floe.length)
    const mean    = lengths.reduce((sum, length) => sum + length, 0) / lengths.length

    expect(Math.min(...lengths)).toBeGreaterThan(config.pack.plate * 0.4)
    expect(Math.max(...lengths)).toBeLessThan(config.pack.plate * 1.6)
    expect(mean).toBeGreaterThan(config.pack.plate * 0.8)
    expect(mean).toBeLessThan(config.pack.plate * 1.2)
  })

  test('stands every plate on the water rather than in it', () => {
    for (const floe of floes) {
      expect(floe.rise).toBeCloseTo(floe.length * config.pack.rise, 10)
      expect(floe.rise).toBeGreaterThan(0)
      expect(floe.width).toBeLessThan(floe.length)
    }
  })

  test('spreads the field over the sea rather than round one island', () => {
    // Four quadrants of the world, and the thinnest of them still has a tenth
    // of the pack in it. The deal is ordered by a roll rather than by position
    // precisely so this survives a tier cut, and this is the statement of it.
    const quadrants = [ 0, 0, 0, 0 ]

    for (const floe of floes)
      quadrants[(floe.x < 0 ? 0 : 1) + (floe.z < 0 ? 0 : 2)] += 1

    for (const count of quadrants)
      expect(count).toBeGreaterThan(floes.length * 0.1)
  })
})

describe('the week the pack arrives', () => {
  test('is a summer with no ice standing on it at all', () => {
    for (const phase of [ 0.35, 0.5, 0.65 ]) {
      const freeze = freezeAmount(phase) * config.season.ice

      expect(floes.filter(floe => floeExtent(floe, freeze, 1) > 0)).toEqual([])
    }
  })

  test('is a midwinter with most of the field standing, and a harder one with all of it', () => {
    // Two numbers rather than one, because they say different things. The
    // authored year tops out at `season.ice`, so the outer pack — the water that
    // wants a harder winter than this coast gets — is surveyed and never
    // standing until the knob is turned up. A field that was entirely up at the
    // authored freeze would mean the search had stopped offering the outside.
    const authored = freezeAmount(0) * config.season.ice
    const hardest  = floes.filter(floe => floeExtent(floe, 1, 1) > 0.99)
    const standing = floes.filter(floe => floeExtent(floe, authored, 1) > 0.99)

    expect(standing.length).toBeGreaterThan(floes.length * 0.5)
    expect(standing.length).toBeLessThan(hardest.length)
    expect(hardest.length).toBeGreaterThan(floes.length * 0.8)
  })

  test('grows outward through the winter rather than arriving at once', () => {
    const counts = [ 0.55, 0.7, 0.85, 1 ]
      .map(freeze => floes.filter(floe => floeExtent(floe, freeze, 1) > 0).length)

    for (let index = 1; index < counts.length; index += 1)
      expect(counts[index]).toBeGreaterThan(counts[index - 1])
  })

  test('comes in lobes, so neighbours arrive together and opposite shores do not', () => {
    // The claim the front actually makes — see the note on `freezeToClose` in
    // `packice.ts`. The break-up field is nine hundred metres across, so two
    // plates within a plate's length of each other are inside a sixth of the
    // freeze of each other — which, on a curve that runs from open water to a
    // shut sound in a fortnight, is the same few days — and the archipelago as a
    // whole is not.
    const spread = Math.max(...floes.map(floe => floe.onset)) -
      Math.min(...floes.map(floe => floe.onset))

    expect(spread).toBeGreaterThan(0.3)

    for (const floe of floes.slice(0, 120)) {
      const near = floes.filter(other =>
        other !== floe && Math.hypot(other.x - floe.x, other.z - floe.z) < 30)

      for (const other of near)
        expect(Math.abs(other.onset - floe.onset)).toBeLessThan(0.16)
    }
  })
})

describe('the cover dial', () => {
  test('is the switch, and takes the pack away without moving what is left', () => {
    const freeze = freezeAmount(0) * config.season.ice

    expect(floes.filter(floe => floeExtent(floe, freeze, 0) > 0)).toEqual([])

    const half = floes.filter(floe => floeExtent(floe, freeze, 0.5) > 0)
    const all  = floes.filter(floe => floeExtent(floe, freeze, 1) > 0)

    expect(half.length).toBeGreaterThan(0)
    expect(half.length).toBeLessThan(all.length)

    // Thinned, never reshuffled: every plate standing at half cover is standing
    // at full cover too, in the same place.
    for (const floe of half)
      expect(all).toContain(floe)
  })
})

describe('the lead the ferries keep open', () => {
  test('measures to a leg rather than to its ends', () => {
    const leg = [[{ x: -10, z: 0 }, { x: 10, z: 0 }]]

    expect(fairwayClearance({ x: 0, z: 4 }, leg)).toBeCloseTo(4, 10)
    expect(fairwayClearance({ x: 14, z: 0 }, leg)).toBeCloseTo(4, 10)
    expect(fairwayClearance({ x: 0, z: 0 }, leg)).toBeCloseTo(0, 10)
  })

  test('is open water with no route in the world', () => {
    expect(fairwayClearance({ x: 0, z: 0 }, [])).toBe(Infinity)
  })
})
