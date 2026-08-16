import { sampleWaterway } from './waterway.ts'
import type { RouteSample, WaterwayRoute } from './waterway.ts'


export interface FleetSchedule {
  stage: number
  lead:  number
  dwell: number
}

export interface ScheduledBoatSample extends RouteSample {
  routeDistance: number
  legIndex:      number
  portIndex:     number
  docked:        boolean
  speed:         number
}

const EPSILON = 1e-8

function wrappedIndex (index: number, length: number): number {
  return (index % length + length) % length
}

export function createFleetSchedule (): FleetSchedule {
  return { stage: 0, lead: 0, dwell: 0 }
}

export function longestWaterwayLeg (route: WaterwayRoute): number {
  let longest = 0

  for (const leg of route.legs)
    longest = Math.max(longest, leg.length)

  return longest
}

/**
 * Advances one shared departure clock.
 *
 * Every boat takes a different leg at the same speed. Shorter legs therefore
 * reach their next jetty first and wait there; the next dispatch only happens
 * after the longest leg has arrived and the common dwell has elapsed.
 */
export function advanceFleetSchedule (
  schedule:     FleetSchedule,
  route:        WaterwayRoute,
  delta:        number,
  speed:        number,
  dwellSeconds: number,
): boolean {
  const velocity = Math.max(0, speed)
  let remaining  = Math.max(0, delta)

  if (velocity === 0 || remaining === 0 || route.legs.length === 0)
    return false

  const longest = longestWaterwayLeg(route)
  if (longest <= EPSILON)
    return false

  let changed = false
  while (remaining > EPSILON) {
    if (schedule.lead < longest - EPSILON) {
      const untilArrival = (longest - schedule.lead) / velocity
      const slice        = Math.min(remaining, untilArrival)

      schedule.lead = Math.min(longest, schedule.lead + slice * velocity)
      remaining    -= slice
      changed       = changed || slice > 0

      if (schedule.lead < longest - EPSILON)
        break
    }

    const dwellLeft = Math.max(0, dwellSeconds - schedule.dwell)
    if (dwellLeft > EPSILON) {
      const slice = Math.min(remaining, dwellLeft)

      schedule.dwell += slice
      remaining      -= slice
      changed         = changed || slice > 0

      if (schedule.dwell < dwellSeconds - EPSILON)
        break
    }

    schedule.stage = wrappedIndex(schedule.stage + 1, route.legs.length)
    schedule.lead  = 0
    schedule.dwell = 0
    changed        = true
  }

  return changed
}

/**
 * Samples a boat without allocating. The target is stable storage owned by the
 * caller and can be passed straight on to instance, camera and wake consumers.
 */
export function sampleScheduledBoat (
  route:     WaterwayRoute,
  boatIndex: number,
  schedule:  FleetSchedule,
  speed:     number,
  target:    ScheduledBoatSample,
): ScheduledBoatSample {
  const legIndex      = wrappedIndex(boatIndex + schedule.stage, route.legs.length)
  const leg           = route.legs[legIndex]
  const distance      = Math.min(schedule.lead, leg.length)
  const docked        = distance >= leg.length - EPSILON
  const routeDistance = route.portDistances[legIndex] + distance

  sampleWaterway(route, routeDistance, target)

  target.routeDistance = routeDistance
  target.legIndex      = legIndex
  target.portIndex     = docked ? wrappedIndex(legIndex + 1, route.legs.length) : -1
  target.docked        = docked
  target.speed         = docked ? 0 : Math.max(0, speed)
  return target
}

/**
 * Audits the synchronized schedule, including the early waits at short legs
 * and the all-docked dwell. Later stages only permute boat identities, so one
 * spatial stage covers the complete repeating fleet cycle.
 */
export function scheduledFleetMinimumSeparation (
  route:     WaterwayRoute,
  boatCount: number,
  probeStep = 0.25,
): number {
  if (boatCount < 2)
    return Infinity

  const longest = longestWaterwayLeg(route)
  const steps   = Math.max(1, Math.ceil(longest / Math.max(EPSILON, probeStep)))
  const state   = createFleetSchedule()
  const poses   = Array.from({ length: boatCount }, (): ScheduledBoatSample => ({
    x:             0,
    z:             0,
    angle:         0,
    routeDistance: 0,
    legIndex:      0,
    portIndex:     -1,
    docked:        false,
    speed:         0,
  }))
  let minimum = Infinity

  for (let step = 0; step <= steps; step += 1) {
    state.lead = step / steps * longest

    for (let index = 0; index < boatCount; index += 1)
      sampleScheduledBoat(route, index, state, 1, poses[index])

    for (let a = 0; a < poses.length; a += 1)
      for (let b = a + 1; b < poses.length; b += 1)
        minimum = Math.min(minimum, Math.hypot(
          poses[a].x - poses[b].x,
          poses[a].z - poses[b].z,
        ))
  }

  // Two moving hull centres can each close by one unsampled probe interval.
  return minimum - longest / steps * 2
}

export function shortestAngleDelta (from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

export function turnToward (from: number, to: number, limit: number): number {
  const delta = shortestAngleDelta(from, to)
  const step  = Math.min(Math.abs(delta), Math.max(0, limit))

  return from + Math.sign(delta) * step
}
