import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import type { Obstacle } from './footpath.ts'
import { createHeightField } from './height.ts'
import { findHarbourBank, findLanding } from './landing.ts'
import { createScapeLayout } from './layout.ts'
import { planFarmNetwork } from './network.ts'
import { STEADING_BUILDINGS, doorstepOf, faceToward, steadingPlaces } from './steading.ts'


const layout  = createScapeLayout(SCAPE_CONFIG)
const field   = createHeightField(SCAPE_CONFIG, layout)
const places  = steadingPlaces(layout.yard)
const landing = findLanding(layout, field, SCAPE_CONFIG)
const harbour = landing && findHarbourBank(layout, field, SCAPE_CONFIG, landing)

const avoid: Obstacle[] = STEADING_BUILDINGS.map(name => places[name])
const network           = planFarmNetwork(layout, places, [ landing, harbour ], avoid)

/** Which waypoints can be reached from the well by walking the planned legs. */
function reachable (): Set<number> {
  const seen  = new Set([ 0 ])
  const queue = [ 0 ]

  while (queue.length > 0) {
    const at = queue.pop()!

    for (const [ a, b ] of network.legs) {
      const next = a === at ? b : b === at ? a : null

      if (next !== null && !seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }

  return seen
}

describe('the farm’s street plan', () => {
  test('names every place the farm has: the well, five doors, the fields, the shore', () => {
    const kinds = network.waypoints.map(point => point.kind)

    expect(kinds.filter(kind => kind === 'well')).toHaveLength(1)
    expect(kinds.filter(kind => kind === 'door')).toHaveLength(STEADING_BUILDINGS.length)
    expect(kinds.filter(kind => kind === 'field')).toHaveLength(layout.plots.length)
    expect(network.waypoints).toHaveLength(new Set(network.waypoints.map(p => p.name)).size)
  })

  test('every place is reachable from every other', () => {
    expect(reachable().size).toBe(network.waypoints.length)
  })

  test('the fields are on the network, not hung off the end of a spur to nowhere', () => {
    const fields = network.waypoints
      .map((point, index) => ({ point, index }))
      .filter(entry => entry.point.kind === 'field')

    expect(fields.length).toBeGreaterThan(0)

    for (const field of fields)
      expect(network.legs.some(([ a, b ]) => a === field.index || b === field.index)).toBe(true)
  })

  test('it is a network and not a star — the well is not on every leg', () => {
    expect(network.legs.filter(([ a, b ]) => a === 0 || b === 0).length)
      .toBeLessThan(network.legs.length)
  })

  test('every building is joined to another building without going via the well', () => {
    const doors = network.waypoints
      .map((point, index) => ({ point, index }))
      .filter(entry => entry.point.kind === 'door')
      .map(entry => entry.index)

    // Walk the network with the well removed. If the buildings only ever met in
    // the middle of the yard, this falls apart into five separate places.
    const seen  = new Set([ doors[0] ])
    const queue = [ doors[0] ]

    while (queue.length > 0) {
      const at = queue.pop()!

      for (const [ a, b ] of network.legs) {
        if (a === 0 || b === 0)
          continue

        const next = a === at ? b : b === at ? a : null

        if (next !== null && !seen.has(next)) {
          seen.add(next)
          queue.push(next)
        }
      }
    }

    for (const door of doors)
      expect(seen.has(door)).toBe(true)
  })

  test('no planned leg runs straight through a building', () => {
    for (const [ a, b ] of network.legs) {
      const from = network.waypoints[a]
      const to   = network.waypoints[b]

      for (const thing of avoid) {
        // The two doors a leg joins are against their own walls by definition.
        if (Math.hypot(from.x - thing.x, from.z - thing.z) < thing.radius + 1.5)
          continue
        if (Math.hypot(to.x - thing.x, to.z - thing.z) < thing.radius + 1.5)
          continue

        const steps = 64
        let closest = Infinity

        for (let step = 0; step <= steps; step += 1) {
          const t = step / steps
          closest = Math.min(closest, Math.hypot(
            from.x + (to.x - from.x) * t - thing.x,
            from.z + (to.z - from.z) * t - thing.z,
          ))
        }

        // A leg is allowed to be *costed* as a detour, but a planned leg that
        // buries itself in a barn means the cost never bit.
        expect(closest).toBeGreaterThan(thing.radius * 0.6)
      }
    }
  })

  test('the same layout always plans the same network', () => {
    const again = planFarmNetwork(layout, places, [ landing, harbour ], avoid)

    expect(again.legs).toEqual(network.legs)
    expect(again.waypoints).toEqual(network.waypoints)
  })
})

describe('which way a building faces', () => {
  test('a yaw turns the prop’s own front, not its side, toward the target', () => {
    const from = { x: 3, z: -4 }
    const to   = { x: -6, z: 2 }
    const yaw  = faceToward(from, to)

    // three.js carries local +z to (sin yaw, cos yaw). That has to point at the
    // target, which is the whole reason this is not `atan2(dz, dx)`.
    const reach = Math.hypot(to.x - from.x, to.z - from.z)

    expect(Math.sin(yaw)).toBeCloseTo((to.x - from.x) / reach, 10)
    expect(Math.cos(yaw)).toBeCloseTo((to.z - from.z) / reach, 10)
  })

  test('every door faces the yard, and its doorstep is outside its own wall', () => {
    for (const name of STEADING_BUILDINGS) {
      const place = places[name]
      const step  = doorstepOf(place)

      const toYard  = Math.hypot(layout.yard.x - place.x, layout.yard.z - place.z)
      const stepped = Math.hypot(layout.yard.x - step.x, layout.yard.z - step.z)

      // The doorstep is a pace out of the door, which is a pace nearer the yard
      // than the building's middle is — that only holds if the door faces it.
      expect(stepped).toBeLessThan(toYard)
      expect(Math.hypot(step.x - place.x, step.z - place.z)).toBeGreaterThan(place.radius)
    }
  })
})
