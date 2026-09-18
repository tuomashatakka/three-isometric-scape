import { Vector2 } from 'three'
import type { IUniform } from 'three'
import type { LiveConfig } from './config.ts'
import { createDaylight } from './daylight.ts'
import type { Vec2 } from './landscape/path.ts'
import type { TextureCatalogue } from './textures/catalogue.ts'
import type { WindState } from './wind.ts'


/**
 * The shadow the deck overhead lays on everything under it.
 *
 * It used to live inside `props/material.ts`, as four uniforms and two lines of
 * glsl that only the ground and the foliage could reach — which is why the
 * archipelago's cloud shadows stopped dead at the waterline. Better than four
 * fifths of every wide frame of this scape is water, so the one system that is
 * supposed to move light across the whole map was drawing on the smallest part
 * of it, and a shadow crossing a coast simply went out.
 *
 * So it is a module, and what it owns is the *placement*: one texture, one
 * scale, one drift and one darkness, held as shared `IUniform` instances that
 * every program reading them is handed. Sharing the instances rather than the
 * numbers is the whole of the discipline here — two records written from the
 * same config each frame would be right almost always, and wrong on exactly the
 * frame where one of them is written and the other is not.
 *
 * Two things came with the move, and neither is a decoration:
 *
 * - **the shadow goes where the light puts it.** A cloud at
 *   `atmosphere.cloudHeight` over a coast at 68° north throws its shadow a long
 *   way downsun — two hundred metres at the floor the key light's elevation is
 *   held at — and swings it round the compass through the day. The old lookup
 *   was the map read straight off world `xz`, which is a cloud shadow with the
 *   sun directly overhead and nowhere else, at a latitude where the sun is never
 *   directly overhead.
 * - **it goes out when there is nothing to cast it, and nothing to cast it
 *   with.** `atmosphere.cloudCover` at zero is a clear sky, and a clear sky that
 *   still dapples the ground is the kind of bug a picture cannot show you. Nor
 *   can a cloud shadow be darker than the light it is subtracting: the term
 *   rides `day + moon`, so a new-moon midnight is lit by starlight and evenly.
 *
 * Pure enough to test: {@link shadowThrow} and {@link shadeAmount} are the two
 * decisions, both of them arithmetic on numbers, and `scape:map` reads the same
 * pair to report what the shadow is doing at an hour no still can distinguish.
 */
export interface CloudShadow {

  /**
   * The four uniforms every program that takes the shadow reads.
   *
   * Handed to `three` by reference, so the ground material, the foliage
   * material and both lake programs are looking at one set of numbers.
   */
  uniforms: Record<string, IUniform>

  /** What the shadow is doing right now. The instrument, and the test's subject. */
  state: CloudShadowState

  /** Advance the drift and re-place the shadow under the key light. Allocation-free. */
  update(wind: WindState): void
}

export interface CloudShadowState {

  /** How dark the shadow is, 0..1 — `cloudShadow` weighed by the cover and the light. */
  shade: number

  /** How far downsun the shadow lands from the cloud that casts it, in metres. */
  reach: number

  /** Which way it is thrown, in radians, in the same frame as a wind bearing. */
  bearing: number
}

/**
 * Cloud-map uv travelled per unit of wind travel.
 *
 * Measured rather than chosen: the deck used to scroll at `elapsed *
 * cloudSpeed * 0.06`, and the default wind travels at `speed * strength` =
 * 1.215 per second, so 0.05 lands the shadow at the rate it has always had.
 */
const DRIFT = 0.05

/**
 * How much light a full cloud takes away, as a share of what is under it.
 *
 * The other end of the `mix` in {@link CLOUD_SHADOW_GLSL}. Darkening before
 * lighting is not physically a shadow, but at this scale it reads as one for
 * the cost of a single texture fetch — and unlike a real shadow caster it costs
 * nothing per light and never aliases.
 *
 * It was 48 %, and it went up with {@link CLOUD_CUT} rather than on its own:
 * a *haze* laid over everything cannot carry much contrast, because whatever it
 * takes it takes from the whole frame and the eye reads that as the scene
 * simply being darker. A cut field has gaps, and ground in a gap is fully lit,
 * so the contrast has somewhere to be measured against. 70 % is still short of
 * what a real cumulus does — the direct beam is most of a sunny day's light —
 * and it is as far as an albedo multiply can honestly go before the shadowed
 * half stops reading as ground.
 */
const TAKEN = 0.7

/**
 * Where the noise field stops being sky and starts being cloud.
 *
 * The deck overhead has always thresholded its field — `bakeClouds` cuts here
 * and fades over {@link CLOUD_EDGE} — and the reason is written down beside it:
 * a cloud read from underneath has to have **gaps**, or it is a grey filter
 * over the frame rather than weather. The shadow never applied that cut. It
 * multiplied the raw field, which is four octaves of noise spanning about two
 * thirds of nought-to-one around a mean of a half, so what it laid on the
 * archipelago was an even haze that went slightly darker in places: 74 % of a
 * 520 m frame moved by it, and by no more than **ten levels of 255** at the
 * worst pixel in the frame.
 *
 * Cutting it is what turns that into a shadow with an edge, and it costs one
 * `smoothstep` on a fetch already being made. It also settles the polarity: the
 * deck draws cloud *above* the cut, so above the cut is now where the ground
 * goes dark, and a deck and its shadow finally agree about which part of the
 * sky is cloud.
 *
 * The two constants live here rather than in `clouds.ts` because this is the
 * module both readers can import — `scape:map` reads this file and draws with
 * nothing but bun, and `clouds.ts` bakes a texture. See the changelog's
 * follow-up: they are one cut over two bakes, not yet one sky.
 */
export const CLOUD_CUT  = 0.55
export const CLOUD_EDGE = 0.22

/** Below this the throw is a divide by nothing. The key light never reaches it. */
const MIN_LIFT = 1e-3

/**
 * Where the shadow of a cloud lands, relative to the cloud, in metres.
 *
 * A straight projection along the key light: the horizontal run over the
 * vertical rise, times the height the cloud is at, pointed the other way from
 * the light. The arguments are the key direction's components rather than an
 * elevation and a bearing, because the ratio is all that is used and a ratio is
 * scale-invariant — the runtime hands the normalised `DaylightState.direction`
 * and `scape:map` hands the same three numbers before they were normalised,
 * and the two agree exactly.
 *
 * It cannot run away, and that is the light's doing rather than a clamp here:
 * `daylight.ts` holds the key direction's `y` at its own `KEY_FLOOR`, so the
 * longest throw a 34 m deck can have is about 210 m.
 */
export function shadowThrow (
  dirX:        number,
  dirY:        number,
  dirZ:        number,
  cloudHeight: number,
  into:        Vec2 = { x: 0, z: 0 },
): Vec2 {
  const lift = Math.max(dirY, MIN_LIFT)

  into.x = -dirX / lift * cloudHeight
  into.z = -dirZ / lift * cloudHeight

  return into
}

/**
 * How dark the shadow is this instant, 0..1.
 *
 * Three numbers, and every one of them can take it to nothing on its own: the
 * authored darkness, the cover that says whether there is any cloud up there,
 * and the light there is to block. There is no flag beside them, for the reason
 * nothing else in this scape has one — an effect is off when its strength is
 * zero.
 *
 * `moon` is in the same share-of-the-noon-sun units `day` is, so a full moon
 * throws a shadow about a sixth as dark as noon's, which is roughly what a
 * bright moon does to a snow field.
 */
export function shadeAmount (
  shadow: number,
  cover:  number,
  day:    number,
  moon:   number,
): number {
  const light = Math.min(1, Math.max(0, day + moon))

  return Math.max(0, shadow) * Math.min(1, Math.max(0, cover)) * light
}

/**
 * The lookup, declared once and compiled into four programs.
 *
 * A function rather than a statement because the two callers hold the world
 * position in differently named varyings — `vScapeGround` on the ground and
 * `vWaterGround` on the lake — and the alternative to a parameter is the same
 * three lines written twice and drifting apart. It is in the *lite* lake as
 * well as the full one, verbatim, for the reason the whitecaps are: the capture
 * harness pins `--tier mobile`, so an effect the cheap program cannot draw is
 * an effect no still in this repository can show.
 */
export const CLOUD_SHADOW_GLSL = /* glsl */`
  uniform sampler2D uCloudMap;
  uniform vec2 uCloudOffset;
  uniform float uCloudScale;
  uniform float uCloudStrength;

  float scapeCloudShade (vec2 ground) {
    float field = texture2D(uCloudMap, ground * uCloudScale + uCloudOffset).r;
    float cloud = smoothstep(${CLOUD_CUT.toFixed(2)}, ${(CLOUD_CUT + CLOUD_EDGE).toFixed(2)}, field);
    return mix(1.0, 1.0 - ${TAKEN.toFixed(2)} * cloud, uCloudStrength);
  }
`

/**
 * The shadow, wired to the config and to the sky.
 *
 * It keeps a daylight sampler of its own, the way `water.ts` and
 * `atmosphere.ts` do. That is not a second opinion about what time it is:
 * `Daylight.sample` is a pure function of `daylight.time` and `season.time`, so
 * every sampler in the scape returns the same sky for the same instant, and the
 * alternative — threading a published state down through the landscape's build
 * order — buys nothing for the coupling it costs.
 */
export function createCloudShadow (
  config:   LiveConfig,
  textures: TextureCatalogue,
): CloudShadow {
  const daylight                           = createDaylight(config)
  const offset: IUniform<Vector2>          = { value: new Vector2() }
  const scale: IUniform<number>            = { value: 1 / Math.max(1, config().atmosphere.cloudScale) }
  const strength: IUniform<number>         = { value: 0 }
  const uniforms: Record<string, IUniform> = {

    // Asked for by name rather than baked here. Every map in the scape is in
    // `textures/catalogue.ts`, which is what keeps this one provably a
    // different noise from the ground grain it is multiplied into.
    uCloudMap:      { value: textures.get('sky.cloudShadow') },
    uCloudOffset:   offset,
    uCloudScale:    scale,
    uCloudStrength: strength,
  }

  const state: CloudShadowState = { shade: 0, reach: 0, bearing: 0 }
  const throwAt: Vec2           = { x: 0, z: 0 }

  return {
    uniforms,
    state,

    update (wind) {
      const { atmosphere } = config()
      const sky            = daylight.sample(config().daylight.time, config().season.time)
      const tile           = 1 / Math.max(1, atmosphere.cloudScale)

      shadowThrow(
        sky.direction.x,
        sky.direction.y,
        sky.direction.z,
        atmosphere.cloudHeight,
        throwAt,
      )

      // The deck's own drift, off the scape's one wind — which is what finally
      // put a cloud and the shadow it casts on the same heading — plus the
      // throw, which is where the light is standing rather than where the wind
      // is going. Subtracted rather than added: the uv is the *cloud* the
      // ground wants, so ground shaded by a cloud thrown 200 m downsun has to
      // read the map 200 m back upsun of itself.
      const drift = atmosphere.cloudDrag * wind.travel * DRIFT

      offset.value.set(
        wind.dirX * drift - throwAt.x * tile,
        wind.dirZ * drift - throwAt.z * tile,
      )

      scale.value    = tile
      strength.value = shadeAmount(
        atmosphere.cloudShadow,
        atmosphere.cloudCover,
        sky.day,
        sky.moon,
      )

      state.shade   = strength.value
      state.reach   = Math.hypot(throwAt.x, throwAt.z)
      state.bearing = Math.atan2(throwAt.x, throwAt.z)
    },
  }
}

// perf: one texture fetch per fragment on four programs, and nothing per frame
// but a `Vector2`, two floats and one allocation-free sky sample. The map
// itself belongs to the catalogue, so nothing here is uploaded or freed.
