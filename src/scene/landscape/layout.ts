import { createSeededRng, smoothstep } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { coastWarp, sampleHeight } from '../noise.ts'
import { createCreek } from './creek.ts'
import type { Creek } from './creek.ts'
import { MILL_FOOTING, findMillSite } from './mill.ts'
import type { MillSite } from './mill.ts'
import { distanceToPath, smoothPath } from './path.ts'
import type { Vec2 } from './path.ts'


/** The flattened shelf the buildings stand on. */
export interface Yard extends Vec2 {
  radius: number
  level:  number
}

/** One levelled field plot. */
export interface Plot extends Vec2 {
  halfW:    number
  halfD:    number
  rotation: number
  level:    number
}

/** A wooded high point — conifers cluster toward these. */
export interface Ridge extends Vec2 {
  radius: number
}

/** The walled hay meadow up on the high ground. */
export interface Pasture extends Vec2 {
  radius: number
  level:  number

  /** Bearing from the pasture back to the yard — where the wall is left open. */
  gateway: number
}

/** The authored composition, resolved once from the seed. */
export interface ScapeLayout {
  yard:   Yard
  track:  { points: readonly Vec2[], width: number }
  plots:  readonly Plot[]
  ridges: readonly Ridge[]

  /** The upland pasture, or `null` if this island has no room for one. */
  pasture: Pasture | null

  /** The windmill's shoulder, or `null` if the island has no exposed rise. */
  mill: MillSite | null

  /** The beck running off the high ground, or `null` if no ridge fed one. */
  creek:  Creek | null
  extent: number

  /** Radius inside which the ground is reliably above water. */
  landRadius: number
  waterLevel: number
  shoreBand:  number
}

// Probe grids, not probe spacings — so an island that grows without these
// growing with it is an island searched at coarser resolution for the same
// features. Sized to hold roughly the spacing they had at the island this
// composition was first tuned on.
const YARD_PROBES = 32
const TRACK_STEPS = 26

/**
 * The radius the central massif's lift reaches to, in metres. See `noise.ts`.
 *
 * The mean coastline rather than either threshold — the lift is what gives the
 * island high ground in its middle, so it should reach to about where the island
 * ends on an average bearing.
 */
export function liftRadiusOf (config: ScapeConfig): number {
  const { size, islandInner, islandOuter } = config.terrain

  return size * 0.25 * (islandInner + islandOuter)
}

/**
 * How much of the terrain amplitude the central massif is worth.
 *
 * Twice what the sampler assumes on its own, because this island is twice the
 * ground it was. The fBm averages to nothing at any size, so the lift is the
 * only thing standing between a large island and a large *flat* island — and a
 * flat island has no upland for a pasture, no hillside for a beck, and no
 * reason for the farm to be where the farm is.
 */
export const MASSIF = 0.34

function baseAt (config: ScapeConfig, x: number, z: number): number {
  return sampleHeight(x, z, config.seed, config.terrain.height, liftRadiusOf(config), MASSIF)
}

/**
 * How far the coast may wander from the circle, as a fraction of the band
 * between `islandInner` and `islandOuter`.
 *
 * Two thirds of the band. At a third the island is a disc with a wobble; at one
 * the bays reach the inner radius and the island has no guaranteed middle left
 * at all. The number is not free to choose on its own — `landRadiusOf` subtracts
 * it back off to find the ground that is dry at *every* bearing, so raising this
 * makes a raggeder coast around a smaller buildable core, and the config's
 * `islandInner` has to pay for it.
 */
const COAST_REACH = 0.65

/**
 * Sink a raw fBm height into the island.
 *
 * The falloff drowns the rim unconditionally, and it is radial while the
 * terrain plane is square — deliberately, so the corners end up well past
 * `islandOuter` and the plane's own straight edges are always far under water
 * rather than reading as the edge of the world.
 *
 * Radial, but not *circular*. The bearing-dependent warp is what turns a disc
 * into a coastline: the falloff moves out into headlands and in into bays, and
 * because every other part of the scape is written against this function rather
 * than against a radius, all of them inherit the shape. The beach shelves along
 * it, the foam follows it, the scatter searches respect it, and the mist's land
 * mask is cut by it — none of which had to be told.
 *
 * `height.ts` builds the ground with this, and the layout searches ask it what
 * the ground *will* be before that ground exists. Two approximations of the
 * same falloff is how a wall gets sited on land that turns out to be sea.
 */
export function sinkToIsland (config: ScapeConfig, x: number, z: number, height: number): number {
  const { size, waterLevel, seabedDrop, islandInner, islandOuter } = config.terrain

  const seabed = waterLevel - seabedDrop
  const reach  = (islandOuter - islandInner) * COAST_REACH

  // Subtracted from the *distance* rather than added to the thresholds, which is
  // the same arithmetic and a different thing to read: a headland is ground that
  // is nearer the middle than it looks.
  const radius = Math.hypot(x, z) / (size * 0.5) - coastWarp(x, z, config.seed) * reach
  const land   = 1 - smoothstep(islandInner, islandOuter, radius)

  return seabed + (height - seabed) * land
}

/** The ground as the falloff leaves it, before any of the authored levelling. */
function sunkAt (config: ScapeConfig, x: number, z: number): number {
  return sinkToIsland(config, x, z, baseAt(config, x, z))
}

/**
 * Local roughness, sampled as the spread of four neighbours.
 *
 * The yard search wants the flattest *buildable* patch, not the flattest point —
 * a single vertex in a saddle is flat and useless. Sampling at the building
 * scale (six units out) is what makes the result somewhere a barn could stand.
 */
function roughness (config: ScapeConfig, x: number, z: number, reach: number): number {
  const centre = baseAt(config, x, z)
  let worst = 0

  for (const [ dx, dz ] of [[ reach, 0 ], [ -reach, 0 ], [ 0, reach ], [ 0, -reach ]])
    worst = Math.max(worst, Math.abs(baseAt(config, x + dx, z + dz) - centre))

  return worst
}

/**
 * The radius that is dry whichever way you walk, in metres.
 *
 * Every placement search treats this as solid ground, so it has to be the
 * *worst* bearing rather than the average one. Before the coast was warped that
 * was simply `islandInner`; now a bay can cut a whole `COAST_REACH` of the
 * falloff band inward, and a search that still trusted the old number sited a
 * walled meadow with a third of its wall standing in the sea.
 */
function landRadiusOf (config: ScapeConfig): number {
  const { size, islandInner, islandOuter } = config.terrain

  return size * 0.5 * (islandInner - (islandOuter - islandInner) * COAST_REACH)
}

function findYard (config: ScapeConfig): Yard {
  const extent = config.terrain.size * 0.5
  const reach  = config.layout.yardRadius * 0.55
  const limit  = landRadiusOf(config) * 0.52

  let best  = { x: 0, z: 0, score: -Infinity }

  for (let ix = 0; ix < YARD_PROBES; ix += 1)
    for (let iz = 0; iz < YARD_PROBES; iz += 1) {
      const x = -limit + ix / (YARD_PROBES - 1) * limit * 2
      const z = -limit + iz / (YARD_PROBES - 1) * limit * 2

      const height  = baseAt(config, x, z)
      const dryness = height - config.terrain.waterLevel

      if (dryness < 1.4)
        continue

      const score = -roughness(config, x, z, reach) * 2.4 -
        Math.abs(dryness - 2.6) * 0.5 -
        Math.hypot(x, z) / extent * 1.1

      if (score > best.score)
        best = { x, z, score }
    }

  return {
    x:      best.x,
    z:      best.z,
    radius: config.layout.yardRadius,
    level:  baseAt(config, best.x, best.z),
  }
}

function buildTrack (config: ScapeConfig, yard: Yard, wander: number): Vec2[] {
  const extent  = landRadiusOf(config)
  const heading = Math.atan2(yard.z, yard.x) || 0.6

  // The track runs out to the shore, not to the edge of the plane — past the
  // island falloff there is nothing but seabed to grade.
  const entry = { x: Math.cos(heading) * extent, z: Math.sin(heading) * extent }

  const control: Vec2[] = [ entry ]

  for (const t of [ 0.34, 0.66 ]) {
    const nx   = yard.x + (entry.x - yard.x) * t
    const nz   = yard.z + (entry.z - yard.z) * t
    const sway = (t === 0.34 ? 1 : -1) * wander * extent * 0.16

    control.push({
      x: nx + Math.cos(heading + Math.PI / 2) * sway,
      z: nz + Math.sin(heading + Math.PI / 2) * sway,
    })
  }

  control.push({ x: yard.x, z: yard.z })
  return smoothPath(control, TRACK_STEPS)
}

function buildPlots (config: ScapeConfig, yard: Yard, seed: number): Plot[] {
  const rng           = createSeededRng(seed)
  const plots: Plot[] = []
  const extent        = landRadiusOf(config)

  // Fields sit between the yard and the middle of the map, never out past the
  // rim — a plot that runs off the edge of the world reads as a bug, not a farm.
  const inward = Math.atan2(-yard.z, -yard.x)

  for (let index = 0; index < config.layout.plotCount * 12 && plots.length < config.layout.plotCount; index += 1) {
    const angle    = inward + rng.range(-1.5, 1.5)
    const halfW    = rng.range(5.5, 8.5)
    const halfD    = rng.range(4.5, 6.5)
    const distance = yard.radius + Math.hypot(halfW, halfD) * 0.8 + rng.range(0.5, 4)

    const x = yard.x + Math.cos(angle) * distance
    const z = yard.z + Math.sin(angle) * distance

    if (Math.hypot(x, z) + Math.max(halfW, halfD) > extent)
      continue

    const level = baseAt(config, x, z)

    if (level < config.terrain.waterLevel + 1.2)
      continue
    if (roughness(config, x, z, Math.max(halfW, halfD) * 0.6) > config.terrain.height * 0.42)
      continue
    if (plots.some(plot => Math.hypot(plot.x - x, plot.z - z) < (Math.max(halfW, plot.halfW) + Math.max(halfD, plot.halfD)) * 0.78))
      continue

    plots.push({ x, z, halfW, halfD, rotation: angle + rng.range(-0.3, 0.3), level })
  }

  return plots
}

function findRidges (config: ScapeConfig, yard: Yard): Ridge[] {
  const extent                                            = landRadiusOf(config) * 0.95
  const probes                                            = 18
  const found: { x: number, z: number, height: number }[] = []

  for (let ix = 0; ix < probes; ix += 1)
    for (let iz = 0; iz < probes; iz += 1) {
      const x = -extent + ix / (probes - 1) * extent * 2
      const z = -extent + iz / (probes - 1) * extent * 2

      if (Math.hypot(x - yard.x, z - yard.z) < yard.radius * 2.1)
        continue

      found.push({ x, z, height: baseAt(config, x, z) })
    }

  found.sort((a, b) => b.height - a.height)

  const ridges: Ridge[] = []

  for (const candidate of found) {
    if (ridges.length >= 5)
      break
    if (ridges.some(ridge => Math.hypot(ridge.x - candidate.x, ridge.z - candidate.z) < 15))
      continue

    ridges.push({ x: candidate.x, z: candidate.z, radius: 16 })
  }

  return ridges
}

const PASTURE_PROBES = 40
const RING_PROBES    = 12

/**
 * Whether the wall line itself stands on dry ground all the way round.
 *
 * The centre being high says nothing about the ring — a shoulder above a cove
 * is exactly the shape that scores well and has a quarter of its enclosure in
 * the water.
 */
function ringIsDry (config: ScapeConfig, x: number, z: number, radius: number): boolean {
  for (let step = 0; step < RING_PROBES; step += 1) {
    const angle = step / RING_PROBES * Math.PI * 2
    const level = sunkAt(config, x + Math.cos(angle) * radius, z + Math.sin(angle) * radius)

    // Measured against the ground *before* the beach shelving, which is the
    // only ground this search has — `height.ts` compresses the first metre or so
    // above the waterline to about 0.44 of its height to make a beach, and it
    // does that after every placement decision has already been taken. A ring
    // cleared at a metre of raw height comes back at half a metre of built
    // height, which is a wall standing in the surf. The margin is what that
    // compression costs, paid in advance.
    if (level < config.terrain.waterLevel + 1.9)
      return false
  }

  return true
}

/**
 * The upland pasture: high, flat, dry ground that the farm is not already using.
 *
 * Searched the way the yard is, and against the same raw fBm — but the search
 * stays inside `landRadius`, where the island falloff has not started taking
 * height away yet, so `baseAt` is the honest ground there. Past that the sampled
 * height and the built height diverge, and a meadow can be sited on land that
 * turns out to be under water.
 *
 * @returns The best qualifying centre, or `null` when the island has no room —
 *   a smaller world, a wider yard or a larger `pastureRadius` can all mean there
 *   is nowhere left, and the caller has to cope with that rather than the search
 *   quietly relaxing a rule to produce an answer.
 */
function findPasture (
  config: ScapeConfig,
  yard:   Yard,
  plots:  readonly Plot[],
  track:  readonly Vec2[],
): Pasture | null {
  const radius = config.layout.pastureRadius

  // The whole *disc* has to be inside `landRadius`, not just its centre. A
  // centre sited by its own height alone puts a wall thirty metres long out
  // past the island falloff, where the sampled ground and the built ground
  // stop agreeing — the first version of this search drowned a third of the
  // enclosure and the centre it chose was five metres of dry hillside.
  const landRadius = landRadiusOf(config)

  // Searched out to the *mean* coastline rather than to the radius that is dry
  // at every bearing, because unlike the yard search this one verifies its
  // ground: `ringIsDry` walks the whole enclosure and `dryness` gates the
  // centre, so a candidate out on a headland is checked rather than assumed, and
  // one in a bay is rejected on the evidence. Held to the guaranteed radius
  // instead, the search cannot reach the high ground of an island whose
  // coastline is not a circle — which is every island.
  const reach = liftRadiusOf(config) - radius

  // Clear of the yard's *graded shelf*, not just of its buildings. The yard
  // levelling reaches 1.25 radii out, so a pasture sited on the buildings alone
  // lands half of its enclosure on ground that has already been flattened to
  // farmyard height — and a walled meadow standing on the farmyard is not a
  // second place, it is a mistake.
  const clear = yard.radius * 0.95 + radius * 0.75

  let best: Pasture | null = null
  let bestScore            = -Infinity

  for (let ix = 0; ix < PASTURE_PROBES; ix += 1)
    for (let iz = 0; iz < PASTURE_PROBES; iz += 1) {
      const x = -reach + ix / (PASTURE_PROBES - 1) * reach * 2
      const z = -reach + iz / (PASTURE_PROBES - 1) * reach * 2

      if (Math.hypot(x, z) > reach)
        continue

      const fromYard = Math.hypot(x - yard.x, z - yard.z)

      if (fromYard < clear)
        continue
      if (distanceToPath(track, x, z) < radius * 0.7)
        continue
      if (plots.some(plot => Math.hypot(plot.x - x, plot.z - z) < Math.max(plot.halfW, plot.halfD) + radius * 0.85))
        continue

      const level   = sunkAt(config, x, z)
      const dryness = level - config.terrain.waterLevel

      // Grazing land, not a summit: the pasture wants to be above the farm and
      // below the scree the terrain painter puts on the high ground.
      if (dryness < 3)
        continue

      const rough = roughness(config, x, z, radius * 0.55)

      if (rough > config.terrain.height * 0.5)
        continue
      if (!ringIsDry(config, x, z, radius))
        continue

      // Distance as a fraction of the island rather than in metres. The three
      // terms are weighed against each other, and two of them are heights — so
      // a raw distance is the one term that changes meaning when the island
      // changes size, and on a larger one it quietly outranks the height it is
      // supposed to be breaking ties on. Grazing land that is merely *far* is
      // not upland.
      const score = dryness * 0.55 - rough * 2.4 + fromYard / landRadius * 1.75

      if (score > bestScore) {
        bestScore = score
        best      = { x, z, radius, level, gateway: Math.atan2(yard.z - z, yard.x - x) }
      }
    }

  return best
}

/**
 * Resolve the whole composition. Pure — same config in, same layout out.
 *
 * The order is a dependency chain, not a preference. The yard is found first
 * because everything else is sited relative to the farm; the track is drawn to
 * it; the fields and the walled meadow are sited on what the farm has not
 * already taken; and the beck comes last, routed around all four.
 *
 * Last, and not first, even though water is the one thing here that genuinely
 * does not negotiate — because the alternative is teaching three separate
 * searches the shape of a channel that does not exist yet. Handing the beck one
 * list of discs to miss says the same thing in one place, and it is why adding
 * a watercourse to this scape moved nothing that was already in it.
 */
export function createScapeLayout (config: ScapeConfig): ScapeLayout {
  const rng     = createSeededRng(config.seed).fork('layout')
  const yard    = findYard(config)
  const track   = buildTrack(config, yard, rng.range(-1, 1))
  const plots   = buildPlots(config, yard, config.seed ^ 0x5c1f)
  const pasture = findPasture(config, yard, plots, track)

  const creek = createCreek(
    config,
    (x, z) => sunkAt(config, x, z),
    track,
    [
      { x: yard.x, z: yard.z, radius: yard.radius * 1.15 },
      ...plots.map(plot => ({ x: plot.x, z: plot.z, radius: Math.max(plot.halfW, plot.halfD) })),
      // Padded by the channel it has to clear, and not by a margin for taste.
      // A disc handed over at exactly the pasture radius is a disc the beck may
      // run tangent to — and the pasture radius *is* the wall line, so tangent
      // means the channel is cut directly under the drystone. The beck missed
      // the meadow by nothing at all and took four metres out from under its
      // eastern wall. What it must miss is the wall plus the water.
      ...pasture ? [{ x: pasture.x, z: pasture.z, radius: pasture.radius + config.creek.width * 2 }] : [],
    ],
  )

  // Last of all, and after the beck rather than before it. The mill is the only
  // thing here that could be put almost anywhere, and the beck is the one thing
  // that cannot be put anywhere at all — siting the mill first and handing the
  // water another disc to miss moved a spring that had been on the same ridge
  // for four runs. What does not negotiate goes first.
  const mill = findMillSite(
    {
      ground:     (x, z) => sunkAt(config, x, z),
      landRadius: landRadiusOf(config),
      waterLevel: config.terrain.waterLevel,
      prominence: config.mill.prominence,
      sweep:      config.mill.sailSpan * 0.5,
    },
    yard,
    [
      { points: track, clearance: config.mill.sailSpan * 0.35 },
      // The trestle clear of the channel, not the sweep. A sail may quite
      // happily turn over running water; four dry-laid piers may not stand in
      // it.
      ...creek ? [{ points: creek.points, clearance: MILL_FOOTING + config.creek.width }] : [],
    ],
    [
      ...plots.map(plot => ({ x: plot.x, z: plot.z, radius: Math.max(plot.halfW, plot.halfD) })),
      ...pasture ? [{ x: pasture.x, z: pasture.z, radius: pasture.radius }] : [],
    ],
  )

  return {
    yard,
    track:      { points: track, width: config.layout.trackWidth },
    plots,
    ridges:     findRidges(config, yard),
    pasture,
    mill,
    creek,
    extent:     config.terrain.size * 0.5,
    landRadius: landRadiusOf(config),
    waterLevel: config.terrain.waterLevel,
    shoreBand:  config.terrain.shoreBand,
  }
}

/**
 * The `y` rotation that points a `+z`-long prop along a world bearing.
 *
 * `rotateY` sends `+z` to `(sin y, cos y)` while a compass bearing points at
 * `(cos a, sin a)` — the two are mirrored about the diagonal, so rotating a
 * jetty by the bearing itself runs it *across* the water it should run into.
 * The same rotation puts a `+x`-long prop broadside to that bearing, which is
 * exactly where a net rack wants to stand.
 */
export function yawAlong (bearing: number): number {
  return Math.PI / 2 - bearing
}

/** Shortest distance from a point to the track centreline, in world units. */
export function distanceToTrack (layout: ScapeLayout, x: number, z: number): number {
  return distanceToPath(layout.track.points, x, z)
}

/** How strongly a plot claims a point, 1 at the centre falling to 0 past its edge. */
export function plotInfluence (plot: Plot, x: number, z: number): number {
  const cos = Math.cos(-plot.rotation)
  const sin = Math.sin(-plot.rotation)
  const dx  = x - plot.x
  const dz  = z - plot.z

  const localX = Math.abs(dx * cos - dz * sin) / plot.halfW
  const localZ = Math.abs(dx * sin + dz * cos) / plot.halfD
  const reach  = Math.max(localX, localZ)

  if (reach >= 1.3)
    return 0

  return reach <= 1
    ? 1
    : 1 - (reach - 1) / 0.3
}

/**
 * How strongly the pasture claims a point, 1 across its middle falling to 0 at
 * the wall. 0 everywhere when the island had no room for one.
 */
export function pastureInfluence (layout: ScapeLayout, x: number, z: number): number {
  const { pasture } = layout

  if (!pasture)
    return 0

  const distance = Math.hypot(x - pasture.x, z - pasture.z)
  return Math.min(1, Math.max(0, (pasture.radius - distance) / (pasture.radius * 0.22)))
}

export type { Vec2 } from './path.ts'

/** Nearest ridge influence, 0..1 — drives conifer density. */
export function ridgeInfluence (layout: ScapeLayout, x: number, z: number): number {
  let best = 0

  for (const ridge of layout.ridges) {
    const distance = Math.hypot(x - ridge.x, z - ridge.z)
    best = Math.max(best, Math.max(0, 1 - distance / ridge.radius))
  }

  return best
}
