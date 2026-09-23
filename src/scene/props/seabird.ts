import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { ball, box, cyl, deg, mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'


/**
 * What nests on rock nobody can reach.
 *
 * Beside the seal in `wildlife.ts` by subject and in its own file by cost: the
 * seal is ten parts lying down and this is eight parts standing up, and the two
 * merge passes have nothing in common but the palette. Like the flock and the
 * colony on the guard it faces **+z**, so the yaw the placement deals it is the
 * direction it is looking, and it stands on `y = 0` at the feet.
 */

/** Metres from the ledge to the bottom of the breast of a standing bird. */
const SHIN = 0.07

/**
 * A common guillemot standing on a cliff ledge.
 *
 * Upright, and that is the whole of the silhouette. An auk's legs are set so
 * far back that it cannot stand any other way — it rests on its tail as much as
 * on its feet — and the resulting vertical, bowling-pin outline is the one thing
 * that separates a bird cliff from a gull colony at any range this camera has.
 * Drawn level, like the gulls in flight are, it is a grey lozenge on a grey
 * rock.
 *
 * The other half of the read is the front. A guillemot is chocolate over white
 * with a hard line between the two, and at forty metres a row of them on a face
 * is a row of white dots — which is exactly what a bird cliff looks like from
 * the sea. So the breast is a part of its own rather than a grime gradient: a
 * gradient fades, and what has to survive here is an edge.
 *
 * Eight parts, under the scatter budget in `vegetation.ts`: this is stamped over
 * every headland in the archipelago as one `InstancedMesh`, so a part here is
 * memory once and a triangle on every instance.
 */
export function buildGuillemot (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  // The body, leaning back off the vertical the way a standing auk does, with
  // the tail carried low behind it. One ellipsoid, stretched up rather than
  // along — the opposite proportion from the seal's, and deliberately so.
  parts.push(part(ball(0.1, 6), {
    at:     [ 0, SHIN + 0.155, 0 ],
    rotate: [ deg(-12), 0, 0 ],
    scale:  [ 0.84, 2.05, 1 ],
    color:  palette.auk,
    jitter: 0.1,
    rng,
  }))

  // The white front, laid on the belly as a flattened cap rather than mixed
  // into the body colour. Pushed forward far enough to stand clear of the dark
  // ellipsoid at every angle this camera reaches.
  parts.push(part(ball(0.075, 6), {
    at:     [ 0, SHIN + 0.135, 0.042 ],
    scale:  [ 0.8, 1.8, 0.74 ],
    color:  palette.aukBreast,
    jitter: 0.09,
    rng,
  }))

  // The tail, down onto the rock behind. Half a leg, as far as the pose goes.
  parts.push(part(box(0.05, 0.035, 0.11), {
    at:     [ 0, SHIN - 0.01, -0.1 ],
    rotate: [ deg(18), 0, 0 ],
    color:  palette.auk,
    jitter: 0.12,
    rng,
  }))

  // Neck and head, carried forward of the breast. A cylinder starts on the y
  // axis, so the x rotation is what leans it out over the drop.
  parts.push(part(cyl(0.035, 0.045, 0.09, 6), {
    at:     [ 0, SHIN + 0.345, 0.02 ],
    rotate: [ deg(14), 0, 0 ],
    color:  palette.auk,
    jitter: 0.1,
    rng,
  }))
  parts.push(part(ball(0.05, 5), {
    at: [ 0, SHIN + 0.41, 0.035 ], scale: [ 0.9, 0.95, 1.1 ], color: palette.auk, jitter: 0.1, rng,
  }))

  // The bill — long, straight and dagger-shaped, which is the auk's other
  // signature and costs one box to say.
  parts.push(part(box(0.018, 0.02, 0.1), {
    at:     [ 0, SHIN + 0.4, 0.105 ],
    rotate: [ deg(-4), 0, 0 ],
    color:  palette.aukBill,
    jitter: 0.08,
    rng,
  }))

  // The wings, folded along the flanks and crossed at the tips. Flat boxes: a
  // closed wing has no thickness worth a triangle, and the seal's flippers make
  // the same argument.
  for (const side of [ -1, 1 ])
    parts.push(part(box(0.022, 0.16, 0.07), {
      at:     [ side * 0.06, SHIN + 0.17, -0.015 ],
      rotate: [ deg(-10), 0, side * deg(6) ],
      color:  palette.auk,
      jitter: 0.1,
      rng,
    }))

  // Grimed from the feet up rather than from the back down: a bird standing in
  // a colony is soiled where the colony is, which is the ledge under it. The
  // floor is high because the breast has to stay white — a guillemot with a
  // dirty front is a guillemot nobody can see.
  return mergeParts(parts, { grime: SHIN * 2.2, grimeFloor: 0.78 })
}
