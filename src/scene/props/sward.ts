import { repeatKeepGlsl } from '../frame.ts'

/** A number, as glsl reads it: always with a point. */
const f = (v: number): string => Number.isInteger(v) ? v.toFixed(1) : String(v)

/**
 * The sward: grass that has blades, in tufts, combed by the wind.
 *
 * Turf was the largest surface in the close frames and the last one that read
 * as felt. The grit (`SOIL_FRAGMENT`) is centimetres of soil and the hummocks
 * (`hummock.ts`) are a metre of ground under the grass; the grass itself was a
 * tint. Rough grazing on a wind-scoured coast is neither smooth nor random: it
 * is tufts a hand across, their strands laid over one way by the prevailing
 * wind, green at the root and bleached to straw at the tip. So the terrain
 * fragment lays it itself, from where it stands — the gravel's green opposite.
 *
 * - **strands, combed.** A lattice of strands, long along the prevailing
 *   bearing (`uDriftDir`, the compass the drifts already lie on) and narrow
 *   across it, each column staggered by its own hash so no row lines up. A
 *   strand is rounded across (it turns the normal both ways) and lies over
 *   downwind (its face tips upwind), so a slope facing the wind reads a shade
 *   different from one in the lee — the comb you see across a field.
 * - **root and tip.** The gap between strands and the root of each is the
 *   cavity the sky cannot see into; the tip is lit, and in patches and on the
 *   tuft crowns it is straw — dead grass, which a northern pasture carries
 *   all summer and which is lighter and warmer than the live blade.
 * - **tufts.** A coarser one-cell lattice of tussock tufts, each a dome that
 *   never leaves its cell (`tuft` proves it) — so one cell is the whole search,
 *   which is what lets the phone have it. The tuft lifts and lights, the ground
 *   between them darkens.
 * - **wet.** In a shower (`weather.wet`) the blade darkens and its roughness
 *   falls, so a rained-on field takes the sky along its strands.
 *
 * Keyed on what the albedo already is: green with a margin (`leafiness`) —
 * meadow, pasture, moss, dry grass and crop as the terrain carries them; not
 * the trodden yard, the track, peat, stone, snow or the strand. Only the terrain's own variant takes it
 * (`USE_COLOR_ALPHA`, weighted by its rough-ground share); it rides
 * `terrain.detailGrain` (no knob), and each scale lets go with the frame's
 * repeat budget to the mean it would average to, so a frame too wide to show a
 * strand neither shimmers with it nor changes brightness when it goes.
 */

/**
 * The greenness `(2g - r - b) / (g + 0.05)` over which the sward comes in. The
 * terrain's turf, after the season and the heath have had it, measures 0.25 to
 * 0.45 (the palette's raw meadow is past 1); the yard and the trodden edges
 * stay under 0.12.
 */
export const LEAF_KEY = [ 0.12, 0.32 ] as const

/** A strand, metres: its width across the comb and its length along it. */
export const STRAND_WIDTH  = 0.06
export const STRAND_LENGTH = 0.17

/** A strand's half width as a share of its column, drawn per strand: a gap always shows beside it. */
export const STRAND_HALF = [ 0.3, 0.5 ] as const

/** The swirl: the span of the octave that bends the comb, metres, and how many columns it pushes them. */
export const SWIRL_SPAN    = 1.6
export const SWIRL_COLUMNS = 1.5

/** Pitch of the tuft lattice, metres, and a tuft's radius as a share of it. */
export const TUFT_CELL   = 0.55
export const TUFT_RADIUS = 0.3

/** How far the strand's round and its lie turn the normal. */
export const STRAND_ROUND = 0.35
export const STRAND_LIE   = 0.22

/** How far a tuft's dome turns the normal: its slope at the rim, in lattice units, is `2 × TUFT_RISE / TUFT_RADIUS`. */
export const TUFT_RISE = 0.1

/** The cavity: how dark the gap between strands and a strand's root get. */
export const STRAND_GAP  = 0.25
export const STRAND_ROOT = 0.35

/** How much the tuft crown lightens and the ground between tufts darkens. */
export const TUFT_CROWN = 0.16
export const TUFT_LOW   = 0.2

/** How far one strand's lightness strays from the next, either way: the speckle a sward reads as. */
export const STRAND_SPREAD = 0.22

/** Straw: the share of a tip that bleaches at the strawiest patch, and how far a wet blade darkens. */
export const STRAW_SHARE = 0.75
export const STRAND_WET  = 0.3

/** Strands and tufts across the frame between which each scale lets go. */
export const STRAND_REPEATS = [ 240, 520 ] as const
export const TUFT_REPEATS   = [ 60, 160 ] as const

/** The tuft lattice's rotation, so it never lines up with the strands or the cobbles. */
const TURN = { cos: 0.643, sin: 0.766 }

const fract   = (v: number): number => v - Math.floor(v)
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/** The same sine-free hash as the glsl (Hoskins), on a lattice point. */
export function swardHash (x: number, y: number): number {
  let a = fract(x * 0.1031)
  let b = fract(y * 0.1031)
  let c = a
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33)
  a += d
  b += d
  c += d
  return fract((a + b) * c)
}

/** A tuft's centre within its cell, 0..1 each way — the glsl's arithmetic. */
type TuftReturnType = { cx: number, cy: number }

export function tuft (ix: number, iy: number): TuftReturnType {
  return {
    cx: 0.3 + 0.4 * swardHash(ix + 17, iy + 17),
    cy: 0.3 + 0.4 * swardHash(ix + 5.3, iy + 91.7),
  }
}

/**
 * How far an albedo (linear rgb) takes the sward, 0..1 — the glsl's `leaf`:
 * the heath's greenness, past a margin, so a grassy yard of dirt stays dirt.
 */
export function leafiness (r: number, g: number, b: number): number {
  const t = clamp01(((g * 2 - r - b) / (g + 0.05) - LEAF_KEY[0]) / (LEAF_KEY[1] - LEAF_KEY[0]))
  return t * t * (3 - 2 * t)
}

/**
 * The mean of the strand's shade over a cell — what the term fades to as the
 * frame widens, so the field's brightness does not step with the zoom. The
 * profile `1 - x²` averages two thirds over a strand, which covers its mean
 * width of the column; the root ramp averages a half along.
 */
export const STRAND_MEAN = (1 - STRAND_GAP * (1 - 2 / 3 * (STRAND_HALF[0] + STRAND_HALF[1]))) * (1 - STRAND_ROOT / 2)

/** Declared once per program, after the hummock's hash and octave. */
export const SWARD_PARS_FRAGMENT = /* glsl */`
#ifdef USE_COLOR_ALPHA
  uniform vec2 uDriftDir;
#endif
`

/**
 * The term, on the terrain's variant, after the gravel. Needs `scapeFlat`,
 * `uDetailStrength`, `uWetAmount`, `normal`, `vColor`, `vScapeGround` and the
 * hummock's `scapeHash` and `scapeOctave` in scope — the ground material
 * declares all of them.
 */
export const SWARD_FRAGMENT = /* glsl */`
#ifdef USE_COLOR_ALPHA
  {
    float frameM = scapeFrameMetres();
    float tufts  = ${repeatKeepGlsl(`frameM * ${f(1 / TUFT_CELL)}`, TUFT_REPEATS)};
    vec3 c       = diffuseColor.rgb;
    float leaf   = smoothstep(${f(LEAF_KEY[0])}, ${f(LEAF_KEY[1])}, (c.g * 2.0 - c.r - c.b) / (c.g + 0.05));
    float w      = leaf * vColor.a * scapeFlat * uDetailStrength * tufts;
    if (w > 0.01) {
      float blades = ${repeatKeepGlsl(`frameM * ${f(1 / STRAND_WIDTH)}`, STRAND_REPEATS)};
      vec2 comb    = dot(uDriftDir, uDriftDir) > 1e-6 ? normalize(uDriftDir) : vec2(1.0, 0.0);
      vec2 across  = vec2(-comb.y, comb.x);
      vec2 g       = vScapeGround;

      // The tuft this fragment stands in, if any: a dome inside its own cell.
      const mat2 turn = mat2(${f(TURN.cos)}, ${f(TURN.sin)}, ${f(-TURN.sin)}, ${f(TURN.cos)});
      vec2 tp   = turn * g * ${f(1 / TUFT_CELL)};
      vec2 ti   = floor(tp);
      vec2 dq   = tp - ti - (0.3 + 0.4 * vec2(scapeHash(ti + 17.0), scapeHash(ti + vec2(5.3, 91.7))));
      float r2  = dot(dq, dq) * ${f(1 / (TUFT_RADIUS * TUFT_RADIUS))};
      float dome = max(0.0, 1.0 - r2);
      vec2 tilt = (dq * step(r2, 1.0) * ${f(Number((2 * TUFT_RISE / (TUFT_RADIUS * TUFT_RADIUS)).toFixed(3)))}) * turn;

      // The strand: a column across the comb, swirled by a metre-scale octave so
      // the comb wanders as a laid sward does, staggered along it by its own
      // hash; each strand its own width and place in its column, never past it.
      float v    = dot(g, across) * ${f(1 / STRAND_WIDTH)} + scapeOctave(g * ${f(1 / SWIRL_SPAN)} + vec2(31.0, 2.0)).x * ${f(SWIRL_COLUMNS)};
      float col  = floor(v);
      float u    = dot(g, comb) * ${f(1 / STRAND_LENGTH)} + scapeHash(vec2(col, 7.1)) * 3.7;
      float row  = floor(u);
      float tip  = u - row;
      float own  = scapeHash(vec2(col, row));
      float half_ = ${f(STRAND_HALF[0])} + ${f(STRAND_HALF[1] - STRAND_HALF[0])} * fract(own * 13.1);
      float x    = clamp((v - col - 0.5 - (0.5 - half_) * (fract(own * 7.7) * 2.0 - 1.0)) / half_, -1.0, 1.0);
      float body = 1.0 - x * x;
      tilt      += (across * x * ${f(STRAND_ROUND)} - comb * ${f(STRAND_LIE)} * body) * blades;

      normal = normalize(normal + mat3(viewMatrix) * vec3(tilt.x, 0.0, tilt.y) * w);

      // Root and gap are the cavity; faded to their mean as the strand goes under a pixel.
      float shade = (1.0 - ${f(STRAND_GAP)} * (1.0 - body)) * (1.0 - ${f(STRAND_ROOT)} * (1.0 - tip));
      shade       = mix(${f(Number(STRAND_MEAN.toFixed(4)))}, shade, blades) / ${f(Number(STRAND_MEAN.toFixed(4)))};
      shade      *= 1.0 + ${f(TUFT_CROWN)} * dome - ${f(TUFT_LOW)} * (1.0 - step(r2, 1.0));

      // Straw on the tips, in patches a few metres across, and on the crowns.
      float lum    = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float patchy = smoothstep(-0.3, 0.7, scapeOctave(g * 0.23 + vec2(9.0, 63.0)).x);
      float straw  = ${f(STRAW_SHARE)} * patchy * mix(0.35, smoothstep(0.45, 1.0, tip) * step(0.45, own), blades);
      straw        = clamp(straw + 0.3 * dome * patchy, 0.0, 1.0);
      vec3 blade   = c * mix(vec3(1.06, 0.96, 1.1), vec3(0.94, 1.04, 0.86), own) * mix(1.0, ${f(1 - STRAND_SPREAD)} + ${f(2 * STRAND_SPREAD)} * fract(own * 3.3), blades);
      vec3 col3    = mix(blade, vec3(lum * 1.9) * vec3(1.08, 1.0, 0.36), straw);

      diffuseColor.rgb = mix(c, col3 * shade * (1.0 - ${f(STRAND_WET)} * uWetAmount), w);
      roughnessFactor  = mix(roughnessFactor, mix(0.9, 0.45, uWetAmount * body), w);
    }
  }
#endif
`
