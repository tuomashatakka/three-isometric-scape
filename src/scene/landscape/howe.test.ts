import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { surveyArchipelago } from './archipelago.ts'
import type { LandmassSurvey } from './archipelago.ts'
import { HOWE_FOOTING, HOWE_HEIGHT, HOWE_RADIUS, findHoweSite, kerbFall, skylineClearance } from './howe.ts'
import { SHIELING_FOOTING } from './shieling.ts'


const archipelago                         = surveyArchipelago(SCAPE_CONFIG)
const { eye, prospect, setback, stature } = SCAPE_CONFIG.howe

/** Every island that got one, with the survey it came out of. */
const built = archipelago.landmasses.filter(landmass => landmass.survey.howe !== null)

function siteOf (landmass: LandmassSurvey) {
  return landmass.survey.howe!
}

/** The same reach the survey hands the wall, the hut and the mound. See `hillReach`. */
function reachOf (landmass: LandmassSurvey): number {
  return landmass.survey.layout.landRadius * 1.3
}

/** The highest ground a prospect away, read independently of the search. */
function ringHigh (landmass: LandmassSurvey, x: number, z: number): number {
  const ground = landmass.survey.field.heightAt
  let high     = -Infinity

  for (let step = 0; step < 12; step += 1) {
    const around = step / 12 * Math.PI * 2

    high = Math.max(high, ground(x + Math.cos(around) * prospect, z + Math.sin(around) * prospect))
  }

  return high
}

describe('howe siting', () => {
  test('the archipelago carries barrows, and says which island does not', () => {
    // Not a law of the search — `null` is a real answer — but a fact about this
    // seed, and the one the run's headline rests on. The refusal is named
    // rather than counted: the ridge island is the smallest in the scape and
    // the whole of its dry ground outside the setback is either the farm's or
    // too low over the water to raise anything on.
    const missing = archipelago.landmasses
      .filter(landmass => landmass.survey.howe === null)
      .map(landmass => landmass.id)
      .sort()

    expect(missing).toEqual([ 'ridge' ])
    expect(built.length).toBe(5)
  })

  test('every one of them stands against the sky from its own farmyard', () => {
    // The claim the whole section rests on, stated as a fact about the data and
    // measured again here rather than trusted from the record the search wrote.
    // A mound this reports at zero is a mound with a shoulder of its own island
    // in front of it — which in a still is indistinguishable from no mound.
    for (const landmass of built) {
      const site     = siteOf(landmass)
      const { yard } = landmass.survey.layout
      const measured = skylineClearance(
        landmass.survey.field.heightAt, yard, eye, site, site.level + HOWE_HEIGHT,
      )

      expect(measured).toBeGreaterThan(0)
      expect(site.skyline).toBeCloseTo(measured, 6)
    }
  })

  test('nothing within a prospect of one looks down on it', () => {
    for (const landmass of built) {
      const site = siteOf(landmass)

      expect(site.stands).toBeGreaterThanOrEqual(stature)
      expect(site.stands).toBeCloseTo(site.level - ringHigh(landmass, site.x, site.z), 6)
    }
  })

  test('the ground under the kerb is flat enough to set a ring of stone in', () => {
    for (const landmass of built) {
      const site = siteOf(landmass)

      // The gate the search applies, re-measured. Loose by the standards of
      // this scape's sills because a barrow is piled and plopped rather than
      // built on a baked socle — but a ring is still a ring.
      expect(kerbFall(landmass.survey.field.heightAt, site.x, site.z)).toBeLessThanOrEqual(1.8)
    }
  })

  test('it stays past the setback, inside the reach, and out of the sea', () => {
    for (const landmass of built) {
      const site     = siteOf(landmass)
      const { yard } = landmass.survey.layout
      const measured = Math.hypot(site.x - yard.x, site.z - yard.z)

      expect(measured).toBeGreaterThanOrEqual(setback - 1e-6)
      expect(site.fromYard).toBeCloseTo(measured, 6)
      expect(Math.hypot(site.x, site.z)).toBeLessThanOrEqual(reachOf(landmass) + 1e-6)
      expect(site.level).toBeGreaterThan(SCAPE_CONFIG.terrain.waterLevel + 1)
    }
  })

  test('it never stands on ground the farm had already taken', () => {
    // The mound is sited after everything else ashore, so this is the claim
    // that the order actually held: the yard it was handed by hand, and the
    // hut, which is the one thing on these islands that wants the same hill.
    for (const landmass of built) {
      const site                 = siteOf(landmass)
      const { shieling, layout } = landmass.survey

      expect(Math.hypot(site.x - layout.yard.x, site.z - layout.yard.z))
        .toBeGreaterThanOrEqual(layout.yard.radius + HOWE_FOOTING)

      if (shieling)
        expect(Math.hypot(site.x - shieling.x, site.z - shieling.z))
          .toBeGreaterThanOrEqual(SHIELING_FOOTING + HOWE_FOOTING)
    }
  })

  test('the footing holds the mound it was written for', () => {
    // Two numbers in one file that have to stay in step: the kerb is set on
    // `HOWE_RADIUS`, and nothing else may be sited inside `HOWE_FOOTING`.
    expect(HOWE_FOOTING).toBeGreaterThan(HOWE_RADIUS + 1)
  })

  test('it takes the top it can see over the taller one it cannot', () => {
    // The section's argument, on ground built to put the two in conflict: a
    // five-metre top at twenty-five metres due east, a seven-metre one at
    // seventy, and between them a sharp eight-metre ridge too narrow to set a
    // kerb on and high enough to hide the taller top behind it. Every term of
    // the score except the skyline prefers the far one.
    const ground = (x: number, z: number): number => {
      const near  = 5 * Math.exp(-((x - 25) ** 2 + z ** 2) / 300)
      const ridge = 8 * Math.exp(-((x - 52) ** 2) / 15)
      const far   = 7 * Math.exp(-((x - 70) ** 2 + z ** 2) / 300)

      return Math.max(-4, near + ridge + far)
    }

    const search = {
      ground,
      waterLevel: -2,
      prospect:   14,
      stature:    0.25,
      setback:    10,
      reach:      90,
      eye:        1.6,
      barred:     () => false,
    }

    const site = findHoweSite(search, { x: 0, z: 0 }, [])

    expect(site).not.toBeNull()
    expect(site!.x).toBeGreaterThan(15)
    expect(site!.x).toBeLessThan(35)

    // And twice over the same ground is twice the same answer, which is the
    // whole of what determinism means for a search with no rng in it.
    expect(findHoweSite(search, { x: 0, z: 0 }, [])).toEqual(site)
  })
})
