import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import type { ScapeConfig } from '../config.ts'
import { dayLength } from '../daylight.ts'
import { surveyArchipelago } from './archipelago.ts'
import {
  carterJourney,
  carterLoads,
  carterSpan,
  planCarterRound,
  planCarterRounds,
  sampleCarterRound,
} from './carter.ts'
import type { CarterSample } from './carter.ts'
import { distanceToTrack } from './layout.ts'


const archipelago = surveyArchipelago(SCAPE_CONFIG)
const knobs       = SCAPE_CONFIG.carter
const rounds      = planCarterRounds(archipelago, 6)

/** The year as the config opens it: midsummer, which is when the road is worked. */
const SUMMER = SCAPE_CONFIG.season.time

function atYear (time: number): ScapeConfig {
  return { ...SCAPE_CONFIG, season: { ...SCAPE_CONFIG.season, time }}
}

function place (distance: number, homeward = false): CarterSample {
  const target: CarterSample = { x: 0, y: 0, z: 0, bearing: 0 }

  return sampleCarterRound(rounds[0], distance, homeward, target)
}

describe('the round', () => {
  test('every island with a track long enough gets one, home island first', () => {
    expect(rounds.length).toBeGreaterThan(0)
    expect(rounds[0].id).toBe(archipelago.home.id)

    for (const round of rounds)
      expect(round.length).toBeGreaterThan(9)
  })

  test('it starts at the yard and ends at the shore', () => {
    for (const round of rounds) {
      const landmass = archipelago.landmasses.find(mass => mass.id === round.id)!
      const { yard } = landmass.survey.layout
      const first    = round.points[0]
      const last     = round.points[round.points.length - 1]

      const toYard = Math.hypot(
        first.x - (yard.x + landmass.origin.x),
        first.z - (yard.z + landmass.origin.z),
      )

      expect(toYard).toBeLessThan(0.001)
      expect(Math.hypot(
        last.x - (yard.x + landmass.origin.x),
        last.z - (yard.z + landmass.origin.z),
      )).toBeGreaterThan(round.length * 0.5)
    }
  })

  test('the marks run from zero to the length, without going backwards', () => {
    for (const round of rounds) {
      expect(round.marks[0]).toBe(0)
      expect(round.marks[round.marks.length - 1]).toBeCloseTo(round.length, 6)

      for (let index = 1; index < round.marks.length; index += 1)
        expect(round.marks[index]).toBeGreaterThanOrEqual(round.marks[index - 1])
    }
  })

  /**
   * The claim the whole run is here to make, as a fact about the data: the cart
   * is on the *track*, which is the ground the ruts were cut into. A cart that
   * wanders a metre off it is a cart that did not make them.
   */
  test('the cart never leaves the road', () => {
    const home                 = archipelago.home
    const round                = rounds[0]
    const target: CarterSample = { x: 0, y: 0, z: 0, bearing: 0 }

    for (let step = 0; step <= 60; step += 1) {
      sampleCarterRound(round, round.length * step / 60, false, target)

      const off = distanceToTrack(
        home.survey.layout,
        target.x - home.origin.x,
        target.z - home.origin.z,
      )

      expect(off).toBeLessThan(0.35)
    }
  })

  test('it is sampled on the ground rather than through it', () => {
    for (let step = 0; step <= 40; step += 1) {
      const at = place(rounds[0].length * step / 40)

      expect(at.y).toBeCloseTo(archipelago.field.heightAt(at.x, at.z), 1)
    }
  })

  test('the distance is clamped at both ends rather than wrapping', () => {
    const before = place(-50)
    const after  = place(rounds[0].length + 50)

    expect(before.x).toBeCloseTo(rounds[0].points[0].x, 6)
    expect(after.x).toBeCloseTo(rounds[0].points[rounds[0].points.length - 1].x, 6)
  })

  test('homeward is the same road, pointed the other way', () => {
    const out  = place(rounds[0].length * 0.5, false)
    const back = place(rounds[0].length * 0.5, true)

    expect(back.x).toBeCloseTo(out.x, 6)
    expect(back.z).toBeCloseTo(out.z, 6)
    expect(Math.cos(back.bearing - out.bearing)).toBeCloseTo(-1, 6)
  })

  test('a track too short to be a journey gets no round', () => {
    const stub = {
      ...archipelago.home,
      survey: {
        ...archipelago.home.survey,
        layout: {
          ...archipelago.home.survey.layout,
          track: { points: [{ x: 0, z: 0 }, { x: 0, z: 4 }], width: 3 },
        },
      },
    }

    expect(planCarterRound(stub, archipelago.field)).toBeNull()
  })

  test('the tier cuts from the far end rather than reshuffling', () => {
    const few = planCarterRounds(archipelago, 2)

    expect(few.map(round => round.id)).toEqual(rounds.slice(0, 2).map(round => round.id))
    expect(planCarterRounds(archipelago, 0)).toEqual([])
  })
})

describe('the working day', () => {
  const span = carterSpan(atYear(SUMMER))

  test('the window is the lit part of the day, capped at the working day', () => {
    expect(span).toBeCloseTo(Math.min(knobs.day, dayLength(
      SUMMER,
      SCAPE_CONFIG.daylight.latitude,
      SCAPE_CONFIG.daylight.axialTilt,
    )), 6)
    expect(span).toBeLessThanOrEqual(knobs.day)
  })

  test('midwinter has nobody on the road, and it is the sun that says so', () => {
    const winter = atYear(0)

    expect(dayLength(0, winter.daylight.latitude, winter.daylight.axialTilt)).toBe(0)
    expect(carterSpan(winter)).toBe(0)
    expect(carterJourney(0.5, carterSpan(winter), rounds[0].length, knobs.reach).out).toBe(false)
  })

  test('a reach of zero is the switch, and it needs no flag beside it', () => {
    expect(carterLoads(span, rounds[0].length, 0)).toBe(0)
    expect(carterJourney(0.5, span, rounds[0].length, 0).out).toBe(false)
  })

  test('a round longer than the day there is, is never set off on', () => {
    // The longest round that fits is the one whose out and back exactly spend
    // the window — the dwell at the far end falls to nothing and the cart turns
    // round on the spot. A hair longer and it would not be home before dark, so
    // it does not go.
    const fits = span * knobs.reach / 2

    expect(carterJourney(0.5, span, fits * 0.999, knobs.reach).out).toBe(true)
    expect(carterJourney(0.5, span, fits * 1.01, knobs.reach).out).toBe(false)
  })

  test('every road the archipelago has is worked at the height of summer', () => {
    for (const round of rounds)
      expect(carterLoads(span, round.length, knobs.reach)).toBeGreaterThanOrEqual(1)
  })

  test('nobody is out before the window opens or after it shuts', () => {
    const length = rounds[0].length
    const opens  = 0.5 - span / 2

    expect(carterJourney(opens - 0.01, span, length, knobs.reach).out).toBe(false)
    expect(carterJourney(opens + 0.01, span, length, knobs.reach).out).toBe(true)
    expect(carterJourney(0.5 + span / 2 + 0.01, span, length, knobs.reach).out).toBe(false)
  })

  test('a load is legs out, a stand at the shore, and legs home', () => {
    const length = rounds[0].length
    const travel = length * 2 / knobs.reach
    const loads  = carterLoads(span, length, knobs.reach)
    const slot   = span / loads
    const opens  = 0.5 - span / 2
    const at     = (into: number) => carterJourney(opens + into, span, length, knobs.reach)

    const leaving  = at(travel * 0.25)
    const standing = at(travel / 2 + (slot - travel) / 2)
    const coming   = at(slot - travel * 0.25)

    expect(leaving).toMatchObject({ out: true, moving: true, homeward: false })
    expect(leaving.distance).toBeGreaterThan(0)
    expect(leaving.distance).toBeLessThan(length)

    expect(standing).toMatchObject({ out: true, moving: false, homeward: false })
    expect(standing.distance).toBeCloseTo(length, 6)

    expect(coming).toMatchObject({ out: true, moving: true, homeward: true })
    expect(coming.distance).toBeGreaterThan(0)
    expect(coming.distance).toBeLessThan(length)
  })

  /**
   * The claim a single journey a day could not make. A short road is worked
   * several times over, and the test is that the second load is the first one
   * again rather than a second half of it — the cart is back at the door in
   * between, not standing at the shore all afternoon.
   */
  test('a short road is worked as many times as the day will take', () => {
    const short = span * knobs.reach / 8
    const loads = carterLoads(span, short, knobs.reach)
    const opens = 0.5 - span / 2
    const slot  = span / loads

    expect(loads).toBeGreaterThan(1)

    for (let load = 0; load < loads; load += 1) {
      const door = carterJourney(opens + slot * load, span, short, knobs.reach)
      const away = carterJourney(opens + slot * load + slot / 2, span, short, knobs.reach)

      expect(door.distance).toBeCloseTo(0, 6)
      expect(away.distance).toBeGreaterThan(short * 0.5)
    }
  })

  test('a road that only just fits is worked once and stands about not at all', () => {
    const long = span * knobs.reach / 2 * 0.999

    expect(carterLoads(span, long, knobs.reach)).toBe(1)
    expect(carterLoads(span, long * 1.01, knobs.reach)).toBe(0)
  })

  test('it leaves from the door and is back at it before the window shuts', () => {
    const length = rounds[0].length
    const opens  = 0.5 - span / 2
    const shuts  = 0.5 + span / 2

    expect(carterJourney(opens, span, length, knobs.reach).distance).toBeCloseTo(0, 6)
    expect(carterJourney(shuts, span, length, knobs.reach).distance).toBeCloseTo(0, 6)
  })

  /**
   * The two hours `--poses cart` names, stated as arithmetic. They are the one
   * pair the window can get wrong: a phase written down as a decimal and the
   * boundary derived from `span` differ in the last bit — `0.81 - 0.19` is
   * `0.6200000000000001` against a span of `0.62` — and before the tolerance
   * went in, the frame built to show the cart at the door photographed an empty
   * road and reported `same`.
   */
  test('the hour the window opens and the hour it shuts both have a cart in them', () => {
    const length = rounds[0].length

    expect(span).toBeCloseTo(0.62, 6)

    const dawn = carterJourney(0.19, span, length, knobs.reach)
    const dusk = carterJourney(0.81, span, length, knobs.reach)

    expect(dawn.out).toBe(true)
    expect(dawn.distance).toBeCloseTo(0, 6)
    expect(dawn.homeward).toBe(false)

    expect(dusk.out).toBe(true)
    expect(dusk.distance).toBeCloseTo(0, 6)

    // And it is facing the house at the end of the day rather than setting off
    // on a load it will never finish.
    expect(dusk.homeward).toBe(true)
  })

  test('a minute either side of the window is a road with nobody on it', () => {
    const length = rounds[0].length

    expect(carterJourney(0.19 - 0.001, span, length, knobs.reach).out).toBe(false)
    expect(carterJourney(0.81 + 0.001, span, length, knobs.reach).out).toBe(false)
  })

  test('the round stops at the top of the beach rather than in the sea', () => {
    const dry = SCAPE_CONFIG.terrain.waterLevel

    for (const round of rounds)
      for (const point of round.points)
        expect(point.y).toBeGreaterThan(dry)
  })

  test('the outward leg only ever goes forward, and the homeward leg only back', () => {
    const length = rounds[0].length
    const travel = length * 2 / knobs.reach
    const opens  = 0.5 - span / 2
    const slot   = span / carterLoads(span, length, knobs.reach)

    let previous = -1

    for (let step = 0; step <= 30; step += 1) {
      const now = carterJourney(opens + travel * 0.5 * step / 30, span, length, knobs.reach)

      expect(now.distance).toBeGreaterThanOrEqual(previous)
      previous = now.distance
    }

    previous = length + 1

    for (let step = 0; step <= 30; step += 1) {
      const time = opens + slot - travel * 0.5 + travel * 0.5 * step / 30
      const now  = carterJourney(time, span, length, knobs.reach)

      expect(now.distance).toBeLessThanOrEqual(previous)
      previous = now.distance
    }
  })

  test('the window never wraps past midnight, whatever the ceiling is asked for', () => {
    for (const day of [ 0.5, 0.94, 1, 4 ]) {
      const wide = carterSpan({ ...atYear(0.5), carter: { ...knobs, day }})

      expect(wide).toBeLessThanOrEqual(0.94)
      expect(0.5 - wide / 2).toBeGreaterThanOrEqual(0)
    }
  })

  test('the same hour of the same week puts the cart in the same place', () => {
    const first  = carterJourney(0.42, span, rounds[0].length, knobs.reach)
    const second = carterJourney(0.42, span, rounds[0].length, knobs.reach)

    expect(first).toEqual(second)
  })
})
