import { smoothstep, valueNoise1d } from 'threejs-scene'
import { createSurfaceRibbon, mergeGeometryList } from 'threejs-scene/modules/assets'
import type { BufferGeometry, Color } from 'three'
import { COURSES } from './cropping.ts'
import type { Course } from './cropping.ts'
import type { Plot } from './layout.ts'


/**
 * One rig: a straight ploughed strip across a field plot.
 *
 * Straight, and that is a fact about the thing rather than a simplification.
 * A footpath wanders because the person walking it chose every step; a rig is
 * the line a plough was *held* on for the length of a field, and the whole
 * pattern only reads as worked ground because every strip in a plot is
 * parallel to every other. Curve them independently and the field turns into
 * scrub.
 *
 * Centre, direction and half-length rather than two endpoints, because every
 * reader wants a different one of those: the geometry traces from end to end,
 * the profile projects onto the normal, and the survey only wants the length.
 */
export interface Rig {

  /** Mid-point of the strip, in the island's local space. */
  x: number
  z: number

  /** Unit vector along the strip — the way the plough was driven. */
  dirX: number
  dirZ: number

  /** Metres from the mid-point to either end. */
  halfLength: number
}

/** How a plot is cut into strips. Metres, every one of them. */
export interface RigLayout {
  spacing:  number
  headland: number
  margin:   number
}

export interface RigGeometryOptions extends RigLayout {

  /** The strips, already laid out. */
  rigs: readonly Rig[]

  /** Metres a crown stands above the furrow beside it. */
  crown: number

  /** How far a crown leans toward {@link crop}, 0..1. */
  cropAmount: number

  /** Standing cereal. The furrow never takes any of this. */
  crop: Color

  /**
   * Cross-sections along each strip.
   *
   * A count rather than a spacing, and the one number here the device tier
   * owns. A rig is straight, so length-wise resolution buys exactly one thing:
   * the unevenness of the crown's own backbone and the taper at its ends.
   * Eight cuts is a ridge with a kink in it; twenty-four is a ridge. 0 is a
   * tier whose fields stay flat paint.
   */
  cuts: number

  /**
   * The terrain *as drawn* at a point.
   *
   * The drawn chord, not the height field — for the reason the cart ruts need
   * the same thing. A plot is levelled, so the two surfaces are closer here
   * than anywhere else on the island, but "closer" is not "the same" and a
   * ridge 0.17 m tall has no clearance to spare.
   */
  surfaceAt(x: number, z: number): number

  /** The terrain's own colour at a point, written into `target`. */
  groundAt(x: number, z: number, target: Color): Color
}

/**
 * Metres the ribbon floats above the ground at its furrow edges.
 *
 * A depth-buffer margin and not a clearance, exactly as the cart ruts' is: the
 * strip is laid on the drawn surface rather than near it, so this only has to
 * win the depth test against triangles it is coplanar with.
 */
const LIFT = 0.04

/**
 * The cross-section, in multiples of half the rig spacing.
 *
 * Five vertices, and the shape is the cart ruts' inverted: there the middle
 * sinks in colour, here it rises in height. The two outer ones sit at the
 * furrow, carry no lift and no crop, and are what makes the seam with the
 * surrounding tilth invisible — a rig abuts its neighbour's furrow rather than
 * ending in mid-air.
 */
const ACROSS: readonly number[] = [ -1, -0.5, 0, 0.5, 1 ]

/** Metres over which a crown thickens and thins along its own length. */
const BACKBONE_SPAN = 4.5

/** How proud the lowest stretch of a crown stays, as a share of the highest. */
const BACKBONE_FLOOR = 0.74

/**
 * Metres over which a rig rises out of its headland at either end.
 *
 * Without it the strip starts at full height on its first cross-section, which
 * from the close zoom is a 0.17 m step out of flat turning ground — a wall
 * across the end of every rig in the field. A plough lifts out gradually and
 * so does this.
 */
const TAPER = 0.9

/**
 * How much of the ridge is standing at a point on it, 0..1.
 *
 * One function for both readers, because the lift and the crop have to agree:
 * a crown that is 40% of its height has 40% of its crop on it, and anything
 * else shows as the green of the rig sliding off the shape of the rig.
 *
 * `across` is metres from the strip's own centreline, `along` metres from its
 * near end. Both are computed analytically by the callers rather than handed
 * down, because the ribbon only tells its height function where a vertex
 * landed — and on a straight strip that is enough to recover both.
 */
export function rigProfile (
  across:  number,
  along:   number,
  length:  number,
  halfGauge: number,
  key:     number,
): number {
  if (halfGauge <= 0 || length <= 0)
    return 0

  const lateral  = 1 - smoothstep(0, 1, Math.min(1, Math.abs(across) / halfGauge))
  const ends     = smoothstep(0, TAPER, Math.min(along, length - along))
  const backbone = BACKBONE_FLOOR + (1 - BACKBONE_FLOOR) * valueNoise1d(along, BACKBONE_SPAN, key)

  return Math.max(0, lateral * ends * backbone)
}

/**
 * The strips of one plot, in the island's local space.
 *
 * They run along the plot's **long** axis, and that is the one decision in
 * here that is not arithmetic. A team ploughing a rectangle turns at the end
 * of every strip, and turning is the expensive part of the day — so the strips
 * go the long way round, always, in every field pattern anybody ever worked by
 * animal. Run them across the short axis and the field is still striped and
 * still wrong, in a way that is hard to name and easy to see.
 */
export function plotRigs (plot: Plot, layout: RigLayout): Rig[] {
  const alongW = plot.halfW >= plot.halfD
  const half   = alongW ? plot.halfW : plot.halfD
  const across = alongW ? plot.halfD : plot.halfW

  // Local X is (cos, sin) and local Z is (-sin, cos) — the same frame
  // `plotInfluence` measures the plot's claim in, so a strip inside this
  // rectangle is inside the brown patch the painter drew.
  const cos  = Math.cos(plot.rotation)
  const sin  = Math.sin(plot.rotation)
  const dirX = alongW ? cos : -sin
  const dirZ = alongW ? sin : cos

  const halfLength = half - layout.headland
  const reach      = across - layout.margin

  if (layout.spacing <= 0 || halfLength <= 0 || reach * 2 < layout.spacing)
    return []

  const count       = Math.floor(reach * 2 / layout.spacing)
  const rigs: Rig[] = []

  for (let index = 0; index < count; index += 1) {
    const offset = (index - (count - 1) / 2) * layout.spacing

    rigs.push({
      x: plot.x - dirZ * offset,
      z: plot.z + dirX * offset,
      dirX,
      dirZ,
      halfLength,
    })
  }

  return rigs
}

/** Every strip on an island, in the order its plots were sited. */
export function layoutRigs (plots: readonly Plot[], layout: RigLayout): Rig[] {
  return plots.flatMap(plot => plotRigs(plot, layout))
}

/** The strips of one course, and the fields they came off. */
export interface RigCourse {
  course: Course
  plots:  number
  rigs:   Rig[]
}

/**
 * An island's strips, gathered by what the field they are in is doing.
 *
 * The grouping exists because a crown and a crop are properties of the
 * *course* rather than of the strip: a ley's rigs are lower and bare, a
 * fallow's are full height and bare, a corn field's are full height with the
 * crop on them. Three groups is three calls to {@link rigGeometry} with three
 * sets of numbers, and still one merged draw at the end of it, against the
 * alternative of teaching the geometry builder to look a plot up per vertex.
 *
 * Walked in {@link COURSES} order rather than in plot order, so that the
 * geometry an island produces does not depend on which field happened to be
 * sited first — the same claim `rigs.test.ts` makes about cross-sections, one
 * level up. Courses no field is in are left out rather than returned empty.
 */
export function courseRigs (plots: readonly Plot[], layout: RigLayout): RigCourse[] {
  return COURSES
    .map(course => {
      const fields = plots.filter(plot => plot.course === course)

      return { course, plots: fields.length, rigs: fields.flatMap(plot => plotRigs(plot, layout)) }
    })
    .filter(group => group.rigs.length > 0)
}

/** Ploughed length, in metres — the figure `scape:map` reports. */
export function rigLength (rigs: readonly Rig[]): number {
  return rigs.reduce((total, rig) => total + rig.halfLength * 2, 0)
}

/**
 * Every rig on an island as one indexed geometry, or `null` when there is
 * nothing to plough.
 *
 * Attributes match the terrain patches exactly, because this is merged into
 * them: position, normal, uv and a three-component colour. The scape gains no
 * draw call for the whole field pattern.
 */
export function rigGeometry (options: RigGeometryOptions): BufferGeometry | null {
  const { rigs, spacing, crown, cropAmount, crop, cuts, surfaceAt, groundAt } = options

  if (rigs.length === 0 || cuts < 2 || spacing <= 0)
    return null

  const halfGauge = spacing / 2
  const across    = ACROSS.map(offset => offset * halfGauge)

  const strips = rigs.map((rig, index) => {
    const length = rig.halfLength * 2
    const tail   = { x: rig.x - rig.dirX * rig.halfLength, z: rig.z - rig.dirZ * rig.halfLength }

    // The cuts are authored as path points rather than left to a step length,
    // and the `step` handed over is deliberately longer than any of them. A
    // ribbon traced at `length / cuts` lands on `cuts` or `cuts + 1` sections
    // depending on which way the last division rounded, so two rigs a metre
    // different in length come out with different vertex counts — stable, but
    // impossible to state as a fact about the data. One point per cut is.
    const path = Array.from({ length: cuts + 1 }, (_unused, cut) => ({
      x: tail.x + rig.dirX * length * cut / cuts,
      z: tail.z + rig.dirZ * length * cut / cuts,
    }))

    // The strip is straight, so a vertex's place on it is two dot products.
    // That is the whole trick that lets a crowned cross-section run through a
    // ribbon whose height function is only ever told an x and a z.
    const standing = (x: number, z: number): number => rigProfile(
      (x - rig.x) * -rig.dirZ + (z - rig.z) * rig.dirX,
      (x - tail.x) * rig.dirX + (z - tail.z) * rig.dirZ,
      length,
      halfGauge,
      index * 1.7,
    )

    return createSurfaceRibbon({
      path,
      across,
      step:     length,
      heightAt: (x, z) => surfaceAt(x, z) + LIFT + crown * standing(x, z),

      colorAt: ({ x, z }, target) => {
        groundAt(x, z, target).lerp(crop, standing(x, z) * cropAmount)
      },
    })
  })

  const built = strips.filter((strip): strip is BufferGeometry => strip !== null)

  return built.length > 0 ? mergeGeometryList(built, false) : null
}
