import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { ball, box, cyl, deg, mergeParts, part, plank } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'


/**
 * Metres of the float that sit above its own waterline.
 *
 * The one number the placement trusts, and the reason it is exported rather
 * than measured off the geometry: `landscape/creels.ts` floats a buoy by
 * putting the sea at this height up the prop, so a float built with a different
 * freeboard would ride with its belly in the air or its shoulders under.
 *
 * A creel float is a sealed plastic sphere with very little in it, so most of
 * it is out of the water — about two thirds, which is what this is a share of
 * {@link FLOAT_RADIUS} by.
 */
export const FLOAT_WATERLINE = 0.1

/** Radius of the float itself, in metres. */
export const FLOAT_RADIUS = 0.3

/**
 * Metres from the float's base to the top of the staff.
 *
 * Exported for the placement's sake the way {@link FLOAT_WATERLINE} is, and for
 * the test's: the whole reason a dan has a staff is that a sphere thirty
 * centimetres across is *nothing* at the zoom this scape is read at, and a
 * flagged pole is a mark somebody can actually find. If the staff ever stops
 * being most of the prop, the fishery goes back to being invisible and no still
 * would say so.
 *
 * Two and a half metres out of the water, which is a real dhan rather than a
 * concession to the camera — a pole is made tall for exactly the reason this
 * scape needs it to be, which is that it has to be picked out of a lop from a
 * boat half a mile off. The first cut stood 1.75 m and `--poses creel` showed
 * why that is not enough: at the 90 m frame the marks read, and at the tour's
 * 520 m they are under a pixel of float on two of staff.
 */
export const DAN_HEIGHT = 2.4

/** Radius of one pot's hoops, in metres. */
const POT_GIRTH = 0.24

/** Metres from one course of the stack to the next. */
const POT_COURSE = 0.56

/**
 * The float on a creel, with the staff and flag that make it findable.
 *
 * The first thing in this scape that a person built and then *left floating*.
 * Everything else on the water is a hull with somebody in it or a plate of ice;
 * a pot marker is the settlement's own gear, lying out on the ground it works,
 * in weather nobody is out in.
 *
 * Built base-at-zero like every prop in the roster, with the waterline a known
 * distance up it — see {@link FLOAT_WATERLINE}. The placement is what decides
 * where the sea is, and it decides it from the published tide.
 */
export function buildCreelBuoy (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const staff                   = DAN_HEIGHT - FLOAT_RADIUS * 1.6
  const lean                    = deg(rng.range(-6, 6))

  // The float. A sphere rather than a hedron, because the one shape in this
  // roster that is unambiguously manufactured should not share a silhouette
  // with the boulders the same shore is covered in.
  parts.push(part(ball(FLOAT_RADIUS, 7), {
    at:     [ 0, FLOAT_RADIUS, 0 ],
    color:  palette.buoy,
    jitter: 0.1,
    rng,
  }))

  // The band round its waist, a hair proud of the sphere so it is never
  // z-fighting the thing it is painted on.
  parts.push(part(cyl(FLOAT_RADIUS * 0.84, FLOAT_RADIUS * 0.84, 0.09, 8), {
    at:     [ 0, FLOAT_RADIUS * 1.18, 0 ],
    color:  palette.buoyBand,
    jitter: 0.08,
    rng,
  }))

  parts.push(part(cyl(0.035, 0.05, staff, 5), {
    at:     [ 0, FLOAT_RADIUS * 1.6 + staff / 2, 0 ],
    rotate: [ deg(rng.range(-5, 5)), 0, lean ],
    color:  palette.tarWood,
    jitter: 0.12,
    rng,
  }))

  // The flag, and it is a box rather than a blade on purpose: a single-plane
  // flag disappears entirely at the bearing it is edge-on to, and a mark that
  // is invisible from one quarter of the compass is not a mark.
  parts.push(part(box(0.45, 0.3, 0.08), {
    at:     [ 0.22, DAN_HEIGHT - 0.2, 0 ],
    rotate: [ 0, 0, lean ],
    color:  palette.flagBlue,
    jitter: 0.1,
    rng,
  }))

  return mergeParts(parts, { grime: 0.9, grimeFloor: 0.55 })
}

/**
 * A stack of creels on the harbour hard, between tides.
 *
 * The other half of the same fishery, and the half that stands still. Pots come
 * ashore to be mended, and a quay with gear on it is the difference between a
 * harbour somebody works out of and a harbour somebody drew.
 *
 * Deliberately a hero rather than a scatter: there is one stack per harbour, it
 * is placed against the net rack the layout already sited, and it merges into
 * the settlement draw with everything else standing on that ground.
 */
export function buildCreelStack (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const rows                    = rng.pick([ 2, 2, 3 ])

  for (let row = 0; row < rows; row += 1) {
    const base  = row * POT_COURSE
    const yaw   = deg(rng.range(-14, 14))
    const slide = rng.range(-0.09, 0.09)

    // The pallet the course stands on. Flat, because the only rotation either
    // part of a pot takes is a yaw: a stack tipped in x or z is a stack whose
    // bottom corner is under the quay it is standing on, and the untidiness a
    // tilt was reaching for is already in the yaw and the slide.
    parts.push(part(plank(0.8, 0.07, 0.56), {
      at:     [ slide, base + 0.05, 0 ],
      rotate: [ 0, yaw, 0 ],
      color:  palette.tarWood,
      jitter: 0.14,
      rng,
    }))

    // The frame — a parlour pot is a half-cylinder of bent hazel over a base,
    // and at any zoom this scape is read at that is a loaf with a dark board
    // under it. Laid on its side by the z turn, which three applies before the
    // yaw, so the yaw is a turn in plan rather than a roll.
    parts.push(part(cyl(POT_GIRTH, POT_GIRTH, 0.78, 7), {
      at:     [ slide, base + 0.085 + POT_GIRTH, 0 ],
      rotate: [ 0, yaw, deg(90) ],
      scale:  [ 1, 1, 0.62 ],
      color:  palette.driftwoodDark,
      jitter: 0.16,
      rng,
    }))
  }

  return mergeParts(parts, { grime: 1.2, grimeFloor: 0.45 })
}
