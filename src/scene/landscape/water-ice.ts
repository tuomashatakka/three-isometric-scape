import { smoothstep } from 'threejs-scene'
import { MAX_DEPTH } from './shore-mask.ts'


/**
 * Where the winter shuts the water, as one answer two things read.
 *
 * Its own file rather than a chunk of `water.ts`, for the reason
 * `water-caps.ts` is its own file — and then for a second reason that file does
 * not have. The freeze is no longer only a shader effect. The sheet the lake
 * paints on itself decides where the *pack* stands: `landscape/packice.ts` puts
 * geometry on the water, and the one thing it must never do is stand a floe on
 * open sea.
 *
 * So the ice front is written once, here, in two forms of the same arithmetic —
 * {@link WATER_ICE_GLSL} for the surface and {@link iceCover} for the survey —
 * and the pair is what makes "the pack stops where the sheet stops" a fact
 * about the data rather than two numbers somebody keeps in step by hand. The
 * test beside this file holds them to it at the thresholds that matter.
 *
 * `water.ts` keeps the uniforms, because the uniforms are the lake's.
 */

/**
 * The floe field, on the cpu.
 *
 * The same three sines the chunk below carries, to the digit. Not a noise
 * lookup and not an approximation of one: a survey that agreed with the shader
 * to within a few per cent would put a plate of ice on water the surface draws
 * as open, at the one place — the edge of the pack — where the eye is looking.
 */
export function floeField (x: number, z: number, scale: number): number {
  const qx = x * scale
  const qz = z * scale

  return 0.5 + 0.34 * Math.sin(qx * 0.0545 + qz * 0.029) +
    0.26 * Math.sin(qz * 0.0788 - qx * 0.035) +
    0.16 * Math.sin((qx - qz) * 0.1394)
}

/**
 * How much of the authored pattern's world the scape is using.
 *
 * `terrain.size / archipelago.worldSize`, and it is the uniform's own
 * expression rather than a second opinion about it — see `uFloeScale` in
 * `water.ts`. Carried as a function so a caller with a config in hand cannot
 * get the ratio upside down.
 */
export function floeScale (terrainSize: number, worldSize: number): number {
  return worldSize > 0 ? terrainSize / worldSize : 1
}

/** Metres of water, as the shore mask's depth channel reads it: 0..1. */
export function depthUnit (metres: number): number {
  return Math.min(1, Math.max(0, metres / MAX_DEPTH))
}

/**
 * How much ice is lying on the water at a point, 0..1.
 *
 * The mirror of `scapeIce`, and the reason both are in this file. Depth is the
 * whole physics of it: a bank a foot deep gives its heat up in a week and a
 * sound five metres deep takes the season, so the freeze starts at the
 * shoreline and walks outward as the year deepens rather than arriving
 * everywhere at once.
 *
 * Monotone in `freeze` and nowhere else — which is what lets
 * {@link freezeToClose} run a bisection over it rather than a search.
 *
 * @param depth Water over the bed, 0..1, through {@link depthUnit}. The tide
 *   goes in here on the shader side; the survey asks about mean water, because
 *   a pack that reshuffled itself twice a day is not a survey.
 */
export function iceCover (
  x:      number,
  z:      number,
  depth:  number,
  freeze: number,
  reach:  number,
  broken: number,
  scale:  number,
): number {
  const shelter = 1 - reach * smoothstep(0, 0.55, depth)
  const local   = freeze * shelter * 1.7 + (floeField(x, z, scale) - 0.5) * broken

  return smoothstep(0.45, 0.85, local)
}

/**
 * The week of the winter at which the sheet over a point reaches a cover.
 *
 * Returned as a freeze, 0..1, because that is the quantity the year publishes
 * and the quantity every consumer of this already holds — and `Infinity` where
 * even a fully committed winter never gets there, which is the pack's own
 * refusal. Water too deep and too broken for the sheet to close is water no
 * floe stands on, at any week, and there is no flag anywhere saying so.
 *
 * Bisected rather than solved. `smoothstep` is invertible and the shelter term
 * is not the interesting part; twenty-four halvings land inside a ten-thousandth
 * of a year, which is finer than the season clock is ever sampled at, and the
 * whole search runs once at build.
 */
export function freezeToClose (
  x:      number,
  z:      number,
  depth:  number,
  cover:  number,
  reach:  number,
  broken: number,
  scale:  number,
): number {
  const at = (freeze: number): number => iceCover(x, z, depth, freeze, reach, broken, scale)

  if (at(1) < cover)
    return Infinity

  if (at(0) >= cover)
    return 0

  let low  = 0
  let high = 1

  for (let step = 0; step < 24; step += 1) {
    const mid = (low + high) * 0.5

    if (at(mid) >= cover)
      high = mid
    else
      low = mid
  }

  return high
}

/**
 * The freeze, shared verbatim by both stages of the lake's program.
 *
 * The vertex stage needs it to stop displacing water that has stopped moving
 * and the fragment stage needs it to paint what is lying there instead; two
 * approximations of the same ice front would show up as a swell running under a
 * shelf that is not rising with it.
 *
 * The 1.7 is what lets a fully committed winter push past the upper threshold
 * in the shallows while the middle is still open. `uFloeScale` grows the
 * authored 196-metre pattern with the inhabited world; without
 * it the old lobes repeat 2.65 times more often across the archipelago and read
 * as wallpaper instead of fractured coastal ice.
 *
 * Three sines rather than a noise fetch, because the vertex stage would
 * otherwise exceed the cheap tier's texture budget.
 */
export const WATER_ICE_GLSL = /* glsl */`
  uniform float uFreeze;
  uniform float uIceReach;
  uniform float uIceBreak;
  uniform float uFloeScale;

  float scapeFloe (vec2 p) {
    vec2 q = p * uFloeScale;
    return 0.5 + 0.34 * sin(q.x * 0.0545 + q.y * 0.029) +
      0.26 * sin(q.y * 0.0788 - q.x * 0.035) +
      0.16 * sin((q.x - q.y) * 0.1394);
  }

  float scapeIce (vec2 ground, float depth) {
    float shelter = 1.0 - uIceReach * smoothstep(0.0, 0.55, depth);
    float local   = uFreeze * shelter * 1.7 + (scapeFloe(ground) - 0.5) * uIceBreak;

    return smoothstep(0.45, 0.85, local);
  }
`
