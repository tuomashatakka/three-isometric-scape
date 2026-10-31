import { Vector2 } from 'three'
import type { Data3DTexture } from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'


/**
 * The lens, in one pass.
 *
 * Before this the end of the chain was seven full-screen passes on desktop —
 * two separable tilt-shift pairs, a grade, a lut and a grain pass — each one a
 * read and a write of a half-float frame. A camera does all of that in one
 * piece of glass and one piece of film, and so does this:
 *
 * - **defocus** — a Vogel disc around every fragment whose radius grows with
 *   the distance from the focused band. A disc rather than a gaussian, because
 *   that is what an aperture draws: a lit window out of focus is a soft coin,
 *   not a smudge. Bright taps weigh more, so highlights bloom into discs.
 * - **lateral chromatic aberration** — red and blue land a fraction of a pixel
 *   either side of green, growing with the square of the distance from the
 *   centre, which is what an uncorrected wide lens does at its corners.
 * - **natural vignetting** — the cos⁴ law, not a smoothstep ring.
 * - **micro-contrast** in the focused band — the crispness a sharp lens has
 *   and a multisampled render does not.
 * - **the grade** — contrast and saturation, then the baked 3d lut.
 * - **film grain**, strongest in the mid-tones where film shows it.
 *
 * It runs in linear hdr, before `OutputPass` tone-maps, exactly as the passes
 * it replaces did.
 */

/** Taps on the defocus disc, per tier. Zero compiles the defocus out. */
export type LensTaps = number

export interface LensOptions {
  taps:  LensTaps
  grain: boolean
  lut:   Data3DTexture
}

export interface LensLook {

  /** Defocus radius at the frame edge, in buffer pixels. */
  blur: number

  /** Red/blue split at the corners, in buffer pixels. */
  aberration: number
  vignette:   number
  sharpen:    number
  grain:      number
  lut:        Data3DTexture
  intensity:  number
}

export interface LensPass extends ShaderPass {
  look(look: LensLook): void
  aim(focus: number, time: number): void
  size(width: number, height: number): void
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/**
 * Points on a unit disc, evenly spread, deterministic.
 *
 * Vogel's sunflower: the k-th point sits at radius √((k + ½)/n) and turns by
 * the golden angle, so any prefix of it covers the disc evenly and no two
 * points line up — which is what keeps a 16-tap blur from printing a pattern.
 */
export function vogelDisc (taps: number): Array<[number, number]> {
  return Array.from({ length: taps }, (_unused, index) => {
    const radius = Math.sqrt((index + 0.5) / taps)
    const angle  = index * GOLDEN_ANGLE
    return [ radius * Math.cos(angle), radius * Math.sin(angle) ]
  })
}

/** The disc as a glsl constant array, so the loop unrolls with no uniform reads. */
function discGlsl (taps: number): string {
  if (taps <= 0)
    return ''

  const points = vogelDisc(taps)
    .map(([ x, y ]) => `vec2(${x.toFixed(5)}, ${y.toFixed(5)})`)
    .join(',\n    ')
  return `const vec2 DISC[${taps}] = vec2[${taps}](\n    ${points}\n  );`
}

function fragment (taps: number, grain: boolean): string {
  return /* glsl */ `
  precision highp sampler3D;

  uniform sampler2D tDiffuse;
  uniform sampler3D uLut;
  uniform float uLutSize, uLutIntensity;
  uniform vec2  uTexel, uAspect;
  uniform float uFocus, uBlur, uAberration, uVignette, uSharpen, uGrain, uTime;

  varying vec2 vUv;

  ${discGlsl(taps)}

  float luma (vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

  float hash (vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main () {
    vec4  source = texture2D(tDiffuse, vUv);
    vec3  col    = source.rgb;
    float open   = 0.0;

    // How far out of the focused band this fragment is, 0..1 across half a frame.
    float defocus = clamp(abs(vUv.y - uFocus) * 2.0, 0.0, 1.0);

    ${taps > 0
      ? `
    float radius = uBlur * defocus;
    if (radius > 0.35) {
      // A per-pixel turn of the disc trades the taps' pattern for fine noise.
      // Interleaved gradient noise rather than a hash: neighbours turn by
      // well-spread angles, so the noise is a fine even dither, not speckle.
      float turn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
      mat2  spin = mat2(cos(turn), sin(turn), -sin(turn), cos(turn));
      vec3  sum  = vec3(0.0);
      float mass = 0.0;
      for (int i = 0; i < ${taps}; i++) {
        vec3  tap    = textureLod(tDiffuse, vUv + spin * DISC[i] * radius * uTexel, 0.0).rgb;
        // Highlights weigh more: an out-of-focus lamp is a bright coin, not a smear.
        float weight = 1.0 + 1.2 * clamp(luma(tap) - 1.0, 0.0, 4.0);
        sum  += tap * weight;
        mass += weight;
      }
      open = smoothstep(0.35, 1.5, radius);
      col  = mix(col, sum / mass, open);
    }`
      : ''}

    // Micro-contrast where the lens is sharp, faded out as the disc opens.
    float crisp = uSharpen * (1.0 - smoothstep(0.0, 0.35, defocus));
    if (crisp > 0.0) {
      vec3 cross = textureLod(tDiffuse, vUv + vec2(uTexel.x, 0.0), 0.0).rgb
                 + textureLod(tDiffuse, vUv - vec2(uTexel.x, 0.0), 0.0).rgb
                 + textureLod(tDiffuse, vUv + vec2(0.0, uTexel.y), 0.0).rgb
                 + textureLod(tDiffuse, vUv - vec2(0.0, uTexel.y), 0.0).rgb;
      col += (source.rgb - cross * 0.25) * crisp;
    }

    // Lateral chromatic aberration, added as the difference it makes rather
    // than re-sampling the disc per channel. That difference is a sharp edge,
    // so it fades as the disc opens — on a blurred edge it would print the
    // sharp one back as coloured speckle.
    vec2  centre = (vUv - 0.5) * uAspect;
    float reach  = dot(centre, centre);
    if (uAberration > 0.0 && open < 1.0) {
      vec2 split = normalize(centre + 1e-6) * reach * uAberration * uTexel;
      col.r += (textureLod(tDiffuse, vUv + split, 0.0).r - source.r) * (1.0 - open);
      col.b += (textureLod(tDiffuse, vUv - split, 0.0).b - source.b) * (1.0 - open);
    }

    // cos⁴ falloff of a lens whose half-diagonal sees ~40°.
    float slant = 1.0 / (1.0 + reach * 1.4);
    col *= mix(1.0, slant * slant, uVignette);

    // The grade: contrast about mid-grey, then saturation, then the lut.
    col = max((col - 0.18) * 1.04 + 0.18, 0.0);
    col = mix(vec3(luma(col)), col, 1.06);
    vec3 uvw = vec3(0.5 / uLutSize) + clamp(col, 0.0, 1.0) * (1.0 - 1.0 / uLutSize);
    col = mix(col, textureLod(uLut, uvw, 0.0).rgb, uLutIntensity);

    ${grain
      ? `
    float tone = clamp(luma(col), 0.0, 1.0);
    float body = 0.35 + 2.6 * tone * (1.0 - tone);
    col += (hash(vUv * 1024.0 + uTime) - 0.5) * uGrain * body;`
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

export function createLensPass ({ taps, grain, lut }: LensOptions): LensPass {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse:      { value: null },
      uLut:          { value: lut },
      uLutSize:      { value: lut.image.width },
      uLutIntensity: { value: 1 },
      uTexel:        { value: new Vector2(1, 1) },
      uAspect:       { value: new Vector2(1, 1) },
      uFocus:        { value: 0.5 },
      uBlur:         { value: 0 },
      uAberration:   { value: 0 },
      uVignette:     { value: 0 },
      uSharpen:      { value: 0 },
      uGrain:        { value: 0 },
      uTime:         { value: 0 },
    },
    vertexShader:   VERTEX,
    fragmentShader: fragment(Math.max(0, Math.round(taps)), grain),
  }) as LensPass

  const uniforms = pass.uniforms

  pass.look = look => {
    uniforms.uBlur.value         = look.blur
    uniforms.uAberration.value   = look.aberration
    uniforms.uVignette.value     = look.vignette
    uniforms.uSharpen.value      = look.sharpen
    uniforms.uGrain.value        = look.grain
    uniforms.uLut.value          = look.lut
    uniforms.uLutSize.value      = look.lut.image.width
    uniforms.uLutIntensity.value = look.intensity
  }

  pass.aim = (focus, time) => {
    uniforms.uFocus.value = focus
    uniforms.uTime.value  = time
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

// perf: one full-screen pass in place of seven on desktop. The defocus is
// `taps` fetches only where the disc is wider than a third of a pixel, the
// micro-contrast four only in the focused band, the aberration two.
