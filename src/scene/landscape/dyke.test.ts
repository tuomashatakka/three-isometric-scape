import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { LADDER, atmosphereQuality } from '../quality.ts'
import { surveyArchipelago } from './archipelago.ts'
import type { LandmassSurvey } from './archipelago.ts'
import { CHAPEL_FOOTING } from './chapel.ts'
import { solveHeadDyke } from './dyke.ts'
import type { DykeSearch, HeadDyke } from './dyke.ts'
import { iceClaim } from './icecap.ts'
import type { Vec2 } from './path.ts'


const archipelago                    = surveyArchipelago(SCAPE_CONFIG)
const { waterLevel }                 = SCAPE_CONFIG.terrain
const { freeboard, gateway, height } = SCAPE_CONFIG.dyke

/** Every island that got one, with the survey it came out of. */
const walled = archipelago.landmasses.filter(landmass => landmass.survey.dyke !== null)

function dykeOf (landmass: LandmassSurvey): HeadDyke {
  return landmass.survey.dyke!
}

/** Every route worn on one island, plus the cart track — what the survey opens for. */
function walkedOn (landmass: LandmassSurvey): readonly (readonly Vec2[])[] {
  return [
    ...landmass.survey.paths.paths.map(path => path.points),
    landmass.survey.layout.track.points,
  ]
}

/**
 * The survey's own search, with one field of it replaced.
 *
 * The refusals are the interesting half of this module, and each of them is a
 * *different* field saying no. Re-running the search with one field changed is
 * the only way to say which — and it is the module's own arguments rather than a
 * reimplementation of them, so a search that grew a field this forgot fails to
 * compile rather than quietly testing something else.
 */
function searchOn (landmass: LandmassSurvey, over: Partial<DykeSearch>): HeadDyke | null {
  const { field, layout } = landmass.survey

  return solveHeadDyke(
    {
      ground:   field.heightAt,
      waterLevel,
      foot:     field.heightAt(layout.yard.x, layout.yard.z),
      headroom: SCAPE_CONFIG.dyke.headroom,
      freeboard,
      gateway,
      height,
      reach:    layout.landRadius * 1.3,
      taken:    [],
      barred:   (x, z) => iceClaim(landmass.config, x, z, field.heightAt(x, z)) > 0,
      ...over,
    },
    walkedOn(landmass),
  )
}

/**
 * Whether a point is on the hill side of the ring.
 *
 * Re-derived here rather than imported, because it is the *claim* rather than
 * the implementation: the ring is star-shaped about the summit, so being inside
 * it is being nearer the summit than the ring is on your own bearing. A test
 * that called the module's own helper would agree with a broken one.
 */
function inside (dyke: HeadDyke, at: Vec2): boolean {
  const count  = dyke.ring.length
  const angle  = Math.atan2(at.z - dyke.summit.z, at.x - dyke.summit.x)
  const step   = (angle / (Math.PI * 2) * count % count + count) % count
  const before = Math.floor(step)
  const blend  = step - before
  const radius =
    Math.hypot(dyke.ring[before].x - dyke.summit.x, dyke.ring[before].z - dyke.summit.z) * (1 - blend) +
    Math.hypot(dyke.ring[(before + 1) % count].x - dyke.summit.x, dyke.ring[(before + 1) % count].z - dyke.summit.z) * blend

  return Math.hypot(at.x - dyke.summit.x, at.z - dyke.summit.z) < radius
}

/**
 * The steps of a route whose segment could reach a stretch of wall.
 *
 * A bounding-radius filter, and it is here for the reason the map's own layers
 * are: the honest answer over every pair of segments in the archipelago is the
 * same answer, and it takes forty seconds to reach.
 */
function near (route: readonly Vec2[], from: Vec2, to: Vec2): number[] {
  const midX  = (from.x + to.x) / 2
  const midZ  = (from.z + to.z) / 2
  const reach = Math.hypot(to.x - from.x, to.z - from.z) / 2
  const steps = []

  for (let step = 1; step < route.length; step += 1) {
    const span = Math.hypot(route[step].x - route[step - 1].x, route[step].z - route[step - 1].z)
    const at   = Math.hypot((route[step].x + route[step - 1].x) / 2 - midX, (route[step].z + route[step - 1].z) / 2 - midZ)

    if (at <= reach + span / 2)
      steps.push(step)
  }

  return steps
}

/** Do two line segments cross? */
function crosses (a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const side = (p: Vec2, q: Vec2, r: Vec2): number =>
    (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)

  const one   = side(a1, a2, b1)
  const two   = side(a1, a2, b2)
  const three = side(b1, b2, a1)
  const four  = side(b1, b2, a2)

  return one * two < 0 && three * four < 0
}


describe('the head dyke', () => {
  test('most of the archipelago is walled, and the one refusal is the ice', () => {
    // Not a law of the search — `null` is a real answer — but a fact about this
    // seed, and the one the run's headline rests on.
    expect(walled.map(landmass => landmass.id))
      .toEqual([ 'home', 'ridge', 'meadow', 'sound', 'fell' ])

    // And the refusal is named rather than shrugged at: the shield's contour is
    // under its ice cap on every bearing, which `tarn.ts` and `peat.ts` refuse
    // to build on for the same reason. Told there is no ice, the same island
    // walls itself — so the ice is what the `NONE` on the map line means, and a
    // later run that loses the shield's dyke for some *other* reason fails here.
    const shield = archipelago.landmasses.find(landmass => landmass.id === 'shield')!

    expect(shield.survey.dyke).toBeNull()
    expect(searchOn(shield, { barred: () => false })).not.toBeNull()
    expect(searchOn(shield, {})).toBeNull()
  })

  test('the farm is outside it and the summit inside it', () => {
    for (const landmass of walled) {
      const dyke = dykeOf(landmass)

      expect([ landmass.id, inside(dyke, landmass.survey.layout.yard) ]).toEqual([ landmass.id, false ])
      expect([ landmass.id, inside(dyke, dyke.summit) ]).toEqual([ landmass.id, true ])
    }
  })

  test('every stone stands on ground a wall can be founded on', () => {
    for (const landmass of walled) {
      const dyke         = dykeOf(landmass)
      const { heightAt } = landmass.survey.field
      const { layout }   = landmass.survey

      for (const run of dyke.runs)
        for (const station of run) {
          const ground = heightAt(station.x, station.z)

          expect(ground - waterLevel).toBeGreaterThanOrEqual(freeboard)
          expect(iceClaim(landmass.config, station.x, station.z, ground)).toBe(0)
          expect(layout.creek?.clearanceAt(station.x, station.z) ?? Infinity).toBeGreaterThanOrEqual(0)

          // The graded farmyard, the walled meadow and the churchyard: the three
          // pieces of ground the dressing has already laid something over. A
          // station inside any of them is a wall through a wall.
          expect(Math.hypot(station.x - layout.yard.x, station.z - layout.yard.z))
            .toBeGreaterThanOrEqual(layout.yard.radius)

          if (layout.pasture)
            expect(Math.hypot(station.x - layout.pasture.x, station.z - layout.pasture.z))
              .toBeGreaterThanOrEqual(layout.pasture.radius + 1.5)

          if (layout.chapel)
            expect(Math.hypot(station.x - layout.chapel.x, station.z - layout.chapel.z))
              .toBeGreaterThanOrEqual(Math.max(landmass.config.chapel.yardRadius, CHAPEL_FOOTING))
        }
    }
  })

  test('no standing wall is laid across a route somebody walks', () => {
    // The run's whole claim, stated as a fact about the data rather than as a
    // re-run of the search: a gate is only worth having if the alternative would
    // have been a wall across the path, so this looks for the wall across the
    // path directly and does not care whether the opening it finds is a gate or
    // a gap in the ground.
    //
    // One assertion per island rather than one per pair of segments — the whole
    // archipelago is about a hundred thousand pairs, and a test that reports
    // them individually spends longer printing than walking.
    for (const landmass of walled) {
      const dyke = dykeOf(landmass)
      const cut  = []

      for (const run of dyke.runs)
        for (let stone = 1; stone < run.length; stone += 1)
          for (const route of walkedOn(landmass))
            for (const step of near(route, run[stone - 1], run[stone]))
              if (crosses(run[stone - 1], run[stone], route[step - 1], route[step]))
                cut.push([ Math.round(run[stone].x), Math.round(run[stone].z) ])

      expect([ landmass.id, cut ]).toEqual([ landmass.id, []])
    }
  })

  test('every gate stands in a gap in the wall, on the ring', () => {
    for (const landmass of walled) {
      const dyke = dykeOf(landmass)

      for (const gate of dyke.gates) {
        // On the line: the nearest station of the *ring* is within half a
        // station of it, because a gate is a station.
        const onRing = Math.min(...dyke.ring.map(point =>
          Math.hypot(point.x - gate.x, point.z - gate.z)))

        expect(onRing).toBeLessThan(0.5)

        // And in a hole in it: nothing standing is nearer than the gap is wide.
        for (const run of dyke.runs)
          for (const station of run)
            expect(Math.hypot(station.x - gate.x, station.z - gate.z))
              .toBeGreaterThan(gateway / 2 - 0.9)
      }

      // A gate on its own in the middle of the fell is a gate into nothing: each
      // one has wall within a gateway of it on at least one side.
      for (const gate of dyke.gates)
        expect(dyke.runs.some(run => run.some(station =>
          Math.hypot(station.x - gate.x, station.z - gate.z) < gateway))).toBe(true)
    }
  })

  test('the ring closes, and what stands on it is a subset of it', () => {
    for (const landmass of walled) {
      const dyke = dykeOf(landmass)

      expect(dyke.ring.length).toBeGreaterThan(2)
      expect(dyke.length).toBeLessThanOrEqual(dyke.circuit + 1e-6)
      expect(dyke.encloses).toBeGreaterThan(0)

      for (const run of dyke.runs) {
        expect(run.length).toBeGreaterThanOrEqual(2)

        for (const station of run)
          expect(dyke.ring.some(point =>
            Math.abs(point.x - station.x) < 1e-9 && Math.abs(point.z - station.z) < 1e-9)).toBe(true)
      }
    }
  })

  test('the same ground lays the same stones', () => {
    // The search draws from no rng at all, so this is guarding the other way a
    // generator loses determinism: an iteration order that depends on something
    // outside its arguments. Byte for byte, twice, on every island.
    for (const landmass of archipelago.landmasses)
      expect([ landmass.id, JSON.stringify(searchOn(landmass, {})) ])
        .toEqual([ landmass.id, JSON.stringify(searchOn(landmass, {})) ])
  })

  test('a wall no stones high is no wall, and the survey says so', () => {
    // The switch, tested where it is taken. Every other way of turning the dyke
    // off would leave `scape:map` reporting a ring the scene has no stones in.
    expect(searchOn(archipelago.home, {})).not.toBeNull()
    expect(searchOn(archipelago.home, { height: 0 })).toBeNull()
  })

  test('no tier spaces the stones further apart than a stone is long', () => {
    // The wall reads as a wall because the courses overlap — see `props/wall.ts`.
    // A course is a rock about `height * 1.09` end to end, so a tier that spaced
    // the stations wider than that would draw a dotted line of boulders rather
    // than a cheap wall, which is not the graceful absence the brief asks for.
    for (const tier of LADDER)
      expect([ tier, atmosphereQuality(tier).dykeSpacing <= height * 1.09 ])
        .toEqual([ tier, true ])
  })
})
