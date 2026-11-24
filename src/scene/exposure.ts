/**
 * The light meter, and the iris it drives.
 *
 * The exposure used to be set by the clock alone (0.92 in the day, 1.16 at
 * night), so a noon under a rain front, a winter noon with the sun nine degrees
 * up and a clear midsummer noon all printed at the same iris — and since nothing
 * dimmed the sun under the front either, a squall fell through hard sunlight.
 * Two physical facts replace that:
 *
 * - **the front veils the key.** A raincloud passes almost no direct sun; it
 *   scatters it into the sky instead. {@link frontVeil} takes the key's share
 *   out by how hard it is falling, and {@link FRONT_SCATTER} hands part of it to
 *   the hemisphere, so a squall flattens the light — soft shadows, a bright
 *   grey sky — rather than only adding streaks to a sunny frame.
 * - **the camera meters what falls on the focus.** {@link incidentLight} is an
 *   incident meter's reading: the luminance of the key on a level card through
 *   the veil and the deck's mean shade, plus the sky it sees. The exposure
 *   compensates that reading by {@link METER_GAIN} of a full correction (an eye
 *   and a camera both keep some of the difference: an overcast still *reads*
 *   duller than sun), between the noon stop and a ceiling that falls with the
 *   daylight, so a night is opened up only as far as an adapted eye opens.
 *
 * It lives on the renderer rather than in the lens pass, so every tier gets it,
 * mobile (no post chain) included, at the cost of one multiply.
 */
import { Color } from 'three'
import { luminance } from './white-balance.ts'

/** Exposure for the reference light (clear midsummer noon): stopped down, so snow and sea glare keep their detail. */
export const EXPOSURE_NOON = 0.92

/** The widest the iris opens in the dark of night: about a third of a stop over noon. */
export const EXPOSURE_NIGHT = 1.16

/** The widest it opens in full daylight, under an overcast or a low winter sun: about two thirds of a stop. */
export const EXPOSURE_OPEN = 1.5

/** The meter's reading at the reference light, in the rig's units (`METER_REF` meters to {@link EXPOSURE_NOON}). */
export const METER_REF = 2.2

/** The share of a full correction the iris makes, as a power on the light ratio. 0 is a fixed iris, 1 prints every light as mid-grey. */
export const METER_GAIN = 0.75

/** How far, in e-folds per second, the eye closes on the new level. Slow: it is an iris. */
export const ADAPT_RATE = 1.4

/** The share of the key a front takes when it is falling hardest. Not all of it: a squall has a bright edge. */
export const FRONT_VEIL = 0.8

/** The fall at which the front's cloud is fully over: showers fall from a deck that is already shut. */
export const FRONT_SHUT = 0.5

/** The share of the veiled key the cloud scatters back into the sky as diffuse light. */
export const FRONT_SCATTER = 0.15

/** How far a full veil takes a sky colour toward its own grey: an overcast keeps a trace of the hour's warmth. */
export const FRONT_GREY = 0.85

/** A sky colour under the front: toward its luminance by the veil's share of {@link FRONT_VEIL}, brightness kept. In place. */
export function overcast (color: Color, veil: number): Color {
  const grey = luminance(color)
  const t    = FRONT_GREY * Math.min(1, Math.max(0, veil / FRONT_VEIL))

  return color.setRGB(
    color.r + (grey - color.r) * t,
    color.g + (grey - color.g) * t,
    color.b + (grey - color.b) * t,
  )
}

/** How much of the key the front takes, 0..{@link FRONT_VEIL}, for a fall 0..1 (`WeatherState.fall`). */
export function frontVeil (fall: number): number {
  const t = Math.min(1, Math.max(0, fall / FRONT_SHUT))

  return FRONT_VEIL * t * t * (3 - 2 * t)
}

/**
 * The incident meter's reading: the key on a level card (by the sine of its
 * height), through the front's veil and the deck's mean shade, plus the sky.
 * Intensities as the rig casts them; colours by their luminance.
 */
export function incidentLight (
  key:          Color,
  keyIntensity: number,
  height:       number,
  sky:          Color,
  skyIntensity: number,
  shade:        number,
): number {
  const keyLit = luminance(key) * keyIntensity * Math.max(0, height) * (1 - Math.min(1, Math.max(0, shade)))

  return keyLit + luminance(sky) * skyIntensity
}

/** The widest the iris may open for a day amount 0..1: the night's limit in the dark, the overcast's in the day. */
export function exposureCeiling (day: number): number {
  return EXPOSURE_NIGHT + (EXPOSURE_OPEN - EXPOSURE_NIGHT) * Math.min(1, Math.max(0, day))
}

/** The exposure a reading calls for, before the iris adapts to it. */
export function meteredExposure (incident: number, day: number): number {
  const ratio = METER_REF / Math.max(1e-4, incident)

  return Math.min(exposureCeiling(day), Math.max(EXPOSURE_NOON * 0.9, EXPOSURE_NOON * ratio ** METER_GAIN))
}

/** One step of the iris toward `target`, for `delta` seconds. Frame-rate independent. */
export function adaptExposure (current: number, target: number, delta: number): number {
  return current + (target - current) * (1 - Math.exp(-Math.max(0, delta) * ADAPT_RATE))
}
