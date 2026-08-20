import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { box, cyl, deg, part, spread } from 'threejs-scene/modules/assets'


/**
 * The timber vocabulary every gabled building in the scape is assembled from.
 *
 * These live apart from the buildings themselves because the farmstead is no
 * longer the only place that builds one: the meadow barn up on the pasture is
 * the same construction in weathered grey, and a second copy of the roof
 * trigonometry is a second place for it to be wrong.
 *
 * Every helper writes into a caller-owned `parts` array in the prop's local
 * space, base at `y = 0`, long axis on `x`.
 *
 * ## The roof is the datum
 *
 * Everything up here hangs off one idea: a gabled roof is a *plane*, and every
 * other part of the building either lands on that plane or stays under it.
 * {@link roofUnderside} is that plane, and it is exported so a building can ask
 * the question rather than re-derive the answer.
 *
 * This is not decoration. The buildings previously described the roof by its
 * overhang tip and the gable by a shrink factor, and the two descriptions did
 * not agree — every gable end poked dark-red blocks up through its own shingles,
 * by as much as 0.66 m on the farmhouse. Two descriptions of one plane is one
 * description too many.
 */

/**
 * Vertical board cladding — the single detail that makes a wall read as timber.
 *
 * `baseY` lifts the run onto a floor: a barn standing on corner stones is clad
 * from the sill up, not from the ground.
 */
export function claddingPlanks (
  parts:  BufferGeometry[],
  rng:    SeededRng,
  color:  string,
  count:  number,
  span:   number,
  height: number,
  depth:  number,
  z:      number,
  baseY = 0,
): void {
  const width = span / count * 0.92

  for (const x of spread(count, span - width))
    parts.push(part(box(width, height, depth), {
      at:     [ x, baseY + height / 2, z ],
      color,
      jitter: 0.09,
      rng,
    }))
}

/** Which world axis a ridge runs along. Everything else follows from it. */
export type Ridge = 'x' | 'z'

/**
 * The plane a gabled roof's underside lies on.
 *
 * `halfDepth` is the half-depth of the **wall**, not of the roof: the eave line
 * is where the roof meets the wall it is carried by, and the overhang is a
 * separate, later idea. Measuring the pitch from the overhang tip instead is
 * exactly the mistake that used to leave a finger-width slot of daylight under
 * every eave in the scape.
 */
export interface RoofPlane {

  /** Roof height at the wall face, measured on the underside. */
  eaveY: number

  /** Roof height at the ridge, measured on the underside. */
  peakY: number

  /** Half-depth of the wall the roof lands on, across the ridge. */
  halfDepth: number
}

/**
 * Underside height of a roof at horizontal distance `across` from its ridge.
 *
 * The one function every clearance question in a building reduces to. Valid
 * past the wall too — the overhang is on the same plane.
 */
export function roofUnderside (roof: RoofPlane, across: number): number {
  return roof.peakY - (roof.peakY - roof.eaveY) * (Math.abs(across) / roof.halfDepth)
}

/** Angle of the pitch, in radians. */
export function roofSlope (roof: RoofPlane): number {
  return Math.atan2(roof.peakY - roof.eaveY, roof.halfDepth)
}

/**
 * Vertical thickness of a slab of `thickness` lying on the pitch.
 *
 * A slab measured perpendicular to a sloped plane is *taller* than that when
 * measured straight up, and it is the straight-up number that decides whether
 * the thing under it is covered.
 */
export function roofRise (roof: RoofPlane, thickness: number): number {
  return thickness / Math.cos(roofSlope(roof))
}

export interface GableOptions extends RoofPlane {

  /** Board thickness, measured along the ridge. */
  thick: number

  /** Offset along the ridge axis — which end of the building this is. */
  at: number

  /** @defaultValue `'x'` */
  ridge?: Ridge
}

/**
 * A gable end: one triangular prism, filling the wall exactly to the roof.
 *
 * A three-sided `CylinderGeometry` *is* a triangular prism — 12 triangles,
 * against the 48 the four stacked courses this replaces used to cost. Three.js
 * puts the apex at local `+z` and the base at `z = -r/2`, spanning
 * `x = ±(√3/2)r`, extruded along `y`; the rotation stands that up (apex to
 * `+y`) and lays the extrusion along the ridge.
 *
 * Because the triangle's base width is `2 * halfDepth` and its height is
 * `peakY - eaveY`, its two upper edges lie *on* {@link roofUnderside} by
 * construction. It cannot poke through a roof built from the same plane, which
 * is the entire reason it is shaped this way rather than stepped.
 */
export function gableEnd (
  parts:   BufferGeometry[],
  rng:     SeededRng,
  color:   string,
  options: GableOptions,
): void {
  const { eaveY, peakY, halfDepth, thick, at, ridge = 'x' } = options
  const height                                              = peakY - eaveY

  // Half-width of a 3-gon of radius r is (√3/2)r, so r = 2*halfDepth/√3 puts
  // the base corners exactly on the wall faces.
  const radius = halfDepth * 2 / Math.sqrt(3)

  // Unscaled, the prism runs from -r/2 to +r; stretching z to the wanted height
  // leaves the base one third of the way below the origin.
  parts.push(part(cyl(radius, radius, thick, 3), {
    at:     ridge === 'x' ? [ at, eaveY + height / 3, 0 ] : [ 0, eaveY + height / 3, at ],
    rotate: ridge === 'x' ? [ deg(-90), deg(90), 0 ] : [ deg(-90), 0, 0 ],
    scale:  [ 1, 1, height / (radius * 1.5) ],
    color,
    jitter: 0.07,
    rng,
  }))
}

export interface RoofOptions extends RoofPlane {

  /** Extent along the ridge. */
  length: number

  /** Horizontal reach past the wall face. @defaultValue 0.4 */
  overhang?: number

  /** Slab thickness, perpendicular to the pitch. @defaultValue 0.24 */
  thickness?: number

  /** @defaultValue `'x'` */
  ridge?: Ridge
}

/**
 * A gabled roof: two pitched slabs plus a ridge cap.
 *
 * The slabs are placed by their **underside**, which is what lands on the wall
 * head and what the gable tucks under. Placing them by their centre-line — as
 * this used to — lifts the whole roof half a slab thickness off the building,
 * measured vertically, which is more than it sounds once the pitch is steep.
 */
export function gabledRoof (
  parts:      BufferGeometry[],
  rng:        SeededRng,
  color:      string,
  ridgeColor: string,
  options:    RoofOptions,
): void {
  const { length, overhang = 0.4, thickness = 0.24, ridge = 'x' } = options
  const plane                                                     = options as RoofPlane
  const slope                                                     = roofSlope(plane)
  const lift                                                      = roofRise(plane, thickness) / 2
  const run                                                       = plane.halfDepth + overhang
  const span                                                      = run / Math.cos(slope) * 1.02
  const mid                                                       = run / 2
  const midY                                                      = roofUnderside(plane, mid) + lift

  // Rotating about x sends a point at +z to y = -z*sin(theta), so the slab on
  // the +z side needs a POSITIVE angle for its eave to fall away from the
  // ridge. About z the sense is opposite, hence the negation on that branch.
  for (const side of [ -1, 1 ])
    parts.push(part(
      ridge === 'x' ? box(length, thickness, span) : box(span, thickness, length),
      {
        at:     ridge === 'x' ? [ 0, midY, side * mid ] : [ side * mid, midY, 0 ],
        rotate: ridge === 'x' ? [ side * slope, 0, 0 ] : [ 0, 0, -side * slope ],
        color,
        jitter: 0.08,
        rng,
      },
    ))

  const cap = thickness * 0.9

  parts.push(part(
    ridge === 'x' ? box(length * 1.02, cap, 0.5) : box(0.5, cap, length * 1.02),
    {
      at:     [ 0, plane.peakY + lift * 2, 0 ],
      color:  ridgeColor,
      jitter: 0.05,
      rng,
    },
  ))
}

export interface MonoRoofOptions {

  /** Extent along `x`. */
  length: number

  /** Eave height at `+z`, on the underside. */
  frontY: number

  /** Eave height at `-z`, on the underside. */
  backY: number

  /** Half-depth of the wall, on `z`. */
  halfDepth: number

  /** @defaultValue 0.3 */
  overhang?: number

  /** @defaultValue 0.2 */
  thickness?: number
}

/**
 * A single-pitch roof, falling toward `+z`.
 *
 * The lean-to's version of the same contract: the underside passes through both
 * eave heights, so the posts carrying it actually touch it.
 */
export function monoRoof (
  parts:   BufferGeometry[],
  rng:     SeededRng,
  color:   string,
  options: MonoRoofOptions,
): void {
  const { length, frontY, backY, halfDepth, overhang = 0.3, thickness = 0.2 } = options
  const slope                                                                 = Math.atan2(backY - frontY, halfDepth * 2)
  const depth                                                                 = (halfDepth + overhang) * 2 / Math.cos(slope)

  parts.push(part(box(length, thickness, depth), {
    at:     [ 0, (frontY + backY) / 2 + thickness / 2 / Math.cos(slope), 0 ],
    rotate: [ slope, 0, 0 ],
    color,
    jitter: 0.07,
    rng,
  }))
}

/** A window: a dark pane set inside a painted surround. */
export function window (
  parts:  BufferGeometry[],
  rng:    SeededRng,
  frame:  string,
  glass:  string,
  at:     readonly [number, number, number],
  width:  number,
  height: number,
  facing: 1 | -1,
): void {
  const [ x, y, z ] = at

  parts.push(part(box(width + 0.22, height + 0.22, 0.1), {
    at:     [ x, y, z ],
    color:  frame,
    jitter: 0.04,
    rng,
  }))
  parts.push(part(box(width, height, 0.08), {
    at:     [ x, y, z + facing * 0.05 ],
    color:  glass,
    jitter: 0.12,
    rng,
  }))
}

export interface DormerOptions {

  /** The main roof this sits on. Every height below is derived from it. */
  roof: RoofPlane

  /** Distance from the main ridge, on `+z`. */
  at: number

  /** Extent along `x`. */
  width: number

  /** Extent along `z`. */
  depth: number

  /** Front wall height, above the main roof's top surface. */
  height: number

  /** Its own ridge, above its own eave. */
  rise: number

  /** The main roof's slab thickness, needed to find its top surface. @defaultValue 0.24 */
  roofThickness?: number
}

/**
 * A dormer — a little gabled box growing out of a pitched roof.
 *
 * Its ridge runs on `z`, across the main roof's, which is what lets it shed
 * water sideways instead of into the slope it interrupts. Two clearances decide
 * whether it reads as built rather than pasted on, and both are enforced here
 * rather than left to the caller's arithmetic:
 *
 * 1. It sits on the main roof's **top** surface, not its underside — otherwise
 *    the shingles cut it off at the ankles.
 * 2. Its ridge stays below the main ridge. A dormer that out-tops the roof it
 *    is set into is a second storey, and looks like a mistake.
 *
 * The back of the box is deliberately swallowed: the main roof climbs faster
 * than the dormer does, so the cheeks disappear into it about halfway along.
 * That is how a real dormer meets a roof, and it costs nothing to allow.
 */
export function dormer (
  parts:   BufferGeometry[],
  rng:     SeededRng,
  wall:    string,
  roofing: string,
  ridgeColor: string,
  frame:   string,
  glass:   string,
  options: DormerOptions,
): void {
  const { roof, at, width, depth, height, rise, roofThickness = 0.24 } = options
  const skin                                                           = roofRise(roof, roofThickness)
  const front                                                          = at + depth / 2

  const surfaceY = roofUnderside(roof, front) + skin
  const eaveY    = surfaceY + height

  // Clamp rather than clip: a caller asking for a ridge above the main one is
  // asking for something that cannot be built, and a silent 0.3 m of headroom
  // is a better answer than a spike through the roof. The headroom is for the
  // dormer's own shingles and cap, which stand above the ridge line it is
  // clamped to — clamping the underside alone would still let the cap through.
  const peakY = Math.min(eaveY + rise, roof.peakY - 0.3)
  const half  = width / 2

  // Skirt: the wall runs down past the surface so no seam opens at the joint.
  // Deep enough to bury itself in the slab and a finger past, and no deeper —
  // a fixed 0.45 dangled below the soffit into the attic on shallow pitches.
  const skirt = skin + 0.1

  parts.push(part(box(width, height + skirt, 0.14), {
    at: [ 0, eaveY - (height + skirt) / 2, front ], color: wall, jitter: 0.08, rng,
  }))

  for (const sx of [ -1, 1 ])
    parts.push(part(box(0.12, height + skirt, depth), {
      at: [ sx * (half - 0.06), eaveY - (height + skirt) / 2, at ], color: wall, jitter: 0.08, rng,
    }))

  gableEnd(parts, rng, wall, {
    eaveY,
    peakY,
    halfDepth: half,
    thick:     0.14,
    at:        front,
    ridge:     'z',
  })

  window(parts, rng, frame, glass, [ 0, eaveY - height * 0.52, front + 0.08 ], width * 0.5, height * 0.55, 1)

  gabledRoof(parts, rng, roofing, ridgeColor, {
    eaveY,
    peakY,
    halfDepth: half,
    length:    depth + 0.2,
    overhang:  0.16,
    thickness: 0.12,
    ridge:     'z',
  })
}
