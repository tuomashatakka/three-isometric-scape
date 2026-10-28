import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { kilnDensity } from '../hearth.ts'
import { surveyArchipelago } from './archipelago.ts'
import type { LandmassSurvey } from './archipelago.ts'
import { KILN_FOOTING, downhillYaw, findKilnSite, kilnBurn } from './kiln.ts'
import { SMOKEHOUSE_FOOTING } from './smokehouse.ts'


const archipelago                                = surveyArchipelago(SCAPE_CONFIG)
const { waterLevel }                             = SCAPE_CONFIG.terrain
const { setback, reach, freeboard, brae, scarp } = SCAPE_CONFIG.kiln

/** Every island that got one, with the survey it came out of. */
const built = archipelago.landmasses.filter(landmass => landmass.survey.kiln !== null)

function siteOf (landmass: LandmassSurvey) {
  return landmass.survey.kiln!
}

/** A bank falling one in four toward +x, with nothing else on it. */
function slope (grade: number) {
  return (x: number, _z: number): number => 10 - x * grade
}

/** The search over a plain brae, with no harbour and nothing in the way. */
function onSlope (over: Record<string, number> = {}) {
  return findKilnSite(
    { ground: slope(0.4), waterLevel, freeboard, setback, reach, brae, scarp, ...over },
    { x: 0, z: 0, angle: 0 },
    [],
  )
}

describe('kiln siting', () => {
  test('this seed builds one on more than one island', () => {
    // Not a law of the search — `null` is a real answer for a harbour with no
    // brae behind it — but a fact about this seed, and the one the run's
    // headline rests on. A retune that quietly takes the kilns back out of the
    // scape fails here rather than in a screenshot nobody compares.
    expect(built.length).toBeGreaterThan(1)

    for (const landmass of built)
      expect([ landmass.id, landmass.survey.harbour !== null ]).toEqual([ landmass.id, true ])
  })

  test('the draw sill stands clear of the water, not just the axis', () => {
    // The claim, as a fact about the data: `freeboard` is asked at the arch,
    // which is the end that is downhill by construction. A centre a metre clear
    // of the sea says nothing about the sill the lime is raked onto.
    for (const landmass of built) {
      const site         = siteOf(landmass)
      const { heightAt } = landmass.survey.field
      const sillX        = site.x + Math.sin(site.angle) * 1.85
      const sillZ        = site.z + Math.cos(site.angle) * 1.85

      expect(heightAt(sillX, sillZ) - waterLevel).toBeGreaterThanOrEqual(freeboard)
      expect(site.level - waterLevel).toBeGreaterThanOrEqual(freeboard)
    }
  })

  test('every one of them is cut into a brae, within the gate it was given', () => {
    for (const landmass of built) {
      const site = siteOf(landmass)

      expect(site.fall).toBeGreaterThanOrEqual(brae)
      expect(site.fall).toBeLessThanOrEqual(scarp)
      expect(site.crown - site.level).toBeCloseTo(site.fall, 6)
    }
  })

  test('the arch looks downhill rather than at the water', () => {
    // The whole difference between this search and the smokehouse's. A kiln
    // drawn into the hill is a kiln nobody can draw, and the reflection between
    // a yaw and a bearing is exactly how that happens.
    for (const landmass of built) {
      const site = siteOf(landmass)

      expect(site.crown).toBeGreaterThan(site.level)
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

  test('it never stands inside the hut on the same bank', () => {
    for (const landmass of built) {
      const site = siteOf(landmass)
      const hut  = landmass.survey.smokehouse

      if (!hut)
        continue

      expect(Math.hypot(hut.x - site.x, hut.z - site.z))
        .toBeGreaterThanOrEqual(KILN_FOOTING + SMOKEHOUSE_FOOTING)
    }
  })

  test('the search is stable for one brae', () => {
    expect(onSlope()).toEqual(onSlope())
  })

  test('a flat shelf gets no kiln at all', () => {
    const level = findKilnSite(
      { ground: () => 4, waterLevel, freeboard, setback, reach, brae, scarp },
      { x: 0, z: 0, angle: 0 },
      [],
    )

    expect(level).toBeNull()
  })

  test('a brae asked steeper than the scarp it allows is a coast with no kiln', () => {
    expect(onSlope({ brae: 3, scarp: 2 })).toBeNull()
  })

  test('on a plain slope the arch looks the way the ground goes', () => {
    const site = onSlope()

    expect(site).not.toBeNull()

    // Local +z carried to world by `rotateY` is `(sin θ, cos θ)`, and the
    // ground falls toward +x — so the arch looks very nearly down +x.
    expect(Math.sin(site!.angle)).toBeCloseTo(1, 2)
    expect(Math.cos(site!.angle)).toBeCloseTo(0, 2)
  })

  test('the downhill probe answers in yaw and not in bearing', () => {
    // The two are reflections of each other and agree on one diagonal, so a
    // slope on each axis is what actually separates them.
    expect(downhillYaw(slope(0.25), 0, 0)).toBeCloseTo(Math.PI / 2, 4)
    expect(downhillYaw((_x, z) => 10 - z * 0.25, 0, 0)).toBeCloseTo(0, 4)
  })
})

describe('the burn window', () => {
  test('it is full on the peak week and out half a year away', () => {
    const { burn, peak } = SCAPE_CONFIG.kiln

    expect(kilnBurn(peak, burn, peak)).toBeCloseTo(1, 6)
    expect(kilnBurn((peak + 0.5) % 1, burn, peak)).toBe(0)
  })

  test('it is out for most of the year, unlike a hearth', () => {
    const { burn, peak } = SCAPE_CONFIG.kiln
    const weeks          = 52
    let lit              = 0

    for (let week = 0; week < weeks; week += 1)
      if (kilnBurn(week / weeks, burn, peak) > 0.01)
        lit += 1

    expect(lit).toBeGreaterThan(0)
    expect(lit / weeks).toBeLessThan(0.3)
  })

  test('it reads the ring rather than the number line', () => {
    // A burn centred near midwinter has to wrap, or a kiln goes out on new
    // year's eve and relights on new year's day.
    expect(kilnBurn(0.99, 0.2, 0.02)).toBeCloseTo(kilnBurn(0.05, 0.2, 0.02), 6)
  })

  test('zero is a cold archipelago and one is a kiln that never goes out', () => {
    expect(kilnBurn(0.3, 0, 0.62)).toBe(0)
    expect(kilnBurn(0.3, 1, 0.62)).toBe(1)
  })

  test('the draw is headroom rather than brightness', () => {
    const { peak } = SCAPE_CONFIG.kiln

    expect(kilnDensity(SCAPE_CONFIG, peak)).toBeLessThanOrEqual(1)
    expect(kilnDensity(SCAPE_CONFIG, peak)).toBeCloseTo(1, 6)
    expect(kilnDensity({ ...SCAPE_CONFIG, kiln: { ...SCAPE_CONFIG.kiln, draw: 0 }}, peak)).toBe(0)
  })
})
