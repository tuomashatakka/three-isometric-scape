import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { surveyArchipelago } from './archipelago.ts'
import { createHeightField } from './height.ts'
import { distanceToTrack, pastureInfluence, plotInfluence } from './layout.ts'
import { carvePeat, peatFaceStanding, solvePeatBank } from './peat.ts'
import type { PeatBank } from './peat.ts'


/**
 * One survey for the whole file, for the reason `tarn.test.ts` states: this
 * archipelago is five islands and surveying it is not cheap.
 */
const survey = surveyArchipelago(SCAPE_CONFIG)
const home   = survey.landmasses.find(landmass => landmass.id === 'home')!
const bank   = home.survey.peat!

/**
 * The ground the search measured: the home island's own field with the pool
 * carved into it and nothing else — which is exactly what `surveyScape` hands
 * the solver, and a different surface from the one the scape finally draws.
 */
const sited = createHeightField(home.config, home.survey.layout, home.survey.tarn).heightAt

/** The ground as drawn, with the cutting in it. */
const carved = home.survey.field.heightAt

/** Everything about a bank except the closure hung off it. */
const record = (cutting: PeatBank): unknown => ({
  x:       cutting.x,
  z:       cutting.z,
  bearing: cutting.bearing,
  face:    cutting.face,
  reach:   cutting.reach,
  depth:   cutting.depth,
  level:   cutting.level,
  spread:  cutting.spread,
  floor:   cutting.floor,
})

/** A point in the working's own frame: `along` the face, `out` from it. */
function at (cutting: PeatBank, along: number, out: number): [ number, number ] {
  const cos = Math.cos(cutting.bearing)
  const sin = Math.sin(cutting.bearing)

  return [
    cutting.x + cos * along - sin * out,
    cutting.z + sin * along + cos * out,
  ]
}

const solve = (spread: number): PeatBank | null =>
  solvePeatBank(
    { ...home.config, peat: { ...home.config.peat, spread }},
    home.survey.layout,
    sited,
    home.survey.tarn,
  )


describe('the peat bank on the moor', () => {
  test('the home island has one, and every record says the same thing twice', () => {
    expect(bank).toBeDefined()
    expect(record(solve(home.config.peat.spread)!))
      .toEqual(record(solve(home.config.peat.spread)!))
    expect(record(solve(home.config.peat.spread)!)).toEqual(record(bank))
  })

  /**
   * The absence is part of the answer, not a gap in it.
   *
   * Two of the five holdings have no cutting, and the run that "fixes" that by
   * loosening `spread` until they do is a run that cut a peat bank into a
   * hillside. The claim being made here is only that the search is capable of
   * coming back with nothing.
   */
  test('the islands with no level low ground have none', () => {
    const without = survey.landmasses.filter(landmass => !landmass.survey.peat)

    expect(without.length).toBeGreaterThan(0)
    for (const landmass of without)
      expect(landmass.survey.peat).toBeNull()
  })

  test('the depth is the switch, and so is the face', () => {
    expect(solvePeatBank(
      { ...home.config, peat: { ...home.config.peat, depth: 0 }},
      home.survey.layout,
      sited,
    )).toBeNull()
    expect(solvePeatBank(
      { ...home.config, peat: { ...home.config.peat, face: 0 }},
      home.survey.layout,
      sited,
    )).toBeNull()
  })

  /**
   * **Metres, and they stay metres.** The fell is three times the home island's
   * span and a family's winter fuel is not three times the size — so the two
   * workings are the same rectangle, sited on very different islands.
   */
  test('a bank is the same size whatever island it is cut on', () => {
    for (const landmass of survey.landmasses)
      if (landmass.survey.peat) {
        expect(landmass.survey.peat.face).toBe(SCAPE_CONFIG.peat.face)
        expect(landmass.survey.peat.reach).toBe(SCAPE_CONFIG.peat.reach)
      }
  })
})

describe('the ground it was cut into', () => {
  test('the face is level along its whole length', () => {
    expect(bank.spread).toBeLessThanOrEqual(home.config.peat.spread)

    // And measured rather than taken on trust: the face's own relief, read off
    // the ground the search was given.
    const heights = [ -0.5, -0.25, 0, 0.25, 0.5 ]
      .map(fraction => sited(...at(bank, fraction * bank.face, 0)))

    expect(Math.max(...heights) - Math.min(...heights))
      .toBeLessThanOrEqual(home.config.peat.spread + 1e-6)
  })

  test('the whole footprint stands clear of the sea', () => {
    const floor = SCAPE_CONFIG.terrain.waterLevel + home.config.peat.lift

    for (const along of [ -0.5, 0, 0.5 ])
      for (const out of [ 0, 0.5, 1 ])
        expect(sited(...at(bank, along * bank.face, out * bank.reach)))
          .toBeGreaterThanOrEqual(floor - 1e-6)
  })

  /**
   * The bearing's whole claim: the face stands *across* the fall. If it did not,
   * the working would be cut along a contour's steepest line and the floor would
   * be a chute.
   */
  test('the working is worked downhill from its face', () => {
    const onFace = sited(...at(bank, 0, 0))
    const behind = sited(...at(bank, 0, -bank.reach))
    const ahead  = sited(...at(bank, 0, bank.reach))

    expect(ahead).toBeLessThanOrEqual(onFace)
    expect(behind).toBeGreaterThanOrEqual(onFace)
  })

  test('nothing the farm had already taken is under it', () => {
    const { layout } = home.survey
    const { x, z }   = bank.floor

    expect(Math.hypot(x - layout.yard.x, z - layout.yard.z))
      .toBeGreaterThan(layout.yard.radius)
    expect(distanceToTrack(layout, x, z)).toBeGreaterThan(layout.track.width)
    expect(pastureInfluence(layout, x, z)).toBe(0)
    for (const plot of layout.plots)
      expect(plotInfluence(plot, x, z)).toBe(0)
    if (home.survey.tarn)
      expect(Math.hypot(x - home.survey.tarn.x, z - home.survey.tarn.z))
        .toBeGreaterThan(home.survey.tarn.radius)
  })
})

describe('the carve', () => {
  test('it only ever goes down, and only inside the claim', () => {
    for (const along of [ -0.8, -0.3, 0, 0.3, 0.8 ])
      for (const out of [ -0.6, -0.1, 0.2, 0.5, 0.9, 1.4 ]) {
        const [ x, z ] = at(bank, along * bank.face, out * bank.reach)
        const raw      = sited(x, z)
        const cut      = carvePeat(bank, x, z, raw)

        expect(cut).toBeLessThanOrEqual(raw + 1e-9)

        // Uphill of the face and past the back edge the moor is untouched —
        // which is what makes the face a face rather than a slump.
        if (out <= 0 || out >= 1)
          expect(cut).toBe(raw)
      }
  })

  test('the floor is exactly one cut below the moor it replaced', () => {
    // Inside the rectangle and off all three ramps, where the claim is one and
    // the whole depth has been taken.
    for (const along of [ -0.25, 0, 0.25 ])
      for (const out of [ 0.3, 0.5 ]) {
        const [ x, z ] = at(bank, along * bank.face, out * bank.reach)
        const raw      = sited(x, z)

        expect(carvePeat(bank, x, z, raw))
          .toBeCloseTo(Math.min(raw, bank.level) - bank.depth, 6)
      }
  })

  /**
   * The cap is the difference between a working and a hollow: the top of a cut
   * face is one line, so anything standing above it inside the rectangle has
   * been taken off rather than followed down.
   */
  test('a bulge inside the rectangle is cut off rather than followed', () => {
    const [ x, z ] = at(bank, 0, bank.reach * 0.4)

    expect(carvePeat(bank, x, z, bank.level + 4)).toBeCloseTo(bank.level - bank.depth, 6)
  })

  /**
   * The finding the ascii instruments exist to catch: a cutting whose face went
   * flat is a rectangle of dark paint on an untouched hillside, identical from
   * every pose and visible nowhere but here.
   */
  test('a face is left standing, and most of it is the cut', () => {
    const standing = peatFaceStanding(bank, carved)

    expect(standing).toBeGreaterThan(bank.depth * 0.5)
  })

  test('the whole island is not quietly lowered by it', () => {
    // Forty metres away, off any working: whatever the carve did, it did it
    // inside its own rectangle.
    for (const bearing of [ 0, 1.2, 2.4, 3.6, 4.8 ]) {
      const x = bank.x + Math.cos(bearing) * 30
      const z = bank.z + Math.sin(bearing) * 30

      expect(bank.claimAt(x, z)).toBe(0)
    }
  })
})
