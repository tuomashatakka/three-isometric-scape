import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { PIER_WIDTH } from '../props/pier.ts'
import { surveyArchipelago } from './archipelago.ts'
import type { LandmassSurvey } from './archipelago.ts'
import { pierSpot } from './landing.ts'
import { pierHead, solvePier } from './pier.ts'
import type { Pier } from './pier.ts'
import { BOAT_HULL_RADIUS } from './waterway.ts'


const archipelago                          = surveyArchipelago(SCAPE_CONFIG)
const { waterLevel }                       = SCAPE_CONFIG.terrain
const { berth, piled, reach, offing, bay } = SCAPE_CONFIG.pier

/** Every island that got one, with the survey it came out of. */
const built = archipelago.landmasses.filter(landmass => landmass.survey.pier !== null)

function pierOf (landmass: LandmassSurvey): Pier {
  return landmass.survey.pier!
}

/** The shortest distance from a point to a closed polyline, in metres. */
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

describe('pier siting', () => {
  test('half the archipelago builds one, and the other half is refused', () => {
    // Not a law of the search — `null` is a real answer, and here it is half the
    // finding — but a fact about this seed, and the one the run's headline rests
    // on. A retuned falloff that quietly takes the piers back out of the scape,
    // or hands one to a cove that has no way out, fails here rather than in a
    // screenshot nobody compares.
    expect(built.map(landmass => landmass.id)).toEqual([ 'ridge', 'meadow', 'shield' ])
  })

  test('every bent past the root stands in water a pile can be driven in', () => {
    for (const landmass of built) {
      const pier         = pierOf(landmass)
      const { heightAt } = landmass.survey.field

      for (const bent of pier.bents.slice(1)) {
        const depth = waterLevel - heightAt(bent.x, bent.z)

        // The claim the whole module exists to make: a pier does not walk over a
        // bar and it does not float. Both ends of the range are stated, because
        // the failures look completely different — a dry bent is a trestle on a
        // hillside, and a bent past `piled` is one on stilts nine metres long.
        expect([ landmass.id, bent.along, depth > 0 ]).toEqual([ landmass.id, bent.along, true ])
        expect([ landmass.id, bent.along, depth <= piled ]).toEqual([ landmass.id, bent.along, true ])
      }
    }
  })

  test('there is water past the head to leave by', () => {
    // The claim that moved the pier off the landing bank and onto this one, and
    // the one no picture makes: a run that stays wet the whole way has not
    // necessarily gone anywhere. Measured past the head rather than under it.
    for (const landmass of built) {
      const pier         = pierOf(landmass)
      const { heightAt } = landmass.survey.field
      const head         = pierHead(pier)

      for (let ahead = 1; ahead <= offing; ahead += 1) {
        const x     = head.x + Math.cos(pier.angle) * ahead
        const z     = head.z + Math.sin(pier.angle) * ahead
        const under = waterLevel - heightAt(x, z)

        expect([ landmass.id, ahead, under >= SCAPE_CONFIG.boats.clearance ])
          .toEqual([ landmass.id, ahead, true ])
      }
    }
  })

  test('the head lies in a berth, and the deck clears a spring high water', () => {
    for (const landmass of built) {
      const pier = pierOf(landmass)
      const head = pierHead(pier)

      expect([ landmass.id, pier.depth >= berth ]).toEqual([ landmass.id, true ])
      expect(waterLevel - landmass.survey.field.heightAt(head.x, head.z)).toBeCloseTo(pier.depth, 6)

      // Solved against mean water like everything else on this coast that was
      // surveyed rather than animated, so the tide is what it has to clear.
      expect(pier.deck - waterLevel).toBeGreaterThan(SCAPE_CONFIG.tide.range / 2)
    }
  })

  test('the bents are one bay apart, root first and head last', () => {
    for (const landmass of built) {
      const pier = pierOf(landmass)

      expect(pier.bents[0].along).toBe(0)
      expect(pier.bents[pier.bents.length - 1].along).toBeCloseTo(pier.length, 6)
      expect(pier.length).toBeLessThanOrEqual(reach)

      for (const [ index, bent ] of pier.bents.entries()) {
        expect(bent.along).toBeCloseTo(index * bay, 6)
        expect(Math.hypot(bent.x - pier.root.x, bent.z - pier.root.z)).toBeCloseTo(bent.along, 6)
      }
    }
  })

  test('it is rooted at its own harbour, turned no further than the arc allows', () => {
    for (const landmass of built) {
      const pier = pierOf(landmass)
      const from = pierSpot(landmass.survey.harbour!)

      expect(Math.abs(pier.turn)).toBeLessThanOrEqual(60)
      // The root is seated at the waterline along the chosen bearing, so it is
      // never further from the offset spot than the landfall walk allows.
      expect(Math.hypot(pier.root.x - from.x, pier.root.z - from.z)).toBeLessThanOrEqual(10)
    }
  })

  test('no pier stands in the ferry route', () => {
    // The waterways are routed between jetties and know nothing about the
    // harbour next door, so this is the one claim in here that two systems have
    // to agree on rather than one. A hull and a deck both need their own half
    // width, and the margin over the sum is what stops a boat clipping a pile
    // on a bearing neither module chose deliberately.
    const nearest = Math.min(...built.flatMap(landmass =>
      pierOf(landmass).bents.map(bent =>
        toRoute(bent.x + landmass.origin.x, bent.z + landmass.origin.z))))

    expect(nearest).toBeGreaterThan(BOAT_HULL_RADIUS + PIER_WIDTH / 2)
  })

  test('the same ground solves the same pier, byte for byte', () => {
    // Re-solved off the surveyed field rather than re-surveying the whole
    // archipelago: the solve is the thing that has to be deterministic, and a
    // second composite survey costs sixteen seconds to say so.
    for (const landmass of built) {
      const search = {
        ground:    landmass.survey.field.heightAt,
        waterLevel,
        berth,
        piled,
        reach,
        offing,
        clearance: SCAPE_CONFIG.boats.clearance,
        bay,
        freeboard: SCAPE_CONFIG.pier.freeboard,
      }

      expect(solvePier(search, landmass.survey.harbour!)).toEqual(pierOf(landmass))
      expect(solvePier(search, landmass.survey.harbour!)).toEqual(pierOf(landmass))
    }
  })
})

describe('pier refusals', () => {
  const harbour = { x: 0, z: 0, angle: 0 }
  const shelf   = {
    // A clean ramp: dry behind the origin, one metre of fall every four metres
    // out. Deliberately synthetic — the archipelago's own beds are exactly the
    // thing the tests above cover, and a refusal has to be provable on ground
    // whose shape is known rather than surveyed.
    ground:     (x: number) => -x / 4,
    waterLevel: 0,
    berth:      1.4,
    piled:      8,
    reach:      27,
    offing:     12,
    clearance:  0.42,
    bay:        3,
    freeboard:  1.05,
  }

  test('a shelf that keeps falling gets its pier', () => {
    const pier = solvePier(shelf, harbour)

    expect(pier).not.toBeNull()
    expect(pier!.turn).toBe(0)
    expect(pier!.depth).toBeGreaterThanOrEqual(shelf.berth)
  })

  test('a berth deeper than the shelf refuses the site', () => {
    expect(solvePier({ ...shelf, berth: 40 }, harbour)).toBeNull()
  })

  test('a bottom nothing can be driven into refuses it too', () => {
    // Every bent past the root is already past `piled`, so the run never gets
    // its three bays — a cliff at the waterline, which is a real coast.
    expect(solvePier({ ...shelf, ground: () => -20, piled: 8 }, harbour)).toBeNull()
  })

  test('a shelf that comes back up is a bar, not a pier', () => {
    // Under water for two bays and dry at the third. The run stops at the bar
    // rather than stepping over it, which leaves it short of the minimum.
    expect(solvePier({ ...shelf, ground: (x: number) => x > 7 ? 1 : -1 }, harbour)).toBeNull()
  })

  test('ground the bearing never leaves refuses it', () => {
    expect(solvePier({ ...shelf, ground: () => 5 }, harbour)).toBeNull()
  })

  test('a shelf that shoals again past the head is a bay, not a way out', () => {
    // Deep enough to build on and to lie in, and then the bottom comes back up
    // just past where the trestle stopped. This is the home island's harbour
    // cove in miniature, and the shape that read as an unfinished bridge.
    // Radial rather than written on `x`, because the sweep turns: a shoal that
    // is only a shoal on one bearing is one the search walks round, which is
    // correct behaviour and a useless test.
    const bay = (x: number, z: number): number => {
      const out = Math.hypot(x, z)

      return out < 14 ? -out / 4 : (out - 14) / 2 - 3.5
    }

    expect(solvePier({ ...shelf, ground: bay }, harbour)).toBeNull()
    // The same ground with nothing asked of the offing does build one, which is
    // what makes this a test of the rule rather than of the ramp.
    expect(solvePier({ ...shelf, ground: bay, offing: 0 }, harbour)).not.toBeNull()
  })
})
