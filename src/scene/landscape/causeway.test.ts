import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { tideAmplitudeAt } from '../tide.ts'
import { surveyArchipelago } from './archipelago.ts'
import { causewayCover, raiseCauseway, solveCauseway } from './causeway.ts'
import type { Causeway, CausewaySearch } from './causeway.ts'
import { createHeightField, resolveIsles } from './height.ts'


/**
 * One survey for the whole file, for the reason `tarn.test.ts` states: this
 * archipelago is five islands and surveying it is not cheap.
 */
const survey   = surveyArchipelago(SCAPE_CONFIG)
const home     = survey.landmasses.find(landmass => landmass.id === 'home')!
const causeway = home.survey.causeway!

const { waterLevel } = SCAPE_CONFIG.terrain

/** The ground the search measured: the island's own field with no bar in it. */
const bare = createHeightField(
  home.config,
  home.survey.layout,
  home.survey.tarn,
  home.survey.peat,
).heightAt

const search: CausewaySearch = {
  ground:    bare,
  waterLevel,
  gap:       SCAPE_CONFIG.causeway.gap,
  minIsle:   SCAPE_CONFIG.causeway.minIsle,
  clear:     SCAPE_CONFIG.causeway.clear,
  crest:     SCAPE_CONFIG.causeway.crest,
  camber:    SCAPE_CONFIG.causeway.camber,
  halfWidth: SCAPE_CONFIG.causeway.halfWidth,
}

const isles  = resolveIsles(home.config)
const berths = [ home.survey.landing, home.survey.harbour ]

const solve = (over: Partial<CausewaySearch> = {}): Causeway | null =>
  solveCauseway({ ...search, ...over }, isles, berths)

/** Everything about a crossing except the closure hung off it. */
const record = (bar: Causeway): unknown => ({
  isle:      bar.isle,
  shore:     bar.shore,
  head:      bar.head,
  crossing:  bar.crossing,
  crest:     bar.crest,
  anchor:    bar.anchor,
  halfWidth: bar.halfWidth,
})

/** Points along the centreline, mainland end to islet end. */
const along = (bar: Causeway, steps: number): { x: number, z: number, at: number }[] =>
  Array.from({ length: steps + 1 }, (_, index) => {
    const at = index / steps

    return {
      at,
      x: bar.shore.x + (bar.head.x - bar.shore.x) * at,
      z: bar.shore.z + (bar.head.z - bar.shore.z) * at,
    }
  })


describe('the crossing', () => {
  test('the home island has one, and it is a bar rather than a mole', () => {
    expect(causeway).toBeTruthy()
    expect(causeway.crossing).toBeGreaterThan(0)
    expect(causeway.crossing).toBeLessThanOrEqual(SCAPE_CONFIG.causeway.gap)
  })

  test('the four islands with no rocks off them get no causeway rather than a bar to nowhere', () => {
    for (const landmass of survey.landmasses)
      if (landmass.config.terrain.isles.length === 0)
        expect(landmass.survey.causeway).toBeNull()
  })

  test('both ends stand on ground the island already had', () => {
    // The whole claim of a *causeway*: it starts at a shore and finishes at a
    // shore. A bar that began in open water would be a pier, and one that
    // finished there would be a mole — and both are what a crossing measured
    // from a rock's centre rather than from its shore turns into.
    expect(bare(causeway.shore.x, causeway.shore.z)).toBeGreaterThanOrEqual(waterLevel)
    expect(bare(causeway.head.x, causeway.head.z)).toBeGreaterThanOrEqual(waterLevel)
  })

  test('and everything between them was open water before the bar was laid', () => {
    for (const point of along(causeway, 20).slice(1, -1))
      expect(bare(point.x, point.z)).toBeLessThan(waterLevel)
  })

  test('the islet end is the shore of the islet it names', () => {
    const isle = isles[causeway.isle]
    const out  = Math.hypot(causeway.head.x - isle.x, causeway.head.z - isle.z)

    expect(out).toBeLessThanOrEqual(isle.radius * 1.34)
  })

  test('the landfall keeps clear of both banks the boats use', () => {
    for (const berth of berths)
      expect(Math.hypot(berth!.x - causeway.shore.x, berth!.z - causeway.shore.z))
        .toBeGreaterThanOrEqual(SCAPE_CONFIG.causeway.clear)
  })

  test('a gap of zero is not a shorter causeway, it is no causeway', () => {
    expect(solve({ gap: 0 })).toBeNull()
  })

  test('a minimum radius past the widest rock leaves the island with none', () => {
    expect(solve({ minIsle: Math.max(...isles.map(isle => isle.radius)) + 1 })).toBeNull()
  })

  test('the same island solves to the same crossing twice', () => {
    expect(record(solve()!)).toEqual(record(causeway))
  })
})

describe('the bar itself', () => {
  test('it only ever raises the ground', () => {
    for (const point of along(causeway, 40))
      for (const side of [ -6, -3, 0, 3, 6 ]) {
        const x      = point.x + side
        const z      = point.z + side
        const ground = bare(x, z)

        expect(raiseCauseway(causeway, x, z, ground)).toBeGreaterThanOrEqual(ground)
      }
  })

  test('it stands clear of mean water the whole way across', () => {
    for (const point of along(causeway, 40))
      expect(raiseCauseway(causeway, point.x, point.z, bare(point.x, point.z)))
        .toBeGreaterThan(waterLevel)
  })

  test('it sags in the middle and stands highest at its anchors', () => {
    const middle = along(causeway, 2)[1]
    const level  = raiseCauseway(causeway, middle.x, middle.z, waterLevel - 9)

    expect(level).toBeCloseTo(causeway.crest, 6)
    expect(causeway.anchor).toBeGreaterThan(causeway.crest)
  })

  test('it is a footway rather than a shelf: off the skirt it changes nothing', () => {
    for (const point of along(causeway, 12)) {
      const dx = causeway.head.z - causeway.shore.z
      const dz = -(causeway.head.x - causeway.shore.x)
      const to = Math.hypot(dx, dz)

      const off = causeway.halfWidth * 1.4
      const x   = point.x + dx / to * off
      const z   = point.z + dz / to * off

      expect(causeway.claimAt(x, z)).toBe(0)
      expect(raiseCauseway(causeway, x, z, bare(x, z))).toBe(bare(x, z))
    }
  })

  test('a null causeway is an island that costs nothing', () => {
    expect(raiseCauseway(null, 3, 4, 1.25)).toBe(1.25)
  })
})

describe('the tide takes it', () => {
  const freeboard = causeway.crest - waterLevel
  const springs   = tideAmplitudeAt(1, SCAPE_CONFIG.tide)
  const neaps     = tideAmplitudeAt(0, SCAPE_CONFIG.tide)

  test('the springs close over it and the neaps never reach it', () => {
    // The run's whole claim, stated as a fact about the numbers rather than as
    // prose in the readme. A crest outside this band is one of the two things a
    // causeway is not: a ford if the sea is over it at the quarters of the
    // month, a mole if it is never over it at all.
    expect(causewayCover(freeboard, springs)).toBeGreaterThan(0)
    expect(causewayCover(freeboard, springs)).toBeLessThan(1)
    expect(causewayCover(freeboard, neaps)).toBe(0)
  })

  test('and it is dry for most of a spring cycle even so', () => {
    expect(causewayCover(freeboard, springs)).toBeLessThan(0.5)
  })

  test('a tideless coast leaves it standing', () => {
    expect(causewayCover(freeboard, tideAmplitudeAt(1, { ...SCAPE_CONFIG.tide, range: 0 }))).toBe(0)
  })

  test('the cover is the share of the cosine that stands over the crest', () => {
    // Half the cycle at mean water, all of it at a crest the sea never leaves,
    // none of it at one it never reaches — the three points the closed form has
    // to hit for the two ends of the month to mean anything.
    expect(causewayCover(0, 0.4)).toBeCloseTo(0.5, 12)
    expect(causewayCover(-1, 0.4)).toBe(1)
    expect(causewayCover(1, 0.4)).toBe(0)
  })

  test('a spring amplitude is never under a neap one', () => {
    expect(springs).toBeGreaterThanOrEqual(neaps)
  })
})
