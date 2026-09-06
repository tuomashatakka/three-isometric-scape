import {
  AdditiveBlending,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
} from 'three'
import type { OrthographicCamera } from 'three'
import { defineModule, smoothstep } from 'threejs-scene'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import { sunHeight, sunSwing } from './daylight.ts'
import type { AtmosphereQuality } from './quality.ts'
import { deckFocus, deckViewSize } from './sky-deck.ts'
import type { SkyPlace } from './sky-deck.ts'
import { showerAmount } from './weather.ts'
import type { WeatherState } from './weather.ts'
import { LAYER } from './layers.ts'


export interface RainbowOptions {
  camera:  OrthographicCamera
  config:  LiveConfig
  quality: AtmosphereQuality

  /** Live weather. The bow is read off the same front the fall is, from its edges. */
  weather: WeatherState
}

const DEGREES = Math.PI / 180

/**
 * The two opening angles, in degrees of arc.
 *
 * Not knobs, and this is the whole reason the module can claim to be a rainbow
 * rather than a coloured arc: 42° and 51° are where water disperses sunlight,
 * and they do not move when the archipelago does, when the frame does, or when
 * anybody drags a slider. The primary is one internal reflection and the
 * secondary is two, which is also why the second one's spectrum runs the other
 * way and why it is the fainter of the pair.
 */
const PRIMARY   = 42
const SECONDARY = 51

/** How much wider the secondary band is than the primary. The real ratio. */
export const SECONDARY_SPREAD = 1.6

/**
 * Half-angle of the quad the arcs are drawn on, in degrees.
 *
 * Far enough out to hold the widest secondary the config can ask for — 51°
 * plus half of `SECONDARY_SPREAD` times the widest `rainbow.width` the overlay
 * offers — with a couple of degrees of margin, because the band's own bell
 * reaches zero exactly at its edge and a quad that clipped it would put a
 * straight cut across the outside of the bow.
 */
const EDGE = 58

/**
 * How far under the horizon the bow's own arc is allowed to sink before the
 * quad is switched off entirely, in degrees.
 *
 * Measured against the *secondary*, not the primary, and that is deliberate.
 * The two arcs are nine degrees apart, so there is a band of solar elevations —
 * between 42° and 51°, which at this latitude is most of the middle of a
 * midsummer day — where the inner bow has gone under the sea and the outer one
 * is still standing over it. Gating on the primary would take away a real
 * sight; gating on the outer edge lets the horizon fade in the shader decide
 * which arcs survive, which is what the horizon does in life.
 */
const RISE = 2

/** Where the sun has to stand before its light is worth dispersing. Sines. */
const SUN_UNDER = -0.02
const SUN_CLEAR = 0.09

/**
 * Where the bow starts and finishes coming into view, as fractions of the zoom
 * range.
 *
 * Its own curve rather than the sky decks', and the difference is the reason
 * this is not one: a deck fades out on the way *in* because the camera ends up
 * underneath it, and the bow is never overhead — it stands out along the
 * horizon on the far side of the world from the sun. What close zoom costs it
 * is the same thing it costs the shower: an arc needs sky and a skyline to be
 * an arc, and four metres of grass with a coloured wash over it is not a
 * rainbow, it is a filter.
 */
const REVEAL_IN  = 0.05
const REVEAL_OUT = 0.28

/** How much of the bow the view is far enough back to read, 0..1. */
export function bowReveal (viewSize: number, limits: ScapeConfig['camera']): number {
  const span = limits.maxViewSize - limits.minViewSize

  return smoothstep(
    limits.minViewSize + span * REVEAL_IN,
    limits.minViewSize + span * REVEAL_OUT,
    viewSize,
  )
}

/**
 * Where the bow's centre is: the antisolar point, and nothing else.
 *
 * The claim the whole module rests on, written as one function so a test can
 * state it as a fact about the numbers. A rainbow is a circle drawn about the
 * point in the sky exactly opposite the sun — which is why you cannot see one
 * with the sun in front of you, why it climbs as the sun sets, and why it is
 * gone by the middle of a summer day. So this is the sun's own place from
 * `daylight.ts`, negated: the same elevation on the other side of the horizon,
 * and the same bearing half a turn round.
 *
 * Solved here rather than read off `DaylightState` because that record carries
 * a *lighting* direction, floored just above the horizon so the key light never
 * lights the terrain from underneath. Floored is exactly wrong for this: the
 * whole shape of the bow is how far under the horizon its centre has sunk.
 */
export function bowPlace (
  time: number,
  year: number,
  latitude: number,
  axialTilt: number,
): SkyPlace {
  return {
    height: -sunHeight(time, year, latitude, axialTilt),
    swing:  sunSwing(time, year, latitude, axialTilt) + Math.PI,
  }
}

/**
 * How brightly the bow stands, 0..1.
 *
 * Three facts about one instant, multiplied, and none of them is a clock:
 *
 * - **the shower has to be half over.** `4 · cover · (1 − cover)` peaks where
 *   the front covers half the sky and falls to nothing at both ends of that,
 *   which is the whole behaviour worth having: no drops, no bow; no gap in the
 *   cloud, no sunlight to disperse. It puts the bow on the *edges* of a band
 *   rather than in the middle of one, and since `weather.ts` gives the front
 *   two bands, one pass of a front carries four of them. The factor of four is
 *   what makes a coast at `rain: 1` reach a full-strength bow rather than a
 *   quarter of one.
 * - **it has to be rain.** Snow does not disperse light into a spectrum, and
 *   the year already says what share of the fall is frozen.
 * - **the sun has to be up, and low.** `lit` is the sun clearing the horizon;
 *   `arc` is the bow's outer edge clearing it, from the other side. Above 51°
 *   there is no arc over the sea at all — at this latitude that never happens,
 *   and the number is here because the latitude is a slider.
 *
 * There is deliberately no term for the time of day beyond the sun's own
 * height, for the reason `auroraBrightness` has none for the week of the year:
 * `daylight.day` is solved from this same height, and a second gate on it would
 * be the same fact counted twice.
 */
export function bowLight (
  phase: number,
  rain: number,
  sleet: number,
  height: number,
  strength: number,
): number {
  const cover = showerAmount(phase)
  const drops = 4 * cover * (1 - cover) *
    Math.max(0, rain) *
    (1 - Math.min(1, Math.max(0, sleet)))
  const lit = smoothstep(SUN_UNDER, SUN_CLEAR, height)
  const arc = smoothstep(
    0,
    RISE * DEGREES,
    SECONDARY * DEGREES - Math.asin(Math.min(1, Math.max(-1, height))),
  )

  return Math.max(0, strength) * drops * lit * arc
}

/** How many points of the front the search for its best bow is resolved at. */
const PEAK_STEPS = 720

/**
 * The phase of the front the bow stands brightest at, 0..1.
 *
 * A property of the *front* and of nothing else: rain, sleet, the sun's height
 * and the strength are all constant factors on `bowLight`, so none of them can
 * move where its maximum falls. What decides it is the shape of the shower — so
 * this walks `showerAmount` looking for half cover, and a front reshaped in
 * `weather.ts` moves this with it rather than leaving a stale decimal behind.
 *
 * Walked rather than solved because the fall is a maximum over two overlapping
 * bands and has no closed form. There are four instants in a full cycle that
 * reach it — the two edges of each band — and this is the first of them, which
 * is the leading edge of the squall itself.
 *
 * One search rather than two: both the map's bow line and the capture harness's
 * `bow` poses aim at this, because two searches for one instant is how a stats
 * block ends up describing a frame nobody photographed.
 */
export function bowPeak (): number {
  let best  = 0
  let found = 0

  for (let step = 0; step < PEAK_STEPS; step += 1) {
    const phase = step / PEAK_STEPS
    const cover = showerAmount(phase)
    const drops = cover * (1 - cover)

    if (drops > best) {
      best  = drops
      found = phase
    }
  }

  return found
}

/**
 * How far out the bow hangs and how wide across it is, in metres.
 *
 * Frame-sized, both of them, and the second follows from the first: the arc is
 * a ring of half-angle 51° about a centre `reach` frames away, so its radius is
 * that distance times the tangent of the opening angle. Hang it further out and
 * every part of it grows in the same proportion, which is what makes `reach` a
 * composition knob and not a distance the reader has to think about.
 *
 * The one thing this must never be scaled by is the world. A bow sized against
 * the archipelago would be a bow that grew when an island was added to the far
 * side of the map, and there is no version of that which is right.
 */
type BowSpanReturnType = { out: number, size: number }

export function bowSpan (viewSize: number, reach: number): BowSpanReturnType {
  const out = viewSize * Math.max(0, reach)

  return { out, size: 2 * out * Math.tan(EDGE * DEGREES) }
}

/**
 * Where the sea cuts the arc, in the quad's own coordinates.
 *
 * The bow's centre is the antisolar point, which is under the horizon by
 * exactly the sun's own elevation while the sun is up — so the horizon crosses
 * the quad at that angle above its centre, and this is that angle written in
 * the units the fragment shader measures in: a share of the quad's half-width,
 * where 1 is its edge at {@link EDGE} degrees.
 *
 * An angle rather than a height in world metres, and that is a correction
 * rather than a preference. The quad is turned to face the camera, so a cut
 * made at the water's own `y` is foreshortened by the camera's tilt — and this
 * scape's tilt is a function of the *zoom*, sweeping from 21° to 52° across the
 * range. A world-height cut would therefore have taken a different share of the
 * same bow at every view, which is a rainbow that changes shape as the reader
 * scrolls. Cut in the sky's own angles and the apex clears the horizon by
 * exactly 42° less the sun's elevation at every zoom — which is also the number
 * `scape:map --stats` prints on the bow line, so the instrument and the picture
 * are reading one geometry.
 */
export function bowHorizon (height: number): number {
  const elevation = Math.asin(Math.min(1, Math.max(-1, height)))

  return Math.tan(elevation) / Math.tan(EDGE * DEGREES)
}

/**
 * How much of the quad the bow's feet take to dissolve, in the same units.
 *
 * An angle for the reason the horizon is one — rather than a distance in
 * metres, which would be the whole arc at the near zoom and invisible at the
 * far one.
 *
 * Eight degrees of it, which is a *long* way, and the length is the point. The
 * first version faded over three and the arc came out with a ruled line across
 * the bottom of it — two coloured ribbons stopping dead at the same height,
 * which is the single thing that made the bow read as a decal stuck on the sea
 * rather than as light standing in a shower. A bow does not end at the horizon,
 * it thins out into the rain it is standing in, and the fade is squared on top
 * of this so the taper starts early and gently.
 */
const FOOT = 0.13

const BOW_VERTEX = /* glsl */`
  varying vec2 vPlace;

  void main () {
    vPlace      = uv * 2.0 - 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * Two bands of dispersed sunlight, thinning out into the shower they stand in.
 *
 * The quad is flat and faces the camera, so the angle off the bow's centre is
 * the arctangent of the distance across it — `uEdge` is the tangent of the
 * quad's own half-angle, which turns a corner at `length(vPlace) == 1` back
 * into 58° of arc. Everything after that is in radians of sky, which is the
 * only space in which 42 and 51 mean anything.
 *
 * The spectrum is a hue ramp rather than a list of authored colours, because a
 * rainbow is the one thing in this scape whose colours are not a palette
 * decision — they are the visible spectrum in order, and any six colours picked
 * by hand would be an opinion about sunlight. Violet is the short end of the
 * ramp and red the long one; the primary runs violet inside to red outside and
 * the secondary runs the other way, which is what a second internal reflection
 * does and the easiest way to tell a real bow from a decorative one.
 *
 * What the first version got wrong was everything *around* the hue ramp, and
 * the result was a flat neon ribbon. Three things fix it, and all three are
 * things a real bow does:
 *
 * - **the band is not a bell.** every wavelength has one angle of minimum
 *   deviation; light piles up against it and spreads to one side of it only.
 *   so the profile is a hard lip on the red edge — outward for the primary,
 *   inward for the secondary — and a long soft tail past the violet, which is
 *   also why the sky just inside a primary bow is brighter than the sky beside
 *   it. a symmetrical bell has neither, and reads as a painted stripe.
 * - **the violet end is dim.** an even ramp is six equal stripes, which is a
 *   flag. `lumen` takes two thirds of the brightness out of the short end, and
 *   what is left is the red-orange-through-green a photograph actually shows.
 * - **no shower is even.** two slow waves along the arc vary the brightness
 *   down its length, because a bow of one unvarying weight from foot to foot is
 *   a decal however well it is coloured. they are functions of the angle round
 *   the bow and of nothing else — no clock, no noise texture, no seed — so the
 *   same frame captures the same bow.
 */
const BOW_FRAGMENT = /* glsl */`
  varying vec2 vPlace;

  uniform float uOpacity;
  uniform float uEdge;
  uniform float uWidth;
  uniform float uSecondary;
  uniform float uSaturation;
  uniform float uHorizon;
  uniform float uFoot;

  const float PRIMARY   = ${(PRIMARY * DEGREES).toFixed(6)};
  const float SECONDARY = ${(SECONDARY * DEGREES).toFixed(6)};
  const float SPREAD    = ${SECONDARY_SPREAD.toFixed(2)};

  /** The visible spectrum as one turn of hue: 0 is red, and the short end is 0.78. */
  vec3 spectrum (float hue) {
    return clamp(abs(mod(hue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  }

  /**
   * One band, measured from its own red edge.
   *
   * The edge is the angle the red piles up at, and the run is which way the rest of
   * the spectrum runs off it: -1 for the primary, whose red is outermost, and
   * +1 for the secondary, whose red is on the inside. So across is 0 at the
   * red, 1 at the violet, and keeps going into the spread beyond it.
   */
  vec3 band (float angle, float edge, float width, float run) {
    float across = (angle - edge) * run;
    float shade  = clamp(across / width, 0.0, 1.0);

    // The lip and the tail: light stops dead on the far side of the deviation
    // minimum and spreads a long way on the near side.
    float lip  = smoothstep(-width * 0.34, width * 0.05, across);
    float tail = 1.0 - smoothstep(width * 0.62, width * 1.75, across);

    // The short end of the spectrum is much the fainter half of a real bow.
    float lumen = 1.0 - 0.66 * shade;

    return mix(vec3(1.0), spectrum(shade * 0.78), uSaturation) * lip * tail * lumen;
  }

  void main () {
    float radius = length(vPlace);

    if (radius > 1.0)
      discard;

    float angle = atan(radius * uEdge);
    float outer = uWidth * SPREAD;

    // Each band is measured from its own red edge: the primary's is the outside
    // of the arc and the secondary's is the inside, which is the whole of what
    // a second internal reflection does to the picture.
    vec3 light = band(angle, PRIMARY + uWidth * 0.5, uWidth, -1.0) +
      band(angle, SECONDARY - outer * 0.5, outer, 1.0) * uSecondary;

    // Two slow waves down the length of the arc, because no shower is even and
    // a bow of one unvarying weight from foot to foot is a decal. The epsilon
    // keeps atan off the origin, where both arguments would be zero.
    //
    // Not called \`patch\`, which is what it wants to be called: that is a
    // reserved word once three's own prelude is in front of this, and it is
    // reserved in a way the raw text does not show — the shader compiles on its
    // own and fails to compile in the scape, so what it costs is a whole
    // capture run and a boot that hangs on the spinner with no page error.
    float along  = atan(vPlace.y, vPlace.x + 1e-5);
    float uneven = 0.58 + 0.42 *
      (0.5 + 0.5 * sin(along * 2.7 + 1.1)) *
      (0.55 + 0.45 * sin(along * 5.3 - 0.4));

    // The sea takes the feet, at the angle the sun's own height puts the horizon
    // at — see bowHorizon. An orthographic camera has no horizon of its own, so
    // there is no line across the picture to cut against; what there is, is the
    // one angle that says where the sea would be if there were. Squared, so the
    // taper starts early and the ends thin out instead of stopping.
    float foot = smoothstep(uHorizon, uHorizon + uFoot, vPlace.y);

    gl_FragColor = vec4(light * uOpacity * uneven * foot * foot, 1.0);
  }
`

/**
 * The bow: one camera-facing quad, hung a share of a frame out along the
 * antisolar bearing.
 *
 * The placement is the module. The centre goes at the antisolar point — under
 * the sea by however far the sun is up — and the arcs are drawn about it at
 * their true opening angles, so every behaviour a rainbow has falls out of the
 * geometry instead of being authored: it stands tall when the sun is low, sinks
 * as the sun climbs, is cut off at the waterline rather than ending in mid-air,
 * and swings round the compass opposite the sun through the day.
 *
 * A flat ring rather than a screen-space overlay because this camera is
 * orthographic. Every ray through an orthographic frame is parallel, so a bow
 * solved as a set of *directions* would either fill the sky or miss it entirely
 * — there is no field of view for 42° to be 42° of. Hanging a real ring of the
 * right opening angle one frame out is what recovers the proportions the eye
 * expects, and it has the second virtue of being a thing in the world: the far
 * islands write depth, so the bow stands behind them without the module ever
 * being told where the coastline is.
 *
 * Nothing here has a rate. The arc's place is a function of `daylight.time` and
 * `season.time` and its brightness a function of `weather.time`, all three of
 * which the capture harness already stops — so there is no knob in `STILL` for
 * the bow and deliberately none needed, for the same reason the tide has none.
 */
export function createRainbow ({
  camera,
  config,
  quality,
  weather,
}: RainbowOptions): ScapeModule | null {
  if (quality.rainbowArcs < 1)
    return null

  const geometry = new PlaneGeometry(1, 1)
  const material = new ShaderMaterial({
    name:           'rainbow',
    vertexShader:   BOW_VERTEX,
    fragmentShader: BOW_FRAGMENT,
    uniforms:       {
      uOpacity:    { value: 0 },
      uEdge:       { value: Math.tan(EDGE * DEGREES) },
      uWidth:      { value: 0 },
      uSecondary:  { value: 0 },
      uSaturation: { value: 0 },
      uHorizon:    { value: 0 },
      uFoot:       { value: FOOT },
    },
    transparent: true,
    depthWrite:  false,

    // Light added to the sky rather than laid over it, like the aurora and the
    // moon: dispersed sunlight is what the bow is made of, and it never darkens
    // the cloud behind it.
    blending: AdditiveBlending,

    // Unfogged. Linear fog fades by distance from the camera and this is hung
    // further out than anything else in the frame; leave it on and the bow
    // dissolves into the fog colour exactly where it is meant to appear.
    fog: false,
  })

  const bow         = new Mesh(geometry, material)
  bow.name          = 'rainbow'
  bow.renderOrder   = LAYER.rainbow
  bow.frustumCulled = false
  bow.visible       = false

  return defineModule<ScapeConfig>({
    name: 'rainbow',

    build (ctx) {
      ctx.scene.add(bow)
    },

    update () {
      const { latitude, axialTilt, time } = config().daylight
      const { rain }                      = config().weather
      const bowConfig                     = config().rainbow
      const year                          = config().season.time
      const span                          = deckViewSize(camera, config)
      const place                         = bowPlace(time, year, latitude, axialTilt)
      const light                         = bowLight(
        weather.phase,
        rain,
        weather.sleet,
        -place.height,
        bowConfig.strength,
      ) * bowReveal(span, config().camera)

      // Made invisible rather than transparent below the threshold: a quad this
      // size still costs every pixel it covers, and for most of a front — and
      // the whole of every night — it covers them with nothing.
      bow.visible = light > 0.004

      if (!bow.visible)
        return

      const focus         = deckFocus(camera)
      const bearing       = config().daylight.azimuth * DEGREES + place.swing
      const flat          = Math.sqrt(Math.max(0, 1 - place.height * place.height))
      const { out, size } = bowSpan(span, bowConfig.reach)

      // Turned to face the camera, like the moon and for the same reason: a ring
      // lying on a deck is seen at the camera's own tilt, and a rainbow squashed
      // to two thirds of its height is not a rainbow.
      bow.quaternion.copy(camera.quaternion)
      bow.scale.setScalar(size)
      bow.position.set(
        focus[0] + Math.sin(bearing) * flat * out,
        config().terrain.waterLevel + place.height * out,
        focus[2] + Math.cos(bearing) * flat * out,
      )

      material.uniforms.uOpacity.value    = light
      material.uniforms.uWidth.value      = bowConfig.width * DEGREES
      material.uniforms.uSaturation.value = Math.min(1, Math.max(0, bowConfig.saturation))
      material.uniforms.uHorizon.value    = bowHorizon(-place.height)

      // The tier's own answer, and the config's, in that order: a tier that
      // grants one arc gets one arc whatever the slider says, and a tier that
      // grants two lets the reader decide how much of the second one there is.
      material.uniforms.uSecondary.value = quality.rainbowArcs > 1
        ? Math.min(1, Math.max(0, bowConfig.secondary))
        : 0
    },

    dispose () {
      bow.removeFromParent()
      geometry.dispose()
      material.dispose()
    },
  })
}

// perf: one unlit additive quad, no texture, no geometry beyond four vertices,
// and drawn only while a front is half over and the sun is up — which on the
// default weather is a couple of stretches in each pass of a front and none of
// any night. The fragment cost is two band tests and up to two hue ramps over
// whatever share of the frame the quad covers; `rainbowArcs` is what takes the
// second of those away from a phone.
