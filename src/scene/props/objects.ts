import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { ball, box, cyl, deg, mergeParts, part, spread } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'


/** Loose objects — the clutter that says the farm is lived in. */

interface HullStation {
  z:         number
  halfWidth: number
}

const HULL_STATIONS: readonly HullStation[] = [
  { z: -1.7, halfWidth: 0.12 },
  { z: -1.15, halfWidth: 0.47 },
  { z: -0.42, halfWidth: 0.64 },
  { z: 0.42, halfWidth: 0.64 },
  { z: 1.15, halfWidth: 0.47 },
  { z: 1.7, halfWidth: 0.12 },
]

/** One overlapping plank course down both sides of a tapered hull. */
function addStrake (
  parts:  BufferGeometry[],
  rng:    SeededRng,
  scale:  number,
  y:      number,
  height: number,
  color:  string,
): void {
  for (const sx of [ -1, 1 ])
    for (let index = 0; index < HULL_STATIONS.length - 1; index += 1) {
      const from   = HULL_STATIONS[index]
      const to     = HULL_STATIONS[index + 1]
      const dx     = sx * (to.halfWidth - from.halfWidth) * scale
      const dz     = to.z - from.z
      const length = Math.hypot(dx, dz)

      parts.push(part(box(0.085, height, length + 0.035), {
        at: [
          sx * (from.halfWidth + to.halfWidth) * scale * 0.5,
          y,
          (from.z + to.z) * 0.5,
        ],
        rotate: [ 0, Math.atan2(dx, dz), 0 ],
        color,
        jitter: 0.09,
        rng,
      }))
    }
}

/**
 * A hollow clinker rowboat, long axis on `z`.
 *
 * The overlapping strakes flare out in three courses and taper into narrow
 * stems. The keel is the only part that reaches `y = 0`; the open interior sits
 * above it instead of being filled by one rectangular hull block.
 */
export function buildRowboat (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  // Keel and floorboards: enough bottom to float, low enough to leave a visible
  // cavity between the benches and the bilge.
  parts.push(part(box(0.18, 0.14, 3.28), {
    at: [ 0, 0.07, 0 ], color: palette.tarWood, jitter: 0.1, rng,
  }))
  parts.push(part(box(0.46, 0.08, 2.5), {
    at: [ 0, 0.18, 0 ], color: palette.woodDark, jitter: 0.11, rng,
  }))

  // Clinker courses overlap vertically and step outward toward the gunwale.
  addStrake(parts, rng, 0.7, 0.24, 0.28, palette.tarWood)
  addStrake(parts, rng, 0.86, 0.39, 0.27, palette.trimShadow)
  addStrake(parts, rng, 1, 0.55, 0.27, palette.trimWhite)
  addStrake(parts, rng, 1.03, 0.71, 0.08, palette.woodDark)

  // Narrow stems close the two pointed ends without filling the interior.
  for (const sz of [ -1, 1 ])
    parts.push(part(box(0.17, 0.75, 0.16), {
      at: [ 0, 0.375, sz * 1.68 ], color: palette.trimWhite, jitter: 0.08, rng,
    }))

  for (const [ index, z ] of spread(3, 1.5).entries())
    parts.push(part(box(index === 1 ? 1.2 : 1.05, 0.08, 0.22), {
      at: [ 0, 0.61, z ], color: palette.woodLight, jitter: 0.12, rng,
    }))

  // A matched pair of oars lies in the xz plane. Cylinders start on the y axis,
  // so the 90-degree x rotation is the load-bearing part of this transform.
  const oarAngle  = deg(68)
  const oarLength = 2.25
  const direction = { x: Math.sin(oarAngle), z: Math.cos(oarAngle) }

  for (const sign of [ -1, 1 ]) {
    const z = sign * 0.28

    parts.push(part(cyl(0.04, 0.04, oarLength, 6), {
      at:     [ 0, 0.8, z ],
      rotate: [ deg(90), oarAngle, 0 ],
      color:  palette.wood,
      jitter: 0.1,
      rng,
    }))

    const bladeReach = oarLength * 0.5 + 0.18

    parts.push(part(box(0.15, 0.045, 0.44), {
      at: [
        sign * direction.x * bladeReach,
        0.8,
        z + sign * direction.z * bladeReach,
      ],
      rotate: [ 0, oarAngle, 0 ],
      color:  palette.woodLight,
      jitter: 0.1,
      rng,
    }))
  }

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
