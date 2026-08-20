import { describe, expect, test } from 'bun:test'
import type { FrameContext, SceneContext } from 'threejs-scene'
import { SCAPE_CONFIG } from './config.ts'
import type { ScapeConfig } from './config.ts'
import { createWind, gustAmount, veerAmount } from './wind.ts'


/** The module hooks ignore the scene entirely, so there is nothing to stub. */
const NO_SCENE = undefined as unknown as SceneContext

function frameAt (index: number, delta = 1 / 60): FrameContext {
  return { delta, elapsed: index * delta, frame: index }
}

function withWind (wind: Partial<ScapeConfig['wind']>): ScapeConfig {
  return { ...SCAPE_CONFIG, wind: { ...SCAPE_CONFIG.wind, ...wind }}
}

/** Run a wind for `frames` ticks off a config that never changes. */
function run (wind: Partial<ScapeConfig['wind']>, frames: number, delta = 1 / 60) {
  const config = withWind(wind)
  const built  = createWind(() => config)

  built.module.build?.(NO_SCENE)

  for (let index = 0; index < frames; index += 1)
    built.module.update?.(config, frameAt(index, delta), NO_SCENE)

  return built.state
}


describe('the gust curve', () => {
  test('stays inside its range across the whole front', () => {
    for (let step = 0; step <= 200; step += 1) {
      const gust = gustAmount(step / 200)

      expect(gust).toBeGreaterThanOrEqual(0)
      expect(gust).toBeLessThanOrEqual(1)
    }
  })

  test('wraps, so a phase past the end is the same wind as the phase inside it', () => {
    for (const phase of [ 0, 0.17, 0.5, 0.83 ]) {
      expect(gustAmount(phase + 1)).toBeCloseTo(gustAmount(phase), 12)
      expect(veerAmount(phase - 3)).toBeCloseTo(veerAmount(phase), 12)
    }
  })

  test('is not one sine — the front does not arrive on a metronome', () => {
    // A single sine is symmetric about its own peak. Sampling either side of the
    // strongest quarter and finding the two equal would mean the extra octaves
    // are contributing nothing, which is the failure this guards.
    expect(gustAmount(0.2)).not.toBeCloseTo(gustAmount(0.3), 2)
  })

  test('the veer does not simply follow the gust', () => {
    // Its own wander, on purpose: a wind that only ever swings when it
    // strengthens has one degree of freedom, and every gust then arrives from
    // the same new quarter.
    const gusts = [ 0.1, 0.35, 0.6, 0.85 ].map(gustAmount)
    const veers = [ 0.1, 0.35, 0.6, 0.85 ].map(veerAmount)

    expect(veers.some((veer, index) => Math.sign(veer) !== Math.sign(gusts[index] - 0.5))).toBe(true)
  })
})

describe('the one wind', () => {
  test('resolves a bearing at build, before anything has asked it a question', () => {
    const config = withWind({ bearing: 90, gust: 0 })
    const wind   = createWind(() => config)

    wind.module.build?.(NO_SCENE)

    expect(wind.state.dirX).toBeCloseTo(Math.cos(Math.PI / 2), 6)
    expect(wind.state.dirZ).toBeCloseTo(Math.sin(Math.PI / 2), 6)
  })

  test('the direction is a unit vector at every phase', () => {
    for (let step = 0; step <= 60; step += 1) {
      const state = run({ time: step / 60, gustSpeed: 0 }, 1)

      expect(Math.hypot(state.dirX, state.dirZ)).toBeCloseTo(1, 12)
    }
  })

  test('travel only ever goes forward', () => {
    let last  = 0
    const config = withWind({ strength: 0.9, speed: 1.35 })
    const wind   = createWind(() => config)

    wind.module.build?.(NO_SCENE)

    for (let index = 0; index < 90; index += 1) {
      wind.module.update?.(config, frameAt(index), NO_SCENE)
      expect(wind.state.travel).toBeGreaterThanOrEqual(last)
      last = wind.state.travel
    }

    expect(last).toBeGreaterThan(0)
  })

  test('a still day stops every surface the scape scrolls', () => {
    // The whole contract `STILL` depends on. Either knob at zero has to freeze
    // the travel, because the mist, the deck, the sea and the grass all
    // multiply it — a capture cannot be taken twice the same way otherwise.
    expect(run({ strength: 0 }, 120).travel).toBe(0)
    expect(run({ speed: 0 }, 120).travel).toBe(0)
  })

  test('a steady wind neither strengthens nor veers, however fast the clock runs', () => {
    const steady  = run({ gust: 0, gustSpeed: 4 }, 120)
    const bearing = SCAPE_CONFIG.wind.bearing * Math.PI / 180

    expect(steady.bearing).toBeCloseTo(bearing, 12)
    expect(steady.strength).toBeCloseTo(SCAPE_CONFIG.wind.strength, 12)
  })

  test('a gust lifts the strength above the resting one and never below it', () => {
    for (let step = 0; step <= 40; step += 1) {
      const state = run({ time: step / 40, gustSpeed: 0, gust: 1, strength: 0.8 }, 1)

      expect(state.strength).toBeGreaterThanOrEqual(state.base - 1e-12)
      expect(state.strength).toBeLessThanOrEqual(state.base * 2 + 1e-12)
    }
  })

  test('the same ticks give the same wind, every time', () => {
    const first  = run({}, 240)
    const second = run({}, 240)

    expect(second.travel).toBeCloseTo(first.travel, 12)
    expect(second.bearing).toBeCloseTo(first.bearing, 12)
    expect(second.phase).toBeCloseTo(first.phase, 12)
  })

  test('the phase wraps rather than growing without bound', () => {
    const state = run({ gustSpeed: 60 }, 600)

    expect(state.phase).toBeGreaterThanOrEqual(0)
    expect(state.phase).toBeLessThan(1)
  })
})
