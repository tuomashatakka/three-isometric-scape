import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { box, cyl, deg, mergeParts, part } from 'threejs-scene/modules/assets'
import { GLAZING, glazeWindows } from './glazing.ts'
import type { NordicPalette } from './palette.ts'
import { claddingPlanks, dormer, gableEnd, gabledRoof, monoRoof } from './timber.ts'


/**
 * The farmstead buildings.
 *
 * Each returns one merged, vertex-coloured geometry with its base at `y = 0`
 * and its long axis on `x`. They are the highest-part-count props in the scape
 * — which is affordable precisely because there is exactly one of each, and
 * because `dressing.ts` merges the whole steading into a single draw.
 *
 * The cladding, gable and roof helpers they are assembled from live in
 * [`timber.ts`](timber.ts), because the meadow barn up on the pasture is the
 * same construction in weathered grey.
 *
 * ## Two heights every building here is written against
 *
 * `plinthY` — the top of the foundation, and the floor everything on the wall
 * stands on. A door drawn from `y = 0` is not a taller door; it is a door with
 * its bottom quarter inside the socle, because the socle is proud of the wall.
 *
 * The roof plane — see {@link roofUnderside}. The eave is where the roof meets
 * the *wall*, and the overhang is measured out from there.
 */

/** The barn (lato) — falu-red board walls, sliding door, hay in the opening. */
export function buildBarn (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const length                  = 8
  const halfDepth               = 2.7
  const plinthY                 = 0.5
  const wallY                   = 3.6
  const peakY                   = 5.6
  const roof                    = { eaveY: wallY, peakY, halfDepth }

  parts.push(part(box(length + 0.5, plinthY, halfDepth * 2 + 0.5), {
    at: [ 0, plinthY / 2, 0 ], color: palette.granite, jitter: 0.11, rng,
  }))

  claddingPlanks(parts, rng, palette.faluRed, 10, length, wallY, 0.18, -halfDepth)
  claddingPlanks(parts, rng, palette.faluWorn, 10, length, wallY, 0.18, halfDepth)

  for (const side of [ -1, 1 ]) {
    parts.push(part(box(0.2, wallY, halfDepth * 2), {
      at: [ side * length / 2, wallY / 2, 0 ], color: palette.faluDark, jitter: 0.08, rng,
    }))
    gableEnd(parts, rng, palette.faluDark, { ...roof, thick: 0.2, at: side * length / 2 })
  }

  gabledRoof(parts, rng, palette.shingle, palette.shingleWorn, {
    ...roof, length: length + 0.7, overhang: 0.35,
  })

  // Corner boards stop at the wall head. Running them past it, as they used to,
  // puts white posts through the eaves from every angle but the default one.
  for (const sx of [ -1, 1 ])
    for (const sz of [ -1, 1 ])
      parts.push(part(box(0.32, wallY, 0.32), {
        at: [ sx * length / 2, wallY / 2, sz * halfDepth ], color: palette.trimWhite, jitter: 0.03, rng,
      }))

  // Everything on the front wall is raised onto the plinth, and set back to the
  // cladding plane so it reads as fitted into the wall rather than stuck on it.
  const doorY = 2.9

  parts.push(part(box(2.5, doorY, 0.14), {
    at: [ 1.3, plinthY + doorY / 2, halfDepth + 0.07 ], color: palette.tarWood, jitter: 0.1, rng,
  }))
  parts.push(part(box(2.4, 1.3, 0.6), {
    at: [ 1.3, plinthY + 0.65, halfDepth - 0.2 ], color: palette.hay, jitter: 0.16, rng,
  }))
  parts.push(part(box(2.6, doorY, 0.16), {
    at: [ -1.5, plinthY + doorY / 2, halfDepth + 0.08 ], color: palette.faluDark, jitter: 0.07, rng,
  }))
  parts.push(part(box(6.6, 0.18, 0.2), {
    at: [ 0, plinthY + doorY + 0.11, halfDepth + 0.1 ], color: palette.iron, jitter: 0.05, rng,
  }))

  // The threshold ramp: from the plinth top down to the ground, clear of the
  // socle it steps off. A ramp that starts inside the foundation is a wedge.
  const rampRun  = 1.8
  const rampFall = plinthY - 0.05

  parts.push(part(box(2.8, 0.3, rampRun / Math.cos(Math.atan2(rampFall, rampRun))), {
    at:     [ 1.3, (plinthY + 0.05) / 2 + 0.15, halfDepth + 0.25 + rampRun / 2 ],
    rotate: [ Math.atan2(rampFall, rampRun), 0, 0 ],
    color:  palette.plank,
    jitter: 0.1,
    rng,
  }))

  glazeWindows(parts, rng, palette.trimWhite, palette.glass, GLAZING.barn)

  return mergeParts(parts, { grime: 2.4, grimeFloor: 0.55 })
}

/** The main house (päärakennus) — red walls, white surrounds, brick chimney. */
export function buildFarmhouse (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const length                  = 9
  const halfDepth               = 3
  const plinthY                 = 0.6
  const wallY                   = 3.9
  const peakY                   = 6.3
  const roof                    = { eaveY: wallY, peakY, halfDepth }

  parts.push(part(box(length + 0.6, plinthY, halfDepth * 2 + 0.6), {
    at: [ 0, plinthY / 2, 0 ], color: palette.granite, jitter: 0.12, rng,
  }))

  claddingPlanks(parts, rng, palette.faluRed, 11, length, wallY, 0.2, -halfDepth)
  claddingPlanks(parts, rng, palette.faluRed, 11, length, wallY, 0.2, halfDepth)

  for (const side of [ -1, 1 ]) {
    parts.push(part(box(0.22, wallY, halfDepth * 2), {
      at: [ side * length / 2, wallY / 2, 0 ], color: palette.faluDark, jitter: 0.08, rng,
    }))
    gableEnd(parts, rng, palette.faluDark, { ...roof, thick: 0.22, at: side * length / 2 })
  }

  gabledRoof(parts, rng, palette.shingle, palette.shingleWorn, {
    ...roof, length: length + 0.9, overhang: 0.45,
  })

  for (const sx of [ -1, 1 ])
    for (const sz of [ -1, 1 ])
      parts.push(part(box(0.34, wallY, 0.34), {
        at: [ sx * length / 2, wallY / 2, sz * halfDepth ], color: palette.trimWhite, jitter: 0.03, rng,
      }))

  // Front windows stand clear of the porch canopy on either side. The inner
  // pair used to sit at x = ±1, which the 2.6 m canopy cut straight through.
  // Where each pane goes is `glazing.ts`, because the lamps behind them are
  // placed from the same table.
  glazeWindows(parts, rng, palette.trimWhite, palette.glass, GLAZING.farmhouse)

  // The attic window, as an actual dormer. Flat on the pitch it read as a
  // picture of a window rather than an opening — there was no depth anywhere.
  dormer(parts, rng, palette.faluDark, palette.shingleWorn, palette.shingle, palette.trimWhite, palette.glass, {
    roof,
    at:     1.5,
    width:  1.5,
    depth:  1.2,
    height: 0.75,
    rise:   0.5,
  })

  const doorY   = 2
  const canopyY = 2.9

  parts.push(part(box(1.1, doorY, 0.16), {
    at: [ 0, plinthY + doorY / 2, halfDepth + 0.08 ], color: palette.tarWood, jitter: 0.07, rng,
  }))
  parts.push(part(box(2.6, 0.22, 1.5), {
    at: [ 0, canopyY, halfDepth + 0.7 ], color: palette.shingleWorn, jitter: 0.07, rng,
  }))

  for (const sx of [ -1, 1 ])
    parts.push(part(box(0.18, canopyY - 0.05, 0.18), {
      at: [ sx * 1.1, (canopyY - 0.05) / 2, halfDepth + 1.3 ], color: palette.trimWhite, jitter: 0.04, rng,
    }))

  // Three risers, because the plinth is 0.6 m and two 0.24 m steps left a lip
  // you would trip over — visible as a granite shelf under the door.
  const risers = 3

  for (let step = 0; step < risers; step += 1)
    parts.push(part(box(1.9 - step * 0.2, plinthY / risers, 0.45), {
      at:     [ 0, plinthY / risers * (step + 0.5), halfDepth + 0.45 + (risers - 1 - step) * 0.27 ],
      color:  palette.granite,
      jitter: 0.1,
      rng,
    }))

  parts.push(part(box(0.9, 2.2, 0.9), {
    at: [ -2.6, peakY - 0.4, 0 ], color: palette.ironRust, jitter: 0.13, rng,
  }))
  parts.push(part(box(1.1, 0.24, 1.1), {
    at: [ -2.6, peakY + 0.75, 0 ], color: palette.granite, jitter: 0.08, rng,
  }))

  return mergeParts(parts, { grime: 2.8, grimeFloor: 0.58 })
}

/** The sauna — a squat log cabin with an iron flue. */
export function buildSauna (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const length                  = 4.2
  const halfDepth               = 1.7
  const courses                 = 6
  const courseH                 = 0.42
  const plinthY                 = 0.42
  const eaveY                   = plinthY + courses * courseH
  const peakY                   = eaveY + 1.3
  const roof                    = { eaveY, peakY, halfDepth }

  parts.push(part(box(length + 0.5, plinthY, halfDepth * 2 + 0.5), {
    at: [ 0, plinthY / 2, 0 ], color: palette.granite, jitter: 0.13, rng,
  }))

  for (let course = 0; course < courses; course += 1) {
    const y     = plinthY + courseH * (course + 0.5)
    const color = course % 2 === 0 ? palette.woodDark : palette.tarWood

    for (const side of [ -1, 1 ]) {
      parts.push(part(cyl(courseH * 0.5, courseH * 0.5, length, 6), {
        at:     [ 0, y, side * halfDepth ],
        rotate: [ 0, 0, deg(90) ],
        color,
        jitter: 0.1,
        rng,
      }))
      parts.push(part(cyl(courseH * 0.5, courseH * 0.5, halfDepth * 2, 6), {
        at:     [ side * length / 2, y + courseH * 0.5, 0 ],
        rotate: [ deg(90), 0, 0 ],
        color,
        jitter: 0.1,
        rng,
      }))
    }
  }

  // Log ends left the gable open, so the roof void was lit from both ends.
  for (const side of [ -1, 1 ])
    gableEnd(parts, rng, palette.woodDark, { ...roof, thick: 0.2, at: side * (length / 2 - 0.1) })

  gabledRoof(parts, rng, palette.shingleWorn, palette.shingle, {
    ...roof, length: length + 0.7, overhang: 0.4,
  })

  parts.push(part(box(0.9, 1.6, 0.14), {
    at: [ 0, plinthY + 0.8, halfDepth + 0.08 ], color: palette.woodLight, jitter: 0.08, rng,
  }))
  glazeWindows(parts, rng, palette.tarWood, palette.glass, GLAZING.sauna)

  parts.push(part(cyl(0.16, 0.18, 1.9, 6), {
    at: [ -1.2, peakY - 0.1, 0 ], color: palette.iron, jitter: 0.09, rng,
  }))

  return mergeParts(parts, { grime: 2, grimeFloor: 0.52 })
}

/** The aitta — a storehouse lifted clear of the ground on staddle stones. */
export function buildAitta (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const length                  = 3.2
  const halfDepth               = 1.4
  const floorY                  = 0.75
  const deckY                   = floorY + 0.24
  const wallY                   = floorY + 2.4
  const peakY                   = wallY + 1.5
  const roof                    = { eaveY: wallY, peakY, halfDepth }

  for (const sx of [ -1, 1 ])
    for (const sz of [ -1, 1 ])
      parts.push(part(cyl(0.34, 0.42, floorY, 6), {
        at:     [ sx * (length / 2 - 0.3), floorY / 2, sz * (halfDepth - 0.25) ],
        color:  palette.granite,
        jitter: 0.14,
        rng,
      }))

  parts.push(part(box(length + 0.4, 0.24, halfDepth * 2 + 0.4), {
    at: [ 0, floorY + 0.12, 0 ], color: palette.plank, jitter: 0.09, rng,
  }))

  // The walls run deck to wall head. They used to stop 0.12 m short, which read
  // as a slot of daylight all the way round under the eaves.
  for (const sz of [ -1, 1 ])
    parts.push(part(box(length, wallY - deckY, 0.18), {
      at: [ 0, (wallY + deckY) / 2, sz * halfDepth ], color: palette.woodDark, jitter: 0.1, rng,
    }))
  for (const sx of [ -1, 1 ]) {
    parts.push(part(box(0.18, wallY - deckY, halfDepth * 2), {
      at: [ sx * length / 2, (wallY + deckY) / 2, 0 ], color: palette.tarWood, jitter: 0.1, rng,
    }))
    gableEnd(parts, rng, palette.tarWood, { ...roof, thick: 0.18, at: sx * length / 2 })
  }

  gabledRoof(parts, rng, palette.shingleWorn, palette.shingle, {
    ...roof, length: length + 0.9, overhang: 0.55,
  })

  parts.push(part(box(0.85, 1.5, 0.12), {
    at: [ 0, deckY + 0.75, halfDepth + 0.07 ], color: palette.woodLight, jitter: 0.08, rng,
  }))

  for (const sx of [ -1, 1 ])
    parts.push(part(box(0.1, 1.3, 0.1), {
      at:     [ sx * 0.35, floorY * 0.55, halfDepth + 0.6 ],
      rotate: [ deg(-24), 0, 0 ],
      color:  palette.wood,
      jitter: 0.07,
      rng,
    }))
  for (const step of [ 0.25, 0.55 ])
    parts.push(part(box(0.8, 0.09, 0.22), {
      at: [ 0, step, halfDepth + 0.75 - step * 0.4 ], color: palette.wood, jitter: 0.08, rng,
    }))

  return mergeParts(parts, { grime: 2.2, grimeFloor: 0.5 })
}

/** The woodshed (liiteri) — an open lean-to already loaded with firewood. */
export function buildWoodshed (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const length                  = 4
  const halfDepth               = 1.3
  const frontY                  = 2.4
  const backY                   = 3

  for (const sx of [ -1, 1 ]) {
    parts.push(part(box(0.22, frontY, 0.22), {
      at: [ sx * length / 2, frontY / 2, halfDepth ], color: palette.tarWood, jitter: 0.08, rng,
    }))
    parts.push(part(box(0.22, backY, 0.22), {
      at: [ sx * length / 2, backY / 2, -halfDepth ], color: palette.tarWood, jitter: 0.08, rng,
    }))
  }

  claddingPlanks(parts, rng, palette.woodDark, 6, length, backY, 0.14, -halfDepth)

  for (const sx of [ -1, 1 ])
    parts.push(part(box(0.14, frontY, halfDepth * 2), {
      at: [ sx * length / 2, frontY / 2, 0 ], color: palette.woodDark, jitter: 0.09, rng,
    }))

  // The roof now lands on the posts. Placed by its centre-line it floated a
  // clear 0.15 m above every one of them.
  monoRoof(parts, rng, palette.shingle, { length: length + 0.6, frontY, backY, halfDepth })

  for (let row = 0; row < 3; row += 1)
    for (let log = 0; log < 5; log += 1)
      parts.push(part(cyl(0.15, 0.15, halfDepth * 1.7, 6), {
        at:     [ -length / 2 + 0.5 + log * 0.72, 0.2 + row * 0.32, -0.1 ],
        rotate: [ deg(90), 0, 0 ],
        color:  log % 2 === 0 ? palette.wood : palette.woodLight,
        jitter: 0.14,
        rng,
      }))

  return mergeParts(parts, { grime: 1.8, grimeFloor: 0.48 })
}
