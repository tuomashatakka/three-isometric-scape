import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { SCAPE_CONFIG } from '../config.ts'
import type { ScapeConfig } from '../config.ts'
import { buildProp, resolvePalette } from '../props/index.ts'
import { surveyArchipelago } from './archipelago.ts'
import { createSkerrySampler } from './samplers.ts'
import { SKERRY_WATERLINE } from './skerry.ts'


const clone   = (): ScapeConfig => structuredClone(SCAPE_CONFIG) as ScapeConfig
const config  = clone()
const world   = surveyArchipelago(config)
const guard   = world.skerries
const water   = config.terrain.waterLevel
const palette = resolvePalette()

/** How many darts a claim about the band is allowed to be built on. */
const DARTS = 4_000

/** Where every dart landed, with the height of the ground under it. */
function throwDarts (sample: () => { x: number, z: number }): { x: number, z: number, height: number }[] {
  const landed: { x: number, z: number, height: number }[] = []

  for (let dart = 0; dart < DARTS; dart += 1) {
    const { x, z } = sample()
    landed.push({ x, z, height: guard.heightAt(x, z) })
  }

  return landed
}


describe('the sampler that can reach a rock', () => {
  test('every dart lands on a skerry rather than in the sea between them', () => {
    const sample = createSkerrySampler(guard, createSeededRng(config.seed).fork('skerry'))!

    expect(sample).not.toBeNull()

    // The claim, as a fact about the data: a dart is inside some rock's own
    // circle. Not "near a rock" — the whole reason this sampler exists is that
    // the island sampler's darts are nowhere near one.
    for (const { x, z } of throwDarts(sample)) {
      const onRock = guard.skerries.some(skerry =>
        Math.hypot(x - skerry.x, z - skerry.z) <= skerry.radius)

      expect(onRock).toBe(true)
    }
  })

  test('the darts stop at the waterline seam rather than at the drowned foot', () => {
    const sample = createSkerrySampler(guard, createSeededRng(config.seed).fork('skerry'))!

    // A dart past the seam by more than the frond margin is a dart in open
    // water, and a budget spent there is weed the scape reports and does not
    // have. Stated against the published seam so retuning the profile moves
    // both together.
    for (const { x, z } of throwDarts(sample)) {
      const nearest = guard.skerries.reduce((best, skerry) => {
        const reach = Math.hypot(x - skerry.x, z - skerry.z) / skerry.radius
        return reach < best ? reach : best
      }, Infinity)

      expect(nearest).toBeLessThanOrEqual(SKERRY_WATERLINE * 1.5)
    }
  })

  test('a scape with the guard drowned has no sampler at all', () => {
    const bare = clone()

    // `skerries.crest = 0` is the one switch, so it has to be the switch for the
    // weed too. A sampler here would be a budget thrown at rocks that are not
    // there, and the absence is what stands in for a second flag.
    bare.skerries.crest = 0

    expect(createSkerrySampler(surveyArchipelago(bare).skerries, createSeededRng(1))).toBeNull()
  }, 180_000)

  test('one seed throws the same darts twice', () => {
    const first  = throwDarts(createSkerrySampler(guard, createSeededRng(99))!).map(dart => [ dart.x, dart.z ])
    const second = throwDarts(createSkerrySampler(guard, createSeededRng(99))!).map(dart => [ dart.x, dart.z ])

    expect(first).toEqual(second)
  })
})


describe('the tidal band', () => {
  const { weedDepth, weedRise, lichenBase } = config.littoral

  test('the weed sits under the lichen with bare stone between them', () => {
    // Two bands sharing a rock must not share a height: a crust drawn inside the
    // tide is a crust that spends its life submerged.
    expect(weedRise).toBeLessThan(lichenBase)
    expect(weedDepth).toBeGreaterThan(0)
  })

  test('the weed straddles the waterline and the lichen never touches it', () => {
    expect(water - weedDepth).toBeLessThan(water)
    expect(water + weedRise).toBeGreaterThan(water)
    expect(water + lichenBase).toBeGreaterThan(water + weedRise)
  })

  test('both bands are actually on the rocks, not just in the config', () => {
    const sample = createSkerrySampler(guard, createSeededRng(config.seed).fork('skerry'))!
    const landed = throwDarts(sample)

    const weed   = landed.filter(dart =>
      dart.height > water - weedDepth && dart.height < water + weedRise)
    const lichen = landed.filter(dart => dart.height > water + lichenBase)

    // The failure this catches is the one a screenshot cannot: bands that are
    // arithmetically fine and land on nothing, so the guard is dressed with
    // zero of each and every pose reports `same`. A twentieth of the darts is
    // far below what the scape actually places and far above nothing.
    expect(weed.length / DARTS).toBeGreaterThan(0.05)
    expect(lichen.length / DARTS).toBeGreaterThan(0.05)
  })

  test('the bands between them reach every rock in the guard', () => {
    const sample  = createSkerrySampler(guard, createSeededRng(config.seed).fork('skerry'))
    const dressed = new Set<number>()

    for (const dart of throwDarts(sample!)) {
      if (dart.height <= water - weedDepth)
        continue

      const rock = guard.skerries.findIndex(skerry =>
        Math.hypot(dart.x - skerry.x, dart.z - skerry.z) <= skerry.radius)

      if (rock >= 0)
        dressed.add(rock)
    }

    // A guard where the budget all fell on the two widest rocks would look, from
    // the one pose that frames a chain, exactly like a guard that was dressed.
    expect(dressed.size).toBe(guard.skerries.length)
  })
})


describe('what grows there', () => {
  test('the wrack hangs rather than stands', () => {
    const geometry = buildProp('bladderwrack', createSeededRng(7), palette)
    const bounds   = new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)
    const size     = bounds.getSize(bounds.max.clone())

    // The silhouette claim. A clump taller than it is wide is a clump of blades
    // standing up, which is grass that has got its feet wet.
    expect(Math.max(size.x, size.z)).toBeGreaterThan(size.y)

    geometry.dispose()
  })

  test('the lichen is a stain rather than a thing standing on the rock', () => {
    const geometry = buildProp('rockLichen', createSeededRng(7), palette)
    const bounds   = new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)

    // Any real height here is a hedgehog of domes over every rock in the guard.
    expect(bounds.max.y).toBeLessThan(0.06)

    geometry.dispose()
  })
})
