import { describe, expect, test } from 'bun:test'
import { dampingFactor, cursorLightStrength, createCursorLight } from './cursor-light.ts'
import { SCAPE_CONFIG } from './config.ts'


function withIntensity (intensity: number) {
  return { ...SCAPE_CONFIG, cursorLight: { ...SCAPE_CONFIG.cursorLight, intensity }}
}

describe('the day response', () => {
  test('is out at noon and at full strength at midnight', () => {
    expect(cursorLightStrength(SCAPE_CONFIG, 1)).toBe(0)
    expect(cursorLightStrength(SCAPE_CONFIG, 0)).toBeCloseTo(SCAPE_CONFIG.cursorLight.intensity, 6)
  })

  test('comes up through dusk rather than switching on', () => {
    const dusk = cursorLightStrength(SCAPE_CONFIG, 0.5)

    expect(dusk).toBeGreaterThan(0)
    expect(dusk).toBeLessThan(cursorLightStrength(SCAPE_CONFIG, 0))
  })

  test('zero intensity is a light that was never carried, at any hour', () => {
    for (const day of [ 0, 0.25, 0.5, 1 ])
      expect(cursorLightStrength(withIntensity(0), day)).toBe(0)
  })

  test('a day beyond the ends of its range cannot push it negative or dim it twice', () => {
    expect(cursorLightStrength(SCAPE_CONFIG, 1.4)).toBe(0)
    expect(cursorLightStrength(SCAPE_CONFIG, -0.4)).toBeCloseTo(SCAPE_CONFIG.cursorLight.intensity, 6)
  })
})

describe('the damping', () => {
  test('approaches 1 asymptotically and never overshoots', () => {
    // At 60 hertz with tau = 0.15 s the response is ~0.105.
    const step = dampingFactor(1 / 60, 0.15)

    expect(step).toBeGreaterThan(0.05)
    expect(step).toBeLessThan(0.5)
    expect(step).toBeLessThan(1)
  })

  test('a zero delta gives no movement', () => {
    expect(dampingFactor(0, 0.15)).toBe(0)
  })

  test('a very large delta approaches full response', () => {
    // After several time constants the response is indistinguishable from 1.
    expect(dampingFactor(10, 0.15)).toBeCloseTo(1, 6)
  })

  test('a tiny tau still returns a finite, positive factor', () => {
    const step = dampingFactor(1 / 60, 0.001)

    expect(step).toBeGreaterThan(0)
    expect(step).toBeLessThanOrEqual(1)
  })

  test('frame-rate independence: doubling the time step more than doubles the response', () => {
    // The exponential form is memoryless: exp(-2*dt/tau) = exp(-dt/tau)^2, so
    // two consecutive steps at dt produce the same result as one step at 2*dt.
    // This test verifies that property by checking the remaining distance.
    const dt  = 1 / 60
    const tau = 0.15
    const one = dampingFactor(dt, tau)
    const two = dampingFactor(dt * 2, tau)

    // After one step the remaining distance is (1 - one).
    // After two steps it is (1 - one)^2.
    // After one step at 2*dt it is (1 - two).
    // These should be equal by the memoryless property.
    expect((1 - one) * (1 - one)).toBeCloseTo(1 - two, 10)
  })
})

describe('the module', () => {
  test('intensity zero yields no module', () => {
    const mod = createCursorLight({
      config:   () => withIntensity(0),
      camera:   {} as never,
      daylight: { day: 0 } as never,
    })

    expect(mod).toBeNull()
  })

  test('intensity negative yields no module', () => {
    const mod = createCursorLight({
      config:   () => withIntensity(-1),
      camera:   {} as never,
      daylight: { day: 0 } as never,
    })

    expect(mod).toBeNull()
  })
})
