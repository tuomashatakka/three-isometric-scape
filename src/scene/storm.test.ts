import { describe, expect, test } from 'bun:test'
import { createSeededRng } from 'threejs-scene'
import { SCAPE_CONFIG } from './config.ts'
import {
  STORM_SLOTS,
  flashEnvelope,
  forkGeometry,
  stormAge,
  stormForkReveal,
  stormLive,
  stormPeak,
  stormPoints,
  stormReveal,
  stormSchedule,
} from './storm.ts'
import type { StormStrike } from './storm.ts'
import { showerAmount } from './weather.ts'


const SEED  = SCAPE_CONFIG.seed
const SITES = stormPoints(SCAPE_CONFIG).length

function strikeAt (phase: number): StormStrike {
  return { slot: 0, phase, power: 1, site: 0, shape: 0, roll: 0 }
}

describe('the storm schedule', () => {
  test('is the same comb every time it is planned', () => {
    expect(stormSchedule(SEED, SITES)).toEqual(stormSchedule(SEED, SITES))
  })

  test('is a different comb under a different seed', () => {
    expect(stormSchedule(SEED, SITES)).not.toEqual(stormSchedule(SEED + 1, SITES))
  })

  test('carries strikes, and fewer than there are slots to put them in', () => {
    const schedule = stormSchedule(SEED, SITES)

    expect(schedule.length).toBeGreaterThan(3)
    expect(schedule.length).toBeLessThan(STORM_SLOTS)
  })

  // The claim the module is built on: lightning belongs to the front. A strike
  // out of a clear sky is what a schedule read against the wrong curve looks
  // like, and it is invisible in a still taken at any other phase.
  test('never fires out of a clear sky', () => {
    for (const strike of stormSchedule(SEED, SITES))
      expect(showerAmount(strike.phase)).toBeGreaterThan(0.3)
  })

  test('puts every strike in its own slot, in order', () => {
    const schedule = stormSchedule(SEED, SITES)

    for (const [ index, strike ] of schedule.entries()) {
      expect(strike.phase).toBeGreaterThanOrEqual(strike.slot / STORM_SLOTS)
      expect(strike.phase).toBeLessThan((strike.slot + 1) / STORM_SLOTS)

      if (index > 0)
        expect(strike.phase).toBeGreaterThan(schedule[index - 1].phase)
    }
  })

  test('lands every strike on a site that exists', () => {
    for (const strike of stormSchedule(SEED, SITES)) {
      expect(strike.site).toBeGreaterThanOrEqual(0)
      expect(strike.site).toBeLessThan(SITES)
    }
  })

  test('is silent at a rate of zero and complete at a rate of one', () => {
    const schedule = stormSchedule(SEED, SITES)

    expect(schedule.filter(strike => stormLive(strike, 0))).toHaveLength(0)
    expect(schedule.filter(strike => stormLive(strike, 1))).toHaveLength(schedule.length)
  })

  test('fires more strikes the more electric the front is', () => {
    const schedule = stormSchedule(SEED, SITES)
    const at       = (rate: number): number => schedule.filter(s => stormLive(s, rate)).length

    expect(at(0.9)).toBeGreaterThanOrEqual(at(0.4))
    expect(at(0.4)).toBeGreaterThanOrEqual(at(0.1))
  })
})

describe('where the strikes land', () => {
  // The headline as a fact about the data. The home island is the subject of
  // every pose in the scape, and a bolt standing in the farmyard is a different
  // picture from weather happening out on the sound.
  test('never on the home island', () => {
    const home = SCAPE_CONFIG.archipelago.landmasses.find(spec => spec.id === 'home')

    expect(home).toBeDefined()

    for (const site of stormPoints(SCAPE_CONFIG)) {
      const away = Math.hypot(site.x - home!.origin[0], site.z - home!.origin[1])

      expect(site.id).not.toBe('home')
      expect(away).toBeGreaterThan(SCAPE_CONFIG.terrain.size)
    }
  })

  test('one site per outer island, and inside the world', () => {
    const sites = stormPoints(SCAPE_CONFIG)
    const half  = SCAPE_CONFIG.archipelago.worldSize / 2

    expect(sites).toHaveLength(SCAPE_CONFIG.archipelago.landmasses.length - 1)

    for (const site of sites) {
      expect(Math.abs(site.x)).toBeLessThan(half)
      expect(Math.abs(site.z)).toBeLessThan(half)
    }
  })

  test('near the island each belongs to', () => {
    const spread = SCAPE_CONFIG.archipelago.worldSize * 0.05

    for (const site of stormPoints(SCAPE_CONFIG)) {
      const spec = SCAPE_CONFIG.archipelago.landmasses.find(entry => entry.id === site.id)

      expect(Math.hypot(site.x - spec!.origin[0], site.z - spec!.origin[1])).toBeLessThan(spread)
    }
  })
})

describe('one flash', () => {
  const flash = SCAPE_CONFIG.storm.flash

  test('is lit the instant it fires and dark a flash later', () => {
    const strike = strikeAt(0.3)

    expect(stormAge(0.3, strike, flash)).toBe(0)
    expect(stormAge(0.3 + flash * 0.5, strike, flash)).toBeCloseTo(0.5, 5)
    expect(stormAge(0.3 + flash * 1.01, strike, flash)).toBe(-1)
  })

  // The front's clock wraps and a strike near the end of it does not care.
  test('reads the same across the wrap of the front it belongs to', () => {
    const strike = strikeAt(0.9995)

    expect(stormAge(0.9995, strike, flash)).toBe(0)
    expect(stormAge(0.9995 + flash * 0.5, strike, flash)).toBeCloseTo(0.5, 4)
  })

  test('is never lit before it fires', () => {
    const strike = strikeAt(0.3)

    expect(stormAge(0.3 - flash * 0.5, strike, flash)).toBe(-1)
    expect(stormAge(0.1, strike, flash)).toBe(-1)
  })

  test('cannot be lit at all with no length to it', () => {
    expect(stormAge(0.3, strikeAt(0.3), 0)).toBe(-1)
  })

  test('opens at full brightness and is out by the end of its window', () => {
    expect(flashEnvelope(0)).toBe(1)
    expect(flashEnvelope(1)).toBe(0)
    expect(flashEnvelope(1.5)).toBe(0)
    expect(flashEnvelope(-0.1)).toBe(0)
    expect(flashEnvelope(0.99)).toBeLessThan(0.02)
  })

  test('strikes twice', () => {
    // The dip between the strokes, and the second stroke that lifts back out of
    // it. One decay would pass both of these tests except this one.
    expect(flashEnvelope(0.28)).toBeLessThan(flashEnvelope(0.34))
    expect(flashEnvelope(0.34)).toBeGreaterThan(flashEnvelope(0.5))
  })

  test('stays inside its own bounds all the way through', () => {
    for (let step = 0; step <= 100; step += 1) {
      const value = flashEnvelope(step / 100)

      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })
})

describe('the two ends of the zoom', () => {
  const limits = SCAPE_CONFIG.camera
  const span   = limits.maxViewSize - limits.minViewSize
  const mid    = limits.minViewSize + span * 0.5

  test('hide the flash close in and show it pulled out', () => {
    expect(stormReveal(limits.minViewSize, limits)).toBe(0)
    expect(stormReveal(mid, limits)).toBe(1)
    expect(stormReveal(limits.maxViewSize, limits)).toBe(1)
  })

  test('hide the fork pulled out and show it close in', () => {
    expect(stormForkReveal(limits.minViewSize, limits)).toBe(1)
    expect(stormForkReveal(mid, limits)).toBe(0)
    expect(stormForkReveal(limits.maxViewSize, limits)).toBe(0)
  })

  // The one thing the two curves have to do together: a strike is drawn by one
  // or the other at every view, so no zoom exists at which a lit strike is
  // invisible.
  test('never both leave the frame at once', () => {
    for (let step = 0; step <= 60; step += 1) {
      const view = limits.minViewSize + span * (step / 60)

      expect(stormReveal(view, limits) + stormForkReveal(view, limits)).toBeGreaterThan(0.2)
    }
  })
})

describe('a fork', () => {
  const height = SCAPE_CONFIG.atmosphere.cloudHeight
  const build  = (): Float32Array =>
    forkGeometry(createSeededRng(SEED).fork('fork-0'), height)
      .getAttribute('position').array as Float32Array

  test('is the same geometry byte for byte from the same seed', () => {
    expect(Array.from(build())).toEqual(Array.from(build()))
  })

  test('carries the attributes the shader reads, and no others', () => {
    const geometry = forkGeometry(createSeededRng(SEED).fork('fork-0'), height)

    expect(Object.keys(geometry.attributes).sort()).toEqual([ 'aFade', 'position' ])
    expect(geometry.getIndex()).not.toBeNull()
    expect(geometry.getAttribute('aFade').count).toBe(geometry.getAttribute('position').count)
  })

  // Base at zero, top at the deck. A channel that stopped short of its own cloud
  // is a bolt hanging in the air, and one that ran past zero is a bolt coming
  // out of the hillside — both only visible at the one zoom the fork is drawn at.
  test('stands on the ground and reaches the cloud it came out of', () => {
    const position = build()
    let low  = Infinity
    let high = -Infinity

    for (let index = 1; index < position.length; index += 3) {
      low  = Math.min(low, position[index])
      high = Math.max(high, position[index])
    }

    expect(low).toBe(0)
    expect(high).toBeCloseTo(height, 5)
  })

  test('wanders, and not far', () => {
    const position = build()
    let wide     = 0

    for (let index = 0; index < position.length; index += 3) {
      expect(Number.isFinite(position[index])).toBe(true)
      wide = Math.max(wide, Math.abs(position[index]))
    }

    expect(wide).toBeGreaterThan(0.2)
    expect(wide).toBeLessThan(height * 0.5)
  })

  test('is a different bolt for every shape the storm draws with', () => {
    const rng    = createSeededRng(SEED)
    const first  = forkGeometry(rng.fork('fork-0'), height).getAttribute('position').array
    const second = forkGeometry(rng.fork('fork-1'), height).getAttribute('position').array

    expect(Array.from(first)).not.toEqual(Array.from(second))
  })
})

describe('the strike a pose is aimed at', () => {
  test('is one the front actually fires', () => {
    const peak = stormPeak(SCAPE_CONFIG)

    expect(peak).not.toBeNull()
    expect(stormLive(peak!.strike, SCAPE_CONFIG.storm.rate)).toBe(true)
    expect(stormPoints(SCAPE_CONFIG)[peak!.strike.site]).toEqual(peak!.site)
  })

  test('is the brightest one it fires', () => {
    const peak   = stormPeak(SCAPE_CONFIG)!
    const weight = (strike: StormStrike): number => strike.power * showerAmount(strike.phase)

    for (const strike of stormSchedule(SEED, SITES).filter(s => stormLive(s, SCAPE_CONFIG.storm.rate)))
      expect(weight(strike)).toBeLessThanOrEqual(weight(peak.strike))
  })

  test('is nothing at all on a front with no lightning in it', () => {
    expect(stormPeak({ ...SCAPE_CONFIG, storm: { ...SCAPE_CONFIG.storm, rate: 0 }})).toBeNull()
  })
})
