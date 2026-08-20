import { smoothstep, valueNoise1d } from 'threejs-scene'
import { createSurfaceRibbon, mergeGeometryList } from 'threejs-scene/modules/assets'
import type { BufferGeometry, Color } from 'three'
import type { Vec2 } from './path.ts'


/**
 * The pair of worn lines a cart wheel leaves down the middle of the track.
 *
 * This is a *ribbon*, not a paint pass, and the reason is resolution. The
 * terrain's colours live on its vertices, and those sit 0.68 m apart on the
 * home island at the finest tier and 2.3 m apart on mobile. A rut is two thirds
 * of a metre wide. Painting one into that grid does not draw a thin line, it
 * draws nothing at all on most tiers and an aliased dotted line on the rest —
 * the ground simply has no vertices to spare where the wheels run.
 *
 * A strip laid along the track carries its own vertices at its own spacing, so
 * the ruts are as fine as they need to be and cost the same on every tier. It
 * merges into the terrain draw with the seabed and the islands, so the scape
 * gains no draw call for it.
 *
 * The seam is handled by colour rather than by blending: the outer edge of the
 * ribbon is painted with the *ground's own* colour at that point, sampled from
 * the terrain painter, and only the middle darkens. There is nothing to sort
 * and nothing to fade, because the edge already matches what it lies on.
 *
 * The strip itself is `createSurfaceRibbon` from the runtime — the beck and the
 * waterway want the same thing, and three hand-written copies of the same
 * cross-section-times-arc-length indexing arithmetic is three places for the
 * winding to be wrong in.
 */
export interface CartRutsOptions {

  /** Track centreline in the island's local space. */
  track: readonly Vec2[]

  /** The farmyard the traffic comes from. Wear fades with distance from it. */
  yard: Vec2

  /** Metres between the two wheel lines — a cart's axle track. */
  gauge: number

  /** Metres from a rut's centre to where its wear has gone. */
  width: number

  /** Metres from the yard over which the wear fades to nothing. */
  reach: number

  /** Peak darkening, 0..1. At 0 there are no ruts and no geometry. */
  wear: number

  /** The colour bare, damp, wheel-packed earth turns toward. */
  rut: Color

  /**
   * The terrain *as drawn* at a point.
   *
   * Not the height field: the ribbon has to lie on the chord the terrain mesh
   * actually renders, which stands off the continuous ground by far more than
   * the ribbon's own clearance wherever the ground curves. Laid on the field
   * instead, most of the ribbon ends up under the triangles it is meant to be
   * lying on and the ruts come out as a dashed line.
   */
  surfaceAt(x: number, z: number): number

  /** The terrain's own colour at a point, written into `target`. */
  groundAt(x: number, z: number, target: Color): Color
}

/**
 * Metres the ribbon floats above the ground.
 *
 * It only has to win the depth test against the triangles it is coplanar with,
 * because `surfaceAt` puts it on the drawn surface rather than near it — so
 * this is a depth-buffer margin, not a clearance. Small enough that no edge of
 * it reads as a lip from an isometric camera.
 */
const LIFT = 0.05

/** Metres between ribbon cross-sections along the track. */
const STEP = 0.5

/**
 * The cross-section, in multiples of `width` from a rut's centre.
 *
 * Five vertices: the two outer ones carry the untouched ground colour and are
 * what makes the seam invisible, the middle carries the full wear.
 */
const ACROSS: readonly number[] = [ -1, -0.5, 0, 0.5, 1 ]

/** Metres over which the rut lines wander sideways. Nobody surveyed these either. */
const WANDER_SPAN = 7

/** Metres over which the wear thins and thickens along a rut. */
const PATCH_SPAN = 3.5

/** How worn the thinnest stretch of a rut stays, as a share of the deepest. */
const PATCH_FLOOR = 0.72

/** Share of the reach from the yard over which the wear stays full. */
const HELD = 0.4

/**
 * How much the traffic still tells at a point, 0..1.
 *
 * Full for the first `HELD` of the reach and gone by the end of it. Starting
 * the fade at the yard gate instead leaves the road half-worn a dozen metres
 * out, where the traffic has not thinned at all — everything on it is still
 * going the same one place.
 *
 * Takes the distance rather than the point because the terrain painter has
 * already measured it — and it is the other caller: the corridor's soiling
 * fades on this same curve, and two falloffs would show as the ruts outliving
 * the dirt they sit in, or the other way round.
 */
export function trafficAt (fromYard: number, reach: number): number {
  return 1 - smoothstep(reach * HELD, reach, fromYard)
}

/**
 * The two rut strips as one indexed geometry in the island's local space, or
 * `null` when the scape has no ruts to draw — no wear, or no track to wear.
 *
 * Attributes match the terrain patches exactly, because this is merged with
 * them: position, normal, uv and a three-component colour.
 *
 * Both wheel lines run off one centreline, and every difference between them is
 * a sign: the same wander, the same patchiness, mirrored. They are one axle.
 */
export function cartRutGeometry (options: CartRutsOptions): BufferGeometry | null {
  const { track, yard, gauge, width, reach, wear, rut, surfaceAt, groundAt } = options

  if (wear <= 0 || width <= 0 || track.length < 2)
    return null

  // The weights are read off the unscaled cross-section, so the middle carries
  // the full wear and the outer edges carry none of it whatever `width` is.
  const weights = ACROSS.map(offset => 1 - smoothstep(0, 1, Math.abs(offset)))
  const across  = ACROSS.map(offset => offset * width)

  const strips = [ -1, 1 ].map(side => createSurfaceRibbon({
    path:     track,
    across,
    step:     STEP,
    heightAt: (x, z) => surfaceAt(x, z) + LIFT,

    centreAt: section =>
      side * gauge * 0.5 +
      (valueNoise1d(section.along, WANDER_SPAN, side * 0.5) - 0.5) * width * 1.2,

    colorAt: ({ x, z, step, section }, target) => {
      const patch   = PATCH_FLOOR + (1 - PATCH_FLOOR) * valueNoise1d(section.along, PATCH_SPAN, side * 3.7)
      const traffic = trafficAt(Math.hypot(section.x - yard.x, section.z - yard.z), reach)

      groundAt(x, z, target).lerp(rut, weights[step] * wear * traffic * patch)
    },
  }))

  const built = strips.filter((strip): strip is BufferGeometry => strip !== null)

  return built.length > 0 ? mergeGeometryList(built, false) : null
}
