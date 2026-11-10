/**
 * Rain that has stopped moving: the sky in wet ground, and the puddles in it.
 *
 * Wet ground used to be two arithmetic operations — darker albedo, smoother
 * film (`wetFragment` in `material.ts`) — and a smooth film with nothing to
 * reflect is only a darker ground. The scape has no environment map and does
 * not need one: the sea already mirrors the sky the atmosphere is drawing as two
 * colours a frame (`water-gleam.ts`), and a wet yard under the same overcast is
 * mirroring the same two colours. So every wet surface takes a Fresnel share of
 * that sky, and where the ground is level and low the film becomes standing
 * water — mirror-flat, dark-bedded, and the brightest thing on a rained-on
 * yard.
 *
 * The hollows are the wear map's (`ground.wear`), read as a height: the broad
 * damp patches the soil already carries, plus one more read of the same map at
 * puddle scale ({@link PUDDLE_TILE}) — the one fetch this costs, and only on the
 * full ground program — with the fine grain ragging the shoreline so a puddle
 * is not the outline of a noise octave. The lite program
 * reads no wear map, so a phone gets the sheen and no puddles: a graceful
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
 * How bright the sky in a film of water is against the sky itself.
 *
 * Above the Fresnel figure on purpose, for the reason `KEY_GLITTER` is above
 * one on the sea: a real puddle from standing height is at a grazing angle and
 * nearly a mirror, and the eye the scape stands at (`EYE_GLSL`) is higher than
 * a person. At 0.02 the reflection is physically right for that eye and reads
 * as nothing; this is what a photograph from a mast keeps of it.
 */
export const SKY_SHEEN = 8.0

/**
 * The water line in the wear map's units for a wetness, 0..1.
 *
 * A hollow deeper than this holds water. Above the deepest hollow at `wet` 0,
 * so a dry ground has none — see `puddle.test.ts` for the coverage it gives.
 */
export function puddleLevel (wet: number): number {
  return PUDDLE_DRY - PUDDLE_FILL * Math.min(1, Math.max(0, wet))
}

export const PUDDLE_PARS_FRAGMENT = /* glsl */`
  uniform vec3 uSkyHorizon;
  uniform vec3 uSkyTop;
`

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

/**
 * The sky in it, added to the light leaving the surface.
 *
 * Not folded into the albedo: a reflection is light arriving at the eye, and in
 * `diffuseColor` it would be shaded by the sun a second time. The wet film
 * mirrors a little and blurred (its share is the film's, scaled by how smooth
 * it got); a puddle mirrors all the Fresnel term gives it. The sky is the one
 * the sea mirrors, so a puddle and the sound beside it cannot disagree about
 * the weather; the cloud overhead shades it the way it shades the sea.
 */
export const SHEEN_FRAGMENT = /* glsl */`
  {
    vec3 scapeView   = scapeEye();
    float scapeFace  = clamp(dot(normalize(normal), scapeView), 0.0, 1.0);
    float scapeFres  = 0.02 + 0.98 * pow(1.0 - scapeFace, 5.0);
    float scapeShine = (scapeWet * 0.08 + scapePuddle) * (1.0 - scapeSnow);
    vec3 scapeSky    = mix(uSkyHorizon, uSkyTop, scapeFace) * scapeCloudShade(vScapeGround);

    outgoingLight += scapeSky * scapeFres * scapeShine * ${SKY_SHEEN.toFixed(2)};
  }
  #include <opaque_fragment>
`
