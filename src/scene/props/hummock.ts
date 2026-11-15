import { repeatKeepGlsl } from '../frame.ts'

/** A number, as glsl reads it: always with a point. */
const f = (v: number): string => Number.isInteger(v) ? v.toFixed(1) : String(v)

/**
 * The ground's metre-scale form: hummocks, tussock and frost heave.
 *
 * The terrain had two scales of relief and nothing between them. The mesh is
 * a vertex every 0.7–2.3 m, smoothed by its own normals, so a field shades as
 * one broad facet; the grit (`SOIL_FRAGMENT`) is centimetres. Real rough
 * grazing on a northern coast is neither — it is a field of tussocks and frost
 * hummocks a metre or so across and a hand high, and that is the scale
 * that catches a low sun and makes a slope read as ground rather than felt.
 *
 * So the ground fragment builds that form itself, from where it stands: two
 * octaves of gradient-carrying value noise in world metres (Quilez's analytic
 * derivatives — the height and its slope out of the same four lattice hashes,
 * so the light and the shade cannot disagree), squashed so crowns are rounder
 * than hollows, as a tussock is. No texture, no attribute read beyond the
 * vertex colour the terrain already carries, no draw.
 *
 * - **the slope** turns the normal, so every crown has a lit and a shaded side
 * - **the height** paints: crowns drier and lighter, hollows darker, smoother
 *   and damper — the hollow is where the water and the moss stay, and in a
 *   shower (`weather.wet`) it is where the rain stands first
 * - **the crown** sheds its snow to the wind, so a snowfield shows the tussock
 *   tops through it (`HUMMOCK_SNOW`, spliced into the season's cover)
 *
 * Only the terrain takes it. The two shared materials also draw every prop, and
 * a roof or a pier deck with hummocks in it would be wrong; the terrain's
 * vertex colour carries an alpha (`markRoughGround`), which is a program
 * parameter in three (`USE_COLOR_ALPHA`), so the terrain compiles its own
 * variant of the ground program and the alpha is the rough-ground share. It
 * rides `terrain.detailGrain` (no knob) and lets go with the frame's repeat
 * budget, so the archipelago frame neither evaluates nor shimmers with it.
 */

/** Wavelength of the coarse octave, metres: a tussock or a frost hummock. */
export const HUMMOCK_SPAN = 1.4

/** Height of the coarse octave's crest, metres — the second octave adds half. */
export const HUMMOCK_HEIGHT = 0.12

/** How far the slope turns the normal, per unit slope. */
export const HUMMOCK_RELIEF = 1.4

/**
 * How far a crown lightens and a hollow darkens the albedo, at full height.
 * Lopsided on purpose: under the overcast this coast mostly has, the normal
 * barely shows and what reads is the hollow the sky cannot see into — a
 * cavity term, so the dark side is the strong one.
 */
export const HUMMOCK_CROWN  = 0.12
export const HUMMOCK_HOLLOW = 0.42

/** How far standing water in a hollow darkens it, at full wet. */
export const HUMMOCK_POOL = 0.35

/**
 * How much of its snow a crown loses to the wind. A snowfield over rough
 * grazing is never one white: the tussock tops are scoured and stand through
 * it, dark, a metre apart — which is what makes the winter frame read as
 * ground under snow rather than as a white sheet.
 */
export const HUMMOCK_SCOUR = 0.75

/** The season's snow, thinned on the crowns; spliced after its cover is known. */
export const HUMMOCK_SNOW = /* glsl */`
#ifdef SCAPE_HUMMOCK
  scapeSnow *= 1.0 - ${f(HUMMOCK_SCOUR)} * scapeCrown;
#endif
`

/** Repeats of the coarse octave across the frame between which it lets go. */
export const HUMMOCK_REPEATS = [ 22, 70 ] as const

/** The second octave's rotation and scale: off-grid, so the lattices never line up. */
const OCTAVE = { scale: 2.17, cos: 0.8, sin: 0.6, gain: 0.5 }

/** Dave Hoskins' sine-free hash: stable in highp to lattice coordinates in the thousands. */
function hash (x: number, y: number): number {
  const fr = (v: number): number => v - Math.floor(v)
  let a = fr(x * 0.1031)
  let b = fr(y * 0.1031)
  let c = a
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33)
  a += d
  b += d
  c += d
  return fr((a + b) * c)
}

/** One octave: height in -1..1 and its gradient, at `x, z` in lattice units. */
function octave (x: number, z: number): [number, number, number] {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10)
  const dx = 30 * fx * fx * (fx * (fx - 2) + 1)
  const dz = 30 * fz * fz * (fz * (fz - 2) + 1)
  const a  = hash(ix, iz)
  const b  = hash(ix + 1, iz)
  const c  = hash(ix, iz + 1)
  const d  = hash(ix + 1, iz + 1)
  const k  = a - b - c + d
  const h  = a + (b - a) * ux + (c - a) * uz + k * ux * uz

  return [ h * 2 - 1, 2 * dx * (b - a + k * uz), 2 * dz * (c - a + k * ux) ]
}

/**
 * The form at a world point: height in metres and its slope (dh/dx, dh/dz) —
 * the same arithmetic as the glsl, for tests and the readme's numbers.
 */
export function hummock (x: number, z: number): [number, number, number] {
  const s              = 1 / HUMMOCK_SPAN
  const [ h0, a0, b0 ] = octave(x * s, z * s)
  const k              = s * OCTAVE.scale
  const rx             = OCTAVE.cos * x - OCTAVE.sin * z
  const rz             = OCTAVE.sin * x + OCTAVE.cos * z
  const [ h1, a1, b1 ] = octave(rx * k + 17.3, rz * k + 5.9)
  // The second octave's gradient, rotated back out of its own frame.
  const gx1 = (a1 * OCTAVE.cos + b1 * OCTAVE.sin) * k
  const gz1 = (-a1 * OCTAVE.sin + b1 * OCTAVE.cos) * k
  const raw = h0 + OCTAVE.gain * h1
  // Rounded crowns, sharp hollows: h - 0.25 h², and the chain rule on the slope.
  const squash = (1 - 0.5 * raw) * HUMMOCK_HEIGHT
  const height = (raw - 0.25 * raw * raw) * HUMMOCK_HEIGHT
  const gx     = (a0 * s + OCTAVE.gain * gx1) * squash
  const gz     = (b0 * s + OCTAVE.gain * gz1) * squash

  return [ height, gx, gz ]
}


/** The two glsl functions; declared once per program. */
export const HUMMOCK_PARS_FRAGMENT = /* glsl */`
#ifdef USE_COLOR_ALPHA
  #define SCAPE_HUMMOCK

  // How far this fragment stands on a crown, 0..1 — the snow reads it.
  float scapeCrown = 0.0;

  float scapeHash (vec2 p) {
    vec3 p3 = fract(p.xyx * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec3 scapeOctave (vec2 p) {
    vec2 i  = floor(p);
    vec2 t  = p - i;
    vec2 u  = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
    vec2 du = 30.0 * t * t * (t * (t - 2.0) + 1.0);
    float a = scapeHash(i);
    float b = scapeHash(i + vec2(1.0, 0.0));
    float c = scapeHash(i + vec2(0.0, 1.0));
    float d = scapeHash(i + vec2(1.0, 1.0));
    float k = a - b - c + d;
    float h = a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y;
    return vec3(h * 2.0 - 1.0, 2.0 * du * vec2(b - a + k * u.y, c - a + k * u.x));
  }

  vec3 scapeHummock (vec2 p) {
    const float s = ${f(1 / HUMMOCK_SPAN)};
    const float k = ${f(OCTAVE.scale / HUMMOCK_SPAN)};
    const mat2 turn = mat2(${f(OCTAVE.cos)}, ${f(OCTAVE.sin)}, ${f(-OCTAVE.sin)}, ${f(OCTAVE.cos)});
    vec3 o0 = scapeOctave(p * s);
    vec3 o1 = scapeOctave(turn * p * k + vec2(17.3, 5.9));
    vec2 g1 = vec2(o1.y * ${f(OCTAVE.cos)} + o1.z * ${f(OCTAVE.sin)}, -o1.y * ${f(OCTAVE.sin)} + o1.z * ${f(OCTAVE.cos)}) * k;
    float raw = o0.x + ${f(OCTAVE.gain)} * o1.x;
    float squash = 1.0 - 0.5 * raw;
    vec2 g = (o0.yz * s + ${f(OCTAVE.gain)} * g1) * squash * ${f(HUMMOCK_HEIGHT)};
    return vec3((raw - 0.25 * raw * raw) * ${f(HUMMOCK_HEIGHT)}, g);
  }
#endif
`

/**
 * The term, on the terrain's own program variant. Needs `scapeFlat`,
 * `uDetailStrength`, `uWetAmount`, `normal` and the material's colour terms in
 * scope — the ground material declares all of them.
 * Weighted by how far the albedo leans to vegetation or peat over sand and
 * track — a path is trodden flat — and by the frame.
 */
export const HUMMOCK_FRAGMENT = /* glsl */`
#ifdef USE_COLOR_ALPHA
  {
    float keep = ${repeatKeepGlsl(`scapeFrameMetres() * ${f(1 / HUMMOCK_SPAN)}`, HUMMOCK_REPEATS)};
    if (keep > 0.0) {
      vec3 c      = diffuseColor.rgb;
      float sandy = clamp((c.r - c.b) / (c.r + c.g + c.b + 0.02) * 4.0 - 0.6, 0.0, 1.0) * step(c.g * 2.0, c.r + c.b + 0.04);
      float w     = vColor.a * scapeFlat * uDetailStrength * keep * (1.0 - 0.8 * sandy);
      vec3 form   = scapeHummock(vScapeGround);
      float lift  = form.x / ${f(HUMMOCK_HEIGHT)};

      scapeCrown = smoothstep(0.15, 0.9, lift) * w;

      normal = normalize(normal - mat3(viewMatrix) * vec3(form.y, 0.0, form.z) * ${f(HUMMOCK_RELIEF)} * w);
      diffuseColor.rgb *= 1.0 + lift * w * (lift > 0.0 ? ${f(HUMMOCK_CROWN)} : ${f(HUMMOCK_HOLLOW)});
      roughnessFactor   = clamp(roughnessFactor + lift * 0.08 * w, 0.05, 1.0);

      // Rain runs off the crowns and stands in the hollows, so a shower shows
      // in the low ground first: darker, and as smooth as the sky can see.
      float pool = uWetAmount * max(0.0, -lift) * w;
      diffuseColor.rgb *= 1.0 - ${f(HUMMOCK_POOL)} * pool;
      roughnessFactor   = mix(roughnessFactor, 0.08, pool);
    }
  }
#endif
`
