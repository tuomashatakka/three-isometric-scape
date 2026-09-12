import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { tideAmplitudeAt } from '../tide.ts'
import { surveyArchipelago } from './archipelago.ts'
import { beaconCrown } from './beacon.ts'
import { resolveIsles } from './height.ts'
import { WRECK_BEARING, WRECK_FOOTING, findWreckSite } from './wreck.ts'


const archipelago             = surveyArchipelago(SCAPE_CONFIG)
const { awash, minRock, bed } = SCAPE_CONFIG.wreck
const { waterLevel }          = SCAPE_CONFIG.terrain
const home                    = archipelago.home
const site                    = home.survey.wreck!

describe('the rock she is on', () => {
  test('one hull in the archipelago, out on the home island ring', () => {
    // Not a law of the search — `null` is a real answer — but a fact about this
    // seed, and the one the run's headline rests on. Only the home island has a
    // ring of rocks at all, so only the home island can have a wreck.
    const carrying = archipelago.landmasses
      .filter(landmass => landmass.survey.wreck !== null)
      .map(landmass => landmass.id)

    expect(carrying).toEqual([ 'home' ])
    expect(site.isle).toBe(11)
  })

  test('it is the lowest rock in the ring that qualifies, not the outermost', () => {
    // The inversion, stated as a fact about the data rather than left in the
    // score. Every rock the gates let through and this one is the shallowest of
    // them — which is the whole argument the section makes, and the one thing a
    // retune of `awash` or `minRock` could quietly break.
    const taken = [ home.survey.beacon?.isle, home.survey.croft?.isle ]

    const eligible = resolveIsles(home.config)
      .map((isle, index) => ({ index, isle, crown: beaconCrown(home.survey.field, isle).level }))
      .filter(rock => rock.isle.radius >= minRock && !taken.includes(rock.index))
      .filter(rock => rock.crown > waterLevel && rock.crown - waterLevel <= awash)

    expect(eligible.length).toBeGreaterThan(1)
    for (const rock of eligible)
      expect(site.freeboard).toBeLessThanOrEqual(rock.crown - waterLevel)
  })

  test('it is a rock the tide very nearly covers', () => {
    // Why it caught her, as arithmetic. The crown stands inside a spring tide's
    // own half range plus a hand's width — which is to say there is nothing of
    // it to see at high water. Stated against `tide` rather than hard-coded, so
    // a coast retuned to a bigger range does not quietly turn this into a claim
    // about a rock standing clear.
    expect(site.freeboard).toBeLessThan(tideAmplitudeAt(1, SCAPE_CONFIG.tide) + 0.1)
    expect(site.freeboard).toBeGreaterThan(0)
  })

  test('she is not on the light\'s rock, nor on the croft\'s', () => {
    expect(site.isle).not.toBe(home.survey.beacon?.isle)
    expect(site.isle).not.toBe(home.survey.croft?.isle)
  })
})

describe('the bed under her', () => {
  test('the whole bearing is on rock, and level within the gate', () => {
    // The claim the `bed` gate exists to make: she is aground along a length of
    // keel rather than balanced on a point. Walked here rather than trusted,
    // because the search reports the fall it measured and this measures it again
    // off the height field the scene actually draws.
    const cos = Math.cos(site.bearing)
    const sin = Math.sin(site.bearing)

    for (let step = -3; step <= 3; step += 1) {
      const along = step / 3 * WRECK_BEARING
      const level = home.survey.field.heightAt(site.x + cos * along, site.z + sin * along)

      expect(level).toBeGreaterThan(waterLevel)
      expect(site.level - level).toBeLessThanOrEqual(bed)
    }

    expect(site.fall).toBeLessThanOrEqual(bed)
  })

  test('a rock wide enough to pass the gate is wide enough to lie on', () => {
    // `minRock` is a radius and `WRECK_BEARING` is a half length, and they are
    // two different numbers about the same ledge. Held in step here, so a run
    // that lengthens her cannot silently start siting her over the edge.
    expect(WRECK_BEARING).toBeLessThan(minRock)
  })

  test('she lies on the line she was driven in on when the ledge lets her', () => {
    // The score spends the arc reluctantly. At this seed the ledge is flat
    // enough that every bearing holds, so the answer has to be the unturned one
    // — if this starts failing, the sweep has gone back to scoring on the fall.
    expect(site.turn).toBe(0)

    const inward = Math.atan2(-site.z, -site.x)

    expect(site.bearing).toBeCloseTo(inward, 6)
  })
})

describe('the ground round her', () => {
  test('nothing else offshore stands inside her footing', () => {
    // The reserve in `dressing.ts` keeps the scatter out; this keeps the other
    // two things on the rocks out. A hull inside the seamark's storm boulders is
    // a joke rather than a landform, and the search says so by refusing the two
    // rocks outright — but the rocks are a few metres apart on this ring and the
    // claim worth stating is about the distance, not the index.
    for (const other of [ home.survey.beacon, home.survey.croft ])
      if (other)
        expect(Math.hypot(other.x - site.x, other.z - site.z)).toBeGreaterThan(WRECK_FOOTING)
  })

  test('turning the ceiling to zero takes her out of the scape', () => {
    // The switch, and the absence of a boolean beside it. At 0 the search asks
    // for a rock that is above the water and no higher than it, nothing is, and
    // the refusal is taken in the survey rather than at draw time.
    const tideless = { ...SCAPE_CONFIG, wreck: { ...SCAPE_CONFIG.wreck, awash: 0 }}

    expect(findWreckSite(tideless, home.survey.field, [])).toBeNull()
  })

  test('the search is a function of the ground and nothing else', () => {
    // Determinism, at the level the survey cares about: two calls against the
    // same field and the same config agree field for field.
    expect(findWreckSite(home.config, home.survey.field, [ 5, 10 ]))
      .toEqual(findWreckSite(home.config, home.survey.field, [ 5, 10 ]))
  })
})
