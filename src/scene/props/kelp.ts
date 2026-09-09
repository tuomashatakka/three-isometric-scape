import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { applyBend, applyTaper, blade, cyl, deg, hedron, mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'


const TAU = Math.PI * 2

/**
 * The height the plant is built to, and the one number the placement trusts.
 *
 * Every other prop in the roster is placed at the size it was built; this one is
 * scaled to the water it stands in, so its geometry is a *unit* rather than a
 * plant — one metre of kelp, from the holdfast at `y = 0` to the tip at `y = 1`.
 * `landscape/kelp.ts` multiplies that by the length the survey gave the plant,
 * which is what makes `acos(depth / length)` put the tip exactly on the surface.
 *
 * So the tip has to actually be there. A stipe built to 0.9 would put every head
 * in the archipelago a tenth of its length under the sea, at every state of the
 * tide, and nothing in the scape would say so — which is why `kelp.test.ts`
 * states this as a fact about the geometry rather than leaving it as an
 * intention.
 */
export const KELP_HEIGHT = 1

/**
 * Fronds in the canopy.
 *
 * Seven rather than the five the first cut carried, and the reason is the whole
 * of what a bed has to do at range. A kelp bed read from the air is a *dark
 * stain on the water*, and the stain is the canopy: the stipes are hairlines at
 * any zoom past forty metres and contribute nothing. Five short straps put about
 * a square metre of weed on the surface per plant and the coast came back as
 * bare water in `--poses kelp`; seven long ones put three or four there, which is
 * what actually darkens a shore.
 */
const FRONDS = 7

/**
 * Radians the crown is tilted off the plant's own horizontal, and the one number
 * in this file that knows something about the placement.
 *
 * A canopy lies **along the surface of the sea**, and the plant it grows on is
 * leaning. `landscape/kelp.ts` leans it by `acos(1 / kelp.over)` — 51° at the
 * authored ratio — so the plane that comes out level after that lean is the
 * plant's own horizontal tilted *back* by the same angle, and this is that
 * angle. The crown is built flat and then put into that plane, which is why the
 * whole ring of fronds ends up on the water rather than only the ones that
 * happen to point along the lean.
 *
 * It was not a guess, and both wrong versions of it are worth naming. Built with
 * no tilt at all the crown follows the stipe over and half of it stands out of
 * the sea; built tilted the *other* way — the first cut, which laid the fronds
 * 64–96° off the stipe — the lean drives the crown of every plant in the
 * shallows into the seabed it is rooted in. `--poses kelp` showed exactly that:
 * canopies out in the deeper water, where the lean is least, and bare sand along
 * the whole inner band.
 *
 * A ratio other than the authored one tips the canopy rather than breaking it —
 * `over` at 1.35 lifts it 9°, at 2 drops it 9° — and weed is not a rigid plate.
 * `kelp.test.ts` states the level as a fact about the two together, so a retune
 * of `over` that walks away from this is caught rather than found in a still.
 */
export const LEAN = Math.acos(1 / 1.6)

/**
 * Where on the stipe the crown is hung, as a fraction of {@link KELP_HEIGHT}.
 *
 * Just under the tip rather than at it, and the gap is measured rather than
 * chosen: a strap is a bent blade, so its near end stands a little proud of the
 * point it is attached to, and hung at the very tip that proud end is the one
 * part of the plant that ends up above the sea. Dropped by that much, the
 * highest weed on the plant *grazes* the surface at the nominal lean and nothing
 * stands over it — which is the whole claim `kelp.test.ts` states, and the
 * reason this is a named constant rather than a decimal in a placement.
 */
const CROWN = 0.85

/**
 * Oarweed (merilevä) — the plant the shallows are floored with.
 *
 * A stipe and a head, and almost nothing in between: kelp puts its whole length
 * into one smooth stalk and carries the fronds in a crown at the top of it,
 * which is the opposite of everything else growing in this scape and is exactly
 * what makes a bed read as kelp rather than as grass that has drowned.
 *
 * The crown is a ring, and it is a ring built *tilted* — see {@link LEAN}. That
 * tilt is the placement's own lean read backwards, so the two are halves of one
 * canopy rather than two opinions about where the weed is: lean the plant and
 * the whole ring comes out level, lying on the sea in every direction the way a
 * canopy does. It is also why this prop takes no yaw of its own. A spin about
 * the stipe before the lean would turn the crown out of that plane, and half of
 * it would end up standing out of the water.
 *
 * Under the ten-part budget `vegetation.ts` sets out, and well under it: this is
 * stamped several hundred times over the archipelago in one draw, so a part here
 * is memory once and triangles on every instance.
 */
export function buildKelp (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  // The holdfast — the root that is not a root, gripping the stone. Squat, dark,
  // and the only part of the plant that does not move.
  parts.push(part(hedron(0.075, 0), {
    at:     [ 0, 0.045, 0 ],
    rotate: [ 0, rng.range(0, TAU), 0 ],
    color:  palette.kelpDeep,
    jitter: 0.22,
    rng,
  }))

  // The stipe, from the holdfast to the tip, and it is the part that owns
  // {@link KELP_HEIGHT}: everything else in here hangs off it and stays under
  // it. Thicker at the bottom than the top, and barely bent — a stipe is held
  // taut by its own buoyancy, and the bend that matters is the lean the
  // placement applies to the whole plant.
  const stipe = applyBend(cyl(0.022, 0.042, 0.94, 5), deg(rng.range(-6, 6)), 'y')

  // Barely jittered, where every other part in the roster is jittered freely.
  // The top of this cylinder *is* {@link KELP_HEIGHT}, and the placement leans
  // the plant until that point is exactly on the surface — so a centimetre of
  // noise here is a centimetre of stipe standing out of the sea on every plant
  // in the archipelago, scaled up by however long the plant is.
  parts.push(part(stipe, {
    at:     [ 0, 0.52, 0 ],
    rotate: [ 0, rng.range(0, TAU), 0 ],
    color:  palette.kelpDeep,
    jitter: 0.04,
    rng,
  }))

  const start = rng.range(0, TAU)

  for (let frond = 0; frond < FRONDS; frond += 1) {
    const length = 0.52 + rng.range(0, 0.3)
    const angle  = start + frond / FRONDS * TAU + rng.range(-0.28, 0.28)

    // A gentle curl rather than a fold. The blade is going to end up lying flat,
    // so what the bend buys here is a frond that sags a little along its length
    // instead of reading as a knife — a hard fold in a strap that is already
    // horizontal just doubles it back over itself.
    const strap = applyBend(applyTaper(blade(0.19, length), 0.5, 'y'), deg(-rng.range(18, 44)), 'y')

    // Three rotations, in this order, and they are the whole of the canopy.
    //
    // The blade's base is brought to the origin, laid flat out along `+x`, and
    // swung round the ring — which builds a crown lying in the plant's own
    // horizontal plane. Then the whole frond is tipped by {@link LEAN}, which is
    // the *placement's* nominal lean read backwards: the tilt puts the crown in
    // the one plane that comes out level once `landscape/kelp.ts` has leaned the
    // plant, so a canopy fans out on the surface of the sea in every direction
    // rather than in the one direction the lean happens to be along.
    //
    // Order matters and is not an Euler triple's order — each call is applied
    // outside the ones before it, which is why the tilt is written last and
    // applies to a crown that has already been laid and fanned. Written as a
    // single `rotate` on `part` the fan would be spent before the lay and every
    // strap would come out pointing the same way.
    strap.translate(0, length * 0.44, 0)
    strap.rotateZ(-Math.PI * 0.5)
    strap.rotateY(angle)
    strap.rotateZ(LEAN)

    // At the tip, because the tip is where the surface is: the placement leans
    // the plant until exactly that point floats, so a crown hung there is a
    // crown on the water. The first cut hung it at two thirds of the way up and
    // the canopy lay two thirds of the way down the water column, which from
    // above is a bed nobody can see.
    parts.push(part(strap, {
      at:     [ 0, CROWN, 0 ],
      color:  rng.next() > 0.35 ? palette.kelp : palette.kelpDeep,
      jitter: 0.16,
      rng,
    }))
  }

  // Grimed hard, and toward the dark. Everything else in the scape is dirtied by
  // the weather it stands in and this stands in the sea, which is the one
  // surface that washes — but a bed has to be the darkest thing on a pale
  // shallow coast to read as one at all, and a light floor here was half of why
  // the first cut photographed as straw.
  return mergeParts(parts, { grime: 0.6, grimeFloor: 0.34 })
}
