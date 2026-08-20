import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { createRockGeometry, hedron, mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'


/**
 * Granite.
 *
 * Glacial erratics are the one landform feature that reads as Scandinavian at a
 * glance, so they get three size classes rather than one scaled instance —
 * a boulder and a pebble weather differently and a uniform scale betrays that.
 */

function graniteBody (
  rng:       SeededRng,
  palette:   NordicPalette,
  radius:    number,
  roughness: number,
  lichen:    number,
): BufferGeometry {
  const parts: BufferGeometry[] = []

  parts.push(part(
    createRockGeometry({ radius, detail: 1, rng, roughness, scale: [ 1.15, 0.74, 0.94 ]}),
    { at: [ 0, radius * 0.6, 0 ], color: palette.granite, jitter: 0.13, rng },
  ))

  for (let patch = 0; patch < lichen; patch += 1) {
    const angle = rng.range(0, Math.PI * 2)
    parts.push(part(hedron(radius * rng.range(0.2, 0.34), 0), {
      at:     [ Math.cos(angle) * radius * 0.6, radius * rng.range(0.85, 1.1), Math.sin(angle) * radius * 0.5 ],
      scale:  [ 1, 0.34, 1 ],
      color:  rng.next() > 0.5 ? palette.lichen : palette.moss,
      jitter: 0.22,
      rng,
    }))
  }

  return mergeParts(parts, { grime: radius * 1.2, grimeFloor: 0.5 })
}

/** A glacial erratic large enough to steer a plough around. */
export function buildErratic (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  return graniteBody(rng, palette, 1.4, 0.3, 3)
}

/** A mid-sized field stone. */
export function buildFieldStone (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  return graniteBody(rng, palette, 0.62, 0.26, 2)
}

/** A cobble — the small stuff that fills the shore and the scree. */
export function buildCobble (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  for (let stone = 0; stone < 3; stone += 1)
    parts.push(part(
      createRockGeometry({ radius: rng.range(0.14, 0.26), detail: 0, rng, roughness: 0.34 }),
      {
        at:     [ rng.range(-0.28, 0.28), 0.09, rng.range(-0.28, 0.28) ],
        rotate: [ 0, rng.range(0, Math.PI), 0 ],
        color:  rng.next() > 0.5 ? palette.graniteDark : palette.graniteWarm,
        jitter: 0.18,
        rng,
      },
    ))

  return mergeParts(parts, { grime: 0.4, grimeFloor: 0.55 })
}

/** A cleared-field cairn — stones the farm pulled out and stacked at the edge. */
export function buildCairn (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  for (let layer = 0; layer < 4; layer += 1) {
    const count  = 4 - layer
    const radius = 0.62 - layer * 0.13

    for (let stone = 0; stone < count; stone += 1) {
      const angle = rng.range(0, Math.PI * 2) + stone * (Math.PI * 2 / count)
      parts.push(part(
        createRockGeometry({ radius: 0.3 - layer * 0.03, detail: 0, rng, roughness: 0.3 }),
        {
          at:     [ Math.cos(angle) * radius, 0.2 + layer * 0.29, Math.sin(angle) * radius ],
          rotate: [ rng.range(0, 1), rng.range(0, Math.PI), rng.range(0, 1) ],
          color:  rng.pick([ palette.granite, palette.graniteDark, palette.graniteWarm ]),
          jitter: 0.17,
          rng,
        },
      ))
    }
  }

  return mergeParts(parts, { grime: 1.1, grimeFloor: 0.46 })
}
