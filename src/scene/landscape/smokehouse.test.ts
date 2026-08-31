import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { SCAPE_CONFIG } from '../config.ts'
import { buildProp, resolvePalette } from '../props/index.ts'
import { SMOKEHOUSE_VENT } from '../props/smokehouse.ts'
import { surveyArchipelago } from './archipelago.ts'
import type { LandmassSurvey } from './archipelago.ts'
import { fixtureAt } from './fixtures.ts'
import { BOATHOUSE_FOOTING, NET_RACK_FOOTING, boathouseSpot, netRackSpot } from './landing.ts'
import { SMOKEHOUSE_FOOTING, findSmokehouseSite } from './smokehouse.ts'
import { STEADING_BUILDINGS, doorstepOf } from './steading.ts'


const archipelago                   = surveyArchipelago(SCAPE_CONFIG)
const { waterLevel }                = SCAPE_CONFIG.terrain
const { setback, reach, freeboard } = SCAPE_CONFIG.smokehouse

/** Every island that got one, with the survey it came out of. */
const built = archipelago.landmasses.filter(landmass => landmass.survey.smokehouse !== null)

function siteOf (landmass: LandmassSurvey) {
  return landmass.survey.smokehouse!
}

describe('smokehouse siting', () => {
  test('every island with a harbour finds a bank to build on', () => {
    // Not a law of the search — `null` is a real answer — but a fact about this
    // seed, and the one the run's headline rests on. A retune that quietly
    // takes the smokehouses back out of the scape fails here rather than in a
    // screenshot nobody compares.
    for (const landmass of archipelago.landmasses)
      expect([ landmass.id, landmass.survey.smokehouse !== null ])
        .toEqual([ landmass.id, landmass.survey.harbour !== null ])

    expect(built.length).toBeGreaterThan(0)
  })

  test('it stands on dry ground, at the middle and at all four corners', () => {
    for (const landmass of built) {
      const site         = siteOf(landmass)
      const { heightAt } = landmass.survey.field

      expect(heightAt(site.x, site.z) - waterLevel).toBeGreaterThanOrEqual(freeboard)

      for (const [ dx, dz ] of [[ -1.7, -1.25 ], [ 1.7, -1.25 ], [ 1.7, 1.25 ], [ -1.7, 1.25 ]])
        expect(heightAt(site.x + dx, site.z + dz) - waterLevel).toBeGreaterThanOrEqual(freeboard)
    }
  })

  test('it stays inside the reach it was given, and past the setback', () => {
    for (const landmass of built) {
      const site = siteOf(landmass)
      const bank = landmass.survey.harbour!

      const measured = Math.hypot(site.x - bank.x, site.z - bank.z)

      expect(measured).toBeGreaterThanOrEqual(setback - 1e-6)
      expect(measured).toBeLessThanOrEqual(reach + 1e-6)
      expect(site.fromBank).toBeCloseTo(measured, 6)
    }
  })

  test('nothing already standing is built on', () => {
    for (const landmass of built) {
      const site               = siteOf(landmass)
      const bank               = landmass.survey.harbour!
      const { places, layout } = landmass.survey

      const claimed = [
        ...STEADING_BUILDINGS.map(name => places[name]),
        { ...boathouseSpot(bank), radius: BOATHOUSE_FOOTING },
        { ...netRackSpot(bank), radius: NET_RACK_FOOTING },
        ...layout.chapel ? [{ x: layout.chapel.x, z: layout.chapel.z, radius: 5.5 }] : [],
      ]

      for (const thing of claimed)
        expect(Math.hypot(thing.x - site.x, thing.z - site.z))
          .toBeGreaterThanOrEqual(thing.radius + SMOKEHOUSE_FOOTING)
    }
  })

  test('its door faces the water it works for', () => {
    for (const landmass of built) {
      const site = siteOf(landmass)
      const bank = landmass.survey.harbour!
      const step = doorstepOf(site)

      // The doorstep is the same walk from the building, whichever way it is
      // turned — so the only thing that can make it *nearer* the bank than the
      // building's own middle is the yaw being right.
      expect(Math.hypot(step.x - bank.x, step.z - bank.z))
        .toBeLessThan(Math.hypot(site.x - bank.x, site.z - bank.z))
    }
  })

  test('the network is worn to that door, and knows its name', () => {
    for (const landmass of built) {
      const step = doorstepOf(siteOf(landmass))
      const at   = landmass.survey.network.waypoints.find(point => point.name === 'smokehouse')

      expect(at).toBeDefined()
      expect(at!.kind).toBe('door')
      expect(Math.hypot(at!.x - step.x, at!.z - step.z)).toBeLessThan(1e-6)
    }
  })

  test('the same bank sites the same hut, twice', () => {
    for (const landmass of built) {
      const bank   = landmass.survey.harbour!
      const search = {
        ground: landmass.survey.field.heightAt,
        waterLevel,
        freeboard,
        setback,
        reach,
      }
      const avoid = [
        ...STEADING_BUILDINGS.map(name => landmass.survey.places[name]),
        { ...boathouseSpot(bank), radius: BOATHOUSE_FOOTING },
        { ...netRackSpot(bank), radius: NET_RACK_FOOTING },
      ]

      expect(findSmokehouseSite(search, bank, avoid))
        .toEqual(findSmokehouseSite(search, bank, avoid))
      expect(findSmokehouseSite(search, bank, avoid)).toEqual(siteOf(landmass))
    }
  })

  test('a search with no room to look refuses rather than guessing', () => {
    const flat = findSmokehouseSite(
      {
        ground:     () => 40,
        waterLevel: 0,
        freeboard:  1,
        setback:    10,
        reach:      10,
      },
      { x: 0, z: 0, angle: 0 },
      [],
    )

    expect(flat).toBeNull()
  })

  test('a bank with nothing dry behind it gets no smokehouse', () => {
    const drowned = findSmokehouseSite(
      {
        ground:     () => -4,
        waterLevel: 0,
        freeboard:  0.6,
        setback:    5,
        reach:      18,
      },
      { x: 0, z: 0, angle: 0 },
      [],
    )

    expect(drowned).toBeNull()
  })
})

describe('the smokehouse itself', () => {
  const geometry = buildProp('smokehouse', createSeededRng(7_319), resolvePalette())
  const bounds   = new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)

  test('SMOKEHOUSE_FOOTING holds the whole plan', () => {
    const corners = [
      Math.hypot(bounds.min.x, bounds.min.z),
      Math.hypot(bounds.min.x, bounds.max.z),
      Math.hypot(bounds.max.x, bounds.min.z),
      Math.hypot(bounds.max.x, bounds.max.z),
    ]

    expect(Math.max(...corners)).toBeLessThanOrEqual(SMOKEHOUSE_FOOTING)
  })

  test('the vent is the highest thing on the building', () => {
    // The claim the plume rests on. A mouth inside its own roof is smoke coming
    // out of the shingles, and it is invisible at every pose the tour holds.
    expect(SMOKEHOUSE_VENT.y).toBeGreaterThan(bounds.max.y)
  })

  test('the vent comes out over the ground the hut stands on', () => {
    // The transform is the archipelago's — a world height field and the prop's
    // own local frame — which is exactly the pairing `surveyHearths` uses, and
    // exactly the one a copy of it would get wrong.
    for (const landmass of built) {
      const site  = siteOf(landmass)
      const mouth = fixtureAt(archipelago.field, site, SMOKEHOUSE_VENT, landmass.origin)

      expect(mouth).toEqual(fixtureAt(archipelago.field, site, SMOKEHOUSE_VENT, landmass.origin))

      const ground = archipelago.field.heightAt(site.x + landmass.origin.x, site.z + landmass.origin.z)

      // Over the ground by the whole height of the building, and standing on the
      // island rather than beside it.
      expect(mouth.y - ground).toBeGreaterThan(3)
      expect(Math.hypot(mouth.x - site.x - landmass.origin.x, mouth.z - site.z - landmass.origin.z))
        .toBeLessThan(SMOKEHOUSE_FOOTING)
    }
  })
})
