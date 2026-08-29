import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { surveyArchipelago } from './archipelago.ts'
import { createZoneTests } from './dressing-zones.ts'
import { createGrazingTest, planGrazing } from './grazing.ts'


const survey = surveyArchipelago(SCAPE_CONFIG)
const flocks = planGrazing(survey, SCAPE_CONFIG)
const zones  = createZoneTests(survey)

function withGrazing (grazing: Partial<typeof SCAPE_CONFIG.grazing>) {
  return { ...SCAPE_CONFIG, grazing: { ...SCAPE_CONFIG.grazing, ...grazing }}
}


describe('siting the flocks', () => {
  test('the archipelago has ground to turn stock out on', () => {
    expect(flocks.length).toBeGreaterThan(0)
  })

  test('no farm keeps more flocks than it was asked for', () => {
    for (const landmass of survey.landmasses)
      expect(flocks.filter(flock => flock.id === landmass.id).length)
        .toBeLessThanOrEqual(SCAPE_CONFIG.grazing.flocks)
  })

  /**
   * The claim, stated as a fact about the ground rather than about the search.
   *
   * Not "the centre is grazeable" — a disc is what a flock spreads over, and
   * the failure this catches is a centre on the one clear patch in a wood with
   * three quarters of its animals standing in the trees. Walked at sixteen
   * bearings on the outer ring, which is finer than the eight the search
   * itself sampled: a claim checked at exactly the points that produced it is
   * not a check.
   */
  test('most of every flock’s disc is ground a sheep can feed on', () => {
    const grazeable = createGrazingTest(survey, SCAPE_CONFIG, zones)

    for (const flock of flocks) {
      let clear = 0

      for (let step = 0; step < 16; step += 1) {
        const around = step / 16 * Math.PI * 2

        if (grazeable(
          flock.x + Math.cos(around) * flock.radius,
          flock.z + Math.sin(around) * flock.radius,
        ))
          clear += 1
      }

      expect(clear).toBeGreaterThanOrEqual(8)
    }
  })

  /**
   * The wall the pasture was built with is a wall against something.
   *
   * The hay meadow is shut up to grow a crop; stock in it is the failure the
   * enclosure exists to prevent. The cart track and the worn paths are the same
   * argument from the other side — an animal standing in the road.
   */
  test('no flock stands in the hay meadow, the yard, the plots or the road', () => {
    for (const flock of flocks) {
      expect(zones.onPasture(flock.x, flock.z)).toBe(0)
      expect(zones.onYard(flock.x, flock.z)).toBe(0)
      expect(zones.onPlot(flock.x, flock.z)).toBe(0)
      expect(zones.onTrack(flock.x, flock.z)).toBe(false)
      expect(zones.onPath(flock.x, flock.z)).toBe(false)
    }
  })

  test('every flock is on dry ground, on an island, above the tide', () => {
    for (const flock of flocks) {
      expect(survey.field.landmassAt(flock.x, flock.z)).not.toBeNull()
      expect(survey.field.heightAt(flock.x, flock.z))
        .toBeGreaterThanOrEqual(survey.waterLevel + SCAPE_CONFIG.grazing.minLift)
    }
  })

  /**
   * A sheep does not swim to work.
   *
   * The whole disc inside the island's own land radius, which is the same rule
   * the walled meadow's siting search keeps — past it the falloff has started
   * taking height away, and it is also where the islets begin.
   */
  test('every flock is on the island its farm is on, disc and all', () => {
    for (const flock of flocks) {
      const landmass = survey.landmasses.find(candidate => candidate.id === flock.id)

      expect(landmass).toBeDefined()
      expect(Math.hypot(flock.x - landmass!.origin.x, flock.z - landmass!.origin.z) + flock.radius)
        .toBeLessThanOrEqual(landmass!.survey.layout.landRadius)
    }
  })

  test('two flocks are two flocks rather than one wide one', () => {
    for (let a = 0; a < flocks.length; a += 1)
      for (let b = a + 1; b < flocks.length; b += 1)
        expect(Math.hypot(flocks[a].x - flocks[b].x, flocks[a].z - flocks[b].z))
          .toBeGreaterThan(flocks[a].radius * 2)
  })

  test('a flock is never wider than it was asked to be', () => {
    for (const flock of flocks) {
      expect(flock.radius).toBe(SCAPE_CONFIG.grazing.spread)
      expect(flock.cover).toBeGreaterThan(0.5)
      expect(flock.cover).toBeLessThanOrEqual(1)
    }
  })

  test('the same survey sites the same flocks', () => {
    expect(planGrazing(survey, SCAPE_CONFIG)).toEqual(flocks)
  })

  /**
   * The graceful absence, and it is the config's own switch rather than a
   * second boolean: a flock that spreads over no ground is no flock.
   */
  test('a spread of zero empties the hill', () => {
    expect(planGrazing(survey, withGrazing({ spread: 0 }))).toEqual([])
    expect(planGrazing(survey, withGrazing({ flocks: 0 }))).toEqual([])
  })

  /**
   * The other absence: an archipelago that is all sea carries no stock rather
   * than stock standing on the water.
   */
  test('ground under the tide leaves every farm without a flock', () => {
    const drowned = { ...survey, field: { ...survey.field, heightAt: () => -20 }}

    expect(planGrazing(drowned, SCAPE_CONFIG)).toEqual([])
  })

  test('a tighter disc is easier to fit, never harder', () => {
    const tight = planGrazing(survey, withGrazing({ spread: SCAPE_CONFIG.grazing.spread * 0.5 }))

    expect(tight.length).toBeGreaterThanOrEqual(flocks.length)
  })
})
