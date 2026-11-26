/**
 * The light the water gives back.
 *
 * Its own file rather than a seventh chunk of `water.ts`, for the reason
 * `water-caustics.ts` is its own file — and it is that file's exact complement.
 * The caustics are the light that goes *through* the surface and lands on the
 * bottom; everything here is the light that never got in: the sky the sea
 * mirrors, the track whichever body is up lays across it, and the cold fire in
 * the water that has been torn. One injection, one constant, two pure functions
 * and one fragment. `water.ts` keeps the uniforms, because the uniforms are the
 * lake's.
 *
 * The seam is where it is because of the night half. A dark sea is not a black
 * one, and it has **two** ways of showing itself which are never both fully on:
 *
 * - **the track**, when there is a moon. The specular lobe the open sea already
 *   lays under the sun is aimed at whichever body the key light is coming from
 *   — see `keyPlace` in [`daylight.ts`](src/scene/daylight.ts) — so a risen moon
 *   has always had a path on the water pointed at it. What it never had was a
 *   term in front of it above zero
 * - **the fire**, when there is not. Broken water on a northern coast burns:
 *   the plankton in it light when they are torn, so the surf, the wash at the
 *   waterline and a boat's own wake carry a glow that nothing on the flat
 *   between them has
 *
 * The coupling between them is the whole design rather than a tidiness: a moon
 * bright enough to lay a track is a moon bright enough to wash the fire out of
 * the water under it, which is what {@link phosphorAmount} spends `moon` on. So
 * the two terms hand the night back and forth over a lunation, and no fragment
 * ever pays for both at once.
 */


import { SKY_CHOP_GAIN_GLSL } from './water-slick.ts'
import { MIRROR_CLOUD_BASE, MIRROR_CLOUD_LIT, MIRROR_RISE_FLOOR } from '../cloud-shadow.ts'

/**
 * How much of a noon sun's worth of moonlight washes the fire out of the water.
 *
 * In the share-of-the-noon-sun units `DaylightState.moon` is in, and read
 * against `daylight.moonStrength` at 0.16: a waning gibbous 80 % lit and 35° up
 * — the tour's own night clock — puts 0.128 on the coast, which is past this
 * and takes the fire out entirely, and the quench lets go somewhere around a
 * half moon low down. That is the intended shape rather than a wide gate: the
 * fire is a *moonless* phenomenon, and the nights it has are the fortnight
 * either side of the new moon. It is an absolute rather than a share of the
 * key light, because "can you see a faint glow" is a question about how much
 * light is actually falling on the water and not about which body it came from
 * — at midnight the moon owns the whole key share whether it is full or a
 * fingernail, so a quench read off the share would be total either way.
 */
const MOON_QUENCH = 0.09


/** The two leaves the glint is read from. */
interface GlintConfig {
  mirror:    number
  moonTrack: number
  sparkle:   number
}

/** The sun's glitter: its own leaf at a full mirror, so the one mirror row turns it too. */
export function sunGlint (water: GlintConfig): number {
  return water.sparkle * water.mirror
}

/** The moon's share of the glint: a share of the sun's glitter, so one row turns both. */
export function moonGlint (water: GlintConfig): number {
  return water.moonTrack * sunGlint(water)
}

/**
 * The specular budget the key light has on the water.
 *
 * `day` and `moon` are `DaylightState`'s own, which is what makes every way
 * this can be zero a fact about the sky rather than a second switch: the moon
 * has to be up, lit, and out of the sun's way before `moon` is anything at all,
 * and `daylight.moonStrength: 0` takes it back to nothing.
 *
 * `share` is `water.moonTrack` — what the moon's own reflection is worth
 * against the sun's. It is well above one because the two are not in the same
 * units as far as the eye is concerned: `moon` is light *falling on the coast*
 * and this is a mirror image of a disc, and there is no adaptation anywhere in
 * this pipeline to stand in for a pupil that has been open for an hour.
 *
 * **Not clamped at a full sun.** The glint is a facet density times a Fresnel
 * of a few per cent (see {@link beckmann}), so a budget that stops at 1 stops
 * at a sheen; a night sea has no bright water to blow out, which is the whole
 * reason a ceiling would be there. The pixel's own ceiling is
 * {@link GLINT_CEILING}.
 *
 * Daylight is untouched at any setting of it — at noon `moon` is zero by
 * construction, so the sun's own path is exactly the path it always was.
 */
export function trackAmount (day: number, moon: number, share: number): number {
  return Math.max(0, day) + Math.max(0, moon) * Math.max(0, share)
}

/**
 * How hard the broken water burns, 0..1.
 *
 * Three terms, each of which can take it to nothing on its own: the strength
 * (`water.phosphor`, and the only switch there is), the dark (the same
 * astronomical-twilight gate the stars and the aurora open on, so there is no
 * sea fire in a midsummer midnight at this latitude and none at all in the
 * daylight half of the cycle), and the moon (see {@link MOON_QUENCH}).
 */
export function phosphorAmount (dark: number, moon: number, strength: number): number {
  if (strength <= 0)
    return 0

  const quench = Math.min(1, Math.max(0, moon) / MOON_QUENCH)

  return Math.min(1, strength) * Math.min(1, Math.max(0, dark)) * (1 - quench)
}


/**
 * The fire, as the fragment draws it.
 *
 * Injected into the reflection chunk beside the glitter, and additive for the
 * same reason that one is: this is light leaving the water rather than a colour
 * the water has, so folding it into the albedo would have it shaded a second
 * time by a key light that is, on the nights this fires at all, almost nothing.
 *
 * `breakers` and `boatWake` are the colour fragment's own locals — chunks are
 * inlined into one `main`, so they are still in scope here. Reusing them rather
 * than re-deriving where the water is torn is what keeps the glow *on* the
 * white water: a second mask would drift off the surf on the first retune of
 * either, and a glow beside the breakers rather than in them is the one failure
 * this effect has.
 *
 * **Those two and no others, and that is a constraint rather than a choice.**
 * This chunk is injected into the lite program as well as the full one, and
 * `waterColorFragment(false)` declares a strictly smaller set of locals — it
 * has no `foam`, because the cheap tier draws no separate shore trim. Reaching
 * for one costs a shader that will not compile on the tiers that matter most,
 * and it fails as a scape that never finishes booting rather than as an error
 * anything reports. The shore trim is the wash at the waterline anyway, which
 * is a sheet of bubbles; a breaker is a wave being destroyed, and that is what
 * lights.
 *
 * The sparks are the same trick the glitter uses and deliberately **not** the
 * same field: two noise
 * fetches at incommensurate scales, multiplied and raised, mixed rather than
 * multiplied into the term so they break the glow into scales instead of
 * gating it out of existence. They ride `uRippleOffset`, so a still with
 * `wind.speed` at zero holds them where they stand and `STILL` gains nothing.
 */
export const WATER_PHOSPHOR_FRAGMENT = /* glsl */`
  if (uPhosphor > 0.001) {
    float torn = clamp(max(breakers, boatWake), 0.0, 1.0);

    vec2 fireUv  = vWaterGround * uSparkleScale * 0.7 - uRippleOffset * 2.4;
    float fA     = texture2D(uRippleMap, fireUv).r;
    float fB     = texture2D(uRippleMap, fireUv * 1.61 + uRippleOffset * 1.9).r;
    float sparks = mix(0.4, 1.0, pow(clamp(fA * fB * 1.5, 0.0, 1.0), 3.0));

    outgoingLight += uPhosphorColor * uPhosphor * torn * sparks * (1.0 - iceCover);
  }
`


/**
 * Fresnel, and the sky the water borrows off it.
 *
 * The one term that decides whether a surface reads as water or as coloured
 * paint, and it is nearly free. Water reflects almost nothing when you look
 * straight down it — about two per cent — and almost everything at a grazing
 * angle, and an isometric camera spends its whole life at grazing angles, so
 * this is doing real work across most of the frame rather than at the edges.
 * Schlick's approximation is the standard cheap form of it and it is exact
 * enough that nobody has ever been able to tell.
 *
 * Injected before `opaque_fragment` rather than into the albedo, because a
 * reflection is light arriving at the eye and not a property of the surface:
 * folded into `diffuseColor` it would be shaded by the sun a second time and go
 * dark on the side of a wave facing away. `outgoingLight` already exists by
 * this point in three's chain, and so do the locals the water body declared —
 * chunks are inlined into one `main`, so `waterDepth` is still in scope here.
 *
 * The sky it reflects is the sky the atmosphere is actually drawing, handed
 * down as two colours per frame rather than sampled a second time, so the sea
 * can never mirror a sky the reader is not looking at.
 */
/**
 * The sea's slopes, as a distribution rather than as a lobe.
 *
 * The glitter was Blinn-Phong with an exponent picked by hand, stretched along
 * the sun's bearing by hand and given an elevation envelope by hand — three
 * guesses at what a wind-roughened surface does. Cox and Munk measured it from
 * aircraft in 1954: the sea's slopes are near-Gaussian with a variance that
 * rises with the wind, about `0.003 + 0.00512 U` at a wind of `U` m/s, and a
 * slick (an oil or plankton film) damps it to under half. So the sun on the sea
 * is a Beckmann distribution of facets with that variance, and the long path a
 * low sun lays and the small spot a high one does fall out of it — no envelope.
 *
 * And the variance is shared between the map and the lobe. Close in, the ripple
 * normal already tilts each pixel — those slopes are resolved, and the lobe must
 * only carry what is under a pixel, so the sun breaks into scales. From the
 * archipelago the ripple has filtered to its mean and every slope is under the
 * pixel, so the whole variance goes into the lobe and the sun lies on the sea
 * as the broad sheen an aerial photograph shows (LEAN mapping, in one line).
 */
export const GLINT_SLICK = 0.012
export const GLINT_CHOP  = 0.04

/** The frame widths (metres) over which the ripple's slopes pass from the map into the lobe. */
export const GLINT_RESOLVED: readonly [number, number] = [ 14, 160 ]

/** The lobe's share of the variance in a frame that resolves the ripple. */
export const GLINT_NEAR_SHARE = 0.3

/** How much of the swell's tilt the wide frame's glint spreads into the lobe rather than draws. */
export const GLINT_SWELL_SPREAD = 0.75

/** The brightest a glint pixel is allowed, in units of the key light: no single facet blows out. */
export const GLINT_CEILING = 3

const smooth01 = (low: number, high: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)))

  return t * t * (3 - 2 * t)
}

/** The slope variance the lobe carries for a chop 0..1 in a frame `metres` wide — the glsl's twin. */
export function glintVariance (chop: number, metres: number): number {
  const total = GLINT_SLICK + (GLINT_CHOP - GLINT_SLICK) * Math.min(1, Math.max(0, chop))
  const share = GLINT_NEAR_SHARE + (1 - GLINT_NEAR_SHARE) * smooth01(GLINT_RESOLVED[0], GLINT_RESOLVED[1], metres)

  return total * share
}

/** Beckmann's facet density for a half-vector at `cosH` to the normal, slope variance `variance`. */
export function beckmann (cosH: number, variance: number): number {
  const c2 = Math.max(cosH * cosH, 1e-6)

  return Math.exp((c2 - 1) / (c2 * variance)) / (Math.PI * variance * c2 * c2)
}

export const WATER_REFLECTION_FRAGMENT = /* glsl */`
  {
    // Where the eye is, not only which way it looks — see \`EYE_GLSL\` in
    // frame.ts. The mirror takes more sky toward the far edge of the frame, and
    // the glitter lands in one patch rather than evenly over the sound.
    vec3 viewDir    = scapeEye();
    float facing    = clamp(dot(normalize(normal), viewDir), 0.0, 1.0);
    float fresnel   = 0.02 + 0.98 * pow(1.0 - facing, 5.0);

    // The sky along the reflected ray, not a guess at it. The ray is reflected
    // about the normal the swell and the ripple have already bent, and taken
    // back to world space (a direction transforms by the rotation alone, and a
    // vector on the left of a rotation is its transpose), so how high it climbs
    // is read off the world's own up: a wave face turned to the eye mirrors the
    // bright horizon and the face behind it the darker dome above, and the
    // ranks of the swell read in the mirror as they do on a real sea.
    //
    // Then the deck: the ray is followed up to a cloud base \`MIRROR_DECK\` metres
    // over the water and the cloud field is read where it arrives — the same
    // map, drift and bank the shadows are cast from. So the clouds the sea
    // mirrors are the clouds that are up there, displaced from their own
    // shadows the way a mirror displaces them, and every ripple tilts the ray
    // by a few degrees and drags the reflection metres along it: a cloud's
    // image in the water is broken into the wind's streaks, not stamped on it.
    // A rough patch mirrors a higher, darker part of the dome (\`seaChop\`).
    vec3 skyRay  = (vec4(reflect(-viewDir, normalize(normal)), 0.0) * viewMatrix).xyz;
    float rise   = max(skyRay.y, ${MIRROR_RISE_FLOOR.toFixed(2)});
    vec3 sky     = mix(uSkyHorizon, uSkyTop, pow(min(rise, 1.0), mix(0.75, 0.45, seaChop)));
    vec3 deckRay = (vec4(reflect(-viewDir, deckNormal), 0.0) * viewMatrix).xyz;
    float deck   = scapeCloudMirror(vWaterGround, deckRay);
    float bright = dot(uSkyHorizon, vec3(0.2126, 0.7152, 0.0722));
    vec3 base    = vec3(bright) * ${MIRROR_CLOUD_BASE.toFixed(2)} + uSunColor * ${MIRROR_CLOUD_LIT.toFixed(2)} * max(uSunDir.y, 0.0);
    sky          = mix(sky, base, deck) * swellShade;

    // Only over water deep enough to have a surface, and never over ice, which
    // is rough and scatters rather than mirrors.
    float mirror = fresnel * ${SKY_CHOP_GAIN_GLSL} * uMirror *
      smoothstep(0.0, 0.35, waterDepth);

    outgoingLight = mix(outgoingLight, sky, clamp(mirror, 0.0, 0.82));

    // The key light's glint: Cox–Munk facets, a Beckmann density over the
    // half-vector with the slope variance the ripple map does not already
    // resolve in this frame (see \`glintVariance\`). The radiance is the
    // microfacet one, D·F/(4·N·V), with Fresnel at the half-angle; the long path
    // of a low sun and the small spot of a high one are the distribution's, not
    // an envelope's.
    if (uSunDir.y > 0.01 && uTrack > 0.01) {
      // The sun into the view space the normal lives in (a direction turns by
      // the rotation alone); uSunDir is world space.
      vec3 sunView = normalize(mat3(viewMatrix) * uSunDir);
      vec3 halfVec = normalize(viewDir + sunView);
      float wide   = smoothstep(${GLINT_RESOLVED[0].toFixed(1)}, ${GLINT_RESOLVED[1].toFixed(1)}, scapeFrameMetres());
      // The swell's facets are resolved geometry, but its trains are regular:
      // a lobe tight on them rules the wide sheen into stripes. From the
      // archipelago most of the swell's tilt goes into the spread instead.
      vec3 glintNormal = normalize(mix(normalize(normal), deckNormal, wide * ${GLINT_SWELL_SPREAD.toFixed(2)}));
      float cosH   = max(dot(glintNormal, halfVec), 1e-3);
      float slopes = mix(${GLINT_SLICK.toFixed(3)}, ${GLINT_CHOP.toFixed(3)}, seaChop) * mix(${GLINT_NEAR_SHARE.toFixed(2)}, 1.0, wide);
      float c2     = cosH * cosH;
      float facets = exp((c2 - 1.0) / (c2 * slopes)) / (3.14159 * slopes * c2 * c2);
      float fH     = 0.02 + 0.98 * pow(1.0 - max(dot(viewDir, halfVec), 0.0), 5.0);
      float glint  = min(facets * fH / (4.0 * max(facing, 0.1)), ${GLINT_CEILING.toFixed(1)});

      // Two noise fields at the sparkle's scale break the near glint into the
      // scales the ripple's crests catch; once those are under the pixel they
      // are their own mean, and the wide frame keeps the sheen whole.
      vec2 sparkUv = vWaterGround * uSparkleScale;
      float gA     = texture2D(uRippleMap, sparkUv + uRippleOffset * 2.1).r;
      float gB     = texture2D(uRippleMap, sparkUv * 1.37 - uRippleOffset * 1.63).r;
      float broken = mix(mix(0.35, 1.0, pow(clamp(gA * gB * 1.42, 0.0, 1.0), 5.0)), 1.0, wide);

      // Light arriving at the eye, so added after the mirror; never on ice or
      // dry land, and never through a cloud's shadow.
      outgoingLight += uTrackColor * glint * broken * uTrack * openWater * (1.0 - iceCover) * cloudShade;
    }

${WATER_PHOSPHOR_FRAGMENT}
  }
`
