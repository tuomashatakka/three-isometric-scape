import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { surveyArchipelago } from './archipelago.ts'
import { createScapeLayout } from './layout.ts'
import { MILL_FOOTING, MILL_STAIR_REACH, findMillSite, millDoorstep, prominenceAt } from './mill.ts'
import type { MillSearch } from './mill.ts'
import { distanceToPath } from './path.ts'


const YARD = { x: -14, z: 3, radius: 12 }

/** A hill, so a search that wants prominence has somewhere to find it. */
function knoll (height: number): MillSearch {
  return {
    ground:     (x, z) => height * Math.exp(-((x - 30) ** 2 + (z + 18) ** 2) / 500) + 2,
    landRadius: 44,
    waterLevel: -1.25,
    prominence: 1.6,
    sweep:      4.2,
  }
}

describe('siting a mill', () => {
  test('finds the rise and not the flat around it', () => {
    const search = knoll(9)
    const site   = findMillSite(search, YARD, [], [])

    expect(site).not.toBeNull()
    expect(Math.hypot(site!.x - 30, site!.z + 18)).toBeLessThan(10)
    expect(site!.prominence).toBeGreaterThanOrEqual(search.prominence)
  })

  test('refuses flat ground rather than settling for it', () => {
    const flat: MillSearch = { ...knoll(9), ground: () => 4 }

    // The whole point of the search. A mill in a hollow is worse than no mill,
    // so `null` is an answer and not a failure to find one.
    expect(findMillSite(flat, YARD, [], [])).toBeNull()
  })

  test('refuses a rise the config asked to be taller than', () => {
    expect(findMillSite({ ...knoll(9), prominence: 40 }, YARD, [], [])).toBeNull()
  })

  test('keeps the trestle off the yard, the lines and the discs', () => {
    const search = knoll(9)
    const site   = findMillSite(
      search,
      YARD,
      [{ points: [{ x: 0, z: 0 }, { x: 44, z: 0 }], clearance: 6 }],
      [{ x: 30, z: -18, radius: 7 }],
    )

    expect(site).not.toBeNull()
    expect(Math.hypot(site!.x - YARD.x, site!.z - YARD.z))
      .toBeGreaterThanOrEqual(YARD.radius * 1.1 + MILL_FOOTING)
    expect(distanceToPath([{ x: 0, z: 0 }, { x: 44, z: 0 }], site!.x, site!.z))
      .toBeGreaterThanOrEqual(6)
    expect(Math.hypot(site!.x - 30, site!.z + 18)).toBeGreaterThanOrEqual(7 + search.sweep * 0.7)
    expect(Math.hypot(site!.x, site!.z)).toBeLessThanOrEqual(search.landRadius - MILL_FOOTING)
  })

  test('stands on dry ground', () => {
    const search = knoll(9)
    const site   = findMillSite(search, YARD, [], [])!

    expect(search.ground(site.x, site.z) - search.waterLevel).toBeGreaterThanOrEqual(3.2)
  })

  test('is deterministic', () => {
    const search = knoll(9)

    expect(findMillSite(search, YARD, [], []))
      .toEqual(findMillSite(search, YARD, [], []))
  })

  test('faces the sails out to sea', () => {
    const site = findMillSite(knoll(9), YARD, [], [])!

    // The bearing the island falls away along, which is the fetch the sails
    // want. Anything else and the mill is turned to face its own hill.
    expect(site.bearing).toBeCloseTo(Math.atan2(site.z, site.x), 6)
  })

  test('puts the doorstep at the foot of the stair, behind the mill', () => {
    const site = findMillSite(knoll(9), YARD, [], [])!
    const step = millDoorstep(site)

    expect(Math.hypot(step.x - site.x, step.z - site.z)).toBeCloseTo(MILL_STAIR_REACH, 6)
    // Behind: the bearing from the doorstep to the mill is the way the sails
    // face, so walking to the door means walking toward the wind.
    expect(Math.atan2(site.z - step.z, site.x - step.x)).toBeCloseTo(site.bearing, 6)
  })

  test('prominence reads a hollow as negative', () => {
    const bowl: MillSearch = { ...knoll(9), ground: (x, z) => (x * x + z * z) / 400 }

    expect(prominenceAt(bowl, 0, 0)).toBeLessThan(0)
  })
})

describe('the mills the scape actually has', () => {
  const layout = createScapeLayout(SCAPE_CONFIG)

  test('the home island builds one, above the water and off the beck', () => {
    expect(layout.mill).not.toBeNull()
    expect(layout.mill!.level).toBeGreaterThan(SCAPE_CONFIG.terrain.waterLevel + 3)

    if (layout.creek)
      expect(distanceToPath(layout.creek.points, layout.mill!.x, layout.mill!.z))
        .toBeGreaterThanOrEqual(MILL_FOOTING + SCAPE_CONFIG.creek.width)
  })

  test('every island either builds a mill on a real rise or builds none', () => {
    const archipelago = surveyArchipelago(SCAPE_CONFIG)

    for (const landmass of archipelago.landmasses) {
      const { mill, yard } = landmass.survey.layout

      if (!mill)
        continue

      expect(mill.prominence).toBeGreaterThanOrEqual(SCAPE_CONFIG.mill.prominence)
      expect(Math.hypot(mill.x - yard.x, mill.z - yard.z))
        .toBeGreaterThan(yard.radius)
    }

    // Not every island has to have one, but the scape would be making a claim
    // it could not keep if none of them did.
    expect(archipelago.landmasses.some(landmass => landmass.survey.layout.mill)).toBe(true)
  }, 30_000)
})
