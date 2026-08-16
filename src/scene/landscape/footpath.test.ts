import { describe, expect, test } from 'bun:test'
import { createSeededRng } from 'threejs-scene'
import { SCAPE_CONFIG } from '../config.ts'
import { createFootpaths } from './footpath.ts'
import type { FootpathOptions, Obstacle } from './footpath.ts'
import { createHeightField } from './height.ts'
import { findHarbourBank, findLanding } from './landing.ts'
import { createScapeLayout, distanceToTrack, plotInfluence } from './layout.ts'
import { footpathRoutes } from './network.ts'
import { STEADING_BUILDINGS, steadingPlaces } from './steading.ts'


const layout  = createScapeLayout(SCAPE_CONFIG)
const field   = createHeightField(SCAPE_CONFIG, layout)
const places  = steadingPlaces(layout.yard)
const landing = findLanding(layout, field, SCAPE_CONFIG)

const avoid: Obstacle[] = STEADING_BUILDINGS.map(name => places[name])

const routes = footpathRoutes(layout, places, [
  landing,
  landing && findHarbourBank(layout, field, SCAPE_CONFIG, landing),
], avoid)

/** The scape's own options, so the tests exercise what actually ships. */
function scapeOptions (over: Partial<FootpathOptions> = {}): FootpathOptions {
  return {
    routes,
    heightAt: field.heightAt,
    avoid,
    width:    SCAPE_CONFIG.footpath.width,
    verge:    SCAPE_CONFIG.footpath.verge,
    climb:    SCAPE_CONFIG.footpath.climb,
    wander:   SCAPE_CONFIG.footpath.wander,
    wear:     SCAPE_CONFIG.footpath.wear,
    rng:      createSeededRng(SCAPE_CONFIG.seed).fork('footpath'),
    onTrack:  (x, z) =>
      Math.hypot(x - layout.yard.x, z - layout.yard.z) > layout.yard.radius &&
      distanceToTrack(layout, x, z) < layout.track.width * 1.3,
    ...over,
  }
}

/** A lopsided hill, so a route over its summit has a side to come off on. */
function hump (x: number, z: number): number {
  return 6 * Math.exp(-((x * x + (z - 1.5) * (z - 1.5)) / 26))
}

function straightPeak (from: [number, number], to: [number, number], steps = 64): number {
  let peak = -Infinity

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    peak = Math.max(peak, hump(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t))
  }

  return peak
}

describe('the paths the farm wears', () => {
  const paths = createFootpaths(scapeOptions())

  test('the authored scape wears a network, not a line', () => {
    expect(paths.paths.length).toBeGreaterThan(3)
  })

  test('the same seed traces the same routes, point for point', () => {
    const again = createFootpaths(scapeOptions())

    expect(again.paths.map(path => path.points)).toEqual(paths.paths.map(path => path.points))
  })

  test('every leg runs between two planned places, and arrives at both', () => {
    const planned = routes.flatMap(route => [ route.from, route.to ])
    type PointType = { x: number, z: number }

    const at      = (point: PointType): boolean =>
      planned.some(place => Math.hypot(place.x - point.x, place.z - point.z) < 1e-6)

    for (const path of paths.paths) {
      expect(at(path.points[0])).toBe(true)
      expect(at(path.points[path.points.length - 1])).toBe(true)
      expect(Math.hypot(
        path.points[path.points.length - 1].x - path.to.x,
        path.points[path.points.length - 1].z - path.to.z,
      )).toBeLessThan(1e-6)
    }
  })

  test('every place the plan names ends up with a tread arriving at it', () => {
    const ends = paths.paths.flatMap(path => [ path.points[0], path.points[path.points.length - 1] ])

    // The tracer is allowed to drop a leg — two names for one spot, or a leg
    // that would only repeat the cart track. It is not allowed to drop the last
    // leg to somewhere, which would leave a field with no way into it.
    for (const place of routes.flatMap(route => [ route.from, route.to ]))
      expect(ends.some(end => Math.hypot(end.x - place.x, end.z - place.z) < 1e-6)).toBe(true)
  })

  test('the wear is even along a leg — a junction has no seam in it', () => {
    for (const path of paths.paths) {
      const head = path.points[2]
      const tail = path.points[path.points.length - 3]

      expect(paths.wearAt(head.x, head.z)).toBeCloseTo(paths.wearAt(tail.x, tail.z), 5)
    }
  })

  test('the tread is worn, the ground well off it is not', () => {
    for (const path of paths.paths) {
      const middle = path.points[Math.floor(path.points.length / 2)]
      const worn   = paths.wearAt(middle.x, middle.z)

      expect(worn).toBeGreaterThan(0.5)
      expect(worn).toBeLessThanOrEqual(1)
      expect(paths.wearAt(middle.x + 40, middle.z + 40)).toBe(0)
    }
  })

  test('no tread runs through a building', () => {
    // The endpoints are exempt — a path to a door arrives at the door — so the
    // interior is what has to be clear.
    for (const path of paths.paths)
      for (const point of path.points.slice(1, -1))
        for (const name of STEADING_BUILDINGS) {
          const place = places[name]
          expect(Math.hypot(point.x - place.x, point.z - place.z)).toBeGreaterThan(place.radius)
        }
  })

  test('a scape nobody walks has no paths at all', () => {
    const unwalked = createFootpaths(scapeOptions({ wear: 0 }))

    expect(unwalked.paths).toHaveLength(0)
    expect(unwalked.wearAt(layout.yard.x, layout.yard.z)).toBe(0)
  })

  test('a route that would only repeat the cart track is not worn', () => {
    const everywhere = createFootpaths(scapeOptions({ onTrack: () => true }))

    expect(everywhere.paths).toHaveLength(0)
  })
})

describe('a desire line', () => {
  const from = { x: -13, z: 0 }
  const to   = { x: 13, z: 0 }

  function traced (climb: number): ReturnType<typeof createFootpaths> {
    return createFootpaths({
      routes:   [{ from, to }],
      heightAt: hump,
      avoid:    [],
      width:    1.5,
      verge:    0.7,
      climb,
      wander:   0,
      wear:     1,
      rng:      createSeededRng(1).fork('test'),
    })
  }

  test('goes round a hill rather than over it', () => {
    const route = traced(1.3).paths[0]
    const peak  = Math.max(...route.points.map(point => hump(point.x, point.z)))

    expect(peak).toBeLessThan(straightPeak([ from.x, from.z ], [ to.x, to.z ]) * 0.75)
  })

  test('walks straight at a climb of zero, which is a survey and not a path', () => {
    const route = traced(0).paths[0]

    for (const point of route.points)
      expect(Math.abs(point.z)).toBeLessThan(0.05)
  })

  test('takes the detour without doubling the walk', () => {
    const route  = traced(1.3).paths[0]
    let length = 0

    for (let index = 1; index < route.points.length; index += 1)
      length += Math.hypot(
        route.points[index].x - route.points[index - 1].x,
        route.points[index].z - route.points[index - 1].z,
      )

    expect(length).toBeLessThan(Math.hypot(to.x - from.x, to.z - from.z) * 1.5)
  })
})

describe('the places a path is worn to', () => {
  test('a field is met at its edge, not in its middle', () => {
    for (const plot of layout.plots) {
      const gate = routes
        .flatMap(route => [ route.from, route.to ])
        .find(point => plotInfluence(plot, point.x, point.z) > 0)

      expect(gate).toBeDefined()
      expect(plotInfluence(plot, gate!.x, gate!.z)).toBeLessThan(1)
    }
  })

  test('the walled pasture is met at its gateway', () => {
    const { pasture } = layout

    if (!pasture)
      return

    const gateway = {
      x: pasture.x + Math.cos(pasture.gateway) * pasture.radius,
      z: pasture.z + Math.sin(pasture.gateway) * pasture.radius,
    }

    expect(routes.flatMap(route => [ route.from, route.to ]).some(point =>
      Math.hypot(point.x - gateway.x, point.z - gateway.z) < 1e-6)).toBe(true)
  })
})
