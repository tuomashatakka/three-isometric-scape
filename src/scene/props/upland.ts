import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'
import { box, cone, cyl, deg, spread } from './primitives.ts'
import { claddingPlanks, gableEnd, gabledRoof } from './timber.ts'


/**
 * The upland pasture — what a farm builds on the ground it does not plough.
 *
 * Everything here is unpainted. Falu red is what a farm puts on the buildings
 * it walks past every day; the hay meadow up on the ridge gets whatever the
 * weather has already made of the timber, which is what separates the pasture
 * from the steading at a glance and from any distance.
 */

/**
 * The meadow barn (niittylato) — a hay store standing where the hay is cut.
 *
 * Corner stones rather than a plinth, and a floor lifted clear of them: the
 * point of the building is to keep a winter's hay off wet ground, so it is
 * built as a box on rocks with the air let through it. The cladding is spaced
 * for that too — real ones are slatted, and this one leaves its boards narrow
 * against their span so the gaps survive at the scale the camera sees them.
 *
 * Long axis on `x` and its doorway on `+z`, like every other building here.
 */
export function buildMeadowBarn (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const length                  = 5.2
  const halfDepth               = 1.75
  const floorY                  = 0.42
  const wallY                   = 2.75
  const eaveY                   = floorY + wallY
  const peakY                   = eaveY + 1.35

  // Corner stones. A meadow barn is never dug in — it is set down on whatever
  // the field already had, and it leans a little for the rest of its life.
  for (const sx of [ -1, 1 ])
    for (const sz of [ -1, 1 ])
      parts.push(part(cyl(0.36, 0.44, floorY + 0.1, 6), {
        at:     [ sx * (length / 2 - 0.35), (floorY + 0.1) / 2 - 0.1, sz * (halfDepth - 0.3) ],
        rotate: [ deg(rng.range(-4, 4)), 0, deg(rng.range(-4, 4)) ],
        color:  palette.granite,
        jitter: 0.15,
        rng,
      }))

  parts.push(part(box(length + 0.3, 0.22, halfDepth * 2 + 0.3), {
    at: [ 0, floorY - 0.11, 0 ], color: palette.woodDark, jitter: 0.11, rng,
  }))

  for (const sz of [ -1, 1 ])
    claddingPlanks(parts, rng, sz > 0 ? palette.driftwoodDark : palette.wood, 11, length, wallY, 0.16, sz * halfDepth, floorY)

  for (const sx of [ -1, 1 ]) {
    parts.push(part(box(0.18, wallY, halfDepth * 2), {
      at: [ sx * length / 2, floorY + wallY / 2, 0 ], color: palette.tarWood, jitter: 0.09, rng,
    }))
    gableEnd(parts, rng, palette.driftwoodDark, { eaveY, peakY, halfDepth, thick: 0.18, at: sx * length / 2 })
  }

  gabledRoof(parts, rng, palette.shingleWorn, palette.shingle, {
    eaveY, peakY, halfDepth, length: length + 0.8, overhang: 0.45,
  })

  // The doorway, and the hay coming out of it. A barn full to the boards is
  // the only way a hay store reads as being in use rather than derelict.
  parts.push(part(box(1.5, wallY * 0.82, 0.14), {
    at: [ 0.5, floorY + wallY * 0.41, halfDepth + 0.09 ], color: palette.tarWood, jitter: 0.09, rng,
  }))
  parts.push(part(box(1.35, 0.75, 0.5), {
    at: [ 0.5, floorY + 0.38, halfDepth - 0.05 ], color: palette.hay, jitter: 0.19, rng,
  }))
  parts.push(part(box(length * 0.86, 0.3, 0.24), {
    at: [ 0, eaveY - 0.22, halfDepth + 0.06 ], color: palette.hayDark, jitter: 0.2, rng,
  }))

  // A loading ramp of two planks up to the sill.
  for (const sx of [ -1, 1 ])
    parts.push(part(box(0.34, 0.1, 1.1), {
      at:     [ 0.5 + sx * 0.42, floorY * 0.55, halfDepth + 0.55 ],
      rotate: [ deg(-16), 0, 0 ],
      color:  palette.plank,
      jitter: 0.12,
      rng,
    }))

  return mergeParts(parts, { grime: 2.1, grimeFloor: 0.5 })
}

/**
 * A hay-drying pole (seiväshaasia) — cut grass wound onto a stake to dry.
 *
 * The one silhouette that says *this field was mown* from any distance, which
 * is the whole reason it is here: the pasture is otherwise a clearing, and a
 * clearing on its own is indistinguishable from ground nothing grows on. The
 * pole is left standing proud of the hay so the shape stays legible at the far
 * zoom, where the hay itself is four pixels of ochre.
 */
export function buildHayPole (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const height                  = rng.range(2.2, 2.6)
  const lean                    = deg(rng.range(-5, 5))

  parts.push(part(cyl(0.05, 0.07, height, 5), {
    at:     [ 0, height / 2, 0 ],
    rotate: [ deg(rng.range(-4, 4)), 0, lean ],
    color:  palette.deadWood,
    jitter: 0.13,
    rng,
  }))

  // Cross sticks near the foot, which is what keeps the pile off the ground.
  for (const y of [ 0.34, 0.62 ])
    parts.push(part(cyl(0.04, 0.04, 0.9, 4), {
      at:     [ 0, y, 0 ],
      rotate: [ 0, rng.range(0, Math.PI), deg(90) ],
      color:  palette.wood,
      jitter: 0.12,
      rng,
    }))

  // The hay, as narrowing cones — a stack shed rain by being conical, and the
  // steps between the cones are the courses it was piled in.
  const stack = 4
  const crown = height * 0.86

  for (const [ index, y ] of spread(stack, crown - 0.5).entries()) {
    const rise = (index + 0.5) / stack

    parts.push(part(cone(0.72 - rise * 0.42, 0.78, 7), {
      at:     [ rng.range(-0.05, 0.05), y + crown / 2 - 0.05, rng.range(-0.05, 0.05) ],
      rotate: [ deg(rng.range(-3, 3)), rng.range(0, Math.PI), deg(rng.range(-3, 3)) ],
      color:  rng.next() > 0.5 ? palette.hay : palette.hayDark,
      jitter: 0.2,
      rng,
    }))
  }

  return mergeParts(parts, { grime: 1.3, grimeFloor: 0.46 })
}
