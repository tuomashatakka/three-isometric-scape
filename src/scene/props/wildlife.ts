import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { ball, box, cyl, deg, mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'


/**
 * What lives on the coast without belonging to anybody.
 *
 * Its own file rather than a corner of `livestock.ts`, and for the reason
 * `littoral.ts` is not a corner of `vegetation.ts`: the roster is split by where
 * a prop belongs, and nothing in the flock would last a tide. A ewe is turned
 * out onto ground a farm owns; a seal is on a rock nobody does, for as long as
 * the water lets it be.
 *
 * Like the flock, it faces **+z** so the yaw the placement deals it is the
 * direction it is looking, and it lies on `y = 0` at the belly.
 */

/** Metres from the rock to the top of the barrel of a hauled-out cow. */
const BACK = 0.21

/**
 * A grey seal hauled out on a rock.
 *
 * Lying rather than standing, and that is the whole of the silhouette. A seal
 * out of the water has no legs to break its outline with — it is one smooth
 * mass on the stone — so what has to read at this scale is the *taper*: heavy
 * at the shoulder, thin at the tail, and the head lifted clear at one end. Drawn
 * as a level lozenge it is a boulder, and the guard already has fifty-nine of
 * those.
 *
 * The head is the one part that stands up, and it is what buys the read. Grey
 * seals bask with the muzzle up and the hind flippers raised — the "banana" —
 * and even a third of that angle is enough to say animal from a camera that
 * only ever looks down at the rock from one bearing.
 *
 * Ten parts, which is the scatter budget in `vegetation.ts`: this is stamped
 * over every haul-out in the archipelago as one `InstancedMesh`, so a part here
 * is memory once and a triangle on every instance.
 */
export function buildSeal (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  // The barrel. One long ellipsoid for the mass, with the shoulder standing
  // proud of it — a seal is widest a third of the way back from the neck and a
  // single symmetric lozenge reads as a fish.
  parts.push(part(ball(0.3, 7), {
    at: [ 0, BACK, -0.1 ], scale: [ 0.86, 0.66, 2.5 ], color: palette.pelt, jitter: 0.14, rng,
  }))
  parts.push(part(ball(0.27, 6), {
    at: [ 0, BACK + 0.02, 0.34 ], scale: [ 0.92, 0.74, 1.1 ], color: palette.pelt, jitter: 0.16, rng,
  }))

  // The tail end, and the pale flank blotching a grey seal carries. Two colours
  // rather than one: a single flat pelt at this size is a dark pebble, and the
  // mottling is the only thing that says the pebble has a coat on.
  parts.push(part(ball(0.2, 6), {
    at: [ 0, BACK - 0.03, -0.72 ], scale: [ 0.72, 0.6, 1.5 ], color: palette.peltPale, jitter: 0.18, rng,
  }))

  // Neck and muzzle, lifted. A cylinder starts on the y axis, so the x rotation
  // is what tips it forward out of the shoulder.
  parts.push(part(cyl(0.11, 0.16, 0.3, 6), {
    at:     [ 0, BACK + 0.16, 0.6 ],
    rotate: [ deg(46), 0, 0 ],
    color:  palette.pelt,
    jitter: 0.12,
    rng,
  }))
  parts.push(part(ball(0.12, 5), {
    at: [ 0, BACK + 0.29, 0.83 ], scale: [ 0.86, 0.82, 1.25 ], color: palette.pelt, jitter: 0.12, rng,
  }))

  // The fore flippers, held against the flank and angled back the way a hauled
  // animal holds them. Flat boxes, because a flipper has no thickness worth a
  // triangle.
  for (const side of [ -1, 1 ])
    parts.push(part(box(0.09, 0.04, 0.34), {
      at:     [ side * 0.2, 0.05, 0.2 ],
      rotate: [ 0, side * deg(24), side * deg(12) ],
      color:  palette.peltPale,
      jitter: 0.12,
      rng,
    }))

  // The hind flippers, splayed and raised clear of the stone — the other half of
  // the basking pose, and the part that keeps the tail from reading as a stump.
  for (const side of [ -1, 1 ])
    parts.push(part(box(0.12, 0.05, 0.3), {
      at:     [ side * 0.1, BACK - 0.02, -1.06 ],
      rotate: [ deg(-22), side * deg(30), 0 ],
      color:  palette.peltPale,
      jitter: 0.14,
      rng,
    }))

  // Wet along the belly rather than grimed: an animal that has just come out of
  // the sea is dark where the water is still on it and drying along the back,
  // which is the same gradient the flock's grime already draws and the opposite
  // way up from the one a fleece wants.
  return mergeParts(parts, { grime: BACK * 1.6, grimeFloor: 0.7 })
}
