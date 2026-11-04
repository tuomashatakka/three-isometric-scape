/**
 * The wind on the water, at the distance it is seen.
 *
 * From a kilometre up the eye cannot resolve a wave; what it resolves on a sea
 * is the **texture of the surface**: long rows of water the wind has roughened
 * lying beside rows it has not, and glassy lees behind every island where the
 * gust never touches down. A rough patch mirrors a higher, darker part of the
 * sky through facets turned every way and spreads the sun's lobe wide; a slick
 * mirrors the bright sky at the horizon and holds the lobe tight. That contrast
 * is what an aerial photograph of a coast is made of — and without it the sound
 * was one even plate at every frame wider than its swell (`SWELL_REPEATS`).
 *
 * One scalar per fragment, `chop`: 0 glass, 1 the wind's full roughness. Three
 * readers take it, all inside the lake's existing chunks:
 *
 * - **the roughness** — `SLICK_GLASS` to `SLICK_CHOP`, where `water.roughness`
 *   used to be one number for the whole sea. The mean sits where the knob did
 * - **the mirror** — a rough facet mirrors a part of the sky further from the
 *   horizon, and at a grazing eye reflects less of it (`skyChop` below)
 * - **the ripple** — a slick has had its capillary waves damped flat, so the
 *   ripple normal is scaled down in it
 *
 * The field is the lake's own fractal noise (`water.wave`), read in the wind's
 * frame and stretched along it, so the rows lie down the wind and drift with
 * `wind.travel`. The lee is the shelter map the lake already fetches. Nothing
 * here is a knob: how much of the sea is rough is the wind's strength, and
 * which part is the wind's bearing and the coast's shape.
 */

import { smoothstep } from 'threejs-scene'

// Metres per tile of the field down the wind, and across it. The noise has
// five cells to a tile, so patches run ~300 m long and ~120 m wide: streaked
// down the wind, not ruled across it — at 4:1 the rows read as corrugation.
export const SLICK_ALONG  = 1500
export const SLICK_ACROSS = 600

// Tiles of drift per metre of `wind.travel` — the rows move with the air
// over them, far slower than the ripple because they are far larger.
export const SLICK_DRIFT = 0.25 / SLICK_ALONG

/** The surface roughness of a slick, and of water the wind has fully up. */
export const SLICK_GLASS = 0.48
export const SLICK_CHOP  = 0.8

/**
 * Where the cut through `water.wave` sits, from a calm to a gale.
 *
 * Measured off the map, not off nought-to-one: at this seed its tenth, half
 * and ninetieth percentiles are 0.26, 0.42 and 0.62 (`water-slick.test.ts`
 * reads them). 0.56 leaves about a fifth of the sea rough in a calm — a still
 * is a calm, and a calm still has cat's paws on it — and 0.26 nearly all of it
 * in a gale.
 */
const CALM_CUT = 0.56
const GALE_CUT = 0.26

/** Half the width of the ramp between a slick and the chop, in field units. */
const EDGE = 0.1

// How much of a full lee the gust is kept off. Never all: a sheltered bay
// still takes the odd cat's paw.
const LEE_CALM = 0.85

/** The cut for this much wind, `wind.strength` as the wind module resolves it. */
export function slickCut (strength: number): number {
  return CALM_CUT + (GALE_CUT - CALM_CUT) * smoothstep(0, 1.5, Math.max(0, strength))
}

/**
 * The cpu twin of `scapeSeaChop`: how rough the surface is where the field
 * reads `field` and the shelter map reads `lee`, under a cut from
 * {@link slickCut}.
 */
export function seaChop (field: number, lee: number, cut: number): number {
  return smoothstep(cut - EDGE, cut + EDGE, field) * (1 - LEE_CALM * lee)
}

/**
 * The field and the chop, as the lake's colour fragment reads them.
 *
 * `full` reads the field through both untile lattices; the phone's lake reads
 * one, which is the read it saves by letting the ripple go to its mean at the
 * wide frames where this field is what is left to see. `uSwell` is the wind's
 * bearing as a unit vector, set by the swell already.
 */
export function seaChopGlsl (full: boolean): string {
  const read = full ? 'scapeUntiled(uWaveMap, uv)' : 'texture2D(uWaveMap, uv).r'

  return /* glsl */`
  uniform vec2 uSlick;

  float scapeSeaChop (vec2 p, float lee) {
    vec2 uv = vec2(
      dot(p, uSwell) * ${(1 / SLICK_ALONG).toFixed(7)} - uSlick.x,
      (p.x * uSwell.y - p.y * uSwell.x) * ${(1 / SLICK_ACROSS).toFixed(7)}
    );
    float field = ${read};
    return smoothstep(uSlick.y - ${EDGE.toFixed(2)}, uSlick.y + ${EDGE.toFixed(2)}, field)
      * (1.0 - ${LEE_CALM.toFixed(2)} * lee);
  }
`
}

/** The surface's own roughness for that chop. */
export const SLICK_ROUGHNESS_GLSL =
  `mix(${SLICK_GLASS.toFixed(2)}, ${SLICK_CHOP.toFixed(2)}, seaChop)`

/**
 * What a rough facet does to the mirror: it looks further up the dome — so
 * `facing` is pulled toward the zenith — and at a grazing eye it presents
 * steeper faces, so less of what it sees is reflected. Returns
 * `vec2(facing, reflectance gain)`.
 */
export const SKY_CHOP_GLSL = /* glsl */`
  vec2 skyChop = vec2(mix(facing, 0.6 + 0.4 * facing, seaChop), mix(1.2, 0.6, seaChop));
`

/** The body's gain: a slick reads deep and dark, the chop pale. Mean ~1. */
export const SLICK_BODY_GLSL = 'mix(0.8, 1.18, seaChop)'

/** The ripple's gain: a slick's capillary waves are damped nearly flat. */
export const SLICK_RIPPLE_GLSL = '(0.3 + 0.95 * seaChop)'

/**
 * Repeats of the 34 m ripple tile a frame may hold before the ripple's albedo
 * sheen and its normal go to their mean. Past forty the tile is a few pixels and
 * reads as a print over the sea, which is the slicks' scale to draw instead —
 * and the two or four reads it skips pay for this field's one or two.
 */
export const RIPPLE_REPEATS = [ 16, 40 ] as const

/** Uniforms the lake hands its programs, set per frame by {@link setSlick}. */
type SlickType = { x: number, y: number }

export function setSlick (slick: SlickType, travel: number, strength: number): void {
  slick.x = travel * SLICK_DRIFT
  slick.y = slickCut(strength)
}
