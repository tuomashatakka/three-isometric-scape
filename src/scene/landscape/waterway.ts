import type { ScapeConfig } from '../config.ts'
import type { HeightField } from './height.ts'
import { pathLength } from './path.ts'
import type { Vec2 } from './path.ts'


export interface WorldPort {
  id:         string
  jetty:      Vec2 & { angle: number }
  waterEntry: Vec2
}

export interface WaterwayLeg {
  from:   string
  to:     string
  points: readonly Vec2[]
  length: number
}

export interface RouteSample extends Vec2 {
  angle: number
}

export interface WaterwayRoute {
  legs:          readonly WaterwayLeg[]
  points:        readonly Vec2[]
  cumulative:    readonly number[]
  portDistances: readonly number[]
  length:        number
}

export interface WaterwayNetwork {
  ports:             readonly WorldPort[]
  route:             WaterwayRoute
  boatOffsets:       readonly number[]
  minimumClearance:  number
  minimumSeparation: number
}

interface QueueItem {
  node:  number
  score: number
}

interface NavigationGrid {
  cell: number
  cols: number
  min:  number
  wet:  Uint8Array
}

export const BOAT_HULL_RADIUS = 1.85

const HULL_CLEARANCE   = BOAT_HULL_RADIUS
const ROUTE_PROBE_STEP = 0.35
const GRID_PROBE_STEP  = 1.1
const CLEARANCE_MARGIN = 0.08
const PLAN_PROBES      = 24
const AUDIT_PROBES     = 72
const AUDIT_ROUTE_STEP = 0.25
const NEIGHBOURS       = [
  [ -1, -1 ], [ 0, -1 ], [ 1, -1 ],
  [ -1, 0 ], [ 1, 0 ],
  [ -1, 1 ], [ 0, 1 ], [ 1, 1 ],
] as const

function queueBefore (a: QueueItem, b: QueueItem): boolean {
  return a.score < b.score || a.score === b.score && a.node < b.node
}

function pushQueue (heap: QueueItem[], item: QueueItem): void {
  heap.push(item)

  let at = heap.length - 1
  while (at > 0) {
    const parent = Math.floor((at - 1) / 2)
    if (queueBefore(heap[parent], heap[at]))
      break;
    [ heap[parent], heap[at] ] = [ heap[at], heap[parent] ]
    at = parent
  }
}

function popQueue (heap: QueueItem[]): QueueItem | null {
  const first = heap[0]
  const last  = heap.pop()

  if (!first || !last)
    return first ?? null
  if (heap.length === 0)
    return first

  heap[0] = last

  let at = 0
  while (true) {
    const left  = at * 2 + 1
    const right = left + 1
    let best    = at

    if (left < heap.length && queueBefore(heap[left], heap[best]))
      best = left
    if (right < heap.length && queueBefore(heap[right], heap[best]))
      best = right
    if (best === at)
      break;
    [ heap[at], heap[best] ] = [ heap[best], heap[at] ]
    at = best
  }

  return first
}

function pointIsWet (
  field:     HeightField,
  water:     number,
  clearance: number,
  x:         number,
  z:         number,
): boolean {
  const required = clearance + CLEARANCE_MARGIN

  if (field.heightAt(x, z) > water - required)
    return false

  for (let probe = 0; probe < PLAN_PROBES; probe += 1) {
    const angle = probe / PLAN_PROBES * Math.PI * 2
    const px    = x + Math.cos(angle) * HULL_CLEARANCE
    const pz    = z + Math.sin(angle) * HULL_CLEARANCE

    if (field.heightAt(px, pz) > water - required)
      return false
  }

  return true
}

function segmentIsWet (
  field:     HeightField,
  water:     number,
  clearance: number,
  from:      Vec2,
  to:        Vec2,
  probeStep = ROUTE_PROBE_STEP,
): boolean {
  const distance = Math.hypot(to.x - from.x, to.z - from.z)
  const steps    = Math.max(1, Math.ceil(distance / probeStep))

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps

    if (!pointIsWet(
      field,
      water,
      clearance,
      from.x + (to.x - from.x) * t,
      from.z + (to.z - from.z) * t,
    ))
      return false
  }

  return true
}

export function createWorldPort (
  id:     string,
  jetty:  Vec2 & { angle: number },
  field:  HeightField,
  config: ScapeConfig,
): WorldPort {
  const side = id === 'meadow' ? -1 : 1

  for (let step = 0; step < 16; step += 1) {
    const outward = config.boats.dockReach + step * 0.55
    const lateral = 2.15 * side
    const entry   = {
      x: jetty.x + Math.cos(jetty.angle) * outward + Math.cos(jetty.angle + Math.PI / 2) * lateral,
      z: jetty.z + Math.sin(jetty.angle) * outward + Math.sin(jetty.angle + Math.PI / 2) * lateral,
    }

    if (pointIsWet(field, config.terrain.waterLevel, config.boats.clearance, entry.x, entry.z))
      return { id, jetty, waterEntry: entry }
  }

  throw new Error(`no navigable water beyond ${id} jetty`)
}

function createGrid (config: ScapeConfig, field: HeightField): NavigationGrid {
  const span = config.archipelago.worldSize
  const cell = config.boats.routeCell
  const cols = Math.floor(span / cell) + 1
  const min  = -cell * (cols - 1) * 0.5
  const wet  = new Uint8Array(cols * cols)

  for (let row = 0; row < cols; row += 1)
    for (let column = 0; column < cols; column += 1) {
      const x = min + column * cell
      const z = min + row * cell

      wet[row * cols + column] = pointIsWet(
        field,
        config.terrain.waterLevel,
        config.boats.clearance,
        x,
        z,
      )
        ? 1
        : 0
    }

  return { cell, cols, min, wet }
}

function gridPoint (grid: NavigationGrid, node: number): Vec2 {
  return {
    x: grid.min + node % grid.cols * grid.cell,
    z: grid.min + Math.floor(node / grid.cols) * grid.cell,
  }
}

function nearestNode (
  grid:      NavigationGrid,
  field:     HeightField,
  config:    ScapeConfig,
  point:     Vec2,
): number {
  const centreColumn = Math.round((point.x - grid.min) / grid.cell)
  const centreRow    = Math.round((point.z - grid.min) / grid.cell)

  // Search expanding grid rings instead of testing a line to every wet node.
  // The old full scan spent most of the archipelago build proving that thousands
  // of obviously distant ocean cells were not the nearest one to each port.
  for (let radius = 0; radius < grid.cols; radius += 1) {
    let best         = -1
    let bestDistance = Infinity

    for (let dz = -radius; dz <= radius; dz += 1)
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) !== radius && Math.abs(dz) !== radius)
          continue

        const column = centreColumn + dx
        const row    = centreRow + dz
        if (column < 0 || column >= grid.cols || row < 0 || row >= grid.cols)
          continue

        const node = row * grid.cols + column
        if (!grid.wet[node])
          continue

        const candidate = gridPoint(grid, node)
        const distance  = (candidate.x - point.x) ** 2 + (candidate.z - point.z) ** 2
        if (distance >= bestDistance)
          continue
        if (!segmentIsWet(field, config.terrain.waterLevel, config.boats.clearance, point, candidate))
          continue

        best         = node
        bestDistance = distance
      }

    if (best >= 0)
      return best
  }

  throw new Error('a port could not reach the navigation grid')
}

function expandNode (
  grid:   NavigationGrid,
  field:  HeightField,
  config: ScapeConfig,
  item:   QueueItem,
  goal:   Vec2,
  score:  Float64Array,
  parent: Int32Array,
  closed: Uint8Array,
  heap:   QueueItem[],
): void {
  const row    = Math.floor(item.node / grid.cols)
  const column = item.node % grid.cols
  const here   = gridPoint(grid, item.node)

  for (const [ dx, dz ] of NEIGHBOURS) {
    const nextColumn = column + dx
    const nextRow    = row + dz

    if (nextColumn < 0 || nextColumn >= grid.cols || nextRow < 0 || nextRow >= grid.cols)
      continue

    const next = nextRow * grid.cols + nextColumn
    if (!grid.wet[next] || closed[next])
      continue

    const there = gridPoint(grid, next)
    if (!segmentIsWet(
      field,
      config.terrain.waterLevel,
      config.boats.clearance,
      here,
      there,
      GRID_PROBE_STEP,
    ))
      continue

    const travelled = score[item.node] + Math.hypot(dx, dz) * grid.cell
    if (travelled >= score[next])
      continue

    score[next]  = travelled
    parent[next] = item.node

    const estimate = travelled + Math.hypot(goal.x - there.x, goal.z - there.z)
    pushQueue(heap, { node: next, score: estimate })
  }
}

function traceGrid (
  grid:   NavigationGrid,
  field:  HeightField,
  config: ScapeConfig,
  from:   Vec2,
  to:     Vec2,
): Vec2[] {
  const start             = nearestNode(grid, field, config, from)
  const finish            = nearestNode(grid, field, config, to)
  const score             = new Float64Array(grid.wet.length)
  const parent            = new Int32Array(grid.wet.length)
  const closed            = new Uint8Array(grid.wet.length)
  const heap: QueueItem[] = []

  score.fill(Infinity)
  parent.fill(-1)
  score[start] = 0

  const goal = gridPoint(grid, finish)
  pushQueue(heap, { node: start, score: 0 })

  while (heap.length > 0) {
    const item = popQueue(heap)
    if (!item)
      break
    if (closed[item.node])
      continue
    if (item.node === finish)
      break

    closed[item.node] = 1
    expandNode(grid, field, config, item, goal, score, parent, closed, heap)
  }

  if (finish !== start && parent[finish] < 0)
    throw new Error('no water-only route joins two island jetties')

  const reversed: Vec2[] = []
  for (let node = finish; node >= 0; node = parent[node]) {
    reversed.push(gridPoint(grid, node))
    if (node === start)
      break
  }

  return reversed.reverse()
}

/**
 * Straighten a traced route by taking the furthest point still reachable in open
 * water, then repeating from there.
 *
 * Found by halving rather than by counting down from the end, and that is a
 * scale fix rather than a tidy-up. The walk-back version tested every candidate
 * from the far end inward — O(n²) segment tests, each one *itself* a walk
 * sampling nine height probes per step — so tripling the world's span put the
 * whole thing up by roughly a cube. Measured on the five-island archipelago:
 * **11.2 million height queries and thirteen seconds** for what used to be a
 * survey of sixteen milliseconds.
 *
 * The halving assumes what the walk-back already assumed, and it is worth saying
 * out loud rather than leaving implied: that a longer shortcut is never wetter
 * than a shorter one along the same bearing. It is not a theorem — a channel
 * that opens out past a bar could break it — but every candidate here is a point
 * on a path A* already found through open water, so the failures are shores cut
 * across rather than channels missed. Where it does differ, it takes a shorter
 * shortcut, which is the safe direction: more waypoints, never a route through
 * land.
 */
function simplify (
  points: readonly Vec2[],
  field:  HeightField,
  config: ScapeConfig,
): Vec2[] {
  const out = [ points[0] ]
  let at    = 0

  const reachable = (from: number, to: number): boolean => segmentIsWet(
    field,
    config.terrain.waterLevel,
    config.boats.clearance,
    points[from],
    points[to],
  )

  while (at < points.length - 1) {
    // The next point along is always reachable — it is one grid step through
    // water A* has already accepted — so it is the floor rather than a candidate.
    let low  = at + 1
    let high = points.length - 1

    while (low < high) {
      const mid = Math.ceil((low + high) / 2)

      if (reachable(at, mid))
        low = mid
      else
        high = mid - 1
    }

    out.push(points[low])
    at = low
  }

  return out
}

function buildLeg (
  from:   WorldPort,
  to:     WorldPort,
  grid:   NavigationGrid,
  field:  HeightField,
  config: ScapeConfig,
): WaterwayLeg {
  const points = simplify([
    from.waterEntry,
    ...traceGrid(grid, field, config, from.waterEntry, to.waterEntry),
    to.waterEntry,
  ], field, config)

  return { from: from.id, to: to.id, points, length: pathLength(points) }
}

function joinRoute (legs: readonly WaterwayLeg[]): WaterwayRoute {
  const points: Vec2[]          = []
  const portDistances: number[] = []
  let distance = 0

  for (const leg of legs) {
    portDistances.push(distance)

    for (const [ index, point ] of leg.points.entries()) {
      if (points.length > 0 && index === 0)
        continue

      const previous = points.at(-1)
      if (previous)
        distance += Math.hypot(point.x - previous.x, point.z - previous.z)
      points.push(point)
    }
  }

  const cumulative = [ 0 ]
  for (let index = 1; index < points.length; index += 1)
    cumulative.push(cumulative[index - 1] + Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].z - points[index - 1].z,
    ))

  return { legs, points, cumulative, portDistances, length: cumulative.at(-1) ?? 0 }
}

export function sampleWaterway (
  route:    WaterwayRoute,
  distance: number,
  target:   RouteSample,
): RouteSample {
  const wrapped = (distance % route.length + route.length) % route.length

  let low  = 1
  let high = route.cumulative.length - 1
  while (low < high) {
    const middle = low + high >> 1
    if (route.cumulative[middle] < wrapped)
      low = middle + 1
    else
      high = middle
  }

  const a    = route.points[Math.max(0, low - 1)]
  const b    = route.points[low]
  const span = route.cumulative[low] - route.cumulative[Math.max(0, low - 1)]
  const t    = span > 0 ? (wrapped - route.cumulative[Math.max(0, low - 1)]) / span : 0

  target.x     = a.x + (b.x - a.x) * t
  target.z     = a.z + (b.z - a.z) * t
  target.angle = Math.atan2(b.z - a.z, b.x - a.x)
  return target
}

function routeClearance (
  route:  WaterwayRoute,
  field:  HeightField,
  water:  number,
): number {
  let minimum = Infinity

  for (let distance = 0; distance < route.length; distance += AUDIT_ROUTE_STEP) {
    const sample = sampleWaterway(route, distance, { x: 0, z: 0, angle: 0 })

    minimum = Math.min(minimum, water - field.heightAt(sample.x, sample.z))
    for (let probe = 0; probe < AUDIT_PROBES; probe += 1) {
      const angle = probe / AUDIT_PROBES * Math.PI * 2
      minimum = Math.min(minimum, water - field.heightAt(
        sample.x + Math.cos(angle) * HULL_CLEARANCE,
        sample.z + Math.sin(angle) * HULL_CLEARANCE,
      ))
    }
  }

  return minimum
}

export function fleetMinimumSeparation (
  route:   WaterwayRoute,
  offsets: readonly number[],
): number {
  const samples = Math.max(720, Math.ceil(route.length * 2))
  const poses   = offsets.map((): RouteSample => ({ x: 0, z: 0, angle: 0 }))
  let minimum   = Infinity

  for (let step = 0; step < samples; step += 1) {
    const travel = step / samples * route.length

    offsets.forEach((offset, index) => sampleWaterway(route, travel + offset, poses[index]))

    for (let a = 0; a < poses.length; a += 1)
      for (let b = a + 1; b < poses.length; b += 1)
        minimum = Math.min(minimum, Math.hypot(poses[a].x - poses[b].x, poses[a].z - poses[b].z))
  }

  // Both boats can close by at most one sample step before the next probe.
  return minimum - route.length / samples * 2
}

export function createWaterways (
  config: ScapeConfig,
  field:  HeightField,
  ports:  readonly WorldPort[],
): WaterwayNetwork {
  if (ports.length < 2)
    throw new Error('an archipelago needs at least two navigable ports')

  const grid = createGrid(config, field)
  const legs = ports.map((port, index) =>
    buildLeg(port, ports[(index + 1) % ports.length], grid, field, config))
  const route             = joinRoute(legs)
  const boatOffsets       = [ ...route.portDistances ]
  const minimumClearance  = routeClearance(route, field, config.terrain.waterLevel)
  const minimumSeparation = fleetMinimumSeparation(route, boatOffsets)

  if (minimumClearance < config.boats.clearance - 1e-6)
    throw new Error(`waterway clearance fell to ${minimumClearance.toFixed(2)}m`)
  if (minimumSeparation < config.boats.separation)
    throw new Error(`fleet separation fell to ${minimumSeparation.toFixed(2)}m`)

  return { ports, route, boatOffsets, minimumClearance, minimumSeparation }
}

// perf: build-time A* over about ten thousand wet/dry cells. Runtime sampling
// is a binary search over one shared polyline; every boat follows it one-way.
