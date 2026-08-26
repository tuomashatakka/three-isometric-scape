import { describe, expect, test } from 'bun:test'
import { readPath } from 'threejs-scene'
import { SCAPE_CONFIG } from '../src/scene/config.ts'
import { atmosphereQuality } from '../src/scene/quality.ts'
import { controlPaths, createScapeControls } from '../src/ui/scape-controls.ts'
import type { Pose } from './scape-shot.ts'
import { STILL, TOURS } from './scape-shot.ts'


/**
 * The house rule that costs the most when it is forgotten, as a test.
 *
 * "Anything that moves needs a speed that can reach zero, and that speed goes
 * in `STILL`" is load-bearing and unenforceable by reading: a rate that is not
 * in `STILL` cannot be stopped, so it cannot be captured, so it silently
 * poisons every visual diff taken after it lands — and it poisons them in the
 * *reference* build too, which is what makes it so hard to spot from the table.
 *
 * The candidates are read off the overlay rather than off the config, and that
 * is the whole trick. The overlay is the authoritative "visual and read per
 * frame" set, because the house rule already requires a knob to be in it if and
 * only if that is true of it. A build-time knob is not in the panel and does not
 * need stopping; a per-frame one is, and does.
 *
 * The ultra tier is used because it is the richest — a knob gated off on mobile
 * still has to be reproducible on the tier that has it.
 */

/**
 * What a rate looks like in a name.
 *
 * Names, not doc comments: `wind.strength` carries no comment at all, and a
 * lexicon read out of prose would have missed it silently.
 */
const RATE = /(speed|spin|fall|rate|turn|drift|scroll|flicker)$/i

/**
 * Names that read as a rate and are not one, each with why.
 *
 * The alternative to declaring these is loosening the pattern, and a pattern
 * with holes in it stops being a guarantee. An entry here is a claim that
 * somebody looked.
 */
const NOT_A_RATE: Record<string, string> = {
  // The turn of the *year*, not a rate of turning: 0..1 for how hard the season
  // withers what is green. What it scales is a tint derived from `season.time`,
  // and that phase is pinned per pose by `--season`.
  'season.turn': 'an amount, 0..1 — the year turning, not a rate',
}

/**
 * Amplitudes that gate motion rather than timing it.
 *
 * These do not match `RATE` and never will, so nothing would notice them going
 * missing. They are the reason a still is still: zero here stops the thing that
 * a rate would otherwise be moving.
 */
const GATES_MOTION = [ 'wind.strength', 'water.waveHeight' ]

const stillPaths = new Set(STILL.map(entry => entry.split('=')[0]))

describe('STILL covers everything the overlay can animate', () => {
  const live = controlPaths(createScapeControls(atmosphereQuality('ultra')))

  test('the overlay is the set this is derived from, and it is not empty', () => {
    // If this ever collapses, every assertion below passes vacuously.
    expect(live.length).toBeGreaterThan(40)
  })

  test('every rate the overlay exposes is stopped', () => {
    const rates  = live.filter(path => RATE.test(path) && !(path in NOT_A_RATE))
    const missed = rates.filter(path => !stillPaths.has(path))

    // Named so a failure says which knob, not just that one is missing.
    expect(rates.length).toBeGreaterThan(6)
    expect(missed).toEqual([])
  })

  test('every declared non-rate really is in the overlay', () => {
    // A stale exception is a hole. If a knob is renamed or dropped, its excuse
    // has to go with it rather than quietly covering some future knob.
    for (const path of Object.keys(NOT_A_RATE))
      expect(live).toContain(path)
  })

  test('every amplitude that gates motion is stopped', () => {
    for (const path of GATES_MOTION) {
      expect(live).toContain(path)
      expect(stillPaths.has(path)).toBe(true)
    }
  })
})

describe('STILL says what it means', () => {
  // The other half of the trap, and the quieter one: a rename on the config
  // side turns a STILL entry into a no-op that still reads as coverage. Nothing
  // fails, nothing warns, and every capture after it has a clock running in it.
  test('every entry addresses a live config path', () => {
    const dead = STILL
      .map(entry => entry.split('=')[0])
      .filter(path => readPath(SCAPE_CONFIG, path) === undefined)

    expect(dead).toEqual([])
  })

  test('every entry addresses a number, and sets it to zero', () => {
    for (const entry of STILL) {
      const [ path, value ] = entry.split('=')

      expect(typeof readPath(SCAPE_CONFIG, path)).toBe('number')
      expect(value).toBe('0')
    }
  })

  test('no entry is listed twice', () => {
    expect(stillPaths.size).toBe(STILL.length)
  })
})

describe('the tour poses', () => {
  // Captured a white frame once: at 68°N the default midsummer year has no
  // night in it, so a pose asking for an hour without also asking for a week
  // gets full daylight and reads as a broken capture rather than a wrong pose.
  test('night pins a week as well as an hour', () => {
    const night = TOURS.tour?.find(pose => pose.name === 'night')

    expect(night?.time).toBeDefined()
    expect(night?.season).toBeDefined()
  })

  test('the tour still covers both zoom extremes and the year', () => {
    const names = TOURS.tour?.map(pose => pose.name) ?? []

    expect(names).toEqual([ 'default', 'near', 'far', 'noon', 'night', 'winter' ])
  })
})

describe('the coast poses', () => {
  const coast = TOURS.coast ?? []

  /**
   * The claim the set exists to photograph, as a fact about the poses.
   *
   * `wash` and `lee` are only worth a browser launch if they differ by the wind
   * and by *nothing else* — a pair that also moved the camera, the hour or the
   * week would show a difference that says nothing about which shore the sea is
   * running at.
   */
  test('the weather side and the lee are the same frame, and differ only by the wind', () => {
    const wash = coast.find(pose => pose.name === 'wash')
    const lee  = coast.find(pose => pose.name === 'lee')

    expect(wash?.zoom).toBe(lee?.zoom)
    expect(wash?.rot).toBe(lee?.rot)
    expect(wash?.time).toBe(lee?.time)
    expect(wash?.season).toBe(lee?.season)

    const bearings = (pose?: Pose): string[] =>
      (pose?.set ?? []).filter(entry => entry.startsWith('wind.bearing='))

    expect(bearings(wash)).toEqual([])
    expect(bearings(lee)).toHaveLength(1)

    const shared = (pose?: Pose): string[] =>
      (pose?.set ?? []).filter(entry => !entry.startsWith('wind.bearing='))

    expect(shared(wash)).toEqual(shared(lee))
  })

  test('every pose in it is aimed at a coast rather than at the middle of the world', () => {
    // The whole reason the set exists: `tour` looks at (0, 0) from every pose,
    // and a shoreline effect is a hairline from all six.
    for (const pose of coast)
      expect((pose.set ?? []).some(entry => entry.startsWith('camera.focus'))).toBe(true)
  })

  test('one of them is the winter, where the ice is meant to take the surf away', () => {
    expect(coast.some(pose => (pose.season ?? 1) < 0.1)).toBe(true)
  })
})
