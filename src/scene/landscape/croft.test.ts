import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { BEACON_FOOTING } from './beacon.ts'
import { CROFT_FOOTING, findCroftSite } from './croft.ts'
import { surveyArchipelago } from './archipelago.ts'
import { resolveIsles } from './height.ts'
import { faceToward } from './steading.ts'


const archipelago                   = surveyArchipelago(SCAPE_CONFIG)
const { waterLevel }                = SCAPE_CONFIG.terrain
const { minIsle, freeboard, reach } = SCAPE_CONFIG.croft

/** The corners of the walls, which is where the socle has to find rock. */
const CORNERS = [[ -1.9, -1.5 ], [ 1.9, -1.5 ], [ 1.9, 1.5 ], [ -1.9, 1.5 ]] as const

/** Every island that got one, with the survey it came out of. */
const built = archipelago.landmasses.filter(landmass => landmass.survey.croft !== null)

describe('croft siting', () => {
  test('the home island puts somebody out on the rocks', () => {
    // Not a law of the search — `null` is a real answer, and every island but the
    // home one has an empty `terrain.isles` and so no ring to search. It is a
    // fact about this seed, and the one the run's headline rests on: a retune
    // that quietly takes the croft back out of the scape fails here rather than
    // in a screenshot nobody compares.
    expect(built.length).toBe(1)
    expect(built[0].id).toBe('home')
  })

  test('it stands on dry rock at the middle and at all four wall corners', () => {
    for (const landmass of built) {
      const site         = landmass.survey.croft!
      const { heightAt } = landmass.survey.field

      expect(heightAt(site.x, site.z) - waterLevel).toBeGreaterThanOrEqual(freeboard)

      for (const [ dx, dz ] of CORNERS)
        expect(heightAt(site.x + dx, site.z + dz) - waterLevel).toBeGreaterThanOrEqual(freeboard)

      // And the reported freeboard is the worst of those five rather than the
      // one under the middle — a hut that reports the crown it is beside is a
      // hut whose seaward corner is in the water.
      const worst = Math.min(
        heightAt(site.x, site.z),
        ...CORNERS.map(([ dx, dz ]) => heightAt(site.x + dx, site.z + dz)),
      )

      expect(site.freeboard).toBeCloseTo(worst - waterLevel, 6)
    }
  })

  test('the socle can bridge the fall it was sited over', () => {
    // The claim the merged build rests on. A plopped building grows a foundation
    // down onto whatever it finds; this one is baked and translated once, so the
    // fall across the walls has to be inside what 0.32 m of dry-laid stone hides.
    for (const landmass of built) {
      const site         = landmass.survey.croft!
      const { heightAt } = landmass.survey.field
      const centre       = heightAt(site.x, site.z)

      for (const [ dx, dz ] of CORNERS)
        expect(Math.abs(heightAt(site.x + dx, site.z + dz) - centre)).toBeLessThanOrEqual(0.45)
    }
  })

  test('it is on a rock the light is not already on, and clear of its footing', () => {
    for (const landmass of built) {
      const site   = landmass.survey.croft!
      const beacon = landmass.survey.beacon

      expect(site.isle).not.toBe(beacon?.isle)

      if (beacon)
        expect(Math.hypot(site.x - beacon.x, site.z - beacon.z))
          .toBeGreaterThan(CROFT_FOOTING + BEACON_FOOTING)
    }
  })

  test('the rock is broad enough, and the row home inside the reach', () => {
    for (const landmass of built) {
      const site    = landmass.survey.croft!
      const harbour = landmass.survey.harbour!
      const isle    = resolveIsles(landmass.config)[site.isle]

      expect(isle.radius).toBeGreaterThanOrEqual(minIsle)

      const measured = Math.hypot(site.x - harbour.x, site.z - harbour.z)

      expect(site.fromHarbour).toBeCloseTo(measured, 6)

      // Bounded by the isle's own centre rather than by the site, which is what
      // the search gates on — the crown sweep can carry the hut a little past a
      // reach the islet itself was inside.
      expect(Math.hypot(isle.x - harbour.x, isle.z - harbour.z)).toBeLessThanOrEqual(reach)
    }
  })

  test('the door looks back at the harbour it is worked from', () => {
    for (const landmass of built) {
      const site = landmass.survey.croft!

      expect(site.angle).toBeCloseTo(faceToward(site, landmass.survey.harbour!), 6)
    }
  })

  test('the search is a pure function of the ground it is handed', () => {
    const home    = built[0]
    const harbour = home.survey.harbour!
    const search  = {
      ground: home.survey.field.heightAt,
      waterLevel,
      freeboard,
      minIsle,
      reach,
    }

    const isles = resolveIsles(home.config)
    const taken = home.survey.beacon?.isle ?? null

    expect(findCroftSite(search, isles, harbour, taken))
      .toEqual(findCroftSite(search, isles, harbour, taken))
  })

  test('striking off every islet leaves no croft rather than a bad one', () => {
    const home = built[0]

    expect(findCroftSite(
      {
        ground:  home.survey.field.heightAt,
        waterLevel,
        // Past the largest islet in the ring, which is the documented way to
        // take the crofts back out of the scape.
        minIsle: 1_000,
        freeboard,
        reach,
      },
      resolveIsles(home.config),
      home.survey.harbour!,
      home.survey.beacon?.isle ?? null,
    )).toBeNull()
  })
})
