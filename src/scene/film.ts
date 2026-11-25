import { AgXToneMapping, CustomToneMapping, ShaderChunk } from 'three'
import type { WebGLRenderer } from 'three'


/**
 * The film: one grade, wherever the frame is developed.
 *
 * The grade used to be a 33³ lookup texture sampled by the lens pass, picked
 * from seven recipes — which meant it existed only where a post chain did. The
 * phone tier has none (it loses its context linking one), so the frames most
 * people see went out ungraded.
 *
 * The lookup was only ever a closed-form function baked into a cube, so it is
 * that function again, {@link FILM_GLSL}, and it runs in whichever stage the
 * tier has:
 *
 * - **with a chain**, in the lens pass (`lens.ts`), on the composed frame;
 * - **without one**, inside every material's own tone-mapping stage — three's
 *   `CustomToneMapping` hook — just before the curve. No render target, no
 *   pass, no extra program: the grade rides in programs the tier links anyway.
 *
 * Both run in linear hdr ahead of the same tone curve, so a phone and a desktop
 * develop the same print — and the same vignette and grain, which need only a
 * pixel's place in the frame ({@link FRAME_VARYING}). What the direct path
 * cannot do is anything that reads a neighbour — defocus, halation and
 * micro-contrast stay the lens's.
 *
 * **One curve.** The frame was developed twice: a display-space S-curve
 * "stock" (square root, contrast about half, squared back, a teal cast and a
 * lifted black) and then ACES on top. Two shoulders and two toes in series
 * crushed every wall in shade to the same charcoal and drained the turf to
 * grey. The curve is AgX alone now — the one tone curve, with its own
 * highlight roll-off toward white — and the grade ahead of it is only what a
 * print adds: a gentle contrast as a power about mid-grey, the chroma AgX
 * takes back, dye density and the split tone. The camera is already
 * white-balanced to the light, so there is no cast.
 */

/** Rec. 709 luminance weights. */
const LUMA = [ 0.2126, 0.7152, 0.0722 ] as const

/** Multipliers on red, green, blue for the deepest shade and the brightest light. */
export const SHADE_TINT = [ 0.95, 1, 1.07 ] as const
export const LIGHT_TINT = [ 1.05, 1, 0.93 ] as const

/** The most of the tint the split tone applies, at full grade strength. */
export const SPLIT_REACH = 0.7

/** Contrast about mid-grey at full grade strength: the exponent's reach over 1. */
export const CONTRAST_REACH = 0.24

/** Mid-grey in linear light: the pivot the contrast turns about. */
export const MID_GREY = 0.18

/**
 * Saturation the film gives back at full strength. AgX walks every colour
 * toward the white point as it brightens — which is what keeps a sunlit gable
 * from going to a flat saturated block — and takes a little chroma from the
 * mid-tones on the way; the print gives that back.
 */
export const FILM_SATURATION = 0.16

/**
 * Dye density: how much of its light a fully saturated colour gives up.
 *
 * A screen makes a colour vivid by *adding* light to one channel, so a
 * saturated meadow glows like a sign. Film makes it by subtracting the other
 * two with dye, and more dye is less light: the deeper the colour, the darker
 * it prints. It is what separates a moss green from a neon one. A grey has no
 * dye to lay down and is untouched, so the exposure and the white balance hold.
 */
export const DYE_DENSITY = 0.2

type Rgb = readonly [number, number, number]

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))
const luma    = (c: Rgb): number => c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2]
const each    = (c: Rgb, f: (value: number, channel: 0 | 1 | 2) => number): Rgb => [ f(c[0], 0), f(c[1], 1), f(c[2], 2) ]

function smooth (low: number, high: number, value: number): number {
  const t = clamp01((value - low) / (high - low))
  return t * t * (3 - 2 * t)
}

/** The multiplier on one channel for a fragment of luminance `lightness`, at `strength` 0..1. */
export function splitTone (lightness: number, channel: 0 | 1 | 2, strength: number): number {
  const shade = 1 - smooth(0, 0.25, lightness)
  const light = smooth(0.35, 1.5, lightness)
  return 1 + strength * SPLIT_REACH * (shade * (SHADE_TINT[channel] - 1) + light * (LIGHT_TINT[channel] - 1))
}

/** The gain on a colour whose chroma is `saturation` 0..1 (max − min over max), at grade strength `intensity`. */
export function dyeDensity (saturation: number, intensity: number): number {
  return 1 - DYE_DENSITY * clamp01(saturation) * clamp01(intensity)
}

/**
 * The whole grade on one linear-hdr colour at `strength` 0..1 — what
 * {@link FILM_GLSL} evaluates, kept here so a test can state what it does.
 */
export function film (colour: Rgb, strength: number): Rgb {
  const s       = clamp01(strength)
  const power   = 1 + CONTRAST_REACH * s
  const pivoted = each(colour, value => MID_GREY * Math.pow(Math.max(0, value) / MID_GREY, power))
  const grey    = luma(pivoted)
  const vivid   = each(pivoted, value => Math.max(0, grey + (value - grey) * (1 + FILM_SATURATION * s)))
  const peak    = Math.max(vivid[0], vivid[1], vivid[2])
  const density = dyeDensity((peak - Math.min(vivid[0], vivid[1], vivid[2])) / Math.max(peak, 1e-4), s)
  const dense   = each(vivid, value => value * density)
  const lit     = luma(dense)

  return each(dense, (value, channel) => value * splitTone(lit, channel, s))
}

const vec3 = (c: readonly number[]): string => `vec3(${c.map(v => v.toFixed(4)).join(', ')})`

/** `vec3 scapeFilm(vec3 colour, float strength)` — the grade, for any fragment stage. */
export const FILM_GLSL = /* glsl */ `
  vec3 scapeFilm (vec3 col, float strength) {
    const vec3 W = ${vec3(LUMA)};
    float s = clamp(strength, 0.0, 1.0);

    // Contrast about mid-grey as a power, so black stays black and no shade
    // under the pivot is crushed to it; then the chroma the curve takes back.
    col = ${MID_GREY.toFixed(2)} * pow(max(col, 0.0) / ${MID_GREY.toFixed(2)}, vec3(1.0 + ${CONTRAST_REACH.toFixed(2)} * s));
    col = max(mix(vec3(dot(col, W)), col, 1.0 + ${FILM_SATURATION.toFixed(2)} * s), 0.0);

    // Dye density: the more saturated the colour, the less light it lets through.
    float peak = max(col.r, max(col.g, col.b));
    col *= 1.0 - ${DYE_DENSITY.toFixed(2)} * clamp((peak - min(col.r, min(col.g, col.b))) / max(peak, 1e-4), 0.0, 1.0) * s;

    // The split tone: cool shade, warm light, mid-tones left alone.
    float lit = dot(col, W);
    col *= vec3(1.0) + s * ${SPLIT_REACH.toFixed(2)}
         * ((1.0 - smoothstep(0.0, 0.25, lit)) * (${vec3(SHADE_TINT)} - 1.0)
            + smoothstep(0.35, 1.5, lit) * (${vec3(LIGHT_TINT)} - 1.0));

    return col;
  }
`

/**
 * What the glass does to one pixel, at `look.lens` 1: the cos⁴ falloff toward
 * the corners and the grain of the stock. They are functions of where a pixel
 * is in the frame and of nothing beside it, so they are the film's — the lens
 * pass (`post.ts`) and the direct path below read the same two numbers.
 */
export const LENS_VIGNETTE = 0.34
export const LENS_GRAIN    = 0.0144

/** How much of its light a pixel keeps at `reach` (squared distance from the centre, frame half-width 0.5) under a vignette of `amount`. */
export function vignette (reach: number, amount: number): number {
  const slant = 1 / (1 + reach * 1.4)

  return 1 + (slant * slant - 1) * amount
}

/**
 * The direct path's one channel into every program: three hands a bare
 * renderer's materials exactly one global uniform at the tone-mapping stage,
 * `toneMappingExposure`, so the film's two strengths ride in it. The exposure
 * keeps the low part (it is always under {@link EXPOSURE_SPAN}), the grade the
 * multiples of it in {@link STRENGTH_STEPS} steps, and the lens the multiples
 * of *that* in {@link LENS_STEPS}. The largest value is under 2¹⁴, which
 * leaves a 32-bit float a thousandth of a stop for the exposure.
 */
export const EXPOSURE_SPAN  = 4
export const STRENGTH_STEPS = 100
export const LENS_STEPS     = 20

const GRADE_LEVELS = STRENGTH_STEPS + 1

export interface FilmExposure {
  exposure: number
  strength: number
  lens:     number
}

/** Exposure, grade strength (0..1) and lens (0..1) in the one float the direct film reads. */
export function packExposure (exposure: number, strength: number, lens = 0): number {
  const level = Math.round(clamp01(strength) * STRENGTH_STEPS)
  const glass = Math.round(clamp01(lens) * LENS_STEPS)

  return (glass * GRADE_LEVELS + level) * EXPOSURE_SPAN + Math.min(EXPOSURE_SPAN - 1e-3, Math.max(0, exposure))
}

/** The inverse of {@link packExposure} — what the shader does with the uniform. */
export function unpackExposure (packed: number): FilmExposure {
  const steps = Math.floor(packed / EXPOSURE_SPAN)
  const glass = Math.floor(steps / GRADE_LEVELS)

  return {
    exposure: packed - steps * EXPOSURE_SPAN,
    strength: (steps - glass * GRADE_LEVELS) / STRENGTH_STEPS,
    lens:     glass / LENS_STEPS,
  }
}

const IDENTITY_TONE_MAPPING = 'vec3 CustomToneMapping( vec3 color ) { return color; }'

/** The varying the aerial vertex chunk writes for the direct film: clip x, y and w. */
export const FRAME_VARYING = 'vScapeClip'

// ACES multiplies by the uniform itself, so the colour is pre-scaled by the
// share of the uniform that is exposure and the curve sees the true exposure.
//
// The frame: every fogged program's vertex stage hands down its clip position
// (`aerial.ts`), so the fragment knows where in the picture it is with no
// uniform — and the picture's aspect falls out of the same varying's screen
// derivatives. A program with no fog (the sky) has no place and no vignette.
// The grain is pinned to the pixel grid: this stage has no clock.
const DIRECT_TONE_MAPPING = /* glsl */ `
  ${FILM_GLSL}
  #ifdef USE_FOG
    varying vec3 ${FRAME_VARYING};
  #endif
  vec3 CustomToneMapping( vec3 color ) {
    float steps    = floor( toneMappingExposure / ${EXPOSURE_SPAN.toFixed(1)} );
    float glass    = floor( steps / ${GRADE_LEVELS.toFixed(1)} );
    float exposure = toneMappingExposure - steps * ${EXPOSURE_SPAN.toFixed(1)};
    float lens     = glass / ${LENS_STEPS.toFixed(1)};
    #ifdef USE_FOG
      vec2 place  = ${FRAME_VARYING}.xy / ${FRAME_VARYING}.z;
      vec2 pixel  = abs( vec2( dFdx( place.x ), dFdy( place.y ) ) ) + 1e-7;
      vec2 centre = place * 0.5 * pixel.yx / max( pixel.x, pixel.y );
      float slant = 1.0 / ( 1.0 + dot( centre, centre ) * 1.4 );
      color *= mix( 1.0, slant * slant, ${LENS_VIGNETTE.toFixed(2)} * lens );
    #endif
    color = scapeFilm( color, ( steps - glass * ${GRADE_LEVELS.toFixed(1)} ) / ${STRENGTH_STEPS.toFixed(1)} );
    float tone = clamp( dot( color, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.0, 1.0 );
    float seed = fract( sin( dot( gl_FragCoord.xy, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
    color = max( color + ( seed - 0.5 ) * ${LENS_GRAIN.toFixed(4)} * lens * ( 0.35 + 2.6 * tone * ( 1.0 - tone ) ), 0.0 );
    return AgXToneMapping( color * ( exposure / max( toneMappingExposure, 1e-4 ) ) );
  }
`

/** Whether three's tone-mapping chunk carries the film yet. */
export function directFilmInstalled (): boolean {
  return ShaderChunk.tonemapping_pars_fragment.includes('scapeFilm')
}

/**
 * Develop the frame inside the materials: the film, then the ACES curve, as
 * the renderer's tone mapping. Global, because the chunk is, and idempotent;
 * it must run before the first program compiles. With `direct` false the
 * renderer keeps the plain ACES curve (a post chain grades in its lens).
 */
export function installDirectFilm (renderer: WebGLRenderer, direct: boolean): void {
  if (!directFilmInstalled())
    ShaderChunk.tonemapping_pars_fragment = ShaderChunk.tonemapping_pars_fragment
      .replace(IDENTITY_TONE_MAPPING, DIRECT_TONE_MAPPING)

  renderer.toneMapping = direct && directFilmInstalled() ? CustomToneMapping : AgXToneMapping
}

// perf: ~70 scalar operations per fragment in programs the tier already
// links (the grade ~46, the vignette and the grain the rest); no target, no
// pass, no texture, one vec3 varying. The chain's lens loses a 3d fetch
// and the app a 144 kB cube and its cpu bake.

/**
 * How hard the film is developed: the grade, read off the one camera row.
 *
 * The grade and the glass were two rows; they are one decision — how much of
 * a camera stands between the place and the eye — so `look.lens` carries both,
 * and `look.intensity` is the grade at a full camera (a config leaf). Over one
 * the row adds glass, never more grade; at zero the frame is a raw sensor.
 */
type LookType = { intensity: number, lens: number }
type GlareLook = { glare: number, lens: number }

export function gradeAmount (look: LookType): number {
  return look.intensity * Math.min(1, Math.max(0, look.lens))
}

/**
 * How much light the glass scatters: the bloom, the streak, and the rays the
 * deck's gaps throw. Read off the same camera row, because a lens with no
 * glass in it (`look.lens` 0) scatters nothing either; `look.glare` is the
 * scatter at a full camera, a config leaf, so a run can tune a cleaner or a
 * dirtier lens without a second slider on the panel.
 */
export function glareAmount (look: GlareLook): number {
  return look.glare * Math.max(0, look.lens)
}
