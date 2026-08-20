import { smoothstep } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { coastWarp, sampleHeight } from '../noise.ts'
import { MASSIF, distanceToTrack, liftRadiusOf, plotInfluence, sinkToIsland } from './layout.ts'
import type { ScapeLayout } from './layout.ts'


/**
 * The authored ground.
 *
 * `noise.ts` still owns the raw fBm; this layer is what turns a landscape into
 * a *place* — it shelves the shore, levels the field plots, flattens the yard
 * the buildings stand on, and grades a track between them.
 *
 * Everything downstream calls `heightAt`: the terrain vertices, the click-to-
 * focus raycast fallback, and every placement query. That is deliberate. Three
 * separate approximations of the ground is how props end up buried.
 */
export interface HeightField {
  heightAt(x: number, z: number): number

  /** Absolute gradient magnitude — drives the granite-on-steep-faces rule. */
  slopeAt(x: number, z: number): number

  /**
   * Which way the ground faces, as a unit vector written into `target`.
   *
   * The same two differences {@link HeightField.slopeAt} takes, kept rather than
   * collapsed to a magnitude — a slope says *how steep*, and anything standing
   * on the ground also needs *which way*. Every scattered stone, stump and
   * cobble is tipped by this, which is the difference between a boulder resting
   * on a hillside and a boulder standing to attention on one.
   *
   * Writes into a caller-owned record because it runs tens of thousands of times
   * during a build, exactly as the samplers do.
   */
  normalAt(x: number, z: number, target: GroundNormal): GroundNormal
}

/** A unit normal in the ground plane's frame. Deliberately not a `three` type. */
export interface GroundNormal {
  x: number
  y: number
  z: number
}

/** Fraction of an islet's radius held at full height before the skirt starts. */
const ISLE_PLATEAU  = 0.55

/**
 * How far an islet's own shore wanders from its circle, as a fraction of radius.
 *
 * The mainland's coast is warped for the obvious reason; a ring of perfect discs
 * around it would give the game away just as completely, and at this scale more
 * visibly — a small island is nearly all coastline. Kept under the plateau
 * fraction so the warp can only reshape the skirt, never eat the crown.
 */
const ISLE_REACH    = 0.34
const TRACK_DEPTH   = 0.26
const YARD_STRENGTH = 0.94
const PLOT_STRENGTH = 0.9
const SLOPE_REACH   = 0.75

/**
 * The two questions about the ground's lean, from one pair of differences.
 *
 * Shared by `createHeightField` and by the archipelago's composite field, which
 * previously wrote the same central difference out twice. Two implementations of
 * "which way is downhill" is the sort of duplication that stays correct right up
 * until one of them is retuned.
 */
export function surfaceQueries (
  heightAt: (x: number, z: number) => number,
): Pick<HeightField, 'slopeAt' | 'normalAt'> {
  // Caller-owned scratch of its own: both readers run per vertex and per
  // placement, and neither can afford a pair of allocations to answer.
  const gradient = { dx: 0, dz: 0 }

  function sample (x: number, z: number): void {
    gradient.dx = (heightAt(x + SLOPE_REACH, z) - heightAt(x - SLOPE_REACH, z)) / (SLOPE_REACH * 2)
    gradient.dz = (heightAt(x, z + SLOPE_REACH) - heightAt(x, z - SLOPE_REACH)) / (SLOPE_REACH * 2)
  }

  return {
    slopeAt (x, z) {
      sample(x, z)
      return Math.hypot(gradient.dx, gradient.dz)
    },

    normalAt (x, z, target) {
      sample(x, z)

      // The normal of a height field is `(-dh/dx, 1, -dh/dz)`, normalised. The
      // signs are the same ones `textures/normals.ts` is written down for.
      const length = Math.hypot(gradient.dx, 1, gradient.dz)

      target.x = -gradient.dx / length
      target.y = 1 / length
      target.z = -gradient.dz / length
      return target
    },
  }
}

function smoothProfile (values: number[], passes: number): number[] {
  let current = values

  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.slice()

    for (let index = 1; index < current.length - 1; index += 1)
      next[index] = (current[index - 1] + current[index] * 2 + current[index + 1]) / 4

    current = next
  }

  return current
}

/**
 * A running minimum — the one rule water has.
 *
 * The descent that traced the beck obeys the *raw* fBm, and the ground it is
 * carved into is not that: the shore shelving lifts the bank, and an islet
 * dropped in the mouth's way raises the seabed under it by several metres. Left
 * alone the channel inherits those rises and the scape gets a stream running
 * up over a bar and back down again. Clamping the long profile to fall the
 * whole way is what makes the beck cut *through* whatever is in front of it,
 * which is what a beck does.
 */
function fallOnly (profile: number[]): number[] {
  let floor = Infinity

  return profile.map(level => {
    floor = Math.min(floor, level)
    return floor
  })
}

/** One islet, resolved out of the config's fractions and into metres. */
export interface IsleSite {
  x:      number
  z:      number
  radius: number

  /** Height of the plateau above the water, as metres of absolute height. */
  crown: number

  /** The islet's own coast warp seed. */
  seed: number
}

/**
 * Islets, resolved from fractions into metres once.
 *
 * Each carries a seed of its own so the ring is a set of different islands
 * rather than one island stamped out at fifteen bearings — with a shared seed
 * the warp is a function of world position, which at this scale is nearly
 * constant across a single islet and would only nudge the whole disc sideways.
 *
 * Exported because the ground is no longer the only reader: `beacon.ts` picks
 * the rock the light stands on out of this list, and a second conversion of the
 * same fractions is a tower built on an islet that is not where it thinks it is.
 */
export function resolveIsles (config: ScapeConfig): IsleSite[] {
  const half = config.terrain.size * 0.5

  return config.terrain.isles.map((isle, index) => ({
    x:      isle.x * half,
    z:      isle.z * half,
    radius: isle.radius * half,
    crown:  config.terrain.waterLevel + isle.height,
    seed:   config.seed ^ 0x9e37 + index * 0x4f1b,
  }))
}

export function createHeightField (config: ScapeConfig, layout: ScapeLayout): HeightField {
  const { waterLevel, shoreBand } = config.terrain
  const { yard, track }           = layout
  const corridor                  = track.width * 1.7
  const lift                      = liftRadiusOf(config)

  const isles = resolveIsles(config)

  /** Base fBm, sunk into an island, shelved at the waterline, then levelled. */
  function graded (x: number, z: number): number {
    let height = sampleHeight(x, z, config.seed, config.terrain.height, lift, MASSIF)

    // Drown the rim. `sinkToIsland` lives in `layout.ts` because the placement
    // searches there have to agree with this exactly — see its own note.
    height = sinkToIsland(config, x, z, height)

    // Raise the islets *after* the falloff. Doing it before would drown them
    // along with the rim — the whole point of the rim drowning is that it is
    // unconditional, so anything meant to survive out there has to come later.
    //
    // The profile is a plateau with a skirt, not a dome. A dome spends nearly
    // all of its disc underwater: the seabed is seven metres down and the crown
    // is two metres up, so the blend has to reach ~0.7 before the ground breaks
    // the surface at all, and a smooth dome only does that near its very
    // centre — which is how an islet with an eleven-metre radius surfaces as a
    // one-metre pebble. Holding the blend at 1 across the inner half puts the
    // waterline out at roughly 0.72 of the radius, where you asked for it.
    for (const isle of isles) {
      // Warped like the mainland's, in the islet's own frame. The local
      // coordinates are scaled up before the warp is sampled because the warp's
      // wavelength is sized for a coastline tens of metres long, and an islet is
      // a tenth of that — sampled at world scale it would return the same value
      // across the whole disc and move the shore nowhere.
      const dx       = x - isle.x
      const dz       = z - isle.z
      const warp     = coastWarp(dx * 7, dz * 7, isle.seed) * ISLE_REACH
      const distance = Math.hypot(dx, dz) - warp * isle.radius

      if (distance >= isle.radius)
        continue

      const claim = 1 - smoothstep(isle.radius * ISLE_PLATEAU, isle.radius, distance)
      height += (isle.crown + sampleHeight(x, z, config.seed ^ 0x1d3f, 1.4) - height) * claim
    }

    // Shelve the *bank* into a beach, but let the basin keep falling away.
    // Flattening both sides of the waterline is what turns a lake into a
    // puddle — and a puddle is all foam and no water.
    const fromWater = height - waterLevel

    height = fromWater >= 0
      ? waterLevel + fromWater * (0.44 + 0.56 * smoothstep(shoreBand, shoreBand * 2.2, fromWater))
      : waterLevel + fromWater * 1.3

    for (const plot of layout.plots) {
      const claim = plotInfluence(plot, x, z)

      if (claim > 0)
        height += (plot.level - height) * claim * PLOT_STRENGTH
    }

    const fromYard = Math.hypot(x - yard.x, z - yard.z)
    const onYard   = 1 - smoothstep(yard.radius * 0.62, yard.radius * 1.25, fromYard)

    if (onYard > 0)
      height += (yard.level - height) * onYard * YARD_STRENGTH

    return height
  }

  // The road grade is sampled from the already-levelled ground and smoothed, so
  // the track never inherits a bump the surrounding terrain still has.
  const profile = smoothProfile(
    track.points.map(point => graded(point.x, point.z)),
    4,
  )

  function trackLevelAt (x: number, z: number): number {
    const points = track.points
    let bestDistance = Infinity
    let bestLevel    = 0

    for (let index = 0; index < points.length - 1; index += 1) {
      const a        = points[index]
      const b        = points[index + 1]
      const dx       = b.x - a.x
      const dz       = b.z - a.z
      const lengthSq = dx * dx + dz * dz

      const t = lengthSq === 0
        ? 0
        : Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq))

      const distance = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t))

      if (distance < bestDistance) {
        bestDistance = distance
        bestLevel    = profile[index] + (profile[index + 1] - profile[index]) * t
      }
    }

    return bestLevel
  }

  // The beck's own long profile, sampled from the ground it runs through and
  // smoothed the way the road grade is — and for the same reason. A channel cut
  // to the raw fBm inherits every bump the hillside has, and a watercourse that
  // goes up and down again is the one thing water cannot do.
  const { creek } = layout

  // Four passes, the same as the road grade and for the same reason. More is
  // tempting on a course this short and it is a trap: eight passes over
  // fourteen points is very nearly one average, and a long profile averaged
  // flat carves a level canal instead of a beck.
  const bedProfile = creek
    ? fallOnly(smoothProfile(creek.points.map(point => graded(point.x, point.z)), 4))
    : []

  /** The floor the channel wants at a course position, in world height. */
  function bedLevel (at: number, course: number): number {
    const index  = Math.min(Math.floor(at), bedProfile.length - 2)
    const local  = at - index
    const ground = bedProfile[index] + (bedProfile[index + 1] - bedProfile[index]) * local

    const cut = ground - (creek?.incisionAt(course) ?? 0)

    // The tidal reach is dredged to a floor rather than merely incised: an
    // inlet is a hole the sea sits in, and incision alone only ever tracks the
    // ground down, which near the shore is already nearly flat.
    const tide = creek?.tideFloor ?? cut
    return Math.min(cut, cut + (tide - cut) * (creek?.tideAt(course) ?? 0))
  }

  function heightAt (x: number, z: number): number {
    const height   = graded(x, z)
    const distance = distanceToTrack(layout, x, z)

    const levelled = distance >= corridor
      ? height
      : height + (trackLevelAt(x, z) - TRACK_DEPTH - height) *
        (1 - smoothstep(track.width * 0.5, corridor, distance))

    if (!creek || bedProfile.length < 2)
      return levelled

    // Carved *after* the track, never before. The road grade is sampled from a
    // ground that has no channel in it, so levelling the track second would
    // fill the crossing back in and leave the bridge spanning a puddle; this
    // way the beck cuts under the track and the bridge has something to cross.
    const sample = creek.sampleAt(x, z)

    if (sample.claim <= 0)
      return levelled

    // Only ever downward. Past the mouth the seabed is already lower than any
    // floor the channel would ask for, and blending toward it there would build
    // a causeway out into the sea.
    return Math.min(levelled, levelled + (bedLevel(sample.at, sample.course) - levelled) * sample.claim)
  }

  return { heightAt, ...surfaceQueries(heightAt) }
}
