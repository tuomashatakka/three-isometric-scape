import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { applyBend, applyTaper, ball, blade, box, cone, cyl, deg, hedron, mergeParts, part, spread } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'


const TAU = Math.PI * 2


/**
 * Vegetation — the scattered half of the roster.
 *
 * Every builder here is deliberately kept under ten parts: these geometries are
 * stamped hundreds of times through `scatterInstances`, so a part is paid for
 * once in memory but drawn on every instance. The hero props in `buildings.ts`
 * can afford forty; a grass tuft cannot afford five.
 */

/** Norway spruce (kuusi) — the tree that makes the ridge line read as Nordic. */
export function buildSpruce (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const height                  = 4.4

  parts.push(part(cyl(0.09, 0.17, height * 0.42, 6), {
    at: [ 0, height * 0.21, 0 ], color: palette.bark, jitter: 0.14, rng,
  }))

  const tiers = [
    { y: 0.32, radius: 0.95, height: 1.5 },
    { y: 0.52, radius: 0.78, height: 1.4 },
    { y: 0.71, radius: 0.55, height: 1.2 },
    { y: 0.87, radius: 0.32, height: 0.9 },
  ]

  for (const [ index, tier ] of tiers.entries())
    parts.push(part(cone(tier.radius, tier.height, 7), {
      at:     [ 0, height * tier.y + tier.height * 0.32, 0 ],
      rotate: [ 0, deg(index * 37), 0 ],
      color:  index % 2 === 0 ? palette.spruce : palette.spruceDeep,
      jitter: 0.13,
      rng,
    }))

  return mergeParts(parts, { grime: 1.6, grimeFloor: 0.42 })
}

/** Scots pine (mänty) — bare red trunk, canopy held high and flat. */
export function buildPine (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const height                  = 5.2

  parts.push(part(cyl(0.11, 0.2, height * 0.78, 6), {
    at:     [ 0, height * 0.39, 0 ],
    rotate: [ deg(rng.range(-2, 2)), 0, deg(rng.range(-2, 2)) ],
    color:  palette.ironRust,
    jitter: 0.15,
    rng,
  }))

  for (const [ index, spec ] of [
    { y: 0.74, radius: 1.15, height: 0.75 },
    { y: 0.86, radius: 0.92, height: 0.65 },
    { y: 0.96, radius: 0.55, height: 0.5 },
  ].entries())
    parts.push(part(cone(spec.radius, spec.height, 7), {
      at:     [ rng.range(-0.1, 0.1), height * spec.y, rng.range(-0.1, 0.1) ],
      rotate: [ 0, deg(index * 43), 0 ],
      color:  index === 0 ? palette.pine : palette.spruceLight,
      jitter: 0.14,
      rng,
    }))

  for (const sx of [ -1, 1 ])
    parts.push(part(cyl(0.04, 0.06, 0.7, 5), {
      at:     [ sx * 0.22, height * 0.62, 0 ],
      rotate: [ 0, 0, deg(sx * 58) ],
      color:  palette.barkDark,
      jitter: 0.12,
      rng,
    }))

  return mergeParts(parts, { grime: 1.8, grimeFloor: 0.44 })
}

/** Silver birch (koivu) — pale bark, dark scars, loose canopy. */
export function buildBirch (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const height                  = 4

  parts.push(part(cyl(0.07, 0.13, height * 0.72, 6), {
    at:     [ 0, height * 0.36, 0 ],
    rotate: [ deg(rng.range(-3, 3)), 0, deg(rng.range(-3, 3)) ],
    color:  palette.birchBark,
    jitter: 0.07,
    rng,
  }))

  for (const y of [ 0.22, 0.42, 0.58 ])
    parts.push(part(box(0.16, 0.07, 0.16), {
      at:     [ 0, height * y, 0 ],
      rotate: [ 0, deg(rng.range(0, 180)), 0 ],
      color:  palette.birchScar,
      jitter: 0.1,
      rng,
    }))

  for (const [ index, puff ] of [
    { at: [ 0, 0.82, 0 ], radius: 0.82 },
    { at: [ 0.42, 0.72, 0.2 ], radius: 0.58 },
    { at: [ -0.38, 0.75, -0.24 ], radius: 0.52 },
    { at: [ 0.05, 0.95, -0.1 ], radius: 0.5 },
  ].entries())
    parts.push(part(ball(puff.radius, 5), {
      at:     [ puff.at[0], height * puff.at[1], puff.at[2] ],
      scale:  [ 1, 0.78, 1 ],
      color:  index % 2 === 0 ? palette.grass : palette.spruceLight,
      jitter: 0.16,
      rng,
    }))

  return mergeParts(parts, { grime: 1.5, grimeFloor: 0.48 })
}

/** A dead spruce — bare, grey, and the cheapest silhouette in the scape. */
export function buildDeadSpruce (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const height                  = 3.6

  parts.push(part(cyl(0.05, 0.16, height, 5), {
    at:     [ 0, height / 2, 0 ],
    rotate: [ deg(rng.range(-5, 5)), 0, deg(rng.range(-5, 5)) ],
    color:  palette.deadWood,
    jitter: 0.16,
    rng,
  }))

  for (const [ index, y ] of [ 0.4, 0.55, 0.7, 0.82 ].entries())
    parts.push(part(cyl(0.03, 0.05, 0.85 - index * 0.14, 4), {
      at:     [ 0, height * y, 0 ],
      rotate: [ 0, deg(index * 84), deg(62 - index * 6) ],
      color:  palette.deadWood,
      jitter: 0.18,
      rng,
    }))

  return mergeParts(parts, { grime: 1.4, grimeFloor: 0.5 })
}

/** A knee-high sapling — fills the ground between the big trees. */
export function buildSapling (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  parts.push(part(cyl(0.03, 0.05, 0.5, 5), {
    at: [ 0, 0.25, 0 ], color: palette.bark, jitter: 0.14, rng,
  }))
  parts.push(part(cone(0.34, 0.95, 6), {
    at: [ 0, 0.82, 0 ], color: palette.spruceLight, jitter: 0.16, rng,
  }))
  parts.push(part(cone(0.22, 0.6, 6), {
    at: [ 0, 1.28, 0 ], color: palette.spruce, jitter: 0.16, rng,
  }))

  return mergeParts(parts, { grime: 0.7, grimeFloor: 0.45 })
}

/** A cut stump with a mossy top. */
export function buildStump (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  parts.push(part(cyl(0.3, 0.38, 0.5, 7), {
    at: [ 0, 0.25, 0 ], color: palette.barkDark, jitter: 0.16, rng,
  }))
  parts.push(part(cyl(0.29, 0.29, 0.07, 7), {
    at: [ 0, 0.52, 0 ], color: palette.woodLight, jitter: 0.12, rng,
  }))
  parts.push(part(ball(0.22, 5), {
    at:     [ 0.1, 0.55, -0.06 ],
    scale:  [ 1, 0.4, 1 ],
    color:  palette.moss,
    jitter: 0.2,
    rng,
  }))

  return mergeParts(parts, { grime: 0.6, grimeFloor: 0.5 })
}

/**
 * A tuft of grass — the densest thing in the scene, and the one that decides
 * whether the ground reads as a lawn or as a field.
 *
 * Four blades, each tapered to a point and *bent*. The bend is the whole trick:
 * straight spikes read as a hedgehog no matter how many you scatter, because
 * real grass leans and catches light along a curve rather than on one facet.
 * Each blade also leans its own way and picks its own colour, so a tuft never
 * looks like four copies of one blade — which is exactly what it is.
 */
export function buildGrassTuft (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  for (let stem = 0; stem < 4; stem += 1) {
    const height = 0.3 + rng.range(0, 0.34)
    const curve  = deg(rng.range(26, 72)) * (rng.next() > 0.5 ? 1 : -1)
    const leaf   = applyBend(applyTaper(blade(0.055, height), 0.1, 'y'), curve, 'y')

    parts.push(part(leaf, {
      at:     [ rng.range(-0.08, 0.08), height * 0.5, rng.range(-0.08, 0.08) ],
      rotate: [ deg(rng.range(-8, 8)), rng.range(0, TAU), deg(rng.range(-8, 8)) ],
      color:  rng.next() > 0.42 ? palette.grass : palette.grassDry,
      jitter: 0.18,
      rng,
    }))
  }

  return mergeParts(parts, { grime: 0.6, grimeFloor: 0.34 })
}

/** A heather clump — low, purple, and slightly woody. */
export function buildHeather (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  for (let puff = 0; puff < 4; puff += 1)
    parts.push(part(hedron(0.2 + rng.range(0, 0.09), 0), {
      at:     [ rng.range(-0.22, 0.22), 0.13, rng.range(-0.22, 0.22) ],
      scale:  [ 1, 0.55, 1 ],
      color:  puff % 2 === 0 ? palette.heather : palette.moss,
      jitter: 0.24,
      rng,
    }))

  return mergeParts(parts, { grime: 0.4, grimeFloor: 0.46 })
}

/** A wildflower — a stem and a bright head, read only as a colour speck. */
export function buildWildflower (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  parts.push(part(cyl(0.015, 0.02, 0.4, 4), {
    at: [ 0, 0.2, 0 ], color: palette.grass, jitter: 0.16, rng,
  }))
  parts.push(part(ball(0.07, 5), {
    at:     [ 0, 0.4, 0 ],
    scale:  [ 1, 0.6, 1 ],
    color:  rng.pick([ palette.hay, palette.rye, palette.heather ]),
    jitter: 0.16,
    rng,
  }))

  return mergeParts(parts, { grime: 0.3, grimeFloor: 0.55 })
}

/** Lakeside reeds — four stems and their seed heads. */
export function buildReeds (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  for (let stem = 0; stem < 4; stem += 1) {
    const height = 0.95 + rng.range(0, 0.4)
    const x      = rng.range(-0.16, 0.16)
    const z      = rng.range(-0.16, 0.16)

    parts.push(part(cyl(0.017, 0.03, height, 4), {
      at:     [ x, height / 2, z ],
      rotate: [ deg(rng.range(-9, 9)), 0, deg(rng.range(-9, 9)) ],
      color:  palette.grassDry,
      jitter: 0.18,
      rng,
    }))
    parts.push(part(cyl(0.045, 0.035, 0.22, 5), {
      at:     [ x, height + 0.05, z ],
      color:  palette.hayDark,
      jitter: 0.15,
      rng,
    }))
  }

  return mergeParts(parts, { grime: 0.5, grimeFloor: 0.55 })
}

/**
 * A lily pad cluster — flat discs that sit on the waterline.
 *
 * Laid out on a ring rather than jittered inside a box. Random offsets in a
 * square let two discs land on top of each other, and coplanar discs at the
 * same height z-fight into a flickering mess; a ring whose chord exceeds the
 * widest pad pair cannot overlap at all, and a few millimetres of stagger
 * settles the depth order for good.
 */
export function buildLilyPads (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const pads                    = 3
  const ring                    = 0.46
  const start                   = rng.range(0, TAU)

  for (let pad = 0; pad < pads; pad += 1) {
    const radius = 0.3 + rng.range(0, 0.055)
    const angle  = start + pad / pads * TAU + rng.range(-0.09, 0.09)

    parts.push(part(cyl(radius, radius * 0.94, 0.03, 9), {
      at:     [ Math.cos(angle) * ring, 0.018 + pad * 0.009, Math.sin(angle) * ring ],
      rotate: [ 0, rng.range(0, TAU), 0 ],
      color:  pad % 2 === 0 ? palette.moss : palette.grass,
      jitter: 0.12,
      rng,
    }))
  }

  return mergeParts(parts)
}

/** A short run of crop — six stalks in a line, stamped along the plough rows. */
export function buildCropRow (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  for (const x of spread(6, 1.4)) {
    const height = 0.72 + rng.range(0, 0.18)

    parts.push(part(cone(0.075, height, 4), {
      at:     [ x + rng.range(-0.05, 0.05), height / 2, rng.range(-0.07, 0.07) ],
      rotate: [ deg(rng.range(-7, 7)), deg(rng.range(0, 180)), deg(rng.range(-7, 7)) ],
      color:  rng.next() > 0.35 ? palette.rye : palette.hay,
      jitter: 0.2,
      rng,
    }))
  }

  return mergeParts(parts, { grime: 0.6, grimeFloor: 0.5 })
}
