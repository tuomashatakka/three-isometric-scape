import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { causticStrength } from './water-caustics.ts'
import { sunHeight } from '../daylight.ts'


const { caustics }            = SCAPE_CONFIG.water
const { latitude, axialTilt } = SCAPE_CONFIG.daylight

/** Sine of the sun's elevation at an hour of a week, at this coast's latitude. */
const height = (time: number, year: number): number =>
  sunHeight(time, year, latitude, axialTilt)

const MIDSUMMER = 0.5
const MIDWINTER = 0.02
const AUTUMN    = 0.78

const NOON     = 0.5
const MIDNIGHT = 0.02


describe('the light that reaches the bottom', () => {
  test('the authored strength is the switch, and it is the only one', () => {
    expect(causticStrength(0, 1, 0)).toBe(0)

    // Not merely small at every hour of every week — exactly nothing, so the
    // shader's early-out is reachable rather than aspirational.
    for (const year of [ MIDWINTER, 0.25, MIDSUMMER, AUTUMN ])
      for (let hour = 0; hour < 1; hour += 0.05)
        expect(causticStrength(0, height(hour, year), 0)).toBe(0)
  })

  test('a sun under the horizon draws no net', () => {
    expect(causticStrength(caustics, height(MIDNIGHT, AUTUMN), 0)).toBe(0)
    expect(causticStrength(caustics, -1, 0)).toBe(0)
    expect(causticStrength(caustics, 0, 0)).toBe(0)
  })

  /**
   * The claim the whole effect rests on, as a fact about the arc.
   *
   * The scape's sun is solved from a latitude and an axial tilt rather than
   * keyframed, and this coast is far enough north that midwinter noon has the
   * sun *under* the horizon. So the winter frames get no caustics without a
   * seasonal knob having been written for them — which is the reason there
   * isn't one.
   */
  test('the polar night gets none of it, and midsummer noon gets all of it', () => {
    expect(height(NOON, MIDWINTER)).toBeLessThan(0)
    expect(causticStrength(caustics, height(NOON, MIDWINTER), 0)).toBe(0)

    expect(height(NOON, MIDSUMMER)).toBeGreaterThan(0)
    expect(causticStrength(caustics, height(NOON, MIDSUMMER), 0)).toBeCloseTo(caustics, 6)
  })

  test('it comes up with the sun rather than switching on at the horizon', () => {
    const climb = [ 0.02, 0.06, 0.1, 0.2, 0.32, 0.5 ]
      .map(sun => causticStrength(caustics, sun, 0))

    for (let index = 1; index < climb.length; index += 1)
      expect(climb[index]).toBeGreaterThanOrEqual(climb[index - 1])

    // Strictly between the two ends: a ramp, not a step.
    expect(climb[0]).toBeGreaterThan(0)
    expect(climb[0]).toBeLessThan(caustics)
    expect(climb.at(-1)).toBeCloseTo(caustics, 6)
  })

  test('rain dims the net without putting it out', () => {
    const dry    = causticStrength(caustics, 1, 0)
    const shower = causticStrength(caustics, 1, 0.5)
    const deluge = causticStrength(caustics, 1, 1)

    expect(shower).toBeLessThan(dry)
    expect(deluge).toBeLessThan(shower)
    expect(deluge).toBeGreaterThan(0)
  })

  test('it is clamped against a fall outside 0..1 rather than going negative', () => {
    expect(causticStrength(caustics, 1, 4)).toBe(causticStrength(caustics, 1, 1))
    expect(causticStrength(caustics, 1, -3)).toBe(causticStrength(caustics, 1, 0))
  })

  test('the same arguments give the same answer', () => {
    const once  = causticStrength(caustics, height(NOON, AUTUMN), 0.3)
    const again = causticStrength(caustics, height(NOON, AUTUMN), 0.3)

    expect(once).toBe(again)
  })
})
