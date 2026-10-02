import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from './config.ts'
import { createSeason } from './season.ts'
import {
  HAIL_CENTRE,
  HAIL_WIDTH,
  createWeather,
  hailAmount,
  hailChill,
  showerAmount,
  wetAmount,
} from './weather.ts'


/** A week of the year, resolved the way the landscape module resolves it. */
function week (phase: number): ReturnType<ReturnType<typeof createSeason>['sample']> {
  return createSeason(() => SCAPE_CONFIG).sample(phase)
}

describe('showerAmount', () => {
  test('opens the squall and closes it again', () => {
    expect(showerAmount(0.3)).toBeCloseTo(1, 5)
    expect(showerAmount(0)).toBe(0)
  })

  test('leaves the longer half of the cycle dry', () => {
    let dry = 0

    for (let step = 0; step < 200; step += 1)
      if (showerAmount(step / 200) === 0)
        dry += 1

    expect(dry / 200).toBeGreaterThan(0.5)
  })

  test('runs a second band behind the first, and never as heavy', () => {
    const trailing = showerAmount(0.6)

    expect(trailing).toBeGreaterThan(0)
    expect(trailing).toBeLessThan(showerAmount(0.3))
  })

  test('clears between the two bands rather than running them together', () => {
    expect(showerAmount(0.48)).toBe(0)
  })

  test('wraps, so a clock that has been running is a clock at a phase', () => {
    expect(showerAmount(3.3)).toBeCloseTo(showerAmount(0.3), 12)
    expect(showerAmount(-0.7)).toBeCloseTo(showerAmount(0.3), 12)
  })

  test('stays inside the unit range everywhere', () => {
    for (let step = 0; step < 500; step += 1) {
      const amount = showerAmount(step / 500)

      expect(amount).toBeGreaterThanOrEqual(0)
      expect(amount).toBeLessThanOrEqual(1)
    }
  })
})

/** Where a curve over the cycle is at its highest, resolved rather than written down. */
function peak (curve: (phase: number) => number): number {
  let best  = 0
  let where = 0

  for (let step = 0; step < 2_000; step += 1) {
    const phase  = step / 2_000
    const amount = curve(phase)

    if (amount > best) {
      best  = amount
      where = phase
    }
  }

  return where
}

/** Share of the cycle a curve is above nothing for, 0..1. */
function duty (curve: (phase: number) => number): number {
  let wet = 0

  for (let step = 0; step < 2_000; step += 1)
    if (curve(step / 2_000) > 0)
      wet += 1

  return wet / 2_000
}

describe('hailAmount', () => {
  test('comes ahead of the rain, which is the whole of the system', () => {
    expect(peak(hailAmount)).toBeLessThan(peak(showerAmount))

    // Inside its own pulse rather than at a decimal: the top of the curve is
    // flat by construction — a hail shower is at full rate for the minute it
    // lasts — so `peak` reports the first phase that reaches it, not the middle.
    expect(Math.abs(peak(hailAmount) - HAIL_CENTRE)).toBeLessThanOrEqual(HAIL_WIDTH)
  })

  test('is over before the rain is at its hardest', () => {
    expect(showerAmount(0.3)).toBeCloseTo(1, 5)
    expect(hailAmount(0.3)).toBe(0)
  })

  test('falls on the band rather than in the clear spell before it', () => {
    // A pulse that opened ahead of the front would be stones out of a blue sky.
    expect(showerAmount(HAIL_CENTRE)).toBeGreaterThan(0)
  })

  test('is a minority of the cycle, which is what makes it an event', () => {
    expect(duty(hailAmount)).toBeGreaterThan(0.02)
    expect(duty(hailAmount)).toBeLessThan(0.12)
  })

  test('is shorter than the rain it arrives inside', () => {
    expect(duty(hailAmount)).toBeLessThan(duty(showerAmount) * 0.5)
  })

  test('wraps, so a clock that has been running is a clock at a phase', () => {
    expect(hailAmount(HAIL_CENTRE + 4)).toBeCloseTo(hailAmount(HAIL_CENTRE), 12)
    expect(hailAmount(HAIL_CENTRE - 3)).toBeCloseTo(hailAmount(HAIL_CENTRE), 12)
  })

  test('stays inside the unit range everywhere', () => {
    for (let step = 0; step < 500; step += 1) {
      const amount = hailAmount(step / 500)

      expect(amount).toBeGreaterThanOrEqual(0)
      expect(amount).toBeLessThanOrEqual(1)
    }
  })

  test('is there at the phase the config opens on', () => {
    // The same argument `weather.time` is set by: a system that is off in the
    // opening frame is a system nobody looking at the scape finds out it has.
    expect(hailAmount(SCAPE_CONFIG.weather.time)).toBeGreaterThan(0.3)
    expect(Math.abs(SCAPE_CONFIG.weather.time - HAIL_CENTRE)).toBeLessThan(HAIL_WIDTH)
  })
})

describe('hailChill', () => {
  test('is a weight rather than a gate: the fall never goes away entirely', () => {
    for (let step = 0; step <= 100; step += 1)
      expect(hailChill(step / 100)).toBeGreaterThan(0)
  })

  test('is strongest in the shoulder of the year', () => {
    const shoulder = hailChill(0.3)

    expect(shoulder).toBeGreaterThan(hailChill(0))
    expect(shoulder).toBeGreaterThan(hailChill(1))
  })

  test('keeps better than half of itself through high summer', () => {
    expect(hailChill(0)).toBeGreaterThan(0.5)
  })

  test('nearly goes in the deep of winter, where the column delivers snow', () => {
    expect(hailChill(0.85)).toBeLessThan(0.25)
  })

  test('stays inside the unit range everywhere', () => {
    for (let step = -20; step <= 120; step += 1) {
      const weight = hailChill(step / 100)

      expect(weight).toBeGreaterThanOrEqual(0)
      expect(weight).toBeLessThanOrEqual(1)
    }
  })
})

describe('wetAmount', () => {
  test('is never drier than the rain falling on it', () => {
    for (let step = 0; step < 300; step += 1) {
      const phase = step / 300

      expect(wetAmount(phase)).toBeGreaterThanOrEqual(showerAmount(phase))
    }
  })

  test('keeps the ground wet after the fall has stopped', () => {
    // 0.48 is the clear spell between the two bands: nothing is falling, and
    // the ground the first band soaked has had a fraction of a cycle to dry.
    expect(showerAmount(0.48)).toBe(0)
    expect(wetAmount(0.48)).toBeGreaterThan(0.1)
  })

  test('dries out entirely across the long clear spell', () => {
    expect(wetAmount(0.95)).toBe(0)
  })

  test('is a function of the phase alone, so a scrubbed clock and a run one agree', () => {
    expect(wetAmount(1.48)).toBeCloseTo(wetAmount(0.48), 12)
  })
})

describe('createWeather', () => {
  test('falls as rain over a green year and as snow over a white one', () => {
    const weather = createWeather(() => SCAPE_CONFIG)

    expect(weather.sample(0.3, week(0.5)).sleet).toBe(0)
    expect(weather.sample(0.3, week(0)).sleet).toBeGreaterThan(0.8)
  })

  test('takes the wet off the ground as the year freezes it', () => {
    const weather = createWeather(() => SCAPE_CONFIG)
    const summer  = weather.sample(0.3, week(0.5)).wet
    const winter  = weather.sample(0.3, week(0)).wet

    // Not zero, and deliberately: `season.snow` is an authored cover amount, so
    // a midwinter that is 85% white still has a fraction of its ground taking
    // the fall as rain. What must not survive is most of it.
    expect(weather.sample(0.3, week(0)).fall).toBeGreaterThan(0.5)
    expect(winter).toBeLessThan(summer * 0.2)
  })

  test('takes its strength from the config, and is off at zero', () => {
    const dry     = { ...SCAPE_CONFIG, weather: { ...SCAPE_CONFIG.weather, rain: 0 }}
    const weather = createWeather(() => dry)
    const state   = weather.sample(0.3, week(0.5))

    expect(state.fall).toBe(0)
    expect(state.wet).toBe(0)
  })

  test('publishes the hail beside the fall rather than inside it', () => {
    const weather = createWeather(() => SCAPE_CONFIG)
    const state   = weather.sample(HAIL_CENTRE, week(0.5))

    expect(state.hail).toBeGreaterThan(0)
    expect(state.hail).not.toBe(state.fall)
  })

  test('takes the hail to nothing at its own switch and leaves the rain alone', () => {
    const none    = { ...SCAPE_CONFIG, weather: { ...SCAPE_CONFIG.weather, hail: 0 }}
    const weather = createWeather(() => none)
    const state   = weather.sample(HAIL_CENTRE, week(0.5))

    expect(state.hail).toBe(0)
    expect(state.fall).toBeGreaterThan(0)
  })

  test('hails harder in the shoulder of the year than at midsummer', () => {
    const weather  = createWeather(() => SCAPE_CONFIG)
    const summer   = weather.sample(HAIL_CENTRE, week(0.5)).hail
    const shoulder = weather.sample(HAIL_CENTRE, week(0.2)).hail

    expect(shoulder).toBeGreaterThan(summer)
    expect(weather.sample(HAIL_CENTRE, week(0)).hail).toBeLessThan(summer)
  })

  test('reuses one state object rather than allocating per frame', () => {
    const weather = createWeather(() => SCAPE_CONFIG)

    expect(weather.sample(0.2, week(0.5))).toBe(weather.state)
    expect(weather.sample(0.7, week(0.5))).toBe(weather.state)
  })

  test('wraps a phase the clock has run past the end of', () => {
    const weather = createWeather(() => SCAPE_CONFIG)

    expect(weather.sample(2.3, week(0.5)).phase).toBeCloseTo(0.3, 12)
  })
})
