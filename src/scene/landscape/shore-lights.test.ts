import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import type { ScapeConfig } from '../config.ts'
import { SHORE_STEPS, surveyFarShore } from './farshore.ts'
import type { FarShore } from './farshore.ts'
import { surveyShoreLights } from './shore-lights.ts'
import type { ShoreLight } from './shore-lights.ts'


const shore = surveyFarShore(SCAPE_CONFIG)
const lit   = surveyShoreLights(SCAPE_CONFIG, shore)

/** The same scape with one knob moved, and nothing else touched. */
function withLights (overrides: Partial<ScapeConfig['shoreLights']>): ScapeConfig {
  return { ...SCAPE_CONFIG, shoreLights: { ...SCAPE_CONFIG.shoreLights, ...overrides }}
}

/** The ring sample a light was placed off, found back from its bearing. */
function sampleOf (light: ShoreLight, ring: FarShore = shore) {
  const step = Math.round(light.bearing / (Math.PI * 2) * SHORE_STEPS) % SHORE_STEPS

  return ring.samples[step]
}

/** Smallest arc between two bearings, in degrees. */
function arcBetween (from: number, to: number): number {
  const gap = Math.abs(from - to) * 180 / Math.PI % 360

  return Math.min(gap, 360 - gap)
}

describe('the lights of the places on the far coast', () => {
  test('the same seed gives the same coast, to the last float', () => {
    // Everything placed here is noise read through a forked rng, so the one
    // way this breaks is silently: a capture that moves because a system added
    // somewhere else pulled a number out of the shared stream first.
    expect(JSON.stringify(surveyShoreLights(SCAPE_CONFIG, shore)))
      .toBe(JSON.stringify(lit))
  })

  test('the coast has places on it', () => {
    expect(lit.settlements.length).toBeGreaterThan(0)
    expect(lit.lights.length).toBeGreaterThanOrEqual(lit.settlements.length)
    expect(lit.refused).toBe(0)
  })

  test('every light stands over the water and under its own skyline', () => {
    // The claim the whole system can silently break, as a fact about the data.
    // A light over the crest of its own bearing is a lamp hanging in the sky,
    // and from the default pose — a kilometre off, through the haze, at night —
    // that looks exactly like a light on a hill.
    for (const light of lit.lights) {
      expect(light.y).toBeGreaterThan(SCAPE_CONFIG.terrain.waterLevel)
      expect(light.height).toBeGreaterThan(0)
      expect(light.height).toBeLessThanOrEqual(sampleOf(light).crest)
    }
  })

  test('every light is on the seaward face rather than near it', () => {
    // The other half of the same claim, and the one the height test cannot
    // make: the face is a slope between a toe under the water and a ridge a
    // hundred metres over it, and the two are at *different radii*. A light at
    // the right height and the wrong radius is a light floating off the coast.
    for (const light of lit.lights) {
      const sample = sampleOf(light)
      const half   = sample.distance * SCAPE_CONFIG.farShore.width * 0.5
      const radius = Math.hypot(light.x, light.z)

      // The window's `PROUD` standoff is the slack: a lamp stands four metres
      // seaward of the face it is on, so the sprite's single depth clears the
      // slope it would otherwise be half-buried in.
      expect(radius).toBeGreaterThanOrEqual(sample.distance - half * sample.land - 4 - 1e-6)
      expect(radius).toBeLessThanOrEqual(sample.distance - 4 + 1e-6)
    }
  })

  test('nothing is lit in a sound', () => {
    // The sweep collapses the whole cross-section where the sea runs out, so a
    // light on one of those bearings is a light in open water with no land
    // under it at any height.
    for (const light of lit.lights)
      expect(sampleOf(light).crest).toBeGreaterThan(0)
  })

  test('the places keep the spread floor apart', () => {
    // Both score terms are smooth around a col, so an unconstrained search
    // returns the one best bearing nine times over.
    for (const [ index, site ] of lit.settlements.entries())
      for (const other of lit.settlements.slice(index + 1))
        expect(arcBetween(site.bearing, other.bearing))
          .toBeGreaterThanOrEqual(SCAPE_CONFIG.shoreLights.spread - 1e-6)
  })

  test('a place stands on a hill rather than on the last sliver before a sound', () => {
    // The finding the report made on the first draft: the shelter term is
    // largest exactly where the crest is smallest, so without the room term
    // every village sits where the land is about to run out. Half the climb is
    // the floor this states — a hill that cannot carry that is not a place.
    for (const site of lit.settlements)
      expect(site.crest).toBeGreaterThan(SCAPE_CONFIG.shoreLights.climb * 0.5)
  })

  test('a village that wants to climb higher gets a bigger hill, and still fits on it', () => {
    const tall = withLights({ climb: 60 })
    const high = surveyShoreLights(tall, shore)

    for (const light of high.lights)
      expect(light.height).toBeLessThanOrEqual(sampleOf(light).crest)

    expect(Math.max(...high.lights.map(light => light.height)))
      .toBeGreaterThan(Math.max(...lit.lights.map(light => light.height)))
  })

  test('no places asked for is no places, and not a refusal', () => {
    const empty = surveyShoreLights(withLights({ count: 0 }), shore)

    expect(empty.settlements).toHaveLength(0)
    expect(empty.lights).toHaveLength(0)
    expect(empty.refused).toBe(0)
  })

  test('a coast with no land on it carries nobody, and says how many it owed', () => {
    const bare = { ...SCAPE_CONFIG, farShore: { ...SCAPE_CONFIG.farShore, rise: 0 }}
    const dark = surveyShoreLights(bare, surveyFarShore(bare))

    expect(dark.lights).toHaveLength(0)
    expect(dark.refused).toBe(SCAPE_CONFIG.shoreLights.count)
  })

  test('a spread wider than the standing coast is reported rather than swallowed', () => {
    // 227 degrees of the horizon stand out of the water, so nine places ninety
    // apart cannot all be seated and the shortfall is the finding.
    const crowded = surveyShoreLights(withLights({ spread: 90 }), shore)

    expect(crowded.settlements.length).toBeLessThan(SCAPE_CONFIG.shoreLights.count)
    expect(crowded.refused)
      .toBe(SCAPE_CONFIG.shoreLights.count - crowded.settlements.length)
  })

  test('a place is a cluster and not always the same cluster', () => {
    const sizes = new Set(lit.settlements.map(site => site.lights))

    expect(Math.max(...sizes)).toBeLessThanOrEqual(SCAPE_CONFIG.shoreLights.cluster)
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(1)
    expect(sizes.size).toBeGreaterThan(1)
  })

  test('the harbour term is what puts the places at the ways out', () => {
    // 0 scores on the low ground alone, which spreads the villages down the
    // cols of the range; the default pulls them to the mouths of the sounds.
    // If this stops being true the knob has stopped doing anything.
    const inland = surveyShoreLights(withLights({ harbour: 0 }), shore)
    const mean   = (sites: readonly { mouth: number }[]): number =>
      sites.reduce((sum, site) => sum + site.mouth, 0) / sites.length

    expect(mean(lit.settlements)).toBeLessThan(mean(inland.settlements))
  })
})
