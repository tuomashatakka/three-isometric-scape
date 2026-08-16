import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from './config.ts'
import { createSeason } from './season.ts'
import { createWeather, showerAmount, wetAmount } from './weather.ts'


/** A week of the year, resolved the way the landscape module resolves it. */
function week (phase: number): ReturnType<ReturnType<typeof createSeason>['sample']> {
  return createSeason(SCAPE_CONFIG).sample(phase)
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
    const weather = createWeather(SCAPE_CONFIG)

    expect(weather.sample(0.3, week(0.5)).sleet).toBe(0)
    expect(weather.sample(0.3, week(0)).sleet).toBeGreaterThan(0.8)
  })

  test('takes the wet off the ground as the year freezes it', () => {
    const weather = createWeather(SCAPE_CONFIG)
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
    const weather = createWeather(dry)
    const state   = weather.sample(0.3, week(0.5))

    expect(state.fall).toBe(0)
    expect(state.wet).toBe(0)
  })

  test('reuses one state object rather than allocating per frame', () => {
    const weather = createWeather(SCAPE_CONFIG)

    expect(weather.sample(0.2, week(0.5))).toBe(weather.state)
    expect(weather.sample(0.7, week(0.5))).toBe(weather.state)
  })

  test('wraps a phase the clock has run past the end of', () => {
    const weather = createWeather(SCAPE_CONFIG)

    expect(weather.sample(2.3, week(0.5)).phase).toBeCloseTo(0.3, 12)
  })
})
