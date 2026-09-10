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

/**
 * A block off a cliff face, lying where it landed.
 *
 * Its own builder rather than a smaller erratic, because the two stones have
 * had entirely different lives and it shows in the shape. An erratic was
 * carried under a mile of ice and rolled the whole way: it is rounded, and it
 * has stood on a hillside long enough to grow lichen over the top of it. A
 * talus block came off a face last winter along a joint in the rock, so it is
 * *angular* — the roughness is turned right up and the low detail keeps the
 * facets flat rather than dimpling them — and it carries no lichen at all,
 * because it spends half of every tide underwater.
 *
 * Wider than it is tall, and deliberately: a fallen block comes to rest on its
 * broadest face, and a scatter of upright ones reads as a field of menhirs.
 */
export function buildTalusBlock (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const radius = rng.range(0.38, 0.62)

  return mergeParts(
    [
      part(
        createRockGeometry({
          radius,
          detail:    0,
          rng,
          roughness: 0.62,
          scale:     [ 1.25, 0.58, 1.05 ],
        }),
        {
          // Sat on the ground rather than balanced on it: the lift is the
          // scaled half-height plus what the roughness pushes past it, and the
          // only turn is about the upright. A block that came off a face lands
          // on its broadest side, and a tilt here would leave a corner of it
          // under the platform it is lying on.
          at:     [ 0, radius * 0.62, 0 ],
          rotate: [ 0, rng.range(0, Math.PI), 0 ],
          color:  rng.next() > 0.42 ? palette.graniteDark : palette.granite,
          jitter: 0.16,
          rng,
        },
      ),
    ],
    // Grimed hard and from the ground up: the bottom of a block on a shore
    // platform is the part the weed and the barnacles are on.
    { grime: radius * 1.5, grimeFloor: 0.38 },
  )
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
