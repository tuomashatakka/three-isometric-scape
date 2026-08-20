import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  PlaneGeometry,
  Points,
  ShaderMaterial,
} from 'three'
import type { OrthographicCamera } from 'three'
import { createSeededRng, defineModule } from 'threejs-scene'
import type { AppModule, SeededRng } from 'threejs-scene'
import type { ScapeConfig } from './config.ts'
import { bodyHeight, bodySwing, declination } from './daylight.ts'
import type { DaylightState } from './daylight.ts'
import type { AtmosphereQuality } from './quality.ts'
import { deckFocus, deckReveal, deckViewSize } from './sky-deck.ts'


export interface NightSkyOptions {
  camera:  OrthographicCamera
  config:  ScapeConfig
  quality: AtmosphereQuality

  /** Live sky state. The stars are only ever in the part of it the sun has left. */
  daylight: DaylightState
}

const TAU     = Math.PI * 2
const DEGREES = Math.PI / 180

/**
 * Synodic months in one turn of the year clock.
 *
 * The moon is not a fourth clock. It is the two the scape already has, read
 * against each other: this is the only number the month costs, and it is a
 * count of lunations in a year rather than a phase and a speed of its own. Turn
 * `season.speed` down and the month slows with the year; stop it and the moon
 * holds its phase, which is what a capture needs and why there is nothing to
 * add to `STILL` for it.
 */
export const LUNATIONS = 12.368

/** Phase of the month at a phase of the year, 0..1. 0 is new, 0.5 is full. */
export function moonPhase (year: number): number {
  const turns = year * LUNATIONS

  return turns - Math.floor(turns)
}

/**
 * Lit fraction of the disc at a phase of the month, 0..1.
 *
 * The projected width of a lit hemisphere, which is the same cosine the
 * terminator in the fragment shader is drawn from — one expression, so the
 * brightness of the moon and the shape of it can never disagree.
 */
export function moonIllumination (phase: number): number {
  const wrapped = phase - Math.floor(phase)

  return (1 - Math.cos(wrapped * TAU)) / 2
}

/** Where a body stands: the sine of its elevation, and its bearing off transit. */
export interface SkyPlace {
  height: number
  swing:  number
}

/**
 * Where the moon stands.
 *
 * The moon is modelled as a body on the sun's own arc, displaced by the month
 * in the two ways a month displaces it: a phase *behind* in hour angle, so a
 * full moon transits at midnight and a first quarter at dusk, and a lunation
 * *ahead* along the ecliptic, so its declination is the sun's a month later.
 *
 * That second term is the one worth having. Share the sun's declination and the
 * midwinter full moon skims the horizon the midwinter sun does, which is the
 * opposite of what a northern winter actually looks like — the low sun and the
 * high full moon are the same tilt seen from opposite ends of the ecliptic, and
 * this is where that falls out instead of being drawn on.
 */
export function moonPlace (
  time: number,
  year: number,
  latitude: number,
  axialTilt: number,
): SkyPlace {
  const phase = moonPhase(year)
  const dec   = declination(year + phase, axialTilt)
  const hour  = time - phase

  return { height: bodyHeight(hour, dec, latitude), swing: bodySwing(hour, dec, latitude) }
}

/**
 * How bright the star field is, for a sky of a given darkness.
 *
 * The same one gate the aurora has, and the same reason: `daylight.dark` is
 * astronomical twilight solved from where the sun actually stands this week, so
 * the hour of the day and the week of the year are already the same number. A
 * midsummer midnight at this latitude never gets a star, and that is geometry
 * rather than a curve of the year laid over the top.
 */
export function starlightAmount (dark: number, strength: number): number {
  return Math.max(0, strength) * Math.min(1, Math.max(0, dark))
}

/**
 * How bright the moon is, for a sky of a given darkness and a phase of month.
 *
 * Softer on the twilight than the stars are. A gibbous moon is plainly visible
 * in a blue afternoon sky and a fourth-magnitude star is not, so the disc opens
 * on the square root of the same darkness the field opens on — up long before
 * the sky is properly out, the way the real one is.
 */
export function moonlightAmount (dark: number, phase: number, strength: number): number {
  const sky = Math.sqrt(Math.min(1, Math.max(0, dark)))

  return Math.max(0, strength) * sky * (0.12 + 0.88 * moonIllumination(phase))
}

/**
 * Radius of the deck's horizon, as a fraction of the live frame.
 *
 * Every extent in this module is frame-sized, and none of them is world-sized.
 * A sky is at infinity: it does not get closer when the eye travels and it does
 * not get bigger when the eye pulls back, so the whole deck is pinned to the
 * camera's focus, scaled by the live view, and turned by the hour. Size it from
 * `worldSize` instead — the first thing this module actually did — and the
 * archipelago's own 520 metres spreads a night's worth of stars over eight
 * frames of open sea, which puts a dozen of them on screen and reads as a
 * blank sky with some dust in it.
 *
 * This particular one is the circle a body low on the horizon rides on: the
 * moon at the zenith sits on the focus, and the moon rising sits out here.
 */
const HORIZON_FRACTION = 0.34

/** Diameter of the disc, as a fraction of the live frame. */
const MOON_FRACTION = 0.045

/** Metres of clearance the star deck keeps above the auroral one. */
const CLEARANCE = 6

/**
 * Radius of the star deck, as a fraction of the live frame.
 *
 * Half a frame is the frame; this is enough over it to cover the corners, the
 * tilt that stretches the sheet along the view, and the parallax between a deck
 * fifty metres up and the ground it is drawn over.
 */
const DECK_SPREAD = 0.78

/** Share of the field pulled into the galactic band. */
const BAND_SHARE = 0.44

/** Half-width of that band, as a fraction of the deck radius. */
const BAND_WIDTH = 0.075

/** Point size in device pixels, at the faintest star and at the brightest. */
const SIZE_FAINT  = 1.1
const SIZE_BRIGHT = 3.8

/** How far a body has to clear the horizon before it is drawn, in sines of elevation. */
const RISEN = 0.06

const STAR_VERTEX = /* glsl */`
  attribute float aSize;
  varying vec3 vTone;
  uniform float uScale;

  void main () {
    vTone           = color;
    vec4 view       = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize    = aSize * uScale;
    gl_Position     = projectionMatrix * view;
  }
`

const STAR_FRAGMENT = /* glsl */`
  varying vec3 vTone;
  uniform float uOpacity;

  void main () {
    // A round star rather than a square one, and soft enough at the rim that a
    // one-pixel point does not alias into a flicker as the field turns.
    float falloff = 1.0 - smoothstep(0.1, 0.5, length(gl_PointCoord - 0.5));

    if (falloff <= 0.0)
      discard;

    gl_FragColor = vec4(vTone * falloff * uOpacity, 1.0);
  }
`

const MOON_VERTEX = /* glsl */`
  varying vec2 vPlace;

  void main () {
    vPlace      = uv * 2.0 - 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * The disc, its terminator and the ash on its dark side.
 *
 * The terminator is an ellipse across the face whose semi-minor axis is the
 * cosine of the month — the projection of a lit hemisphere, which is the one
 * shape that gives a crescent at the ends of the month, a straight edge at the
 * quarters and no edge at all at either extreme. Waxing lights the limb the
 * sun is on and waning the other, so the horns turn over halfway through the
 * month instead of the whole face simply brightening and dimming.
 */
const MOON_FRAGMENT = /* glsl */`
  varying vec2 vPlace;
  uniform float uPhase;
  uniform float uOpacity;
  uniform vec3 uTone;

  const float TAU = 6.2831853;

  void main () {
    float radius = length(vPlace);

    if (radius > 1.0)
      discard;

    float disc = 1.0 - smoothstep(0.93, 1.0, radius);
    float limb = cos(uPhase * TAU) * sqrt(max(0.0, 1.0 - vPlace.y * vPlace.y));
    float soft = 0.06 + 0.2 * abs(cos(uPhase * TAU));
    float lit  = uPhase < 0.5
      ? smoothstep(limb - soft, limb + soft, vPlace.x)
      : smoothstep(-limb + soft, -limb - soft, vPlace.x);

    // Earthshine. The unlit face of a real crescent is not black — it is the
    // ocean lighting it back — and without the term the young moon reads as a
    // scratch on the sky rather than as a sphere.
    gl_FragColor = vec4(uTone * disc * (0.07 + 0.93 * lit) * uOpacity, 1.0);
  }
`

/** One star's place on the deck, in metres from its centre. */
interface StarPlace {
  x: number
  z: number
}

function scatterStar (rng: SeededRng, radius: number, band: number): StarPlace {
  if (rng.next() >= BAND_SHARE) {
    // Uniform over the disc: the square root is what stops a plain pair of
    // polars piling the whole field into the middle of the sky.
    const spread  = radius * Math.sqrt(rng.next())
    const bearing = rng.next() * TAU

    return { x: Math.cos(bearing) * spread, z: Math.sin(bearing) * spread }
  }

  // The galactic band. Three uniforms summed is a serviceable bell without a
  // transcendental in it, and a band is the one piece of structure that stops a
  // scattered field reading as noise.
  //
  // The chord is shortened to the circle rather than the whole placement being
  // rejected and drawn again: a band laid across a disc runs past the rim at its
  // ends, and re-drawing would take a variable number of numbers out of the rng
  // and make the field's determinism depend on how many times it missed.
  const across = (rng.next() + rng.next() + rng.next() - 1.5) * BAND_WIDTH * radius
  const chord  = Math.sqrt(Math.max(0, radius * radius - across * across))
  const along  = (rng.next() * 2 - 1) * chord

  return {
    x: Math.cos(band) * along - Math.sin(band) * across,
    z: Math.sin(band) * along + Math.cos(band) * across,
  }
}

/**
 * The field: positions, per-star colour and per-star size.
 *
 * Brightness is cubed off a uniform draw, which is roughly how magnitudes fall
 * out in a real sky — a handful of stars carry the eye and the rest are the
 * grain behind them. The tone runs from the authored star white toward the
 * scape's own golden-hour amber rather than toward some second red: the sky's
 * warm end and the low sun's are one family on purpose, and a colour that only
 * the star field uses is a colour nothing else can be tuned against.
 */
export interface StarField {
  position: Float32Array
  color:    Float32Array
  size:     Float32Array
}

export function bakeField (count: number, seed: number, radius: number, cool: Color, warm: Color): StarField {
  const rng      = createSeededRng(seed)
  const band     = rng.next() * Math.PI
  const position = new Float32Array(count * 3)
  const color    = new Float32Array(count * 3)
  const size     = new Float32Array(count)
  const tone     = new Color()

  for (let index = 0; index < count; index += 1) {
    const place  = scatterStar(rng, radius, band)
    const magnet = rng.next()
    const bright = magnet * magnet * magnet
    const offset = index * 3

    position[offset]     = place.x
    position[offset + 2] = place.z

    // Faded out before the rim, so the sheet's own edge never draws a circle in
    // the sky the way a hard-edged deck does.
    const rim = 1 - Math.min(1, Math.max(0, (Math.hypot(place.x, place.z) / radius - 0.72) / 0.28))

    const glow = 0.34 + 0.66 * bright

    tone.copy(cool).lerp(warm, rng.next() * 0.55)
    color[offset]     = tone.r * glow * rim
    color[offset + 1] = tone.g * glow * rim
    color[offset + 2] = tone.b * glow * rim
    size[index]       = SIZE_FAINT + (SIZE_BRIGHT - SIZE_FAINT) * bright
  }

  return { position, color, size }
}

/**
 * The night sky: a star field that turns with the hour, and a moon that keeps
 * its own month.
 *
 * A deck, for the reason the aurora is one — an orthographic camera tipped
 * fifty degrees down has no horizon in its frame to hang a sky against, so the
 * only sky this scape can have is one it looks down on. The field is therefore
 * over the islands as well as over the water, and that is the same fiction the
 * auroral veils and the cloud deck already run rather than a new one.
 *
 * Both hands come off clocks the scape already has and neither integrates
 * anything. The wheel is `daylight.time` read straight as an hour angle and the
 * month is `season.time` read against a count of lunations, so stopping either
 * clock stops what it drives, no capture needs a new switch, and scrubbing the
 * overlay's time slider backwards runs the sky backwards with it.
 */
export function createNightSky ({
  camera,
  config,
  quality,
  daylight,
}: NightSkyOptions): AppModule<Record<string, never>> | null {
  if (quality.starCount < 1)
    return null

  // Baked on a unit disc and scaled to the frame every update, because the
  // frame is what the field is sized against and the frame changes with the
  // zoom. Baking at any particular radius would be baking one zoom level in.
  const field = bakeField(
    quality.starCount,
    config.seed ^ 0x51a7,
    1,
    new Color(config.palette.star),
    new Color(config.daylight.dusk),
  )

  const stars = new BufferGeometry()
  stars.setAttribute('position', new BufferAttribute(field.position, 3))
  stars.setAttribute('color', new BufferAttribute(field.color, 3))
  stars.setAttribute('aSize', new BufferAttribute(field.size, 1))

  const starMaterial = new ShaderMaterial({
    name:           'nightsky-stars',
    vertexShader:   STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    uniforms:       {
      uOpacity: { value: 0 },
      uScale:   { value: 1 },
    },
    transparent:  true,
    depthWrite:   false,
    vertexColors: true,

    // Light added to the sky rather than laid over it, like the aurora, and for
    // the extra reason that a star is emission with nothing behind it to hide.
    blending: AdditiveBlending,

    // Unfogged. Linear fog fades by distance and this is the furthest thing in
    // the frame; leave it on and the whole field dissolves into the fog colour.
    fog: false,
  })

  const wheel         = new Points(stars, starMaterial)
  wheel.name          = 'nightsky-stars'
  wheel.renderOrder   = 34
  wheel.frustumCulled = false
  wheel.visible       = false

  const disc         = new PlaneGeometry(1, 1)
  const moonMaterial = new ShaderMaterial({
    name:           'nightsky-moon',
    vertexShader:   MOON_VERTEX,
    fragmentShader: MOON_FRAGMENT,
    uniforms:       {
      uOpacity: { value: 0 },
      uPhase:   { value: 0 },
      uTone:    { value: new Color(config.palette.moon) },
    },
    transparent: true,
    depthWrite:  false,
    blending:    AdditiveBlending,
    fog:         false,
  })

  const moon         = new Mesh(disc, moonMaterial)
  moon.name          = 'nightsky-moon'
  moon.renderOrder   = 35
  moon.frustumCulled = false
  moon.visible       = false

  return defineModule<Record<string, never>>({
    name: 'nightsky',

    build (ctx) {
      // Points are sized in device pixels, so a retina buffer needs the same
      // star to be twice as many of them or the whole field halves on the one
      // display that can resolve it.
      starMaterial.uniforms.uScale.value = ctx.renderer.getPixelRatio()
      ctx.scene.add(wheel)
      ctx.scene.add(moon)
    },

    resize (_size, ctx) {
      starMaterial.uniforms.uScale.value = ctx.renderer.getPixelRatio()
    },

    update () {
      const { starlight, moonlight, auroraHeight, cloudHeight } = config.atmosphere
      const { latitude, axialTilt, time }                       = config.daylight
      const year                                                = config.season.time
      const span                                                = deckViewSize(camera, config)
      const reveal                                              = deckReveal(span, config.camera)
      const focus                                               = deckFocus(camera)
      const base                                                = config.terrain.waterLevel +
        Math.max(auroraHeight, cloudHeight + CLEARANCE) + CLEARANCE

      // Made invisible rather than transparent below the threshold: a deck of
      // points contributing nothing still costs every vertex it carries, and
      // for most of the year at this latitude it contributes nothing.
      const light   = starlightAmount(daylight.dark, starlight) * reveal
      wheel.visible = light > 0.004

      if (wheel.visible) {
        // Pinned to where the camera is looking rather than to the world. A sky
        // at infinity does not slide past as the eye travels over the ground,
        // and a deck that did would be a ceiling.
        wheel.position.set(focus[0], base, focus[2])
        wheel.scale.setScalar(span * DECK_SPREAD)

        // The pole is 68° up on this coast, so a deck turning about its own
        // centre is very nearly the sky turning about the pole. The residue is
        // a fixed lean of a couple of dozen degrees, and there is no horizon in
        // the frame to measure it against.
        wheel.rotation.y                     = -(time - Math.floor(time)) * TAU
        starMaterial.uniforms.uOpacity.value = light
      }

      const phase = moonPhase(year)
      const place = moonPlace(time, year, latitude, axialTilt)
      const glow  = moonlightAmount(daylight.dark, phase, moonlight) * reveal
      const risen = Math.min(1, Math.max(0, (place.height - RISEN) / 0.14))

      moon.visible = glow * risen > 0.004

      if (!moon.visible)
        return

      const bearing = config.daylight.azimuth * DEGREES + place.swing
      const zenith  = Math.acos(Math.min(1, Math.max(-1, place.height))) / (Math.PI / 2)
      const reach   = span * HORIZON_FRACTION * zenith

      // Turned to face the camera rather than laid flat on the deck like the
      // veils above it, and this is the one place the deck fiction has to be
      // broken. A quad lying flat is seen at the camera's own fifty degrees, and
      // a moon squashed to two-thirds of its width reads as a mistake in a way
      // that a sky full of foreshortened aurora never does.
      moon.quaternion.copy(camera.quaternion)
      moon.scale.setScalar(span * MOON_FRACTION)
      moon.position.set(
        focus[0] + Math.sin(bearing) * reach,
        base + CLEARANCE,
        focus[2] + Math.cos(bearing) * reach,
      )
      moonMaterial.uniforms.uPhase.value   = phase
      moonMaterial.uniforms.uOpacity.value = glow * risen
    },

    dispose () {
      wheel.removeFromParent()
      moon.removeFromParent()
      stars.dispose()
      disc.dispose()
      starMaterial.dispose()
      moonMaterial.dispose()
    },
  })
}

// perf: two draws — one `Points` over a baked field and one unit quad — both
// unlit, both additive, both skipped outright unless the sun is far enough
// under and the view far enough back. Nothing per frame but a rotation, a
// position and three uniforms; nothing allocated after the bake.
