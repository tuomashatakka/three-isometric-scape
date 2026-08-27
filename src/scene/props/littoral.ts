import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { applyBend, applyTaper, blade, cyl, deg, mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'


const TAU = Math.PI * 2


/**
 * The tidal band — what grows on a rock the sea washes.
 *
 * Its own file rather than a corner of `vegetation.ts` for the reason `shore.ts`
 * and `upland.ts` are their own: the roster is split by where a prop belongs,
 * and these two belong somewhere nothing else in the scape grows. Neither of
 * them is a plant that would survive a metre inland, and nothing in
 * `vegetation.ts` would last a tide.
 *
 * Both are scatter props and both stay well inside the ten-part budget
 * `vegetation.ts` sets out: they are stamped over every rock in the guard, so a
 * part here is memory once and a triangle on every instance.
 */

/**
 * Bladderwrack (rakkolevä) — the weed that hangs in the wash.
 *
 * Straps rather than leaves, and drooping rather than standing: the fronds bend
 * hard from a common holdfast and end below where they started, because weed out
 * of the water hangs off the stone under its own weight. That droop is the whole
 * silhouette — a clump built from upright blades reads as grass that has somehow
 * got its feet wet, which is the one thing this must not look like.
 *
 * The base sits at `y = 0` like every other prop, so the placement decides how
 * far down the shelf the clump hangs rather than the geometry assuming a depth.
 */
export function buildBladderwrack (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const fronds                  = 5
  const start                   = rng.range(0, TAU)

  for (let frond = 0; frond < fronds; frond += 1) {
    const length = 0.34 + rng.range(0, 0.3)
    const angle  = start + frond / fronds * TAU + rng.range(-0.3, 0.3)

    // Past a half turn, so the strap folds back on itself and the tip finishes
    // below the holdfast it grew from. Measured rather than guessed: the first
    // cut bent 96–148° and read as a tuft of grass standing in the sea, because
    // a frond bent by less than a half turn still spends most of its length
    // going up. `littoral.test.ts` states the resulting silhouette — broader
    // than it is tall — as the fact that separates weed from grass.
    const strap = applyBend(applyTaper(blade(0.075, length), 0.45, 'y'), deg(rng.range(175, 225)), 'y')

    parts.push(part(strap, {
      at:     [ Math.cos(angle) * 0.2, length * 0.06, Math.sin(angle) * 0.2 ],
      rotate: [ deg(rng.range(-12, 12)), angle, deg(rng.range(-12, 12)) ],
      color:  rng.next() > 0.4 ? palette.wrack : palette.wrackDeep,
      jitter: 0.2,
      rng,
    }))
  }

  return mergeParts(parts, { grime: 0.7, grimeFloor: 0.3 })
}

/**
 * A crust of rock lichen — the grey-green scab above the reach of the tide.
 *
 * Flat to the point of being paint. Four overlapping discs a couple of
 * centimetres proud, which at any zoom the guard is seen from is a stain on the
 * stone rather than a thing standing on it — and that is correct: lichen has no
 * silhouette, only an edge. Building it with any height at all would put a
 * hedgehog of little domes over every rock in the archipelago.
 *
 * One patch in four is drawn rust rather than grey-green, which is the map
 * lichen and the sunburst that share these rocks with it. Without it the crust
 * is one flat colour repeated forty-nine times and reads as a texture bug.
 */
export function buildRockLichen (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const patches                 = 4
  const start                   = rng.range(0, TAU)

  for (let patch = 0; patch < patches; patch += 1) {
    const radius = 0.16 + rng.range(0, 0.13)
    const angle  = start + patch / patches * TAU + rng.range(-0.24, 0.24)
    const reach  = rng.range(0.05, 0.2)

    parts.push(part(cyl(radius, radius * 0.9, 0.02, 7), {
      at:     [ Math.cos(angle) * reach, 0.012 + patch * 0.004, Math.sin(angle) * reach ],
      rotate: [ 0, rng.range(0, TAU), 0 ],
      color:  patch % 4 === 3 ? palette.lichenRust : palette.lichen,
      jitter: 0.16,
      rng,
    }))
  }

  return mergeParts(parts, { grime: 0.5, grimeFloor: 0.42 })
}
