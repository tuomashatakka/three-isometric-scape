import { BufferAttribute, BufferGeometry, Color } from 'three'
import { hash2, smoothstep } from 'threejs-scene'
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
 * Smooth 1D value noise off the shared coordinate hash.
 *
 * `hash2` is a hash, not a field — consecutive metres of track are unrelated
 * values, and a rut jittered by one is gravel rather than a rut. Interpolating
 * between whole cells with a smoothstep is what turns it into a line that
 * wanders.
 */
function wanderAt (along: number, span: number, phase: number): number {
  const scaled = along / span
  const cell   = Math.floor(scaled)
  const blend  = smoothstep(0, 1, scaled - cell)

  return hash2(cell, phase) * (1 - blend) + hash2(cell + 1, phase) * blend
}

/** Cross-sections at a fixed arc length along a polyline, with their normals. */
function traceTrack (track: readonly Vec2[], step: number): Section[] {
  const sections: Section[] = []
  let along                 = 0

  for (let index = 0; index < track.length - 1; index += 1) {
    const a      = track[index]
    const b      = track[index + 1]
    const dx     = b.x - a.x
    const dz     = b.z - a.z
    const length = Math.hypot(dx, dz)

    if (length === 0)
      continue

    // The normal of a +z-long segment points along -x, and which of the two
    // sides that is does not matter: the ruts are symmetric about the centre.
    const normalX = -dz / length
    const normalZ = dx / length

    for (let cut = 0; cut < length; cut += step) {
      const travel = cut / length

      sections.push({
        x:     a.x + dx * travel,
        z:     a.z + dz * travel,
        normalX,
        normalZ,
        along: along + cut,
      })
    }

    along += length
  }

  const last = track[track.length - 1]
  const tail = sections[sections.length - 1]

  if (tail)
    sections.push({ ...tail, x: last.x, z: last.z, along })

  return sections
}

interface Section {
  x:       number
  z:       number
  normalX: number
  normalZ: number
  along:   number
}

/** The three attribute arrays the ribbon is written into. */
interface RibbonBuffers {
  positions: Float32Array
  uvs:       Float32Array
  colors:    Float32Array
}

/**
 * One wheel line, written into the buffers from `first`.
 *
 * `side` is which side of the centreline it runs down; everything else about
 * the two ruts is identical, including the sideways wander, because they are
 * one axle.
 */
function writeRut (
  side:     number,
  sections: readonly Section[],
  weights:  readonly number[],
  options:  CartRutsOptions,
  buffers:  RibbonBuffers,
  first:    number,
): void {
  const { yard, gauge, width, reach, wear, rut, surfaceAt, groundAt } = options

  const span   = sections[sections.length - 1].along || 1
  const sample = new Color()

  let vertex = first

  for (const section of sections) {
    const drift  = (wanderAt(section.along, WANDER_SPAN, side * 0.5) - 0.5) * width * 1.2
    const patch  = PATCH_FLOOR + (1 - PATCH_FLOOR) * wanderAt(section.along, PATCH_SPAN, side * 3.7)
    const centre = side * gauge * 0.5 + drift

    const traffic = trafficAt(Math.hypot(section.x - yard.x, section.z - yard.z), reach)

    for (let step = 0; step < ACROSS.length; step += 1) {
      const offset = centre + ACROSS[step] * width
      const x      = section.x + section.normalX * offset
      const z      = section.z + section.normalZ * offset

      buffers.positions[vertex * 3]     = x
      buffers.positions[vertex * 3 + 1] = surfaceAt(x, z) + LIFT
      buffers.positions[vertex * 3 + 2] = z

      buffers.uvs[vertex * 2]     = ACROSS[step] * 0.5 + 0.5
      buffers.uvs[vertex * 2 + 1] = section.along / span

      groundAt(x, z, sample)
        .lerp(rut, weights[step] * wear * traffic * patch)
        .toArray(buffers.colors, vertex * 3)

      vertex += 1
    }
  }
}

/**
 * The quads of one strip, wound so the ribbon faces up.
 *
 * A section's tangent crossed into its normal points down, so the corners go
 * across before they go along.
 */
function stripIndices (first: number, sections: number): number[] {
  const indices: number[] = []

  for (let section = 0; section < sections - 1; section += 1)
    for (let step = 0; step < ACROSS.length - 1; step += 1) {
      const corner = first + section * ACROSS.length + step

      indices.push(
        corner, corner + 1, corner + ACROSS.length,
        corner + 1, corner + ACROSS.length + 1, corner + ACROSS.length,
      )
    }

  return indices
}

/**
 * The two rut strips as one indexed geometry in the island's local space, or
 * `null` when the scape has no ruts to draw — no wear, or no track to wear.
 *
 * Attributes match the terrain patches exactly, because this is merged with
 * them: position, normal, uv and a three-component colour.
 */
export function cartRutGeometry (options: CartRutsOptions): BufferGeometry | null {
  if (options.wear <= 0 || options.width <= 0 || options.track.length < 2)
    return null

  const sections = traceTrack(options.track, STEP)

  if (sections.length < 2)
    return null

  const weights = ACROSS.map(offset => 1 - smoothstep(0, 1, Math.abs(offset)))
  const stride  = sections.length * ACROSS.length
  const buffers = {
    positions: new Float32Array(stride * 2 * 3),
    uvs:       new Float32Array(stride * 2 * 2),
    colors:    new Float32Array(stride * 2 * 3),
  }

  const indices: number[] = []

  for (const [ strip, side ] of [ -1, 1 ].entries()) {
    writeRut(side, sections, weights, options, buffers, strip * stride)
    indices.push(...stripIndices(strip * stride, sections.length))
  }

  const { positions, uvs, colors } = buffers
  const geometry                   = new BufferGeometry()

  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  return geometry
}
