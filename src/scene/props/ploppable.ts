import { BufferAttribute, BufferGeometry, Color, Mesh } from 'three'
import type { ColorRepresentation, Material } from 'three'
import { Prop } from 'threejs-scene/modules/assets'


/** Ground height at a point, in world units. */
export type GroundAt = (x: number, z: number) => number

/**
 * The rectangle a prop actually stands on, in its own axes.
 *
 * Carries a centre because a prop's extent is rarely symmetric about its
 * origin — the barn's is three quarters of a metre off in `z` — and a plinth
 * built symmetrically around the origin for an asymmetric building overhangs
 * one wall and leaves the opposite one standing in mid-air.
 */
export interface Footprint {
  x:     number
  z:     number
  halfW: number
  halfD: number
}

export interface PlopOptions {

  /** Yaw in radians. @defaultValue 0 */
  angle?: number

  /**
   * The ground the prop stands on, in its own axes. Given one, `plop` levels
   * against the whole footprint instead of a single point and grows a
   * foundation to bridge the drop.
   */
  footprint?: Footprint

  /** Extra sink below the resolved floor level, in metres. @defaultValue 0.05 */
  sink?: number

  /** Material for the generated foundation. Omit to skip it entirely. */
  skirt?: Material

  /** Foundation colour. @defaultValue a mid granite */
  skirtColor?: ColorRepresentation
}

/** Perimeter samples per footprint side — the resolution the skirt follows ground at. */
const OUTLINE_STEPS = 8

/** How far the skirt rises above the prop's own base, hiding the seam. */
const SKIRT_TOP = 0.3

/** How far the skirt's lower edge is driven under the ground it meets. */
const SKIRT_BURY = 0.55

const DEFAULT_SKIRT = 0x6d685f

/**
 * How far above its base a prop still counts as standing on the ground.
 *
 * The measurement this bounds is "what does this building rest on", and the
 * answer is never its bounding box: a roof overhangs, a gable reaches past the
 * wall beneath it, and a ladder leans out into thin air. Taken from the full
 * extent, the aitta's footprint is a quarter wider than the hut itself.
 */
const BASE_REACH = 0.6

/**
 * The rectangle a prop actually stands on.
 *
 * Only geometry within {@link BASE_REACH} of the base is measured, and the
 * result carries its own centre rather than assuming the prop is symmetric
 * about its origin — most are not.
 */
export function baseFootprint (geometry: BufferGeometry, fallback = 3): Footprint {
  const position = geometry.getAttribute('position')

  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  geometry.computeBoundingBox()

  const floor = geometry.boundingBox?.min.y ?? 0

  for (let index = 0; index < position.count; index += 1) {
    if (position.getY(index) > floor + BASE_REACH)
      continue

    minX = Math.min(minX, position.getX(index))
    maxX = Math.max(maxX, position.getX(index))
    minZ = Math.min(minZ, position.getZ(index))
    maxZ = Math.max(maxZ, position.getZ(index))
  }

  // A prop with nothing near its base at all — nothing in this scape, but the
  // caller should get a usable square rather than an Infinity.
  if (!Number.isFinite(minX) || !Number.isFinite(minZ))
    return { x: 0, z: 0, halfW: fallback, halfD: fallback }

  return {
    x:     (minX + maxX) * 0.5,
    z:     (minZ + maxZ) * 0.5,
    halfW: (maxX - minX) * 0.5,
    halfD: (maxZ - minZ) * 0.5,
  }
}

/** Sample points around a rectangle's perimeter, in the prop's local axes. */
function outlinePoints (footprint: Footprint, steps: number): number[][] {
  const { x, z, halfW, halfD } = footprint

  const corners = [
    [ x - halfW, z - halfD ], [ x + halfW, z - halfD ],
    [ x + halfW, z + halfD ], [ x - halfW, z + halfD ],
  ]

  const points: number[][] = []

  for (let side = 0; side < 4; side += 1) {
    const [ ax, az ] = corners[side]
    const [ bx, bz ] = corners[(side + 1) % 4]

    for (let step = 0; step < steps; step += 1) {
      const t = step / steps
      points.push([ ax + (bx - ax) * t, az + (bz - az) * t ])
    }
  }

  return points
}

/**
 * Extrude a closed band between a constant top edge and a lower edge that
 * follows `levels`, in the prop's local frame.
 *
 * Written straight into typed arrays rather than assembled from boxes: the
 * lower edge has a different height at every sample, which is precisely what a
 * primitive cannot express.
 */
function buildBand (
  points: number[][],
  levels: number[],
  baseY:  number,
  color:  ColorRepresentation,
): BufferGeometry {
  const count     = points.length
  const positions = new Float32Array(count * 18)
  const normals   = new Float32Array(count * 18)
  const colors    = new Float32Array(count * 18)
  const tint      = new Color(color)
  const shade     = new Color()

  for (let index = 0; index < count; index += 1) {
    const next       = (index + 1) % count
    const [ ax, az ] = points[index]
    const [ bx, bz ] = points[next]
    const aLow       = Math.min(levels[index] - baseY - SKIRT_BURY, SKIRT_TOP - 0.05)
    const bLow       = Math.min(levels[next] - baseY - SKIRT_BURY, SKIRT_TOP - 0.05)
    const length     = Math.hypot(bx - ax, bz - az) || 1

    // Outward horizontal normal of this segment.
    const nx = (bz - az) / length
    const nz = -(bx - ax) / length

    // Wound so the *outward* face is the front face. This was backwards, and
    // under `flatShading` — which the scape's ground material uses — it is the
    // only thing that matters: three derives the shading normal from the
    // winding and never reads the attribute below, so a reversed quad is both
    // culled and lit inside out. The visible symptom was a building standing
    // on nothing, its plinth present but facing away from every camera.
    const corners = [
      [ ax, SKIRT_TOP, az ], [ bx, bLow, bz ], [ ax, aLow, az ],
      [ ax, SKIRT_TOP, az ], [ bx, SKIRT_TOP, bz ], [ bx, bLow, bz ],
    ]

    for (const [ vertex, [ px, py, pz ]] of corners.entries()) {
      const slot = index * 18 + vertex * 3

      positions[slot]     = px
      positions[slot + 1] = py
      positions[slot + 2] = pz
      normals[slot]       = nx
      normals[slot + 2]   = nz

      // Darken toward the ground, matching the grime ramp every merged prop is
      // baked with — a foundation lit as brightly as the wall above it reads as
      // a separate object standing next to the building.
      shade.copy(tint).multiplyScalar(0.72 + 0.28 * Math.min(1, Math.max(0, (py + 0.6) / 0.9)))
      colors[slot]     = shade.r
      colors[slot + 1] = shade.g
      colors[slot + 2] = shade.b
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.computeBoundingSphere()
  return geometry
}

/**
 * A prop that knows where the ground is.
 *
 * Placement in a landscape is a two-dimensional decision — you choose *where*
 * on the map a barn goes, never how high — but every scene-graph API asks for
 * three numbers and lets you get the third one wrong. `Ploppable` takes the
 * ground field once at construction and derives `y` itself, so callers pass the
 * two coordinates they actually have an opinion about.
 *
 * Given a footprint it also solves the problem that makes flat-based props look
 * pasted on: it levels the floor against the *highest* corner, then extrudes a
 * foundation whose lower edge follows `heightAt` all the way round. The result
 * meets sloping ground the way a real plinth does — buried on the high side,
 * standing proud on the low one — instead of hovering over the dip.
 */
export class Ploppable extends Prop {
  readonly #ground: GroundAt

  constructor (name: string, ground: GroundAt) {
    super(name)
    this.#ground = ground
  }

  /** Place the prop at a map coordinate. Returns `this`, for chaining. */
  plop (x: number, z: number, options: PlopOptions = {}): this {
    const { angle = 0, footprint, sink = 0.05, skirt, skirtColor = DEFAULT_SKIRT } = options

    this.rotation.y = angle

    if (!footprint) {
      this.position.set(x, this.#ground(x, z) - sink, z)
      return this
    }

    const cos    = Math.cos(angle)
    const sin    = Math.sin(angle)
    const points = outlinePoints(footprint, OUTLINE_STEPS)
    const world  = points.map(([ lx, lz ]) => [
      x + lx * cos - lz * sin,
      z + lx * sin + lz * cos,
    ])
    const levels = world.map(([ wx, wz ]) => this.#ground(wx, wz))

    // Level on the high side. Sink to the mean instead and the uphill half of
    // the floor ends up under the turf; sink to the low side and the whole
    // building climbs out of the hill it is supposed to be cut into.
    const floor = Math.max(...levels, this.#ground(x, z))

    this.position.set(x, floor - sink, z)

    if (skirt)
      this.#raiseFoundation(points, levels, floor - sink, skirt, skirtColor)

    return this
  }

  /** Extrude a closed band from the prop's base down onto the ground under it. */
  #raiseFoundation (
    points: number[][],
    levels: number[],
    baseY:  number,
    material: Material,
    color:  ColorRepresentation,
  ): void {
    const mesh         = new Mesh(buildBand(points, levels, baseY, color), material)
    mesh.name          = `${this.name}-foundation`
    mesh.castShadow    = true
    mesh.receiveShadow = true
    this.addPart('foundation', mesh)
  }
}

// perf: the skirt is 32 quads built once at load. It shares the scape ground
// material, so a plopped building costs one extra draw and no state change.
