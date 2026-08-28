import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { SURVEY_BUDGET_MS, surveyArchipelago } from './archipelago.ts'
import { CHAPEL_FOOTING, CHAPEL_RADIUS, findChapelSite } from './chapel.ts'
import type { ChapelSearch } from './chapel.ts'
import { createScapeLayout } from './layout.ts'
import { distanceToPath } from './path.ts'
import { doorstepOf } from './steading.ts'


const YARD = { x: -14, z: 3, radius: 12 }

/**
 * An island with one knoll near its southern shore and one in its middle.
 *
 * Two rises rather than one, because the whole claim of the search is that it
 * takes the *seaward* one — a test with a single hill on it cannot tell a
 * coastal chapel from a chapel on the best ground going.
 */
function coast (height: number): ChapelSearch {
  return {
    ground: (x, z) =>
      height * Math.exp(-((x - 8) ** 2 + (z - 34) ** 2) / 260) +
      height * Math.exp(-(x ** 2 + z ** 2) / 260) + 2,
    landRadius: 44,
    waterLevel: -1.25,
    knoll:      1.1,
    shore:      26,
  }
}

describe('siting a chapel', () => {
  test('takes the knoll by the water and not the one in the middle', () => {
    const site = findChapelSite(coast(7), YARD, [], [])

    expect(site).not.toBeNull()
    expect(Math.hypot(site!.x - 8, site!.z - 34)).toBeLessThan(10)
    expect(site!.prominence).toBeGreaterThanOrEqual(1.1)
  })

  test('refuses flat ground rather than settling for it', () => {
    // `null` is an answer. A chapel on a featureless shore is a chapel nobody
    // sited, and the ridge island in the real archipelago is exactly that.
    expect(findChapelSite({ ...coast(7), ground: () => 4 }, YARD, [], [])).toBeNull()
  })

  test('refuses a knoll the config asked to be taller than', () => {
    expect(findChapelSite({ ...coast(7), knoll: 40 }, YARD, [], [])).toBeNull()
  })

  test('refuses the island when nothing near the coast qualifies', () => {
    // The middle knoll is still there and still the best ground on the island.
    // A shore band of two metres puts it out of reach, and the answer is none
    // rather than the inland hill.
    expect(findChapelSite({ ...coast(7), shore: 2 }, YARD, [], [])).toBeNull()
  })

  test('stays inside the shore band it was given', () => {
    const search = coast(7)
    const site   = findChapelSite(search, YARD, [], [])!

    expect(site.inland).toBeLessThanOrEqual(search.shore)
    expect(site.inland).toBeCloseTo(search.landRadius - Math.hypot(site.x, site.z), 6)
  })

  test('keeps clear of the yard, the lines and the discs', () => {
    const track = [{ x: -44, z: 20 }, { x: 44, z: 20 }]
    const site  = findChapelSite(
      coast(7),
      YARD,
      [{ points: track, clearance: 5 }],
      [{ x: 8, z: 34, radius: 6 }],
    )

    expect(site).not.toBeNull()
    expect(Math.hypot(site!.x - YARD.x, site!.z - YARD.z))
      .toBeGreaterThanOrEqual(YARD.radius * 1.15 + CHAPEL_FOOTING)
    expect(distanceToPath(track, site!.x, site!.z)).toBeGreaterThanOrEqual(5)
    expect(Math.hypot(site!.x - 8, site!.z - 34)).toBeGreaterThanOrEqual(6 + CHAPEL_FOOTING)
  })

  test('stands above the shore shelving, not merely above the water', () => {
    const search = coast(7)
    const site   = findChapelSite(search, YARD, [], [])!

    expect(search.ground(site.x, site.z) - search.waterLevel).toBeGreaterThanOrEqual(2.6)
    expect(site.level).toBeCloseTo(search.ground(site.x, site.z), 6)
  })

  test('is deterministic', () => {
    expect(findChapelSite(coast(7), YARD, [], []))
      .toEqual(findChapelSite(coast(7), YARD, [], []))
  })

  test('turns its door to the farm, and puts the doorstep on that side', () => {
    const site = findChapelSite(coast(7), YARD, [], [])!
    const step = doorstepOf(site)

    // `Standing.angle` is a yaw and not a bearing: `rotateY` carries local `+z`
    // to `(sin θ, cos θ)`, so the door looks at the yard exactly when the yaw is
    // `atan2(dx, dz)`. The mirrored version is the one that reads right on the
    // diagonal and puts the door in the hedge everywhere else.
    expect(site.angle).toBeCloseTo(Math.atan2(YARD.x - site.x, YARD.z - site.z), 6)

    expect(Math.hypot(step.x - site.x, step.z - site.z)).toBeCloseTo(site.radius + 1.4, 6)
    expect(Math.hypot(step.x - YARD.x, step.z - YARD.z))
      .toBeLessThan(Math.hypot(site.x - YARD.x, site.z - YARD.z))
  })
})

describe('the chapels the scape actually has', () => {
  const layout = createScapeLayout(SCAPE_CONFIG)

  test('the home island builds one, on the coast and off the mill', () => {
    const { chapel, mill } = layout

    expect(chapel).not.toBeNull()
    expect(chapel!.level).toBeGreaterThan(SCAPE_CONFIG.terrain.waterLevel + 2.6)
    expect(chapel!.inland).toBeLessThanOrEqual(SCAPE_CONFIG.chapel.shore)
    expect(chapel!.radius).toBe(CHAPEL_RADIUS)

    if (mill)
      expect(Math.hypot(mill.x - chapel!.x, mill.z - chapel!.z))
        .toBeGreaterThanOrEqual(SCAPE_CONFIG.mill.sailSpan * 0.5 + CHAPEL_FOOTING)
  })

  test('every island either builds one on the coast or builds none', () => {
    const archipelago = surveyArchipelago(SCAPE_CONFIG)

    for (const landmass of archipelago.landmasses) {
      const { chapel, yard, landRadius } = landmass.survey.layout

      if (!chapel)
        continue

      expect(chapel.prominence).toBeGreaterThanOrEqual(SCAPE_CONFIG.chapel.knoll)
      expect(chapel.inland).toBeLessThanOrEqual(SCAPE_CONFIG.chapel.shore)
      expect(Math.hypot(chapel.x, chapel.z)).toBeLessThanOrEqual(landRadius - CHAPEL_FOOTING)
      expect(Math.hypot(chapel.x - yard.x, chapel.z - yard.z)).toBeGreaterThan(yard.radius)
    }

    // Not every island has to have one — the search is allowed to come back
    // empty — but the scape would be making a claim it could not keep if none
    // of them did.
    expect(archipelago.landmasses.some(landmass => landmass.survey.layout.chapel)).toBe(true)
  }, SURVEY_BUDGET_MS)

  test('every chapel is walked to', () => {
    const archipelago = surveyArchipelago(SCAPE_CONFIG)

    for (const landmass of archipelago.landmasses) {
      const { chapel } = landmass.survey.layout

      if (!chapel)
        continue

      // The claim the network makes about every place in it: a chapel nothing
      // is routed to is a building on a hill with no way to reach it.
      const legs = landmass.survey.network.waypoints
        .filter(point => point.kind === 'chapel')

      expect(legs).toHaveLength(1)
      expect(landmass.survey.network.legs.some(([ a, b ]) =>
        landmass.survey.network.waypoints[a].kind === 'chapel' ||
        landmass.survey.network.waypoints[b].kind === 'chapel')).toBe(true)
    }
  }, SURVEY_BUDGET_MS)
})
