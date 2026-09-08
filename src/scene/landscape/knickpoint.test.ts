import { describe, expect, test } from 'bun:test'
import { stepEase, stepProfile } from './knickpoint.ts'
import type { StepOptions } from './knickpoint.ts'


/**
 * A hillside long profile with nothing special in it.
 *
 * Twenty points falling half a metre each, which at the archipelago's own 2.4 m
 * of point spacing is a slack hill beck — no step anywhere, and no reach the
 * search has any reason to prefer over its neighbours. The claims below are about
 * what happens *to* it, so a featureless input is the honest control.
 *
 * Slack rather than steep on purpose. A window that already falls eight metres
 * has nothing a two metre step can add to it, and the arithmetic says so: the
 * face ends up taking barely more than the reaches either side of it. That is the
 * right answer and it makes for a test that proves nothing.
 */
const EVEN = Array.from({ length: 20 }, (_unused, at) => 40 - at * 0.5)

/**
 * The same hill with a band of hard rock in it.
 *
 * One interval falls a metre and a half where every other one falls half, which
 * is what the search is written to find. It is a separate fixture rather than a
 * tweak of {@link EVEN} because the two claims are different: an even profile
 * says the step can be cut anywhere, and this one says it lands where the ground
 * already says it should.
 */
const BANDED = EVEN.map((level, at) => level - (at > 8 ? 1 : 0))

const OPTIONS: StepOptions = {
  drop:    2.2,
  run:     1.2,
  gather:  9,
  least:   0.7,
  spacing: 2.4,
  above:   -1_000,
  cut:     1.35,
}

/** Every interval of a profile, as the fall across it. */
function falls (profile: readonly number[]): number[] {
  return profile.slice(1).map((level, at) => profile[at] - level)
}


describe('stepProfile', () => {
  test('is the identity when there is no drop to gather', () => {
    const { profile, step } = stepProfile(EVEN, EVEN, { ...OPTIONS, drop: 0 })

    expect(profile).toEqual(EVEN)
    expect(step).toBeNull()
  })

  test('leaves both ends of the course exactly where it found them', () => {
    const { profile } = stepProfile(EVEN, EVEN, OPTIONS)

    expect(profile[0]).toBe(EVEN[0])
    expect(profile.at(-1)).toBe(EVEN.at(-1))
  })

  // The claim the whole module rests on. The mouth's height is what the tidal
  // dredge, the bathymetry mask and every search that keeps clear of the estuary
  // are written against, so a step that moved the total fall would move all of
  // them — and `scape:map` would report six identical islands while every one of
  // them had quietly changed.
  test('preserves the total fall of the course', () => {
    const { profile } = stepProfile(EVEN, EVEN, OPTIONS)

    expect(profile[0] - profile.at(-1)!).toBeCloseTo(EVEN[0] - EVEN.at(-1)!, 10)
  })

  test('never lets the bed run uphill', () => {
    const { profile } = stepProfile(EVEN, EVEN, OPTIONS)

    for (const fall of falls(profile))
      expect(fall).toBeGreaterThanOrEqual(-1e-9)
  })

  test('gathers the fall into one interval and slackens the rest', () => {
    const { profile, step } = stepProfile(EVEN, EVEN, OPTIONS)
    const cut               = falls(profile)

    expect(step).not.toBeNull()
    expect(cut[step!.index]).toBeCloseTo(step!.drop, 10)

    // The reach above the lip and the tail below it both fall at the slack rate,
    // which is what makes the step read as a step rather than as one steep metre
    // on an already steep hill.
    expect(cut[step!.index - 1]).toBeLessThan(step!.drop * 0.5)
    expect(cut[step!.index + 1]).toBeLessThan(step!.drop * 0.5)
  })

  test('puts the face where the ground already refuses to grade', () => {
    const { step } = stepProfile(BANDED, BANDED, OPTIONS)

    expect(step?.index).toBe(8)
  })

  // The bug this test is here for: gathering a window's fall lifts the reach
  // above the face, and `height.ts` clamps a bed raised past the ground it was
  // cut into. Before the ceiling was solved, the sound's fall was asked for
  // 1.9 m and drawn at 0.83.
  test('never lifts the reach above the face out of its own channel', () => {
    const { profile, step } = stepProfile(BANDED, BANDED, OPTIONS)

    expect(step).not.toBeNull()

    for (let at = 0; at < profile.length; at += 1)
      expect(profile[at] - BANDED[at]).toBeLessThanOrEqual(OPTIONS.cut + 1e-9)
  })

  test('keeps the step clear of the water', () => {
    // The tideline set above the whole lower half of the course, so every window
    // that would otherwise have been chosen is under it.
    const { step } = stepProfile(EVEN, EVEN, { ...OPTIONS, above: 35 })

    expect(step).not.toBeNull()
    expect(EVEN[step!.index + step!.span]).toBeGreaterThan(35)
  })

  test('declines a course with no fall to spare', () => {
    const flat = Array.from({ length: 20 }, (_unused, at) => 4 - at * 0.02)

    expect(stepProfile(flat, flat, OPTIONS).step).toBeNull()
  })

  test('declines a course too short to hold a window', () => {
    expect(stepProfile([ 4, 3, 2 ], [ 4, 3, 2 ], OPTIONS).step).toBeNull()
  })

  test('is byte-for-byte stable for one profile', () => {
    const once  = stepProfile(BANDED, BANDED, OPTIONS)
    const again = stepProfile(BANDED, BANDED, OPTIONS)

    expect(again.profile).toEqual(once.profile)
    expect(again.step).toEqual(once.step)
  })
})

describe('stepEase', () => {
  const step = { index: 4, span: 1, drop: 2, tighten: 0.5 }

  test('is the identity outside the face', () => {
    expect(stepEase(step, 3, 0.25)).toBe(0.25)
    expect(stepEase(step, 5, 0.75)).toBe(0.75)
    expect(stepEase(null, 4, 0.4)).toBe(0.4)
  })

  test('holds the lip level and the foot level flat', () => {
    expect(stepEase(step, 4, 0.1)).toBe(0)
    expect(stepEase(step, 4, 0.9)).toBe(1)
  })

  test('spends the whole drop inside the run it was asked for', () => {
    expect(stepEase(step, 4, 0.25)).toBeCloseTo(0, 6)
    expect(stepEase(step, 4, 0.5)).toBeCloseTo(0.5, 6)
    expect(stepEase(step, 4, 0.75)).toBeCloseTo(1, 6)
  })

  test('is the identity at zero tighten', () => {
    const ramp = { ...step, tighten: 0 }

    expect(stepEase(ramp, 4, 0.3)).toBeCloseTo(0.3, 10)
  })
})
