import { CLEARANCE } from './footpath.ts'
import type { FootpathRoute, Obstacle } from './footpath.ts'
import { plotInfluence } from './layout.ts'
import type { Plot, ScapeLayout } from './layout.ts'
import { millDoorstep } from './mill.ts'
import { distanceToPath } from './path.ts'
import type { Vec2 } from './path.ts'
import { STEADING_BUILDINGS, doorstepOf } from './steading.ts'
import type { SteadingPlaces } from './steading.ts'


/**
 * The farm's own street plan.
 *
 * A farmyard is not a wheel. The star this used to be — every route leaving the
 * well and ending somewhere — is what you get if you ask "how does a person
 * reach each place", and it is wrong in the one way a reader notices: getting
 * from the barn to the woodshed meant walking to the middle of the yard and out
 * again, past a door you were already standing at. What a steading actually has
 * is a *network*: legs between the places that are near each other, and the well
 * as one node on it rather than the only one.
 *
 * So this resolves places first and legs second, and the legs come out of the
 * geometry rather than out of a list:
 *
 * 1. Every place the farm walks to becomes a {@link Waypoint} — the well, each
 *    building's *doorway*, each field's gate, the meadow gateway, the landing
 *    and the boat harbour.
 * 2. A minimum spanning tree over those, costed so that a leg which would have
 *    to detour round a building is dearer than one that would not. That alone
 *    connects everything to everything, by the cheapest total length there is.
 * 3. Shortcuts. A tree has no loops, so two doors ten metres apart can end up a
 *    forty-metre walk from each other through the well. Any pair the tree makes
 *    a real detour of, and which can be joined without going round a building,
 *    gets a direct leg — which is what closes the ring round the yard.
 *
 * Pure and rng-free: the same layout always plans the same network. The wander
 * that keeps the result from looking surveyed is applied later, when the legs
 * are traced into the ground.
 */

/** One place the farm walks to. */
export interface Waypoint extends Vec2 {
  name: string

  /** What kind of place it is. Carried for the debug tools, not used in planning. */
  kind: 'well' | 'door' | 'field' | 'meadow' | 'mill' | 'chapel' | 'shore'
}

/** One planned leg, as a pair of indices into the waypoint list. */
export type Leg = readonly [number, number]

/**
 * Longest shortcut worth adding, in metres.
 *
 * A yard is about this across. Past it a "shortcut" is a second route to
 * somewhere the network already reaches, which is a path nobody wears.
 */
const LINK = 30

/**
 * How far round the houses the tree has to send you before a direct leg is
 * worth having. At 1.6 a walk that is half again as long as the crow flies is
 * left alone; anything worse gets its own path.
 */
const DETOUR = 1.6

/**
 * What a leg costs when it would have to go round a building.
 *
 * Not a refusal — the ground sometimes leaves no other way through, and the
 * tracer is perfectly able to bend a route round a barn. It is a preference,
 * and it is what makes the tree pick the leg along the open side of the yard
 * over the one that would have to squeeze between two walls.
 */
const ROUNDABOUT = 2.6

/** Does a straight leg between these two run through something already standing? */
function goesRound (from: Vec2, to: Vec2, avoid: readonly Obstacle[]): boolean {
  return avoid.some(thing =>
    distanceToPath([ from, to ], thing.x, thing.z) < thing.radius + CLEARANCE)
}

function span (from: Vec2, to: Vec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z)
}

function legCost (from: Vec2, to: Vec2, avoid: readonly Obstacle[]): number {
  return span(from, to) * (goesRound(from, to, avoid) ? ROUNDABOUT : 1)
}

/**
 * The cheapest set of legs that still joins every place to every other.
 *
 * Prim's, grown from the well outward, because a farm's network *is* grown from
 * the yard outward and starting anywhere else would be a different tree with
 * the same total length. At a dozen waypoints the quadratic scan is free.
 */
export function spanningTree (nodes: readonly Waypoint[], avoid: readonly Obstacle[]): Leg[] {
  const reached     = [ 0 ]
  const rest        = nodes.map((_, index) => index).slice(1)
  const legs: Leg[] = []

  while (rest.length > 0) {
    let cheapest = Infinity
    let from     = 0
    let at       = 0

    for (const inside of reached)
      for (let index = 0; index < rest.length; index += 1) {
        const cost = legCost(nodes[inside], nodes[rest[index]], avoid)

        if (cost < cheapest) {
          cheapest = cost
          from     = inside
          at       = index
        }
      }

    const [ joined ] = rest.splice(at, 1)

    legs.push([ from, joined ])
    reached.push(joined)
  }

  return legs
}

/**
 * The legs a tree is missing, which is what stops it reading as a tree.
 *
 * Distances are measured on the tree as planned, not as augmented — a shortcut
 * that shortens someone else's walk does not get to disqualify the next one, or
 * the answer would depend on the order pairs happen to be tested in.
 */
export function shortcuts (
  nodes: readonly Waypoint[],
  legs:  readonly Leg[],
  avoid: readonly Obstacle[],
): Leg[] {
  const size = nodes.length
  const far  = nodes.map(() => nodes.map(() => Infinity))

  for (let index = 0; index < size; index += 1)
    far[index][index] = 0

  for (const [ a, b ] of legs) {
    far[a][b] = span(nodes[a], nodes[b])
    far[b][a] = far[a][b]
  }

  for (let via = 0; via < size; via += 1)
    for (let a = 0; a < size; a += 1)
      for (let b = 0; b < size; b += 1)
        far[a][b] = Math.min(far[a][b], far[a][via] + far[via][b])

  const added: Leg[] = []

  for (let a = 0; a < size; a += 1)
    for (let b = a + 1; b < size; b += 1) {
      const direct = span(nodes[a], nodes[b])

      if (direct > LINK || far[a][b] <= direct * DETOUR)
        continue
      if (goesRound(nodes[a], nodes[b], avoid))
        continue

      added.push([ a, b ])
    }

  return added
}

/**
 * The point on a plot's edge nearest whatever it is being joined to — where its
 * fence is, and so where its gate is.
 */
function plotGate (plot: Plot, toward: Vec2): Vec2 | null {
  const bearing = Math.atan2(toward.z - plot.z, toward.x - plot.x)
  const reach   = Math.hypot(plot.halfW, plot.halfD) + 2

  for (let out = 0; out < reach; out += 0.3) {
    const x = plot.x + Math.cos(bearing) * out
    const z = plot.z + Math.sin(bearing) * out

    if (plotInfluence(plot, x, z) < 1)
      return { x, z }
  }

  return null
}

function nearest (to: Vec2, among: readonly Vec2[]): Vec2 {
  return among.reduce((best, point) => span(to, point) < span(to, best) ? point : best)
}

/**
 * Every place the farm walks to.
 *
 * Doorways, not middles. A route ending at a building's centre would have to be
 * dragged back out of the building it just walked into, and the side the door
 * is on is what tells a reader which way the place faces.
 *
 * A field's gate is cut toward the nearest *building* rather than toward the
 * middle of the yard, because that is the neighbour the network is going to
 * join it to — aiming it at the yard and then running the leg to the barn puts
 * the gate round the wrong corner of the fence.
 */
export function farmWaypoints (
  layout:   ScapeLayout,
  places:   SteadingPlaces,
  outlying: readonly (Vec2 | null)[],
): Waypoint[] {
  const points: Waypoint[] = [{ x: places.well.x, z: places.well.z, name: 'well', kind: 'well' }]

  for (const name of STEADING_BUILDINGS) {
    const step = doorstepOf(places[name])

    points.push({ x: step.x, z: step.z, name, kind: 'door' })
  }

  if (layout.pasture)
    points.push({
      x:    layout.pasture.x + Math.cos(layout.pasture.gateway) * layout.pasture.radius,
      z:    layout.pasture.z + Math.sin(layout.pasture.gateway) * layout.pasture.radius,
      name: 'pasture',
      kind: 'meadow',
    })

  // The mill's door is at the top of its tail stair, so the place walked to is
  // the foot of the stair — the same rule as a building's doorstep, and for the
  // same reason: a leg ending under the buck would have to be dragged back out
  // from between the quarter bars.
  if (layout.mill) {
    const step = millDoorstep(layout.mill)

    points.push({ x: step.x, z: step.z, name: 'mill', kind: 'mill' })
  }

  // The chapel needs no rule of its own here, and that is the point of siting it
  // as a `Standing`: its door is faced by `faceToward` and its doorstep is the
  // same `doorstepOf` every building in the yard is walked to by, so the leg to
  // it is planned, costed and traced exactly like a leg to the barn.
  if (layout.chapel) {
    const step = doorstepOf(layout.chapel)

    points.push({ x: step.x, z: step.z, name: 'chapel', kind: 'chapel' })
  }

  const anchors = points.map(point => ({ x: point.x, z: point.z }))

  layout.plots.forEach((plot, index) => {
    const gate = plotGate(plot, nearest(plot, anchors))

    if (gate)
      points.push({ x: gate.x, z: gate.z, name: `field-${index + 1}`, kind: 'field' })
  })

  const shores = [ 'landing', 'harbour' ]

  outlying.forEach((place, index) => {
    if (place)
      points.push({ x: place.x, z: place.z, name: shores[index] ?? `shore-${index}`, kind: 'shore' })
  })

  return points
}

/** The planned network, waypoints and all — what the debug tools draw. */
export interface FarmNetwork {
  waypoints: readonly Waypoint[]
  legs:      readonly Leg[]
  routes:    readonly FootpathRoute[]
}

export function planFarmNetwork (
  layout:   ScapeLayout,
  places:   SteadingPlaces,
  outlying: readonly (Vec2 | null)[],
  avoid:    readonly Obstacle[],
): FarmNetwork {
  const waypoints = farmWaypoints(layout, places, outlying)
  const tree      = spanningTree(waypoints, avoid)
  const legs      = [ ...tree, ...shortcuts(waypoints, tree, avoid) ]

  return {
    waypoints,
    legs,
    routes: legs.map(([ a, b ]) => ({ from: waypoints[a], to: waypoints[b] })),
  }
}

/** Just the legs, for the caller that only wants something to trace. */
export function footpathRoutes (
  layout:   ScapeLayout,
  places:   SteadingPlaces,
  outlying: readonly (Vec2 | null)[],
  avoid:    readonly Obstacle[],
): FootpathRoute[] {
  return [ ...planFarmNetwork(layout, places, outlying, avoid).routes ]
}
