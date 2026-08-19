import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'
import { box, cyl, deg } from './primitives.ts'
import { claddingPlanks, gableEnd, gabledRoof } from './timber.ts'


/**
 * The post mill — a whole building balanced on one post so it can be turned.
 *
 * Modelled as a *jalkamylly*, the trestle mill that stood on every exposed
 * shoulder of this coast: a boarded buck carrying the machinery, a single oak
 * post carrying the buck, and a stair down the back that doubles as the lever
 * the miller pushes to bring the sails round into the wind. Everything but the
 * sails is here — the wheel is its own geometry because it is the one part of
 * the scape that turns under its own power. See `landscape/mill-sails.ts`.
 *
 * Local frame, like every other building in the kit: base at `y = 0` and the
 * front — here the sails rather than a door — on `+z`. The stair therefore runs
 * out behind on `-z`, and the door is in the back gable at the top of it.
 */

/** Height of the windshaft above the mill's own base, in metres. */
export const MILL_HUB_HEIGHT = 5.4

/** How far in front of the post the windshaft carries the sail wheel, in metres. */
export const MILL_HUB_REACH = 2.7

/**
 * How far the mill is set into the ground it stands on, in metres.
 *
 * The same sink `placeHero` applies by default, named here because the sail
 * wheel is placed by a *different* caller and has to arrive at the same hub. A
 * sink read from one end and defaulted at the other is a wheel hanging off the
 * end of its own shaft.
 */
export const MILL_SINK = 0.14

/** Height of the buck's floor above the mill's base, in metres. */
const FLOOR_Y = 2.5

/** Height of the buck's side walls, in metres. */
const WALL_Y = 2.6

/** Half-width of the buck across the ridge, in metres. */
const HALF_WIDTH = 1.5

/** Half-length of the buck along the ridge, in metres. */
const HALF_LENGTH = 1.95

const EAVE_Y = FLOOR_Y + WALL_Y
const PEAK_Y = EAVE_Y + 1.25

/**
 * The mill house, its trestle and the stair down the back.
 *
 * The trestle is the part that has to be right: a post mill is not a tower with
 * a hat on, it is a building held up in the air by four stone piers, two
 * crosstrees and four quarter bars, and the daylight under it is most of what
 * says so from any distance. Every piece of it is modelled rather than implied.
 */
export function buildWindmill (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const pierY                   = 0.55
  const treeY                   = pierY + 0.17
  const postTop                 = FLOOR_Y - 0.15

  // Four piers, each leaning its own way. A trestle is dry-laid on whatever the
  // hill had, and it has been settling ever since.
  for (const sx of [ -1, 1 ])
    for (const sz of [ -1, 1 ])
      parts.push(part(cyl(0.4, 0.5, pierY, 6), {
        at:     [ sx * 1.05, pierY / 2, sz * 1.05 ],
        rotate: [ deg(rng.range(-4, 4)), rng.range(0, Math.PI), deg(rng.range(-4, 4)) ],
        color:  palette.granite,
        jitter: 0.16,
        rng,
      }))

  // The crosstrees, laid one over the other on the piers.
  for (const [ index, turn ] of [ 0, deg(90) ].entries())
    parts.push(part(box(3, 0.34, 0.44), {
      at:     [ 0, treeY + index * 0.2, 0 ],
      rotate: [ 0, turn, 0 ],
      color:  palette.woodDark,
      jitter: 0.1,
      rng,
    }))

  // Quarter bars, from the crosstree ends up to the post. The angle is solved
  // from the two ends rather than authored, so a change to either height keeps
  // the bar touching both.
  const barFoot = 1.25
  const barTop  = postTop - 0.35
  const barRise = barTop - (treeY + 0.3)
  const barLean = Math.atan2(barFoot, barRise)
  const barLong = Math.hypot(barFoot, barRise)

  for (const side of [ -1, 1 ]) {
    parts.push(part(cyl(0.13, 0.16, barLong, 5), {
      at:     [ side * barFoot / 2, (treeY + 0.3 + barTop) / 2, 0 ],
      rotate: [ 0, 0, -side * barLean ],
      color:  palette.wood,
      jitter: 0.1,
      rng,
    }))
    parts.push(part(cyl(0.13, 0.16, barLong, 5), {
      at:     [ 0, (treeY + 0.3 + barTop) / 2, side * barFoot / 2 ],
      rotate: [ side * barLean, 0, 0 ],
      color:  palette.wood,
      jitter: 0.1,
      rng,
    }))
  }

  parts.push(part(cyl(0.3, 0.4, postTop, 8), {
    at: [ 0, postTop / 2, 0 ], color: palette.tarWood, jitter: 0.09, rng,
  }))

  // ---- the buck --------------------------------------------------------------

  parts.push(part(box(HALF_WIDTH * 2 + 0.2, 0.26, HALF_LENGTH * 2 + 0.2), {
    at: [ 0, FLOOR_Y - 0.13, 0 ], color: palette.woodDark, jitter: 0.1, rng,
  }))

  for (const sz of [ -1, 1 ])
    claddingPlanks(
      parts,
      rng,
      sz > 0 ? palette.driftwoodDark : palette.wood,
      6,
      HALF_WIDTH * 2,
      WALL_Y,
      0.16,
      sz * HALF_LENGTH,
      FLOOR_Y,
    )

  for (const sx of [ -1, 1 ]) {
    parts.push(part(box(0.16, WALL_Y, HALF_LENGTH * 2), {
      at: [ sx * HALF_WIDTH, FLOOR_Y + WALL_Y / 2, 0 ], color: palette.driftwoodDark, jitter: 0.1, rng,
    }))

    // Corner posts, and a rubbing strake along each flank — the boards alone
    // read as a crate at this size, and a mill is a frame with boards on it.
    for (const sz of [ -1, 1 ])
      parts.push(part(box(0.2, WALL_Y, 0.2), {
        at: [ sx * HALF_WIDTH, FLOOR_Y + WALL_Y / 2, sz * HALF_LENGTH ], color: palette.tarWood, jitter: 0.09, rng,
      }))

    parts.push(part(box(0.22, 0.18, HALF_LENGTH * 2), {
      at: [ sx * HALF_WIDTH, FLOOR_Y + WALL_Y * 0.62, 0 ], color: palette.tarWood, jitter: 0.09, rng,
    }))
  }

  for (const sz of [ -1, 1 ])
    gableEnd(parts, rng, palette.driftwoodDark, {
      eaveY:     EAVE_Y,
      peakY:     PEAK_Y,
      halfDepth: HALF_WIDTH,
      thick:     0.2,
      at:        sz * HALF_LENGTH,
      ridge:     'z',
    })

  gabledRoof(parts, rng, palette.shingleWorn, palette.shingle, {
    eaveY:     EAVE_Y,
    peakY:     PEAK_Y,
    halfDepth: HALF_WIDTH,
    length:    HALF_LENGTH * 2 + 0.7,
    overhang:  0.45,
    ridge:     'z',
  })

  // The windshaft, out through the front gable. It carries the wheel, so where
  // it ends is not a matter of taste — see {@link MILL_HUB_HEIGHT}.
  parts.push(part(cyl(0.2, 0.24, 1.7, 8), {
    at:     [ 0, MILL_HUB_HEIGHT, MILL_HUB_REACH - 0.85 ],
    rotate: [ deg(90), 0, 0 ],
    color:  palette.tarWood,
    jitter: 0.09,
    rng,
  }))

  parts.push(part(box(0.9, 1.7, 0.14), {
    at: [ 0, FLOOR_Y + 0.85, -HALF_LENGTH - 0.08 ], color: palette.tarWood, jitter: 0.1, rng,
  }))

  // ---- the tail stair --------------------------------------------------------

  // Sunk below the base rather than resting on it: the mill is set into a hill
  // and the foot of the stair is the piece furthest from where that was
  // measured, so it buries itself instead of hanging in the air.
  const footZ   = -4.3
  const footY   = -0.3
  const headZ   = -HALF_LENGTH - 0.05
  const headY   = FLOOR_Y - 0.05
  const runLong = Math.hypot(headZ - footZ, headY - footY)
  const runLean = Math.atan2(headZ - footZ, headY - footY)

  for (const sx of [ -1, 1 ])
    parts.push(part(box(0.16, runLong, 0.24), {
      at:     [ sx * 0.52, (headY + footY) / 2, (headZ + footZ) / 2 ],
      rotate: [ -runLean, 0, 0 ],
      color:  palette.wood,
      jitter: 0.1,
      rng,
    }))

  const treads = 7

  for (let step = 1; step <= treads; step += 1) {
    const t = step / (treads + 1)

    parts.push(part(box(1.1, 0.09, 0.24), {
      at:     [ 0, footY + (headY - footY) * t, footZ + (headZ - footZ) * t ],
      color:  palette.plank,
      jitter: 0.11,
      rng,
    }))
  }

  // The tail post, which is what the stair is pushed against to bring the sails
  // round. Every post mill has one, and it is why the stair reaches the ground.
  parts.push(part(cyl(0.11, 0.14, 1.2, 5), {
    at:     [ 0, 0.3, footZ - 0.25 ],
    rotate: [ deg(rng.range(-6, 6)), 0, deg(rng.range(-6, 6)) ],
    color:  palette.deadWood,
    jitter: 0.12,
    rng,
  }))

  return mergeParts(parts, { grime: 2.4, grimeFloor: 0.52 })
}

/**
 * The sail wheel, in the plane it turns in.
 *
 * Built about the origin in `xy` and turning about `+z`, which is the one prop
 * in the scape that is *not* based at `y = 0` — it never stands on the ground,
 * it hangs off a shaft. That is also why it is absent from the `PROPS` roster:
 * the roster's contract is a thing that can be planted, and this cannot.
 *
 * Four common sails: two crossed stocks through the hub, sail bars out along
 * each arm, and canvas over the inner reaches where a miller would spread it
 * first. The cloth sits to one side of its stock, because a sail that is
 * symmetrical about its own beam catches no wind in either direction.
 */
export function buildMillSails (
  rng:     SeededRng,
  palette: NordicPalette,
  span:    number,
): BufferGeometry {
  const parts: BufferGeometry[] = []
  const radius                  = span / 2

  parts.push(part(cyl(0.34, 0.34, 0.5, 8), {
    at: [ 0, 0, 0 ], rotate: [ deg(90), 0, 0 ], color: palette.iron, jitter: 0.08, rng,
  }))

  for (const turn of [ 0, deg(90) ])
    parts.push(part(box(span, 0.2, 0.15), {
      at: [ 0, 0, 0 ], rotate: [ 0, 0, turn ], color: palette.tarWood, jitter: 0.09, rng,
    }))

  /** One piece placed in an arm's own frame: `along` the stock, `across` it. */
  function onArm (
    geometry: BufferGeometry,
    angle:    number,
    along:    number,
    across:   number,
    color:    string,
    jitter:   number,
  ): void {
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)

    parts.push(part(geometry, {
      at:     [ along * cos - across * sin, along * sin + across * cos, 0 ],
      rotate: [ 0, 0, angle ],
      color,
      jitter,
      rng,
    }))
  }

  const bars  = 7
  const inner = radius * 0.22
  const outer = radius * 0.96
  const step  = (outer - inner) / (bars - 1)

  for (let arm = 0; arm < 4; arm += 1) {
    const angle = arm * Math.PI / 2

    for (let index = 0; index < bars; index += 1)
      onArm(box(0.1, 1.1, 0.09), angle, inner + index * step, 0.32, palette.deadWood, 0.1)

    // Canvas over the inner two thirds. Spread board by board rather than as one
    // sheet, so the gaps between the bars still read as a lattice.
    for (let index = 0; index < 4; index += 1)
      onArm(
        box(step * 0.92, 0.9, 0.04),
        angle,
        inner + (index + 0.5) * step,
        0.34,
        index % 2 === 0 ? palette.canvas : palette.trimShadow,
        0.13,
      )
  }

  return mergeParts(parts)
}
