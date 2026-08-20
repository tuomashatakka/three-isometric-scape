import { Color, Vector3 } from 'three'
import { smoothstep } from 'threejs-scene'
import type { LiveConfig } from './config.ts'


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
const FLOOR_Y = 0.16

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
 * Sine of the sun's elevation, for a phase of the day and a phase of the year.
 * Negative below the horizon.
 *
 * The standard hour-angle solution rather than a shaped sine: it is no more
 * code, and it is the only form that makes the day *length* fall out of the
 * latitude instead of having to be authored beside it.
 */
export function sunHeight (time: number, year: number, latitude: number, axialTilt: number): number {
  const phase = time - Math.floor(time)
  const dec   = declination(year, axialTilt)
  const lat   = latitude * DEGREES
  const hour  = (phase - 0.5) * TAU

  return Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hour)
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
 * How far round from its noon bearing the sun has travelled, in radians.
 *
 * Signed the way the day runs, so the light keeps sweeping in one direction,
 * and derived rather than authored — which is what replaces the fixed fraction
 * of a half turn the arc used to swing through whatever week it was. A winter
 * sun crawls along a short southern arc; a midsummer one at this latitude goes
 * the whole way round and stands due north at midnight.
 */
export function sunSwing (time: number, year: number, latitude: number, axialTilt: number): number {
  const phase  = time - Math.floor(time)
  const hour   = (phase - 0.5) * TAU
  const height = sunHeight(phase, year, latitude, axialTilt)
  const lat    = latitude * DEGREES
  const flat   = Math.sqrt(Math.max(0, 1 - height * height))
  const spread = flat * Math.cos(lat)

  // The sun overhead, or standing at the pole itself: there is no bearing to
  // resolve, and the arc has no direction to be swept in either.
  if (spread < 1e-6)
    return 0

  const cosine  = (Math.sin(declination(year, axialTilt)) - height * Math.sin(lat)) / spread
  const bearing = Math.acos(Math.min(1, Math.max(-1, cosine)))

  return hour <= 0 ? bearing - Math.PI : Math.PI - bearing
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
    dark:         0,
  }

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
      const bearing                  = daylight.azimuth * DEGREES +
        sunSwing(phase, year, latitude, axialTilt)
      const flat                    = Math.sqrt(Math.max(0, 1 - height * height))

      state.direction
        .set(Math.sin(bearing) * flat, Math.max(height, FLOOR_Y), Math.cos(bearing) * flat)
        .normalize()

      const day    = dayAmount(height)
      const golden = goldenAmount(height)
      const dark   = 1 - day
      const lift   = daylight.nightLift * dark

      state.sun.copy(noonSun).lerp(dusk, golden * 0.85)
        .lerp(night, dark)
      state.horizon.copy(noonSky).lerp(dusk, golden * 0.7)
        .lerp(night, dark * 0.92)
      state.skyTop.copy(noonTop).lerp(dusk, golden * 0.3)
        .lerp(deepNight, dark)
      state.hemiSky.copy(noonHemi).lerp(dusk, golden * 0.4)
        .lerp(night, dark)
      state.hemiGround.copy(noonGround).lerp(deepNight, dark * 0.8)

      state.sunStrength  = atmosphere.sunStrength * (0.05 + 0.95 * day) + lift * 0.4
      state.hemiStrength = atmosphere.hemiStrength * (0.3 + 0.7 * day) + lift
      state.environment  = 0.34 * (0.18 + 0.82 * day) + lift * 0.25
      state.day          = day
      state.dark         = darkAmount(height)

      return state
    },
  }
}
