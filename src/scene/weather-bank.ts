/**
 * The weather the cloud is *in* — the low field that decides where the sky is
 * covered and where it is open.
 *
 * ## the finding
 *
 * The scape has two cloud fields and until now both of them were tiles about a
 * hundred metres across. The deck overhead repeats `cloudTileSize(maxViewSize)`
 * — 106.8 m at the authored frame — and the shadow on the ground repeats
 * `atmosphere.cloudScale`, 92 m. Both numbers were chosen when the scape was one
 * island and the widest authored frame was 132 m across, and at that size they
 * are right: a tile a little smaller than the frame is a sky with several clouds
 * in it.
 *
 * The world is now `archipelago.worldSize` = 1520 m. Neither number moved. So
 * the wide poses draw the same hundred-metre tile sixteen times across the
 * frame, and sixteen identical comma-shaped clouds on a perfect lattice is not a
 * sky, it is wallpaper — the single most visible thing in the scape at `far`,
 * and invisible at every close pose, which is why it survived so long.
 *
 * This is exactly the audit the readme's scale rule asks for and nobody ran on
 * the clouds: **a cloud tile is frame-sized and a weather system is
 * world-sized**, and when the world grew only the second one should have grown
 * with it. The fix is therefore not to enlarge the tile — a 1500 m tile is one
 * cloud over the whole archipelago and the close poses lose their sky — but to
 * add the scale that was missing.
 *
 * ## what it is
 *
 * One more read of the same noise, at a tile {@link WEATHER_BANK_WORLD_FRACTION}
 * times the width of the world, which biases the cloud field up and down beneath
 * it. Where the bank is high the field crosses the cut and there is overcast;
 * where it is low the cut is never reached and there is open sky. The result is
 * cloud in *banks*, with clear lanes between them, which is what weather over an
 * archipelago actually looks like from above.
 *
 * The visible period stops being the cloud tile and becomes the bank tile, and
 * the bank tile is wider than the world — so nothing in any frame repeats. The
 * hundred-metre detail is still there, still the size the close composition was
 * tuned on, but it is now modulated rather than stamped, so the same comma never
 * appears twice at the same strength.
 *
 * ## why it is one module
 *
 * Because two things read it and they have to agree. `clouds.ts` bakes and draws
 * the deck; `cloud-shadow.ts` compiles the lookup into four ground programs; and
 * a bank that opened a hole in the sky without lifting the shadow under it would
 * be worse than the wallpaper. Both sample **the catalogue's one cloud map, in
 * world metres, at the scale and offset this module sizes** — so the lanes line
 * up, and there is one number to turn.
 *
 * Pure and free of `three`, for `cloud-shadow.ts`'s reason: `scape:map` reads it
 * and draws nothing.
 */

/**
 * Bank tile width as a multiple of the world's own extent.
 *
 * **World-sized, and that is the whole point of the module** — a world that
 * grows grows its weather with it, which is the audit none of the tiled fields
 * got when the scape stopped being one island.
 *
 * Near one rather than well over it, and the number was measured rather than
 * picked. A lattice is not a repeat, it is *several* repeats: sixteen of them
 * across a frame is wallpaper and one and a quarter across the whole world is
 * simply where the weather happens to be. What the second consideration buys is
 * the feature size — the map is baked at `frequency: 3`, so a bank is about a
 * third of this tile, and at 0.8 that is four hundred metres, which is a squall
 * over a sound. Taken to three the same field is a bank eleven hundred metres
 * across, and every frame the scape has holds one half of one of them, which
 * reads as a gradient rather than as weather.
 */
export const WEATHER_BANK_WORLD_FRACTION = 0.8

/** Width of the bank tile, in metres, for a world of a given extent. */
export function weatherBankTile (worldSize: number): number {
  return Math.max(1, worldSize) * WEATHER_BANK_WORLD_FRACTION
}

/**
 * Metres the bank travels per unit of the scape's one wind travel.
 *
 * **Metres, and they stay metres** — how fast a front crosses a coast is a fact
 * about weather rather than about how wide the archipelago is, so a world that
 * grows does not speed this up. It matches the slowest deck's own `DRIFT_SPEED`
 * so that the banks and the lowest cloud in them move together.
 *
 * It is weighed by `atmosphere.cloudDrag` at both readers, which is what lets it
 * reach zero: `STILL` zeroes `wind.strength`, the wind then stops travelling,
 * and the bank parks. There is no rate of its own to add to `scape-poses.ts`.
 */
export const WEATHER_BANK_DRIFT = 2.4

/**
 * How far the bank's uv has scrolled, in tiles, for a given wind travel.
 *
 * Both readers call this rather than each keeping an integration of its own, so
 * the lane in the sky and the lane on the ground are the same lane — see the
 * module note. The shadow then subtracts its own downsun throw from the result;
 * the deck does not, because the deck *is* the cloud.
 */
export function weatherBankDrift (drag: number, travel: number, tile: number): number {
  return drag * travel * WEATHER_BANK_DRIFT / Math.max(1e-6, tile)
}

/**
 * How many times a tile of a given width repeats across the world.
 *
 * The instrument the whole finding is stated in, and the one number `scape:map`
 * now prints: sixteen repeats is wallpaper, and under one is weather. It reads
 * the *world* rather than a frame because a lattice you cannot see from any
 * camera the scape has is not a lattice.
 */
export function skyRepeats (worldSize: number, tile: number): number {
  return Math.max(0, worldSize) / Math.max(1e-6, tile)
}

/**
 * How far the bank may carry the cloud field, either way, at full strength.
 *
 * The cloud field is four octaves of noise spanning roughly 0.17..0.83 around a
 * mean of a half, and `CLOUD_CUT` sits at 0.55. A swing of one means a bank at
 * full strength moves the field by up to half of its whole range — enough that a
 * low bank never reaches the cut and a high one is over it everywhere, which is
 * what makes an open lane open rather than merely thinner.
 *
 * It is a constant rather than a second knob because there is already a number
 * that says how much banking there is, and the readme's rule about not adding a
 * boolean that duplicates a number applies just as well to a second float.
 */
export const WEATHER_BANK_SWING = 1

/**
 * The cloud field, banked.
 *
 * `detail` and `bank` are two reads of the same 0..1 noise at two scales, and
 * `strength` is `atmosphere.weatherBank`. At zero this returns the detail
 * unchanged, which is the sky the scape had before this module and is what makes
 * the knob a real switch rather than a taper.
 *
 * Written here as well as in GLSL because the two have to be the same function:
 * the test states the claims about this one, and {@link WEATHER_BANK_GLSL} is the
 * same three operations in the shader's own syntax.
 */
export function bankedField (detail: number, bank: number, strength: number): number {
  const biased = detail + (bank - 0.5) * Math.max(0, strength) * WEATHER_BANK_SWING

  return Math.min(1, Math.max(0, biased))
}

/**
 * Where the deck's alpha is taken away, as a function of the bank under it.
 *
 * The deck cannot be biased the way the shadow's field is, and the reason is the
 * bake: `clouds.ts` stores the field **already cut** in the texture's alpha, so
 * there is no raw field left up there to move. What the deck can do is thin, so
 * the bank arrives as a mask on the opacity instead — full cloud over a high
 * bank, nothing at all over a low one.
 *
 * The two are therefore not the same arithmetic, and the thing that matters is
 * that they are the same *field*: deck and shadow read one map in world metres
 * at one scale and one offset, so the lane that opens in the sky is the lane the
 * ground brightens under. See the changelog's follow-up — one cut over two
 * bakes was already the wart here, and this is the third reader of it.
 */
export const WEATHER_BANK_LOW  = 0.3
export const WEATHER_BANK_HIGH = 0.62

/** How much of the deck survives the bank under it, 0..1. */
export function bankMask (bank: number, strength: number): number {
  const span = (bank - WEATHER_BANK_LOW) / (WEATHER_BANK_HIGH - WEATHER_BANK_LOW)
  const cut  = Math.min(1, Math.max(0, span))

  return 1 + (cut - 1) * Math.min(1, Math.max(0, strength))
}

/**
 * The world-space bank read, declared once and compiled into five programs.
 *
 * Four ground programs take it through `CLOUD_SHADOW_GLSL`, which biases its
 * field by {@link scapeWeatherBank}; the deck takes it directly and masks its own
 * alpha with {@link bankMask}'s `smoothstep`. `uCloudMap` is declared by the
 * caller, because the shadow already has one and a second `uniform sampler2D` of
 * the same name is a compile error rather than a sharing.
 */
export const WEATHER_BANK_SWELL = 0.85

/**
 * The bank, and the sea under it.
 *
 * {@link WEATHER_BANK_SWELL} is how much of the swell's own height the bank may
 * take away or add, and it is the largest of the three couplings on purpose: the
 * open water is where the repeat was worst. The lake's swell is three fixed
 * sines at 48, 70 and 101 metres, which over 1520 m of sound is an egg-crate of
 * the same cell twenty times over — the one pattern in the scape that is visible
 * at *every* zoom, because the amplitude is a slope on a near-mirror rather than
 * a colour.
 *
 * Modulating its height by the bank does not make the sines aperiodic and is not
 * meant to: it makes the *sea* aperiodic, which is the thing being looked at. A
 * swell that is up under the weather and slack in the lane between two banks is
 * what a sound between islands does, and a lattice whose every other cell is
 * flat is no longer read as a lattice.
 *
 * Clamped away from zero at the bottom: a sea with no swell in it at all has no
 * slope to shade, and a patch of perfectly flat mirror in the middle of a sound
 * reads as a hole rather than as calm.
 */
export const WEATHER_BANK_GLSL = /* glsl */`
  uniform vec2 uWeatherBankOffset;
  uniform float uWeatherBankScale;
  uniform float uWeatherBank;

  float scapeWeatherBankAt (vec2 ground) {
    return texture2D(uCloudMap, ground * uWeatherBankScale + uWeatherBankOffset).r;
  }

  float scapeWeatherBank (vec2 ground) {
    return (scapeWeatherBankAt(ground) - 0.5) * uWeatherBank * ${WEATHER_BANK_SWING.toFixed(2)};
  }

  float scapeWeatherSwell (vec2 ground) {
    return clamp(1.0 + scapeWeatherBank(ground) * ${WEATHER_BANK_SWELL.toFixed(2)}, 0.25, 1.9);
  }

  float scapeWeatherBankMask (vec2 ground) {
    float cut = smoothstep(
      ${WEATHER_BANK_LOW.toFixed(2)},
      ${WEATHER_BANK_HIGH.toFixed(2)},
      scapeWeatherBankAt(ground)
    );

    return mix(1.0, cut, uWeatherBank);
  }
`

/**
 * The bank, wired into a world-pinned sheet's own program.
 *
 * Four snippets rather than one because that is how three's chunks are replaced,
 * and they are here rather than in the two modules that use them because the
 * cloud deck and the mist are the same graft: a world position carried down as a
 * varying, and the bank multiplied into the alpha the map produced.
 *
 * World `xz` off the model matrix rather than the plane's uv, and that is the
 * decision worth writing down. Every sheet in both families carries its own
 * `map.repeat` and its own scrolling offset, so a uv would be a different field
 * on every sheet and none of them the one the ground reads. The model matrix is
 * the single frame all of them — and the four ground programs — already share.
 */
export const WEATHER_BANK_PARS_VERTEX = /* glsl */`
  varying vec2 vWeatherGround;
`

export const WEATHER_BANK_BEGIN_VERTEX = /* glsl */`
  #include <begin_vertex>
  vWeatherGround = (modelMatrix * vec4(position, 1.0)).xz;
`

export const WEATHER_BANK_PARS_FRAGMENT = /* glsl */`
  uniform sampler2D uCloudMap;
  varying vec2 vWeatherGround;
${WEATHER_BANK_GLSL}
`

export const WEATHER_BANK_MAP_FRAGMENT = /* glsl */`
  #include <map_fragment>
  diffuseColor.a *= scapeWeatherBankMask(vWeatherGround);
`
