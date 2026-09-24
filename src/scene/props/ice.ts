import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { box, cyl, deg, mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'


/**
 * What the sea makes of itself in the coldest weeks.
 *
 * Its own file rather than a corner of `stone.ts`, and for the reason
 * `wildlife.ts` is not a corner of `livestock.ts`: the roster is split by what a
 * thing *is*, and a floe is not a rock that happens to be white. A rock is on
 * the chart in August. This is the sea, with the same tide under it as the water
 * it is floating in.
 *
 * ### the unit
 *
 * Built at a **unit plate**: one metre across the flats, one metre from the
 * waterline to the deck, base at `y = 0` on the waterline — and about 1.6 to
 * the top of the ridge standing on it. Every plate in the archipelago is this geometry
 * under a non-uniform scale — `(length, rise, width)` — because a floe field of
 * one size is a tiling and a tiling is the one thing the eye finds immediately.
 * The scale is the placement's, in `landscape/floes.ts`; what is authored here
 * is only the *shape* of a plate, which is the same shape at every size.
 *
 * ### what has to read
 *
 * The edge, and nothing else. A plate of ice seen from four hundred metres up is
 * a white quadrilateral on a white sheet: what separates it from the surface it
 * floats in is the shadow it throws along one side and the wet band round its
 * rim, and both of those are what the stand is for. Drawn flush with the water
 * it is invisible, which is precisely the state the scape was in before the pack
 * — see `config-packice.ts`.
 */

/** Sides round a plate. Seven, so no two plates in a field share a silhouette. */
const SIDES = 7

/** Share of the stand the wet rim takes, under the waterline end of the plate. */
const RIM = 0.34

/**
 * One rafted plate of first-year sea ice.
 *
 * Four parts, well under the scatter budget in `vegetation.ts`: this is stamped
 * over every frozen sound in the archipelago as one `InstancedMesh`, so a part
 * here is memory once and a triangle on every instance.
 *
 * The taper is the read. A floe is thicker in the middle than at its edges —
 * the rim is where it melts, grinds and gets driven under its neighbour — so the
 * plate is a cylinder narrowing upward with a second, wider and darker course
 * under it at the waterline. Drawn as a straight-sided puck it reads as a
 * counter in a board game, which is what the first cut of it was.
 */
export function buildFloe (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  // The wet course at the waterline, wider than the ice standing on it. This is
  // the band the sea keeps washing and it is the darkest thing on the plate —
  // without it the floe has no join with the water and floats above its own
  // surface.
  parts.push(part(cyl(0.49, 0.5, RIM, SIDES), {
    at:     [ 0, RIM * 0.5, 0 ],
    color:  palette.floeWet,
    jitter: 0.06,
    rng,
  }))

  // The plate itself, narrowing to its top. Jittered hard: a radius the same at
  // every side is a heptagon, and a heptagon is a manufactured object.
  parts.push(part(cyl(0.41, 0.49, 1 - RIM, SIDES), {
    at:     [ 0, RIM + (1 - RIM) * 0.5, 0 ],
    color:  palette.floe,
    jitter: 0.16,
    rng,
  }))

  // The ridge along the join, which is the whole argument for the stand — see
  // `pack.rise`. A pack under pressure rides one plate up over the next, and
  // what is visible from any distance at all is that broken line rather than the
  // level ice either side of it.
  //
  // **It stands half as much again as the deck does, and that is the version
  // that reads.** The first cut gave it a third of the deck's height, which at
  // the half metre a plate actually floats at is fifteen centimetres — and at
  // fifteen centimetres a ridge under this camera is a painted stripe rather
  // than a thing with a shadow beside it, which `--poses pack-near` showed
  // immediately. Off-centre and off-axis, so a field of them does not read as a
  // row of buttons.
  parts.push(part(box(0.52, 0.8, 0.16), {
    at:     [ 0, 1.15, -0.09 ],
    rotate: [ deg(-7), deg(12), deg(4) ],
    color:  palette.floeSnow,
    jitter: 0.24,
    rng,
  }))

  // One slab tipped up on the rim, which is the other half of what a pack does
  // under pressure. Cheap, and it breaks the silhouette at exactly the angle a
  // dimetric camera looks along.
  parts.push(part(box(0.26, 0.5, 0.32), {
    at:     [ 0.2, 1.05, 0.15 ],
    rotate: [ deg(24), deg(-18), deg(-9) ],
    color:  palette.floe,
    jitter: 0.2,
    rng,
  }))

  // Grimed from the waterline up rather than from the top down: what dirties
  // sea ice is the sea, and the floor is high because the whole plate has to
  // stay pale — a grey floe is a rock, and the guard already has fifty-nine of
  // those.
  return mergeParts(parts, { grime: 0.5, grimeFloor: 0.86 })
}
