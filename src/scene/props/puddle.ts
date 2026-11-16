/**
 * Rain that has stopped moving: the puddles in wet ground.
 *
 * The wet film is `runoff.ts`; where the ground is level and low the film
 * becomes standing water — mirror-flat and dark-bedded. What it mirrors is the
 * sky every standard program already reflects (`SKY_MIRROR` in
 * `sky-light.ts`), at the Fresnel the eye's angle gives it. This module used to
 * add a sky sheen of its own at eight times that Fresnel, written before the
 * programs had a sky to reflect; on top of the mirror it doubled the sky, and a
 * rained-on island read from the default zoom as an island under snow. Wet
 * ground from a mast is *darker* than dry, with the sky in it as a glint.
 *
 * The hollows are the wear map's (`ground.wear`), read as a height: the broad
 * damp patches the soil already carries, plus one more read of the same map at
 * puddle scale ({@link PUDDLE_TILE}) — the one fetch this costs, and only on the
 * full ground program — with the fine grain ragging the shoreline so a puddle
 * is not the outline of a noise octave. The lite program
 * reads no wear map, so a phone gets the film and no puddles: a graceful
 * absence, not a different look.
 *
 * Pure strings and one pure function, so the threshold the shader uses and the
 * coverage the test measures cannot drift apart.
 */

/** The wear map's depth at which the first water stands, on ground soaked through. */
export const PUDDLE_DRY = 0.19

/** How far the water line rises through the hollows per unit of `weather.wet`. */
export const PUDDLE_FILL = 0.165

/**
 * How many puddle tiles to one wear tile. The wear map's own patches are some
 * eighteen metres across — wider than the yard frame, so read at its own scale
 * a hollow is the whole picture or none of it. Read again six times finer it
 * is a few metres of low ground, which is the size of water a cart track holds.
 */
export const PUDDLE_TILE = 6

/** The broad wear's share of the hollow; the rest is the puddle-scale read. */
export const PUDDLE_BROAD = 0.3

/** How much of the grain's ±0.5 is added to the hollow, to rag the shoreline. */
export const PUDDLE_RAG = 0.06

/** Water stands only where the ground faces the sky this squarely (world normal y). */
export const PUDDLE_LEVEL: readonly [number, number] = [ 0.85, 0.95 ]

/**
 * Metres above the bare terrain past which nothing holds a puddle.
 *
 * The props draw with the ground's material, so without this a flat stone top,
 * a roof ridge and a fence rail all filled with water before the yard did. The
 * terrain's own height is already on the gpu — the sky map's blue channel
 * (`sky-occlusion.ts`) — so the question costs one fetch the sky shade makes
 * anyway, at a 16 cm quantum the band is wider than.
 */
export const PUDDLE_BED: readonly [number, number] = [ 0.18, 0.4 ]

/**
 * The water line in the wear map's units for a wetness, 0..1.
 *
 * A hollow deeper than this holds water. Above the deepest hollow at `wet` 0,
 * so a dry ground has none — see `puddle.test.ts` for the coverage it gives.
 */
export function puddleLevel (wet: number): number {
  return PUDDLE_DRY - PUDDLE_FILL * Math.min(1, Math.max(0, wet))
}

/**
 * Where water stands, declared before the detail reads the wear map so the
 * programs without one still compile it as dry ground.
 */
export const PUDDLE_DECLARE = /* glsl */`
  float scapeHollow = -1.0;
`

/**
 * The hollow for a puddle-scale wear sample, the broad wear and the grain, all
 * as the shader has them (`pool` and `broad` −0.5..0.5, `grain` 0..1). Deeper
 * is larger.
 */
export function hollowAt (pool: number, broad: number, grain: number): number {
  return -((1 - PUDDLE_BROAD) * pool + PUDDLE_BROAD * broad) + (0.5 - grain) * PUDDLE_RAG
}

/** Set inside the wear read, where `wear` (−0.5..0.5), `wearUv` and `grain` are in hand. */
export const PUDDLE_HOLLOW = /* glsl */`
    float scapePool = texture2D(uWearMap, wearUv * ${PUDDLE_TILE.toFixed(1)}).r - 0.5;
    scapeHollow = -(${(1 - PUDDLE_BROAD).toFixed(2)} * scapePool + ${PUDDLE_BROAD.toFixed(2)} * wear) +
      (0.5 - grain) * ${PUDDLE_RAG.toFixed(3)};
`

/**
 * After the wet film, before the season: standing water is under snow.
 *
 * The normal goes back to the geometry's — a puddle is flat whatever the grit
 * under it is doing — and the bed goes darker than wet soil, because the light
 * that reaches it has crossed the water twice.
 */
export const PUDDLE_FRAGMENT = /* glsl */`
  vec4 scapeBedMap  = texture2D(uSkyMap, (vScapeGround - uSkyRect.xy) * uSkyRect.zw);
  float scapeOnBed  = 1.0 - smoothstep(${PUDDLE_BED[0].toFixed(2)}, ${PUDDLE_BED[1].toFixed(2)},
    scapeAltitude - (uSkyRange.x + scapeBedMap.b * uSkyRange.y));
  float scapePuddle = scapeOnBed * smoothstep(0.0, 0.025,
    scapeHollow - (${PUDDLE_DRY.toFixed(3)} - ${PUDDLE_FILL.toFixed(3)} * uWetAmount)) *
    smoothstep(${PUDDLE_LEVEL[0].toFixed(2)}, ${PUDDLE_LEVEL[1].toFixed(2)}, vScapeFace.x) *
    step(0.001, uWetAmount);

  diffuseColor.rgb *= 1.0 - 0.7 * scapePuddle;
  roughnessFactor   = mix(roughnessFactor, 0.03, scapePuddle);
  normal            = normalize(mix(normal, normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0)), scapePuddle));
`
