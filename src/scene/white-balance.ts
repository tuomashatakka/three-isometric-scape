import { Color } from 'three'
import { AIR_SPECTRUM } from './aerial.ts'


/**
 * The camera, balanced to the light it stands in.
 *
 * Every frame the scape drew had an olive cast. The key light was a warm
 * cream, the hemisphere's floor an olive, the ground bounce the meadow's green,
 * and all of them landed on every surface in the frame together. The blue
 * haze then greyed the result, so the sea came out khaki and the far shore a
 * brown cardboard. A photograph never shows that. A camera, like an eye, divides
 * out the colour of the light it was exposed under, so a white card in the sun
 * prints white and what remains is the colour of the *things*. The sea is
 * blue, the grass green, a lit gable warm against a cold shadow.
 *
 * So the daylight model balances what it hands out. It finds the light falling
 * on a horizontal card ({@link cardIlluminant}), takes a von Kries gain toward
 * neutral ({@link whiteBalance}), and multiplies every colour it hands out by
 * it. That covers the key light, the hemisphere, the sky dome, the haze, the
 * water's mirror and the clouds. One place, before any program sees a colour,
 * so it costs the same on every tier: nothing.
 *
 * It is *partial*, the way a camera on auto and an adapted eye both are. Full
 * adaptation would bleach a sunset to noon and a moonlit night to a grey day.
 * How much is divided out falls from {@link ADAPT_DAY} in daylight to
 * {@link ADAPT_NIGHT} in the dark, and a low sun keeps a share of its colour
 * on top of that ({@link GOLDEN_KEEP}).
 */

/** How much of the illuminant's colour is divided out in full day, and in full night. */
export const ADAPT_DAY   = 0.7
export const ADAPT_NIGHT = 0.3

/** The share of the adaptation a fully golden sun takes back, so an evening stays warm. */
export const GOLDEN_KEEP = 0.45

/**
 * Optical depth of the air straight up, at unit `AIR_SPECTRUM`.
 *
 * Small, because the column is clear. A northern summer sun at fifty degrees
 * looks through 1.3 of it and comes out barely cream. At six degrees it looks
 * through ten, and the blue is gone first, which is what turns the sun orange
 * without a palette entry saying so.
 */
export const AIR_COLUMN = 0.45

/** The longest air path a sun on the horizon is seen through, in columns. */
const MAX_AIR_MASS = 24

const LUMA = [ 0.2126, 0.7152, 0.0722 ] as const

export function luminance (color: Color): number {
  return LUMA[0] * color.r + LUMA[1] * color.g + LUMA[2] * color.b
}

/**
 * The sun's white, seen through the air at a height (sine of its elevation).
 *
 * The same spectrum the aerial perspective takes blue out of distance with
 * (`aerial.ts`), so the sun and the haze agree on the colour of this air.
 * Normalised to its brightest channel. How bright the sun is belongs to
 * `atmosphere.sunStrength`, and this is only its hue.
 *
 * This retired `atmosphere.sunColor`: the hue of the key light at noon is a
 * fact about the air and the sun's height, and once the camera balances to it,
 * a colour picked by hand stopped meaning anything.
 */
export function airlight (height: number, into = new Color()): Color {
  const mass = Math.min(MAX_AIR_MASS, 1 / Math.max(1 / MAX_AIR_MASS, height))
  const r    = Math.exp(-AIR_COLUMN * mass * AIR_SPECTRUM[0])
  const g    = Math.exp(-AIR_COLUMN * mass * AIR_SPECTRUM[1])
  const b    = Math.exp(-AIR_COLUMN * mass * AIR_SPECTRUM[2])

  return into.setRGB(1, g / r, b / r)
}

/**
 * The light on a white card lying flat: the key light by the sine of its
 * height, plus the sky half of the hemisphere, which is all an upturned face sees
 * of it. Lambert's 1/π is common to both and drops out.
 */
export function cardIlluminant (
  sun: Color,
  sunStrength: number,
  height: number,
  sky: Color,
  skyStrength: number,
  into = new Color(),
): Color {
  const lit = Math.max(0, height) * sunStrength

  return into.setRGB(
    sun.r * lit + sky.r * skyStrength,
    sun.g * lit + sky.g * skyStrength,
    sun.b * lit + sky.b * skyStrength,
  )
}

/**
 * The gain that balances an illuminant, by `adapt` (0 none, 1 a white card
 * prints neutral). Per channel it is `(lum / channel) ^ adapt`, geometric so that
 * half the adaptation is half the correction in stops. It is rescaled so the
 * card's luminance is unchanged, which means the balance moves the hue of the
 * frame and never its exposure.
 */
export function whiteBalance (illuminant: Color, adapt: number, into = new Color()): Color {
  const lum = luminance(illuminant)

  if (!(lum > 1e-6))
    return into.setRGB(1, 1, 1)

  const a = Math.min(1, Math.max(0, adapt))
  const r = (lum / Math.max(illuminant.r, lum * 0.05)) ** a
  const g = (lum / Math.max(illuminant.g, lum * 0.05)) ** a
  const b = (lum / Math.max(illuminant.b, lum * 0.05)) ** a

  const balanced = LUMA[0] * illuminant.r * r + LUMA[1] * illuminant.g * g + LUMA[2] * illuminant.b * b
  const scale    = lum / balanced

  return into.setRGB(r * scale, g * scale, b * scale)
}

/** How much the camera adapts, for a day amount and a golden amount, both 0..1. */
export function adaptation (day: number, golden: number): number {
  return (ADAPT_NIGHT + (ADAPT_DAY - ADAPT_NIGHT) * day) * (1 - GOLDEN_KEEP * golden)
}
