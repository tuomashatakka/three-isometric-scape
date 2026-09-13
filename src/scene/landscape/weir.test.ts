import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { surveyArchipelago } from './archipelago.ts'
import type { LandmassSurvey } from './archipelago.ts'
import { weirSpot } from './landing.ts'
import { solveWeir, weirCourse, weirStanding } from './weir.ts'
import type { Weir, WeirSearch } from './weir.ts'
import { BOAT_HULL_RADIUS } from './waterway.ts'


const archipelago                            = surveyArchipelago(SCAPE_CONFIG)
const { waterLevel }                         = SCAPE_CONFIG.terrain
const { reach, pound, least, mouth, height } = SCAPE_CONFIG.weir
const tidal                                  = SCAPE_CONFIG.tide.range

/** Every island that got one, with the survey it came out of. */
const built = archipelago.landmasses.filter(landmass => landmass.survey.weir !== null)

function weirOf (landmass: LandmassSurvey): Weir {
  return landmass.survey.weir!
}

/** The search the survey ran, rebuilt off one island's own field. */
function searchOf (landmass: LandmassSurvey): WeirSearch {
  return {
    ground: landmass.survey.field.heightAt,
    waterLevel,
    tidal,
    reach,
    pound,
    least,
    mouth:  mouth * Math.PI / 180,
  }
}

/** Every station on both runs of one weir, in the island's own frame. */
function stations (weir: Weir): { x: number, z: number }[] {
  const course = weirCourse(weir, 0.8)

  return [ ...course.leader, ...course.pound ]
}

/** The shortest distance from a point to the ferry route, in metres. */
function toRoute (x: number, z: number): number {
  const points = archipelago.waterways.route.points
  let nearest  = Infinity

  for (const [ index, from ] of points.entries()) {
    const to     = points[(index + 1) % points.length]
    const runX   = to.x - from.x
    const runZ   = to.z - from.z
    const length = runX * runX + runZ * runZ
    const along  = length > 0
      ? Math.max(0, Math.min(1, ((x - from.x) * runX + (z - from.z) * runZ) / length))
      : 0

    nearest = Math.min(nearest, Math.hypot(x - (from.x + runX * along), z - (from.z + runZ * along)))
  }

  return nearest
}

describe('weir siting', () => {
  test('one island in six lays one, and it is the one the pier refused', () => {
    // The run's whole headline, stated as a fact about the data rather than as
    // prose in the readme. `null` is a real answer here the way it is for the
    // pier, and the *complement* is the finding: a trestle needs the shelf to
    // fall away to a berth with a way out of it, and a trap needs the opposite,
    // so the cove with no way out of it is the cove with a flat in it. A retune
    // that quietly takes the trap back out of the scape — or hands one to a
    // coast that never dries — fails here rather than in a still nobody took.
    expect(built.map(landmass => landmass.id)).toEqual([ 'home' ])

    for (const landmass of built)
      expect([ landmass.id, landmass.survey.pier ]).toEqual([ landmass.id, null ])
  })

  test('every stone is laid in the band the tide walks across', () => {
    // The claim the whole module exists to make, and both ends of it matter
    // because they fail differently. Stone above the band is a wall on the
    // beach that the flood never reaches; stone below it is a wall in water
    // that never drains, and the pound behind it never empties. A weir is only
    // a weir on the ground that does both.
    for (const landmass of built) {
      const weir         = weirOf(landmass)
      const { heightAt } = landmass.survey.field
      const half         = tidal / 2

      for (const station of stations(weir)) {
        const depth = waterLevel - heightAt(station.x, station.z)

        expect([ landmass.id, depth > -half ]).toEqual([ landmass.id, true ])
        expect([ landmass.id, depth < half ]).toEqual([ landmass.id, true ])
      }
    }
  })

  test('the wall covers at high springs and stands at low', () => {
    // The other half of the same claim, with the stone on top of the bed rather
    // than the bed alone. A crest that never showed would be a structure nobody
    // could see at any state of the tide; one that never covered would be a
    // harbour wall the fish never come over. Both are the trap failing to be
    // one, and neither is visible in a still taken at one hour.
    for (const landmass of built) {
      const weir  = weirOf(landmass)
      const crest = weir.bed + height

      expect([ landmass.id, crest < waterLevel + tidal / 2 ]).toEqual([ landmass.id, true ])
      expect(weirStanding(weir, waterLevel, tidal, height)).toBeGreaterThan(0)
      expect(weirStanding(weir, waterLevel, tidal, height))
        .toBeCloseTo(crest - (waterLevel - tidal / 2), 6)
    }
  })

  test('the leader runs straight from the bank to the pound', () => {
    for (const landmass of built) {
      const weir   = weirOf(landmass)
      const course = weirCourse(weir, 0.8)
      const first  = course.leader[0]
      const last   = course.leader[course.leader.length - 1]

      expect(Math.hypot(first.x - weir.root.x, first.z - weir.root.z)).toBeCloseTo(0, 6)
      expect(Math.hypot(last.x - weir.head.x, last.z - weir.head.z)).toBeCloseTo(0, 6)
      expect(Math.hypot(weir.head.x - weir.root.x, weir.head.z - weir.root.z))
        .toBeCloseTo(weir.lead, 6)
      expect(weir.lead).toBeLessThanOrEqual(reach)

      // Every station on the bearing, so a leader that quietly acquired a bend
      // fails here rather than looking like a wall somebody built badly.
      for (const station of course.leader) {
        const along = (station.x - weir.root.x) * Math.cos(weir.angle) +
          (station.z - weir.root.z) * Math.sin(weir.angle)

        expect(Math.hypot(station.x - weir.root.x, station.z - weir.root.z)).toBeCloseTo(along, 6)
      }
    }
  })

  test('the pound is a ring of the surveyed radius with one gap in it', () => {
    for (const landmass of built) {
      const weir   = weirOf(landmass)
      const course = weirCourse(weir, 0.8)

      expect(weir.pound).toBeLessThanOrEqual(pound)
      expect(weir.pound).toBeGreaterThanOrEqual(least)

      for (const station of course.pound)
        expect(Math.hypot(station.x - weir.head.x, station.z - weir.head.z))
          .toBeCloseTo(weir.pound, 6)

      // The gap is the mechanism rather than a drawing accident: the ends of the
      // ring stand `mouth` apart, and the opening faces back down the leader so
      // a fish coming off the wall on the ebb meets it side-on.
      const first = course.pound[0]
      const last  = course.pound[course.pound.length - 1]
      const gap   = Math.abs(
        Math.atan2(first.z - weir.head.z, first.x - weir.head.x) -
        Math.atan2(last.z - weir.head.z, last.x - weir.head.x),
      )

      expect(Math.min(gap, Math.PI * 2 - gap)).toBeCloseTo(weir.mouth, 6)

      const middle = {
        x: (first.x + last.x) / 2 - weir.head.x,
        z: (first.z + last.z) / 2 - weir.head.z,
      }

      expect(middle.x * Math.cos(weir.angle) + middle.z * Math.sin(weir.angle))
        .toBeLessThan(0)
    }
  })

  test('it is rooted at its own harbour, turned no further than the arc allows', () => {
    for (const landmass of built) {
      const weir = weirOf(landmass)
      const from = weirSpot(landmass.survey.harbour!)

      expect(Math.abs(weir.turn)).toBeLessThanOrEqual(80)
      // The root is seated at the first band ground along the chosen bearing, so
      // it is never further from the offset spot than the landfall walk allows.
      expect(Math.hypot(weir.root.x - from.x, weir.root.z - from.z)).toBeLessThanOrEqual(10)
    }
  })

  test('no weir stands on a pier, and none stands in the ferry route', () => {
    // Two systems that have to agree rather than one. The waterways are routed
    // between jetties and know nothing about the harbour next door, and the pier
    // is rooted on the other hand of the same bank — so the offsets in
    // `landing.ts` are stated here as distances rather than trusted as prose.
    for (const landmass of built) {
      const weir = weirOf(landmass)

      for (const station of stations(weir)) {
        expect(toRoute(station.x + landmass.origin.x, station.z + landmass.origin.z))
          .toBeGreaterThan(BOAT_HULL_RADIUS)

        for (const bent of landmass.survey.pier?.bents ?? [])
          expect(Math.hypot(station.x - bent.x, station.z - bent.z)).toBeGreaterThan(2)
      }
    }
  })

  test('the same ground solves the same weir, byte for byte', () => {
    // Re-solved off the surveyed field rather than re-surveying the whole
    // archipelago: the solve is the thing that has to be deterministic, and a
    // second composite survey costs sixteen seconds to say so.
    for (const landmass of built) {
      const search = searchOf(landmass)

      expect(solveWeir(search, landmass.survey.harbour!)).toEqual(weirOf(landmass))
      expect(solveWeir(search, landmass.survey.harbour!)).toEqual(weirOf(landmass))
    }
  })
})

describe('weir refusals', () => {
  const harbour = { x: 0, z: 0, angle: 0 }

  /**
   * A synthetic flat: dry behind the origin, then a plane a hand's breadth under
   * mean water for thirty metres, then the shelf drops away.
   *
   * Deliberately synthetic — the archipelago's own beds are what the tests above
   * cover, and a refusal has to be provable on ground whose shape is known
   * rather than surveyed.
   */
  const flat: WeirSearch = {
    ground:     (x: number) => x < 0 ? 0.5 : x > 30 ? -6 : -0.1,
    waterLevel: 0,
    tidal:      0.8,
    reach:      26,
    pound:      4,
    least:      2,
    mouth:      Math.PI / 2,
  }

  test('a flat that dries and covers gets its trap', () => {
    const weir = solveWeir(flat, harbour)

    expect(weir).not.toBeNull()
    expect(weir!.pound).toBe(flat.pound)
    expect(weir!.lead).toBeGreaterThanOrEqual(8)
  })

  test('a tideless coast has no band to build in', () => {
    // The switch, and there is no boolean beside it. With no range there is no
    // ground that both covers and dries, so the sweep finds no station at all.
    expect(solveWeir({ ...flat, tidal: 0 }, harbour)).toBeNull()
  })

  test('a shelf that keeps falling refuses the site', () => {
    // A metre of fall every four metres out — the coast the pier is built for,
    // and the one a trap cannot be laid on. The band is a metre wide on the
    // ground and the leader never gets its eight metres.
    expect(solveWeir({ ...flat, ground: (x: number) => -x / 4 }, harbour)).toBeNull()
  })

  test('ground the tide never reaches refuses it too', () => {
    expect(solveWeir({ ...flat, ground: () => 5 }, harbour)).toBeNull()
  })

  test('a flat too narrow to hold a pound is a wall, not a trap', () => {
    // A spoke of band ground running out from the root: a leader can be carried
    // the whole way along it and there is nowhere on it to set a ring. That is
    // the rule that turns a long wall down, and the one the first cut of this
    // module did not have. Written radially off the *root* rather than on `x`,
    // because the sweep turns — a channel that is only a channel on one bearing
    // is one the search walks out of, which is correct behaviour and a useless
    // test.
    const root  = weirSpot(harbour)
    const spoke = (spread: number) => (x: number, z: number): number => {
      const out  = Math.hypot(x - root.x, z - root.z)
      const away = Math.abs(Math.atan2(z - root.z, x - root.x))

      if (out >= 30)
        return -6

      return out > 1 && away < spread ? -0.1 : 0.5
    }

    expect(solveWeir({ ...flat, ground: spoke(0.05) }, harbour)).toBeNull()
    // The same ground opened out until a ring fits does build one, which is what
    // makes this a test of the rule rather than of the spoke.
    expect(solveWeir({ ...flat, ground: spoke(0.35) }, harbour)).not.toBeNull()
  })

  test('the pound is set at the seaward end of the flat it will fit on', () => {
    // The ordering that is the opposite of the pier's. A flat whose outer half
    // is too narrow for the full ring pulls the leader back a bay at a time
    // rather than shrinking the pound where it stands, because every metre
    // further down the flat is another hour of tide working for the trap.
    const tapered = (x: number, z: number): number => {
      if (x < 0)
        return 0.5
      if (x > 30)
        return -6

      return Math.abs(z) <= Math.max(2, 9 - x / 4) ? -0.1 : -6
    }
    const weir = solveWeir({ ...flat, ground: tapered }, harbour)

    expect(weir).not.toBeNull()
    expect(weir!.lead + weir!.pound).toBeLessThanOrEqual(30)
    expect(weir!.pound).toBeGreaterThanOrEqual(least)
  })
})
