import { Vector2 } from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { FILM_GLSL } from './film.ts'


/**
 * The lens, in one pass.
 *
 * Before this the end of the chain was seven full-screen passes on desktop —
 * two separable tilt-shift pairs, a grade, a lut and a grain pass — each one a
 * read and a write of a half-float frame. A camera does all of that in one
 * piece of glass and one piece of film, and so does this:
 *
 * - **no defocus.** There was one — a Vogel disc opening off a focal plane
 *   read from the depth — and it is the trick tilt-shift photographers use to
 *   make a real town look like a model of one. A camera framing a yard from
 *   the distance this one stands at keeps everything sharp, so this one does.
 * - **lateral chromatic aberration** — red and blue land a fraction of a pixel
 *   either side of green, growing with the square of the distance from the
 *   centre, which is what an uncorrected wide lens does at its corners.
 * - **natural vignetting** — the cos⁴ law, not a smoothstep ring.
 * - **contrast-adaptive sharpening** over the whole frame — the crispness a
 *   sharp lens has and a multisampled render does not, weighted down where the
 *   neighbourhood already has contrast, so an edge never rings into a halo —
 *   and clarity, the same cross five pixels out, for the mid-scale relief.
 * - **the grade** — `film.ts`'s one function: contrast and saturation, the
 *   shoulder, the stock, then the split tone. The same function develops the
 *   frame inside the materials on a tier with no chain.
 * - **halation** — the red-orange bloom of light that went through the film
 *   and bounced off its backing: only what is brighter than the paper white of
 *   the frame (sun glints, lit windows, the sun's own disc) spills, in a ring
 *   wider than the bloom's, tinted warm, never a haze over the whole frame.
 * - **film grain**, strongest in the mid-tones where film shows it.
 *
 * It runs in linear hdr, before `OutputPass` tone-maps, exactly as the passes
 * it replaces did.
 */

export interface LensOptions {

  /** The halation ring: eight more fetches a fragment, desktop and up. */
  halation: boolean
  grain:    boolean
}

export interface LensLook {

  /** Red/blue split at the corners, in buffer pixels. */
  aberration: number
  vignette:   number
  sharpen:    number

  /** How much of a highlight's excess spills back as a warm ring. */
  halation:  number
  grain:     number
  intensity: number
}

export interface LensPass extends ShaderPass {
  look(look: LensLook): void
  tick(time: number): void
  size(width: number, height: number): void
}

/** The colour of halation: the red layer lets most light through and returns it, the blue none. */
export const HALATION_TINT = [ 1, 0.34, 0.12 ] as const

/** Luminance above which a pixel halates, in linear hdr where paper white is 1. */
export const HALATION_THRESHOLD = 1

/** Taps on the halation ring and its reach in buffer pixels. */
export const HALATION_TAPS  = 8
export const HALATION_REACH = 16

/**
 * What a fragment of `luma` contributes to a halo: nothing at or under the
 * threshold, and the excess beyond it, capped so one hot pixel cannot paint a
 * lamp across the street.
 */
export function halationSource (luma: number): number {
  return Math.min(4, Math.max(0, luma - HALATION_THRESHOLD))
}

/**
 * How far the sharpen may push a pixel, 0..1, given the darkest and brightest
 * tone (luma over one plus luma) in its cross: the glsl's `headroom`. Flat
 * ground keeps most of it; an edge between near black and near white keeps
 * next to none, which is what stops the sharpen ringing.
 */
export function sharpenHeadroom (lo: number, hi: number): number {
  return Math.sqrt(Math.min(1, Math.max(0, Math.min(lo, 1 - hi) / Math.max(hi, 1e-4))))
}

/** Share of the wide-radius local contrast ("clarity") added per unit of micro-contrast. */
export const CLARITY_RATIO = 0.5

function fragment (halation: boolean, grain: boolean): string {
  return /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uGrade;
  uniform vec2  uTexel, uAspect;
  uniform float uAberration, uVignette, uSharpen, uGrain, uTime, uHalation;

  varying vec2 vUv;

  float luma (vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

  // Luma squeezed into 0..1, so the sharpen's contrast test means the same
  // thing on a lamp at 4 as on turf at 0.1 in this linear hdr buffer.
  float tone (vec3 c) { float l = luma(c); return l / (1.0 + l); }

  ${FILM_GLSL}

  float hash (vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main () {
    vec4 source = texture2D(tDiffuse, vUv);
    vec3 col    = source.rgb;

    // Contrast-adaptive sharpening (the shape of AMD's CAS): the cross's
    // headroom between its darkest and brightest tone sets how much a pixel
    // may be pushed, so flat turf and haze crisp up and a hard edge — a roof
    // against the sky — does not ring into a pale halo.
    if (uSharpen > 0.0) {
      vec3 e = textureLod(tDiffuse, vUv + vec2(uTexel.x, 0.0), 0.0).rgb;
      vec3 w = textureLod(tDiffuse, vUv - vec2(uTexel.x, 0.0), 0.0).rgb;
      vec3 n = textureLod(tDiffuse, vUv + vec2(0.0, uTexel.y), 0.0).rgb;
      vec3 s = textureLod(tDiffuse, vUv - vec2(0.0, uTexel.y), 0.0).rgb;
      float t  = tone(source.rgb);
      float lo = min(t, min(min(tone(e), tone(w)), min(tone(n), tone(s))));
      float hi = max(t, max(max(tone(e), tone(w)), max(tone(n), tone(s))));
      float headroom = sqrt(clamp(min(lo, 1.0 - hi) / max(hi, 1e-4), 0.0, 1.0));
      col += (source.rgb - (e + w + n + s) * 0.25) * uSharpen * headroom;

      // Clarity: the same cross five pixels out lifts the mid-scale relief
      // (hulls, ridges, tree crowns) a haze-grey frame flattens.
      vec2 wide  = uTexel * 5.0;
      vec3 broad = textureLod(tDiffuse, vUv + vec2(wide.x, 0.0), 0.0).rgb
                 + textureLod(tDiffuse, vUv - vec2(wide.x, 0.0), 0.0).rgb
                 + textureLod(tDiffuse, vUv + vec2(0.0, wide.y), 0.0).rgb
                 + textureLod(tDiffuse, vUv - vec2(0.0, wide.y), 0.0).rgb;
      col += (source.rgb - broad * 0.25) * uSharpen * headroom * ${CLARITY_RATIO.toFixed(2)};
    }

    ${halation
      ? `
    // Halation: a ring of taps on the highlight excess, turned per pixel by
    // interleaved gradient noise, tinted by the red layer of the film.
    if (uHalation > 0.0) {
      float spin = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
      vec3  halo = vec3(0.0);
      for (int i = 0; i < ${HALATION_TAPS}; i++) {
        float a   = spin + float(i) * ${(Math.PI * 2 / HALATION_TAPS).toFixed(5)};
        vec3  tap = textureLod(tDiffuse, vUv + vec2(cos(a), sin(a)) * ${HALATION_REACH.toFixed(1)} * uTexel, 0.0).rgb;
        halo += min(max(luma(tap) - ${HALATION_THRESHOLD.toFixed(2)}, 0.0), 4.0);
      }
      col += halo / ${HALATION_TAPS}.0 * uHalation * vec3(${HALATION_TINT.map(v => v.toFixed(2)).join(', ')});
    }`
      : ''}

    // Lateral chromatic aberration, added as the difference it makes rather
    // than re-sampling the frame per channel.
    vec2  centre = (vUv - 0.5) * uAspect;
    float reach  = dot(centre, centre);
    if (uAberration > 0.0) {
      vec2 split = normalize(centre + 1e-6) * reach * uAberration * uTexel;
      col.r += textureLod(tDiffuse, vUv + split, 0.0).r - source.r;
      col.b += textureLod(tDiffuse, vUv - split, 0.0).b - source.b;
    }

    // cos⁴ falloff of a lens whose half-diagonal sees ~40°.
    float slant = 1.0 / (1.0 + reach * 1.4);
    col *= mix(1.0, slant * slant, uVignette);

    col = scapeFilm(max(col, vec3(0.0)), uGrade);

    ${grain
      ? `
    float body = clamp(luma(col), 0.0, 1.0);
    col += (hash(vUv * 1024.0 + uTime) - 0.5) * uGrain * (0.35 + 2.6 * body * (1.0 - body));`
      : ''}

    gl_FragColor = vec4(col, source.a);
  }
`
}

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main () {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export function createLensPass ({ halation, grain }: LensOptions): LensPass {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse:    { value: null },
      uGrade:      { value: 1 },
      uTexel:      { value: new Vector2(1, 1) },
      uAspect:     { value: new Vector2(1, 1) },
      uAberration: { value: 0 },
      uVignette:   { value: 0 },
      uSharpen:    { value: 0 },
      uHalation:   { value: 0 },
      uGrain:      { value: 0 },
      uTime:       { value: 0 },
    },
    vertexShader:   VERTEX,
    fragmentShader: fragment(halation, grain),
  }) as LensPass

  const uniforms = pass.uniforms

  pass.look = look => {
    uniforms.uAberration.value = look.aberration
    uniforms.uVignette.value   = look.vignette
    uniforms.uSharpen.value    = look.sharpen
    uniforms.uHalation.value   = look.halation
    uniforms.uGrain.value      = look.grain
    uniforms.uGrade.value      = look.intensity
  }

  pass.tick = time => {
    uniforms.uTime.value = time
  }

  const texel  = uniforms.uTexel.value as Vector2
  const aspect = uniforms.uAspect.value as Vector2

  pass.size = (width, height) => {
    const w = Math.max(1, width)
    const h = Math.max(1, height)
    texel.set(1 / w, 1 / h)
    // The vignette and the aberration are round in the picture, not in uv.
    aspect.set(w / Math.max(w, h), h / Math.max(w, h))
  }

  return pass
}

// perf: one full-screen pass in place of seven on desktop: the sharpen's
// eight fetches, the aberration's two, and halation's eight on desktop and up.
// There is no focal map and no depth read for it any more.
