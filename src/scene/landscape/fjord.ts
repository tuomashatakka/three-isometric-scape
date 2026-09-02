import { smoothstep } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import type { Vec2 } from './path.ts'


/**
 * The drowned valley cut into an island.
 *
 * Every other piece of water in this scape arrived by *not* being land: the sea
 * is what the island falloff leaves behind, and the beck is a channel traced
 * down a hillside that the terrain then follows. A fjord is neither. It is a
 * trench cut clean through the coast and well below the seabed outside it, so
 * the ground has to be told about it before anything is decided *on* that
 * ground — otherwise a farm gets sited in the middle of it.
 *
 * Which is why this is a term in the raw ground rather than a landform folded
 * into the composite field the way `strand.ts` and `skerry.ts` are. Those two
 * are between the islands, where nothing is ever surveyed; this one is *in* one,
 * where everything is. `baseAt` in `layout.ts` is the one place the raw ground
 * is read — by the height field the terrain is built from and by every placement
 * search that has to guess at that ground before it exists — so the carve goes
 * there, once, and the yard, the plots, the track, the pasture, the beck, the
 * paths and the jetty all avoid the water for nothing.
 *
 * Everything downstream inherits it the same way: the bathymetry mask bakes off
 * the field so the sea knows how deep the basin is, the depth tint darkens over
 * it, the ferry lanes test clearance so they can use it, the scatter's own
 * minimum heights keep the trees out of it, and `scape:map` samples the field so
 * the inlet draws in ascii without the script being told.
 *
 * ## the shape is a real one
 *
 * A glacier cuts deepest where it was thickest and dumps its moraine where it
 * stopped, so a fjord is not a ramp: it is an overdeepened basin behind a *sill*
 * at the mouth, shallower than the basin and often shallower than the open sea
 * outside it. Behind the basin the floor climbs back through the waterline into
 * a dry valley, which is what keeps the head from being a wall with a lake
 * against it.
 *
 * Only two of those three depths can be *seen*, and that is worth knowing before
 * retuning any of them: the depth channel of the shore mask saturates a few
 * metres down (`MAX_DEPTH`), so the sill, the basin and the open sea are painted
 * the same blue however far apart they are in metres. What the eye gets is the
 * coastline the trench cuts, the shelf over the bar where the water is shallow
 * enough to read at all, and the walls. What the *numbers* get is all three —
 * see `fjordStats` in `scripts/scape-map.ts`, which is where a drowned sill
 * would be caught.
 */
export interface Fjord {

  /** Where the inlet meets the open sea, in the island's own frame. */
  mouth: Vec2

  /** Where its floor has climbed back out of the water. */
  head: Vec2

  /** Mouth to head, in metres. */
  length: number

  /**
   * How much of that length is spent crossing the falloff before the inlet is
   * cut into ground the island actually holds, 0..1.
   *
   * The seam every other number here is measured from — see {@link SILL_END}.
   */
  shoreAt: number

  /** The centreline at a point along the inlet, 0 at the mouth and 1 at the head. */
  pointAt(at: number): Vec2

  /**
   * The floor at a point along the inlet, in absolute world height.
   *
   * What the carve *asks* for rather than what the ground gives it: past the
   * head the floor stands above the hillside and the carve leaves the hillside
   * alone, because a trench may only ever cut downward.
   */
  floorAt(at: number): number

  /** Half-width of the trench at a point along it, in metres. */
  halfWidthAt(at: number): number
}


/**
 * Where the mouth is anchored, as a fraction of the half-extent past
 * `islandOuter`.
 *
 * Outside the coast on every bearing, which is what makes the inlet open to the
 * sea rather than to a bay it has to find first. The island falloff has finished
 * out here, so the taper that ends the trench seaward of this is under open
 * water and cannot be seen.
 */
const MOUTH_MARGIN = 0.06

/**
 * Where the sill ends and the basin has fully opened, as a fraction of the
 * inlet's *inland* reach rather than of its whole length.
 *
 * The distinction is the one thing about this shape that had to be measured
 * rather than authored. The island falloff drowns everything outside
 * `islandInner` toward the seabed, and it does that to the trench's floor as
 * readily as to the hillside — so a sill written at a fraction of the length
 * lands in the falloff band, is pulled down to the seabed with everything else
 * around it, and the scape gets a fjord with no bar across its mouth. Measured
 * from the shore inward, the sill stands where the ground is fully island and
 * the water over it is the four metres it was asked for.
 */
const SILL_END = 0.18
const BASIN_AT = 0.35

/** Where the basin ends and the floor starts climbing toward the head. */
const BASIN_END = 0.62

/**
 * How far above mean water the valley floor at the head stands, as a fraction
 * of the basin's depth.
 *
 * Above the waterline on purpose. A floor that climbed to exactly mean water
 * would leave the head as a pool with no outflow; a floor that climbed past it
 * is a valley the hillside meets, and the carve stops of its own accord as soon
 * as the floor it wants is higher than the ground already is.
 */
const HEAD_LIFT = 0.34

/** Fraction of the half-width that is floor. The rest is wall. */
const FLOOR_SHARE = 0.58

/** How much wider the entrance is than the reach behind it. */
const MOUTH_FLARE = 0.42

/** How much of its half-width the inlet has lost by the head. */
const HEAD_TAPER = 0.45

/** How far seaward of the mouth the trench fades out, along the inlet. */
const MOUTH_FADE = 0.14


/** Radians, and the direction the mouth faces from the island's middle. */
function bearingOf (config: ScapeConfig): number {
  return config.terrain.fjord.bearing * Math.PI / 180
}

/** Metres from the island's middle to the mouth. */
function anchorOf (config: ScapeConfig): number {
  const { size, islandOuter } = config.terrain

  return size * 0.5 * (islandOuter + MOUTH_MARGIN)
}

/**
 * How much of the inlet is spent crossing the falloff, 0..1.
 *
 * Everything seaward of this is drowned to the seabed by the island falloff
 * whatever the trench asks for, so it is where the *inland* reach starts and
 * where the shape below is measured from. See {@link SILL_END}.
 *
 * Floored well under 1 so an inlet shorter than its own island's falloff band
 * still resolves to a shape rather than to a division by nothing — a fjord that
 * cannot reach the land is a fjord with no basin, which the depth profile then
 * says by itself.
 */
function shoreShareOf (config: ScapeConfig): number {
  const { size, islandInner, islandOuter, fjord } = config.terrain

  const crossing = (islandOuter + MOUTH_MARGIN - islandInner) * size * 0.5

  return Math.min(0.85, crossing / Math.max(1, fjord.length))
}

/** Fraction of the inland reach at a point along the inlet, 0 at the shore. */
function inlandAt (config: ScapeConfig, at: number): number {
  const shore = shoreShareOf(config)

  return Math.min(1, Math.max(0, (at - shore) / (1 - shore)))
}

/**
 * How much of the basin's depth is in use at a point along the inland reach.
 *
 * The sill, then the basin, then the climb out — and the climb runs past 1 into
 * negative depth, which is the floor standing above mean water at the head. See
 * {@link HEAD_LIFT}.
 */
function depthFraction (inland: number, sill: number): number {
  if (inland <= SILL_END)
    return sill

  if (inland <= BASIN_AT)
    return sill + (1 - sill) * smoothstep(SILL_END, BASIN_AT, inland)

  return 1 - (1 + HEAD_LIFT) * smoothstep(BASIN_END, 1, inland)
}

/**
 * Half-width at a point along the inland reach.
 *
 * Widest at the shore and narrowing all the way to the head, which is the one
 * thing every drowned valley looks like from above. Measured from the shore for
 * the reason the depth is: the entrance is where the coast is, not where the
 * centreline happens to start.
 */
function halfWidth (inland: number, width: number): number {
  return width * (1 + MOUTH_FLARE * (1 - smoothstep(0, 0.22, inland))) * (1 - HEAD_TAPER * inland)
}

/** Lateral offset of the centreline from the straight chord, in metres. */
function bendAt (config: ScapeConfig, at: number): number {
  const { bend, width } = config.terrain.fjord

  return bend * width * Math.sin(Math.PI * at)
}

/**
 * The inlet, or `null` on an island with none.
 *
 * For the instruments and the tests. Nothing in the build path calls it: the
 * carve is a closed-form pair of dot products and has no survey to consult,
 * which is what lets it run per vertex and per placement probe without a cache
 * or a module-level anything.
 */
export function surveyFjord (config: ScapeConfig): Fjord | null {
  const { fjord, waterLevel } = config.terrain

  if (fjord.depth <= 0)
    return null

  const angle  = bearingOf(config)
  const cos    = Math.cos(angle)
  const sin    = Math.sin(angle)
  const anchor = anchorOf(config)

  function pointAt (at: number): Vec2 {
    const along  = anchor - at * fjord.length
    const offset = bendAt(config, at)

    // `+v` is the left-hand side of the inward walk, the same axis the carve
    // measures across. See the frame in `carveFjord`.
    return {
      x: cos * along - sin * offset,
      z: sin * along + cos * offset,
    }
  }

  return {
    mouth:  pointAt(0),
    head:   pointAt(1),
    length: fjord.length,
    pointAt,

    floorAt (at) {
      return waterLevel - fjord.depth * depthFraction(inlandAt(config, at), fjord.sill)
    },

    halfWidthAt (at) {
      return halfWidth(inlandAt(config, at), fjord.width)
    },

    shoreAt: shoreShareOf(config),
  }
}

/**
 * Cut the inlet into a raw ground height.
 *
 * Only ever downward, for the reason the beck's channel is: the ground outside
 * the coast is already lower than any floor this would ask for, and blending
 * toward it there would build a causeway out to sea.
 *
 * `depth = 0` returns the height untouched on the first line, which is the
 * switch and the only one — an island without a fjord costs two field reads and
 * a comparison.
 */
export function carveFjord (config: ScapeConfig, x: number, z: number, height: number): number {
  const { fjord, waterLevel } = config.terrain

  if (fjord.depth <= 0)
    return height

  const angle = bearingOf(config)
  const cos   = Math.cos(angle)
  const sin   = Math.sin(angle)

  // The inlet's own frame: `along` runs inward from the mouth and `across` runs
  // to the left of that walk. Resolved from the config every call rather than
  // surveyed once, because the whole axis is a point, a bearing and a length.
  const dx     = x - cos * anchorOf(config)
  const dz     = z - sin * anchorOf(config)
  const along  = -(dx * cos + dz * sin)
  const across = dz * cos - dx * sin

  const at = along / fjord.length

  if (at < -MOUTH_FADE * 2 || at > 1)
    return height

  const held    = Math.min(1, Math.max(0, at))
  const inland  = inlandAt(config, held)
  const edge    = halfWidth(inland, fjord.width)
  const lateral = Math.abs(across - bendAt(config, held))

  // The wall is the outer part of the half-width, and how much of it is wall is
  // what makes a fjord read as cut rather than as scooped.
  const section = 1 - smoothstep(edge * FLOOR_SHARE, edge, lateral)
  const claim   = section * smoothstep(-MOUTH_FADE, 0, at)

  if (claim <= 0)
    return height

  const floor = waterLevel - fjord.depth * depthFraction(inland, fjord.sill)

  return Math.min(height, height + (floor - height) * claim)
}

// perf: two dot products, one smoothstep pair and no allocation per call. Runs
// per terrain vertex and per placement probe on every island, including the four
// that have no fjord at all — which is what the first-line return is for.
