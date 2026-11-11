import { ACESFilmicToneMapping, Color, CustomToneMapping, ShaderChunk } from 'three'
import type { WebGLRenderer } from 'three'


/**
 * The film: one grade, wherever the frame is developed.
 *
 * The grade used to be a 33³ lookup texture sampled by the lens pass, picked
 * from seven recipes — which meant it existed only where a post chain did. The
 * phone tier has none (it loses its context linking one), so the frames most
 * people see went out ungraded: no contrast about mid-grey, no shoulder, no
 * stock, no split tone.
 *
 * The lookup was only ever a closed-form function baked into a cube, so it is
 * that function again, {@link FILM_GLSL}, and it runs in whichever stage the
 * tier has:
 *
 * - **with a chain**, in the lens pass (`lens.ts`), on the composed frame;
 * - **without one**, inside every material's own tone-mapping stage — three's
 *   `CustomToneMapping` hook — just before the ACES curve the bare renderer
 *   already ran there. No render target, no pass, no extra program: the grade
 *   rides in programs the tier links anyway.
 *
 * Both run in linear hdr ahead of the same tone curve, so a phone and a desktop
 * develop the same stock. What the direct path cannot do is anything that
 * reads a neighbour — defocus, halation, micro-contrast stay the lens's.
 *
 * There is one stock, {@link STOCK}: the camera is already white-balanced to
 * the light, and a selector of seven looks was seven ways to undo that.
 */

/** Rec. 709 luminance weights. */
const LUMA = [ 0.2126, 0.7152, 0.0722 ] as const

/** Multipliers on red, green, blue for the deepest shade and the brightest light. */
export const SHADE_TINT = [ 0.95, 1, 1.07 ] as const
export const LIGHT_TINT = [ 1.05, 1, 0.93 ] as const

/** The most of the tint the split tone applies, at full grade strength. */
export const SPLIT_REACH = 0.7

/**
 * The film's shoulder: how far a highlight past paper white loses its colour.
 *
 * A digital sensor clips each channel on its own, so a bright sail or a sunlit
 * gable goes to a flat saturated block; film's dyes saturate together and a
 * highlight runs off toward white. It starts at a luminance only the lit
 * highlights reach, so the mid-tones and every shadow are untouched.
 */
export const FILM_SHOULDER = [ 0.7, 1.8 ] as const
export const SHOULDER_PULL = 0.55

/** Contrast about mid-grey at full grade strength, over the 1.0 of no grade. */
export const CONTRAST_REACH = 0.2

/** Mid-grey in linear light: the pivot the contrast turns about. */
export const MID_GREY = 0.18

/** Saturation the film always has, at any strength. */
export const FILM_SATURATION = 1.06

/**
 * The stock: a cool, slightly lifted nordic negative. `contrast` turns about
 * half of display white, `split` leans the shade teal and the light amber,
 * `tint` at `amount` is the cast and `lift` the floor of the blacks.
 */
export const STOCK = {
  contrast:   1.14,
  split:      0.62,
  saturation: 0.94,
  tint:       '#9fb8c4',
  amount:     0.32,
  lift:       0.024,
} as const

/** The stock's cast as a gain on red, green, blue — its brightest channel is left alone. */
export const STOCK_GAIN: readonly [number, number, number] = (() => {
  const tint      = new Color(STOCK.tint)
  const brightest = Math.max(tint.r, tint.g, tint.b, 1e-6)
  const gain      = (value: number): number => 1 + (value / brightest - 1) * STOCK.amount

  return [ gain(tint.r), gain(tint.g), gain(tint.b) ]
})()

type Rgb = readonly [number, number, number]

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))
const luma    = (c: Rgb): number => c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2]
const each    = (c: Rgb, f: (value: number, channel: 0 | 1 | 2) => number): Rgb => [ f(c[0], 0), f(c[1], 1), f(c[2], 2) ]

function smooth (low: number, high: number, value: number): number {
  const t = clamp01((value - low) / (high - low))
  return t * t * (3 - 2 * t)
}

/** The share of a fragment's chroma the shoulder takes, at grade strength `intensity`. */
export function shoulder (lightness: number, intensity: number): number {
  return smooth(FILM_SHOULDER[0], FILM_SHOULDER[1], lightness) * SHOULDER_PULL * intensity
}

/** The multiplier on one channel for a fragment of luminance `lightness`, at `strength` 0..1. */
export function splitTone (lightness: number, channel: 0 | 1 | 2, strength: number): number {
  const shade = 1 - smooth(0, 0.25, lightness)
  const light = smooth(0.35, 1.5, lightness)
  return 1 + strength * SPLIT_REACH * (shade * (SHADE_TINT[channel] - 1) + light * (LIGHT_TINT[channel] - 1))
}

/** The contrast the grade applies at `strength` 0..1 — the flat grey wash gains its depth here. */
export function gradeContrast (strength: number): number {
  return 1 + CONTRAST_REACH * clamp01(strength)
}

/** What the stock makes of a linear colour under paper white, at full strength: developed in display space. */
export function stock (colour: Rgb): Rgb {
  const curved = each(colour, value => clamp01((Math.sqrt(clamp01(value)) - 0.5) * STOCK.contrast + 0.5))
  const light  = luma(curved)
  const shade  = 1 - light
  const lean   = [ light * 0.05 - shade * 0.015, light * 0.02 + shade * 0.025, shade * 0.05 - light * 0.05 ]
  const split  = each(curved, (value, channel) => clamp01(value + lean[channel] * STOCK.split))
  const grey   = luma(split)

  return each(split, (value, channel) => {
    const dyed = clamp01(grey + (value - grey) * STOCK.saturation)
    return STOCK.lift + dyed * dyed * STOCK_GAIN[channel] * (1 - STOCK.lift)
  })
}

/**
 * The whole grade on one linear-hdr colour at `strength` 0..1 — what
 * {@link FILM_GLSL} evaluates, kept here so a test can state what it does.
 */
export function film (colour: Rgb, strength: number): Rgb {
  const contrast = gradeContrast(strength)
  const pivoted  = each(colour, value => Math.max(0, (value - MID_GREY) * contrast + MID_GREY))
  const grey     = luma(pivoted)
  const vivid    = each(pivoted, value => Math.max(0, grey + (value - grey) * FILM_SATURATION))
  const bright   = luma(vivid)
  const rolled   = each(vivid, value => value + (bright - value) * shoulder(bright, strength))
  const dyed     = stock(rolled)
  const printed  = each(rolled, (value, channel) => value + (dyed[channel] - value) * strength)
  const lit      = luma(printed)

  return each(printed, (value, channel) => value * splitTone(lit, channel, strength))
}

const vec3 = (c: readonly number[]): string => `vec3(${c.map(v => v.toFixed(4)).join(', ')})`

/** `vec3 scapeFilm(vec3 colour, float strength)` — the grade, for any fragment stage. */
export const FILM_GLSL = /* glsl */ `
  vec3 scapeFilm (vec3 col, float strength) {
    const vec3 W = ${vec3(LUMA)};

    // Contrast about mid-grey, then the film's own saturation.
    col = max((col - ${MID_GREY.toFixed(2)}) * (1.0 + ${CONTRAST_REACH.toFixed(2)} * clamp(strength, 0.0, 1.0)) + ${MID_GREY.toFixed(2)}, 0.0);
    col = max(mix(vec3(dot(col, W)), col, ${FILM_SATURATION.toFixed(2)}), 0.0);

    // The shoulder: a highlight past paper white runs off toward white.
    float bright = dot(col, W);
    col = mix(col, vec3(bright), smoothstep(${FILM_SHOULDER[0].toFixed(2)}, ${FILM_SHOULDER[1].toFixed(2)}, bright) * ${SHOULDER_PULL.toFixed(2)} * strength);

    // The stock: its curve, its lean, its dyes, its cast and its lifted blacks.
    // Developed in display space (a square root is near enough the transfer
    // curve): a stock's S-curve pivots on what the eye calls half, and turned
    // about half of *linear* white it crushed every shade under 6% to black.
    vec3  dye   = clamp((sqrt(clamp(col, 0.0, 1.0)) - 0.5) * ${STOCK.contrast.toFixed(2)} + 0.5, 0.0, 1.0);
    float light = dot(dye, W);
    float shade = 1.0 - light;
    dye = clamp(dye + vec3(light * 0.05 - shade * 0.015, light * 0.02 + shade * 0.025, shade * 0.05 - light * 0.05) * ${STOCK.split.toFixed(2)}, 0.0, 1.0);
    dye = clamp(mix(vec3(dot(dye, W)), dye, ${STOCK.saturation.toFixed(2)}), 0.0, 1.0);
    dye = ${STOCK.lift.toFixed(3)} + dye * dye * ${vec3(STOCK_GAIN)} * ${(1 - STOCK.lift).toFixed(3)};
    col = mix(col, dye, strength);

    // The split tone: cool shade, warm light, mid-tones left alone.
    float lit = dot(col, W);
    col *= vec3(1.0) + strength * ${SPLIT_REACH.toFixed(2)}
         * ((1.0 - smoothstep(0.0, 0.25, lit)) * (${vec3(SHADE_TINT)} - 1.0)
            + smoothstep(0.35, 1.5, lit) * (${vec3(LIGHT_TINT)} - 1.0));

    return col;
  }
`

/**
 * The direct path's one channel into every program: three hands a bare
 * renderer's materials exactly one global uniform at the tone-mapping stage,
 * `toneMappingExposure`, so the grade's strength rides in it. The exposure
 * keeps the low part (it is always under {@link EXPOSURE_SPAN}) and the
 * strength the multiples of it, in {@link STRENGTH_STEPS} steps — finer than
 * the panel's slider moves.
 */
export const EXPOSURE_SPAN  = 4
export const STRENGTH_STEPS = 100

export interface FilmExposure {
  exposure: number
  strength: number
}

/** Exposure and grade strength (0..1) in the one float the direct film reads. */
export function packExposure (exposure: number, strength: number): number {
  const level = Math.round(clamp01(strength) * STRENGTH_STEPS)
  return level * EXPOSURE_SPAN + Math.min(EXPOSURE_SPAN - 1e-3, Math.max(0, exposure))
}

/** The inverse of {@link packExposure} — what the shader does with the uniform. */
export function unpackExposure (packed: number): FilmExposure {
  const level = Math.floor(packed / EXPOSURE_SPAN)
  return { exposure: packed - level * EXPOSURE_SPAN, strength: level / STRENGTH_STEPS }
}

const IDENTITY_TONE_MAPPING = 'vec3 CustomToneMapping( vec3 color ) { return color; }'

// ACES multiplies by the uniform itself, so the colour is pre-scaled by the
// share of the uniform that is exposure and the curve sees the true exposure.
const DIRECT_TONE_MAPPING = /* glsl */ `
  ${FILM_GLSL}
  vec3 CustomToneMapping( vec3 color ) {
    float level    = floor( toneMappingExposure / ${EXPOSURE_SPAN.toFixed(1)} );
    float exposure = toneMappingExposure - level * ${EXPOSURE_SPAN.toFixed(1)};
    color = scapeFilm( color, level / ${STRENGTH_STEPS.toFixed(1)} );
    return ACESFilmicToneMapping( color * ( exposure / max( toneMappingExposure, 1e-4 ) ) );
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

  renderer.toneMapping = direct && directFilmInstalled() ? CustomToneMapping : ACESFilmicToneMapping
}

// perf: ~40 scalar operations per fragment in programs the tier already
// links; no target, no pass, no texture. The chain's lens loses a 3d fetch
// and the app a 144 kB cube and its cpu bake.
