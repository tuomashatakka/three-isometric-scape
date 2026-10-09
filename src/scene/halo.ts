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
import { bowReveal } from './rainbow.ts'
import { deckFocus, deckViewSize } from './sky-deck.ts'
import type { SkyPlace } from './sky-deck.ts'
import { showerAmount } from './weather.ts'
import type { WeatherState } from './weather.ts'
import { LAYER } from './layers.ts'


export interface HaloOptions {
  camera:  OrthographicCamera
  config:  LiveConfig
  quality: AtmosphereQuality

  /** Live weather. The ring is read off the same front the bow is, one lead ahead of it. */
  weather: WeatherState
}

const DEGREES = Math.PI / 180

/**
 * Refractive index of ice for visible light.
 *
 * Not a knob, and the reason the module can call itself a halo rather than a
 * drawn circle. 1.31 is what ice does to light, and every angle below is solved
 * from it: the ring, the mock suns, and the elevation at which the mock suns
 * stop existing. Water's 1.333 is what `rainbow.ts` is standing on, nine
 * hundredths away and a completely different sky.
 */
export const ICE_INDEX = 1.31

/**
 * The prism angle a hexagonal ice crystal presents, in degrees.
 *
 * A six-sided column has two useful pairs of faces: alternate sides meet at
 * 60°, and a side meets an end cap at 90°. The 60° pair is the one the common
 * ring and the mock suns are made of; the 90° pair makes a much rarer 46° ring
 * this scape does not draw, which is why there is one constant here and not
 * two.
 */
const PRISM = 60

/**
 * Where the ring stands, in degrees of arc.
 *
 * The angle of minimum deviation of a 60° ice prism — `2·asin(n·sin 30°) − 60`
 * at {@link ICE_INDEX} — and it is written out rather than solved at load
 * because it is the one number in the module a reader is likely to want to
 * recognise. Light piles up against it and spreads outward from it, which is
 * what makes a ring with a sharp inside and a soft outside rather than a band.
 */
export const HALO_RING = 21.84

/**
 * Half-angle of the quad the optics are drawn on, in degrees.
 *
 * Far enough out to hold the widest mock sun this scape can produce, plus its
 * outward tail. The parhelion angle runs from 21.84° at a sun on the horizon
 * and grows with it — 24° at 20°, 32.5° at 36° — and {@link dogLight} has the
 * dogs gone by 45°, where the angle is 41.5°. Several degrees of margin on top
 * of that, because every glow here reaches zero by falling off rather than by
 * stopping, and a quad that clipped one would put a straight cut across it.
 */
const EDGE = 50

/** Where the sun has to stand before its light is worth refracting. Sines. */
const SUN_UNDER = -0.01
const SUN_CLEAR = 0.07

/**
 * How far the feet of the ring take to dissolve into the sea, in quad units.
 *
 * The bow's number and the bow's argument: an optic does not end at the
 * horizon, it thins out into the air it is standing in, and a fade short enough
 * to read as a line puts a ruled cut across the bottom of the picture. Squared
 * in the shader on top of this, so the taper starts early.
 */
const FOOT = 0.11

/**
 * Where the shaft gives out, in degrees of solar elevation.
 *
 * A pillar is sunlight bounced off the flat underside of a settling plate
 * crystal, so what the eye sees is the sun reflected in a drift of tiny
 * horizontal mirrors — and a mirror lying flat throws a high sun away from the
 * viewer rather than towards them. The column is therefore a thing of the hour
 * either side of sunrise and sunset and of no other, and this is the elevation
 * by which it has gone. There is no knob saying so: `halo.pillar` is how bright
 * the shaft is when there is one, and this is whether there is one.
 */
const PILLAR_TOP = 9

/**
 * Where the mock suns stand, in degrees from the sun — or `null` where there
 * are none.
 *
 * The one piece of optics in this scape that *runs out*, and the whole reason
 * the parhelia are worth solving rather than pinning to the ring. A plate
 * crystal lies flat, so a sun above the horizon meets its 60° faces at a slant
 * — and light crossing a prism at a slant behaves as though the prism had a
 * larger index than it has. That effective index is
 * `sqrt(n² − sin²h) / cos h`, and feeding it through the same minimum-deviation
 * formula the ring uses gives an angle that *grows* with the sun: 21.84° on the
 * horizon, a little under 25° at 20°, 36.3° at 40°.
 *
 * Past about 60.75° the refraction stops being possible at all — the effective
 * index passes 2 and `asin` runs out of range — and the mock suns are simply
 * gone. That is the physics and not a gate: a reader who drags `latitude` down
 * to the tropics gets a scape with a ring and no dogs in the middle of the day,
 * which is the correct sky for that latitude.
 */
export function parhelionAngle (height: number): number | null {
  const sine = Math.min(1, Math.max(-1, height))
  const flat = Math.sqrt(Math.max(0, 1 - sine * sine))

  if (flat < 1e-4)
    return null

  const effective = Math.sqrt(Math.max(0, ICE_INDEX * ICE_INDEX - sine * sine)) / flat
  const refracted = effective * Math.sin(PRISM * 0.5 * DEGREES)

  if (refracted >= 1)
    return null

  return 2 * Math.asin(refracted) / DEGREES - PRISM
}

/**
 * Where the mock suns start to fade and where they have gone, in degrees of
 * solar elevation.
 *
 * {@link parhelionAngle} says where a parhelion *can* stand and these say
 * whether anyone would see one there. The two are different questions: the
 * refraction stays geometrically possible until 60.75°, but the patch spreads
 * further round the sky and thins as the sun climbs, and by the middle of a
 * temperate day there is nothing left of it to photograph. Fading rather than
 * cutting, because a mock sun that switched off at a threshold would pop.
 *
 * On this coast the fade never bites: the fall only freezes in the weeks either
 * side of the polar night, and the sun does not clear 11° in any of them. It is
 * here because `daylight.latitude` is a slider, and a reader who drags the
 * coast down to the tropics should get a ring with no dogs on it rather than
 * two patches hanging off the edge of the quad.
 */
const DOG_FULL = 20
const DOG_GONE = 45

/**
 * How much of the mock suns the sun's height leaves standing, 0..1.
 *
 * Its own function so a test can state the claim — that a parhelion is a
 * low-sun sight — as a fact about the numbers rather than as a sentence in the
 * readme.
 */
export function dogLight (height: number): number {
  const elevation = Math.asin(Math.min(1, Math.max(-1, height))) / DEGREES

  return 1 - smoothstep(DOG_FULL, DOG_GONE, elevation)
}

/**
 * How much of the shaft the sun's height leaves standing, 0..1.
 *
 * Its own function so a test can state the claim — that the pillar is a
 * low-sun sight and nothing else — as a fact about the numbers rather than as
 * a sentence in the readme.
 */
export function pillarLight (height: number): number {
  const elevation = Math.asin(Math.min(1, Math.max(-1, height))) / DEGREES

  return 1 - smoothstep(0, PILLAR_TOP, elevation)
}

/**
 * Where the ring's centre is: the sun, and nothing else.
 *
 * The claim the module rests on, written as one function so a test can state it
 * as a fact about the numbers. A halo is a circle drawn about the sun itself —
 * which is why, unlike the bow, it is a thing you see by looking *towards* the
 * light, why it climbs through the morning instead of sinking, and why the sea
 * takes the bottom of it only while the sun is lower than the ring is wide.
 *
 * Solved from `daylight.ts` rather than read off `DaylightState` for
 * `bowPlace`'s reason: that record carries a lighting direction, floored just
 * above the horizon so the key light never lights the terrain from underneath.
 * Floored is exactly wrong here — how far the ring has sunk is the whole shape
 * of the picture.
 */
export function haloPlace (
  time: number,
  year: number,
  latitude: number,
  axialTilt: number,
): SkyPlace {
  return {
    height: sunHeight(time, year, latitude, axialTilt),
    swing:  sunSwing(time, year, latitude, axialTilt),
  }
}

/**
 * How much ice veil the front has over the sun at a phase, 0..1.
 *
 * The term that puts the halo on the other side of the weather from the bow,
 * and it is one line because the front already carries the only clock either of
 * them needs. `showerAmount(phase + lead)` is the band that has not arrived
 * yet; `1 − showerAmount(phase)` is how little is falling here while it
 * approaches. Multiply them and the peak lands on the *approach* to a band —
 * where `bowLight` peaks on the half-cover edges and the rain itself peaks in
 * the middle.
 *
 * This is the oldest piece of weather lore there is, written as a product: high
 * ice cloud runs hours ahead of a front, so a ring round the sun is the sky
 * saying the rain is coming. Nothing here knows that; it falls out of sampling
 * one curve twice.
 */
export function haloVeil (phase: number, lead: number): number {
  return showerAmount(phase + lead) * (1 - showerAmount(phase))
}

/**
 * How brightly the ring stands, 0..1.
 *
 * Three facts about one instant, multiplied, and `bowLight`'s shape on purpose
 * — the two are halves of one system and a reader comparing them should be able
 * to put them side by side:
 *
 * - **the veil has to be ahead of the fall.** see {@link haloVeil}.
 * - **it has to be ice.** a drop refracts light into a bow and a crystal
 *   refracts it into a ring, and the year already says what share of the fall
 *   is frozen. This is `bowLight`'s `1 − sleet` turned over, which makes the
 *   frozen share the one thing in the scape that chooses between the two
 *   optics: a week of rain gets the bow and none of the ring, a week of snow
 *   gets the ring and none of the bow, and the fortnight of sleet between them
 *   gets a weakened version of each — which is exactly what that sky does.
 * - **the sun has to be up.** and only up. unlike the bow there is no ceiling,
 *   because a ring is centred on the sun and climbs with it — what a high sun
 *   takes away is the mock suns and the pillar, and both of those take
 *   themselves away from their own geometry rather than from a term here.
 */
export function haloLight (
  phase: number,
  rain: number,
  sleet: number,
  height: number,
  strength: number,
  lead: number,
): number {
  const veil = haloVeil(phase, lead) *
    Math.max(0, rain) *
    Math.min(1, Math.max(0, sleet))
  const lit  = smoothstep(SUN_UNDER, SUN_CLEAR, height)

  return Math.max(0, strength) * veil * lit
}

/** How many points of the front the search for its best veil is resolved at. */
const PEAK_STEPS = 720

/**
 * The phase of the front the ring stands brightest at, 0..1.
 *
 * A property of the front and of the lead, and of nothing else: the fall, the
 * frozen share, the sun's height and the strength are all constant factors on
 * {@link haloLight}, so none of them can move where its maximum falls. Walked
 * rather than solved for `bowPeak`'s reason — the shower is a maximum over two
 * overlapping bands and has no closed form — and one search rather than two, so
 * the `scape:map` line and the capture harness's `halo` poses are aimed at the
 * same instant.
 */
export function haloPeak (lead: number): number {
  let best  = 0
  let found = 0

  for (let step = 0; step < PEAK_STEPS; step += 1) {
    const phase = step / PEAK_STEPS
    const veil  = haloVeil(phase, lead)

    if (veil > best) {
      best  = veil
      found = phase
    }
  }

  return found
}

/**
 * How far out the ring hangs and how wide across it is, in metres.
 *
 * `bowSpan`'s arithmetic, kept here rather than imported, because the two have
 * different {@link EDGE}s and a shared helper would have had to take one as an
 * argument — which is a function whose whole body is a multiplication and whose
 * signature is longer than it is.
 */
type HaloSpanReturnType = { out: number, size: number }

export function haloSpan (viewSize: number, reach: number): HaloSpanReturnType {
  const out = viewSize * Math.max(0, reach)

  return { out, size: 2 * out * Math.tan(EDGE * DEGREES) }
}

/**
 * Where the sea cuts the ring, in the quad's own coordinates.
 *
 * The bow's correction with the sign the other way up. The quad is turned to
 * face the camera, so a cut made at the water's own `y` would be foreshortened
 * by a tilt that is itself a function of the zoom — a ring that changed shape
 * as the reader scrolled. Cut in the sky's own angles instead and the horizon
 * sits exactly the sun's elevation *below* the centre at every view, which is
 * also the number `scape:map --stats` prints, so the instrument and the picture
 * are reading one geometry.
 */
export function haloHorizon (height: number): number {
  const elevation = Math.asin(Math.min(1, Math.max(-1, height)))

  return -Math.tan(elevation) / Math.tan(EDGE * DEGREES)
}

const HALO_VERTEX = /* glsl */`
  varying vec2 vPlace;

  void main () {
    vPlace      = uv * 2.0 - 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * A ring, two mock suns and a shaft, all about the same centre.
 *
 * The quad is flat and faces the camera, so the angle off the sun is the
 * arctangent of the distance across it — `uEdge` is the tangent of the quad's
 * own half-angle, which turns a corner at `length(vPlace) == 1` back into 44°
 * of arc. Everything after that is in radians of sky, which is the only space
 * in which 21.84 means anything.
 *
 * **The quad's `y` is the sky's up.** This camera has a yaw and a pitch and no
 * roll, so a camera-facing quad has the horizon running square across it, and
 * the two directions the mock suns and the pillar need — along the horizontal
 * circle through the sun, and straight up through it — are the quad's own axes.
 * A camera that could roll would need the world's up projected into the quad
 * and passed in; this one would be passing in a constant.
 *
 * Three optics, and each one is a different thing happening to the light:
 *
 * - **the ring** is refraction through tumbling crystals, so it is the same all
 *   the way round and its red is on the *inside* — a prism bends the short
 *   wavelengths further, and the minimum deviation the light piles up against
 *   is therefore smallest for red. That one fact is the whole visual difference
 *   between this and the primary bow, and it is why the ramp runs outward into
 *   white rather than through to violet: past the yellow the colours overlap
 *   each other and wash out, which is what a photograph of a real halo shows.
 * - **the mock suns** are the same refraction through crystals that have
 *   settled flat, so instead of a circle the light lands in two patches on the
 *   horizontal through the sun — red on the side facing it, drawing out into a
 *   long white tail away from it. Where they sit is {@link parhelionAngle} and
 *   it moves with the sun.
 * - **the pillar** is not refraction at all. It is the sun reflected in the
 *   undersides of those same settling plates, so it has no spectrum, no edge
 *   and no fixed angle — just a column, as tall as the drift of crystals is
 *   deep, and gone as soon as the sun is high enough to be bouncing its light
 *   somewhere other than at the reader.
 */
const HALO_FRAGMENT = /* glsl */`
  varying vec2 vPlace;

  uniform float uOpacity;
  uniform float uEdge;
  uniform float uUnit;
  uniform float uWidth;
  uniform float uDogs;
  uniform float uDogPlace;
  uniform float uPillar;
  uniform float uSaturation;
  uniform float uHorizon;
  uniform float uFoot;

  const float RING = ${(HALO_RING * DEGREES).toFixed(6)};

  /** The visible spectrum as one turn of hue: 0 is red, and the short end is 0.78. */
  vec3 spectrum (float hue) {
    return clamp(abs(mod(hue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  }

  /**
   * Refracted light, coloured by how far across its own band it has landed.
   *
   * 0 is the red edge and 1 is the far side of the band. The hue only runs a
   * sixth of a turn — red to yellow — and the rest of the way across is a fade
   * into white, because in a real halo the longer wavelengths are spread over
   * the shorter ones well before the blue end and there is no violet in it to
   * find.
   */
  vec3 refracted (float shade) {
    vec3 hue = mix(spectrum(shade * 0.17), vec3(1.0), smoothstep(0.1, 0.85, shade));

    return mix(vec3(1.0), hue, uSaturation);
  }

  /** The ring: a hard red lip at 21.84° and a wash outward from it. */
  vec3 ring (float angle) {
    float across = angle - RING;
    float shade  = clamp(across / uWidth, 0.0, 1.0);
    float lip    = smoothstep(-uWidth * 0.30, uWidth * 0.06, across);
    float tail   = 1.0 - smoothstep(uWidth * 0.45, uWidth * 2.1, across);

    // The inside of a halo is darker than the sky beside it, because every
    // crystal that could have sent light there sent it outward instead. There
    // is nothing additive can do about that, so the ring simply stops: the lip
    // is the floor of the picture and the hole inside it is the sky's own.
    return refracted(shade) * lip * tail;
  }

  /**
   * One mock sun, measured from its own centre.
   *
   * \`hand\` is which side it is on. The patch is narrow across, narrower still
   * on the side towards the sun, and drawn out into a tail several degrees long
   * away from it — which is the shape the aligned crystals' own spread of tilts
   * produces, and the reason a parhelion is recognisable at a glance from a
   * bright patch of cloud.
   */
  vec3 dog (vec2 place, float hand) {
    vec2  off    = place - vec2(hand * uDogPlace, 0.0);
    float along  = off.x * hand;
    float across = off.y / (1.4 * uUnit);
    float run    = along < 0.0
      ? along / (0.9 * uUnit)
      : along / (4.2 * uUnit);
    float glow   = exp(-(across * across + run * run));

    return refracted(smoothstep(-0.9 * uUnit, 3.4 * uUnit, along)) * glow;
  }

  /**
   * The shaft: a colourless column standing through the sun.
   *
   * Narrow and long, and the proportion is the whole of it. The first pass was
   * 2.2° across against 14° tall, and at this ring's size in the frame that is
   * a round blob sitting in the middle of the circle — which reads as a lens
   * artefact, or as the sun itself drawn twice. A real pillar is about as wide
   * as the sun and ten to twenty times as tall, so it is one eighth the width
   * and half again the reach, and what the eye gets is a column.
   */
  float pillar (vec2 place) {
    float across = place.x / (2.0 * uUnit);
    float along  = abs(place.y) / (18.0 * uUnit);

    return exp(-across * across) * (1.0 - smoothstep(0.0, 1.0, along));
  }

  void main () {
    float radius = length(vPlace);

    if (radius > 1.0)
      discard;

    float angle = atan(radius * uEdge);
    vec3  light = ring(angle);

    if (uDogs > 0.0 && uDogPlace > 0.0)
      light += (dog(vPlace, 1.0) + dog(vPlace, -1.0)) * uDogs;

    if (uPillar > 0.0)
      light += vec3(pillar(vPlace)) * uPillar;

    // The sea takes the feet, at the angle the sun's own height puts the horizon
    // at — see haloHorizon. An orthographic camera has no horizon of its own, so
    // there is no line across the picture to cut against; what there is, is the
    // one angle that says where the sea would be if there were. Squared, so the
    // taper starts early and the ends thin out instead of stopping.
    float foot = smoothstep(uHorizon, uHorizon + uFoot, vPlace.y);

    gl_FragColor = vec4(light * uOpacity * foot * foot, 1.0);
  }
`

/**
 * The halo: one camera-facing quad, hung a share of a frame out along the solar
 * bearing.
 *
 * The placement is the module, and it is `rainbow.ts`'s placement with the
 * centre moved to the other end of the sky. Put the quad on the sun and draw
 * the optics about it at their true angles, and every behaviour a halo has
 * falls out of the geometry instead of being authored: the ring climbs with the
 * sun rather than sinking away from it, the sea takes the bottom of it at
 * sunrise and nothing else does, the mock suns walk outward as the morning goes
 * on and vanish if the sun ever gets high enough, and the pillar is a thing of
 * the first and last hour of the day.
 *
 * A flat ring rather than a screen-space overlay for the bow's reason: this
 * camera is orthographic, every ray through its frame is parallel, and an optic
 * solved as a set of *directions* would either fill the sky or miss it
 * entirely. Hanging a real ring of the right opening angle one frame out is
 * what recovers the proportions the eye expects, and it has the second virtue
 * of being a thing in the world — the far islands write depth, so the ring
 * stands behind them without the module ever being told where the coast is.
 *
 * Nothing here has a rate. The ring's place is a function of `daylight.time`
 * and `season.time` and its brightness a function of `weather.time`, all three
 * of which the capture harness already stops — so there is no knob in `STILL`
 * for the halo and deliberately none needed, for the reason the bow has none.
 */
export function createHalo ({
  camera,
  config,
  quality,
  weather,
}: HaloOptions): ScapeModule | null {
  if (quality.haloArcs < 1)
    return null

  const geometry = new PlaneGeometry(1, 1)
  const material = new ShaderMaterial({
    name:           'halo',
    vertexShader:   HALO_VERTEX,
    fragmentShader: HALO_FRAGMENT,
    uniforms:       {
      uOpacity:    { value: 0 },
      uEdge:       { value: Math.tan(EDGE * DEGREES) },
      uUnit:       { value: DEGREES / Math.tan(EDGE * DEGREES) },
      uWidth:      { value: 0 },
      uDogs:       { value: 0 },
      uDogPlace:   { value: 0 },
      uPillar:     { value: 0 },
      uSaturation: { value: 0 },
      uHorizon:    { value: 0 },
      uFoot:       { value: FOOT },
    },
    transparent: true,
    depthWrite:  false,

    // Light added to the sky rather than laid over it, like the bow and the
    // aurora: refracted sunlight is what the ring is made of, and it never
    // darkens the cloud behind it.
    blending: AdditiveBlending,

    // Unfogged, for the bow's reason. Linear fog fades by distance from the
    // camera and this is hung further out than anything else in the frame;
    // leave it on and the ring dissolves into the fog colour exactly where it
    // is meant to appear.
    fog: false,
  })

  const ring         = new Mesh(geometry, material)
  ring.name          = 'halo'
  ring.renderOrder   = LAYER.halo
  ring.frustumCulled = false
  ring.visible       = false

  return defineModule<ScapeConfig>({
    name: 'halo',

    build (ctx) {
      ctx.scene.add(ring)
    },

    update () {
      const { latitude, axialTilt, time } = config().daylight
      const { rain }                      = config().weather
      const haloConfig                    = config().halo
      const year                          = config().season.time
      const span                          = deckViewSize(camera, config)
      const place                         = haloPlace(time, year, latitude, axialTilt)
      const light                         = haloLight(
        weather.phase,
        rain,
        weather.sleet,
        place.height,
        haloConfig.strength,
        haloConfig.lead,
      ) * bowReveal(span, config().camera)

      // Made invisible rather than transparent below the threshold, for the
      // bow's reason: a quad this size still costs every pixel it covers, and
      // for most of a year it covers them with nothing.
      ring.visible = light > 0.004

      if (!ring.visible)
        return

      const focus         = deckFocus(camera)
      const bearing       = config().daylight.azimuth * DEGREES + place.swing
      const flat          = Math.sqrt(Math.max(0, 1 - place.height * place.height))
      const { out, size } = haloSpan(span, haloConfig.reach)

      // Turned to face the camera, like the bow and the moon and for the same
      // reason: a ring lying on a deck is seen at the camera's own tilt, and a
      // halo squashed to two thirds of its height is not a halo.
      ring.quaternion.copy(camera.quaternion)
      ring.scale.setScalar(size)
      ring.position.set(
        focus[0] + Math.sin(bearing) * flat * out,
        config().terrain.waterLevel + place.height * out,
        focus[2] + Math.cos(bearing) * flat * out,
      )

      // The tier's own answer, and the config's, in that order: a tier that
      // grants one optic gets the ring whatever the sliders say, and a tier
      // that grants both lets the reader decide how much of the second there
      // is. The mock suns and the shaft are one grant rather than two because
      // they are one fact about the crystals — that some of them have settled
      // flat — seen twice.
      const plates = quality.haloArcs > 1
      const dog    = plates
        ? parhelionAngle(place.height)
        : null
      const dogs   = dog === null
        ? 0
        : Math.max(0, haloConfig.dogs) * dogLight(place.height)

      material.uniforms.uOpacity.value    = light
      material.uniforms.uWidth.value      = haloConfig.width * DEGREES
      material.uniforms.uSaturation.value = Math.min(1, Math.max(0, haloConfig.saturation))
      material.uniforms.uHorizon.value    = haloHorizon(place.height)
      material.uniforms.uDogs.value       = dogs
      material.uniforms.uDogPlace.value   = dog === null || dogs <= 0
        ? 0
        : Math.tan(dog * DEGREES) / Math.tan(EDGE * DEGREES)
      material.uniforms.uPillar.value = plates
        ? Math.max(0, haloConfig.pillar) * pillarLight(place.height)
        : 0
    },

    dispose () {
      ring.removeFromParent()
      geometry.dispose()
      material.dispose()
    },
  })
}

// perf: one unlit additive quad, no texture, no geometry beyond four vertices,
// and drawn only while a front is running its ice veil over a sun that is up in
// a week cold enough to freeze the fall — which on this coast is a few weeks
// either side of the polar night and none of midsummer at all. The fragment
// cost is one band test plus, on the two tiers that grant them, two gaussians
// and a column over whatever share of the frame the quad covers; `haloArcs` is
// what takes those away from a phone.
