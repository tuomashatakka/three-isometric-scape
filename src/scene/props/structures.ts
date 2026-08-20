import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { ball, box, cyl, deg, hedron, mergeParts, part, spread } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'


/**
 * The worked landscape — everything people built that is not a building.
 *
 * `buildFenceSegment` and `buildRailFence` are the two that get stamped in
 * quantity; the rest are one-offs placed at layout anchors.
 */

/** The jetty (laituri) — a plank deck on driven piles, reaching into the lake. */
export function buildJetty (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const length                  = 7
  const width                   = 1.8
  const deckY                   = 1.1

  for (const z of spread(4, length - 1.2))
    for (const sx of [ -1, 1 ])
      parts.push(part(cyl(0.13, 0.16, deckY + 0.6, 6), {
        at:     [ sx * (width / 2 - 0.2), (deckY + 0.6) / 2 - 0.6, z ],
        color:  palette.tarWood,
        jitter: 0.12,
        rng,
      }))

  for (const sx of [ -1, 1 ])
    parts.push(part(box(0.14, 0.16, length), {
      at: [ sx * (width / 2 - 0.2), deckY - 0.12, 0 ], color: palette.woodDark, jitter: 0.08, rng,
    }))

  for (const z of spread(14, length - 0.3))
    parts.push(part(box(width, 0.1, (length - 0.3) / 14 * 0.86), {
      at: [ 0, deckY, z ], color: palette.plank, jitter: 0.13, rng,
    }))

  parts.push(part(cyl(0.16, 0.19, 1.5, 6), {
    at: [ width / 2 - 0.1, deckY + 0.4, length / 2 - 0.4 ], color: palette.tarWood, jitter: 0.11, rng,
  }))
  parts.push(part(ball(0.19, 6), {
    at: [ width / 2 - 0.1, deckY + 1.16, length / 2 - 0.4 ], color: palette.woodDark, jitter: 0.09, rng,
  }))

  return mergeParts(parts, { grime: 1.4, grimeFloor: 0.46 })
}

/** The well (kaivo) — a lathed stone rim under a little shingled roof. */
export function buildWell (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  parts.push(part(cyl(0.78, 0.86, 0.95, 9), {
    at: [ 0, 0.48, 0 ], color: palette.granite, jitter: 0.16, rng,
  }))
  parts.push(part(cyl(0.82, 0.8, 0.16, 9), {
    at: [ 0, 1.02, 0 ], color: palette.graniteWarm, jitter: 0.1, rng,
  }))
  parts.push(part(cyl(0.62, 0.62, 0.1, 9), {
    at: [ 0, 0.98, 0 ], color: palette.lakeSlate, jitter: 0.06, rng,
  }))

  for (const sx of [ -1, 1 ])
    parts.push(part(box(0.14, 1.5, 0.14), {
      at: [ sx * 0.7, 1.75, 0 ], color: palette.tarWood, jitter: 0.08, rng,
    }))

  for (const sz of [ -1, 1 ])
    parts.push(part(box(2, 0.14, 1.15), {
      at:     [ 0, 2.68, sz * 0.42 ],
      rotate: [ sz * deg(34), 0, 0 ],
      color:  palette.shingleWorn,
      jitter: 0.08,
      rng,
    }))
  parts.push(part(box(2.05, 0.15, 0.3), {
    at: [ 0, 3.02, 0 ], color: palette.shingle, jitter: 0.06, rng,
  }))

  parts.push(part(cyl(0.09, 0.09, 1.3, 6), {
    at:     [ 0, 2.2, 0 ],
    rotate: [ 0, 0, deg(90) ],
    color:  palette.wood,
    jitter: 0.08,
    rng,
  }))
  parts.push(part(box(0.08, 0.45, 0.08), {
    at: [ 0.78, 2.05, 0 ], color: palette.iron, jitter: 0.06, rng,
  }))
  parts.push(part(cyl(0.24, 0.2, 0.34, 7), {
    at: [ 0, 1.62, 0 ], color: palette.woodDark, jitter: 0.11, rng,
  }))

  return mergeParts(parts, { grime: 1.6, grimeFloor: 0.5 })
}

/** The hay drying rack (haasia) — posts, rails, and half-dried grass. */
export function buildHayRack (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const length                  = 5.4
  const height                  = 2.3

  for (const x of spread(4, length))
    parts.push(part(cyl(0.07, 0.1, height, 6), {
      at:     [ x, height / 2, 0 ],
      rotate: [ 0, 0, deg(rng.range(-3, 3)) ],
      color:  palette.tarWood,
      jitter: 0.12,
      rng,
    }))

  for (const y of [ 0.75, 1.35, 1.95 ])
    parts.push(part(cyl(0.05, 0.05, length + 0.4, 5), {
      at:     [ 0, y, 0 ],
      rotate: [ 0, 0, deg(90) ],
      color:  palette.wood,
      jitter: 0.1,
      rng,
    }))

  for (const x of spread(7, length - 0.5))
    parts.push(part(box(0.62, 1.5, 0.55), {
      at:     [ x, 1.35, 0 ],
      rotate: [ deg(rng.range(-6, 6)), deg(rng.range(-12, 12)), 0 ],
      color:  rng.next() > 0.5 ? palette.hay : palette.hayDark,
      jitter: 0.2,
      rng,
    }))

  return mergeParts(parts, { grime: 1.8, grimeFloor: 0.55 })
}

/** A stacked log pile under a plank lean-to. */
export function buildLogPile (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const width                   = 2.6

  for (const sx of [ -1, 1 ])
    parts.push(part(box(0.12, 1.5, 0.12), {
      at: [ sx * 1.5, 0.75, 0 ], color: palette.tarWood, jitter: 0.09, rng,
    }))

  for (let row = 0; row < 4; row += 1) {
    const count = 5 - row % 2
    for (const x of spread(count, 2.4 - row % 2 * 0.3))
      parts.push(part(cyl(0.16, 0.16, width, 6), {
        at:     [ x, 0.2 + row * 0.31, rng.range(-0.1, 0.1) ],
        rotate: [ deg(90), deg(rng.range(-4, 4)), 0 ],
        color:  rng.pick([ palette.wood, palette.woodLight, palette.bark ]),
        jitter: 0.16,
        rng,
      }))
  }

  parts.push(part(box(3.2, 0.1, width + 0.5), {
    at:     [ 0, 1.5, 0 ],
    rotate: [ deg(-8), 0, 0 ],
    color:  palette.plank,
    jitter: 0.1,
    rng,
  }))

  return mergeParts(parts, { grime: 1.3, grimeFloor: 0.48 })
}

/** A field gate — one wider span with a diagonal brace. */
export function buildGate (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const span                    = 2.6

  for (const x of [ -span / 2, span / 2 ])
    parts.push(part(box(0.16, 1.6, 0.16), {
      at: [ x, 0.8, 0 ], color: palette.tarWood, jitter: 0.1, rng,
    }))
  for (const y of [ 0.5, 0.9, 1.3 ])
    parts.push(part(box(span, 0.09, 0.09), {
      at: [ 0, y, 0 ], color: palette.woodLight, jitter: 0.1, rng,
    }))
  parts.push(part(box(span * 1.12, 0.08, 0.08), {
    at:     [ 0, 0.9, 0 ],
    rotate: [ 0, 0, deg(19) ],
    color:  palette.woodLight,
    jitter: 0.1,
    rng,
  }))

  return mergeParts(parts, { grime: 1.1, grimeFloor: 0.52 })
}

/** A flagpole with a stiff canvas flag. */
export function buildFlagpole (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  parts.push(part(cyl(0.5, 0.62, 0.3, 8), {
    at: [ 0, 0.15, 0 ], color: palette.granite, jitter: 0.13, rng,
  }))
  parts.push(part(cyl(0.06, 0.11, 6.4, 7), {
    at: [ 0, 3.35, 0 ], color: palette.trimWhite, jitter: 0.04, rng,
  }))
  parts.push(part(ball(0.13, 6), {
    at: [ 0, 6.6, 0 ], color: palette.trimShadow, jitter: 0.05, rng,
  }))
  parts.push(part(box(1.5, 0.9, 0.05), {
    at:     [ 0.78, 5.7, 0 ],
    rotate: [ 0, deg(-8), deg(-3) ],
    color:  palette.trimWhite,
    jitter: 0.06,
    rng,
  }))
  parts.push(part(box(1.5, 0.24, 0.06), {
    at:     [ 0.78, 5.7, 0 ],
    rotate: [ 0, deg(-8), deg(-3) ],
    color:  palette.flagBlue,
    jitter: 0.05,
    rng,
  }))
  parts.push(part(box(0.26, 0.9, 0.06), {
    at:     [ 0.5, 5.7, 0 ],
    rotate: [ 0, deg(-8), deg(-3) ],
    color:  palette.flagBlue,
    jitter: 0.05,
    rng,
  }))

  return mergeParts(parts, { grime: 1.2, grimeFloor: 0.6 })
}

/** A plank bridge on stone abutments, long axis on `z`. */
export function buildBridge (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const length                  = 6
  const width                   = 2.6

  for (const sz of [ -1, 1 ])
    parts.push(part(hedron(1.1, 0), {
      at:     [ 0, 0.2, sz * (length / 2 - 0.3) ],
      scale:  [ width / 2 + 0.3, 0.8, 0.8 ],
      color:  palette.granite,
      jitter: 0.17,
      rng,
    }))

  for (const sx of [ -1, 1 ])
    parts.push(part(box(0.2, 0.28, length), {
      at: [ sx * (width / 2 - 0.25), 0.9, 0 ], color: palette.tarWood, jitter: 0.09, rng,
    }))

  for (const z of spread(12, length - 0.2))
    parts.push(part(box(width, 0.11, (length - 0.2) / 12 * 0.88), {
      at: [ 0, 1.08, z ], color: palette.plank, jitter: 0.14, rng,
    }))

  for (const sx of [ -1, 1 ]) {
    parts.push(part(cyl(0.05, 0.05, length - 0.4, 5), {
      at:     [ sx * (width / 2 - 0.12), 1.62, 0 ],
      rotate: [ deg(90), 0, 0 ],
      color:  palette.wood,
      jitter: 0.11,
      rng,
    }))
    for (const z of spread(3, length - 1))
      parts.push(part(cyl(0.06, 0.07, 0.62, 5), {
        at: [ sx * (width / 2 - 0.12), 1.38, z ], color: palette.tarWood, jitter: 0.1, rng,
      }))
  }

  return mergeParts(parts, { grime: 1.5, grimeFloor: 0.45 })
}

/** A two-wheeled hand cart, tipped forward onto its shafts. */
export function buildCart (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  parts.push(part(box(1.9, 0.14, 1.1), {
    at: [ 0, 0.72, 0 ], color: palette.plank, jitter: 0.12, rng,
  }))
  for (const sz of [ -1, 1 ])
    parts.push(part(box(1.9, 0.42, 0.1), {
      at: [ 0, 0.93, sz * 0.5 ], color: palette.woodDark, jitter: 0.11, rng,
    }))
  parts.push(part(box(0.1, 0.42, 1.1), {
    at: [ -0.9, 0.93, 0 ], color: palette.woodDark, jitter: 0.11, rng,
  }))

  for (const sz of [ -1, 1 ]) {
    parts.push(part(cyl(0.46, 0.46, 0.11, 10), {
      at:     [ 0.1, 0.5, sz * 0.66 ],
      rotate: [ deg(90), 0, 0 ],
      color:  palette.woodDark,
      jitter: 0.1,
      rng,
    }))
    parts.push(part(cyl(0.13, 0.13, 0.16, 6), {
      at:     [ 0.1, 0.5, sz * 0.66 ],
      rotate: [ deg(90), 0, 0 ],
      color:  palette.iron,
      jitter: 0.08,
      rng,
    }))
    parts.push(part(box(1.7, 0.09, 0.09), {
      at:     [ 1.1, 0.42, sz * 0.4 ],
      rotate: [ 0, 0, deg(-14) ],
      color:  palette.wood,
      jitter: 0.1,
      rng,
    }))
  }

  parts.push(part(box(1.3, 0.5, 0.85), {
    at: [ -0.1, 1.1, 0 ], color: palette.hay, jitter: 0.2, rng,
  }))

  return mergeParts(parts, { grime: 1.1, grimeFloor: 0.5 })
}
