import { describe, expect, test } from 'bun:test'
import { phosphorAmount, trackAmount } from './water-gleam.ts'


/**
 * The two halves of a dark sea, stated as facts about the numbers.
 *
 * Every claim the run makes about them is a claim a still cannot check: a night
 * frame with no track in it and a night frame with no fire in it are the same
 * black rectangle, and so is a night frame that has neither because the sky
 * never had either.
 */
describe('trackAmount', () => {
  test('leaves daylight exactly as it found it, at any share', () => {
    // The moon puts nothing on a coast the sun is up over, so the share has
    // nothing to scale and the sun's own path is the path it always was. This
    // is the claim behind every `same` the daylight poses report.
    for (const share of [ 0, 1, 3.2, 40 ])
      expect(trackAmount(1, 0, share)).toBe(1)

    expect(trackAmount(0.4, 0, 3.2)).toBeCloseTo(0.4, 12)
  })

  test('is the sea this scape had before it at a share of zero', () => {
    for (const [ day, moon ] of [[ 0, 0.16 ], [ 0.2, 0.08 ], [ 0, 0 ]])
      expect(trackAmount(day, moon, 0)).toBeCloseTo(day, 12)
  })

  test('gives a moonless night nothing, however the moonlessness came about', () => {
    // A moon under the sea, a new moon and `daylight.moonStrength: 0` all reach
    // here as the same zero — which is the point of taking `DaylightState.moon`
    // rather than the phase and a knob.
    expect(trackAmount(0, 0, 3.2)).toBe(0)
  })

  test('rises with the moon, and the share is what decides how far', () => {
    const faint = trackAmount(0, 0.03, 10)
    const full  = trackAmount(0, 0.12, 10)

    expect(faint).toBeGreaterThan(0)
    expect(full).toBeGreaterThan(faint)

    // Deliberately allowed past a full sun's own path: the glitter term is
    // worth about nineteen levels of 255 at its maximum on this camera, so a
    // budget clamped at 1 clamps the moon at a sheen.
    expect(trackAmount(0, 0.128, 10)).toBeGreaterThan(1)
  })
})

describe('phosphorAmount', () => {
  test('is off through the daylight half of the cycle', () => {
    // `dark` is the astronomical-twilight gate, which is 0 from the moment the
    // sun touches the horizon — so this needs no curve of its own.
    expect(phosphorAmount(0, 0, 0.5)).toBe(0)
  })

  test('has one switch and it reaches zero', () => {
    expect(phosphorAmount(1, 0, 0)).toBe(0)
  })

  test('burns hardest on the darkest, moonless night', () => {
    expect(phosphorAmount(1, 0, 0.5)).toBeCloseTo(0.5, 12)
  })

  test('is quenched by the moon, and out entirely under a bright one', () => {
    const gibbous = phosphorAmount(1, 0.07, 0.5)

    expect(gibbous).toBeGreaterThan(0)
    expect(gibbous).toBeLessThan(phosphorAmount(1, 0, 0.5))
    expect(phosphorAmount(1, 0.16, 0.5)).toBe(0)
  })

  test('hands the night from one to the other, and never both at once', () => {
    // The coupling the module is built on, walked across a lunation's worth of
    // moonlight at the authored settings: whatever the moon buys the track it
    // takes from the fire, so the two move in opposite directions and neither
    // is ever much past halfway while the other still has anything.
    let lastTrack = -1
    let lastFire  = Number.POSITIVE_INFINITY

    for (let i = 0; i <= 20; i++) {
      const moon  = i / 20 * 0.16
      const track = trackAmount(0, moon, 10)
      const fire  = phosphorAmount(1, moon, 0.5)

      expect(track).toBeGreaterThanOrEqual(lastTrack)
      expect(fire).toBeLessThanOrEqual(lastFire)
      expect(Math.min(track, fire / 0.5)).toBeLessThanOrEqual(0.6)

      lastTrack = track
      lastFire  = fire
    }
  })
})
