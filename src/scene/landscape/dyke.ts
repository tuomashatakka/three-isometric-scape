import type { Obstacle } from './footpath.ts'
import type { Vec2 } from './path.ts'


/**
 * The head dyke — the drystone march between the farm and the hill.
 *
 * Every wall this scape has had so far encloses something small enough to see
 * the whole of at once: the hay meadow, the churchyard, a crop plot. Each is a
 * ring round ground with a use, and each has one gateway in it.
 *
 * The head dyke is the other kind of wall, and on ground like this it is the
 * first kind that gets built. It encloses nothing — it *divides*. The stock is
 * turned out on the hill and the farm is down under it, and one wall running
 * right round the high ground is what means nobody has to herd sheep off the
 * doorstep. It is the largest built thing on the island, it is older than every
 * building on either side of it, and its line is not surveyed: it follows a
 * contour, because a contour is what a hillside gives you to follow.
 *
 * So the line here is *found* rather than drawn, the way the beck's is. The
 * search takes the island's own summit, picks a height a share of the way down
 * from it toward the farm, and walks outward on every bearing until the ground
 * drops through that height. What comes back is a closed ring around the high
 * ground, with the farmstead outside it and the fell inside.
 *
 * What else ends up inside is the island's answer rather than this module's. The
 * walled hay meadow usually does, which is right — a hain is enclosed ground out
 * among the grazing, and that is what its own wall is for. So, on two of the six
 * islands, does a levelled plot cut into the hill's shoulder, and the way to it
 * is a gate.
 *
 * Three things then cut it, and they are the whole character of the result:
 *
 * - **it stops at what is already standing.** A dyke does not run through a
 *   byre, across the walled meadow, into the pool on the fell or down the face
 *   of the peat cutting — it abuts them and starts again on the far side. Every
 *   one of those is a gap rather than a detour, because a wall that bends round
 *   a building is a wall somebody surveyed.
 * - **it stops at ground it cannot be founded on.** The water, and the ice.
 * - **it opens where people already walk.** The routes were worn before this
 *   ran, so every footpath that crosses the line crosses it at a gate. The wall
 *   answers to the paths and not the other way round, which is the order a real
 *   one was built in.
 *
 * Pure, and free of `three`: the ring is surveyed here and the stones are laid
 * in `dressing-enclosures.ts`, so `scape:map` reports every dyke in the
 * archipelago without building a vertex of one.
 */

/** Where the wall is opened, and which way the gate stands in the gap. */
export interface DykeGate extends Vec2 {

  /**
   * Outward bearing of the ring at the gap, in radians.
   *
   * The radial rather than the tangent, so the caller turns it the same quarter
   * the pasture's and the churchyard's gates are turned by — one convention for
   * every gate in the scape rather than a second one here to drift from it.
   */
  bearing: number
}

/** The march round the hill, as it ended up on the ground. */
export interface HeadDyke {

  /** The high ground the ring is drawn around, in the island's own local frame. */
  summit: Vec2

  /** The contour the line follows, in metres of world height. */
  level: number

  /** The whole closed line, gaps included — the ring as the contour drew it. */
  ring: readonly Vec2[]

  /** The stretches of it that are actually built, each two stations or more. */
  runs: readonly (readonly Vec2[])[]

  /** Metres of wall standing. */
  length: number

  /** Metres the closed ring measures, built and gapped together. */
  circuit: number

  /** Square metres of hill inside it. */
  encloses: number

  gates: readonly DykeGate[]
}

export interface DykeSearch {

  /** The ground as the height field leaves it, in metres. */
  ground(x: number, z: number): number
  waterLevel: number

  /**
   * The height the hill is measured up from, in metres.
   *
   * The ground under the farmyard. The dyke's whole job is to divide what is
   * worked from what is grazed, so the level it sits at is a share of the rise
   * *from the farm to the summit* rather than a height above the sea — which is
   * what lets one number put the wall in the right place on a six-metre island
   * and on a twenty-six-metre one.
   */
  foot: number

  /** Where between {@link foot} and the summit the line is drawn, 0..1. */
  headroom: number

  /** Metres of dry ground a course of stone needs under it. */
  freeboard: number

  /** Metres of wall a gate takes out of the run. */
  gateway: number

  /**
   * Metres the wall stands over the ground.
   *
   * Carried by the *search* rather than only by the builder, and it is the
   * switch: at 0 there is no dyke anywhere in the archipelago, and the refusal
   * happens here rather than in the dressing quietly skipping the geometry. One
   * authority — otherwise `scape:map` reports a ring the scape has no stones in.
   */
  height: number

  /**
   * Furthest from the summit the trace will walk, in metres.
   *
   * **World-sized.** It is the island's own land radius with a margin on it, so
   * an archipelago whose islands grow grows this with them — unlike the gateway
   * above, which is the width of a gate and stays the width of a gate.
   */
  reach: number

  /** Ground already spoken for. The wall abuts these rather than crossing them. */
  taken: readonly Obstacle[]

  /** Ground nothing can be founded on at all — the ice, and the beck's channel. */
  barred(x: number, z: number): boolean
}

/**
 * Bearings the contour is walked on, and metres between height samples along
 * each of them.
 *
 * Ninety-six is a bearing every three and three-quarter degrees, which on the
 * largest ring in the archipelago is a sample every two metres of circumference
 * and on the smallest one every half metre. The trace is smoothed after this, so
 * what the count actually buys is the *shape* of the contour rather than the
 * spacing of the stones — those are resampled at {@link STATION}.
 */
const BEARINGS = 96
const PROBE    = 0.5

/**
 * Passes of the three-tap smoothing run round the ring.
 *
 * A raw contour on fBm ground is a saw. Six passes of `[1, 2, 1] / 4` take the
 * single-bearing spikes out of it without pulling the line off the hill —
 * measured rather than guessed: at two passes the home island's ring still swung
 * fourteen metres between neighbouring bearings, and at twelve it had rounded
 * into a circle that no longer touched the contour anywhere.
 */
const SMOOTHING = 6

/**
 * Metres between stations on the finished line.
 *
 * The line, not the stones: `buildStoneWallRun` resamples whatever it is handed
 * at its own spacing, which is a tier decision. This is the resolution the
 * *gaps* are cut at, so it wants to be a good deal finer than a gateway is
 * wide — a wall that could only be opened in three-metre steps would put a gate
 * post through the byre it was meant to stop beside.
 */
const STATION = 0.8

/**
 * The shortest stretch worth calling a wall, and the shortest dyke worth
 * building, both in metres.
 *
 * Craft facts rather than tuning knobs, which is why they are here and not in
 * the config — the same reason the pier's `SHORTEST_RUN` is where it is. Four
 * metres of drystone between two gaps is a field clearance heap; thirty metres
 * of it round a hill is a sheepfold that has lost its shape. An island whose
 * high ground gives no more than that keeps an open fell.
 */
const SHORTEST_RUN  = 4
const SHORTEST_DYKE = 30

/**
 * Least rise there has to be between the farm and the summit, in metres.
 *
 * Below it the island has no hill to divide from anything, and a ring drawn on
 * it is a wall round the flattest part of a flat place.
 */
const HILL = 2

/**
 * Halvings used to put a path's crossing onto the ring.
 *
 * Eight takes a metre-long leg down to four millimetres, which is two orders
 * finer than a station and cheaper than solving the intersection in closed form
 * against a line that is only defined at ninety-six bearings.
 */
const BISECTIONS = 8

/** Grid the summit is found on, per side of the search's reach. */
const SUMMIT_PROBES = 48

const TAU = Math.PI * 2


/**
 * The highest ground inside the reach, found on a coarse grid.
 *
 * Exported, and taking the ground and the reach rather than a whole
 * {@link DykeSearch}, because a second thing on this island is sited against the
 * top of it: the shieling stands a share of the way up the same rise the wall is
 * drawn a share of the way up, and two searches each finding their own summit is
 * how a hut ends up on the wrong side of a wall that was measured from somewhere
 * else. One authority, and the coarse grid is part of the contract — the answer
 * is a probe on a 48-square lattice rather than the true maximum, and a caller
 * that resolved it any finer would get a different island.
 */
export function summitOf (
  ground: (x: number, z: number) => number,
  reach:  number,
): Vec2 & { height: number } {
  let best = { x: 0, z: 0, height: -Infinity }

  for (let ix = 0; ix <= SUMMIT_PROBES; ix += 1)
    for (let iz = 0; iz <= SUMMIT_PROBES; iz += 1) {
      const x      = -reach + 2 * reach * ix / SUMMIT_PROBES
      const z      = -reach + 2 * reach * iz / SUMMIT_PROBES
      const height = ground(x, z)

      if (height > best.height)
        best = { x, z, height }
    }

  return best
}

/**
 * How far the contour lies from the summit on each bearing.
 *
 * The *first* crossing outward rather than the last, and that is the whole
 * difference between a ring and a starfish. A contour on real ground is met
 * again on every spur and shoulder the hill has, so a walk that keeps the
 * furthest crossing comes back with radii swinging from ten metres to fifty and
 * a line that reads as a burst rather than as a wall. The first crossing is the
 * hill's own shape.
 */
function traceRing (search: DykeSearch, summit: Vec2, level: number): number[] {
  const floor = search.waterLevel + search.freeboard
  const radii = []

  for (let bearing = 0; bearing < BEARINGS; bearing += 1) {
    const angle = bearing / BEARINGS * TAU
    const cos   = Math.cos(angle)
    const sin   = Math.sin(angle)
    let radius  = search.reach

    for (let along = PROBE; along <= search.reach; along += PROBE) {
      const height = search.ground(summit.x + cos * along, summit.z + sin * along)

      if (height < level || height < floor) {
        radius = along
        break
      }
    }

    radii.push(radius)
  }

  return radii
}

/** Three-tap smoothing, run round the ring rather than along an open line. */
function smoothRing (radii: readonly number[], passes: number): number[] {
  let smoothed = [ ...radii ]

  for (let pass = 0; pass < passes; pass += 1)
    smoothed = smoothed.map((_, at) => {
      const before = smoothed[(at - 1 + smoothed.length) % smoothed.length]
      const after  = smoothed[(at + 1) % smoothed.length]

      return (before + 2 * smoothed[at] + after) / 4
    })

  return smoothed
}

/** The radius at any bearing, interpolated between the two it falls between. */
function radiusAt (radii: readonly number[], angle: number): number {
  const step   = (angle / TAU * radii.length % radii.length + radii.length) % radii.length
  const before = Math.floor(step)
  const blend  = step - before

  return radii[before] * (1 - blend) + radii[(before + 1) % radii.length] * blend
}

/** Metres round the smoothed ring, walked at the bearing resolution. */
function circuitOf (radii: readonly number[]): number {
  let circuit = 0

  for (let at = 0; at < radii.length; at += 1) {
    const one = at / radii.length * TAU
    const two = (at + 1) / radii.length * TAU

    circuit += Math.hypot(
      radii[(at + 1) % radii.length] * Math.cos(two) - radii[at] * Math.cos(one),
      radii[(at + 1) % radii.length] * Math.sin(two) - radii[at] * Math.sin(one),
    )
  }

  return circuit
}

/** The ring as evenly spaced stations, one every {@link STATION} metres. */
function stationsOf (summit: Vec2, radii: readonly number[], circuit: number): Vec2[] {
  const count            = Math.max(BEARINGS, Math.round(circuit / STATION))
  const stations: Vec2[] = []

  for (let at = 0; at < count; at += 1) {
    const angle  = at / count * TAU
    const radius = radiusAt(radii, angle)

    stations.push({ x: summit.x + Math.cos(angle) * radius, z: summit.z + Math.sin(angle) * radius })
  }

  return stations
}

/** Whether a course of stone can be founded at a station. */
function founded (search: DykeSearch, at: Vec2): boolean {
  if (search.ground(at.x, at.z) - search.waterLevel < search.freeboard)
    return false

  if (search.barred(at.x, at.z))
    return false

  return !search.taken.some(thing => Math.hypot(thing.x - at.x, thing.z - at.z) < thing.radius)
}

/** Square metres inside a closed line. */
function areaOf (points: readonly Vec2[]): number {
  let twice = 0

  for (let at = 0; at < points.length; at += 1) {
    const next = points[(at + 1) % points.length]

    twice += points[at].x * next.z - next.x * points[at].z
  }

  return Math.abs(twice) / 2
}

/** Where on a leg the ring is met, bisected onto it and then snapped to it. */
function crossingPoint (
  summit: Vec2,
  radii:  readonly number[],
  from:   Vec2,
  to:     Vec2,
  inside: (point: Vec2) => boolean,
): Vec2 {
  let near = from
  let far  = to

  for (let step = 0; step < BISECTIONS; step += 1) {
    const mid = { x: (near.x + far.x) / 2, z: (near.z + far.z) / 2 }

    if (inside(mid) === inside(near))
      near = mid
    else
      far = mid
  }

  // Radii are read once more so the point handed back sits on the ring rather
  // than a hair inside or outside it — the bearing is what the caller wants and
  // the radius is what makes it exact.
  const angle = Math.atan2(near.z - summit.z, near.x - summit.x)

  return {
    x: summit.x + Math.cos(angle) * radiusAt(radii, angle),
    z: summit.z + Math.sin(angle) * radiusAt(radii, angle),
  }
}

/**
 * Which station a walked route crosses the ring at, if it crosses at all.
 *
 * The test is on the *radius*: a point is inside the ring when it is nearer the
 * summit than the contour is on its own bearing, and a leg that starts inside
 * and ends outside has crossed. That is exact for a star-shaped ring and this
 * one is star-shaped by construction — every station is a radius on a bearing —
 * so there is no polygon crossing test here and no winding number to get wrong.
 */
function crossingsOf (
  summit: Vec2,
  radii:  readonly number[],
  count:  number,
  walked: readonly (readonly Vec2[])[],
): number[] {
  const inside = (point: Vec2): boolean =>
    Math.hypot(point.x - summit.x, point.z - summit.z) <
      radiusAt(radii, Math.atan2(point.z - summit.z, point.x - summit.x))

  const found: number[] = []

  for (const route of walked)
    for (let at = 1; at < route.length; at += 1) {
      if (inside(route[at - 1]) === inside(route[at]))
        continue

      // Bisected onto the line rather than snapped to the outer end's bearing.
      // A traced footpath steps about a metre at a time, so the two answers are
      // usually the same station — but a leg that crosses obliquely, which is
      // most of them, is a station or two out, and a gate a station out is a
      // gate with a length of wall still standing across the path.
      const meet  = crossingPoint(summit, radii, route[at - 1], route[at], inside)
      const angle = Math.atan2(meet.z - summit.z, meet.x - summit.x)

      found.push(Math.round((angle / TAU * count % count + count) % count) % count)
    }

  return found.sort((one, two) => one - two)
}

/** Contiguous stretches of open stations, shortest ones dropped. */
function runsOf (stations: readonly Vec2[], open: readonly boolean[]): Vec2[][] {
  const runs: Vec2[][] = []
  let run: Vec2[]      = []

  // Started at the first closed station so a run that straddles the seam is one
  // run rather than two — on a ring there is no first station, only the one the
  // array happens to begin at.
  const seam = open.indexOf(false)

  if (seam < 0)
    return [[ ...stations, stations[0] ]]

  for (let step = 0; step <= stations.length; step += 1) {
    const at = (seam + step) % stations.length

    if (open[at])
      run.push(stations[at])
    else {
      if (run.length >= 2)
        runs.push(run)

      run = []
    }
  }

  return runs.filter(one => lengthOf(one) >= SHORTEST_RUN)
}

/** Metres along an open line. */
function lengthOf (points: readonly Vec2[]): number {
  let length = 0

  for (let at = 1; at < points.length; at += 1)
    length += Math.hypot(points[at].x - points[at - 1].x, points[at].z - points[at - 1].z)

  return length
}

/**
 * Ring the hill, or refuse the island.
 *
 * `null` is a real answer and not a failure, the way the mill's, the
 * smokehouse's and the pier's are. Here it means one of three facts about the
 * island: the ground between the farm and the summit is not a hill, the contour
 * that would carry the wall is under the ice or in the sea for most of its
 * length, or what survives is too little to read as a march. An archipelago
 * where every island is walled to the same height would be an archipelago where
 * none of the walls said anything about the ground.
 *
 * @param walked Every route already worn on this island, in the same local
 *   frame — the wall is opened where one of them crosses it.
 */
export function solveHeadDyke (
  search: DykeSearch,
  walked: readonly (readonly Vec2[])[],
): HeadDyke | null {
  if (search.height <= 0 || search.headroom <= 0 || search.headroom >= 1 || search.reach <= 0)
    return null

  const summit = summitOf(search.ground, search.reach)

  if (summit.height - search.foot < HILL)
    return null

  const level    = search.foot + (summit.height - search.foot) * search.headroom
  const radii    = smoothRing(traceRing(search, summit, level), SMOOTHING)
  const circuit  = circuitOf(radii)
  const stations = stationsOf(summit, radii, circuit)
  const open     = stations.map(station => founded(search, station))

  // The gates before the runs: a gap cut for a gate can leave a stub of wall on
  // either side of it that is no longer worth building, and the run filter has
  // to see the line the way it will actually stand.
  const gates = openGates(search, stations, open, crossingsOf(summit, radii, stations.length, walked))
  const runs  = runsOf(stations, open)
  const built = runs.reduce((total, run) => total + lengthOf(run), 0)

  if (built < SHORTEST_DYKE)
    return null

  return {
    summit:   { x: summit.x, z: summit.z },
    level,
    ring:     stations,
    runs,
    length:   built,
    circuit,
    encloses: areaOf(stations),
    gates:    gates.filter(gate => runs.some(run =>
      run.some(point => Math.hypot(point.x - gate.x, point.z - gate.z) < search.gateway))),
  }
}

/**
 * Open the wall wherever a worn route crosses it, and say where the gates
 * stand.
 *
 * Mutates `open`, which is the one place in this module that does — the gaps a
 * gate leaves and the gaps the ground leaves are the same thing to everything
 * downstream, and keeping them in two arrays is how a run comes out with a gate
 * standing in the middle of it.
 *
 * A crossing on ground that was never going to carry wall is not a gate. That
 * is the common case rather than the odd one: the path from the yard to the
 * meadow crosses the ring exactly where the meadow's own wall has already taken
 * the ground, and a gate there would be a gate into a gateway.
 */
function openGates (
  search:    DykeSearch,
  stations:  readonly Vec2[],
  open:      boolean[],
  crossings: readonly number[],
): DykeGate[] {
  const gates: DykeGate[] = []
  const half              = Math.max(1, Math.round(search.gateway / 2 / STATION))

  for (const at of crossings) {
    if (!open[at])
      continue

    gates.push({
      x:       stations[at].x,
      z:       stations[at].z,
      // The station's own bearing round the ring, which is the outward radial
      // by construction — every station is a radius on a bearing.
      bearing: at / stations.length * TAU,
    })

    for (let step = -half; step <= half; step += 1)
      open[(at + step + stations.length) % stations.length] = false
  }

  return gates
}
