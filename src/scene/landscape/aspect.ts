import { smoothstep } from 'threejs-scene'
import type { GroundNormal } from './height.ts'
import type { Vec2 } from './path.ts'


const DEGREES = Math.PI / 180

/**
 * Which way a slope is turned, and what a season of that does to it.
 *
 * The island has had a slope *magnitude* since the first terrain — it is what
 * puts granite on anything too steep to hold soil. What it has never had is a
 * slope *bearing*, and at this latitude the bearing is the stronger of the two
 * facts about a hillside: a face turned away from a sun that never climbs far
 * gets a fraction of the light the one opposite it does, so it stays damp, it
 * grows moss rather than grass, and it holds its snow for weeks after the other
 * side has lost it. A scape lit from one side and coloured from none reads as a
 * relief map with a lamp on it.
 *
 * Everything here is a pure function of the ground normal and the sun's transit
 * bearing, which is what lets the ground colour (built once, on the cpu) and the
 * snow line (resolved per fragment, on the gpu) run the same rule without
 * either being the other's authority. The shader half is `UP_WORLD_VERTEX` and
 * `seasonFragment` in `props/material.ts`; the comment there points back here.
 */

/**
 * The horizontal direction a fully shaded face points in, as a unit vector.
 *
 * Derived from `daylight.azimuth` — the bearing the sun transits on — rather
 * than from a hard-coded north, because the scape's compass is that knob and
 * nothing else. Turn the azimuth and the mossy side of every hill follows it
 * round, which is the behaviour a reader would expect and the one a fixed `-z`
 * would quietly not have.
 *
 * Note this is the season's sun rather than this instant's: lying snow and
 * standing moss are both the *average* of a year's light, and a shaded face
 * that swung round with the hour would be a hillside changing substance
 * between breakfast and noon.
 *
 * Writes into a caller-owned record for the reason `HeightField.normalAt` does:
 * the shader half resolves this every frame, and the material's update is
 * allocation-free.
 */
export function shadeDirection (azimuth: number, target: Vec2 = { x: 0, z: 0 }): Vec2 {
  const bearing = azimuth * DEGREES

  target.x = -Math.sin(bearing)
  target.z = -Math.cos(bearing)

  return target
}

/**
 * The grades a slope earns its aspect between.
 *
 * The first draft dotted straight against the normal's horizontal part, which
 * carries the steepness for free and is wrong at this scale: an island whose
 * peak is nine metres over a forty-metre radius runs at a fifth of a grade
 * almost everywhere, so *everything* came out at a fifth of the aspect it should
 * have had and the whole pass measured as `same` at every pose. The steepness
 * still gates the answer — a level field has no aspect and must not be given
 * one — but it gates it over the range this ground actually occupies rather than
 * over the whole way to a cliff.
 *
 * **Mirrored in `UP_WORLD_VERTEX` in `props/material.ts`.** The two halves of
 * this rule have to agree, and the shader's copy is the one that cannot import
 * a constant.
 */
const LEAN_FLOOR = 0.02
const LEAN_FULL  = 0.18

/**
 * How shaded a face is, -1..1. 1 is turned fully from the sun, -1 fully to it.
 *
 * The dot is taken against a normalised copy of the horizontal normal, so the
 * answer is a *bearing* rather than a bearing scaled by a steepness — and the
 * steepness comes back separately, shaped through {@link LEAN_FLOOR} and
 * {@link LEAN_FULL}, which is what stops a gentle island reading as a flat one.
 */
export function shadeAmount (normal: GroundNormal, direction: Vec2): number {
  const lean = Math.hypot(normal.x, normal.z)

  if (lean < 1e-4)
    return 0

  return (normal.x * direction.x + normal.z * direction.z) / lean *
    smoothstep(LEAN_FLOOR, LEAN_FULL, lean)
}

/**
 * How much of a season's damp a point holds, 0..1.
 *
 * A band rather than a threshold, and it has both ends. The bottom is the
 * waterline: the shore is scoured twice a day and nothing green stands on it.
 * The top is `terrain.aspectMoss`'s companion knob — above it the soil has
 * already thinned to heath and scree, and a moss painted onto bare granite is
 * the same mistake as a snow line painted onto the beach.
 */
export function dampBand (relative: number, line: number): number {
  // Floored rather than trusted: a zero line would collapse the upper fade to a
  // pair of equal edges, and a smoothstep across no interval is a step.
  const top = Math.max(0.5, line)

  return smoothstep(0, 0.6, relative) * (1 - smoothstep(top * 0.6, top, relative))
}
