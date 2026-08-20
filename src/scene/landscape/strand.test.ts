import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { surveyArchipelago } from './archipelago.ts'
import { createStrand, findShoreToward } from './strand.ts'


/**
 * One survey for the whole file, and deliberately.
 *
 * Surveying this archipelago is not cheap any more — five islands, two of them
 * ten times the area of the outer holdings — so a test that built its own would
 * pay for the whole world to prove one thing about four hundred metres of it.
 * Everything below reads this one.
 */
const survey         = surveyArchipelago(SCAPE_CONFIG)
const { waterLevel } = SCAPE_CONFIG.terrain


describe('the bar between two islands', () => {
  test('there is one, and it joins the two the config names', () => {
    expect(survey.strand).not.toBeNull()
    expect(SCAPE_CONFIG.strand.between).toEqual([ 'sound', 'fell' ])
  })

  /**
   * The claim, stated as a fact about the ground rather than about the picture.
   *
   * "These two islands are one island" is the whole point of the feature and it
   * is invisible from every pose the tour takes — the bar is three hundred
   * metres of shingle at the far south of the world. So it is checked the only
   * way it can be: walk it, and find dry land the whole way.
   *
   * Read off the *composite* field, deliberately. What a walker meets is the
   * maximum of the bar and whatever patch it happens to be over, and asking the
   * strand what it thinks it is would answer a question nobody had.
   */
  test('you can walk it end to end without getting your feet wet', () => {
    const strand = survey.strand!
    const from   = strand.points[0]
    const to     = strand.points[strand.points.length - 1]

    let lowest = Infinity

    for (let step = 0; step <= 400; step += 1) {
      const t = step / 400
      const x = from.x + (to.x - from.x) * t
      const z = from.z + (to.z - from.z) * t

      // Across as well as along: the centreline wanders, so a straight walk
      // between the anchors leaves the crest and comes back onto it.
      let best = -Infinity

      for (let across = -3; across <= 3; across += 1) {
        const dx = -(to.z - from.z) / strand.length * across * SCAPE_CONFIG.strand.width * 0.5
        const dz = (to.x - from.x) / strand.length * across * SCAPE_CONFIG.strand.width * 0.5

        best = Math.max(best, survey.field.heightAt(x + dx, z + dz))
      }

      lowest = Math.min(lowest, best)
    }

    expect(lowest).toBeGreaterThan(waterLevel)
  })

  test('it starts and ends at the two shores, not in open water', () => {
    const strand = survey.strand!
    const sound  = survey.landmasses.find(landmass => landmass.id === 'sound')!
    const fell   = survey.landmasses.find(landmass => landmass.id === 'fell')!

    const head = strand.points[0]
    const foot = strand.points[strand.points.length - 1]

    // Each anchor is on its own island's patch, and each is at that island's
    // own waterline — which is what makes the bar a tombolo rather than a
    // causeway somebody surveyed from the middle of the sea.
    expect(sound.survey.field.heightAt(head.x - sound.origin.x, head.z - sound.origin.z))
      .toBeLessThanOrEqual(waterLevel)
    expect(fell.survey.field.heightAt(foot.x - fell.origin.x, foot.z - fell.origin.z))
      .toBeLessThanOrEqual(waterLevel)
  })

  test('it is narrow — a strip, not a land bridge you could put a field on', () => {
    const strand = survey.strand!
    const middle = strand.points[Math.floor(strand.points.length / 2)]

    expect(strand.claimAt(middle.x, middle.z)).toBeCloseTo(1, 3)

    // Well outside the skirt is open water, and the bar has no say in it.
    const acrossX = -(strand.points[strand.points.length - 1].z - strand.points[0].z) / strand.length
    const acrossZ = (strand.points[strand.points.length - 1].x - strand.points[0].x) / strand.length
    const reach   = SCAPE_CONFIG.strand.width * 4

    expect(strand.claimAt(middle.x + acrossX * reach, middle.z + acrossZ * reach)).toBe(0)
  })

  test('the crest is undulating, not a levelled embankment', () => {
    const strand  = survey.strand!
    const crests  = strand.points.map(point => strand.heightAt(point.x, point.z))
    const highest = Math.max(...crests)
    const lowest  = Math.min(...crests)

    expect(highest - lowest).toBeGreaterThan(0.05)

    // And never so far that it drowns: the connection is a claim the rest of the
    // scape relies on, so the undulation is one-sided by construction.
    expect(lowest).toBeGreaterThan(waterLevel)
  })


  test('the shore walk gives up rather than inventing a shore', () => {
    const sound = survey.landmasses.find(landmass => landmass.id === 'sound')!

    // A bearing of nowhere: the neighbour is the island's own middle, so there
    // is no direction to walk and no shore to find.
    expect(findShoreToward(SCAPE_CONFIG, sound, sound.origin)).toBeNull()
  })

  test('the profile falls away from the crown on both sides', () => {
    const strand  = survey.strand!
    const middle  = strand.points[Math.floor(strand.points.length / 2)]
    const acrossX = -(strand.points[strand.points.length - 1].z - strand.points[0].z) / strand.length
    const acrossZ = (strand.points[strand.points.length - 1].x - strand.points[0].x) / strand.length

    let last = Infinity

    for (let out = 0; out <= SCAPE_CONFIG.strand.width * 3; out += 2) {
      const here = strand.heightAt(middle.x + acrossX * out, middle.z + acrossZ * out)

      expect(here).toBeLessThanOrEqual(last + 1e-9)
      last = here
    }
  })

  test('a wider bar claims more ground, and a taller one stands higher', () => {
    const wide = createStrand(
      { ...SCAPE_CONFIG, strand: { ...SCAPE_CONFIG.strand, width: 30 }},
      { x: 0, z: 0 },
      { x: 200, z: 0 },
    )
    const tall = createStrand(
      { ...SCAPE_CONFIG, strand: { ...SCAPE_CONFIG.strand, crest: 4 }},
      { x: 0, z: 0 },
      { x: 200, z: 0 },
    )

    expect(wide.claimAt(100, 25)).toBeGreaterThan(0)
    expect(tall.heightAt(100, 0)).toBeGreaterThan(
      createStrand(SCAPE_CONFIG, { x: 0, z: 0 }, { x: 200, z: 0 }).heightAt(100, 0),
    )
  })
})
