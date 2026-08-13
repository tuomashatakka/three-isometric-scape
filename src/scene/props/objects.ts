import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'
import { ball, box, cyl, deg, spread } from './primitives.ts'


/** Loose objects — the clutter that says the farm is lived in. */

/** A clinker rowboat, long axis on `z`. Sits on its keel at `y = 0`. */
export function buildRowboat (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const length                  = 3.4

  parts.push(part(box(1.02, 0.3, length), {
    at: [ 0, 0.18, 0 ], color: palette.tarWood, jitter: 0.11, rng,
  }))

  for (const [ index, sx ] of [ -1, 1 ].entries())
    for (const [ strake, spec ] of [
      { y: 0.36, out: 0.5, tilt: 12 },
      { y: 0.56, out: 0.6, tilt: 20 },
    ].entries())
      parts.push(part(box(0.09, 0.24, length * (1 - strake * 0.05)), {
        at:     [ sx * spec.out, spec.y, 0 ],
        rotate: [ 0, 0, deg(sx * spec.tilt) ],
        color:  (index + strake) % 2 === 0 ? palette.trimWhite : palette.trimShadow,
        jitter: 0.09,
        rng,
      }))

  for (const sz of [ -1, 1 ])
    parts.push(part(box(0.75, 0.5, 0.14), {
      at:     [ 0, 0.42, sz * (length / 2 - 0.08) ],
      rotate: [ deg(sz * 16), 0, 0 ],
      color:  palette.trimWhite,
      jitter: 0.08,
      rng,
    }))

  for (const z of spread(2, 1.5))
    parts.push(part(box(1.05, 0.08, 0.24), {
      at: [ 0, 0.5, z ], color: palette.woodLight, jitter: 0.12, rng,
    }))

  parts.push(part(cyl(0.045, 0.05, 2.1, 5), {
    at:     [ 0.2, 0.58, 0.2 ],
    rotate: [ deg(4), deg(-9), 0 ],
    color:  palette.wood,
    jitter: 0.1,
    rng,
  }))

  return mergeParts(parts, { grime: 0.9, grimeFloor: 0.52 })
}

/** A round bale wrapped and banded, lying on its side. */
export function buildHayBale (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  parts.push(part(cyl(0.62, 0.62, 0.9, 10), {
    at:     [ 0, 0.62, 0 ],
    rotate: [ 0, 0, deg(90) ],
    color:  palette.hay,
    jitter: 0.15,
    rng,
  }))

  for (const x of [ -0.28, 0, 0.28 ])
    parts.push(part(cyl(0.635, 0.635, 0.07, 10), {
      at:     [ x, 0.62, 0 ],
      rotate: [ 0, 0, deg(90) ],
      color:  palette.hayDark,
      jitter: 0.12,
      rng,
    }))

  return mergeParts(parts, { grime: 0.8, grimeFloor: 0.5 })
}

/** A stack of split firewood, drying in the open. */
export function buildFirewood (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  for (let row = 0; row < 4; row += 1)
    for (const x of spread(5 - row % 2, 1.3))
      parts.push(part(cyl(0.11, 0.11, 0.9, 5), {
        at:     [ x, 0.13 + row * 0.23, rng.range(-0.06, 0.06) ],
        rotate: [ deg(90), deg(rng.range(-5, 5)), 0 ],
        color:  rng.pick([ palette.wood, palette.woodLight, palette.bark ]),
        jitter: 0.18,
        rng,
      }))

  return mergeParts(parts, { grime: 0.9, grimeFloor: 0.5 })
}

/** A tar barrel with iron hoops. */
export function buildBarrel (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  parts.push(part(cyl(0.32, 0.3, 0.86, 9), {
    at: [ 0, 0.43, 0 ], color: palette.woodDark, jitter: 0.13, rng,
  }))
  for (const y of [ 0.16, 0.7 ])
    parts.push(part(cyl(0.335, 0.335, 0.08, 9), {
      at: [ 0, y, 0 ], color: palette.iron, jitter: 0.1, rng,
    }))
  parts.push(part(cyl(0.29, 0.29, 0.05, 9), {
    at: [ 0, 0.87, 0 ], color: palette.tarWood, jitter: 0.11, rng,
  }))

  return mergeParts(parts, { grime: 0.7, grimeFloor: 0.5 })
}

/** A washed-up log with a broken branch stub, bleached grey by the water. */
export function buildDriftwood (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts:  BufferGeometry[] = []
  const length                   = rng.range(1.6, 2.5)
  const heading                  = deg(rng.range(0, 180))

  parts.push(part(cyl(0.15, 0.09, length, 6), {
    at:     [ 0, 0.1, 0 ],
    rotate: [ deg(90), heading, deg(rng.range(-6, 6)) ],
    color:  palette.driftwood,
    jitter: 0.18,
    rng,
  }))

  parts.push(part(cyl(0.06, 0.04, rng.range(0.5, 0.9), 5), {
    at:     [ rng.range(-0.3, 0.3), 0.08, rng.range(-0.2, 0.2) ],
    rotate: [ deg(90), heading + deg(rng.range(20, 60)), deg(rng.range(-10, 10)) ],
    color:  palette.driftwoodDark,
    jitter: 0.2,
    rng,
  }))

  if (rng.next() > 0.5)
    parts.push(part(cyl(0.05, 0.09, 0.35, 5), {
      at:     [ length * 0.32, 0.1, 0 ],
      rotate: [ deg(rng.range(-15, 15)), 0, deg(rng.range(65, 100)) ],
      color:  palette.driftwoodDark,
      jitter: 0.16,
      rng,
    }))

  return mergeParts(parts, { grime: 0.5, grimeFloor: 0.6 })
}

/** A roadside mailbox on a leaning post. */
export function buildMailbox (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  parts.push(part(cyl(0.06, 0.08, 1.1, 5), {
    at:     [ 0, 0.55, 0 ],
    rotate: [ deg(3), 0, deg(-5) ],
    color:  palette.tarWood,
    jitter: 0.12,
    rng,
  }))
  parts.push(part(box(0.34, 0.28, 0.5), {
    at:     [ -0.06, 1.2, 0 ],
    rotate: [ 0, 0, deg(-5) ],
    color:  palette.iron,
    jitter: 0.09,
    rng,
  }))
  parts.push(part(ball(0.17, 5), {
    at:     [ -0.06, 1.32, 0 ],
    scale:  [ 1, 0.7, 1.45 ],
    color:  palette.iron,
    jitter: 0.09,
    rng,
  }))
  parts.push(part(box(0.05, 0.22, 0.05), {
    at:     [ 0.1, 1.42, -0.2 ],
    color:  palette.ironRust,
    jitter: 0.08,
    rng,
  }))

  return mergeParts(parts, { grime: 0.9, grimeFloor: 0.55 })
}
