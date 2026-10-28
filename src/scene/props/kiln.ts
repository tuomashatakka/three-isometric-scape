import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { box, cone, cyl, deg, mergeParts, part, spread } from 'threejs-scene/modules/assets'
import type { StackMouth } from './buildings.ts'
import type { NordicPalette } from './palette.ts'


/**
 * The lime kiln (kalkkiuuni) — the drum cut into the bank above the boats.
 *
 * Modelled in the farmstead's own frame: base at `y = 0`, draw arch on local
 * `+z`. That is what lets it be aimed with `faceToward` like every other
 * building in the kit, although what it is aimed at is the way the ground falls
 * rather than a door's view — see `landscape/kiln.ts`.
 *
 * Where it parts company with the five farmstead buildings is the *base*. They
 * are plopped, and a {@link Ploppable} levels on the high side of its own
 * footprint and grows a foundation down to the low side; do that to a kiln and
 * the skirt walls up the draw arch, which is the one opening the building has.
 * So this one is **merged at the sill** instead: the dressing places it at the
 * ground under the arch and the bank behind it swallows however much of the back
 * of the drum it reaches, which is the honest answer and costs no draw call at
 * all. How deep it is buried is the site's answer rather than the geometry's,
 * and that is why nothing here takes the site's fall as a parameter.
 *
 * {@link KILN_MOUTH} is the rim, published for `landscape/hearths.ts` the way
 * the smokehouse's cowl is — except that this flue only smokes for the few weeks
 * of the year the kiln is actually fired.
 */

/**
 * Outside radius of the drum at the sill, and at the rim.
 *
 * {@link FOOT} is `KILN_SILL` in `landscape/kiln.ts` seen from the geometry's
 * side — the search measures the fall across it, asks the freeboard at it and
 * stands the building on the ground under it, so the two cannot disagree. The
 * test beside this file is what keeps them equal.
 */
const FOOT = 1.85
const RIM  = 1.5

/** How far the drum stands over the draw sill, in metres. */
const HEIGHT = 3.4

/** Courses of dry block in the drum. */
const COURSES = 6

/** The draw arch: half its span, its height to the springing, and its depth. */
const MOUTH_HALF  = 0.52
const MOUTH_CLEAR = 1.18
const MOUTH_DEEP  = 0.95

/**
 * The rim, at the mouth, in the prop's own frame.
 *
 * Dead centre, unlike every chimney in the kit — those are offset along a ridge
 * so a plume does not read as a rendering decision, and this one is not offset
 * because a kiln genuinely *is* a hole in the middle of a circle. Lifted clear
 * of the charging ring so the smoke leaves the throat rather than the stonework.
 */
export const KILN_MOUTH: StackMouth = { x: 0, y: HEIGHT + 0.42, z: 0 }

/** The radius of the course at a height up the drum, battered in as it rises. */
function batter (t: number): number {
  return FOOT + (RIM - FOOT) * t
}

export function buildKiln (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  // The flagged apron the lime is raked out onto. Clear of the arch rather than
  // flush with it: what a kiln actually occupies is the ground somebody stands
  // on with a rake, and `KILN_FOOTING` is sized to hold this and the heap.
  parts.push(part(box(2.7, 0.16, 1.7), {
    at: [ 0, 0.08, FOOT + 0.62 ], color: palette.granite, jitter: 0.14, rng,
  }))

  // The drum, laid in courses of unmortared block that batter in as they rise.
  // Eight sides rather than a cylinder: a dry-stone kiln is built in straight
  // runs between corners, and at this radius a true circle costs vertices to
  // say something the stonework does not.
  for (let course = 0; course < COURSES; course += 1) {
    const low    = course / COURSES
    const high   = (course + 1) / COURSES
    const colors = [ palette.granite, palette.graniteDark, palette.graniteWarm ]

    parts.push(part(cyl(batter(high), batter(low), HEIGHT / COURSES, 8), {
      at:     [ 0, HEIGHT * (low + high) / 2, 0 ],
      color:  colors[course % colors.length],
      jitter: 0.12,
      rng,
    }))
  }

  // The draw arch. Two jambs, a lintel across them, and a recess behind — the
  // recess is what turns a pale stone wall into a mouth, and it is the one part
  // of this building that has to read at the zoom the whole island is seen at.
  for (const side of [ -1, 1 ])
    parts.push(part(box(0.44, MOUTH_CLEAR + 0.3, MOUTH_DEEP), {
      at:     [ side * (MOUTH_HALF + 0.22), (MOUTH_CLEAR + 0.3) / 2, FOOT - 0.12 ],
      color:  palette.graniteDark,
      jitter: 0.11,
      rng,
    }))

  parts.push(part(box(MOUTH_HALF * 2 + 0.88, 0.34, MOUTH_DEEP), {
    at:     [ 0, MOUTH_CLEAR + 0.47, FOOT - 0.12 ],
    color:  palette.graniteWarm,
    jitter: 0.1,
    rng,
  }))

  parts.push(part(box(MOUTH_HALF * 2, MOUTH_CLEAR, 0.6), {
    at:     [ 0, MOUTH_CLEAR / 2, FOOT - 0.42 ],
    color:  palette.kilnSoot,
    jitter: 0.08,
    rng,
  }))

  // The scorch the draught leaves above the lintel. Thin, and above the arch
  // rather than around it, because that is where a kiln actually blackens.
  parts.push(part(box(MOUTH_HALF * 2 + 0.5, 0.75, 0.1), {
    at:     [ 0, MOUTH_CLEAR + 1.0, FOOT + 0.02 ],
    color:  palette.kilnSoot,
    jitter: 0.1,
    rng,
  }))

  // Two iron bands round the drum. A kiln spends its life being heated and
  // cooled, and a ring of unmortared block does not survive that without
  // something holding it in.
  for (const t of [ 0.34, 0.72 ])
    parts.push(part(cyl(batter(t) + 0.05, batter(t) + 0.05, 0.11, 8), {
      at: [ 0, HEIGHT * t, 0 ], color: palette.iron, jitter: 0.09, rng,
    }))

  // The charging ring at the rim, and the throat inside it. The throat is soot
  // rather than open air for the reason the arch recess is: a hole that is
  // modelled as a hole is a hole the ground behind it shows through.
  parts.push(part(cyl(RIM + 0.12, RIM + 0.12, 0.3, 8), {
    at: [ 0, HEIGHT + 0.15, 0 ], color: palette.graniteDark, jitter: 0.11, rng,
  }))
  parts.push(part(cyl(RIM - 0.4, RIM - 0.4, 0.18, 8), {
    at: [ 0, HEIGHT + 0.24, 0 ], color: palette.kilnSoot, jitter: 0.07, rng,
  }))

  // The revetment wings, running back into the brae on either side of the
  // charging floor. They are the part of the building that says it is cut into
  // a hill rather than standing on one, and on a shallow site they are most of
  // what stays above the turf.
  for (const side of [ -1, 1 ])
    parts.push(part(box(0.52, 1.6, 2.6), {
      at:     [ side * (FOOT + 0.05), 0.8, -1.6 ],
      rotate: [ 0, deg(side * -7), 0 ],
      color:  palette.granite,
      jitter: 0.13,
      rng,
    }))

  // The charging stage: a plank bridge from the bank onto the rim, with a rail
  // on one side. Level with the rim rather than with the ground, because the
  // ground behind this building is at a different height on every seed.
  parts.push(part(box(1.5, 0.12, 1.9), {
    at: [ 0, HEIGHT + 0.26, -RIM - 0.85 ], color: palette.plank, jitter: 0.12, rng,
  }))

  for (const z of spread(3, 1.5))
    parts.push(part(cyl(0.07, 0.07, 0.9, 5), {
      at:     [ -0.78, HEIGHT + 0.72, z - RIM - 0.85 ],
      color:  palette.tarWood,
      jitter: 0.1,
      rng,
    }))

  parts.push(part(cyl(0.06, 0.06, 1.9, 5), {
    at:     [ -0.78, HEIGHT + 1.12, -RIM - 0.85 ],
    rotate: [ deg(90), 0, 0 ],
    color:  palette.tarWood,
    jitter: 0.1,
    rng,
  }))

  // The quicklime drawn out of the last burn, heaped clear of the arch so the
  // next draw has somewhere to go. The single brightest thing on this coast, and
  // the one part of the building that says what came out of it.
  parts.push(part(cone(1.15, 0.72, 7), {
    at: [ 1.1, 0.3, FOOT + 0.72 ], color: palette.quicklime, jitter: 0.16, rng,
  }))
  parts.push(part(cone(0.6, 0.38, 6), {
    at: [ 1.95, 0.22, FOOT + 0.1 ], color: palette.quicklime, jitter: 0.19, rng,
  }))

  // The shell sand waiting to go in, and the peat that will fire it. Stacked on
  // the other side of the apron, which is how a working kiln is actually laid
  // out: raw in on one hand, burnt out on the other.
  parts.push(part(cone(0.74, 0.5, 6), {
    at: [ -1.6, 0.24, FOOT + 0.5 ], color: palette.sand, jitter: 0.18, rng,
  }))

  for (const [ row, y ] of [ 0.17, 0.5 ].entries())
    parts.push(part(box(1.2 - row * 0.2, 0.34, 0.78), {
      at:     [ -2.1, y, FOOT - 0.5 ],
      rotate: [ 0, deg(rng.range(-6, 6)), 0 ],
      color:  row === 0 ? palette.peat : palette.peatDry,
      jitter: 0.15,
      rng,
    }))

  return mergeParts(parts, { grime: 2.4, grimeFloor: 0.42 })
}
