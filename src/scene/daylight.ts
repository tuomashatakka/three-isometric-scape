import { Color, Vector3 } from 'three'
import { smoothstep } from 'threejs-scene'
import type { LiveConfig } from './config.ts'
import type { SkyPlace } from './sky-deck.ts'


/** Everything the lighting rig, the sky and the haze need for one instant of the day. */
export interface DaylightState {

  /** Unit vector from the focus toward the key light. Never points below the horizon. */
  direction: Vector3

  sun:        Color
  horizon:    Color
  skyTop:     Color
  hemiSky:    Color
  hemiGround: Color

  sunStrength:  number
  hemiStrength: number

  /** Scene environment intensity — the image-based fill. */
  environment: number

  /** 1 in full daylight, 0 in full night. Drives everything else here. */
  day: number

  /**
   * How much light the moon is putting on the coast, in the same share-of-the-
   * noon-sun units {@link day} is in.
   *
   * 0 through every daylight hour, and through any night the moon is down, new
   * or switched off at `daylight.moonStrength`. It is what weighs against
   * {@link day} for the key light's *place*, so a night with anything in this
   * is a night whose shadows have swung off the bearing the sun set on.
   */
  moon: number

  /**
   * How dark the sky above the scape is, 0..1. 1 once the sun is far enough
   * under for the stars, 0 from the moment it touches the horizon.
   *
   * Not `1 - day`: the two measure different depths of the same twilight, and
   * this is the deeper one. A midsummer midnight at this latitude has no day in
   * it and no dark either.
   */
  dark: number
}

export interface Daylight {
  state: DaylightState

  /**
   * Resolve the sky for a phase of the day and a phase of the year, both 0..1.
   * Allocation-free.
   *
   * The year is an argument rather than a field because the sun's arc is a
   * function of both, and because `season.ts` already owns the year — the same
   * coupling `weather.ts` has, for the same reason.
   */
  sample(time: number, year: number): DaylightState
}

const TAU     = Math.PI * 2
const DEGREES = Math.PI / 180

/**
 * How low the *lighting* direction is allowed to sink.
 *
 * The sun's real arc goes under the horizon, and a directional light that
 * follows it there lights the terrain from below: shadows invert, every north
 * face blows out, and the shadow-map frustum fit degenerates. So the arc governs
 * the light's colour and strength — which is what night actually looks like —
 * while the direction is held just above ground and the whole thing reads as
 * moonlight instead of as a rendering bug.
 */
export const KEY_FLOOR = 0.16

/**
 * What the key light keeps on a night with no moon in it, as a share of the
 * noon sun.
 *
 * Not a fudge to stop the frame going black — `daylight.nightLift` is what
 * holds the *ambient* floor up, and it is a slider. This is the other thing a
 * moonless northern night actually has: a sky full of stars over snow, which
 * is a real if barely directional light, and it is what keeps a shadow under
 * the eaves at new moon rather than a shape cut out of flat grey.
 *
 * It replaces a flat 0.05 that used to be added at every hour of the day,
 * midsummer noon included. Gated on astronomical twilight instead, so the
 * daylight half of the cycle is exactly the light it always was.
 */
const STARLIGHT = 0.03

/** How far the key light's colour is pulled to the moon's own face at full moon. */
const MOON_TINT = 0.7

/**
 * Sine of the sun's declination at a phase of the year, in radians of arc.
 *
 * The whole of the seasonal coupling, in one line: 0 is midwinter and the sun
 * stands a full axial tilt south of the equator, 0.5 is midsummer and it stands
 * the same distance north. An `axialTilt` of 0 is a world whose axis does not
 * lean — every day of its year is an equinox — and that is the switch, rather
 * than a flag saying whether the season is coupled.
 */
export function declination (year: number, axialTilt: number): number {
  const wrapped = year - Math.floor(year)

  return -Math.cos(wrapped * TAU) * axialTilt * DEGREES
}

/**
 * Sine of a body's elevation, for a phase of the day and a declination.
 * Negative below the horizon.
 *
 * The standard hour-angle solution rather than a shaped sine: it is no more
 * code, and it is the only form that makes the day *length* fall out of the
 * latitude instead of having to be authored beside it.
 *
 * Written against a declination rather than against the year because the sun is
 * not the only thing this coast has in its sky. The moon runs the same arc a
 * lunation further along the ecliptic — see {@link moonPlace} — and the
 * alternative to sharing the solution is a second copy of it that can drift out
 * of step with this one.
 */
export function bodyHeight (time: number, dec: number, latitude: number): number {
  const phase = time - Math.floor(time)
  const lat   = latitude * DEGREES
  const hour  = (phase - 0.5) * TAU

  return Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hour)
}

/** Sine of the sun's elevation, for a phase of the day and a phase of the year. */
export function sunHeight (time: number, year: number, latitude: number, axialTilt: number): number {
  return bodyHeight(time, declination(year, axialTilt), latitude)
}

/**
 * Fraction of the day the sun spends above the horizon, 0..1.
 *
 * The claim the whole run is here to make, as one number: at a high enough
 * latitude this reaches exactly 0 in the weeks around midwinter and exactly 1
 * in the weeks around midsummer, and the two cases are the same expression
 * running out of range rather than two special cases bolted on.
 */
export function dayLength (year: number, latitude: number, axialTilt: number): number {
  const dec    = declination(year, axialTilt)
  const cosine = -Math.tan(latitude * DEGREES) * Math.tan(dec)

  if (cosine <= -1)
    return 1

  if (cosine >= 1)
    return 0

  return Math.acos(cosine) / Math.PI
}

/**
 * How far round from its transit bearing a body at this declination has
 * travelled, in radians.
 *
 * Signed the way the day runs, so the light keeps sweeping in one direction,
 * and derived rather than authored — which is what replaces the fixed fraction
 * of a half turn the arc used to swing through whatever week it was. A winter
 * sun crawls along a short southern arc; a midsummer one at this latitude goes
 * the whole way round and stands due north at midnight.
 */
export function bodySwing (time: number, dec: number, latitude: number): number {
  const phase  = time - Math.floor(time)
  const hour   = (phase - 0.5) * TAU
  const height = bodyHeight(phase, dec, latitude)
  const lat    = latitude * DEGREES
  const flat   = Math.sqrt(Math.max(0, 1 - height * height))
  const spread = flat * Math.cos(lat)

  // The sun overhead, or standing at the pole itself: there is no bearing to
  // resolve, and the arc has no direction to be swept in either.
  if (spread < 1e-6)
    return 0

  const cosine  = (Math.sin(dec) - height * Math.sin(lat)) / spread
  const bearing = Math.acos(Math.min(1, Math.max(-1, cosine)))

  return hour <= 0 ? bearing - Math.PI : Math.PI - bearing
}

/** How far round from its noon bearing the sun has travelled, in radians. */
export function sunSwing (time: number, year: number, latitude: number, axialTilt: number): number {
  return bodySwing(time, declination(year, axialTilt), latitude)
}

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
 *
 * Here rather than in `nightsky.ts`, where it was written: this file is where
 * every body on this coast's sky is *solved*, and the sky deck is where two of
 * them are drawn. The disc needed only its own place; the key light needs it
 * too — see {@link keyPlace} — and a module that draws a sky is the wrong thing
 * for a lighting rig to depend on.
 *
 * `into` is the same bargain `DaylightState` makes: the answer is a record, and
 * a record built fresh twice a frame is a record the lighting rig allocates for
 * nothing. Callers that want a value simply leave it out.
 */
export function moonPlace (
  time: number,
  year: number,
  latitude: number,
  axialTilt: number,
  into: SkyPlace = { height: 0, swing: 0 },
): SkyPlace {
  const phase = moonPhase(year)
  const dec   = declination(year + phase, axialTilt)
  const hour  = time - phase

  into.height = bodyHeight(hour, dec, latitude)
  into.swing  = bodySwing(hour, dec, latitude)

  return into
}

/**
 * Sine of the elevation the moon has to clear before it lights anything.
 *
 * About five degrees. Not an atmospheric extinction curve — it is the same
 * thing a horizon does to a low moon, which is that a hill, a wood or a bank of
 * cloud is in front of it long before it actually sets, and a key light that
 * rakes the scape from a moon sitting on the sea is a lighting bug rather than
 * a night.
 */
const MOON_RISE = 0.09

/**
 * How much of the key light the moon holds, 0..1.
 *
 * Three facts about one instant, multiplied, in the shape {@link goldenAmount}
 * and `rainbow.bowLight` are both written in:
 *
 * - **the moon has to be up.** Its own arc, solved a lunation along the
 *   ecliptic, which is why a bright moon is not the same thing as a lit ground:
 *   half of every month the full moon is under the sea at the hour a capture
 *   asks for.
 * - **it has to be lit.** The same illumination the disc is drawn from, so the
 *   shape in the sky and the light on the ground can never disagree — a new
 *   moon is a black night whatever height it stands at.
 * - **the sun has to be out of the way.** Astronomical twilight, the gate the
 *   stars and the aurora already open on, rather than a second curve of its
 *   own: a midsummer midnight at this latitude has no dark in it, so it has no
 *   moonlight in it either, and that falls out of the geometry.
 *
 * There is deliberately no strength in it: this is how much of the moon's light
 * is reaching the ground this hour, and `daylight.moonStrength` is how much
 * light that is. Multiply the two and you have the moon's own contribution to
 * the key, in the units the sun's `dayAmount` is already in — which is what
 * {@link keyShare} then weighs it against.
 */
export function moonAmount (height: number, phase: number, dark: number): number {
  const up = smoothstep(0, MOON_RISE, height)

  return up * moonIllumination(phase) * Math.min(1, Math.max(0, dark))
}

/**
 * How much of the key light's *place* the moon holds, 0..1.
 *
 * The two bodies weighed against each other rather than a curve of the clock:
 * whichever is actually putting more light on the coast is where the shadows
 * fall from, and a dusk with both up is somewhere between the two. Both terms
 * are shares of the noon sun, so the comparison is in one unit.
 *
 * The `total` guard is what makes `daylight.moonStrength: 0` a real off switch
 * rather than a dimmer. With no moonlight in the sum there is nothing to pull
 * the key round, so it stays exactly where the sun left it — which is the night
 * this scape had before the moon was a light — and with no light of any kind in
 * the sum the answer is the same, rather than a nought over nought.
 */
export function keyShare (day: number, lunar: number): number {
  const sun   = Math.max(0, day)
  const moon  = Math.max(0, lunar)
  const total = sun + moon

  return total > 0 ? moon / total : 0
}

/**
 * Where the key light stands, between the sun's place and the moon's.
 *
 * The scape has **one** shadow-casting light and two bodies that can be up at
 * once, so dusk is a crossfade rather than a second rig — and the crossfade is
 * done here, in the sky, rather than on the two direction vectors. Lerping
 * vectors is the obvious version and it is wrong: two bodies on opposite
 * bearings cancel halfway through, and the key light swings up to the zenith
 * and back down for a few frames of every moonrise.
 *
 * An elevation and a bearing have no such hole in them. The light walks from
 * the one body to the other along the sky, the short way round, which is also
 * what it looks like it should do.
 *
 * `into` is there for the reason {@link moonPlace} has one.
 */
export function keyPlace (
  sun: SkyPlace,
  moon: SkyPlace,
  share: number,
  into: SkyPlace = { height: 0, swing: 0 },
): SkyPlace {
  const amount = Math.min(1, Math.max(0, share))
  const turn   = moon.swing - sun.swing
  const short  = turn - Math.round(turn / TAU) * TAU

  into.height = sun.height + (moon.height - sun.height) * amount
  into.swing  = sun.swing + short * amount

  return into
}

/** Sine of eighteen degrees under the horizon — the end of astronomical twilight. */
const ASTRONOMICAL = Math.sin(-18 * DEGREES)

/**
 * How dark the sky is at a sun height, 0..1.
 *
 * Astronomical twilight written down: full dark once the sun is eighteen
 * degrees under, and nothing at all the moment it touches the horizon. It is
 * the shape of the northern year's nights without a curve of the year in it —
 * a midsummer midnight here never takes the sun far enough down to get past
 * dusk, and that falls out of the geometry rather than being drawn on top of
 * it. See `aurora.ts`, which is what needs the number.
 */
export function darkAmount (height: number): number {
  return 1 - smoothstep(ASTRONOMICAL, 0, height)
}

/**
 * How much of the day's light is up, from a sun height.
 *
 * The lower edge is a **nautical** twilight rather than the civil one it used
 * to be, and that is a change the seasonal arc forced. Under a fixed arc the
 * only times the sun sat just under the horizon were the few minutes either
 * side of a sunrise, and how much light those minutes got was nearly
 * invisible. At 68°N the sun spends the whole of December's daylight there:
 * midwinter noon is 1.4° under, and a curve that called that night gave the
 * scape two months of blackout in place of two months of blue afternoon.
 */
export function dayAmount (height: number): number {
  return smoothstep(-0.2, 0.2, height)
}

/** Golden-hour weight — peaks with the sun just off the horizon, either end. */
export function goldenAmount (height: number): number {
  return smoothstep(-0.05, 0.12, height) * (1 - smoothstep(0.08, 0.42, height))
}

/**
 * The day/night cycle.
 *
 * The authored palette stays the *noon* anchor and everything else is derived
 * from it — dusk is the anchor pulled toward one warm colour, night is the
 * anchor pulled toward one cold one. That is a deliberate trade against a
 * keyframed palette per hour: it means retuning the scape's look is still a
 * matter of editing the colours that were already there, and no time of day can
 * drift out of the family the rest of the scene was graded for.
 *
 * The arc itself is not authored at all. It is solved from a latitude and an
 * axial tilt, so the length of the day, the height of the noon sun and how far
 * round the sky the light sweeps are all one week of the year's answer to the
 * same geometry — which is what gives this coast a midwinter with no daylight
 * in it and a midsummer with no night.
 */
export function createDaylight (config: LiveConfig): Daylight {
  const authored = config()

  // The eight colours the arc lerps between are read once. Nothing on the
  // overlay writes a palette entry, so a rebuild is what changes them — and
  // eight fresh Colors a frame to re-read a constant nobody can move is a cost
  // with no knob behind it.
  const noonSun    = new Color(authored.atmosphere.sunColor)
  const noonTop    = new Color(authored.atmosphere.skyTop)
  const noonSky    = new Color(authored.palette.sky)
  const noonHemi   = new Color(authored.atmosphere.hemiSky)
  const noonGround = new Color(authored.atmosphere.hemiGround)
  const dusk       = new Color(authored.daylight.dusk)
  const night      = new Color(authored.daylight.night)
  const deepNight  = new Color(authored.daylight.night).multiplyScalar(0.32)
  // The key light's colour once the moon has it, and it is deliberately the
  // *disc's* own colour rather than a ninth entry beside the eight above: the
  // face in the sky and the light it throws on the snow are one thing, and a
  // scape that could tune them apart is a scape where they can disagree.
  const moonFace   = new Color(authored.palette.moon)

  const state: DaylightState = {
    direction:    new Vector3(),
    sun:          new Color(),
    horizon:      new Color(),
    skyTop:       new Color(),
    hemiSky:      new Color(),
    hemiGround:   new Color(),
    sunStrength:  authored.atmosphere.sunStrength,
    hemiStrength: authored.atmosphere.hemiStrength,
    environment:  0.34,
    day:          1,
    moon:         0,
    dark:         0,
  }

  // The three sky places the crossfade walks between. `sample` is called twice a
  // frame — once by the atmosphere and once by the water — so they are held
  // rather than built, which is what keeps the promise above.
  const sunAt  = { height: 0, swing: 0 }
  const moonAt = { height: 0, swing: 0 }
  const keyAt  = { height: 0, swing: 0 }

  return {
    state,

    sample (time, year) {
      // Latitude, tilt, azimuth, the night lift and both light strengths are
      // sliders. They come from the store as of this tick, never from the object
      // this closure was built with.
      const { atmosphere, daylight } = config()
      const { latitude, axialTilt }  = daylight
      const phase                    = time - Math.floor(time)
      const height                   = sunHeight(phase, year, latitude, axialTilt)

      sunAt.height = height
      sunAt.swing  = sunSwing(phase, year, latitude, axialTilt)
      moonPlace(phase, year, latitude, axialTilt, moonAt)

      const day    = dayAmount(height)
      const golden = goldenAmount(height)
      const dark   = 1 - day
      const lift   = daylight.nightLift * dark
      // Astronomical twilight, which is the gate the moon opens on and a
      // different depth of the same night from `dark` above — see `darkAmount`.
      const astro = darkAmount(height)
      const lunar = moonAmount(moonAt.height, moonPhase(year), astro) * daylight.moonStrength
      const share = keyShare(day, lunar)

      keyPlace(sunAt, moonAt, share, keyAt)

      const bearing = daylight.azimuth * DEGREES + keyAt.swing
      const flat    = Math.sqrt(Math.max(0, 1 - keyAt.height * keyAt.height))

      state.direction
        .set(
          Math.sin(bearing) * flat,
          Math.max(keyAt.height, KEY_FLOOR),
          Math.cos(bearing) * flat,
        )
        .normalize()

      state.sun.copy(noonSun).lerp(dusk, golden * 0.85)
        .lerp(night, dark)
        .lerp(moonFace, share * MOON_TINT)
      state.horizon.copy(noonSky).lerp(dusk, golden * 0.7)
        .lerp(night, dark * 0.92)
      state.skyTop.copy(noonTop).lerp(dusk, golden * 0.3)
        .lerp(deepNight, dark)
      state.hemiSky.copy(noonHemi).lerp(dusk, golden * 0.4)
        .lerp(night, dark)
      state.hemiGround.copy(noonGround).lerp(deepNight, dark * 0.8)

      // The key light's own budget, and the term that used to be a flat 0.05
      // floor standing in for a moon nobody had solved. It is three sources now
      // and each of them can reach zero: the sun, the moon that is actually up
      // this week, and the starlight a moonless night still has in it.
      state.sunStrength = atmosphere.sunStrength *
        (day + lunar + STARLIGHT * astro) + lift * 0.4
      state.hemiStrength = atmosphere.hemiStrength * (0.3 + 0.7 * day) + lift
      state.environment  = 0.34 * (0.18 + 0.82 * day) + lift * 0.25
      state.day          = day
      state.moon         = lunar
      state.dark         = astro

      return state
    },
  }
}
