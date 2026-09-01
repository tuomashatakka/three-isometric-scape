import { describe, expect, test } from 'bun:test'
import type { FrameContext, SceneContext } from 'threejs-scene'
import { SCAPE_CONFIG } from './config.ts'
import type { ScapeConfig } from './config.ts'
import { LUNATIONS, moonPhase } from './nightsky.ts'
import { createTide, springAmount, tideAmplitude, tideLevel, tidePhase } from './tide.ts'


/** The module hooks ignore the scene entirely, so there is nothing to stub. */
const NO_SCENE = undefined as unknown as SceneContext

const TIDE = SCAPE_CONFIG.tide

function frameAt (index: number, delta = 1 / 60): FrameContext {
  return { delta, elapsed: index * delta, frame: index }
}

function withClocks (
  time: number,
  year: number,
  tide: Partial<ScapeConfig['tide']> = {},
): ScapeConfig {
  return {
    ...SCAPE_CONFIG,
    daylight: { ...SCAPE_CONFIG.daylight, time },
    season:   { ...SCAPE_CONFIG.season, time: year },
    tide:     { ...TIDE, ...tide },
  } as ScapeConfig
}

/** The state a built tide settles at, for one instant of the two clocks. */
function settle (time: number, year: number, tide: Partial<ScapeConfig['tide']> = {}) {
  const config = withClocks(time, year, tide)
  const built  = createTide(() => config)

  built.module.build?.(NO_SCENE)
  built.module.update?.(config, frameAt(1), NO_SCENE)

  return built.state
}

/** Every level the sea takes over one turn of the day clock, at a phase of the year. */
function overADay (year: number, tide: Partial<ScapeConfig['tide']> = {}, steps = 720): number[] {
  const section = { ...TIDE, ...tide }

  return Array.from({ length: steps }, (_value, step) => tideLevel(step / steps, year, section))
}


describe('the month behind the range', () => {
  test('is at springs on the new moon and on the full one alike', () => {
    expect(springAmount(0)).toBeCloseTo(1, 6)
    expect(springAmount(0.5)).toBeCloseTo(1, 6)
  })

  test('is at neaps at both quarters', () => {
    expect(springAmount(0.25)).toBeCloseTo(0, 6)
    expect(springAmount(0.75)).toBeCloseTo(0, 6)
  })

  test('never leaves 0..1, whatever the month', () => {
    for (let step = 0; step <= 400; step += 1) {
      const amount = springAmount(step / 100)

      expect(amount).toBeGreaterThanOrEqual(0)
      expect(amount).toBeLessThanOrEqual(1)
    }
  })

  test('takes the neap range down but never past nothing', () => {
    const springs = tideAmplitude(0, { ...TIDE, spring: 1 })
    const neaps   = tideAmplitude(0.25 / LUNATIONS, { ...TIDE, spring: 1 })

    expect(springs).toBeCloseTo(TIDE.range / 2, 6)
    expect(neaps).toBeCloseTo(0, 6)
  })

  test('holds every tide the same size when the month is switched off', () => {
    const flat = Array.from({ length: 40 }, (_value, step) =>
      tideAmplitude(step / 40, { ...TIDE, spring: 0 }))

    for (const amplitude of flat)
      expect(amplitude).toBeCloseTo(TIDE.range / 2, 9)
  })
})

describe('the semidiurnal swing', () => {
  test('comes to high water twice in one turn of the moon', () => {
    const levels = overADay(0)
    const highs  = levels.filter((level, index) =>
      level > levels[(index + levels.length - 1) % levels.length] &&
      level >= levels[(index + 1) % levels.length])

    expect(highs.length).toBe(2)
  })

  test('averages out at mean water over a cycle', () => {
    const levels = overADay(0.31)
    const mean   = levels.reduce((sum, level) => sum + level, 0) / levels.length

    // A cycle of 12.42 h against a sample window of 24 h does not divide, so
    // this is the residue of the part-cycle rather than a slack tolerance.
    expect(Math.abs(mean)).toBeLessThan(TIDE.range * 0.03)
  })

  test('reaches both ends of the range it is given', () => {
    const levels    = overADay(0)
    const amplitude = tideAmplitude(0, TIDE)

    expect(Math.max(...levels)).toBeCloseTo(amplitude, 2)
    expect(Math.min(...levels)).toBeCloseTo(-amplitude, 2)
  })

  test('puts high water at the moon\'s transit plus the lag', () => {
    const year    = 0.17
    const noLag   = { ...TIDE, lag: 0 }
    const transit = moonPhase(year) + 0.5

    expect(tidePhase(transit, year, noLag)).toBeCloseTo(0, 6)
    expect(tideLevel(transit, year, noLag)).toBeCloseTo(tideAmplitude(year, noLag), 6)

    // Half a cycle of lag is low water at the same instant — which is what the
    // `tide` poses photograph, so the light can be held while the sea moves.
    const halfCycle = { ...TIDE, lag: 6.21 }

    expect(tideLevel(transit, year, halfCycle)).toBeCloseTo(-tideAmplitude(year, halfCycle), 2)
  })

  test('is a flat sea at a range of zero, at every hour of every month', () => {
    for (let step = 0; step <= 60; step += 1)
      expect(Math.abs(tideLevel(step / 17, step / 60, { ...TIDE, range: 0 }))).toBe(0)
  })

  test('is the same sea for the same two clocks, every time it is asked', () => {
    const once  = overADay(0.44)
    const twice = overADay(0.44)

    for (const [ index, level ] of once.entries())
      expect(twice[index]).toBe(level)
  })
})

describe('the published record', () => {
  test('settles on build, before any frame has run', () => {
    const config = withClocks(0.3, 0.3)
    const built  = createTide(() => config)

    built.module.build?.(NO_SCENE)

    expect(built.state.level).toBeCloseTo(tideLevel(0.3, 0.3, TIDE), 9)
  })

  test('agrees with the pure function it is resolved from', () => {
    for (const hour of [ 0, 0.13, 0.5, 0.77, 0.99 ]) {
      const state = settle(hour, 0.42)

      expect(state.level).toBeCloseTo(tideLevel(hour, 0.42, TIDE), 9)
      expect(state.amplitude).toBeCloseTo(tideAmplitude(0.42, TIDE), 9)
      expect(state.phase).toBeGreaterThanOrEqual(0)
      expect(state.phase).toBeLessThan(1)
    }
  })

  test('holds where the clocks left it, because it integrates nothing', () => {
    const config = withClocks(0.62, 0.62)
    const built  = createTide(() => config)

    built.module.build?.(NO_SCENE)

    const settled = built.state.level

    for (let index = 0; index < 240; index += 1)
      built.module.update?.(config, frameAt(index), NO_SCENE)

    expect(built.state.level).toBe(settled)
  })
})

describe('the range the scape is authored at', () => {
  // The claim: the tide moves the sea without invalidating anything solved
  // against mean water. Both halves are facts about the shipped numbers rather
  // than about the code, which is why they are asserted on `SCAPE_CONFIG`.

  test('leaves water under the shallowest leg the router would accept', () => {
    expect(TIDE.range / 2).toBeLessThan(SCAPE_CONFIG.boats.clearance)
  })

  test('walks the waterline through the wrack band without leaving it', () => {
    const lowest = -TIDE.range / 2

    expect(lowest).toBeGreaterThan(-SCAPE_CONFIG.littoral.weedDepth)
    expect(TIDE.range / 2).toBeLessThan(SCAPE_CONFIG.littoral.weedRise)

    // And it has to actually get into the weed, or the band is a paint job the
    // sea never reaches.
    expect(TIDE.range / 2).toBeGreaterThan(SCAPE_CONFIG.littoral.weedDepth * 0.25)
  })

  test('is a real-world quantity, so it does not scale with the world', () => {
    // The metre class. `worldSize` grew from 196 to 1520 and every extent that
    // followed it had to be audited; a tidal range is not one of them, and this
    // is the line that says so if a future scale pass reaches for it.
    expect(TIDE.range).toBeLessThan(SCAPE_CONFIG.archipelago.worldSize * 0.01)
  })
})
