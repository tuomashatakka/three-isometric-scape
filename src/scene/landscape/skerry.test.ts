import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { surveyArchipelago } from './archipelago.ts'
import { surveySkerries } from './skerry.ts'


/**
 * One survey for the whole file, for the reason `strand.test.ts` states: this
 * archipelago is five islands and surveying it is not cheap, so a test that
 * built its own would pay for the whole world to prove one thing about the water
 * between the islands.
 */
const survey                     = surveyArchipelago(SCAPE_CONFIG)
const { waterLevel, seabedDrop } = SCAPE_CONFIG.terrain
const seabed                     = waterLevel - seabedDrop
const { clearance }              = SCAPE_CONFIG.skerries


describe('the rocks in the open sea', () => {
  test('there are some, and they came in chains rather than one at a time', () => {
    expect(survey.skerries.skerries.length).toBeGreaterThan(0)
    expect(survey.skerries.chains).toBeGreaterThan(0)
    expect(survey.skerries.skerries.length).toBeGreaterThan(survey.skerries.chains)
  })

  /**
   * The claim, as a fact about the ground.
   *
   * A skerry that does not break the surface is a shoal: invisible from every
   * pose, still an obstacle to the ferry planner, and impossible to tell apart
   * from a rock that simply was not placed. Read off the *composite* field
   * rather than off the survey's own `crest`, because what the rest of the
   * scape meets is the maximum of the guard and whatever else claims that
   * ground, and asking the guard what it thinks it is would answer a question
   * nobody had.
   */
  test('every one of them breaks the surface', () => {
    for (const rock of survey.skerries.skerries)
      expect(survey.field.heightAt(rock.x, rock.z)).toBeGreaterThan(waterLevel)
  })

  /**
   * The other half of the same claim: a rock is a rock all the way round, not
   * a spike at one sampled point. Walked at eight bearings out to a quarter of
   * the radius, which is inside the crown even where the outline's lobes have
   * pulled the reach in as far as they may.
   *
   * This is the test that found the profile: one dome from the seabed to the
   * crown puts the waterline at ninety-two per cent of the rock's height, and
   * every one of them was a two-metre cap on a forty-metre shoal. See `SHELF`.
   */
  test('the crown is broad rather than a spike', () => {
    for (const rock of survey.skerries.skerries)
      for (let bearing = 0; bearing < 8; bearing += 1) {
        const angle = bearing / 8 * Math.PI * 2

        expect(survey.field.heightAt(
          rock.x + Math.cos(angle) * rock.radius * 0.25,
          rock.z + Math.sin(angle) * rock.radius * 0.25,
        )).toBeGreaterThan(waterLevel)
      }
  })

  /** Nothing may stand on an island patch, or on the bar, or on another rock. */
  test('every rock keeps its clearance from every island', () => {
    for (const rock of survey.skerries.skerries)
      for (const landmass of survey.landmasses) {
        const gap = Math.max(
          Math.abs(rock.x - landmass.origin.x),
          Math.abs(rock.z - landmass.origin.z),
        ) - landmass.config.terrain.size * 0.5 - rock.radius

        expect(gap).toBeGreaterThanOrEqual(clearance - 1e-6)
      }
  })

  test('no two rocks are inside one another', () => {
    const { skerries } = survey.skerries

    for (let a = 0; a < skerries.length; a += 1)
      for (let b = a + 1; b < skerries.length; b += 1)
        expect(Math.hypot(
          skerries[a].x - skerries[b].x,
          skerries[a].z - skerries[b].z,
        )).toBeGreaterThanOrEqual(Math.max(skerries[a].radius, skerries[b].radius) - 1e-6)
  })

  test('no rock stands on the bar', () => {
    const { strand } = survey

    expect(strand).not.toBeNull()

    for (const rock of survey.skerries.skerries)
      expect(strand?.claimAt(rock.x, rock.z)).toBe(0)
  })

  /**
   * The fold, stated rather than assumed.
   *
   * The composite field takes a maximum over the patch, the bar and the guard,
   * and a minimum anywhere in that chain would cut a rock into the seabed
   * silently — the picture would be unchanged and the stats line would still
   * read the survey's own numbers.
   */
  test('the composite field is never lower than the guard', () => {
    for (let sample = 0; sample < 2_000; sample += 1) {
      const angle = sample / 2_000 * Math.PI * 2 * 37
      const reach = 760 * (sample % 97) / 97
      const x     = Math.cos(angle) * reach
      const z     = Math.sin(angle) * reach

      expect(survey.field.heightAt(x, z) + 1e-9)
        .toBeGreaterThanOrEqual(survey.skerries.heightAt(x, z))
    }
  })

  test('the guard answers the seabed where it has no rock', () => {
    // Dead centre of the home island, which is the one place in the world the
    // guard is guaranteed to have been kept out of.
    expect(survey.skerries.heightAt(0, 0)).toBe(seabed)
  })

  test('the same seed deals the same rocks, byte for byte', () => {
    const again = surveySkerries(SCAPE_CONFIG, survey.landmasses, survey.strand)

    expect(JSON.stringify(again.skerries)).toBe(JSON.stringify(survey.skerries.skerries))
  })

  test('a different seed deals different rocks', () => {
    const other = surveySkerries(
      { ...SCAPE_CONFIG, seed: SCAPE_CONFIG.seed + 1 },
      survey.landmasses,
      survey.strand,
    )

    expect(JSON.stringify(other.skerries)).not.toBe(JSON.stringify(survey.skerries.skerries))
  })

  /**
   * The switch, and that it is the only one.
   *
   * `crest` at zero has to leave the open sea open — not a guard of drowned
   * rocks that the ferry planner still has to route around and no pose can
   * see.
   */
  test('a zero crest leaves no rocks at all', () => {
    const none = surveySkerries(
      { ...SCAPE_CONFIG, skerries: { ...SCAPE_CONFIG.skerries, crest: 0 }},
      survey.landmasses,
      survey.strand,
    )

    expect(none.skerries).toHaveLength(0)
    expect(none.chains).toBe(0)
    expect(none.heightAt(420, -260)).toBe(seabed)
  })

  /**
   * The one thing the guard is not allowed to break.
   *
   * `createWaterways` throws outright when a route's clearance falls under
   * `boats.clearance`, so a guard dropped across a harbour mouth would fail the
   * build rather than pass a test — but the softer failure is the real risk: a
   * route that survives by taking a long way round every rock in the world. The
   * network is still connected and still wet, and it is still five legs.
   */
  test('the ferries still have a way through', () => {
    expect(survey.waterways.route.legs.length).toBe(5)
    expect(survey.waterways.minimumClearance + 1e-6)
      .toBeGreaterThanOrEqual(SCAPE_CONFIG.boats.clearance)
  })
})
