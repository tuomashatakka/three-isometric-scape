import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { box, cyl, deg, mergeParts, part, spread } from 'threejs-scene/modules/assets'
import type { StackMouth } from './buildings.ts'
import type { NordicPalette } from './palette.ts'
import { gableEnd, gabledRoof } from './timber.ts'


/**
 * The smokehouse (savustuspirtti) — where the catch is cured, up the bank from
 * the boats.
 *
 * Modelled in the farmstead's own frame: base at `y = 0`, long axis on `x`, door
 * on local `+z`. That is what lets it be sited with `faceToward` and walked to
 * with `doorstepOf` rather than needing a yaw helper of its own — the chapel
 * needed one only because its door is in a tower's west face.
 *
 * Two things set it apart from the sauna it is otherwise built like, and both
 * are the reason it reads as a different building at a hundred metres: the roof
 * is turf rather than shingle, and there is a cowl on the ridge with the smoke
 * coming out of it. {@link SMOKEHOUSE_VENT} is where that mouth is, published
 * for `landscape/hearths.ts` the way the farmhouse's chimney is.
 */

const LENGTH     = 3.4
const HALF_DEPTH = 1.25

/** Courses of log in the wall, and how thick one is. */
const COURSES = 5
const COURSE  = 0.38

/** Top of the granite socle, the wall head, and the ridge. */
const PLINTH = 0.34
const EAVE   = PLINTH + COURSES * COURSE
const PEAK   = EAVE + 1.05

/**
 * Turf is heavier than shingle and is laid thicker, which the roof helper takes
 * as a perpendicular slab thickness and turns into a vertical rise at the ridge.
 * The cowl has to start above *that*, not above the underside the pitch is
 * measured on, or it stands with its feet in its own roof.
 */
const TURF      = 0.2
const RIDGE_TOP = PEAK + 0.34

/** How far the vent hood stands over the ridge, in metres. */
const COWL = 0.6

/**
 * The vent, at the mouth, in the prop's own frame.
 *
 * Offset along the ridge for the same reason the farmhouse's chimney is: a
 * plume rising from the exact middle of a building reads as a rendering
 * decision rather than as a flue that is somewhere in particular. Cleared of
 * the cap above the hood so the smoke leaves the building rather than the
 * timber.
 */
export const SMOKEHOUSE_VENT: StackMouth = { x: 0.85, y: RIDGE_TOP + COWL + 0.14, z: 0 }

export function buildSmokehouse (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const roof                    = { eaveY: EAVE, peakY: PEAK, halfDepth: HALF_DEPTH }

  parts.push(part(box(LENGTH + 0.4, PLINTH, HALF_DEPTH * 2 + 0.4), {
    at: [ 0, PLINTH / 2, 0 ], color: palette.granite, jitter: 0.13, rng,
  }))

  // Log courses, laid the way the sauna's are: the long walls run on x, the
  // gable walls on z, and each course is offset half a log so the corners
  // interlock rather than butt.
  for (let course = 0; course < COURSES; course += 1) {
    const y     = PLINTH + COURSE * (course + 0.5)
    const color = course % 2 === 0 ? palette.tarWood : palette.woodDark

    for (const side of [ -1, 1 ]) {
      parts.push(part(cyl(COURSE * 0.5, COURSE * 0.5, LENGTH, 6), {
        at:     [ 0, y, side * HALF_DEPTH ],
        rotate: [ 0, 0, deg(90) ],
        color,
        jitter: 0.1,
        rng,
      }))
      parts.push(part(cyl(COURSE * 0.5, COURSE * 0.5, HALF_DEPTH * 2, 6), {
        at:     [ side * LENGTH / 2, y + COURSE * 0.5, 0 ],
        rotate: [ deg(90), 0, 0 ],
        color,
        jitter: 0.1,
        rng,
      }))
    }
  }

  for (const side of [ -1, 1 ])
    gableEnd(parts, rng, palette.woodDark, { ...roof, thick: 0.2, at: side * (LENGTH / 2 - 0.1) })

  // Sod, not shingle. `soil` on the ridge cap is the cut edge of the turf,
  // which is the one place the earth under the grass is visible from above.
  gabledRoof(parts, rng, palette.moss, palette.soil, {
    ...roof, length: LENGTH + 0.6, overhang: 0.36, thickness: TURF,
  })

  // The door, on the wall the site search faces at the water.
  parts.push(part(box(0.82, 1.5, 0.13), {
    at: [ 0, PLINTH + 0.75, HALF_DEPTH + 0.07 ], color: palette.woodLight, jitter: 0.09, rng,
  }))
  parts.push(part(box(0.28, 0.07, 0.06), {
    at: [ 0.3, PLINTH + 0.86, HALF_DEPTH + 0.15 ], color: palette.ironRust, jitter: 0.1, rng,
  }))

  // The cowl: four stub posts holding a cap clear of the ridge, so the smoke
  // has somewhere to leave and the rain has nowhere to get in.
  for (const sx of [ -1, 1 ])
    for (const sz of [ -1, 1 ])
      parts.push(part(cyl(0.05, 0.05, COWL, 5), {
        at:     [ SMOKEHOUSE_VENT.x + sx * 0.17, RIDGE_TOP + COWL / 2, sz * 0.17 ],
        color:  palette.tarWood,
        jitter: 0.11,
        rng,
      }))

  parts.push(part(box(0.64, 0.12, 0.64), {
    at:     [ SMOKEHOUSE_VENT.x, RIDGE_TOP + COWL + 0.06, 0 ],
    color:  palette.shingle,
    jitter: 0.08,
    rng,
  }))

  // Alder billets against the blind gable — the wood the smoke is made of, and
  // the one part of this building that says what happens inside it.
  for (const [ row, y ] of [ 0.16, 0.44 ].entries())
    for (const z of spread(3, 0.86))
      parts.push(part(cyl(0.13, 0.13, 0.84, 6), {
        at:     [ -(LENGTH / 2 + 0.42) - row * 0.05, y, z ],
        rotate: [ deg(90), 0, deg(rng.range(-4, 4)) ],
        color:  rng.next() > 0.5 ? palette.wood : palette.driftwoodDark,
        jitter: 0.15,
        rng,
      }))

  return mergeParts(parts, { grime: 2.1, grimeFloor: 0.48 })
}
