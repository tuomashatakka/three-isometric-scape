import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import type { ScapeConfig } from '../config.ts'
import { SURVEY_BUDGET_MS, surveyArchipelago } from './archipelago.ts'
import type { ArchipelagoSurvey } from './archipelago.ts'
import { STEADING_BUILDINGS } from './steading.ts'


const config = structuredClone(SCAPE_CONFIG) as ScapeConfig
const world  = surveyArchipelago(config)

/**
 * How many islands there are supposed to be — asked, not asserted.
 *
 * The count was written out as `3` here, and adding the sound and the fell to
 * `archipelago.landmasses` turned four correct assertions into four failures
 * about a number rather than about the world. What these actually claim is that
 * every spec becomes exactly one island and no two of them come out alike, and
 * that claim is true at any count.
 */
const ISLANDS = config.archipelago.landmasses.length

function terrainSignature (landmass: ArchipelagoSurvey['landmasses'][number]): string {
  const half   = landmass.config.terrain.size * 0.5
  const probes = [
    [ 0, 0 ],
    [ 0.18, -0.14 ],
    [ -0.27, 0.21 ],
    [ 0.36, 0.08 ],
  ] as const

  return probes.map(([ x, z ]) =>
    landmass.survey.field.heightAt(x * half, z * half).toFixed(4)).join(',')
}

function structuralSignature (survey: ArchipelagoSurvey): unknown {
  return {
    landmasses: survey.landmasses.map(landmass => ({
      id:      landmass.id,
      profile: landmass.profile,
      origin:  landmass.origin,
      landing: landmass.survey.landing,
      places:  landmass.survey.places,
      paths:   landmass.survey.paths.paths.map(path => path.points),
    })),
    ports: survey.ports,
    legs:  survey.waterways.route.legs,
    boats: survey.waterways.boatOffsets,
  }
}

describe('the inhabited archipelago', () => {
  test('has one deterministic landmass per spec, each with genuinely different ground', () => {
    expect(world.landmasses).toHaveLength(ISLANDS)
    expect(new Set(world.landmasses.map(landmass => landmass.id)).size).toBe(ISLANDS)
    expect(new Set(world.landmasses.map(landmass => landmass.profile)).size).toBe(ISLANDS)
    expect(new Set(world.landmasses.map(terrainSignature)).size).toBe(ISLANDS)

    const againConfig = structuredClone(SCAPE_CONFIG) as ScapeConfig
    const again       = surveyArchipelago(againConfig)

    expect(structuralSignature(again)).toEqual(structuralSignature(world))
  }, SURVEY_BUDGET_MS)

  test('each island carries the same essential holding and a route to its jetty', () => {
    for (const landmass of world.landmasses) {
      for (const name of STEADING_BUILDINGS)
        expect(landmass.survey.places[name]).toBeDefined()

      expect(landmass.survey.places.well).toBeDefined()
      expect(landmass.survey.layout.plots.length).toBeGreaterThan(0)
      expect(landmass.survey.layout.pasture).not.toBeNull()
      expect(landmass.survey.layout.creek).not.toBeNull()
      expect(landmass.survey.paths.paths.length).toBeGreaterThan(0)
      expect(landmass.survey.landing).not.toBeNull()
      expect(landmass.survey.harbour).not.toBeNull()

      const landing = landmass.survey.landing!
      const ends    = landmass.survey.paths.paths.flatMap(path => [
        path.points[0],
        path.points[path.points.length - 1],
      ])

      expect(ends.some(point =>
        Math.hypot(point.x - landing.x, point.z - landing.z) < 1e-6)).toBe(true)
    }
  })

  test('projects every local landing to the matching world-space port', () => {
    expect(world.ports).toHaveLength(world.landmasses.length)

    for (const landmass of world.landmasses) {
      const landing = landmass.survey.landing!
      const port    = world.ports.find(candidate => candidate.id === landmass.id)

      expect(port).toBeDefined()
      expect(port!.jetty.x - landmass.origin.x).toBeCloseTo(landing.x, 8)
      expect(port!.jetty.z - landmass.origin.z).toBeCloseTo(landing.z, 8)
      expect(port!.jetty.angle).toBeCloseTo(landing.angle, 8)
    }
  })

  test('projects every local footpath without changing its shape', () => {
    let projectedIndex = 0

    for (const landmass of world.landmasses)
      for (const local of landmass.survey.paths.paths) {
        const projected = world.paths.paths[projectedIndex]

        expect(projected.points).toHaveLength(local.points.length)
        for (const [ index, point ] of local.points.entries()) {
          expect(projected.points[index].x - landmass.origin.x).toBeCloseTo(point.x, 8)
          expect(projected.points[index].z - landmass.origin.z).toBeCloseTo(point.z, 8)
        }

        projectedIndex += 1
      }

    expect(projectedIndex).toBe(world.paths.paths.length)
  })

  test('keeps each holding on dry ground inside its own terrain patch', () => {
    for (const landmass of world.landmasses) {
      const { yard }  = landmass.survey.layout
      const worldYard = {
        x: yard.x + landmass.origin.x,
        z: yard.z + landmass.origin.z,
      }

      expect(world.field.landmassAt(worldYard.x, worldYard.z)?.id).toBe(landmass.id)
      expect(world.field.heightAt(worldYard.x, worldYard.z))
        .toBeGreaterThan(world.waterLevel)
    }
  })
})
