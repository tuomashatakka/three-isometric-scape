import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { ball, box, cyl, deg, mergeParts, part, spread } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'


/**
 * The hand cart under way, with somebody in the shafts.
 *
 * One prop rather than two, and that is the whole design. A cart and a carter
 * are never apart — the person *is* the motive power — so modelling them
 * separately buys an articulation nothing in this scape can see at a camera
 * that holds a whole island, and costs a second instanced draw and a second
 * matrix to keep in step with the first. Merged, the pair is one geometry, one
 * instance buffer and one draw for every round being worked in the archipelago.
 *
 * It faces **+z**, the way the rowboat and the flock do, so the yaw a placement
 * gives it is the direction it is travelling. It stands on `y = 0` at the tyres
 * and at the boots alike.
 *
 * The parked cart in `structures.ts` is a different object and stays one: that
 * one is tipped forward onto its shafts with nobody near it, which is what a
 * cart looks like in a yard and is exactly what a cart on the road does not.
 */

/**
 * Metres between the wheel lines — the axle track.
 *
 * The one number in this file that is not free. The ruts down the cart track
 * are cut at `cartRuts.gauge`, and a cart whose wheels do not sit in them is a
 * cart that did not make them — at close zoom, with both in the same frame,
 * that reads immediately. `carter.test.ts` holds the two equal.
 */
export const CART_GAUGE = 1.45

/** Metres from the tyre's centre plane to its outer face. */
export const CART_TYRE = 0.06

/** Wheel radius, in metres. The axle rides at the same height. */
export const CART_WHEEL = 0.46

/** Metres from the axle to the tip of the shafts. */
export const CART_SHAFT = 1.62

/** Metres from the ground to the crown of the carter's head. */
export const CARTER_HEIGHT = 1.71

/** How far the shafts stand either side of the person between them, in metres. */
const SHAFT_HALF = 0.33

/**
 * A loaded hand cart with a carter leaning into the shafts.
 *
 * The load is peat, because peat is what this track carries: the bank is cut on
 * the moor at the top of the island and the ricks come down to the yard, which
 * is the one journey on this coast that happens often enough to wear a pair of
 * lines into the ground.
 */
export function buildCarter (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const bed                     = CART_WHEEL + 0.16
  const half                    = CART_GAUGE / 2

  // The wheels. A disc and a hub rather than a spoked wheel: at the zoom this
  // is ever seen from, spokes resolve to a smear a shade lighter than the rim
  // and cost thirty triangles each to say so.
  for (const sx of [ -1, 1 ]) {
    parts.push(part(cyl(CART_WHEEL, CART_WHEEL, CART_TYRE * 2, 11), {
      at:     [ sx * half, CART_WHEEL, 0 ],
      rotate: [ 0, 0, deg(90) ],
      color:  palette.woodDark,
      jitter: 0.1,
      rng,
    }))
    parts.push(part(cyl(0.12, 0.12, CART_TYRE * 1.5, 6), {
      at:     [ sx * half, CART_WHEEL, 0 ],
      rotate: [ 0, 0, deg(90) ],
      color:  palette.iron,
      jitter: 0.08,
      rng,
    }))
  }

  parts.push(part(cyl(0.06, 0.06, CART_GAUGE, 5), {
    at:     [ 0, CART_WHEEL, 0 ],
    rotate: [ 0, 0, deg(90) ],
    color:  palette.iron,
    jitter: 0.07,
    rng,
  }))

  // The bed, and the two sides and the tailboard standing off it. The front is
  // left open, which is what a cart that gets tipped out has.
  parts.push(part(box(CART_GAUGE - 0.22, 0.12, 1.62), {
    at: [ 0, bed, -0.12 ], color: palette.plank, jitter: 0.12, rng,
  }))
  for (const sx of [ -1, 1 ])
    parts.push(part(box(0.09, 0.38, 1.62), {
      at: [ sx * (half - 0.14), bed + 0.24, -0.12 ], color: palette.woodDark, jitter: 0.11, rng,
    }))
  parts.push(part(box(CART_GAUGE - 0.22, 0.38, 0.09), {
    at: [ 0, bed + 0.24, -0.9 ], color: palette.woodDark, jitter: 0.11, rng,
  }))

  // The load. Three lumps rather than one block, for the reason the fleece is
  // three: a single box reads as a crate and a heap of cut turf does not.
  for (const [ index, z ] of spread(3, 1.05).entries())
    parts.push(part(ball(0.3, 5), {
      at:     [ 0, bed + 0.26, z - 0.12 ],
      scale:  [ 1.5, 0.74, 0.92 ],
      color:  index === 1 ? palette.peat : palette.peatDry,
      jitter: 0.22,
      rng,
    }))

  // The shafts, running forward and down to the hands that are holding them.
  // They tip because the carter's grip is below the axle, which is the whole
  // reason a hand cart is drawn with its bed level and its shafts not.
  for (const sx of [ -1, 1 ])
    parts.push(part(box(0.08, 0.08, CART_SHAFT), {
      at:     [ sx * SHAFT_HALF, bed + 0.04, CART_SHAFT / 2 + 0.52 ],
      rotate: [ deg(5), 0, 0 ],
      color:  palette.wood,
      jitter: 0.1,
      rng,
    }))

  addCarter(parts, rng, palette)

  // Grimed to the axle, which is as high as a track throws. Above that the
  // cart is weathered rather than dirty, and the carter is neither.
  return mergeParts(parts, { grime: CART_WHEEL, grimeFloor: 0.52 })
}

/**
 * The person between the shafts.
 *
 * Built leaning forward off the hip, and the lean is the whole read. Seen from
 * a dimetric camera forty metres up, a figure standing plumb is a post; a
 * figure out of plumb, with its weight ahead of its feet and its arms back
 * along a pair of shafts, is somebody pulling something. Nothing else at this
 * size carries that, which is why the stride is in the legs and not in a rig:
 * the instance matrix is written once a frame from a route, and a walk cycle
 * would be a second animation authority over a thing that already has one.
 */
function addCarter (parts: BufferGeometry[], rng: SeededRng, palette: NordicPalette): void {
  const foot = CART_SHAFT + 0.42
  const hip  = 0.86
  const lean = deg(16)

  // The stride, taken once and baked: one boot ahead of the hip and one behind
  // it. A pair of legs side by side under a leaning body reads as a figure that
  // has been pushed over rather than one that is walking.
  for (const [ index, sz ] of [ 0.26, -0.22 ].entries())
    parts.push(part(cyl(0.08, 0.07, hip, 5), {
      at:     [ (index === 0 ? -1 : 1) * 0.11, hip / 2, foot + sz * 0.5 ],
      rotate: [ -Math.atan2(sz, hip), 0, 0 ],
      color:  palette.wadmal,
      jitter: 0.09,
      rng,
    }))

  parts.push(part(box(0.38, 0.62, 0.26), {
    at:     [ 0, hip + 0.3, foot + 0.1 ],
    rotate: [ lean, 0, 0 ],
    color:  palette.wadmal,
    jitter: 0.12,
    rng,
  }))

  // The arms run back down to the shaft tips, which is where the hands are.
  // Held as one bar across the two of them rather than as two cylinders aimed
  // at a point: at this scale the silhouette is the line from shoulder to grip,
  // and a line is cheaper than an arm.
  for (const sx of [ -1, 1 ])
    parts.push(part(cyl(0.055, 0.055, 0.72, 5), {
      at:     [ sx * 0.21, hip + 0.42, foot - 0.2 ],
      rotate: [ deg(70), 0, 0 ],
      color:  palette.wadmal,
      jitter: 0.1,
      rng,
    }))

  parts.push(part(ball(0.13, 6), {
    at:     [ 0, CARTER_HEIGHT - 0.13, foot + 0.3 ],
    scale:  [ 0.92, 1, 0.92 ],
    color:  palette.skin,
    jitter: 0.12,
    rng,
  }))
  parts.push(part(cyl(0.18, 0.16, 0.08, 7), {
    at:     [ 0, CARTER_HEIGHT - 0.06, foot + 0.3 ],
    color:  palette.wadmal,
    jitter: 0.1,
    rng,
  }))
}
