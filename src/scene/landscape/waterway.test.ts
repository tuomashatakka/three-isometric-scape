import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import type { ScapeConfig } from '../config.ts'
import { surveyArchipelago } from './archipelago.ts'
import { scheduledFleetMinimumSeparation } from './boat-motion.ts'
import { BOAT_HULL_RADIUS, sampleWaterway } from './waterway.ts'
import type { RouteSample } from './waterway.ts'


const config  = structuredClone(SCAPE_CONFIG) as ScapeConfig
const world   = surveyArchipelago(config)
const network = world.waterways

describe('the waterways between the islands', () => {
  test('form one directed ring with every port reachable', () => {
    const ids = new Set(world.ports.map(port => port.id))

    expect(network.route.legs).toHaveLength(ids.size)

    for (const id of ids) {
      expect(network.route.legs.filter(leg => leg.from === id)).toHaveLength(1)
      expect(network.route.legs.filter(leg => leg.to === id)).toHaveLength(1)
    }

    const seen  = new Set([ world.ports[0].id ])
    const queue = [ world.ports[0].id ]

    while (queue.length > 0) {
      const from = queue.pop()!

      for (const leg of network.route.legs)
        if (leg.from === from && !seen.has(leg.to)) {
          seen.add(leg.to)
          queue.push(leg.to)
        }
    }

    expect(seen).toEqual(ids)
  })

  test('runs exactly between the navigable water entries beside the jetties', () => {
    for (const leg of network.route.legs) {
      const from = world.ports.find(port => port.id === leg.from)!
      const to   = world.ports.find(port => port.id === leg.to)!

      expect(leg.points[0].x).toBeCloseTo(from.waterEntry.x, 8)
      expect(leg.points[0].z).toBeCloseTo(from.waterEntry.z, 8)
      expect(leg.points.at(-1)!.x).toBeCloseTo(to.waterEntry.x, 8)
      expect(leg.points.at(-1)!.z).toBeCloseTo(to.waterEntry.z, 8)
    }
  })

  test('keeps the complete hull footprint in navigable water', () => {
    const route       = network.route
    const steps       = Math.ceil(route.length / 0.05)
    const hullOffsets = Array.from({ length: 360 }, (_unused, probe) => {
      const angle = probe / 360 * Math.PI * 2

      return {
        x: Math.cos(angle) * BOAT_HULL_RADIUS,
        z: Math.sin(angle) * BOAT_HULL_RADIUS,
      }
    })
    let highest = -Infinity

    for (let step = 0; step < steps; step += 1) {
      const boat = sampleWaterway(route, step / steps * route.length, {
        x: 0, z: 0, angle: 0,
      })

      highest = Math.max(highest, world.field.heightAt(boat.x, boat.z))

      for (const offset of hullOffsets)
        highest = Math.max(highest, world.field.heightAt(boat.x + offset.x, boat.z + offset.z))
    }

    expect(highest).toBeLessThanOrEqual(world.waterLevel - config.boats.clearance + 1e-6)
  })

  test('keeps every dispatched boat separated for a complete circuit', () => {
    const route = network.route
    const poses = network.boatOffsets.map((): RouteSample => ({ x: 0, z: 0, angle: 0 }))
    const steps = Math.ceil(route.length / 0.35)
    let closest = Infinity

    for (let step = 0; step < steps; step += 1) {
      const travel = step / steps * route.length

      network.boatOffsets.forEach((offset, index) =>
        sampleWaterway(route, travel + offset, poses[index]))

      for (let a = 0; a < poses.length; a += 1)
        for (let b = a + 1; b < poses.length; b += 1)
          closest = Math.min(closest, Math.hypot(
            poses[a].x - poses[b].x,
            poses[a].z - poses[b].z,
          ))
    }

    expect(closest).toBeGreaterThanOrEqual(config.boats.separation)
    expect(network.minimumSeparation).toBeGreaterThanOrEqual(config.boats.separation)
  })

  test('keeps the synchronized arrival and dwell schedule separated', () => {
    const closest = scheduledFleetMinimumSeparation(
      network.route,
      network.boatOffsets.length,
    )

    expect(closest).toBeGreaterThanOrEqual(config.boats.separation)
  })
})
