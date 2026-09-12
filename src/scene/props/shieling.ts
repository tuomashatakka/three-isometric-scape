import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { box, createRockGeometry, cyl, deg, mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'
import { gableEnd, gabledRoof } from './timber.ts'


/**
 * The shieling — one room of dry stone under a turf roof, with the stock fold
 * walled onto the back of it.
 *
 * Modelled in the farmstead's own frame: base at `y = 0`, long axis on `x`, door
 * on local `+z`. That is what lets it be sited with `faceToward` and walked to
 * with `doorstepOf` rather than needing a yaw helper of its own.
 *
 * Three things set it apart from the smokehouse it is otherwise built like, and
 * every one of them is the building being *poor* rather than being different:
 *
 * - the walls are field stone, not squared log. Nobody carries sawn timber two
 *   hundred metres up a hill for ten weeks a year, so a shieling is built out of
 *   whatever the site was already covered in.
 * - the roof has almost no overhang. Twenty-two centimetres is a hand's width of
 *   eave, which is all a turf roof on birch poles carries and — the reason it is
 *   worth writing down — all this camera will allow. At forty the eave hid three
 *   quarters of a metre of wall at the tour's own tilt, and the building read as
 *   a green slab standing on nothing.
 * - there is no chimney, only a hole. The hut is shut up empty for most of the
 *   year, which is why `landscape/hearths.ts` does not know it exists and why
 *   nothing smokes out of it in the default season.
 *
 * The fold is the other half of the building rather than a prop beside it: a
 * shieling without one is a hut, and the two are laid out together because the
 * wall is what stops the stock walking through the door at night. It is a `D`
 * laid on the back wall — a half circle of dry stone struck from the middle of
 * that wall, closed on the `-x` side by a short wing running back to the hut's
 * own corner, and left open on the `+x` side. That opening is the gateway, and
 * it is the only one: a fold with a gap at each end is a passage.
 */

/** The room: half its length and half its depth, at the wall face. */
const HALF_LENGTH = 1.6
const HALF_DEPTH  = 1.15

/** Top of the socle, the wall head, and the ridge. */
const PLINTH = 0.26
const EAVE   = PLINTH + 1.15
const PEAK   = EAVE + 0.95

/** Turf is laid thick, and the helper turns that into a vertical rise at the ridge. */
const TURF = 0.22

/** Courses of stone in the wall, and how many blocks run along a long side. */
const COURSES = 4
const RUN     = 7

/**
 * The fold: a half circle struck from the middle of the back wall.
 *
 * Its two ends land exactly on that wall's line, which is what makes the hut a
 * side of the fold rather than a thing standing inside it. Sized so a dozen ewes
 * fit and no more — a shieling fold is a night's holding, not a pasture.
 */
const FOLD_RADIUS = 3.2
const FOLD_STONES = 26

/** Where the wing wall runs, closing the fold's `-x` end back onto the hut. */
const WING_STONES = 3

/**
 * Courses in the fold wall, and the rise of one.
 *
 * Four rather than three, which stands the wall at about ninety centimetres —
 * the height the enclosure walls elsewhere in the scape are built to, and the
 * height at which a ring of stone on a hillside stops reading as field clearance
 * somebody left in a curve.
 */
const FOLD_COURSES = 4
const FOLD_COURSE  = 0.24

export function buildShieling (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const roof                    = { eaveY: EAVE, peakY: PEAK, halfDepth: HALF_DEPTH }

  // The socle. Baked at one height, which is why `SILL_FALL` in the siting is
  // the tightest in the scape — see `landscape/shieling.ts`.
  parts.push(part(box(HALF_LENGTH * 2 + 0.34, PLINTH, HALF_DEPTH * 2 + 0.34), {
    at: [ 0, PLINTH / 2, 0 ], color: palette.graniteDark, jitter: 0.14, rng,
  }))

  // Field stone, laid in courses that overlap rather than butt. The long walls
  // run on x and the gable walls on z, and each course is offset half a block so
  // the corners interlock — the same rule the smokehouse's logs follow, in the
  // one material that was already lying on the site.
  for (let course = 0; course < COURSES; course += 1) {
    const y     = PLINTH + (EAVE - PLINTH) * (course + 0.5) / COURSES
    const shift = course % 2 === 0 ? 0 : 0.5

    for (let along = 0; along < RUN; along += 1) {
      const t = (along + 0.5 + shift) / RUN

      for (const side of [ -1, 1 ])
        parts.push(part(
          createRockGeometry({ radius: 0.24, detail: 0, rng, roughness: 0.5, scale: [ 1.5, 0.8, 0.9 ]}),
          {
            at:     [ -HALF_LENGTH + t * HALF_LENGTH * 2, y, side * HALF_DEPTH ],
            rotate: [ 0, deg(rng.range(-8, 8)), 0 ],
            color:  rng.pick([ palette.granite, palette.graniteWarm ]),
            jitter: 0.16,
            rng,
          },
        ))
    }

    // The gable walls carry fewer blocks, because they are shorter — not because
    // they are built differently.
    for (let along = 0; along < 4; along += 1) {
      const t = (along + 0.5 + shift) / 4

      for (const side of [ -1, 1 ])
        parts.push(part(
          createRockGeometry({ radius: 0.24, detail: 0, rng, roughness: 0.5, scale: [ 0.9, 0.8, 1.4 ]}),
          {
            at:     [ side * HALF_LENGTH, y, -HALF_DEPTH + t * HALF_DEPTH * 2 ],
            color:  rng.pick([ palette.granite, palette.graniteDark ]),
            jitter: 0.16,
            rng,
          },
        ))
    }
  }

  for (const side of [ -1, 1 ])
    gableEnd(parts, rng, palette.graniteWarm, { ...roof, thick: 0.24, at: side * (HALF_LENGTH - 0.06) })

  // Sod on birch poles. `soil` on the ridge cap is the cut edge of the turf,
  // which is the one place the earth under the grass is visible from above.
  gabledRoof(parts, rng, palette.moss, palette.soil, {
    ...roof, length: HALF_LENGTH * 2 + 0.5, overhang: 0.22, thickness: TURF,
  })

  // The door, on the wall the site search turns back down the hill.
  parts.push(part(box(0.74, 1.24, 0.12), {
    at: [ 0, PLINTH + 0.62, HALF_DEPTH + 0.07 ], color: palette.driftwoodDark, jitter: 0.1, rng,
  }))
  parts.push(part(box(0.64, 0.1, 0.2), {
    at: [ 0, PLINTH + 1.28, HALF_DEPTH + 0.04 ], color: palette.deadWood, jitter: 0.09, rng,
  }))

  // The smoke hole, and the one stone that stops the turf falling into it.
  parts.push(part(cyl(0.15, 0.15, 0.3, 6), {
    at: [ HALF_LENGTH * 0.45, PEAK + TURF + 0.08, 0 ], color: palette.graniteDark, jitter: 0.12, rng,
  }))

  // The fold. Stations closer than a stone is wide, so the courses overlap into
  // each other — a wall is a pile that happens to be long, and gaps are what
  // separate one from a row of rocks. The same rule `props/wall.ts` follows, at
  // the one radius it cannot: that builder is world-space and samples ground,
  // and a prop builder has no ground to sample.
  const laid: [number, number, number][] = []

  for (let station = 0; station < FOLD_STONES; station += 1) {
    const around = Math.PI + Math.PI * station / (FOLD_STONES - 1)

    laid.push([
      Math.cos(around) * FOLD_RADIUS,
      Math.sin(around) * FOLD_RADIUS - HALF_DEPTH,
      around,
    ])
  }

  // The wing, from the arc's `-x` end back to the hut's corner. Everything left
  // of the hut is walled; everything right of it is the way in.
  for (let station = 1; station <= WING_STONES; station += 1)
    laid.push([ -FOLD_RADIUS + (FOLD_RADIUS - HALF_LENGTH) * station / WING_STONES, -HALF_DEPTH, 0 ])

  for (const [ x, z, around ] of laid)
    for (let course = 0; course < FOLD_COURSES; course += 1)
      parts.push(part(
        createRockGeometry({ radius: 0.26, detail: 0, rng, roughness: 0.62, scale: [ 1.2, 0.7, 1.1 ]}),
        {
          at:     [ x, 0.1 + course * FOLD_COURSE, z ],
          rotate: [ 0, around + deg(rng.range(-14, 14)), 0 ],
          // Two granites to one lichen: the fold is old wall, and the stone
          // that has been face up since it was laid is the stone that grew it.
          color:  rng.pick([ palette.granite, palette.granite, palette.lichen ]),
          jitter: 0.2,
          rng,
        },
      ))

  return mergeParts(parts, { grime: 1.8, grimeFloor: 0.44 })
}
