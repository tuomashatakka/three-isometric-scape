import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { SCAPE_CONFIG } from '../config.ts'
import { buildProp, resolvePalette } from '../props/index.ts'
import { surveyArchipelago } from './archipelago.ts'
import type { LandmassSurvey } from './archipelago.ts'
import { summitOf } from './dyke.ts'
import { distanceToPath } from './path.ts'
import { SHIELING_FOOTING, findShielingSite } from './shieling.ts'
import { doorstepOf } from './steading.ts'


const archipelago                  = surveyArchipelago(SCAPE_CONFIG)
const { headroom, setback, water } = SCAPE_CONFIG.shieling

/** Every island that got one, with the survey it came out of. */
const built = archipelago.landmasses.filter(landmass => landmass.survey.shieling !== null)

function siteOf (landmass: LandmassSurvey) {
  return landmass.survey.shieling!
}

/** The same reach the survey hands both the wall and the hut. See `hillReach`. */
function reachOf (landmass: LandmassSurvey): number {
  return landmass.survey.layout.landRadius * 1.3
}

describe('shieling siting', () => {
  test('the archipelago carries huts, and says which islands do not', () => {
    // Not a law of the search — `null` is a real answer — but a fact about this
    // seed, and the one the run's headline rests on. The two refusals are named
    // rather than counted: the shield's hill is under its ice cap, and the ridge
    // island is small enough that the whole of its hill is inside the walk.
    const missing = archipelago.landmasses
      .filter(landmass => landmass.survey.shieling === null)
      .map(landmass => landmass.id)
      .sort()

    expect(missing).toEqual([ 'ridge', 'shield' ])
    expect(built.length).toBe(4)
  })

  test('it stands a share of the way up the island the head dyke measured', () => {
    // One summit, two searches. The whole reason `summitOf` is exported.
    for (const landmass of built) {
      const { layout, field } = landmass.survey
      const site              = siteOf(landmass)
      const foot              = field.heightAt(layout.yard.x, layout.yard.z)
      const summit            = summitOf(field.heightAt, reachOf(landmass)).height

      expect(site.level).toBeGreaterThanOrEqual(foot + (summit - foot) * headroom)
      expect(site.rise).toBeCloseTo(site.level - foot, 6)
    }
  })

  test('it is out on the hill, past its island own head dyke', () => {
    // The claim the whole section rests on, as a fact about the data: a
    // shieling is the building on the far side of the wall, so the ground it
    // stands on is above the contour the wall is laid along. Stated here rather
    // than left to whoever next retunes either headroom.
    for (const landmass of built) {
      const { dyke } = landmass.survey

      if (dyke)
        expect(siteOf(landmass).level).toBeGreaterThan(dyke.level)
    }
  })

  test('it stays past the setback and inside the reach it was given', () => {
    for (const landmass of built) {
      const site     = siteOf(landmass)
      const { yard } = landmass.survey.layout
      const measured = Math.hypot(site.x - yard.x, site.z - yard.z)

      expect(measured).toBeGreaterThanOrEqual(setback - 1e-6)
      expect(measured).toBeLessThanOrEqual(reachOf(landmass) + 1e-6)
      expect(site.fromYard).toBeCloseTo(measured, 6)
    }
  })

  test('it stands at the burn, and never in it', () => {
    for (const landmass of built) {
      const site      = siteOf(landmass)
      const { creek } = landmass.survey.layout

      if (!creek) {
        expect(site.toWater).toBe(Infinity)
        continue
      }

      expect(site.toWater).toBeCloseTo(distanceToPath(creek.points, site.x, site.z), 6)
      expect(site.toWater).toBeLessThanOrEqual(water)
      expect(creek.clearanceAt(site.x, site.z)).toBeGreaterThanOrEqual(0)
    }
  })

  test('the room has a level sill under all four corners', () => {
    for (const landmass of built) {
      const site         = siteOf(landmass)
      const { heightAt } = landmass.survey.field

      for (const [ dx, dz ] of [[ -1.6, -1.15 ], [ 1.6, -1.15 ], [ 1.6, 1.15 ], [ -1.6, 1.15 ]])
        expect(Math.abs(heightAt(site.x + dx, site.z + dz) - site.level)).toBeLessThanOrEqual(0.55)
    }
  })

  test('nothing already standing is built on, the farmyard included', () => {
    for (const landmass of built) {
      const site               = siteOf(landmass)
      const { places, layout } = landmass.survey

      const claimed = [
        ...Object.values(places),
        { x: layout.yard.x, z: layout.yard.z, radius: layout.yard.radius },
        ...layout.pasture
          ? [{ x: layout.pasture.x, z: layout.pasture.z, radius: layout.pasture.radius }]
          : [],
      ]

      for (const thing of claimed)
        expect(Math.hypot(thing.x - site.x, thing.z - site.z))
          .toBeGreaterThanOrEqual(thing.radius + SHIELING_FOOTING)
    }
  })

  test('its door looks back down at the farm', () => {
    for (const landmass of built) {
      const site     = siteOf(landmass)
      const { yard } = landmass.survey.layout
      const step     = doorstepOf(site)

      // The doorstep is the same walk from the hut whichever way it is turned,
      // so the only thing that can make it *nearer* the yard than the hut's own
      // middle is the yaw being right.
      expect(Math.hypot(step.x - yard.x, step.z - yard.z))
        .toBeLessThan(Math.hypot(site.x - yard.x, site.z - yard.z))
    }
  })

  test('the network is worn to that door, and knows its name', () => {
    for (const landmass of built) {
      const step = doorstepOf(siteOf(landmass))
      const at   = landmass.survey.network.waypoints.find(point => point.name === 'shieling')

      expect(at).toBeDefined()
      expect(at!.kind).toBe('door')
      expect(Math.hypot(at!.x - step.x, at!.z - step.z)).toBeLessThan(1e-6)
    }
  })

  test('the same hill sites the same hut, twice', () => {
    for (const landmass of built) {
      const { layout, field } = landmass.survey
      const search            = {
        ground: field.heightAt,
        foot:   field.heightAt(layout.yard.x, layout.yard.z),
        headroom,
        setback,
        reach:  reachOf(landmass),
        water,
        burn:   layout.creek?.points ?? null,
        barred: (): boolean => false,
      }
      const summit = summitOf(field.heightAt, reachOf(landmass)).height

      expect(findShielingSite(search, layout.yard, summit, []))
        .toEqual(findShielingSite(search, layout.yard, summit, []))
    }
  })

  test('an island with no hill on it refuses rather than guessing', () => {
    const flat = findShielingSite(
      {
        ground:   () => 3,
        foot:     3,
        headroom: 0.55,
        setback:  25,
        reach:    80,
        water:    55,
        burn:     null,
        barred:   () => false,
      },
      { x: 0, z: 0 },
      // A summit a metre and a half over the farm is not a hill — see `HILL`.
      4.5,
      [],
    )

    expect(flat).toBeNull()
  })

  test('headroom at 1 is the switch, and takes every hut out', () => {
    // The rule these documents keep: an effect is off when its number says so,
    // and there is no boolean beside it saying the same thing again.
    const off = findShielingSite(
      {
        ground:   (x, z) => 20 - Math.hypot(x, z) * 0.05,
        foot:     0,
        headroom: 1,
        setback:  25,
        reach:    80,
        water:    55,
        burn:     null,
        barred:   () => false,
      },
      { x: 0, z: 0 },
      20,
      [],
    )

    expect(off).toBeNull()
  })

  test('a hill entirely inside the walk gets no hut', () => {
    // The ridge island's refusal, as a fact rather than as an anecdote: a cone
    // whose whole rise is under the setback leaves the sweep nothing but the
    // ground falling away from it.
    const small = findShielingSite(
      {
        ground:   (x, z) => Math.max(0, 12 - Math.hypot(x, z) * 0.8),
        foot:     0,
        headroom: 0.55,
        setback:  25,
        reach:    40,
        water:    55,
        burn:     null,
        barred:   () => false,
      },
      { x: 0, z: 0 },
      12,
      [],
    )

    expect(small).toBeNull()
  })
})

describe('the shieling itself', () => {
  const geometry = buildProp('shieling', createSeededRng(7_319), resolvePalette())
  const bounds   = new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)

  test('it is built to the prop contract: base at zero, and attributes present', () => {
    expect(geometry.getAttribute('position')).toBeDefined()
    expect(geometry.getAttribute('normal')).toBeDefined()
    expect(geometry.getAttribute('color')).toBeDefined()
    expect(bounds.min.y).toBeGreaterThan(-0.35)
    expect(bounds.min.y).toBeLessThan(0.3)
  })

  test('SHIELING_FOOTING holds the whole plan, hut and fold', () => {
    const corners = [
      Math.hypot(bounds.min.x, bounds.min.z),
      Math.hypot(bounds.min.x, bounds.max.z),
      Math.hypot(bounds.max.x, bounds.min.z),
      Math.hypot(bounds.max.x, bounds.max.z),
    ]

    expect(Math.max(...corners)).toBeLessThanOrEqual(SHIELING_FOOTING)
  })

  test('the fold is behind the hut, and the door is not inside it', () => {
    // The layout claim: the room is a side of the fold rather than a thing
    // standing in it, so the enclosure reaches back on `-z` and the door's own
    // side of the building is clear.
    expect(bounds.min.z).toBeLessThan(-3.5)
    expect(bounds.max.z).toBeLessThan(2.5)
  })

  test('one seed builds one hut, byte for byte', () => {
    const again = buildProp('shieling', createSeededRng(7_319), resolvePalette())

    expect(Array.from(again.getAttribute('position').array as Float32Array))
      .toEqual(Array.from(geometry.getAttribute('position').array as Float32Array))
  })
})
