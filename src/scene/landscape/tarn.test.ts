import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { surveyArchipelago } from './archipelago.ts'
import { createHeightField } from './height.ts'
import { distanceToTrack, pastureInfluence, plotInfluence } from './layout.ts'
import { carveTarn, solveTarn, tarnWetted } from './tarn.ts'
import { tarnFreeze } from './tarn-water.ts'


/**
 * One survey for the whole file, for the reason `skerry.test.ts` states: this
 * archipelago is five islands and surveying it is not cheap.
 */
const survey = surveyArchipelago(SCAPE_CONFIG)
const home   = survey.landmasses.find(landmass => landmass.id === 'home')!
const tarn   = home.survey.tarn!

/**
 * The ground each search measured: that island's own field, without its own
 * carve in it. Built from `landmass.config` rather than from `SCAPE_CONFIG`,
 * because an island's spec overrides its terrain and a field built from the
 * archipelago's defaults would be a different island.
 */
const bareFieldOf = (landmass: typeof home): (x: number, z: number) => number =>
  createHeightField(landmass.config, landmass.survey.layout).heightAt

const bare = bareFieldOf(home)

/** Everything about a pool except the closures hung off it. */
const record = (pool: NonNullable<typeof tarn>): unknown => ({
  x:       pool.x,
  z:       pool.z,
  radius:  pool.radius,
  level:   pool.level,
  depth:   pool.depth,
  spread:  pool.spread,
  outflow: pool.outflow,
})

const RIM_BEARINGS = 24


describe('the pool on the high ground', () => {
  test('the home island has one, and every record says the same thing twice', () => {
    expect(tarn).toBeDefined()
    expect(record(solveTarn(home.config, home.survey.layout, bare)!))
      .toEqual(record(solveTarn(home.config, home.survey.layout, bare)!))
    expect(record(solveTarn(home.config, home.survey.layout, bare)!)).toEqual(record(tarn))
  })

  /**
   * The absence is part of the answer, not a gap in it.
   *
   * The ridge is the smallest holding in the archipelago and the farm on it has
   * taken every level acre there was; what is left is hillside. A run that
   * "fixed" this by loosening `spread` until the ridge got a pool would be
   * putting standing water on a slope.
   */
  test('the island with nothing flat left has none', () => {
    const ridge = survey.landmasses.find(landmass => landmass.id === 'ridge')!

    expect(ridge.survey.tarn).toBeNull()
  })

  test('its radius is metres, not a share of the island it is on', () => {
    for (const landmass of survey.landmasses)
      if (landmass.survey.tarn)
        expect(landmass.survey.tarn.radius).toBe(SCAPE_CONFIG.tarn.radius)
  })

  /**
   * The claim the whole solver exists to make, as a fact about the ground.
   *
   * Water stands at the first height it can run out over. So there must be no
   * point on the rim the search measured that is *below* the level it chose —
   * if there were, the pool would drain there and the surface the scape draws
   * would be a sheet hanging over dry ground.
   */
  test('no point on its rim stands below the water', () => {
    for (const landmass of survey.landmasses) {
      const pool = landmass.survey.tarn

      if (!pool)
        continue

      const ground = bareFieldOf(landmass)

      for (let index = 0; index < RIM_BEARINGS; index += 1) {
        const bearing = index / RIM_BEARINGS * Math.PI * 2

        expect(ground(
          pool.x + Math.cos(bearing) * pool.radius,
          pool.z + Math.sin(bearing) * pool.radius,
        )).toBeGreaterThanOrEqual(pool.level - 1e-9)
      }
    }
  })

  test('the rim it settled for is inside the relief the config allows', () => {
    for (const landmass of survey.landmasses)
      if (landmass.survey.tarn)
        expect(landmass.survey.tarn.spread).toBeLessThanOrEqual(SCAPE_CONFIG.tarn.spread)
  })

  test('it stands clear of the sea rather than beside it', () => {
    for (const landmass of survey.landmasses)
      if (landmass.survey.tarn)
        expect(landmass.survey.tarn.level).toBeGreaterThanOrEqual(
          landmass.survey.layout.waterLevel + SCAPE_CONFIG.tarn.lift,
        )
  })
})


describe('the basin cut for it', () => {
  test('the carve only ever goes down', () => {
    for (let step = 0; step <= 40; step += 1) {
      const angle    = step / 41 * Math.PI * 2
      const distance = tarn.radius * (step % 11) / 10
      const x        = tarn.x + Math.cos(angle) * distance
      const z        = tarn.z + Math.sin(angle) * distance
      const height   = bare(x, z)

      expect(carveTarn(tarn, x, z, height)).toBeLessThanOrEqual(height)
    }
  })

  test('it touches nothing outside its own radius', () => {
    for (let step = 0; step < 24; step += 1) {
      const angle = step / 24 * Math.PI * 2
      const x     = tarn.x + Math.cos(angle) * tarn.radius * 1.001
      const z     = tarn.z + Math.sin(angle) * tarn.radius * 1.001

      expect(carveTarn(tarn, x, z, 12.5)).toBe(12.5)
    }
  })

  /**
   * The headline as a fact about the data: a pool with no water in it is not a
   * pool. Read off the carved field the scape actually draws, because that is
   * the surface the bank occludes the sheet with.
   */
  test('water stands in every basin the search accepted', () => {
    for (const landmass of survey.landmasses) {
      const pool = landmass.survey.tarn

      if (!pool)
        continue

      expect(tarnWetted(pool, landmass.survey.field.heightAt)).toBeGreaterThan(pool.radius * 0.5)
      expect(pool.level - landmass.survey.field.heightAt(pool.x, pool.z))
        .toBeGreaterThan(SCAPE_CONFIG.tarn.depth * 0.75)
    }
  })

  /**
   * The composition test. The farm is authored and the pool is found, so the
   * one thing the search must never do is find ground somebody is already
   * standing on.
   */
  test('it is not on the yard, the road, a field, the meadow or the beck', () => {
    for (const landmass of survey.landmasses) {
      const pool       = landmass.survey.tarn
      const { layout } = landmass.survey

      if (!pool)
        continue

      expect(Math.hypot(pool.x - layout.yard.x, pool.z - layout.yard.z))
        .toBeGreaterThan(layout.yard.radius)
      expect(distanceToTrack(layout, pool.x, pool.z)).toBeGreaterThan(pool.radius)
      expect(layout.plots.some(plot => plotInfluence(plot, pool.x, pool.z) > 0)).toBe(false)
      expect(pastureInfluence(layout, pool.x, pool.z)).toBe(0)
      expect(layout.creek?.clearanceAt(pool.x, pool.z) ?? Infinity).toBeGreaterThanOrEqual(pool.radius)
    }
  })
})


describe('the winter it gets', () => {
  test('an open year leaves it open, and the depth of winter locks it', () => {
    expect(tarnFreeze(0, SCAPE_CONFIG.tarn.frost)).toBe(0)
    expect(tarnFreeze(1, SCAPE_CONFIG.tarn.frost)).toBe(1)
  })

  test('it locks ahead of the sound below it, and never behind', () => {
    for (let step = 1; step < 10; step += 1) {
      const freeze = step / 10

      expect(tarnFreeze(freeze, 0.55)).toBeGreaterThanOrEqual(tarnFreeze(freeze, 0))
      expect(tarnFreeze(freeze, 0)).toBeGreaterThanOrEqual(0)
    }
  })

  test('a pool that never froze early is still a pool that freezes', () => {
    expect(tarnFreeze(0.5, 0)).toBeGreaterThan(0)
    expect(tarnFreeze(0.5, 0)).toBeLessThan(1)
  })
})
