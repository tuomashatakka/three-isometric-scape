import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { SCAPE_CONFIG } from '../config.ts'
import type { ScapeConfig } from '../config.ts'
import { buildProp, resolvePalette } from '../props/index.ts'
import { tideAmplitudeAt } from '../tide.ts'
import { surveyArchipelago } from './archipelago.ts'
import {
  berths,
  countAshore,
  crownHeight,
  hauledSeals,
  isHaulout,
  planHaulouts,
  sealAshore,
  sealClearance,
} from './haulout.ts'
import { SKERRY_WATERLINE, warpedRadius } from './skerry.ts'


const clone  = (): ScapeConfig => structuredClone(SCAPE_CONFIG) as ScapeConfig
const config = clone()
const world  = surveyArchipelago(config)
const water  = config.terrain.waterLevel

/** The tier the map reports against, and the one every claim here is stated at. */
const HEADS = 11

const colony = planHaulouts(world, config, HEADS)
const seals  = hauledSeals(colony)


describe('the search that picks a rock', () => {
  test('it finds rocks, and not all of them', () => {
    // Both halves matter. No rocks is a system that is not there; every rock is
    // a search that has stopped searching, and the three rules would then be
    // decoration on a scatter over the whole guard.
    expect(colony.length).toBeGreaterThan(0)
    expect(colony.length).toBeLessThan(world.skerries.skerries.length)
  })

  test('every chosen rock is inside the sill, the reach and the stone', () => {
    const { haulout } = config

    for (const rock of colony) {
      expect(rock.skerry.crest).toBeGreaterThanOrEqual(haulout.sill)
      expect(rock.skerry.crest).toBeLessThanOrEqual(haulout.reach)
    }

    // And the converse, which is the half a per-rock loop cannot state: no rock
    // the rules accept was passed over.
    const accepted = world.skerries.skerries.filter(rock => isHaulout(rock, haulout))

    expect(colony.length).toBe(accepted.length)
  })

  test('a reach under the sill is a coast with no colony on it', () => {
    const shut = clone()

    shut.haulout.reach = shut.haulout.sill - 0.01

    expect(planHaulouts(world, shut, HEADS)).toHaveLength(0)
  })

  test('a tier with no seals to give builds no colony rather than a thin one', () => {
    expect(planHaulouts(world, config, 0)).toHaveLength(0)
  })
})

describe('where an animal ends up', () => {
  test('every seal is on the dry crown of its own rock', () => {
    for (const rock of colony)
      for (const seal of rock.seals) {
        const bearing  = Math.atan2(seal.z - rock.skerry.z, seal.x - rock.skerry.x)
        const distance = Math.hypot(seal.x - rock.skerry.x, seal.z - rock.skerry.z)

        // Inside the crown *at this bearing*, which by the skerry profile is
        // what is out of the water at all — and the outline is two lobes deep,
        // so the nominal radius is the wrong thing to measure against. Stated
        // against the rock's own warp and the published seam, so retuning either
        // moves the colony with it rather than leaving it in the sea.
        expect(distance).toBeLessThan(warpedRadius(rock.skerry, bearing) * (1 - SKERRY_WATERLINE))
        expect(seal.ledge).toBeGreaterThan(water)
      }
  })

  test('the ledge a seal is on is the height of the ground it is on', () => {
    // The one claim that ties the survey to the terrain: `ledge` is what the
    // tide is measured against, so a ledge that disagreed with the composite
    // field would be a colony floating over — or buried in — its own rock.
    for (const seal of seals)
      expect(seal.ledge).toBeCloseTo(world.field.heightAt(seal.x, seal.z), 2)
  })

  test('a rock is dealt no more animals than there is stone for', () => {
    for (const rock of colony) {
      expect(rock.seals.length).toBeLessThanOrEqual(HEADS)
      expect(rock.seals.length).toBeLessThanOrEqual(berths(rock.crown))
      expect(rock.seals.length).toBeGreaterThan(0)
    }
  })

  test('no two animals on a rock are lying in the same place', () => {
    for (const rock of colony)
      for (const [ index, seal ] of rock.seals.entries())
        for (const other of rock.seals.slice(index + 1))
          expect(Math.hypot(seal.x - other.x, seal.z - other.z)).toBeGreaterThan(0.5)
  })
})

describe('the tide is what works the colony', () => {
  const springs = tideAmplitudeAt(1, config.tide)
  const neaps   = tideAmplitudeAt(0, config.tide)

  test('fewer animals are ashore at high water than at low', () => {
    // The run's whole claim, as a fact about the data rather than a picture.
    // A colony sited so high up its rocks that this pair is equal is a colony
    // the sea has stopped mattering to, and `scape:map` says so on the same
    // comparison.
    const low  = countAshore(seals, water, -springs)
    const high = countAshore(seals, water, springs)

    expect(low).toBe(seals.length)
    expect(high).toBeLessThan(low)
  })

  test('the count ashore never rises as the water does', () => {
    // Monotone, and across the whole swing rather than at its two ends: the
    // deal is squared toward the water's edge, and a band that folded back on
    // itself would put animals in the sea at half tide and back on the rock at
    // the top of it.
    let previous = Infinity

    for (let step = 0; step <= 40; step += 1) {
      const level  = -springs + springs * 2 * step / 40
      const ashore = countAshore(seals, water, level)

      expect(ashore).toBeLessThanOrEqual(previous)
      previous = ashore
    }
  })

  test('a neap tide takes fewer animals than a spring one', () => {
    expect(countAshore(seals, water, neaps)).toBeGreaterThan(countAshore(seals, water, springs))
  })

  test('the highest animals are never covered and the lowest always are', () => {
    const ledges = seals.map(seal => seal.ledge - water)

    expect(Math.max(...ledges)).toBeGreaterThan(springs)
    expect(Math.min(...ledges)).toBeLessThan(springs)
  })

  test('clearance is a plain subtraction against the published sea', () => {
    const [ seal ] = seals

    expect(sealClearance(seal, water, 0)).toBeCloseTo(seal.ledge - water, 6)
    expect(sealClearance(seal, water, 0.25)).toBeCloseTo(seal.ledge - water - 0.25, 6)
  })

  test('the ramp is a ramp, and a zero ramp is a step', () => {
    expect(sealAshore(-0.01, 0.12)).toBe(0)
    expect(sealAshore(0.06, 0.12)).toBeCloseTo(0.5, 6)
    expect(sealAshore(0.4, 0.12)).toBe(1)

    expect(sealAshore(0.0001, 0)).toBe(1)
    expect(sealAshore(-0.0001, 0)).toBe(0)
  })
})

describe('the crown profile the ledges are read off', () => {
  test('it runs from the waterline to the crest without overshooting either', () => {
    expect(crownHeight(1.9, 0)).toBeCloseTo(0, 6)
    expect(crownHeight(1.9, 1)).toBeCloseTo(1.9, 6)
    expect(crownHeight(1.9, -1)).toBeCloseTo(0, 6)
    expect(crownHeight(1.9, 2)).toBeCloseTo(1.9, 6)
  })

  test('it climbs, and it flattens at the top the way the rock does', () => {
    const low  = crownHeight(1.9, 0.2) - crownHeight(1.9, 0.1)
    const high = crownHeight(1.9, 0.9) - crownHeight(1.9, 0.8)

    expect(low).toBeGreaterThan(high)
  })
})

describe('the colony is the same colony every time', () => {
  test('two surveys of one seed agree animal for animal', () => {
    const again = hauledSeals(planHaulouts(world, clone(), HEADS))

    expect(again).toEqual(seals)
  })

  test('a rock gaining an animal leaves every other rock alone', () => {
    const thinner = hauledSeals(planHaulouts(world, config, HEADS - 1))
    const byRock  = new Map(planHaulouts(world, config, HEADS - 1)
      .map(rock => [ `${rock.skerry.x},${rock.skerry.z}`, rock.seals ]))

    expect(thinner.length).toBeLessThan(seals.length)

    // Every animal a thinner deal keeps is in exactly the place the fuller one
    // put it. The rng is forked per rock, so a budget change must not reshuffle
    // the guard.
    for (const rock of colony) {
      const fewer = byRock.get(`${rock.skerry.x},${rock.skerry.z}`)!

      expect(rock.seals.slice(0, fewer.length)).toEqual(fewer.slice())
    }
  })
})

describe('the animal itself', () => {
  const palette  = resolvePalette()
  const geometry = buildProp('seal', createSeededRng(config.seed), palette)

  test('it lies on the ground, and it lies down', () => {
    const bounds = new Box3().setFromBufferAttribute(geometry.getAttribute('position') as never)

    // Base at y = 0 like every other prop, so the placement decides the ledge
    // rather than the geometry assuming one.
    expect(bounds.min.y).toBeCloseTo(0, 1)

    // And the silhouette is the claim: a hauled seal is longer than it is wide
    // and far longer than it is tall. A build that lost the taper would draw a
    // boulder, and the guard has fifty-nine of those already.
    const length = bounds.max.z - bounds.min.z
    const width  = bounds.max.x - bounds.min.x
    const height = bounds.max.y - bounds.min.y

    expect(length).toBeGreaterThan(width * 2)
    expect(length).toBeGreaterThan(height * 3)
    expect(length).toBeGreaterThan(1.5)
    expect(length).toBeLessThan(2.6)
  })

  test('it is the same animal for the same seed', () => {
    const again = buildProp('seal', createSeededRng(config.seed), palette)

    expect(Array.from(again.getAttribute('position').array))
      .toEqual(Array.from(geometry.getAttribute('position').array))
  })

  test('it carries the attributes the instanced draw needs', () => {
    expect(geometry.getAttribute('position')).toBeDefined()
    expect(geometry.getAttribute('normal')).toBeDefined()
    expect(geometry.getAttribute('color')).toBeDefined()
  })
})
