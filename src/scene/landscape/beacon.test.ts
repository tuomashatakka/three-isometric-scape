import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { BEACON_FOOTING, beaconCrown, findBeaconSite, footingIsDry } from './beacon.ts'
import { resolveIsles } from './height.ts'
import { surveyScape } from './survey.ts'


const survey = surveyScape(SCAPE_CONFIG)
const isles  = resolveIsles(SCAPE_CONFIG)

function withBeacon (beacon: Partial<typeof SCAPE_CONFIG.beacon>) {
  return { ...SCAPE_CONFIG, beacon: { ...SCAPE_CONFIG.beacon, ...beacon }}
}

describe('siting the light', () => {
  test('the archipelago has a rock to put one on', () => {
    expect(survey.beacon).not.toBeNull()
  })

  test('it stands on rock, and the whole footing is out of the water', () => {
    const site = survey.beacon!

    expect(site.freeboard).toBeGreaterThanOrEqual(SCAPE_CONFIG.beacon.freeboard)

    // The claim, stated as a fact about the ground rather than about the search:
    // every bearing around the footing is dry, so no part of the plinth or the
    // boulder pile is standing in the sea.
    for (let step = 0; step < 16; step += 1) {
      const around = step / 16 * Math.PI * 2
      const level  = survey.field.heightAt(
        site.x + Math.cos(around) * BEACON_FOOTING,
        site.z + Math.sin(around) * BEACON_FOOTING,
      )

      expect(level).toBeGreaterThan(SCAPE_CONFIG.terrain.waterLevel)
    }
  })

  test('no rock further out than the one it chose could have held it', () => {
    const site                   = survey.beacon!
    const { waterLevel }         = SCAPE_CONFIG.terrain
    const { minRock, freeboard } = SCAPE_CONFIG.beacon

    expect(isles[site.isle].radius).toBeGreaterThanOrEqual(minRock)

    // The outermost rock in the ring is not automatically the one that gets the
    // tower — a skerry can be too small for masonry, or broad enough and still
    // have water inside the footing once its own coast warp is applied. Every
    // rock further out than the chosen one fails on one of those three counts,
    // which is the claim the search actually makes.
    for (const isle of isles)
      if (Math.hypot(isle.x, isle.z) > site.reach) {
        const crown = beaconCrown(survey.field, isle)
        const held  = isle.radius >= minRock &&
          crown.level - waterLevel >= freeboard &&
          footingIsDry(survey.field, crown.x, crown.z, waterLevel)

        expect(held).toBe(false)
      }
  })

  test('it is offshore — outside the ground anyone walks on', () => {
    const site = survey.beacon!

    expect(Math.hypot(site.x, site.z)).toBeGreaterThan(survey.layout.landRadius)
  })

  test('the crown it found is the local high point, not the disc centre', () => {
    const site  = survey.beacon!
    const isle  = isles[site.isle]
    const drift = Math.hypot(site.x - isle.x, site.z - isle.z)

    expect(drift).toBeLessThanOrEqual(isle.radius * 0.35)
    expect(site.level).toBeGreaterThanOrEqual(survey.field.heightAt(isle.x, isle.z))
  })

  test('the door faces the island it warns boats off', () => {
    const site = survey.beacon!
    const home = Math.atan2(-site.z, -site.x)

    expect(Math.cos(site.bearing - home)).toBeCloseTo(1, 6)
  })

  test('a rock too small for masonry gets no tower', () => {
    expect(findBeaconSite(withBeacon({ minRock: 40 }), survey.field)).toBeNull()
  })

  test('freeboard nothing can meet gets no tower', () => {
    expect(findBeaconSite(withBeacon({ freeboard: 40 }), survey.field)).toBeNull()
  })

  test('an island with no rocks around it gets no tower', () => {
    const bare = { ...SCAPE_CONFIG, terrain: { ...SCAPE_CONFIG.terrain, isles: []}}

    expect(findBeaconSite(bare, survey.field)).toBeNull()
  })

  test('the same seed sites it in the same place', () => {
    const again = findBeaconSite(SCAPE_CONFIG, survey.field)!

    expect(again).toEqual(survey.beacon!)
  })

  test('lowering the threshold can only move it further out', () => {
    const nearer = findBeaconSite(withBeacon({ minRock: 3 }), survey.field)!

    expect(nearer.reach).toBeGreaterThanOrEqual(survey.beacon!.reach)
  })
})
