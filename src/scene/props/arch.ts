import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { createRockGeometry, mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'


/**
 * The sea arch, built in world space over the portal the survey solved.
 *
 * Not a roster prop, and it cannot be one — the same position `props/pier.ts`
 * and `props/weir.ts` are in. Every builder in `props/index.ts` is a pure
 * `(rng, palette)` factory returning a fixed shape standing on `y = 0`, and an
 * arch is neither: its legs are cut to the bed each one happens to stand in and
 * its span is whatever the headland's lip left over the water. So it takes the
 * parametric-run shape instead, handed straight to the dressing's merged hero
 * draw, carrying its own world coordinates and costing no draw call.
 *
 * It is also the only piece of *landform* in this scape drawn as geometry, and
 * the reason is in `landscape/arch.ts`: a height field cannot put rock over
 * water. Everything here is therefore doing a terrain's job — which is why the
 * blocks are granite off the same palette the crag is painted from and why they
 * are rocks rather than boxes. A span of boxes is a viaduct.
 */

/** A leg of the span, in world metres, and the ground it is footed on. */
export interface ArchFooting {
  x: number
  z: number

  /** World height of the ground under it — the drawn terrain, not the bare bed. */
  bed: number
}

export interface ArchSpanOptions {

  /** The leg on the platform, and the leg in the sea. */
  inner: ArchFooting
  outer: ArchFooting

  /** Plan radius of a leg, in metres. */
  girth: number

  /** World height the underside of the span leaves its legs at. */
  springing: number

  /** World height of the top of the span. */
  crown: number

  /** The underside of the span across the opening, `0` inner to `1` outer. */
  soffitAt(across: number): number

  /** World height of mean water — the band on the legs is set by it. */
  water: number

  /** Blocks in the span — the tier's handle. See `quality.archBlocks`. */
  blocks: number

  rng:     SeededRng
  palette: NordicPalette
}

/**
 * How far a leg is sunk past the ground it stands on, in metres.
 *
 * The pile-driving argument from `props/pier.ts`, on rock instead of timber:
 * the drawn terrain is tessellated per tier and the survey's height field is
 * not, so the bed under a leg can be a facet or two out from where it was
 * sampled. Sinking the foot is what keeps a leg from ending in daylight above
 * the sea floor on the tier with the coarsest grid — invisible in a still,
 * obvious the moment the camera moves.
 */
const EMBED = 0.7

/** How much of its full girth a leg still has at the springing. */
const TAPER = 0.72

/** How ragged a block is against a sphere, for `createRockGeometry`. */
const ROUGH = 0.36

/**
 * The rock's own scale, left unsquashed.
 *
 * `createRockGeometry` defaults to `[1, 0.72, 1]`, which is right for a boulder
 * lying on the ground and wrong for every part in this file: here the caller is
 * *dictating* an extent — a leg reaches from its bed to the springing, a block
 * reaches from the soffit to the crown — and a hidden 0.72 in the middle of
 * that turns each of those into two thirds of itself. The first cut of this
 * module had exactly that, and what it drew was a span floating a metre clear
 * of the legs holding it up, which is the one failure an arch cannot survive.
 * It is invisible in a still from forty metres and obvious in an ascii
 * elevation, which is how it was found.
 */
const UNIT: [ number, number, number ] = [ 1, 1, 1 ]

/**
 * Metres a leg is carried up past the springing, into the span.
 *
 * A join rather than a butt. The rock is a deformed icosahedron, so its surface
 * wanders by up to a third of its radius either way and two parts that merely
 * *meet* at a plane show daylight between them wherever both happen to be thin
 * there. The overlap is buried inside the haunch of the span, where the block
 * is at its deepest, so nothing about the drawn shape changes.
 */
const OVERLAP = 0.9

/** How much of its own length a block spreads to, so the courses interlock. */
const KEY = 1.9

/**
 * Height of the wrack band on the outer leg, in metres.
 *
 * The spring range in this scape is ±0.4 m, so the band the weed actually
 * occupies is a shade under a metre of rock. Metres, and they stay metres: how
 * far a tide moves up a leg is a fact about this sea rather than about how wide
 * the archipelago is.
 */
const WRACK = 0.9


/** One leg, from the bed it stands in up to the springing. */
function leg (
  parts:   BufferGeometry[],
  options: ArchSpanOptions,
  footing: ArchFooting,
  across:  number,
): void {
  const { girth, springing, rng, palette } = options
  const rise                               = springing + OVERLAP - footing.bed + EMBED

  if (rise <= 0)
    return

  // Two courses rather than one stretched rock: a leg is three to four metres
  // of granite and a single deformed icosahedron that tall reads as an egg
  // stood on end. The upper course carries the taper, so the span sits on a
  // narrower bearing than the foot spreads to, which is the shape the sea
  // leaves — it takes the bottom of a spur faster than the top.
  const courses = [
    { base: footing.bed - EMBED, height: rise * 0.56, wide: 1 },
    { base: footing.bed - EMBED + rise * 0.52, height: rise * 0.48, wide: TAPER },
  ]

  for (const course of courses)
    parts.push(part(createRockGeometry({ radius: 1, detail: 1, rng, roughness: ROUGH, scale: UNIT }), {
      at:     [ footing.x, course.base + course.height * 0.5, footing.z ],
      scale:  [ girth * course.wide, course.height * 0.5, girth * course.wide ],
      rotate: [ 0, across, 0 ],
      color:  palette.granite,
      jitter: 0.1,
      rng,
    }))
}

/**
 * The span itself, block by block across the opening.
 *
 * Each block reaches from the soffit curve up to the crown, so what varies
 * across the arch is the *depth* of rock rather than its top: the crown of a
 * sea arch is the old clifftop and the old clifftop was level. The hole is cut
 * from underneath, which is the direction the sea cut it from.
 */
function span (parts: BufferGeometry[], options: ArchSpanOptions): void {
  const { inner, outer, girth, crown, soffitAt, blocks, rng, palette } = options
  const count                                                          = Math.max(3, Math.round(blocks))
  const run                                                            = Math.hypot(outer.x - inner.x, outer.z - inner.z)
  const stepX                                                          = (outer.x - inner.x) / count
  const stepZ                                                          = (outer.z - inner.z) / count
  const across                                                         = Math.atan2(outer.z - inner.z, outer.x - inner.x)
  const length                                                         = run / count

  for (let block = 0; block < count; block += 1) {
    const at    = (block + 0.5) / count
    const under = soffitAt(at)
    const depth = crown - under

    if (depth <= 0)
      continue

    parts.push(part(createRockGeometry({ radius: 1, detail: 1, rng, roughness: ROUGH, scale: UNIT }), {
      at:     [ inner.x + stepX * (block + 0.5), under + depth * 0.5, inner.z + stepZ * (block + 0.5) ],
      scale:  [ length * KEY * 0.5, depth * 0.5, girth ],
      rotate: [ 0, -across, 0 ],
      color:  block % 2 === 0 ? palette.granite : palette.graniteWarm,
      jitter: 0.12,
      rng,
    }))
  }
}

/**
 * One arch, as a single geometry in world space.
 *
 * The block count is the only thing in here that moves with the tier, and it is
 * a density rather than a gate for `quality.pierBoards`' reason: the whole span
 * is merged into the hero draw, so there is nothing to turn off, and the
 * cheapest tier gets a coarser arch rather than a coast that loses its landform
 * on a phone.
 */
export function buildArchSpan (options: ArchSpanOptions): BufferGeometry {
  const { inner, outer, rng, palette } = options
  const parts: BufferGeometry[]        = []
  const across                         = Math.atan2(outer.z - inner.z, outer.x - inner.x)

  leg(parts, options, inner, across)
  leg(parts, options, outer, across)
  span(parts, options)

  // The wrack band, on the leg that stands in the sea. The tide reaches this
  // rock twice a day and rock the tide reaches is not the colour of rock it
  // does not — it is the one band in the geometry that is not granite, and it
  // is what tells the far zoom which leg is in the water.
  if (options.water > outer.bed)
    parts.push(part(createRockGeometry({ radius: 1, detail: 0, rng, roughness: ROUGH, scale: UNIT }), {
      at:     [ outer.x, options.water, outer.z ],
      scale:  [ options.girth * 1.04, WRACK * 0.5, options.girth * 1.04 ],
      rotate: [ 0, across, 0 ],
      color:  palette.lichenRust,
      jitter: 0.16,
      rng,
    }))

  // The grade is taken off the **world** height rather than off the geometry's
  // own base, and that is deliberate rather than a leftover from a prop that
  // stood on `y = 0`: `applyGrime` reads absolute `y`, and absolute `y` is
  // exactly the right axis here. The sea is at a known height in this scape, so
  // a span graded from the crown down puts its darkest rock at and below the
  // waterline — where the weed and the shadow actually are — and leaves the
  // clifftop end of it the colour of the headland it was cut through.
  return mergeParts(parts, { grime: Math.max(0.5, options.crown), grimeFloor: 0.58 })
}
