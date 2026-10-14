import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG, landmassTerrain } from '../config.ts'
import type { ScapeConfig } from '../config.ts'
import { SHORE_STEPS, patchReach, ringNoise, surveyFarShore } from './farshore.ts'


const shore                              = surveyFarShore(SCAPE_CONFIG)
const { farShore, archipelago, terrain } = SCAPE_CONFIG

/** The same scape with one far-shore knob moved, and nothing else touched. */
function withShore (overrides: Partial<ScapeConfig['farShore']>): ScapeConfig {
  return { ...SCAPE_CONFIG, farShore: { ...farShore, ...overrides }}
}

describe('the coast on the other side of the water', () => {
  test('the ring closes on itself', () => {
    // The whole reason `ringNoise` exists rather than a circle through
    // `valueNoise`. A field that does not wrap leaves a cliff at due east with
    // nothing on the other side of it, and the seam is invisible from five of
    // the six tour poses.
    for (const features of [ 3, 7, 9, 12, 27 ])
      expect(ringNoise(0, features, 4.5)).toBeCloseTo(ringNoise(Math.PI * 2, features, 4.5), 12)
  })

  test('nothing it stands on is inside the archipelago', () => {
    // The claim, as a fact about the data: the near toe of the range clears
    // every terrain patch on its own bearing by at least `standOff`. Not
    // checked after the fact — it is where the coast is *defined* to be — but
    // a run that moves an island, a patch size or the world has moved the
    // thing this depends on, and this is where it finds out.
    for (const sample of shore.samples) {
      const toe = sample.distance * (1 - farShore.width * 0.5)

      expect(toe - patchReach(SCAPE_CONFIG, sample.bearing))
        .toBeGreaterThanOrEqual(farShore.standOff - 1e-6)
    }
  })

  test('the sea has a way out of it on more than one bearing', () => {
    // A closed basin is not an archipelago. Five ferry ports, a swell that
    // arrives from somewhere and a tide that has to fill the sound all depend
    // on the horizon being open, and none of them would fail loudly if it
    // were not.
    expect(shore.sounds.length).toBeGreaterThanOrEqual(2)
    expect(shore.headlands.length).toBeGreaterThanOrEqual(2)
    expect(shore.land).toBeGreaterThan(0.2)
    expect(shore.land).toBeLessThan(0.9)
  })

  test('the runs tile the whole horizon exactly once', () => {
    const arcs = [ ...shore.headlands, ...shore.sounds ]
      .reduce((total, run) => total + run.arc, 0)

    expect(arcs).toBeCloseTo(360, 9)
  })

  test('a headland comes out of the water rather than standing out of it', () => {
    // The taper. Every sample next to a sound carries less land than the
    // middle of the run it belongs to, so a headland ends in a slope. A wall
    // with the sea against it is what the first draft drew.
    for (const run of shore.headlands) {
      const first = Math.round(run.from / 360 * SHORE_STEPS) % SHORE_STEPS
      const last  = (first + Math.round(run.arc / 360 * SHORE_STEPS) - 1) % SHORE_STEPS

      expect(shore.samples[first].land).toBeLessThan(1)
      expect(shore.samples[last].land).toBeLessThan(1)
      expect(run.summit).toBeGreaterThan(shore.samples[first].crest)
    }
  })

  test('every sample stays inside the heights and distances it was given', () => {
    for (const sample of shore.samples) {
      expect(sample.crest).toBeGreaterThanOrEqual(0)
      expect(sample.crest).toBeLessThanOrEqual(farShore.rise)
      expect(sample.land).toBeGreaterThanOrEqual(0)
      expect(sample.land).toBeLessThanOrEqual(1)
      expect(sample.distance).toBeGreaterThan(archipelago.worldSize * 0.5)
      expect(sample.crest > 0).toBe(sample.land > 0)
    }

    expect(shore.nearest).toBeLessThanOrEqual(shore.furthest)
    expect(shore.summit?.crest).toBe(Math.max(...shore.samples.map(sample => sample.crest)))
  })

  test('the summit is below the ceiling and well above the islands', () => {
    // The proportion is the point of the system: nothing in this frame could
    // say the archipelago was low ground while the archipelago was the tallest
    // thing in it.
    const tallest = Math.max(...shore.samples.map(sample => sample.crest))

    expect(tallest).toBeLessThan(farShore.rise)
    expect(tallest + terrain.waterLevel).toBeGreaterThan(60)
  })

  test('the same seed gives the same coast, to the last float', () => {
    const again = surveyFarShore(SCAPE_CONFIG)

    expect(again.samples).toEqual(shore.samples)
    expect(again.headlands).toEqual(shore.headlands)
  })

  test('a different seed gives a different coast', () => {
    const other = surveyFarShore({ ...SCAPE_CONFIG, seed: SCAPE_CONFIG.seed + 1 })

    expect(other.samples).not.toEqual(shore.samples)
  })

  test('rise at zero is open ocean, and there is no flag beside it', () => {
    const none = surveyFarShore(withShore({ rise: 0 }))

    expect(none.headlands).toEqual([])
    expect(none.land).toBe(0)
    expect(none.summit).toBeNull()
    expect(none.sounds).toEqual([{ from: 0, arc: 360, summit: 0 }])
    expect(none.samples.every(sample => sample.crest === 0 && sample.land === 0)).toBe(true)
  })

  test('openness reaches open ocean from the other end, and a closed basin from this one', () => {
    expect(surveyFarShore(withShore({ openness: 1 })).land).toBe(0)
    expect(surveyFarShore(withShore({ openness: 0 })).land).toBe(1)
    expect(surveyFarShore(withShore({ openness: 0 })).sounds).toEqual([])
  })

  test('openness only ever opens the horizon', () => {
    // Monotone, which is the one thing a threshold has to be if the knob is to
    // mean anything: the share it produces is not the number, but turning it up
    // can never put land back.
    let previous = 1

    for (const openness of [ 0.2, 0.35, 0.45, 0.6, 0.8 ]) {
      const land = surveyFarShore(withShore({ openness })).land

      expect(land).toBeLessThanOrEqual(previous)
      previous = land
    }
  })

  test('a world that grows takes the coast out with it', () => {
    // `reach` is a multiple of the world size rather than a number of metres,
    // and this is the behaviour that choice buys. A run that grows the
    // archipelago and leaves this alone would otherwise find a mountain range
    // standing in the new sea.
    const bigger = surveyFarShore({
      ...SCAPE_CONFIG,
      archipelago: { ...archipelago, worldSize: archipelago.worldSize * 2 },
    })

    expect(bigger.nearest).toBeGreaterThan(shore.nearest * 1.9)
  })

  test('the support function answers for the patches it was given', () => {
    // `patchReach` is the guarantee's arithmetic, and it is the one piece of
    // it a reader cannot check by eye. Every corner of every patch has to sit
    // at or under the support in its own direction.
    for (let index = 0; index < 48; index += 1) {
      const bearing = index / 48 * Math.PI * 2
      const dirX    = Math.cos(bearing)
      const dirZ    = Math.sin(bearing)
      const reach   = patchReach(SCAPE_CONFIG, bearing)

      for (const spec of archipelago.landmasses) {
        const half = landmassTerrain(SCAPE_CONFIG, spec).size * 0.5

        for (const cornerX of [ -half, half ])
          for (const cornerZ of [ -half, half ])
            expect((spec.origin[0] + cornerX) * dirX + (spec.origin[1] + cornerZ) * dirZ)
              .toBeLessThanOrEqual(reach + 1e-6)
      }
    }
  })
})
