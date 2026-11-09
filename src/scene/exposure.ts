/**
 * The eye, adapting.
 *
 * Tone-mapping exposure was a constant 0.98, so noon and a moonlit night were
 * metered the same and the night could only be dark by being dim. A camera —
 * and an eye — opens up in the dark and stops down in the sun: the same scene
 * radiance lands in a frame whose brightest and darkest parts both stay
 * readable. This is that, as one number per instant.
 *
 * It lives on the renderer rather than in the lens pass, so every tier gets
 * it, mobile (no post chain) included, at the cost of one multiply.
 */

/** Exposure in full sun: stopped down, so snow and sea glare keep their detail. */
export const EXPOSURE_NOON = 0.92

/** Exposure in the dark of night: opened up about a third of a stop. */
export const EXPOSURE_NIGHT = 1.16

/** How far, in e-folds per second, the eye closes on the new level. Slow: it is an iris. */
export const ADAPT_RATE = 1.4

/**
 * The exposure for a sky with `day` of full daylight and `moon` of a full sun's
 * worth of moonlight on it (both 0..1, `DaylightState`). Moonlight holds the
 * iris a little shut, so a bright moon night is not metered like a new-moon one.
 */
export function targetExposure (day: number, moon: number): number {
  const light = Math.min(1, Math.max(0, day + 0.5 * moon))
  return EXPOSURE_NIGHT + (EXPOSURE_NOON - EXPOSURE_NIGHT) * light
}

/** One step of the iris toward `target`, for `delta` seconds. Frame-rate independent. */
export function adaptExposure (current: number, target: number, delta: number): number {
  return current + (target - current) * (1 - Math.exp(-Math.max(0, delta) * ADAPT_RATE))
}
