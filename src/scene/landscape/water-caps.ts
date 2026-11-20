import type { IUniform } from 'three'
import type { ScapeConfig } from '../config.ts'


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
 * into one uniform: Monahan's measured whitecap share at the wind's speed, which
 * goes as its cube and a half — nothing in a breeze, a percent at force five, a
 * tenth in a gale — and the cut in the map that whitens that share.
 *
 * **the field** is the fractal map the surface is already bound to, read in a
 * frame turned into the wind and squashed along it, then thresholded — torn
 * streaks lying downwind, travelling on the same `wind.travel` the surf marches
 * in on, and going to their own average at a zoom too wide to hold one. One
 * dependent read, the same on both programs. What the scale of that read has to
 * be, and the three builds that got it wrong, are in {@link WATER_CAPS_GLSL}.
 *
 * **the fetch** is the half you can see from across the room. Wind does not
 * raise a sea instantly — it raises it over distance, measured *upwind* — so
 * water tucked under the land the wind is blowing over has had no run at all
 * and lies flat while the sound beyond it breaks.
 *
 * The first build of that read the bathymetry mask's own baked seaward bearing:
 * free, already fetched, and wrong in one specific way that took a map of its
 * own to fix. A baked gradient only exists within a texel or two of a coast, so
 * the lee it drew stopped at the bank — the water *behind* an island broke
 * exactly like the water in front of it, and a breakwater built to flatten a
 * harbour flattened nothing. `shelter.ts` is the second build: sixteen rays out
 * of every texel of a small map, kept as a mean and a first harmonic, resolved
 * against the bearing the wind is on with one dot product. The white water on
 * the weather side of an island and the flat water four hundred metres into its
 * lee are now two readings of the same measured number.
 */

/**
 * Metres a second of wind per unit of `wind.strength`: the authored 0.9 is a
 * fresh breeze, force five, and the 2.4 of `--poses blow` a whole gale.
 */
export const WIND_METRES = 9

/**
 * The wind, in `wind.strength`'s units, that raised a sea of state one.
 *
 * A sea state *is* a wind that has blown — the swell, the surf and the caps
 * are three readings of it — so a still (which `STILL` takes in a dead calm)
 * keeps the white its sea was raised with, and a harder wind than the sea
 * remembers adds to it. Only `water.whitecap` at zero is a glass sound.
 */
export const SEA_WIND = 1.1

/** The most of the sound the caps may take, however hard it blows: past this it is spindrift, not caps. */
export const CAP_MAX = 0.3

/**
 * Monahan & O'Muircheartaigh (1980): the share of the sea surface white with
 * breaking water at a 10 m wind of `metres` a second — `3.84e-6 · U^3.41`.
 *
 * The number this system was missing. The caps were tuned so "a fifth to a
 * third" of a sea that was properly up was torn, and a still held 15% of the
 * sound white — which, averaged at the wide frame, laid a milky sheet over
 * four fifths of the picture: the sea read paler than the land. A real force
 * five breaks on about one percent of the water and a gale on about ten, so a
 * sea from the air is dark, with white *flecks* on it. That is the photograph.
 */
export function whitecapFraction (metres: number): number {
  return metres > 0 ? Math.min(CAP_MAX, 3.84e-6 * metres ** 3.41) : 0
}

/**
 * How much of the sound is breaking: `scale` of Monahan's share at whichever
 * is harder, the wind blowing now or the wind the sea `state` was raised by.
 */
export function capsAmount (scale: number, state: number, strength: number): number {
  if (!(scale > 0) || !(state > 0))
    return 0

  const wind = Math.max(Math.max(0, strength), SEA_WIND * state)

  return Math.min(CAP_MAX, scale * whitecapFraction(wind * WIND_METRES))
}

/**
 * `water.wave`'s upper tail: the share of the map above a value, measured off
 * the baked texture (mean 0.557; the 65th, 90th, 95th and 99th percentiles are
 * 0.68, 0.725, 0.769 and 0.831; its maximum 0.89). Cutting the map at the
 * value a share sits at whitens exactly that share of the water.
 */
const WAVE_TAIL: readonly (readonly [number, number])[] = [
  [ 0.35, 0.68 ], [ 0.1, 0.725 ], [ 0.05, 0.769 ], [ 0.01, 0.831 ], [ 0.001, 0.875 ],
]

/** The cut in `water.wave` above which `share` of the sea lies — piecewise in the log of the share. */
export function capsCut (share: number): number {
  const s = Math.min(WAVE_TAIL[0][0], Math.max(WAVE_TAIL[WAVE_TAIL.length - 1][0], share))

  for (let i = 1; i < WAVE_TAIL.length; i++) {
    const [ s0, c0 ] = WAVE_TAIL[i - 1]
    const [ s1, c1 ] = WAVE_TAIL[i]

    if (s >= s1) {
      const t = Math.log(s0 / s) / Math.log(s0 / s1)
      return c0 + (c1 - c0) * t
    }
  }

  return WAVE_TAIL[WAVE_TAIL.length - 1][1]
}

/**
 * The two uniforms this system owns, set together: `uCaps` is the share and
 * the cut it sits at, `uCapsLee` the lee's strength.
 */
export function setCaps (
  uniforms: Record<string, IUniform>,
  water:    ScapeConfig['water'],
  strength: number,
): void {
  const share = capsAmount(water.whitecap, water.state, strength)

  uniforms.uCaps.value.set(share, capsCut(share))
  uniforms.uCapsLee.value = water.whitecapLee
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
const CAP_SPACING = 14

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
 * How far the weather bank walks the cut, in the cut's own units.
 *
 * The finding this answers is the one `scene/weather-bank.ts` was written for,
 * and the sea is where it showed worst. Everything above sizes a windrow against
 * a *frame* — correctly, because a whitecap is a few metres of water and stays a
 * few metres of water however wide the archipelago gets — so one tile of the cap
 * field is 175 m across the wind and the world is 1520 m. Before this, the wide
 * poses drew the same streak on a nine-by-nine lattice over the whole sound,
 * `paws` and all, because the cat's paws are two sines at that same tile and
 * repeat with it.
 *
 * So the bank is the term that does not repeat: a field wider than the world,
 * walking the *cut* rather than the white, exactly as `paws` does and for the
 * same reason — a squall is water that has got up, not water that is whiter.
 * Where the bank is high the sea breaks; in the lane between two banks it lies
 * down, and the pattern that used to tile is now gated by something that cannot.
 *
 * Most of the coverage dial's own span, so a bank can make the difference between a
 * sea that is properly up and one that is barely marked without being able to
 * reach either end on its own — `water.whitecap` is still what decides whether
 * there is a sea to bank at all.
 */
const CAP_BANK = 0.7

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
 * costs one dependent read of its own, which took that lake from two to three;
 * the lee now costs a second, shared with the swell's gain and fetched by the
 * caller — see `shelter.ts` for why a 64 KB map is not the same kind of tap as
 * a nine-megabyte one.
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
  uniform vec2 uCaps;
  uniform float uCapsLee;

  float scapeCaps (vec2 ground, vec4 shelter, float open) {
    if (uCaps.x <= 0.0001 || open <= 0.001)
      return 0.0;

    // The lee, out of the shelter map the caller already fetched — which is a
    // fact about what is four hundred metres upwind rather than about which way
    // the bank under this fragment happens to face. Negating uSwell is what
    // makes it upwind: the swell runs with the wind in this scape and there is
    // one compass, not two. See shelter.ts.
    float run = mix(1.0, 1.0 - scapeShelterLee(shelter, -uSwell), uCapsLee);

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

    // The cut is the share's own quantile of the map (\`capsCut\`, on the cpu),
    // nudged by the paws and walked down by the weather bank: a squall is
    // water that has got up, not water that is whiter.
    float cut  = clamp(
      uCaps.y + 0.025 * paws - scapeWeatherBank(ground) * ${CAP_BANK.toFixed(2)} * 0.25,
      0.3,
      0.9
    );
    float caps = smoothstep(cut, cut + 0.03, texture2D(uWaveMap, rows).r) * ${CAP_TORN.toFixed(2)};

    // Where the frame is too wide to hold a cap, the same water is its own
    // average: the share the streaks cover, at the white they carry, so the
    // crossover is not a step in brightness.
    return mix(uCaps.x * ${CAP_TORN.toFixed(2)}, caps, 1.0 - smoothstep(0.006, 0.014, fwidth(rows.y)))
      * open * run;
  }
`
