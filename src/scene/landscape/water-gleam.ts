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
 * **Not clamped at a full sun, and that is measured rather than assumed.** At
 * this camera the glitter term is worth about nineteen levels out of 255 at its
 * own maximum — the lobe is a mirror lobe, the fresnel at an isometric tilt is
 * a tenth, and the elevation envelope takes half of what is left — so a budget
 * that stops at 1 stops at a sheen. A night sea has no bright water to blow
 * out, which is the whole reason the ceiling was there.
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
 * `WATER_COLOR_FRAGMENT_LITE` declares a strictly smaller set of locals — it
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
 * How hard the key light's own reflection is laid over the sea.
 *
 * Above one deliberately: every factor in the glitter term is a fraction, and
 * six of them multiplied together land well under what the eye reads as a sun
 * on water, even once the lobe is wide enough to exist at all.
 *
 * `SUN_GLITTER` until the lobe was allowed to fire at night. What is at the far
 * end of it is whichever body `keyPlace` put the light on, so the name it had
 * was true of the only hours it was ever switched on rather than of the term.
 */
const KEY_GLITTER = 2.6


export const WATER_REFLECTION_FRAGMENT = /* glsl */`
  {
    vec3 viewDir    = normalize(vViewPosition);
    float facing    = clamp(dot(normalize(normal), viewDir), 0.0, 1.0);
    float fresnel   = 0.02 + 0.98 * pow(1.0 - facing, 5.0);

    // Toward the horizon at grazing angles and toward the zenith looking down,
    // which is what the reflected ray would have found anyway. Cheaper than
    // reflecting the vector and sampling, and at this camera's range of angles
    // the two are within a shade of each other.
    vec3 sky = mix(uSkyHorizon, uSkyTop, facing);

    // Only over water deep enough to have a surface, and never over ice, which
    // is rough and scatters rather than mirrors.
    float mirror = fresnel * uReflectionStrength *
      smoothstep(0.0, 0.35, waterDepth);

    outgoingLight = mix(outgoingLight, sky, clamp(mirror, 0.0, 0.82));

    // The key light's glitter path. A low body over water lays a bright,
    // wind-stretched
    // highlight from the horizon toward the viewer — the single most
    // recognisable thing about water at golden hour. The perturbed ripple
    // normal from WATER_NORMAL_FRAGMENT is already in scope, and so are
    // waterDepth, iceCover and openWater from the colour fragments.
    //
    // The lobe is Blinn-Phong: reflect the view about the ripple normal and
    // test against the sun. The exponent tracks sun elevation inversely — low
    // sun widens the lobe into a long streak, high sun tightens it to a disc.
    // The two-noise-field glint from the albedo is recomputed at the same UV
    // scale so the sun catches the same facets the ambient sparkle already
    // lights, and the product of lobe × noise is near zero almost everywhere:
    // only a scatter of isolated facets fires, which is how a glitter path
    // actually reads from any orbit angle.
    float sunElev = uSunDir.y;
    if (sunElev > 0.01 && uTrack > 0.01) {
      // The sun has to be brought into the space the normal is already in.
      // normal and vViewPosition in a standard-material fragment are VIEW
      // space; uSunDir is copied straight off the daylight sample and is
      // WORLD space. Building a half-vector out of one of each compares two
      // directions that do not live in the same room, so the lobe was tested
      // against a bearing that meant nothing and never fired — which is why the
      // fresnel half of this chunk worked and the sun half did not: that half
      // is view-space throughout and never had to cross.
      //
      // A direction transforms by the rotation alone, so the upper 3x3 of
      // viewMatrix is the whole conversion. Elevation stays read off the
      // world vector, because "how high is the sun" is a fact about the sky
      // rather than about where the reader happens to be standing.
      vec3 sunView = normalize(mat3(viewMatrix) * uSunDir);
      vec3 halfVec = normalize(viewDir + sunView);
      float NdotH  = max(dot(normal, halfVec), 0.0);

      // Tight highlight. Low sun → lower exponent → wider lobe → longer
      // glitter path. High sun → higher exponent → small bright disc. The
      // 128/512 range keeps the path visible from golden hour through noon.
      // A rippled sea is not polished metal. 128 to 512 is a mirror exponent —
      // it holds the whole lobe within a couple of degrees of the exact mirror
      // direction, which a surface this broken almost never presents. The ripple
      // normal already supplies the variation, so the lobe wants to be wide
      // enough that a patch of sea can actually hold it.
      float exponent = mix(24.0, 120.0, smoothstep(0.0, 0.5, sunElev));
      float spec = pow(NdotH, exponent);

      // Stretch the lobe along the sun's horizontal azimuth when the sun is
      // low. The glitter path is narrow cross-path but long along-path,
      // because the angle of incidence varies slowly along the sun's bearing
      // and rapidly across it. Projecting the half-vector onto the water
      // surface and measuring its alignment with the sun's horizontal
      // direction gives this stretch for free.
      vec2 sunHoriz = sunView.xz;
      float sunLen  = length(sunHoriz);
      if (sunLen > 0.001) {
        vec2 sunAz  = sunHoriz / sunLen;
        float align = abs(dot(normalize(halfVec.xz + 0.0001), sunAz));
        // At the horizon the stretch is full; overhead it vanishes and the
        // lobe is round — which is exactly the difference between a path and
        // a spot.
        spec *= mix(1.0, mix(0.35, 1.0, align), smoothstep(0.35, 0.0, sunElev));
      }

      // Same two-noise-field glint the albedo uses: the product is near zero
      // almost everywhere and spikes where both crests coincide, which is how
      // glints are actually distributed on water — isolated, and never a
      // pattern you can read. The UV scale matches the albedo sparkle so the
      // sun catches the same facets.
      vec2 sparkUv = vWaterGround * uSparkleScale;
      float gA = texture2D(uRippleMap, sparkUv + uRippleOffset * 2.1).r;
      float gB = texture2D(uRippleMap, sparkUv * 1.37 - uRippleOffset * 1.63).r;
      float facet = pow(clamp(gA * gB * 1.42, 0.0, 1.0), 5.0);

      // Elevation envelope: the path is brightest near the horizon where the
      // geometry stretches the reflection across a long band of water, and
      // fades to a small bright disc when the sun is overhead. The 0.1 floor
      // keeps a visible spot at zenith. uTrack is what the body at the far end
      // of the lobe is worth this hour, and it is what used to kill the whole
      // term at night: a moon and a sun subtend the same half-degree, so the
      // lobe itself needed nothing — only a term in front of it above zero.
      // The facet field BREAKS THE HIGHLIGHT UP — it does not gate it. Multiplying
      // directly is what made this invisible: the glitter field is near zero
      // almost everywhere by construction (that is what makes the ambient glint
      // read as isolated sparks rather than a sheet), and a 512-exponent lobe is
      // near zero everywhere but the exact mirror. Two sparse masks multiplied
      // together essentially never coincide, so the product was zero across the
      // whole sea. Mixed instead, it does the job it was wanted for: the path stays
      // continuous and the facets modulate it into scales rather than a smear.
      float broken = mix(0.35, 1.0, facet);

      // A low sun lays a long path and an overhead sun a small bright spot, so
      // this favours the low end — but it never reaches zero, because a midday
      // sun on water still has a highlight, and killing it outright was the
      // second reason nothing showed.
      float elevScale = mix(0.45, 1.0, smoothstep(0.45, 0.02, sunElev));

      // Additive: the sun's own specular reflection is light arriving at the
      // eye, separate from the ambient sky the fresnel already mixed in.
      // Fresnel makes it stronger at grazing angles, which is correct — the
      // glitter path is brightest where the sea is most mirror-like. openWater
      // keeps it off dry land; ice scatters rather than mirrors.
      outgoingLight += uTrackColor * spec * broken * fresnel * elevScale * ${KEY_GLITTER.toFixed(2)} *
        uTrack * openWater * (1.0 - iceCover);
    }

${WATER_PHOSPHOR_FRAGMENT}
  }
`
