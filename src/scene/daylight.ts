import { Color, Vector3 } from 'three'
import { smoothstep } from 'threejs-scene'
import type { ScapeConfig } from './config.ts'


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
}

export interface Daylight {
  state: DaylightState

  /** Resolve the sky for a phase of the cycle, 0..1. Allocation-free. */
  sample(time: number): DaylightState
}

const TAU     = Math.PI * 2
const DEGREES = Math.PI / 180

/** Azimuth travel across a full day, as a fraction of a half turn. */
const SWING = 1.6

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

/** Sine of the sun's elevation at a phase of the cycle. Negative below the horizon. */
export function sunHeight (time: number, tilt: number): number {
  return Math.sin(Math.sin((time - 0.25) * TAU) * tilt * DEGREES)
}

/** How much of the day's light is up, from a sun height. */
export function dayAmount (height: number): number {
  return smoothstep(-0.1, 0.2, height)
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
 */
export function createDaylight (config: ScapeConfig): Daylight {
  const { atmosphere, palette, daylight } = config

  const noonSun    = new Color(atmosphere.sunColor)
  const noonTop    = new Color(atmosphere.skyTop)
  const noonSky    = new Color(palette.sky)
  const noonHemi   = new Color(atmosphere.hemiSky)
  const noonGround = new Color(atmosphere.hemiGround)
  const dusk       = new Color(daylight.dusk)
  const night      = new Color(daylight.night)
  const deepNight  = new Color(daylight.night).multiplyScalar(0.32)

  const state: DaylightState = {
    direction:    new Vector3(),
    sun:          new Color(),
    horizon:      new Color(),
    skyTop:       new Color(),
    hemiSky:      new Color(),
    hemiGround:   new Color(),
    sunStrength:  atmosphere.sunStrength,
    hemiStrength: atmosphere.hemiStrength,
    environment:  0.34,
    day:          1,
  }

  return {
    state,

    sample (time) {
      const phase     = time - Math.floor(time)
      const elevation = Math.sin((phase - 0.25) * TAU) * daylight.tilt * DEGREES
      const height    = Math.sin(elevation)
      const bearing   = daylight.azimuth * DEGREES + (phase - 0.5) * Math.PI * SWING
      const flat      = Math.cos(elevation)

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

      return state
    },
  }
}
