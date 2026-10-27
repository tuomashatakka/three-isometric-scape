import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import type { ScapeConfig } from '../config.ts'
import { surveyArchipelago } from './archipelago.ts'
import { HJELL_CLEARING, findHjellRun, fishHung, hjellHung, planHjellCatch } from './hjell.ts'
import type { HjellRun, HjellSearch } from './hjell.ts'
import { STEADING_BUILDINGS } from './steading.ts'


const clone  = (): ScapeConfig => structuredClone(SCAPE_CONFIG) as ScapeConfig
const config = clone()
const world  = surveyArchipelago(config)
const water  = config.terrain.waterLevel

/** The budget the desktop tier deals, which is what `scape:map` reports against. */
const BUDGET = 680

const runs = world.landmasses
  .map(landmass => landmass.survey.hjell)
  .filter((run): run is HjellRun => Boolean(run))

const catches = planHjellCatch(world, config, BUDGET)

/**
 * The home island's own search, re-runnable without re-surveying the world.
 *
 * A whole archipelago survey is thirteen seconds; every gate in this file is a
 * question about one island, and asking it of one island is the difference
 * between a test suite and a coffee break.
 */
function search (over: Partial<HjellSearch> = {}): HjellSearch {
  return {
    ground:     world.home.survey.field.heightAt,
    waterLevel: water,
    bearing:    config.wind.bearing,
    height:     config.hjell.height,
    bays:       config.hjell.bays,
    spacing:    config.hjell.spacing,
    setback:    config.hjell.setback,
    reach:      config.hjell.reach,
    freeboard:  config.hjell.freeboard,
    fall:       config.hjell.fall,
    fetch:      config.hjell.fetch,
    ...over,
  }
}

const harbour = world.home.survey.harbour!


describe('the search for a line to dry on', () => {
  test('most of the archipelago finds one, and every one of them is at a harbour', () => {
    expect(runs.length).toBe(5)

    for (const landmass of world.landmasses)
      if (landmass.survey.hjell)
        expect(landmass.survey.harbour).not.toBeNull()
  })

  test('every run is the length the config asked for, laid along the wind', () => {
    const wanted = config.hjell.bays * config.hjell.spacing

    for (const run of runs) {
      expect(run.stations.length).toBe(config.hjell.bays + 1)
      expect(run.length).toBeCloseTo(wanted, 6)

      const root = run.stations[0]!
      const head = run.stations[run.stations.length - 1]!

      expect(Math.hypot(head.x - root.x, head.z - root.z)).toBeCloseTo(wanted, 4)
      expect(Math.atan2(head.z - root.z, head.x - root.x)).toBeCloseTo(run.angle, 6)
    }
  })

  test('every foot stands clear of the water and inside the fall it was allowed', () => {
    for (const run of runs) {
      for (const station of run.stations)
        expect(station.level - water).toBeGreaterThanOrEqual(config.hjell.freeboard)

      expect(run.fall).toBeLessThanOrEqual(config.hjell.fall)
    }
  })

  /**
   * The claim the structure makes, stated as a fact about the data: the rails
   * are level, so the *deck* is one number for the whole run and it clears the
   * highest foot by exactly the authored height. A rail that followed the ground
   * would tip its load off the low end, and no still taken from above would show
   * it.
   */
  test('the rails are level, and they clear the highest foot by the rack height', () => {
    for (const run of runs) {
      const crest = Math.max(...run.stations.map(station => station.level))

      expect(run.deck - crest).toBeCloseTo(config.hjell.height, 6)

      for (const station of run.stations)
        expect(run.deck - station.level).toBeGreaterThanOrEqual(config.hjell.height - 1e-9)
    }
  })

  test('every run has the fetch it was asked for, and reports it capped', () => {
    for (const run of runs) {
      expect(run.fetch).toBeGreaterThanOrEqual(config.hjell.fetch)
      expect(run.fetch).toBeLessThanOrEqual(config.hjell.fetch)
    }
  })

  /**
   * The claim the fetch gate makes, on ground built to make it the only thing
   * that can be true or false: a level shelf with a wall round it. Every other
   * refusal is satisfied by construction — the shelf is flat, dry and empty —
   * so a run that is refused here is refused for the lee and for nothing else.
   *
   * It is a synthetic island rather than a real one because on a real one the
   * answer is never interesting: upwind of a harbour on these coasts is usually
   * the open sea, which has no fetch to run out of.
   */
  test('a shelf walled in upwind is refused, and the same shelf open is not', () => {
    const shelf    = { x: 0, z: 0, angle: 0 }
    const walled   = (x: number, z: number): number => Math.hypot(x, z) < 25 ? 0 : 6
    const enclosed = search({ ground: walled, setback: 5, reach: 15 })

    expect(findHjellRun({ ...enclosed, fetch: 2 }, shelf, [])).not.toBeNull()
    // Further than the widest chord of the shelf, so the walk reaches the wall
    // from any station on it rather than running out of budget first.
    expect(findHjellRun({ ...enclosed, fetch: 60 }, shelf, [])).toBeNull()
  })

  test('a rack of no height is a coast with no racks on it', () => {
    expect(findHjellRun(search({ height: 0 }), harbour, [])).toBeNull()
  })

  test('a reach no further than the setback is a search with nowhere to look', () => {
    expect(findHjellRun(search({ reach: config.hjell.setback }), harbour, [])).toBeNull()
  })

  test('it is byte-for-byte stable for one seed', () => {
    expect(findHjellRun(search(), harbour, [])).toEqual(findHjellRun(search(), harbour, []))
  })

  test('ground handed to the search as taken is ground the run misses', () => {
    const laid = findHjellRun(search(), harbour, [])!
    const over = laid.stations[3]!
    const sent = findHjellRun(search(), harbour, [{ x: over.x, z: over.z, radius: 3 }])

    for (const station of sent?.stations ?? [])
      expect(Math.hypot(station.x - over.x, station.z - over.z))
        .toBeGreaterThanOrEqual(3 + HJELL_CLEARING)
  })

  test('no run is laid over anything the island has already built', () => {
    for (const landmass of world.landmasses) {
      const run = landmass.survey.hjell

      if (!run)
        continue

      const { places } = landmass.survey

      for (const station of run.stations)
        for (const name of STEADING_BUILDINGS)
          expect(Math.hypot(places[name].x - station.x, places[name].z - station.z))
            .toBeGreaterThan(places[name].radius + HJELL_CLEARING)
    }
  })
})

describe('the catch on the rails', () => {
  test('every fish hangs off its own run, at one of the two rail heights', () => {
    expect(catches.length).toBeGreaterThan(400)
    expect(catches.length).toBeLessThanOrEqual(BUDGET)

    const heights = new Set(catches.map(fish => Number(fish.y.toFixed(4))))

    // Two rails per run, and every run at its own deck: no more than two
    // heights per island, and never a fish at a height of its own.
    expect(heights.size).toBeLessThanOrEqual(runs.length * 2)
  })

  test('the budget thins the whole coast rather than stripping an island', () => {
    const thin  = planHjellCatch(world, config, 40)
    const where = new Set(thin.map(fish => Number(fish.y.toFixed(4))))

    expect(thin.length).toBe(40)
    expect(where.size).toBeGreaterThan(2)
  })

  test('no fill is a coast with bare poles on it', () => {
    const bare = clone()

    bare.hjell.fill = 0

    expect(planHjellCatch(world, bare, BUDGET)).toHaveLength(0)
  })

  test('it is byte-for-byte stable for one seed', () => {
    expect(planHjellCatch(world, clone(), BUDGET)).toEqual(catches)
  })
})

describe('the year the racks keep', () => {
  test('they are full on the week they are loaded and bare half a year from it', () => {
    const { hung, peak } = config.hjell

    expect(hjellHung(peak, hung, peak)).toBeCloseTo(1, 6)
    expect(hjellHung((peak + 0.5) % 1, hung, peak)).toBe(0)
  })

  test('the window is centred on the peak rather than on midsummer', () => {
    const { hung, peak } = config.hjell
    const edge           = hung * 0.5

    for (const side of [ -1, 1 ])
      expect(hjellHung(peak + side * edge * 0.5, hung, peak)).toBeGreaterThan(0.5)

    // Midsummer is outside an authored window centred on the spring, which is
    // the whole difference between this clock and the bird cliff's.
    expect(hjellHung(0.5, hung, peak)).toBe(0)
  })

  test('the two switches empty the racks from either end', () => {
    expect(hjellHung(config.hjell.peak, 0, config.hjell.peak)).toBe(0)
    expect(hjellHung(0.5, 1, config.hjell.peak)).toBe(1)
  })

  test('it reads the week it is given and nothing else', () => {
    const { hung, peak } = config.hjell

    for (const turn of [ -2, -1, 1, 2 ])
      expect(hjellHung(peak + turn, hung, peak)).toBeCloseTo(hjellHung(peak, hung, peak), 9)
  })

  /**
   * The run loads from the windward end rather than all at once. Stated here as
   * an ordering fact rather than left to a still: four hundred fish appearing
   * between two frames is what this is for.
   */
  test('a keen bay is loaded before a slack one and stripped after it', () => {
    expect(fishHung(0.4, 0)).toBeGreaterThan(fishHung(0.4, 1))
    expect(fishHung(1, 1)).toBe(1)
    expect(fishHung(0, 0)).toBe(0)

    for (const keen of [ 0, 0.5, 1 ]) {
      expect(fishHung(0.5, keen)).toBeGreaterThanOrEqual(0)
      expect(fishHung(0.5, keen)).toBeLessThanOrEqual(1)
    }
  })
})
