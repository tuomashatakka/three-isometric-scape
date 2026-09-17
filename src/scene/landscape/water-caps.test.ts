import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { WATER_CAPS_GLSL, capsAmount } from './water-caps.ts'


const { whitecap, whitecapOnset, whitecapLee } = SCAPE_CONFIG.water
const { surfExposure }                         = SCAPE_CONFIG.water
const { strength, gust }                       = SCAPE_CONFIG.wind

/** The hardest the gust front can drive the authored wind. See `wind.ts`. */
const GUSTING = strength * (1 + gust)


describe('the white the open sea puts on', () => {
  test('the authored coverage is the switch, and it is the only one', () => {
    // Not merely small at every wind — exactly nothing, so the shader's
    // early-out is reachable rather than aspirational.
    for (let wind = 0; wind <= 3; wind += 0.05)
      expect(capsAmount(0, whitecapOnset, wind)).toBe(0)

    expect(capsAmount(-1, whitecapOnset, GUSTING)).toBe(0)
  })

  /**
   * The claim `HELD` exists to make, stated as a fact about the curve.
   *
   * `STILL` zeroes `wind.strength` by definition, so a capture is taken in a
   * dead calm — and the surf is nonetheless held at three quarters of its
   * authored break, because a still of this scape is a photograph of a coast
   * with a sea running on it. A sound that went glassy at the same instant
   * every beach in the frame was tripping would be claiming the wind died
   * between the shore and the water.
   */
  test('a still is not a dead calm, and there is white in it', () => {
    const calm = capsAmount(whitecap, whitecapOnset, 0)

    expect(calm).toBeGreaterThan(0)
    expect(calm).toBeLessThan(capsAmount(whitecap, whitecapOnset, GUSTING))
  })

  test('it rises with the wind and stops at the onset', () => {
    let previous = capsAmount(whitecap, whitecapOnset, 0)

    for (let wind = 0.05; wind <= whitecapOnset; wind += 0.05) {
      const now = capsAmount(whitecap, whitecapOnset, wind)

      expect(now).toBeGreaterThanOrEqual(previous)
      previous = now
    }

    // Above the onset the sea is fully capped and a harder wind adds nothing,
    // which is what stops a gust front flashing the sound white.
    const full = capsAmount(whitecap, whitecapOnset, whitecapOnset)

    expect(capsAmount(whitecap, whitecapOnset, whitecapOnset * 2)).toBeCloseTo(full, 10)
    expect(capsAmount(whitecap, whitecapOnset, 40)).toBeCloseTo(full, 10)
    expect(full).toBeCloseTo(whitecap, 10)
  })

  /**
   * The ordering the section is tuned on, rather than a coincidence of two
   * numbers: the resting sea has to sit below the onset, or the gust front
   * crosses water that has nothing left to answer it with.
   */
  test('the authored wind leaves the gust somewhere to go', () => {
    const resting = capsAmount(whitecap, whitecapOnset, strength)

    // The *gusted* strength, and not the authored one: the front is already on
    // the water at the wind this scape is authored at, so an onset that only
    // clears `wind.strength` is an onset the front is past before it starts.
    // At 1.25 against 0.9 the sound was saturated at rest and `--poses blow`
    // came out identical to the byte at 0.9 and at 2.4.
    expect(GUSTING).toBeLessThan(whitecapOnset)
    expect(capsAmount(whitecap, whitecapOnset, GUSTING)).toBeGreaterThan(resting)
    expect(capsAmount(whitecap, whitecapOnset, GUSTING * 2)).toBeGreaterThan(
      capsAmount(whitecap, whitecapOnset, GUSTING),
    )
  })

  test('no onset means no threshold, not a division by zero', () => {
    expect(capsAmount(whitecap, 0, 0)).toBeCloseTo(whitecap, 10)
    expect(Number.isFinite(capsAmount(whitecap, 0, 4))).toBe(true)
  })
})

/**
 * The cost of this system, stated where a refactor has to walk past it.
 *
 * One dependent read, which takes the cheap lake from two to three — and the
 * lee has to come off the mask fetch the caller already made rather than a
 * probe of its own, so a second `scapeShore` in here is the phone's budget
 * going again.
 */
describe('the chunk', () => {
  test('it takes exactly one texture read, and does not probe the mask', () => {
    expect(WATER_CAPS_GLSL.match(/texture2D/g)).toHaveLength(1)
    expect(WATER_CAPS_GLSL).not.toContain('scapeShore')
  })

  test('the lee is the surf\'s own baked bearing, read the other way up', () => {
    expect(WATER_CAPS_GLSL).toContain('shore.gb')
    expect(WATER_CAPS_GLSL).toContain('uCapsLee')

    // Both are shares of the same baked bearing, and the wind has raised less
    // sea behind a hill than a swell refracting round a headland has lost — so
    // the caps spare the lee harder than the surf does. Stated here because the
    // two numbers live in different sections and nothing else would notice them
    // crossing over.
    expect(whitecapLee).toBeGreaterThan(surfExposure)
    expect(whitecapLee).toBeLessThanOrEqual(1)
  })

  test('its phase is the wind travel every scrolling surface shares', () => {
    expect(WATER_CAPS_GLSL).toContain('uSurgePhase')

    // Never raw elapsed seconds: a cap field on `uWaveTime` cannot be stopped,
    // so it would be somewhere else in every frame of a capture.
    expect(WATER_CAPS_GLSL).not.toContain('uWaveTime')
  })
})
