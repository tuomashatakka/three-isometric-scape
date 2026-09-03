import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { box, cyl, deg, mergeParts, part, spread } from 'threejs-scene/modules/assets'
import type { StackMouth, WindowPane } from './buildings.ts'
import type { NordicPalette } from './palette.ts'
import { claddingPlanks, gableEnd, gabledRoof, window } from './timber.ts'


/**
 * The croft (kalamaja) — the hut on the outer rock, worked from the harbour.
 *
 * The first dwelling in the kit that does not belong to the farmyard. Everything
 * else built on this coast answers to the steading: the sauna and the aitta are
 * arranged around the yard, the smokehouse to the harbour behind it, the chapel
 * to a knoll within walking distance. A croft answers to the *fishing*, which is
 * offshore — so it stands on an islet with no path to it, reached the way the
 * seamark is, by boat.
 *
 * Modelled in the farmstead's frame like every other building here: base at
 * `y = 0`, long axis on `x`, door on local `+z`. That is what lets the site
 * search aim it with `faceToward` and nothing here need a yaw helper of its own.
 *
 * Three things separate it from the smokehouse it is otherwise sized like, and
 * all three are the reason it reads as somewhere people sleep rather than
 * somewhere fish are hung. It is glazed. It has a stone chimney rather than a
 * ridge cowl, so the plume comes off one end. And it is boarded and tarred
 * rather than laid in log courses — a hut carried out to a rock in pieces is
 * built of what fits in a boat.
 */

const LENGTH     = 3.8
const HALF_DEPTH = 1.5

/** How thick the board skin is. The pane table below reads its outer face. */
const SKIN = 0.18

/**
 * How far the socle is set into the rock it stands on, in metres.
 *
 * Read by `dressing.ts` when the hut is raised and by `landscape/hearths.ts` and
 * `landscape/windows.ts` when the flue and the panes above it are placed — the
 * same reason `BEACON_SINK` and `MILL_SINK` are exported. Less than half the
 * socle, so the dry stone still reads as a course of stone rather than as a
 * building growing out of the ground.
 */
export const CROFT_SINK = 0.14

/** Top of the dry-laid socle, the wall head, and the ridge. */
const PLINTH = 0.32
const WALL   = 2.05
const EAVE   = PLINTH + WALL
const PEAK   = EAVE + 1.2

/**
 * Turf, at the smokehouse's thickness and for the same reason: there is no
 * shingle out here and nothing to nail it to. The ridge cap is cut sod, which is
 * the one place the earth under the grass shows from above.
 */
const TURF = 0.2

/**
 * Where the chimney stands, and how far over the ridge it carries.
 *
 * Inside the building rather than against its gable, which is the farmhouse's
 * arrangement and not the barn's — a stack built outside the wall would have to
 * clear the roof overhang, and on a hut this small there is not enough building
 * left past the eaves to stand one on.
 *
 * Off the middle by design. A plume rising from the exact centre of a ridge
 * reads as a rendering decision; a flue that is somewhere in particular reads as
 * a hearth in a corner of a one-room hut, which is what it is.
 */
const STACK_X   = -1.35
const STACK_TOP = PEAK + 0.95

/**
 * The flue, at the mouth, in the prop's own frame.
 *
 * Published for `landscape/hearths.ts` exactly the way `FARMHOUSE_CHIMNEY` and
 * `SMOKEHOUSE_VENT` are, and cleared of the cap below so the smoke leaves the
 * stack rather than the masonry.
 */
export const CROFT_VENT: StackMouth = { x: STACK_X, y: STACK_TOP + 0.22, z: 0 }

/**
 * The croft's two lights: one beside the door, one in the seaward gable.
 *
 * The gable one is there for the reason the farmhouse's are. The camera is a
 * fixed dimetric heading the reader can spin, and a hut glazed only on its long
 * wall turns a blind end to the eye on half those yaws — and this is the only
 * glass in the kit that is not part of a farm or a chapel. Whether a lamp is
 * burning behind either pane is the occupancy roll's business, in
 * `landscape/windows.ts`; whether the reader can see the wall it is in at all is
 * this table's.
 *
 * The long wall's face is the cladding plane, `HALF_DEPTH + SKIN / 2`; the gable
 * wall is a 0.2 m board, so its face is `LENGTH / 2 + 0.1`. Writing either past
 * its face is a pane floating off its own wall — see `window()` in `timber.ts`.
 */
export const CROFT_WINDOWS: readonly WindowPane[] = [
  { x: 1.05, y: PLINTH + 1.32, z: HALF_DEPTH + SKIN / 2, width: 0.55, height: 0.5, facing: 1 },
  { x: LENGTH / 2 + 0.1, y: PLINTH + 1.32, z: 0, width: 0.5, height: 0.45, facing: 1, axis: 'x' },
]

export function buildCroft (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const roof                    = { eaveY: EAVE, peakY: PEAK, halfDepth: HALF_DEPTH }

  // Dry-laid stone, and wider than the walls on purpose: the site search allows
  // a little fall across the footing, and this is what takes up the rest of it.
  parts.push(part(box(LENGTH + 0.44, PLINTH, HALF_DEPTH * 2 + 0.44), {
    at: [ 0, PLINTH / 2, 0 ], color: palette.granite, jitter: 0.14, rng,
  }))

  // Tarred boards to the weather, worn ones to the lee. Clad from the socle up,
  // never from the ground: a board run down past the sill is a board standing in
  // the rock.
  claddingPlanks(parts, rng, palette.tarWood, 8, LENGTH, WALL, SKIN, -HALF_DEPTH, PLINTH)
  claddingPlanks(parts, rng, palette.woodDark, 8, LENGTH, WALL, SKIN, HALF_DEPTH, PLINTH)

  for (const side of [ -1, 1 ]) {
    parts.push(part(box(0.2, WALL, HALF_DEPTH * 2), {
      at: [ side * LENGTH / 2, PLINTH + WALL / 2, 0 ], color: palette.tarWood, jitter: 0.08, rng,
    }))
    gableEnd(parts, rng, palette.tarWood, { ...roof, thick: 0.2, at: side * LENGTH / 2 })
  }

  gabledRoof(parts, rng, palette.moss, palette.soil, {
    ...roof, length: LENGTH + 0.5, overhang: 0.32, thickness: TURF,
  })

  // The stack, from the socle straight through the roof. One box and a cap: a
  // flue on a hut this size is a metre of chimney, not a piece of architecture.
  parts.push(part(box(0.6, STACK_TOP, 0.6), {
    at: [ STACK_X, STACK_TOP / 2, 0 ], color: palette.graniteDark, jitter: 0.12, rng,
  }))
  parts.push(part(box(0.76, 0.14, 0.76), {
    at: [ STACK_X, STACK_TOP + 0.07, 0 ], color: palette.graniteWarm, jitter: 0.07, rng,
  }))

  // The door, on the wall the site search turns back toward the harbour, and the
  // flat rock somebody dropped in front of it to step off the socle onto.
  parts.push(part(box(0.78, 1.62, 0.13), {
    at: [ -0.55, PLINTH + 0.81, HALF_DEPTH + SKIN / 2 + 0.05 ], color: palette.plank, jitter: 0.09, rng,
  }))
  parts.push(part(box(0.24, 0.06, 0.06), {
    at: [ -0.28, PLINTH + 0.92, HALF_DEPTH + SKIN / 2 + 0.12 ], color: palette.ironRust, jitter: 0.1, rng,
  }))
  parts.push(part(box(1.1, 0.16, 0.72), {
    at: [ -0.55, 0.08, HALF_DEPTH + 0.56 ], color: palette.graniteWarm, jitter: 0.18, rng,
  }))

  for (const pane of CROFT_WINDOWS)
    window(
      parts, rng, palette.driftwood, palette.glass,
      [ pane.x, pane.y, pane.z ], pane.width, pane.height, pane.facing, pane.axis ?? 'z',
    )

  // Oars stood against the blind gable — the one part of this building that says
  // how anybody got to it. Leaned rather than stacked: an oar laid flat against a
  // wall reads as a plank.
  //
  // Against the *chimney* end, which is the gable with no glass in it, and that
  // is the reason rather than the taste: the pane table above is read as saying
  // where the wall's outer face is, and `timber.test.ts` states as a fact about
  // the geometry that the outermost surface at the middle of every pane in the
  // kit is its glass. An oar leaned across a window fails that, correctly.
  for (const [ index, z ] of spread(2, 0.7).entries()) {
    const lean = deg(rng.range(9, 15)) * (index === 0 ? 1 : -1)

    parts.push(part(cyl(0.045, 0.055, 2.3, 5), {
      at:     [ -(LENGTH / 2 + 0.34), 1.15, z ],
      rotate: [ lean, 0, deg(8) ],
      color:  palette.driftwoodDark,
      jitter: 0.12,
      rng,
    }))
    parts.push(part(box(0.07, 0.62, 0.17), {
      at:     [ -(LENGTH / 2 + 0.5), 0.3, z ],
      rotate: [ lean, 0, deg(8) ],
      color:  palette.driftwood,
      jitter: 0.14,
      rng,
    }))
  }

  return mergeParts(parts, { grime: 2.2, grimeFloor: 0.5 })
}
