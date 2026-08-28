import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { box, cone, cyl, deg, mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'
import { glaze } from './buildings.ts'
import type { WindowPane } from './buildings.ts'
import { claddingPlanks, gableEnd, gabledRoof } from './timber.ts'


/**
 * The chapel — the one building on the coast that is not the farm's.
 *
 * Same construction as everything else in the kit and deliberately none of its
 * colours: the steading is falu red because that is what a farm paints the
 * buildings it walks past every day, and a chapel is limewashed board. That is
 * the whole reason it reads as a different kind of place from two hundred metres
 * out, before the tower is even resolvable.
 *
 * Long axis on `x` and its door on `+z`, like every other building here, so the
 * survey faces it and wears a path to it with the same two functions the
 * farmstead uses — see `landscape/chapel.ts`.
 *
 * ## The tower is the point
 *
 * A nave on its own is a small barn with white walls. What makes a chapel
 * legible at the zoom this scape is usually read at is the *silhouette*: one
 * vertical, standing well clear of every ridge line on the island, with a spire
 * on it. So the west tower is not decoration and it is not scaled to the nave —
 * it is sized against the skyline the island already has. The spire tops out at
 * about 9.6 m against a 6.3 m farmhouse and a 5.4 m mill hub, which is what puts
 * it above the tree line rather than in it.
 */

/** Length of the nave along `x`, and half its depth across `z`. */
const NAVE_LENGTH = 5.6
const NAVE_HALF   = 2

/** Top of the foundation — the floor everything on the wall stands on. */
const PLINTH_Y = 0.42

/** The nave's roof plane: eave at the wall head, ridge above it. */
const NAVE_EAVE = 3
const NAVE_PEAK = 5.25

/**
 * Where the tower stands, and how wide it is.
 *
 * Set so the shaft swallows the nave's west end rather than abutting it: the
 * wall stops at `-NAVE_LENGTH / 2` and the roof overhangs past that, and both
 * finish inside `TOWER_X ± TOWER_HALF`. A tower that merely touched the gable
 * would leave a seam of daylight between two walls at every camera heading but
 * one.
 */
const TOWER_X    = -(NAVE_LENGTH / 2 + 0.45)
const TOWER_HALF = 1.15

/** Head of the shaft, where the belfry stage opens. */
const TOWER_HEAD = 5.2

/** The open stage the bell hangs in, and the plate that caps it. */
const BELFRY_RISE = 1.15
const PLATE       = 0.16

/** Base of the spire, its height, and the height of the cross standing on it. */
const SPIRE_BASE = TOWER_HEAD + BELFRY_RISE + PLATE
const SPIRE_RISE = 2.5
const CROSS_RISE = 0.74

/**
 * The very top of the chapel, in its own frame.
 *
 * Exported because the claim the tower exists to make — *this is the tallest
 * thing the island has built* — is a number rather than a picture, and
 * `chapel.test.ts` states it against this rather than against a literal that
 * would go stale the first time the spire moved.
 */
export const CHAPEL_HEIGHT = SPIRE_BASE + SPIRE_RISE + CROSS_RISE

/**
 * The chapel's glass, published the way the farmstead's is.
 *
 * Lancets: tall and narrow, which is most of what separates a chapel window
 * from a kitchen one at any distance. Two in each long wall, one high in the
 * altar gable, and one in the tower's own face — six panes, and every one of
 * them is a place `scene/windows.ts` can put a lamp on the night of a service.
 *
 * The gable pane is on the altar end and the door is at the other, because a
 * chapel is entered under its tower and lit from behind the altar.
 */
export const CHAPEL_WINDOWS: readonly WindowPane[] = [
  ...[ 0.9, 2.2 ].map((x): WindowPane =>
    ({ x, y: 2.1, z: NAVE_HALF + 0.06, width: 0.46, height: 1.3, facing: 1 })),
  ...[ -0.9, 1.4 ].map((x): WindowPane =>
    ({ x, y: 2.1, z: -NAVE_HALF - 0.06, width: 0.46, height: 1.3, facing: -1 })),

  // The altar gable. Its wall face is at `length / 2 + 0.11`, the same offset
  // the farmhouse's gable panes are written against.
  { x: NAVE_LENGTH / 2 + 0.11, y: 2.5, z: 0, width: 0.5, height: 1.35, facing: 1, axis: 'x' },

  // The tower's stair light, above the door head and below the belfry floor.
  { x: TOWER_X, y: 3.4, z: TOWER_HALF + 0.06, width: 0.4, height: 0.75, facing: 1 },
]

/** The shaft: four boarded walls and the corner posts that stop them fraying. */
function tower (parts: BufferGeometry[], rng: SeededRng, palette: NordicPalette): void {
  const width = TOWER_HALF * 2

  for (const side of [ -1, 1 ]) {
    parts.push(part(box(width, TOWER_HEAD, 0.18), {
      at:     [ TOWER_X, TOWER_HEAD / 2, side * TOWER_HALF ],
      color:  side > 0 ? palette.trimWhite : palette.trimShadow,
      jitter: 0.08,
      rng,
    }))
    parts.push(part(box(0.18, TOWER_HEAD, width), {
      at:     [ TOWER_X + side * TOWER_HALF, TOWER_HEAD / 2, 0 ],
      color:  palette.trimShadow,
      jitter: 0.08,
      rng,
    }))
  }

  for (const sx of [ -1, 1 ])
    for (const sz of [ -1, 1 ])
      parts.push(part(box(0.24, TOWER_HEAD, 0.24), {
        at:     [ TOWER_X + sx * TOWER_HALF, TOWER_HEAD / 2, sz * TOWER_HALF ],
        color:  palette.tarWood,
        jitter: 0.04,
        rng,
      }))
}

/**
 * The belfry, its plate, the spire and the cross.
 *
 * The stage is open on all four sides — that is what a belfry is, and it is also
 * what makes the tower read as a tower rather than as a chimney: light passes
 * through it, so the silhouette has a gap in it where the bell hangs.
 *
 * The spire is a four-sided cone turned an eighth of a turn, which puts its
 * faces over the tower's faces instead of its corners. `cone`'s radius is to the
 * corner, so the flats land at `radius * cos(45°)` — a hair inside the plate,
 * which is where a spire foot belongs.
 */
function belfry (parts: BufferGeometry[], rng: SeededRng, palette: NordicPalette): void {
  const post = TOWER_HALF - 0.12

  for (const sx of [ -1, 1 ])
    for (const sz of [ -1, 1 ])
      parts.push(part(box(0.2, BELFRY_RISE, 0.2), {
        at:     [ TOWER_X + sx * post, TOWER_HEAD + BELFRY_RISE / 2, sz * post ],
        color:  palette.tarWood,
        jitter: 0.06,
        rng,
      }))

  // The headstock, and the bell hanging under it. A bell nobody can see is a
  // bell nobody rings, so it is hung low in the stage rather than up in the cap.
  parts.push(part(box(0.14, 0.14, TOWER_HALF * 1.8), {
    at: [ TOWER_X, TOWER_HEAD + BELFRY_RISE - 0.26, 0 ], color: palette.wood, jitter: 0.07, rng,
  }))
  parts.push(part(cyl(0.13, 0.3, 0.42, 8), {
    at: [ TOWER_X, TOWER_HEAD + BELFRY_RISE - 0.54, 0 ], color: palette.ironRust, jitter: 0.09, rng,
  }))

  parts.push(part(box(TOWER_HALF * 2.3, PLATE, TOWER_HALF * 2.3), {
    at:     [ TOWER_X, TOWER_HEAD + BELFRY_RISE + PLATE / 2, 0 ],
    color:  palette.shingleWorn,
    jitter: 0.06,
    rng,
  }))

  parts.push(part(cone(TOWER_HALF * 1.32, SPIRE_RISE, 4), {
    at:     [ TOWER_X, SPIRE_BASE + SPIRE_RISE / 2, 0 ],
    rotate: [ 0, deg(45), 0 ],
    color:  palette.shingle,
    jitter: 0.07,
    rng,
  }))

  const crossY = SPIRE_BASE + SPIRE_RISE

  parts.push(part(box(0.08, CROSS_RISE, 0.08), {
    at: [ TOWER_X, crossY + CROSS_RISE / 2, 0 ], color: palette.iron, jitter: 0.05, rng,
  }))
  parts.push(part(box(0.38, 0.08, 0.08), {
    at: [ TOWER_X, crossY + CROSS_RISE * 0.66, 0 ], color: palette.iron, jitter: 0.05, rng,
  }))
}

/**
 * The chapel (kappeli) — a limewashed board nave with a west tower and a bell.
 *
 * One merged, vertex-coloured geometry with its base at `y = 0`, its long axis
 * on `x` and its door on `+z`, like every other building in the kit.
 */
export function buildChapel (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const roof                    = { eaveY: NAVE_EAVE, peakY: NAVE_PEAK, halfDepth: NAVE_HALF }

  parts.push(part(box(NAVE_LENGTH + 0.5, PLINTH_Y, NAVE_HALF * 2 + 0.5), {
    at: [ 0, PLINTH_Y / 2, 0 ], color: palette.granite, jitter: 0.12, rng,
  }))
  parts.push(part(box(TOWER_HALF * 2.5, PLINTH_Y, TOWER_HALF * 2.5), {
    at: [ TOWER_X, PLINTH_Y / 2, 0 ], color: palette.granite, jitter: 0.12, rng,
  }))

  claddingPlanks(parts, rng, palette.trimWhite, 9, NAVE_LENGTH, NAVE_EAVE, 0.18, NAVE_HALF)
  claddingPlanks(parts, rng, palette.trimShadow, 9, NAVE_LENGTH, NAVE_EAVE, 0.18, -NAVE_HALF)

  // Only the altar end is gabled. The other one finishes inside the tower, and a
  // gable built there would be a triangle of wall inside a shaft of masonry.
  parts.push(part(box(0.2, NAVE_EAVE, NAVE_HALF * 2), {
    at: [ NAVE_LENGTH / 2, NAVE_EAVE / 2, 0 ], color: palette.trimShadow, jitter: 0.08, rng,
  }))
  gableEnd(parts, rng, palette.trimShadow, { ...roof, thick: 0.2, at: NAVE_LENGTH / 2 })

  gabledRoof(parts, rng, palette.shingle, palette.shingleWorn, {
    ...roof, length: NAVE_LENGTH + 0.7, overhang: 0.4,
  })

  for (const sz of [ -1, 1 ])
    parts.push(part(box(0.26, NAVE_EAVE, 0.26), {
      at:     [ NAVE_LENGTH / 2, NAVE_EAVE / 2, sz * NAVE_HALF ],
      color:  palette.tarWood,
      jitter: 0.04,
      rng,
    }))

  tower(parts, rng, palette)
  belfry(parts, rng, palette)

  // The door, in the tower's own face and raised onto the plinth like every
  // other opening in the kit — a door drawn from `y = 0` has its bottom quarter
  // inside the socle.
  const doorY = 2.1

  parts.push(part(box(1.05, doorY, 0.16), {
    at:     [ TOWER_X, PLINTH_Y + doorY / 2, TOWER_HALF + 0.08 ],
    color:  palette.tarWood,
    jitter: 0.07,
    rng,
  }))
  parts.push(part(box(1.35, 0.16, 0.5), {
    at:     [ TOWER_X, PLINTH_Y + doorY + 0.08, TOWER_HALF + 0.24 ],
    color:  palette.trimShadow,
    jitter: 0.05,
    rng,
  }))

  // Two granite treads down to the ground, each set back from the one above so
  // the flight reads as steps rather than as a ramp.
  for (const step of [ 0, 1 ])
    parts.push(part(box(1.5 - step * 0.18, PLINTH_Y / 2, 0.42), {
      at:     [ TOWER_X, PLINTH_Y / 4 + step * PLINTH_Y / 2, TOWER_HALF + 0.36 + (1 - step) * 0.26 ],
      color:  palette.granite,
      jitter: 0.1,
      rng,
    }))

  glaze(parts, rng, palette.trimWhite, palette.glass, CHAPEL_WINDOWS)

  // Barely grimed, and that is the whole colour decision. `mergeParts` darkens
  // toward the base over its reach, and the farm's 2.8 m at 0.58 puts most of a
  // three-metre wall in shadow — which on a falu-red barn reads as weathering
  // and on a limewashed chapel reads as a brown building. The one thing this
  // prop exists to be is *pale*, so the grime stops at the plinth course.
  return mergeParts(parts, { grime: 0.9, grimeFloor: 0.78 })
}
