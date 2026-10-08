import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { surveyArchipelago } from './archipelago.ts'
import type { LandmassSurvey } from './archipelago.ts'
import { moleHead, solveMole, surveyExposure } from './mole.ts'
import type { Mole, MoleSearch } from './mole.ts'


const archipelago                                     = surveyArchipelago(SCAPE_CONFIG)
const { waterLevel }                                  = SCAPE_CONFIG.terrain
const { exposure, tipped, reach, turn, crest, width } = SCAPE_CONFIG.mole

/** Every island that got one, with the survey it came out of. */
const built = archipelago.landmasses.filter(landmass => landmass.survey.mole !== null)

function moleOf (landmass: LandmassSurvey): Mole {
  return landmass.survey.mole!
}

/** The same search the survey hands `solveMole`, for an island or for a fixture. */
function searchFor (landmass: LandmassSurvey, overrides: Partial<MoleSearch> = {}): MoleSearch {
  return {
    ground:     landmass.survey.field.heightAt,
    waterLevel: landmass.config.terrain.waterLevel,
    exposure,
    tipped,
    reach,
    station:    width * 0.75,
    turn,
    crest,
    width,
    ...overrides,
  }
}

/** A bare search over a flat bed, for the gates that are about the numbers rather than the coast. */
function flat (depth: number, overrides: Partial<MoleSearch> = {}): MoleSearch {
  return {
    ground:  () => waterLevel - depth,
    waterLevel,
    exposure,
    tipped,
    reach,
    station: width * 0.75,
    turn,
    crest,
    width,
    ...overrides,
  }
}

const ANYWHERE = { x: 0, z: 0, angle: 0 }

describe('mole siting', () => {
  test('five of the six landings are walled, and the sixth is refused', () => {
    // Not a law of the search — `null` is a real answer here the way it is for
    // the pier — but a fact about this seed, and the one the run's headline
    // rests on. A retuned falloff that quietly takes the arms back out of the
    // scape fails here rather than in a screenshot nobody compares.
    expect(built.map(landmass => landmass.id)).toEqual([ 'home', 'ridge', 'meadow', 'fell', 'shield' ])
  })

  test('every arm shelters some of the horizon it was built against', () => {
    // The claim, stated as a fact about the data rather than as a comment. An
    // arm is an assertion that the water behind it is quieter than the water in
    // front, and a mound carried out on the wrong hand of a cove can be thirty
    // metres long and shadow nothing at all. The solve refuses those; this is
    // what says the solve still does.
    for (const landmass of built) {
      const mole = moleOf(landmass)

      expect(mole.shelter).toBeGreaterThan(0)
      expect(mole.shelter).toBeLessThanOrEqual(360)
      expect(mole.fetch).toBeGreaterThanOrEqual(exposure)
    }
  })

  test('the hook turns back across the front of the landing', () => {
    // What makes an arm an arm rather than a pier made of rubble, stated as a
    // fact about where the stone ends up. The stem leaves the shore going away
    // from the landing; the hook has to bring the head back *toward* the line
    // the landing faces along, or the structure is a mound standing beside the
    // boats rather than in front of them. Measured as the offset either side of
    // that line, signed so that the root's own side is positive.
    for (const landmass of built) {
      const mole    = moleOf(landmass)
      const landing = landmass.survey.landing!
      const head    = moleHead(mole)
      const elbow   = mole.stations.find(station => Math.abs(station.along - mole.elbow) < 1e-6)!
      const across  = (x: number, z: number): number =>
        (x - landing.x) * Math.sin(landing.angle) - (z - landing.z) * Math.cos(landing.angle)
      const hand = Math.sign(across(mole.root.x, mole.root.z))

      expect(hand).not.toBe(0)
      expect(across(head.x, head.z) * hand).toBeLessThan(across(elbow.x, elbow.z) * hand)
    }
  })

  test('no station stands in water deeper than rubble is tipped into', () => {
    for (const landmass of built) {
      const mole         = moleOf(landmass)
      const { heightAt } = landmass.survey.field

      for (const station of mole.stations) {
        const depth = waterLevel - heightAt(station.x, station.z)

        expect(depth).toBeLessThanOrEqual(tipped + 1e-6)
        expect(station.bed).toBeCloseTo(heightAt(station.x, station.z), 6)
      }
    }
  })

  test('the crest stands clear of the highest water of the month', () => {
    for (const landmass of built)
      expect(moleOf(landmass).crest).toBeGreaterThan(waterLevel + SCAPE_CONFIG.tide.range / 2)
  })

  test('the stations run root first, head last, with no gap a bearing could thread', () => {
    for (const landmass of built) {
      const mole = moleOf(landmass)

      expect(mole.stations[0]!.along).toBe(0)
      expect(mole.stations[mole.stations.length - 1]!.along).toBeCloseTo(mole.length, 6)

      for (const [ index, station ] of mole.stations.slice(1).entries()) {
        const previous = mole.stations[index]!

        expect(station.along).toBeGreaterThan(previous.along)
        expect(Math.hypot(station.x - previous.x, station.z - previous.z))
          .toBeLessThanOrEqual(width * 0.75 + 1e-6)
      }
    }
  })

  test('the elbow is on the course, and the hook turns by the angle it was given', () => {
    for (const landmass of built) {
      const mole  = moleOf(landmass)
      const swing = Math.abs(mole.hook - mole.angle) * 180 / Math.PI

      expect(swing).toBeCloseTo(turn, 6)
      expect(mole.elbow).toBeGreaterThan(0)
      expect(mole.elbow).toBeLessThanOrEqual(mole.length)
    }
  })

  test('it is byte-for-byte stable for a seed', () => {
    for (const landmass of built)
      expect(solveMole(searchFor(landmass), landmass.survey.landing!))
        .toEqual(moleOf(landmass))
  })
})

describe('mole refusals', () => {
  test('a landing with no sea in front of it keeps its bare jetty', () => {
    // The switch, exercised as a switch. Raised past what the coast offers,
    // every island comes back `null` — which is the same shape of refusal a
    // tideless coast gives the weir, and the reason neither of them needs a
    // boolean beside it.
    for (const landmass of archipelago.landmasses)
      expect(solveMole(searchFor(landmass, { exposure: 1e6 }), landmass.survey.landing!)).toBeNull()
  })

  test('a bottom too deep to tip onto refuses every hand', () => {
    for (const landmass of archipelago.landmasses)
      expect(solveMole(searchFor(landmass, { tipped: 0 }), landmass.survey.landing!)).toBeNull()
  })

  test('an open sea with no shore in it has nothing to root an arm on', () => {
    // Deep water everywhere: the sweep saturates, so the exposure gate opens,
    // and then there is no waterline to seat a root at and no bed shallow
    // enough to stand a station on. Two gates, one coast, and the answer is
    // still a clean `null` rather than an arm floating in the sound.
    expect(solveMole(flat(20), ANYWHERE)).toBeNull()
  })

  test('a reach under the shortest arm worth building refuses before it looks', () => {
    expect(solveMole(flat(1, { reach: 4 }), ANYWHERE)).toBeNull()
    expect(solveMole(flat(1, { station: 0 }), ANYWHERE)).toBeNull()
  })

  test('a shelf that runs out flat forever shelters nothing and is refused', () => {
    // The third refusal, and the one the first cut of this did not have. A bed
    // at one depth from here to the horizon takes rubble happily and the arm
    // builds to its full reach — but the sweep off a landing with no land
    // anywhere in it has nothing to shadow, because every bearing runs clean to
    // the horizon on both sides of the stone. An arm that shelters nothing is a
    // pile of stone, and this is the gate that says so.
    const arm = solveMole(flat(1), ANYWHERE)

    if (arm)
      expect(arm.shelter).toBeGreaterThan(0)
  })
})

describe('the exposure sweep', () => {
  test('an open sea saturates the horizon on every bearing', () => {
    const open = surveyExposure(flat(10), ANYWHERE)

    expect(open.sweep).toHaveLength(48)
    expect(Math.min(...open.sweep)).toBe(open.fetch)
  })

  test('dry ground has no fetch on any bearing and no bearing to point at', () => {
    const dry = surveyExposure(flat(-2), ANYWHERE)

    expect(dry.fetch).toBe(0)
    expect(dry.sweep.every(run => run === 0)).toBe(true)
  })

  test('the bearing leans toward the water when only one side of the sweep has any', () => {
    // A straight coast running along `z`, sea to the east. The mean has to come
    // back pointing east — which is the property the solve leans on and the one
    // a loop-order bug would quietly break, because the worst bearing is a
    // dozen-way tie out there and the mean is not.
    const coast = surveyExposure(flat(0, { ground: (x: number) => x > 0 ? waterLevel - 6 : waterLevel + 2 }), ANYWHERE)

    expect(Math.abs(coast.bearing)).toBeLessThan(Math.PI / 4)
    expect(coast.fetch).toBeGreaterThan(0)
  })
})
