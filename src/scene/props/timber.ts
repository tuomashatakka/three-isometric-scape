import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { part } from 'threejs-scene/modules/assets'
import { box, spread } from './primitives.ts'


/**
 * The timber vocabulary every gabled building in the scape is assembled from.
 *
 * These live apart from the buildings themselves because the farmstead is no
 * longer the only place that builds one: the meadow barn up on the pasture is
 * the same construction in weathered grey, and a second copy of the roof
 * trigonometry is a second place for it to be wrong.
 *
 * Every helper writes into a caller-owned `parts` array in the prop's local
 * space, base at `y = 0`, long axis on `x`.
 */

/**
 * Vertical board cladding — the single detail that makes a wall read as timber.
 *
 * `baseY` lifts the run onto a floor: a barn standing on corner stones is clad
 * from the sill up, not from the ground.
 */
export function claddingPlanks (
  parts:  BufferGeometry[],
  rng:    SeededRng,
  color:  string,
  count:  number,
  span:   number,
  height: number,
  depth:  number,
  z:      number,
  baseY = 0,
): void {
  const width = span / count * 0.92

  for (const x of spread(count, span - width))
    parts.push(part(box(width, height, depth), {
      at:     [ x, baseY + height / 2, z ],
      color,
      jitter: 0.09,
      rng,
    }))
}

/** A stepped gable end — four courses standing in for a triangle. */
export function gableSteps (
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
export function gabledRoof (
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
