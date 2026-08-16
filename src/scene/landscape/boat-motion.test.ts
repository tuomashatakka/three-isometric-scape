import { describe, expect, test } from 'bun:test'
import {
  advanceFleetSchedule,
  createFleetSchedule,
  longestWaterwayLeg,
  sampleScheduledBoat,
  shortestAngleDelta,
  turnToward,
} from './boat-motion.ts'
import type { ScheduledBoatSample } from './boat-motion.ts'
import type { WaterwayRoute } from './waterway.ts'


const diagonal             = Math.hypot(10, 20)
const route: WaterwayRoute = {
  legs: [
    {
      from:   'a',
      to:     'b',
      points: [{ x: 0, z: 0 }, { x: 10, z: 0 }],
      length: 10,
    },
    {
      from:   'b',
      to:     'c',
      points: [{ x: 10, z: 0 }, { x: 10, z: 20 }],
      length: 20,
    },
    {
      from:   'c',
      to:     'a',
      points: [{ x: 10, z: 20 }, { x: 0, z: 0 }],
      length: diagonal,
    },
  ],
  points: [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    { x: 10, z: 20 },
    { x: 0, z: 0 },
  ],
  cumulative:    [ 0, 10, 30, 30 + diagonal ],
  portDistances: [ 0, 10, 30 ],
  length:        30 + diagonal,
}

function pose (): ScheduledBoatSample {
  return {
    x:             0,
    z:             0,
    angle:         0,
    routeDistance: 0,
    legIndex:      0,
    portIndex:     -1,
    docked:        false,
    speed:         0,
  }
}

describe('the synchronized boat schedule', () => {
  test('freezes every part of the schedule at zero speed', () => {
    const schedule = createFleetSchedule()

    expect(advanceFleetSchedule(schedule, route, 100, 0, 7)).toBeFalse()
    expect(schedule).toEqual({ stage: 0, lead: 0, dwell: 0 })
  })

  test('lets short crossings wait at their destination without delaying others', () => {
    const schedule = createFleetSchedule()
    const short    = pose()
    const middle   = pose()

    advanceFleetSchedule(schedule, route, 3, 4, 7)
    sampleScheduledBoat(route, 0, schedule, 4, short)
    sampleScheduledBoat(route, 1, schedule, 4, middle)

    expect(short.docked).toBeTrue()
    expect(short.portIndex).toBe(1)
    expect(short.speed).toBe(0)
    expect(short.x).toBeCloseTo(10)
    expect(middle.docked).toBeFalse()
    expect(middle.speed).toBe(4)
    expect(middle.z).toBeCloseTo(12)
  })

  test('dispatches the next set of legs only after arrival and dwell', () => {
    const schedule = createFleetSchedule()
    const longest  = longestWaterwayLeg(route)

    advanceFleetSchedule(schedule, route, longest / 4, 4, 5)
    expect(schedule.stage).toBe(0)
    expect(schedule.lead).toBeCloseTo(longest)

    for (let boat = 0; boat < 3; boat += 1)
      expect(sampleScheduledBoat(route, boat, schedule, 4, pose()).docked).toBeTrue()

    advanceFleetSchedule(schedule, route, 4.9, 4, 5)
    expect(schedule.stage).toBe(0)
    expect(schedule.dwell).toBeCloseTo(4.9)

    advanceFleetSchedule(schedule, route, 0.1, 4, 5)
    expect(schedule).toEqual({ stage: 1, lead: 0, dwell: 0 })
  })

  test('turns through the shortest wrapped angle at a bounded rate', () => {
    const from = Math.PI - 0.05
    const to   = -Math.PI + 0.05

    expect(shortestAngleDelta(from, to)).toBeCloseTo(0.1)
    expect(turnToward(from, to, 0.04)).toBeCloseTo(from + 0.04)
    expect(turnToward(from, to, 1)).toBeCloseTo(from + 0.1)
  })
})
