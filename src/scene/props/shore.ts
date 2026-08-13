import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'
import { ball, box, cyl, deg, spread } from './primitives.ts'


/**
 * The working waterfront — what a farm that owns a boat builds at the waterline.
 *
 * These are the props that belong to the water rather than to the ground: the
 * boathouse stands on piles with its mouth open to the lake, the net rack dries
 * gear on the bank behind it, and the mooring stakes are driven into the
 * shallows. Their long axis is `z`, like the jetty's, so `dressing.ts` can point
 * the whole harbour out to sea with one heading.
 */

/**
 * A run of vertical boards.
 *
 * `along` is the horizontal axis the wall spans; it sits at `offset` on the
 * other one. Board cladding is the single detail that makes a flat panel read as
 * a timber wall, and it costs vertices rather than draws.
 */
function boardWall (
  parts:  BufferGeometry[],
  rng:    SeededRng,
  color:  string,
  count:  number,
  span:   number,
  height: number,
  baseY:  number,
  along:  'x' | 'z',
  offset: number,
  depth = 0.12,
): void {
  const width = span / count * 0.94

  for (const u of spread(count, span - width)) {
    const size: [ number, number, number ] = along === 'x'
      ? [ width, height, depth ]
      : [ depth, height, width ]

    parts.push(part(box(...size), {
      at:     along === 'x' ? [ u, baseY + height / 2, offset ] : [ offset, baseY + height / 2, u ],
      color,
      jitter: 0.09,
      rng,
    }))
  }
}

/**
 * The slipway: rollers on two rails, running out of the shed and down under the
 * water.
 *
 * The drop is what sells it — a level ramp is a pier, not a slip — but it stays
 * inside the roster's `y = 0` base tolerance, which every prop is held to so
 * that a builder cannot quietly float or sink itself.
 */
function slipway (
  parts:   BufferGeometry[],
  rng:     SeededRng,
  palette: NordicPalette,
  start:   number,
  deckY:   number,
  drop:    number,
): void {
  const run  = 3.3
  const span = run - 0.4

  for (const sx of [ -1, 1 ])
    parts.push(part(box(0.16, 0.2, Math.hypot(run, drop)), {
      at:     [ sx * 0.92, deckY - 0.28 - drop / 2, start + run / 2 ],
      rotate: [ Math.atan2(drop, run), 0, 0 ],
      color:  palette.tarWood,
      jitter: 0.09,
      rng,
    }))

  for (const [ index, z ] of spread(6, span).entries())
    parts.push(part(cyl(0.12, 0.12, 2.1, 6), {
      at:     [ 0, deckY - 0.18 - drop * ((z + span / 2) / span), start + 0.2 + z + span / 2 ],
      rotate: [ 0, 0, deg(90) ],
      color:  index % 2 === 0 ? palette.wood : palette.woodLight,
      jitter: 0.14,
      rng,
    }))
}

/**
 * The boathouse (venevaja) — a tarred shed on piles, open to the water.
 *
 * The mouth faces `+z` and the slipway runs out of it and down under the
 * waterline, which is what makes the building read as a place a boat comes out
 * of rather than as a shed that happens to stand near the sea. Its floor is a
 * deck rather than a foundation, so it is anchored to the water level by the
 * caller instead of being plopped onto the terrain like the farmstead's five.
 */
export function buildBoathouse (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const length                  = 5.6
  const width                   = 3.4
  const deckY                   = 0.86
  const wallHeight              = 2.05
  const eaveY                   = deckY + wallHeight
  const peakY                   = eaveY + 1.15
  const pileDrop                = 0.6

  for (const z of spread(3, length - 0.9))
    for (const sx of [ -1, 1 ])
      parts.push(part(cyl(0.15, 0.18, deckY + pileDrop, 6), {
        at:     [ sx * (width / 2 - 0.24), (deckY + pileDrop) / 2 - pileDrop, z ],
        color:  palette.tarWood,
        jitter: 0.12,
        rng,
      }))

  for (const sx of [ -1, 1 ])
    parts.push(part(box(0.19, 0.2, length), {
      at: [ sx * (width / 2 - 0.24), deckY - 0.14, 0 ], color: palette.woodDark, jitter: 0.08, rng,
    }))

  for (const z of spread(11, length - 0.3))
    parts.push(part(box(width, 0.1, (length - 0.3) / 11 * 0.86), {
      at: [ 0, deckY, z ], color: palette.plank, jitter: 0.13, rng,
    }))

  for (const sx of [ -1, 1 ])
    boardWall(parts, rng, palette.tarWood, 12, length, wallHeight, deckY, 'z', sx * (width / 2 - 0.09))

  boardWall(parts, rng, palette.tarWood, 9, width, wallHeight, deckY, 'x', -(length / 2 - 0.09))

  // The mouth: two jamb posts and a header, and nothing between them.
  for (const sx of [ -1, 1 ])
    parts.push(part(box(0.2, wallHeight, 0.22), {
      at:     [ sx * (width / 2 - 0.14), deckY + wallHeight / 2, length / 2 - 0.12 ],
      color:  palette.woodDark,
      jitter: 0.08,
      rng,
    }))
  parts.push(part(box(width, 0.24, 0.24), {
    at: [ 0, eaveY - 0.1, length / 2 - 0.12 ], color: palette.woodDark, jitter: 0.08, rng,
  }))

  // Gable ends, as three narrowing courses rather than a triangle.
  for (const sz of [ -1, 1 ])
    for (let step = 0; step < 3; step += 1) {
      const rise = (peakY - eaveY) / 3
      parts.push(part(box(width * (1 - (step + 0.5) / 3 * 0.82), rise, 0.16), {
        at:     [ 0, eaveY + rise * (step + 0.5), sz * (length / 2 - 0.08) ],
        color:  step === 2 ? palette.woodLight : palette.tarWood,
        jitter: 0.08,
        rng,
      }))
    }

  // Ridge along z, so both slabs pitch across x.
  const halfSpan = width / 2 + 0.28
  const slope    = Math.atan2(peakY - eaveY, halfSpan)

  for (const sx of [ -1, 1 ])
    parts.push(part(box(Math.hypot(peakY - eaveY, halfSpan) * 1.06, 0.14, length + 0.5), {
      at:     [ sx * halfSpan / 2, (eaveY + peakY) / 2, 0 ],
      rotate: [ 0, 0, -sx * slope ],
      color:  sx > 0 ? palette.shingle : palette.shingleWorn,
      jitter: 0.08,
      rng,
    }))
  parts.push(part(box(0.36, 0.15, length + 0.6), {
    at: [ 0, peakY, 0 ], color: palette.shingle, jitter: 0.07, rng,
  }))

  slipway(parts, rng, palette, length / 2 + 0.1, deckY, deckY + 0.2)

  return mergeParts(parts, { grime: 1.5, grimeFloor: 0.44 })
}

/**
 * A net drying rack (verkkoteline) — hung gear on a trestle, long axis on `x`.
 *
 * Placed with the same heading as the boathouse it belongs to, which puts its
 * length along the shore: nets are hung broadside to the wind coming off the
 * water, and that also keeps the rack from reading as a second jetty.
 */
export function buildNetRack (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const length                  = 4.4
  const height                  = 2.15

  for (const x of spread(4, length))
    for (const sz of [ -1, 1 ])
      parts.push(part(cyl(0.07, 0.1, height, 6), {
        at:     [ x, height / 2, sz * 0.34 ],
        rotate: [ deg(sz * rng.range(3, 7)), 0, deg(rng.range(-3, 3)) ],
        color:  palette.tarWood,
        jitter: 0.12,
        rng,
      }))

  for (const y of [ height - 0.1, height * 0.52 ])
    parts.push(part(cyl(0.05, 0.05, length + 0.5, 5), {
      at:     [ 0, y, 0 ],
      rotate: [ 0, 0, deg(90) ],
      color:  palette.wood,
      jitter: 0.1,
      rng,
    }))

  // The nets themselves: hanging panels, each one dipping a little differently.
  for (const x of spread(5, length - 0.7)) {
    const drop = rng.range(1.05, 1.45)
    parts.push(part(box((length - 0.7) / 5 * 0.9, drop, 0.06), {
      at:     [ x, height - 0.12 - drop / 2, rng.range(-0.1, 0.1) ],
      rotate: [ deg(rng.range(-4, 4)), 0, deg(rng.range(-3, 3)) ],
      color:  rng.next() > 0.45 ? palette.canvas : palette.driftwoodDark,
      jitter: 0.18,
      rng,
    }))
  }

  for (const x of spread(3, length - 1.4))
    parts.push(part(ball(0.13, 5), {
      at:     [ x + rng.range(-0.2, 0.2), height - 0.06, 0.24 ],
      scale:  [ 1, 0.8, 1.5 ],
      color:  palette.ironRust,
      jitter: 0.12,
      rng,
    }))

  return mergeParts(parts, { grime: 1.4, grimeFloor: 0.52 })
}

/**
 * A mooring stake driven into the shallows, with a rope collar.
 *
 * Scattered from the seabed up, so its height has to clear the deepest water it
 * is allowed to stand in — a stake that does not break the surface is an
 * invisible draw call.
 */
export function buildMooringPost (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const height                  = rng.range(2.4, 2.9)
  const lean                    = deg(rng.range(-7, 7))

  parts.push(part(cyl(0.1, 0.14, height, 6), {
    at:     [ 0, height / 2, 0 ],
    rotate: [ deg(rng.range(-5, 5)), 0, lean ],
    color:  palette.tarWood,
    jitter: 0.14,
    rng,
  }))

  parts.push(part(cyl(0.17, 0.17, 0.14, 7), {
    at:     [ 0, height - 0.34, 0 ],
    rotate: [ 0, 0, lean ],
    color:  palette.driftwoodDark,
    jitter: 0.12,
    rng,
  }))

  if (rng.next() > 0.45)
    parts.push(part(cyl(0.06, 0.07, height * 0.6, 5), {
      at:     [ 0.22, height * 0.34, 0.1 ],
      rotate: [ deg(rng.range(-14, 14)), 0, deg(rng.range(12, 22)) ],
      color:  palette.driftwood,
      jitter: 0.16,
      rng,
    }))

  return mergeParts(parts, { grime: 1.1, grimeFloor: 0.5 })
}
