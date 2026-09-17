import { smoothstep } from 'threejs-scene'


/**
 * The white the open sea puts on when it blows.
 *
 * Its own file rather than a seventh chunk of `water.ts`, for the reason
 * `water-caustics.ts` and `water-gleam.ts` are their own files: this is a
 * complete idea — a shader chunk, two lines of injection, one pure curve and one
 * pure vector — and the lake is already carrying the swell, the freeze, the
 * surf, the wakes, the net and the reflection. `water.ts` keeps the uniforms,
 * because the uniforms are the lake's.
 *
 * Until this the wind did everything to this archipelago except the one thing a
 * wind is *for*. The grass leans in it, the sails turn in it, the smoke leans in
 * it, the cloud decks run on it, the ripple scrolls on it and the surf marches
 * in on it — and the sound between the islands stayed the same unbroken sheet of
 * blue in a flat calm and in a near gale. A sea at force five is not a darker
 * sheet; it is a sheet with white torn off the top of it, in streaks that lie
 * downwind, everywhere the wind has had a run at the water and nowhere it has
 * not.
 *
 * Three terms, and the first of them costs nothing at all:
 *
 * **the coverage** is the wind, through {@link capsAmount}, resolved on the cpu
 * into one uniform. Whitecaps are a threshold phenomenon — a sea does not whiten
 * gradually from a calm, it starts breaking somewhere around force four and then
 * whitens fast — which is what `whitecapOnset` says and what makes a gust
 * visible on the water rather than merely present in the numbers.
 *
 * **the field** is the fractal map the surface is already bound to, read in a
 * frame turned into the wind and squashed along it, then thresholded — torn
 * streaks lying downwind, travelling on the same `wind.travel` the surf marches
 * in on, and going to their own average at a zoom too wide to hold one. One
 * dependent read, the same on both programs. What the scale of that read has to
 * be, and the three builds that got it wrong, are in {@link WATER_CAPS_GLSL}.
 *
 * **the fetch** is the half you can see from across the room, and it costs
 * nothing either. Wind does not raise a sea instantly — it raises it over
 * distance, measured *upwind* — so water tucked under the shore the wind is
 * blowing off has had no run at all and lies flat while the sound beyond it
 * breaks. The obvious build for that is a second probe of the bathymetry one
 * step up the wind, and it is the wrong one: the mask fetch the surface has
 * *already* made carries the baked seaward bearing of the nearest coast in its
 * spare channels, which is the same question answered before it was asked. So
 * the lee falls out of `scapeSurf`'s own arithmetic, off `scapeSurf`'s own
 * fetch, and the white water on the weather side of an island and the flat
 * water behind it are two readings of one number.
 */

/**
 * How hard the sea is breaking, before anything about the fragment is known.
 *
 * `onset` is the wind strength at which the whole open sound is breaking, so the
 * curve below it is where every gust lives. Above it the sea is fully capped and
 * a harder wind adds nothing — which is the physics and also the thing that
 * stops a gust front from flashing the sound white every seven minutes.
 *
 * **`HELD` is why a still photograph of this scape still has white in it**, and
 * it is the surf's argument rather than a second one: `STILL` zeroes
 * `wind.strength` by definition, and a capture is nonetheless a photograph of a
 * coast with a sea running on it — the breakers are held at three quarters of
 * their authored strength for exactly this reason, in `water.ts`'s own `update`.
 * A swell steep enough to be tripping on every beach in the frame is a swell
 * with white on its crests out in the sound, and a scape that drew the first and
 * not the second would be claiming the wind died between the shore and the
 * water. Slightly under the surf's fraction because a whitecap is the one of the
 * two that genuinely needs the wind that is blowing now.
 *
 * The one honest way to a glassy sea is `water.whitecap` at zero, which is a
 * switch, is the only one, and is exactly what `blow-none` in `--poses blow`
 * asks for.
 */
const HELD = 0.55

export function capsAmount (authored: number, onset: number, strength: number): number {
  if (!(authored > 0))
    return 0

  const blown = onset > 0
    ? smoothstep(0, onset, Math.max(0, strength))
    : 1

  return authored * (HELD + (1 - HELD) * blown)
}

/**
 * Metres between one windrow of broken water and the next — and the width of the
 * noise tile the pattern is cut out of.
 *
 * A metre quantity and not a knob, and deliberately *not* `SURGE_SPACING`, which
 * is 46 m and is a different fact about a different thing: that is the crest
 * spacing of a swell arriving at a beach, and this is how far apart the patches
 * of torn water sit out in open sea.
 *
 * It is also the number this whole system turned out to stand on, squeezed from
 * both directions at once — see {@link WATER_CAPS_GLSL}. Too fine and the tile
 * minifies into its own mean and nothing draws at all; too coarse and one cap is
 * a fifth of the frame and reads as a floe. 35 m puts a patch at twenty pixels
 * across the widest pose this camera has and fifty across the coastal ones,
 * while keeping the tile inside one texel to the pixel at the second and a mip
 * level and a third at the first.
 *
 * Folded into the chunk at build the way `SURGE_SPACING` is, rather than carried
 * as a uniform: a constant nothing can change at runtime does not need a slot,
 * and a slot invites somebody to change it.
 */
const CAP_SPACING = 35

/**
 * Cycles of the broadest blob across one tile of `water.wave`.
 *
 * Not a choice — it is the `frequency: 5` that texture is baked at, in
 * `textures/catalogue.ts`, written down here because the *tile* is the wrong
 * thing to size a windrow against and getting that wrong is invisible except as
 * a sea with nothing on it. A tile laid out at 110 m puts its broadest feature
 * at a fifth of that, and a tile laid out at the *patch* puts the patch five
 * times too small — which across a 1400 m frame is a map read at a mip level
 * that has already averaged the top of its own range away, and a threshold that
 * clears nothing anywhere.
 *
 * Laid out at five times the patch instead, the feature the noise actually
 * carries is the feature the sea is supposed to show.
 */
const CAP_CYCLES = 5

/**
 * How far the pattern travels downwind per unit of `uSurgePhase`.
 *
 * `uSurgePhase` is `wind.travel * SURGE_RATE`, so this is that rate inverted and
 * then some: the windrows drift a little faster than the surf marches, which is
 * a wind sea running over a swell rather than with it. A rate, and therefore one
 * that can reach zero — `wind.speed` and `wind.strength` both kill `wind.travel`
 * — which is what makes the field photographable.
 */
const CAP_DRIFT = 5.2

/**
 * How much of the water a fully capped sea has white on it, as a share of the
 * coverage dial.
 *
 * Read off the map's own distribution rather than chosen, and it has to be: it
 * is what keeps the far view and the near view the same brightness. At the held
 * coverage of a still the cut lands near `water.wave`'s seventieth percentile,
 * so something under a third of the sound is torn, and {@link CAP_TORN} takes
 * most of a half off the white on it — which multiplies out to a little over one
 * times the dial. If the cut or `CAP_TORN` ever move, this moves with them, and
 * the symptom of forgetting is a sea that changes brightness as you zoom.
 */
const CAP_MEAN = 1.05

/**
 * How white the whitest cap is.
 *
 * Under one, and it is the difference between foam and paint. `palette.foam` is
 * the colour of water that is *entirely* air — the lip of a breaker on a beach,
 * a boat's own wake at the stern — and a whitecap out in a sound is a crest with
 * some of that torn off the top of it seen from four hundred metres up. Mixed
 * the whole way it stops being a sea and becomes a stencil, which is what the
 * build before this drew.
 */
const CAP_TORN = 0.62

/**
 * The chunk, shared verbatim by both programs.
 *
 * **Both**, and that is a decision rather than a convenience. The capture
 * harness pins `--tier mobile` — a detected tier is undiffable, so every still
 * this repository has ever taken is of the *cheap* program — and a system the
 * cheap program cannot draw is a system no instrument here can see. This one
 * costs one dependent read, which takes that lake from two to three; the lee
 * and the coverage curve are arithmetic on fetches it was already making.
 *
 * **The scale of that read is the whole of what makes it work, and three builds
 * died on it.** A procedural field — five rotated sine octaves, carefully
 * irrational ratios, per-octave footprint fading, the lot — is a lattice at any
 * zoom where only the coarsest octaves resolve, and at the widest frame this
 * camera opens that is all of them. What it drew was a repeating comma in rows.
 * The obvious texture build fails the other way: the surface's own albedo sheen
 * tiles every 34 m, which across a 1400 m frame is forty repeats, so every fetch
 * of it comes back as the texture's own *mean* and a threshold cut into a field
 * that is 0.5 everywhere clears nothing. That build reported `0.00% same` at all
 * six poses of the tour with the coverage sitting correctly in its uniform.
 *
 * {@link CAP_SPACING} and {@link CAP_CYCLES} are between the two. The third
 * build got the scale right and the *threshold* wrong, which looks identical
 * from the outside — see the cut below.
 */
export const WATER_CAPS_GLSL = /* glsl */`
  uniform float uCaps;
  uniform float uCapsLee;

  float scapeCaps (vec2 ground, vec4 shore, float open) {
    if (uCaps <= 0.001 || open <= 0.001)
      return 0.0;

    // The lee, out of the fetch the caller already made. Bilinear filtering
    // shortens the decoded bearing between texels and open sea leaves it at zero
    // length, so its length is how near a coast this is and its direction is
    // which way that coast faces — one is the weight and the other is the
    // answer. Normalised here, where scapeSurf deliberately leaves them
    // multiplied: a breaker wants both at once, and a lee wants to know how
    // sheltered water is without that being confused with how near land it is.
    vec2 seaward = shore.gb * 2.0 - 1.0;
    float near   = length(seaward);
    float facing = near < 0.02 ? 1.0 : clamp(-dot(seaward, uSwell) / near, 0.0, 1.0);
    float run    = mix(1.0, facing, clamp(near * 1.7, 0.0, 1.0) * uCapsLee);

    vec2 across = vec2(-uSwell.y, uSwell.x);
    float along = dot(ground, uSwell) + uSurgePhase * ${CAP_DRIFT.toFixed(2)};
    float abeam = dot(ground, across);

    // Squashed along the wind before anything is sampled, which is the whole of
    // why these are streaks rather than blobs: sampling a field three times as
    // slowly downwind as across draws features three times as long that way, and
    // turning the wind turns them without a second term saying so.
    vec2 rows = vec2(along * 0.34, abeam) * ${(1 / (CAP_SPACING * CAP_CYCLES)).toFixed(7)};

    // The cat's paws: a modulation of the *cut* rather than of the white, so a
    // sea gets up in patches and lies down between them instead of breaking
    // evenly from one side of the sound to the other. Shifting the threshold
    // moves the coverage, which is what a darkening patch of water actually is;
    // multiplying the white instead would only dim the same caps. Two sines and
    // no second fetch, and a small swing because the distribution it walks
    // across is a tight one — see the cut below.
    float paws = sin(rows.y * 1.7 + rows.x * 1.1) * sin(rows.x * 1.3 - rows.y * 0.8);

    // The cut walks down as the sea gets up, and the two ends of it were
    // measured off the map rather than chosen. Four octaves of seamless value
    // noise is nothing like a ramp: water.wave spans 0.22 to 0.89 with a mean of
    // 0.557, and its ninetieth, ninety-fifth and ninety-ninth percentiles are
    // 0.725, 0.769 and 0.831. A cut written at 0.9 — which is what "the top
    // tenth of nought-to-one" gives you — is above the texture's own maximum,
    // and a build that wrote one drew a sound with nothing whatever on it while
    // carrying a perfectly correct coverage in its uniform.
    //
    // So 0.68 is around the sixty-fifth percentile and 0.42 under the fifth, and
    // the coverage dial walks between them. Deliberately low, and the failure
    // that put it there is worth writing down: a cut up near the ninety-fifth
    // leaves a dozen isolated white shapes floating on a flat sea, which reads
    // as paper rather than as water. Broken water is *connected* — it covers a
    // fifth to a third of a sea that is properly up — so the cut goes where that
    // much of the distribution is, and CAP_TORN takes the paint back off.
    float cut  = mix(0.68, 0.42, uCaps) + 0.025 * paws;
    float caps = smoothstep(cut, cut + 0.08, texture2D(uWaveMap, rows).r) * ${CAP_TORN.toFixed(2)};

    // And where the frame is too wide to hold a cap, the same water is its own
    // *average* instead of its own pattern — which is not a fallback, it is what
    // a capped sea looks like from far enough away. A whitecap is a few metres
    // across and the widest frame this camera opens is 1400 m, where a few
    // metres is two pixels: what a pattern draws there is a scatter of isolated
    // specks that reads as snow on the water, and what a sea actually does is go
    // pale. CAP_MEAN is the area the streaks cover at the same coverage, so the
    // two are the same amount of white and the crossover is not a step in
    // brightness.
    return mix(uCaps * ${CAP_MEAN.toFixed(2)}, caps, 1.0 - smoothstep(0.010, 0.020, fwidth(rows.y)))
      * open * run;
  }
`
