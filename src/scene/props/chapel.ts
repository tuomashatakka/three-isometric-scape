import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { box, cone, cyl, deg, mergeParts, part, spread } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'
import type { WindowPane } from './buildings.ts'
import { claddingPlanks, gableEnd, gabledRoof, roofRise, roofSlope, roofUnderside, window } from './timber.ts'
import type { RoofPlane } from './timber.ts'


/**
 * The chapel, and the markers in the ground around it.
 *
 * The one building in the scape that is not painted by the farm that uses it.
 * Everything at the steading is falu red and everything on the pasture is
 * whatever the weather left, because both are *worked* buildings — and a chapel
 * is the one thing a coast this poor puts limewash on. That is the whole reason
 * it reads from the far zoom: the only white in the landscape, standing on the
 * only ground nobody ploughed.
 *
 * Local frame like the rest of the kit — base at `y = 0`, long axis on `x` — but
 * with a convention of its own on top of it: **the tower is at `-x` and the
 * chancel at `+x`**. A chapel is not entered from its side, so the door is in the
 * tower's outer face rather than in a long wall, and the yaw that turns that door
 * toward the farm is `chapelYaw` in [`../landscape/chapel.ts`](../landscape/chapel.ts).
 *
 * That convention is also why this building assembles itself out of `part` in
 * more places than the farmstead does. The timber vocabulary centres a run of
 * cladding and a roof on the origin, which is exactly right for a building that
 * *is* one box — and the chapel is three, standing in a row along `x`.
 */

/**
 * Length of the nave along `x`, and half its depth across `z`.
 *
 * About a farmhouse, and that is the size the *island* settled rather than a
 * taste. The first cut was a twelve-metre church with a seven-metre footing and
 * an eleven-metre churchyard round it, and there is nowhere on the home island
 * to put that: the yard, the pasture, four plots and the mill have the level
 * ground, and everything left over is coast. A chapel a parish of one farm would
 * actually have built fits, with two squares of the search grid to spare.
 */
const NAVE_LENGTH = 5.8
const NAVE_DEPTH  = 2.1

/**
 * How thick the board skin is, on the nave, the chancel and the tower alike.
 *
 * One number rather than the five literals it was, because {@link CHAPEL_WINDOWS}
 * is read as saying where the wall's *face* is — see `window()` in `timber.ts` —
 * and the face is the wall's centre plus half its skin. A skin retuned here and a
 * pane table left alone is a window inside its own wall.
 */
const NAVE_SKIN = 0.16

/** Top of the granite socle — the floor every wall on the building stands on. */
const PLINTH = 0.4

/**
 * Where the nave's roof lands on its wall, in the prop's own frame.
 *
 * Exported because {@link CHAPEL_WINDOWS} has to stay under it and nothing else
 * would ever say so: a pane cut above the eave is a pane cut through the roof,
 * and from the default pose that reads as a window that is simply missing. The
 * test in `chapel.test.ts` states it as a fact about the list.
 */
export const CHAPEL_EAVE = PLINTH + 2.9

/** The nave's roof plane. See `timber.ts`: these are undersides, not tips. */
const NAVE_ROOF: RoofPlane = {
  eaveY:     CHAPEL_EAVE,
  peakY:     CHAPEL_EAVE + 1.8,
  halfDepth: NAVE_DEPTH,
}

/** Where the tower's middle sits on `x`, and half its width. */
const TOWER_X    = -(NAVE_LENGTH / 2 + 0.45)
const TOWER_HALF = 1

/** Top of the tower's boarded shaft, and of the open belfry stage above it. */
const TOWER_EAVE = 5.6
const BELFRY_TOP = TOWER_EAVE + 0.95

/** How far the spire carries above the belfry, and the iron cross above that. */
const SPIRE_RISE = 2.9
const CROSS_RISE = 0.6

/** The chancel at the east end: its middle on `x`, and its length. */
const CHANCEL_X   = NAVE_LENGTH / 2 + 0.95
const CHANCEL_LEN = 1.9

/** The chancel's own roof, lower than the nave's so the two step rather than meet. */
const CHANCEL_ROOF: RoofPlane = {
  eaveY:     PLINTH + 2,
  peakY:     PLINTH + 2 + 1.15,
  halfDepth: 1.35,
}

/** How far the chancel roof reaches along `x`. Long enough to die into the nave. */
const CHANCEL_COVER = CHANCEL_LEN + 0.6

/**
 * Every pane of glass in the chapel, in the prop's own frame.
 *
 * The same contract as `FARMHOUSE_WINDOWS`: this list is the survey *and* the
 * source, so the lamplight in `scene/windows.ts` finds a window the moment one
 * is cut here, and never finds one that was never cut.
 *
 * Three to each long wall and one in the east gable. The nave's start at
 * `x = -0.9` rather than at its west end because the tower is in the way of
 * anything further along — a pane there would be glazing the inside of the
 * tower's own wall.
 */
export const CHAPEL_WINDOWS: readonly WindowPane[] = [
  ...([ 1, -1 ] as const).flatMap(side =>
    [ -0.9, 0.5, 1.9 ].map((x): WindowPane =>
      ({ x, y: PLINTH + 1.8, z: side * (NAVE_DEPTH + NAVE_SKIN / 2), width: 0.62, height: 1.3, facing: side }))),

  // The east light, over the altar. In a gable rather than a long wall, so it is
  // the one pane the fixed dimetric heading can never hide behind a roof.
  {
    x:      CHANCEL_X + CHANCEL_LEN / 2 + 0.07,
    y:      PLINTH + 1.3,
    z:      0,
    width:  0.55,
    height: 0.95,
    facing: 1,
    axis:   'x',
  },
]

/**
 * How lived-in a chapel is after dark, 0..1.
 *
 * Lower than the sauna's, and deliberately: this is a building nobody sleeps in.
 * It is dark most nights of the year and lit on the ones there is a service, and
 * a weight rather than a schedule is how the rest of the scape says that — see
 * the `DWELLING` table in `landscape/windows.ts`, which this belongs to.
 */
export const CHAPEL_DWELLING = 0.42

/**
 * Board cladding on a wall that is not centred on the origin.
 *
 * `claddingPlanks` spreads its run about `x = 0`, which is right for every
 * building in the kit that is one box. The chapel is three, so its tower and
 * chancel walls need the same run shifted along the ridge — and shifting it here
 * keeps `timber.ts` describing the common case rather than growing a tenth
 * positional argument for the one prop that is shaped differently.
 */
function boards (
  parts:  BufferGeometry[],
  rng:    SeededRng,
  color:  string,
  at:     number,
  count:  number,
  span:   number,
  height: number,
  z:      number,
  baseY:  number,
): void {
  const width = span / count * 0.92

  for (const x of spread(count, span - width))
    parts.push(part(box(width, height, NAVE_SKIN), {
      at: [ at + x, baseY + height / 2, z ], color, jitter: 0.09, rng,
    }))
}

/**
 * A pitched roof over a box that is not centred on the origin.
 *
 * The offset twin of `gabledRoof`, and it borrows that module's plane maths
 * rather than restating it — `roofSlope`, `roofUnderside` and `roofRise` are
 * exported for exactly this. Two descriptions of one plane is one too many, and
 * the scape has the gables poking through their own shingles to prove it.
 */
function pitchedRoof (
  parts:  BufferGeometry[],
  rng:    SeededRng,
  palette: NordicPalette,
  plane:  RoofPlane,
  at:     number,
  length: number,
): void {
  const thickness = 0.22
  const overhang  = 0.34
  const slope     = roofSlope(plane)
  const lift      = roofRise(plane, thickness) / 2
  const run       = plane.halfDepth + overhang
  const span      = run / Math.cos(slope) * 1.02
  const mid       = run / 2

  for (const side of [ -1, 1 ])
    parts.push(part(box(length, thickness, span), {
      at:     [ at, roofUnderside(plane, mid) + lift, side * mid ],
      rotate: [ side * slope, 0, 0 ],
      color:  palette.shingle,
      jitter: 0.08,
      rng,
    }))

  parts.push(part(box(length, thickness * 0.9, 0.4), {
    at: [ at, plane.peakY + lift * 2, 0 ], color: palette.shingleWorn, jitter: 0.05, rng,
  }))
}

/** The socle: a course of granite proud of every wall it carries. */
function socle (parts: BufferGeometry[], rng: SeededRng, palette: NordicPalette): void {
  parts.push(part(box(NAVE_LENGTH + 0.36, PLINTH, NAVE_DEPTH * 2 + 0.36), {
    at: [ 0, PLINTH / 2, 0 ], color: palette.granite, jitter: 0.13, rng,
  }))
  parts.push(part(box(CHANCEL_LEN + 0.3, PLINTH, CHANCEL_ROOF.halfDepth * 2 + 0.3), {
    at: [ CHANCEL_X, PLINTH / 2, 0 ], color: palette.graniteDark, jitter: 0.13, rng,
  }))
  parts.push(part(box(TOWER_HALF * 2 + 0.34, PLINTH, TOWER_HALF * 2 + 0.34), {
    at: [ TOWER_X, PLINTH / 2, 0 ], color: palette.granite, jitter: 0.13, rng,
  }))
}

/** The nave: two boarded walls, two gables, the roof, and all the glass. */
function nave (parts: BufferGeometry[], rng: SeededRng, palette: NordicPalette): void {
  const wall = NAVE_ROOF.eaveY - PLINTH

  for (const side of [ -1, 1 ]) {
    claddingPlanks(parts, rng, palette.trimWhite, 12, NAVE_LENGTH, wall, NAVE_SKIN, side * NAVE_DEPTH, PLINTH)

    // The corner boards, tarred. On a white wall they are the only thing that
    // says where the building ends at the zoom the whole island fits into.
    parts.push(part(box(0.2, wall, NAVE_DEPTH * 2 + 0.1), {
      at: [ side * NAVE_LENGTH / 2, PLINTH + wall / 2, 0 ], color: palette.tarWood, jitter: 0.08, rng,
    }))
    gableEnd(parts, rng, palette.trimWhite, { ...NAVE_ROOF, thick: 0.2, at: side * NAVE_LENGTH / 2 })
  }

  gabledRoof(parts, rng, palette.shingle, palette.shingleWorn, {
    ...NAVE_ROOF, length: NAVE_LENGTH + 0.7, overhang: 0.45,
  })

  for (const pane of CHAPEL_WINDOWS)
    window(
      parts, rng, palette.trimShadow, palette.glass,
      [ pane.x, pane.y, pane.z ], pane.width, pane.height, pane.facing, pane.axis ?? 'z',
    )
}

/** The chancel: the same construction a third of the size, stepped down. */
function chancel (parts: BufferGeometry[], rng: SeededRng, palette: NordicPalette): void {
  const wall  = CHANCEL_ROOF.eaveY - PLINTH
  const depth = CHANCEL_ROOF.halfDepth

  for (const side of [ -1, 1 ])
    boards(parts, rng, palette.trimWhite, CHANCEL_X, 4, CHANCEL_LEN, wall, side * depth, PLINTH)

  parts.push(part(box(0.18, wall, depth * 2), {
    at:     [ CHANCEL_X + CHANCEL_LEN / 2, PLINTH + wall / 2, 0 ],
    color:  palette.trimWhite,
    jitter: 0.08,
    rng,
  }))
  gableEnd(parts, rng, palette.trimWhite, {
    ...CHANCEL_ROOF, thick: 0.18, at: CHANCEL_X + CHANCEL_LEN / 2,
  })

  // The cover runs back past the chancel's own west end and dies into the nave
  // wall, so the two roofs meet in a valley rather than leaving a slot of
  // daylight between them.
  pitchedRoof(parts, rng, palette, CHANCEL_ROOF, CHANCEL_X - 0.3, CHANCEL_COVER)
}

/**
 * The tower: a boarded shaft, an open belfry with a bell in it, and a spire.
 *
 * The belfry is genuinely open — four posts and a pair of louvre boards a side,
 * with the bell hanging in the gap. Boarding it in would have cost four parts
 * fewer and lost the only place in the scape you can see daylight *through* a
 * building, which at the near zoom is the detail that says bell tower rather
 * than grain silo with a point on it.
 */
function tower (parts: BufferGeometry[], rng: SeededRng, palette: NordicPalette): void {
  const shaft = TOWER_EAVE - PLINTH

  for (const side of [ -1, 1 ]) {
    boards(parts, rng, palette.trimWhite, TOWER_X, 4, TOWER_HALF * 2, shaft, side * TOWER_HALF, PLINTH)
    parts.push(part(box(0.16, shaft, TOWER_HALF * 2 + 0.06), {
      at:     [ TOWER_X + side * TOWER_HALF, PLINTH + shaft / 2, 0 ],
      color:  palette.tarWood,
      jitter: 0.08,
      rng,
    }))
  }

  // The door, in the tower's west face — the one wall of the building a path is
  // ever worn to, and what `CHAPEL_DOOR_REACH` is measured from.
  parts.push(part(box(0.12, 1.9, 1), {
    at: [ TOWER_X - TOWER_HALF - 0.06, PLINTH + 0.95, 0 ], color: palette.tarWood, jitter: 0.07, rng,
  }))
  parts.push(part(box(0.1, 0.15, 1.32), {
    at: [ TOWER_X - TOWER_HALF - 0.12, PLINTH + 1.98, 0 ], color: palette.trimShadow, jitter: 0.05, rng,
  }))
  parts.push(part(box(0.8, 0.16, 1.05), {
    at: [ TOWER_X - TOWER_HALF - 0.36, PLINTH * 0.4, 0 ], color: palette.granite, jitter: 0.12, rng,
  }))

  const stage = BELFRY_TOP - TOWER_EAVE

  for (const sx of [ -1, 1 ])
    for (const sz of [ -1, 1 ])
      parts.push(part(box(0.18, stage, 0.18), {
        at:     [ TOWER_X + sx * (TOWER_HALF - 0.09), TOWER_EAVE + stage / 2, sz * (TOWER_HALF - 0.09) ],
        color:  palette.tarWood,
        jitter: 0.07,
        rng,
      }))

  for (const y of spread(2, stage * 0.5))
    for (const side of [ -1, 1 ])
      parts.push(part(box(TOWER_HALF * 1.8, 0.12, 0.08), {
        at:     [ TOWER_X, TOWER_EAVE + stage / 2 + y, side * TOWER_HALF ],
        rotate: [ deg(18), 0, 0 ],
        color:  palette.trimShadow,
        jitter: 0.06,
        rng,
      }))

  parts.push(part(cyl(0.14, 0.26, 0.38, 8), {
    at: [ TOWER_X, TOWER_EAVE + stage * 0.46, 0 ], color: palette.iron, jitter: 0.1, rng,
  }))

  // The spire. Eight sides rather than four: a four-sided cone at this height
  // shows one flat face to the fixed camera heading and reads as a wedge.
  parts.push(part(box(TOWER_HALF * 2 + 0.34, 0.16, TOWER_HALF * 2 + 0.34), {
    at: [ TOWER_X, BELFRY_TOP + 0.08, 0 ], color: palette.shingleWorn, jitter: 0.07, rng,
  }))
  parts.push(part(cone(TOWER_HALF * 1.28, SPIRE_RISE, 8), {
    at: [ TOWER_X, BELFRY_TOP + 0.16 + SPIRE_RISE / 2, 0 ], color: palette.shingle, jitter: 0.09, rng,
  }))

  const cross = BELFRY_TOP + 0.16 + SPIRE_RISE

  parts.push(part(box(0.07, CROSS_RISE, 0.07), {
    at: [ TOWER_X, cross + CROSS_RISE / 2, 0 ], color: palette.iron, jitter: 0.05, rng,
  }))
  parts.push(part(box(0.07, 0.07, 0.34), {
    at: [ TOWER_X, cross + CROSS_RISE * 0.68, 0 ], color: palette.iron, jitter: 0.05, rng,
  }))
}

/**
 * The chapel (kappeli) — a boarded nave, a stepped chancel and a bell tower.
 *
 * The tallest thing on the island after the light, and the only limewashed one.
 */
export function buildChapel (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  socle(parts, rng, palette)
  nave(parts, rng, palette)
  chancel(parts, rng, palette)
  tower(parts, rng, palette)

  // Barely any grime, and that is the point of the building. Everything else in
  // the kit is darkened toward its base because everything else is worked; a
  // limewashed wall is the one surface on this coast somebody repaints.
  return mergeParts(parts, { grime: 1.2, grimeFloor: 0.72 })
}

/** The tallest a marker gets, in metres. A churchyard is not a monument yard. */
const MARKER_TALL = 0.92

/**
 * A grave marker — a leaning slab of granite, or a wrought iron cross.
 *
 * One builder rather than two props, and the seed picks which: a churchyard with
 * only stones in it reads as a rockery, and one with only crosses reads as a
 * decal repeated fourteen times. The lean is the other half of that — a marker
 * standing plumb is a marker set this year, and this ground has been in use for
 * two centuries.
 *
 * Under six parts, because there are a dozen of these in a churchyard and they
 * merge into the steading draw alongside everything else.
 */
export function buildGraveMarker (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const height                  = rng.range(0.52, MARKER_TALL)
  const lean                    = deg(rng.range(-9, 9))
  const tilt                    = deg(rng.range(-6, 6))

  if (rng.next() > 0.42) {
    const width = rng.range(0.34, 0.48)

    parts.push(part(box(width, height, 0.13), {
      at:     [ 0, height / 2, 0 ],
      rotate: [ tilt, 0, lean ],
      color:  rng.pick([ palette.granite, palette.graniteDark, palette.graniteWarm ]),
      jitter: 0.14,
      rng,
    }))

    // The rounded head, which is what makes a slab read as a headstone rather
    // than as a fence post that lost its fence. Carried out along the lean, so
    // it stays on top of the stone it caps.
    parts.push(part(cyl(width / 2, width / 2, 0.13, 9), {
      at:     [ -Math.sin(lean) * height, Math.cos(lean) * height, 0 ],
      rotate: [ deg(90) + tilt, 0, 0 ],
      color:  palette.graniteWarm,
      jitter: 0.14,
      rng,
    }))
  }
  else {
    const arm = rng.range(0.24, 0.34)

    parts.push(part(cyl(0.035, 0.045, height, 5), {
      at:     [ 0, height / 2, 0 ],
      rotate: [ tilt, 0, lean ],
      color:  palette.iron,
      jitter: 0.11,
      rng,
    }))
    parts.push(part(box(arm, 0.05, 0.05), {
      at:     [ -Math.sin(lean) * height * 0.72, Math.cos(lean) * height * 0.72, 0 ],
      rotate: [ tilt, 0, lean ],
      color:  palette.iron,
      jitter: 0.11,
      rng,
    }))
    parts.push(part(cyl(0.14, 0.17, 0.16, 6), {
      at: [ 0, 0.08, 0 ], color: palette.granite, jitter: 0.14, rng,
    }))
  }

  // A cushion of moss at the foot. Two hundred years of it is what separates a
  // churchyard from a field with stones in it.
  parts.push(part(cyl(rng.range(0.2, 0.3), rng.range(0.24, 0.34), 0.09, 7), {
    at: [ rng.range(-0.06, 0.06), 0.03, rng.range(-0.06, 0.06) ], color: palette.moss, jitter: 0.18, rng,
  }))

  return mergeParts(parts, { grime: 0.8, grimeFloor: 0.4 })
}
