import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG, landmassLayout, landmassTerrain } from '../config.ts'
import type { LandmassSpec, ScapeConfig } from '../config.ts'
import { carveFjord, surveyFjord } from './fjord.ts'
import { STEADING_BUILDINGS } from './steading.ts'
import { surveyScape } from './survey.ts'


/**
 * One island, surveyed once for the whole file.
 *
 * The inlet is a fact about the sound's ground, and the sound's own survey is
 * what knows it — a whole-archipelago survey would pay for four more islands to
 * prove one thing about a hundred and thirty metres of the fifth. It is also the
 * field the terrain patch is drawn from, which is the ground the claims below
 * are about; the composite field is floored at the seabed by the guard and
 * cannot see a trench at all. See `fjordStats` in `scripts/scape-map.ts`.
 */
function localConfig (spec: LandmassSpec): ScapeConfig {
  return {
    ...SCAPE_CONFIG,
    seed:    (SCAPE_CONFIG.seed ^ spec.seedOffset) >>> 0,
    terrain: landmassTerrain(SCAPE_CONFIG, spec),
    layout:  landmassLayout(SCAPE_CONFIG, spec),
  }
}

const specs  = SCAPE_CONFIG.archipelago.landmasses
const sound  = localConfig(specs.find(spec => spec.id === 'sound')!)
const survey = surveyScape(sound)
const fjord  = surveyFjord(sound)!

const { waterLevel } = sound.terrain

/** Metres of water over the centreline at a point along the inlet. */
function depthAt (at: number): number {
  const point = fjord.pointAt(at)

  return waterLevel - survey.field.heightAt(point.x, point.z)
}


describe('the drowned valley', () => {
  test('the two great southern landmasses have one and the other three do not', () => {
    const carved = specs.filter(spec => surveyFjord(localConfig(spec)) !== null)

    expect(carved.map(spec => spec.id)).toEqual([ 'sound', 'fell' ])
  })

  /**
   * The second inlet, checked to the same three depths as the first.
   *
   * Not a copy of the sound's test for the sake of symmetry: the two are
   * authored separately — different coast, different bearing, a bend turned the
   * other way — and the profile is measured inland from a shore this island
   * puts somewhere else, so nothing about the sound passing says the fell does.
   */
  test('the fell has one too, and it is a fjord rather than a bay', () => {
    const spec  = specs.find(candidate => candidate.id === 'fell')!
    const local = localConfig(spec)
    const other = surveyFjord(local)!
    const field = surveyScape(local).field

    const depth = (at: number): number => {
      const point = other.pointAt(at)

      return local.terrain.waterLevel - field.heightAt(point.x, point.z)
    }

    const sea   = depth(0)
    const basin = Math.max(...Array.from({ length: 61 }, (_, step) => depth(step / 60)))

    expect(basin).toBeGreaterThan(sea)
    expect(field.heightAt(other.head.x, other.head.z)).toBeGreaterThan(local.terrain.waterLevel)
  })

  /**
   * The switch, and the whole of it.
   *
   * `depth = 0` has to leave the ground *byte* identical rather than nearly so:
   * every island but one runs through `carveFjord` on every vertex and every
   * placement probe, and a carve that moved the ground by a millimetre where it
   * was switched off would move four islands nobody asked it to touch.
   */
  test('depth zero is not a shallower fjord, it is no fjord', () => {
    const off = { ...sound, terrain: { ...sound.terrain, fjord: { ...sound.terrain.fjord, depth: 0 }}}

    for (let step = 0; step <= 60; step += 1) {
      const at    = step / 60
      const point = fjord.pointAt(at)
      const raw   = 3.5 + at * 4

      expect(carveFjord(off, point.x, point.z, raw)).toBe(raw)
    }
  })

  /**
   * A trench may only ever cut downward.
   *
   * The rule the beck's channel is written against, and it matters here for the
   * same reason: the floor the profile asks for stands above mean water at the
   * head, so a carve that blended toward it unconditionally would *raise* the
   * hillside the valley runs into.
   */
  test('it never raises the ground it is cut into', () => {
    for (let step = 0; step <= 40; step += 1)
      for (let lane = -6; lane <= 6; lane += 1) {
        const point = fjord.pointAt(step / 40)
        const x     = point.x + lane * 8
        const z     = point.z + lane * 5

        for (const raw of [ -14, -2, 0, 6, 18 ])
          expect(carveFjord(sound, x, z, raw)).toBeLessThanOrEqual(raw)
      }
  })

  /**
   * The shape, stated as three depths rather than as a picture.
   *
   * The whole difference between a fjord and a bay is that the basin is
   * *overdeepened* — cut below the sea it opens into — and that a sill stands
   * across the mouth shallower than either. Both are invisible in a still,
   * because the depth channel of the shore mask saturates at a few metres and
   * paints every one of these three the same blue.
   */
  test('the basin is deeper than the sea, and the sill is shallower than both', () => {
    const sea   = depthAt(0)
    const basin = Math.max(...Array.from({ length: 61 }, (_, step) => depthAt(step / 60)))

    let sill = Infinity

    for (let step = 0; step <= 30; step += 1)
      sill = Math.min(sill, depthAt(step / 60))

    expect(basin).toBeGreaterThan(sea)
    expect(sill).toBeLessThan(sea)
    expect(sill).toBeGreaterThan(0)
  })

  test('the mouth stands in open water and the head stands dry', () => {
    expect(survey.field.heightAt(fjord.mouth.x, fjord.mouth.z)).toBeLessThan(waterLevel)
    expect(survey.field.heightAt(fjord.head.x, fjord.head.z)).toBeGreaterThan(waterLevel)
  })

  /**
   * The walls, as the slope the terrain painter will read.
   *
   * `terrain.ts` paints granite over scree wherever the ground passes about
   * 0.34 of gradient, so a trench whose sides came in under that would be a
   * grass-lined ditch. Measured beside the basin, where the ground either side
   * is above water and there is a wall to have.
   */
  test('its sides are steep enough to read as rock', () => {
    const centre = fjord.pointAt(0.62)
    const edge   = fjord.halfWidthAt(0.62)

    const steepest = Math.max(
      survey.field.slopeAt(centre.x + edge, centre.z),
      survey.field.slopeAt(centre.x - edge, centre.z),
    )

    expect(steepest).toBeGreaterThan(0.34)
  })

  /**
   * The reason the carve lives in `baseAt` rather than in the composite field.
   *
   * Every placement search on this island reads the raw ground through the same
   * function the height field does, so all of them see the trench before they
   * choose anything. This states that as a fact about the survey: the farm is
   * on dry land, and so is the jetty it ships from. Carve the inlet anywhere
   * downstream of the survey and this is the test that goes red.
   */
  test('the farm it was cut past is still on dry ground', () => {
    const { yard, plots } = survey.layout

    expect(survey.field.heightAt(yard.x, yard.z)).toBeGreaterThan(waterLevel + 0.5)

    for (const plot of plots)
      expect(survey.field.heightAt(plot.x, plot.z)).toBeGreaterThan(waterLevel)

    for (const name of STEADING_BUILDINGS) {
      const site = survey.places[name]

      expect(survey.field.heightAt(site.x, site.z)).toBeGreaterThan(waterLevel)
    }

    expect(survey.landing).not.toBeNull()
  })

  /**
   * The scale class, written as a test rather than only as a comment.
   *
   * Every length in the section is metres and none of them is a fraction of the
   * world or of the frame, so a world three times the span has the same inlet in
   * it. The one fraction involved — where the mouth is anchored — is read off
   * `islandOuter`, which is a fact about the island rather than about the world.
   */
  test('a wider world does not make a wider fjord', () => {
    const wider = {
      ...sound,
      archipelago: { ...sound.archipelago, worldSize: sound.archipelago.worldSize * 3 },
    }

    for (let step = 0; step <= 40; step += 1) {
      const point = fjord.pointAt(step / 40)

      expect(carveFjord(wider, point.x, point.z, 4)).toBe(carveFjord(sound, point.x, point.z, 4))
    }
  })

  test('the same island carves the same trench twice', () => {
    const again = surveyFjord(localConfig(specs.find(spec => spec.id === 'sound')!))!

    expect(again.mouth).toEqual(fjord.mouth)
    expect(again.head).toEqual(fjord.head)

    for (let step = 0; step <= 40; step += 1) {
      const at = step / 40

      expect(again.floorAt(at)).toBe(fjord.floorAt(at))
      expect(again.halfWidthAt(at)).toBe(fjord.halfWidthAt(at))
    }
  })
})
