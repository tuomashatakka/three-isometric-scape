import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'
import { box, cyl, deg, spread } from './primitives.ts'


/**
 * The farmstead buildings.
 *
 * Each returns one merged, vertex-coloured geometry with its base at `y = 0`
 * and its long axis on `x`. They are the highest-part-count props in the scape
 * — which is affordable precisely because there is exactly one of each, and
 * because `dressing.ts` merges the whole steading into a single draw.
 */

/** Vertical board cladding — the single detail that makes a wall read as timber. */
function claddingPlanks (
  parts:  BufferGeometry[],
  rng:    SeededRng,
  color:  string,
  count:  number,
  span:   number,
  height: number,
  depth:  number,
  z:      number,
): void {
  const width = span / count * 0.92

  for (const x of spread(count, span - width))
    parts.push(part(box(width, height, depth), {
      at:     [ x, height / 2, z ],
      color,
      jitter: 0.09,
      rng,
    }))
}

/** A stepped gable end — four courses standing in for a triangle. */
function gableSteps (
  parts:  BufferGeometry[],
  rng:    SeededRng,
  color:  string,
  x:      number,
  base:   number,
  peak:   number,
  width:  number,
  thick:  number,
): void {
  const steps = 4
  const rise  = (peak - base) / steps

  for (let step = 0; step < steps; step += 1) {
    const shrink = (step + 0.5) / steps
    parts.push(part(box(thick, rise, width * (1 - shrink * 0.86)), {
      at:     [ x, base + rise * (step + 0.5), 0 ],
      color,
      jitter: 0.07,
      rng,
    }))
  }
}

/** A gabled roof: two pitched slabs plus a ridge cap. */
function gabledRoof (
  parts: BufferGeometry[],
  rng:   SeededRng,
  color: string,
  ridge: string,
  length: number,
  eaveY: number,
  peakY: number,
  halfDepth: number,
): void {
  const rise  = peakY - eaveY
  const slope = Math.atan2(rise, halfDepth)
  const span  = Math.hypot(rise, halfDepth) * 1.06

  // Rotating about x sends a point at +z to y = -z*sin(theta), so the slab on
  // the +z side needs a POSITIVE angle for its eave to fall away from the
  // ridge. Negating it turns the gable inside out into a valley.
  for (const side of [ -1, 1 ])
    parts.push(part(box(length, 0.24, span), {
      at:     [ 0, (eaveY + peakY) / 2, side * halfDepth * 0.52 ],
      rotate: [ side * slope, 0, 0 ],
      color,
      jitter: 0.08,
      rng,
    }))

  parts.push(part(box(length * 1.02, 0.26, 0.5), {
    at:     [ 0, peakY + 0.04, 0 ],
    color:  ridge,
    jitter: 0.05,
    rng,
  }))
}

/** A window: a dark pane set inside a painted surround. */
function window (
  parts: BufferGeometry[],
  rng:   SeededRng,
  frame: string,
  glass: string,
  at:    readonly [number, number, number],
  width: number,
  height: number,
  facing: 1 | -1,
): void {
  const [ x, y, z ] = at

  parts.push(part(box(width + 0.22, height + 0.22, 0.1), {
    at:     [ x, y, z ],
    color:  frame,
    jitter: 0.04,
    rng,
  }))
  parts.push(part(box(width, height, 0.08), {
    at:     [ x, y, z + facing * 0.05 ],
    color:  glass,
    jitter: 0.12,
    rng,
  }))
}

/** The barn (lato) — falu-red board walls, sliding door, hay in the opening. */
export function buildBarn (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const length                  = 8
  const halfDepth               = 2.7
  const wallY                   = 3.6
  const peakY                   = 5.6

  parts.push(part(box(length + 0.5, 0.5, halfDepth * 2 + 0.5), {
    at: [ 0, 0.25, 0 ], color: palette.granite, jitter: 0.11, rng,
  }))

  claddingPlanks(parts, rng, palette.faluRed, 10, length, wallY, 0.18, -halfDepth)
  claddingPlanks(parts, rng, palette.faluWorn, 10, length, wallY, 0.18, halfDepth)

  for (const side of [ -1, 1 ]) {
    parts.push(part(box(0.2, wallY, halfDepth * 2), {
      at: [ side * length / 2, wallY / 2, 0 ], color: palette.faluDark, jitter: 0.08, rng,
    }))
    gableSteps(parts, rng, palette.faluDark, side * length / 2, wallY, peakY, halfDepth * 2, 0.2)
  }

  gabledRoof(parts, rng, palette.shingle, palette.shingleWorn, length + 0.7, wallY, peakY, halfDepth + 0.35)

  for (const sx of [ -1, 1 ])
    for (const sz of [ -1, 1 ])
      parts.push(part(box(0.32, wallY + 0.2, 0.32), {
        at: [ sx * length / 2, (wallY + 0.2) / 2, sz * halfDepth ], color: palette.trimWhite, jitter: 0.03, rng,
      }))

  parts.push(part(box(2.5, 2.9, 0.14), {
    at: [ 1.3, 1.45, halfDepth + 0.08 ], color: palette.tarWood, jitter: 0.1, rng,
  }))
  parts.push(part(box(2.4, 1.3, 0.6), {
    at: [ 1.3, 0.65, halfDepth - 0.2 ], color: palette.hay, jitter: 0.16, rng,
  }))
  parts.push(part(box(2.6, 3, 0.16), {
    at: [ -1.5, 1.5, halfDepth + 0.14 ], color: palette.faluDark, jitter: 0.07, rng,
  }))
  parts.push(part(box(6.6, 0.18, 0.2), {
    at: [ 0, 3.1, halfDepth + 0.16 ], color: palette.iron, jitter: 0.05, rng,
  }))
  parts.push(part(box(2.8, 0.32, 1.8), {
    at:     [ 1.3, 0.28, halfDepth + 1.1 ],
    rotate: [ deg(5), 0, 0 ],
    color:  palette.plank,
    jitter: 0.1,
    rng,
  }))

  window(parts, rng, palette.trimWhite, palette.glass, [ 3, 2.5, halfDepth + 0.05 ], 0.7, 0.7, 1)
  window(parts, rng, palette.trimWhite, palette.glass, [ -3.2, 2.5, -halfDepth - 0.05 ], 0.7, 0.7, -1)

  return mergeParts(parts, { grime: 2.4, grimeFloor: 0.55 })
}

/** The main house (päärakennus) — red walls, white surrounds, brick chimney. */
export function buildFarmhouse (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const length                  = 9
  const halfDepth               = 3
  const wallY                   = 3.9
  const peakY                   = 6.3

  parts.push(part(box(length + 0.6, 0.6, halfDepth * 2 + 0.6), {
    at: [ 0, 0.3, 0 ], color: palette.granite, jitter: 0.12, rng,
  }))

  claddingPlanks(parts, rng, palette.faluRed, 11, length, wallY, 0.2, -halfDepth)
  claddingPlanks(parts, rng, palette.faluRed, 11, length, wallY, 0.2, halfDepth)

  for (const side of [ -1, 1 ]) {
    parts.push(part(box(0.22, wallY, halfDepth * 2), {
      at: [ side * length / 2, wallY / 2, 0 ], color: palette.faluDark, jitter: 0.08, rng,
    }))
    gableSteps(parts, rng, palette.faluDark, side * length / 2, wallY, peakY, halfDepth * 2, 0.22)
  }

  gabledRoof(parts, rng, palette.shingle, palette.shingleWorn, length + 0.9, wallY, peakY, halfDepth + 0.45)

  for (const sx of [ -1, 1 ])
    for (const sz of [ -1, 1 ])
      parts.push(part(box(0.34, wallY + 0.2, 0.34), {
        at: [ sx * length / 2, (wallY + 0.2) / 2, sz * halfDepth ], color: palette.trimWhite, jitter: 0.03, rng,
      }))

  for (const x of [ -3.1, -1, 1, 3.1 ])
    window(parts, rng, palette.trimWhite, palette.glass, [ x, 2.4, halfDepth + 0.06 ], 0.8, 1.1, 1)

  for (const x of [ -2.4, 2.4 ])
    window(parts, rng, palette.trimWhite, palette.glass, [ x, 2.4, -halfDepth - 0.06 ], 0.8, 1.1, -1)

  window(parts, rng, palette.trimWhite, palette.glass, [ 0, 5, halfDepth - 0.35 ], 0.7, 0.8, 1)

  parts.push(part(box(1.1, 2.4, 0.16), {
    at: [ 0, 1.2, halfDepth + 0.1 ], color: palette.tarWood, jitter: 0.07, rng,
  }))
  parts.push(part(box(2.6, 0.22, 1.5), {
    at: [ 0, 2.7, halfDepth + 0.7 ], color: palette.shingleWorn, jitter: 0.07, rng,
  }))

  for (const sx of [ -1, 1 ])
    parts.push(part(box(0.18, 2.7, 0.18), {
      at: [ sx * 1.1, 1.35, halfDepth + 1.3 ], color: palette.trimWhite, jitter: 0.04, rng,
    }))

  parts.push(part(box(1.8, 0.24, 0.9), {
    at: [ 0, 0.12, halfDepth + 0.85 ], color: palette.granite, jitter: 0.1, rng,
  }))
  parts.push(part(box(1.5, 0.24, 0.6), {
    at: [ 0, 0.36, halfDepth + 0.55 ], color: palette.granite, jitter: 0.1, rng,
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
  const wallY                   = courses * courseH
  const peakY                   = wallY + 1.3

  parts.push(part(box(length + 0.5, 0.42, halfDepth * 2 + 0.5), {
    at: [ 0, 0.21, 0 ], color: palette.granite, jitter: 0.13, rng,
  }))

  for (let course = 0; course < courses; course += 1) {
    const y     = 0.42 + courseH * (course + 0.5)
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

  gabledRoof(parts, rng, palette.shingleWorn, palette.shingle, length + 0.7, wallY + 0.42, peakY, halfDepth + 0.4)

  parts.push(part(box(0.9, 1.6, 0.14), {
    at: [ 0, 1.22, halfDepth + 0.08 ], color: palette.woodLight, jitter: 0.08, rng,
  }))
  window(parts, rng, palette.tarWood, palette.glass, [ 1.3, 1.9, halfDepth + 0.06 ], 0.45, 0.4, 1)

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
  const wallY                   = floorY + 2.4
  const peakY                   = wallY + 1.5

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

  for (const sz of [ -1, 1 ])
    parts.push(part(box(length, wallY - floorY - 0.24, 0.18), {
      at: [ 0, (wallY + floorY) / 2, sz * halfDepth ], color: palette.woodDark, jitter: 0.1, rng,
    }))
  for (const sx of [ -1, 1 ]) {
    parts.push(part(box(0.18, wallY - floorY - 0.24, halfDepth * 2), {
      at: [ sx * length / 2, (wallY + floorY) / 2, 0 ], color: palette.tarWood, jitter: 0.1, rng,
    }))
    gableSteps(parts, rng, palette.tarWood, sx * length / 2, wallY, peakY, halfDepth * 2, 0.18)
  }

  gabledRoof(parts, rng, palette.shingleWorn, palette.shingle, length + 0.9, wallY, peakY, halfDepth + 0.55)

  parts.push(part(box(0.85, 1.5, 0.12), {
    at: [ 0, floorY + 0.9, halfDepth + 0.07 ], color: palette.woodLight, jitter: 0.08, rng,
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

  parts.push(part(box(length + 0.6, 0.2, halfDepth * 2.4), {
    at:     [ 0, (frontY + backY) / 2 + 0.25, 0 ],
    rotate: [ deg(12), 0, 0 ],
    color:  palette.shingle,
    jitter: 0.07,
    rng,
  }))

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
