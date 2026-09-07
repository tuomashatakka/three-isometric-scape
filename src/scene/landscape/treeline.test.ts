import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import type { ScapeConfig } from '../config.ts'
import { surveyArchipelago } from './archipelago.ts'
import { createSeededRng } from 'threejs-scene'
import { createScatterRules, createZoneTests } from './dressing-zones.ts'
import type { GroundNormal, HeightField } from './height.ts'
import { planTreeline, stuntedTo } from './treeline.ts'


const survey   = surveyArchipelago(SCAPE_CONFIG)
const water    = survey.waterLevel
const treeline = planTreeline(survey.field, SCAPE_CONFIG, water)
const terms    = SCAPE_CONFIG.treeline

/**
 * A field with one straight ramp in it, and sea on one side.
 *
 * The archipelago is the thing the run has to be right about, but it is a poor
 * instrument for a monotonic claim: every point on it differs in height *and* in
 * fetch at once, so a vigour that fell for the wrong reason would still fall. A
 * ramp holds the fetch still.
 */
function ramp (grade: number): HeightField {
  return {
    heightAt: (x: number) => water + x * grade,
    slopeAt:  () => grade,
    normalAt: (_x: number, _z: number, target: GroundNormal) => {
      target.x = 0
      target.y = 1
      target.z = 0
      return target
    },
  }
}

function withTreeline (patch: Partial<ScapeConfig['treeline']>): ScapeConfig {
  return { ...SCAPE_CONFIG, treeline: { ...SCAPE_CONFIG.treeline, ...patch }}
}

/** Every land point on a coarse walk of the whole archipelago. */
function landWalk (steps = 90): { x: number, z: number, relative: number }[] {
  const half   = survey.size * 0.5
  const points = []

  for (let row = 0; row < steps; row += 1)
    for (let col = 0; col < steps; col += 1) {
      const x        = -half + (col + 0.5) * survey.size / steps
      const z        = -half + (row + 0.5) * survey.size / steps
      const relative = survey.field.heightAt(x, z) - water

      if (relative > 0)
        points.push({ x, z, relative })
    }

  return points
}

const land = landWalk()


describe('the fetch a point stands in', () => {
  test('exposure is a fraction, everywhere on the archipelago', () => {
    for (const point of land) {
      const openness = treeline.exposureAt(point.x, point.z)

      expect(openness).toBeGreaterThanOrEqual(0)
      expect(openness).toBeLessThanOrEqual(1)
    }
  })

  /**
   * The claim the whole run rests on, stated as a fact about the ground.
   *
   * Not "the function mixes two numbers" — that is arithmetic. What has to be
   * true is that *this* archipelago has two kinds of coast in it: the yard sits
   * behind its own hill and the croft is on a free islet in open sea. If a
   * retune ever collapses that gap, the treeline stops being drawn by the wind
   * and becomes a contour with extra steps.
   */
  test('the farm is sheltered and the outer islet is not', () => {
    const yard  = survey.home.survey.layout.yard
    const croft = survey.home.survey.croft

    expect(croft).not.toBeNull()

    const sheltered = treeline.exposureAt(yard.x, yard.z)
    const open      = treeline.exposureAt(croft!.x, croft!.z)

    expect(open).toBeGreaterThan(sheltered + 0.5)
    expect(treeline.limitAt(croft!.x, croft!.z))
      .toBeLessThan(treeline.limitAt(yard.x, yard.z))
  })

  test('the line stays between the two heights it is mixed from', () => {
    for (const point of land) {
      const limit = treeline.limitAt(point.x, point.z)

      expect(limit).toBeGreaterThanOrEqual(terms.exposed - 1e-9)
      expect(limit).toBeLessThanOrEqual(terms.sheltered + 1e-9)
    }
  })

  test('open sea upwind of a point is the whole of its exposure', () => {
    // A field that is sea everywhere: nothing can shelter anything.
    const drowned = planTreeline(
      { ...ramp(0), heightAt: () => water - 4 },
      SCAPE_CONFIG,
      water,
    )

    expect(drowned.exposureAt(0, 0)).toBeCloseTo(1, 6)
    expect(drowned.limitAt(0, 0)).toBeCloseTo(terms.exposed, 6)
  })
})

describe('where the wood gives out', () => {
  test('vigour falls with height and never rises', () => {
    const line = planTreeline(ramp(0.25), withTreeline({ saltBite: 0 }), water)
    let last   = Infinity

    for (let x = 0.5; x < 60; x += 0.5) {
      const vigour = line.vigourAt(x, 0)

      expect(vigour).toBeLessThanOrEqual(last + 1e-9)
      expect(vigour).toBeGreaterThanOrEqual(0)
      expect(vigour).toBeLessThanOrEqual(1)
      last = vigour
    }
  })

  /**
   * The claim, on the archipelago itself: nothing grows above its own line.
   *
   * Sampled over every land point on a ninety-square walk rather than at the
   * summits, because the failure worth catching is not a tree on the peak — it
   * is a *band* of ground somewhere on the archipelago where the fade never
   * closed, and the peak is the one place anybody would have checked by eye.
   */
  test('vigour is spent by the top of the margin and full below it', () => {
    for (const point of land) {
      const limit  = treeline.limitAt(point.x, point.z)
      const vigour = treeline.vigourAt(point.x, point.z)

      if (point.relative > limit + terms.taper)
        expect(vigour).toBe(0)

      // Below the margin *and* clear of the salt band, a tree is full size.
      // Both conditions: the bottom of an exposed coast is good ground for the
      // upper line and poor ground for the lower one, which is the point of
      // having two.
      if (point.relative < limit - terms.taper && point.relative > terms.saltBand)
        expect(vigour).toBeCloseTo(1, 6)
    }
  })

  test('the archipelago has closed wood, a margin and bare ground in it', () => {
    let wooded = 0
    let margin = 0
    let bare   = 0

    for (const point of land) {
      const vigour = treeline.vigourAt(point.x, point.z)

      if (vigour > 0.75)
        wooded += 1
      else if (vigour > 0.15)
        margin += 1
      else
        bare += 1
    }

    // A tenth of the land in each is the weakest statement of "this is a wood
    // with an edge". A treeline that swallowed the whole archipelago and one
    // that touched none of it both fail here, and both have shipped as a
    // retune of two floats.
    expect(wooded / land.length).toBeGreaterThan(0.1)
    expect(margin / land.length).toBeGreaterThan(0.1)
    expect(bare / land.length).toBeGreaterThan(0.1)
  })

  test('the salt only bites where the wind reaches', () => {
    const salted = planTreeline(ramp(0.1), SCAPE_CONFIG, water)
    const clean  = planTreeline(ramp(0.1), withTreeline({ saltBite: 0 }), water)

    // Upwind of a point on this ramp is more ramp, so it is sheltered and the
    // two agree; the drowned field above is the exposed case.
    expect(salted.vigourAt(4, 0)).toBeCloseTo(clean.vigourAt(4, 0), 6)

    const drowning  = { ...ramp(0.1), heightAt: (x: number) => water + (x < 6 ? x * 0.1 : -3) }
    const exposedAt = planTreeline(drowning, SCAPE_CONFIG, water).vigourAt(1, 0)

    expect(exposedAt).toBeLessThan(clean.vigourAt(1, 0))
    expect(exposedAt).toBeGreaterThan(0)
  })

  test('nothing grows in the sea', () => {
    for (const [ x, z ] of [[ 0, 0 ], [ 400, 400 ]] as [number, number][])
      if (survey.field.heightAt(x, z) <= water)
        expect(treeline.vigourAt(x, z)).toBe(0)
  })

  test('the same seed gives the same lines, to the bit', () => {
    const again = planTreeline(survey.field, SCAPE_CONFIG, water)

    for (const point of land.slice(0, 400)) {
      expect(again.vigourAt(point.x, point.z))
        .toBe(treeline.vigourAt(point.x, point.z))
      expect(again.exposureAt(point.x, point.z))
        .toBe(treeline.exposureAt(point.x, point.z))
    }
  })
})

describe('what the margin does to a tree', () => {
  test('a stunted tree is between the floor and full size', () => {
    for (let vigour = -0.5; vigour <= 1.5; vigour += 0.1) {
      const scale = stuntedTo(vigour, terms.stunt)

      expect(scale).toBeGreaterThanOrEqual(terms.stunt)
      expect(scale).toBeLessThanOrEqual(1)
    }
  })

  test('the ends are the ends', () => {
    expect(stuntedTo(0, terms.stunt)).toBeCloseTo(terms.stunt, 9)
    expect(stuntedTo(1, terms.stunt)).toBeCloseTo(1, 9)
    expect(stuntedTo(0.5, 0.5)).toBeCloseTo(0.75, 9)
  })
})

describe('the rules the survey gates', () => {
  const rules = createScatterRules(
    SCAPE_CONFIG,
    survey,
    survey.field,
    createSeededRng(SCAPE_CONFIG.seed).fork('treeline-test'),
    createZoneTests(survey),
  )

  test('the dressing surveys the same lines the instrument prints', () => {
    for (const point of land.slice(0, 300))
      expect(rules.treeline.vigourAt(point.x, point.z))
        .toBe(treeline.vigourAt(point.x, point.z))
  })

  /**
   * The other half of the claim: the *scatter* refuses the ground too.
   *
   * A vigour of zero that the rule then ignores is a treeline in the readout and
   * a forest in the picture, so the rule is asked directly — and at the points
   * the walk above found rather than at chosen ones.
   */
  test('no conifer is accepted above its own treeline', () => {
    const spruce = rules.conifer(1, 1, 0.7)
    let above    = 0

    for (const point of land) {
      if (point.relative <= treeline.limitAt(point.x, point.z) + terms.taper)
        continue

      above += 1
      expect(spruce(point.x, point.z)).toBe(false)
      expect(rules.birchRule(point.x, point.z)).toBe(false)
    }

    // The walk has to have found some, or the test above passed on nothing.
    expect(above).toBeGreaterThan(20)
  })

  test('a seedling and a stump only stand where the wood reaches', () => {
    let bare = 0

    for (const point of land) {
      if (treeline.vigourAt(point.x, point.z) > 0)
        continue

      bare += 1
      expect(rules.inTheWood(() => true)(point.x, point.z)).toBe(false)
      expect(rules.canopy(point.x, point.z)).toBeCloseTo(terms.stunt, 9)
    }

    expect(bare).toBeGreaterThan(20)
  })
})
