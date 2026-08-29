import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { ball, box, cyl, deg, mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'


/**
 * The flock, as geometry.
 *
 * An animal is drawn the way a prop is: a handful of primitives, no rig, no
 * pose beyond the one it is built in. It stands still because the scape's
 * scatter bakes an instance matrix once at build — see `landscape/grazing.ts`
 * for why standing still is the honest answer here rather than a shortcut.
 *
 * Both builders face **+z**, so the yaw the placement gives an animal is the
 * direction it is looking, and both stand on `y = 0` at the hooves.
 */

/** Metres from the ground to the underside of a grown ewe's belly. */
const EWE_BELLY = 0.38

/** Metres from the ground to a lamb's. Everything else scales off these two. */
const LAMB_BELLY = 0.22

/**
 * Four legs, placed off a body's half-extents.
 *
 * A leg is one cylinder and there is no knee in it. At the scale a sheep is
 * ever seen here — a metre long, in a frame that holds an island — a jointed
 * leg is four more triangles that resolve to the same two pixels, and the
 * silhouette that says *animal* is the barrel of the body standing clear of the
 * ground on four thin things rather than the shape of the things themselves.
 */
function addLegs (
  parts:   BufferGeometry[],
  rng:     SeededRng,
  palette: NordicPalette,
  belly:   number,
  halfX:   number,
  halfZ:   number,
  girth:   number,
): void {
  for (const sx of [ -1, 1 ])
    for (const sz of [ -1, 1 ])
      parts.push(part(cyl(girth, girth * 0.82, belly, 5), {
        at:     [ sx * halfX, belly * 0.5, sz * halfZ ],
        color:  palette.hide,
        jitter: 0.08,
        rng,
      }))
}

/**
 * A ewe with her head down in the grass.
 *
 * Grazing rather than standing, and that is a composition decision rather than
 * a whim: this scape is looked at from above at a fixed dimetric angle, so the
 * profile that reads as a sheep from the side is exactly the one that reads as
 * an anonymous lump from the camera the reader actually has. Head down, the
 * neck breaks the body's outline at one end and the animal has a *direction* —
 * which is what makes a field of them read as a flock feeding across the hill
 * rather than as a scatter of pale boulders.
 */
export function buildSheep (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const back                    = EWE_BELLY + 0.26

  // The fleece is three overlapping lumps rather than one ellipsoid. A single
  // smooth body reads as a bean; the shoulder and the rump standing proud of
  // the barrel is what a fleece does.
  parts.push(part(ball(0.28, 7), {
    at: [ 0, back, 0 ], scale: [ 0.94, 0.86, 1.5 ], color: palette.fleece, jitter: 0.16, rng,
  }))
  parts.push(part(ball(0.22, 6), {
    at: [ 0, back + 0.03, 0.28 ], scale: [ 0.96, 0.9, 1 ], color: palette.fleece, jitter: 0.18, rng,
  }))
  parts.push(part(ball(0.21, 6), {
    at: [ 0, back - 0.02, -0.3 ], scale: [ 1, 0.92, 1 ], color: palette.fleeceShade, jitter: 0.18, rng,
  }))

  addLegs(parts, rng, palette, EWE_BELLY, 0.17, 0.28, 0.045)

  // The neck runs down and forward out of the shoulder; the head is at the end
  // of it, in the grass. A cylinder starts on the y axis, so the x rotation is
  // what lays it over.
  parts.push(part(cyl(0.1, 0.13, 0.42, 6), {
    at:     [ 0, back - 0.06, 0.52 ],
    rotate: [ deg(58), 0, 0 ],
    color:  palette.fleece,
    jitter: 0.12,
    rng,
  }))
  parts.push(part(box(0.15, 0.16, 0.3), {
    at:     [ 0, EWE_BELLY - 0.08, 0.71 ],
    rotate: [ deg(24), 0, 0 ],
    color:  palette.hide,
    jitter: 0.1,
    rng,
  }))

  for (const sx of [ -1, 1 ])
    parts.push(part(box(0.11, 0.05, 0.08), {
      at:     [ sx * 0.11, EWE_BELLY + 0.04, 0.62 ],
      rotate: [ 0, 0, sx * deg(18) ],
      color:  palette.hide,
      jitter: 0.1,
      rng,
    }))

  parts.push(part(ball(0.06, 5), {
    at: [ 0, back + 0.06, -0.46 ], color: palette.fleeceShade, jitter: 0.14, rng,
  }))

  // Grimed toward the hooves: a sheep off the hill is clean along the back and
  // filthy underneath, and without it the legs read as four white sticks.
  return mergeParts(parts, { grime: EWE_BELLY, grimeFloor: 0.62 })
}

/**
 * A lamb, head up.
 *
 * The counterpart to the ewe in every dimension that matters: two thirds the
 * size, and looking about rather than feeding. One head-down mesh stamped a
 * hundred times is a pattern; a second silhouette at a second scale is what
 * turns the pattern back into animals — and it costs one more draw call, which
 * is what a second scatter type costs and nothing more.
 */
export function buildLamb (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const back                    = LAMB_BELLY + 0.17

  parts.push(part(ball(0.18, 6), {
    at: [ 0, back, 0 ], scale: [ 0.9, 0.86, 1.6 ], color: palette.fleece, jitter: 0.16, rng,
  }))
  parts.push(part(ball(0.14, 5), {
    at: [ 0, back + 0.02, 0.18 ], color: palette.fleece, jitter: 0.18, rng,
  }))

  addLegs(parts, rng, palette, LAMB_BELLY, 0.11, 0.18, 0.03)

  parts.push(part(cyl(0.07, 0.08, 0.22, 5), {
    at:     [ 0, back + 0.1, 0.25 ],
    rotate: [ deg(26), 0, 0 ],
    color:  palette.fleece,
    jitter: 0.12,
    rng,
  }))
  parts.push(part(box(0.1, 0.12, 0.19), {
    at:     [ 0, back + 0.19, 0.34 ],
    rotate: [ deg(8), 0, 0 ],
    color:  palette.hide,
    jitter: 0.1,
    rng,
  }))

  for (const sx of [ -1, 1 ])
    parts.push(part(box(0.08, 0.04, 0.06), {
      at:     [ sx * 0.08, back + 0.24, 0.29 ],
      rotate: [ 0, 0, sx * deg(26) ],
      color:  palette.hide,
      jitter: 0.1,
      rng,
    }))

  return mergeParts(parts, { grime: LAMB_BELLY, grimeFloor: 0.68 })
}
