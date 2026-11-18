import { repeatKeepGlsl } from '../frame.ts'

/** A number, as glsl reads it: always with a point. */
const f = (v: number): string => Number.isInteger(v) ? v.toFixed(1) : String(v)

/**
 * Stones in the bare ground: gravel in the yard and the track, shingle on the
 * strand.
 *
 * Bare earth was the smoothest thing in the close frames. The grit
 * (`SOIL_FRAGMENT`) is centimetres and the hummocks (`hummock.ts`) are a metre
 * of turf, and a farmyard or a cart road on a glaciated coast is neither: it is
 * soil with stones in it, thumb- to fist-sized, lying proud of the dirt. So the
 * terrain fragment lays them itself, from where it stands.
 *
 * - **one cell, no search.** Each lattice cell holds at most one stone, and the
 *   stone is sized and placed so it never leaves its cell (`stone` proves it),
 *   so a fragment reads only its own cell's three hashes — no 3×3 Voronoi walk,
 *   which is what lets the phone have it. Two lattices, rotated and of
 *   different pitch (pebbles and cobbles), hide the grid the one would show.
 * - **a dome, and its slope.** The stone's height is an ellipsoid cap and its
 *   gradient comes out of the same arithmetic, so it turns the normal: every
 *   stone has a lit and a shaded side under a low sun.
 * - **its own grey.** A stone is not the soil's colour: it takes a neutral
 *   grey at the soil's lightness, leaning warm or cool by its hash — granite,
 *   gneiss and the odd lump of basalt — and the soil at its foot is darker,
 *   the cavity the sky cannot see into.
 * - **wet, it shines.** In a shower (`weather.wet`) the stone darkens and its
 *   roughness falls further than the soil's: a wet cobble catches the sky.
 *
 * Keyed on what the albedo already is: warm, unvegetated and not pale — the
 * track, the yard, peat banks, tidal mud and shingle — and not grass, moss,
 * snow, rock or blown sand. Density wanders by an octave of the hummock
 * noise, so the ground has stony and clean patches. Only the terrain's own
 * variant takes it (`USE_COLOR_ALPHA`); it rides `terrain.detailGrain` (no
 * knob) and lets go with the frame's repeat budget, so a wide frame neither
 * evaluates nor shimmers with it.
 */

/** Pitch of the two lattices, metres: one pebble or one cobble per cell. */
export const PEBBLE_CELL = 0.2
export const COBBLE_CELL = 0.8

/** A stone's radius as a share of its cell: never past a quarter, so it stays inside. */
export const STONE_RADIUS = [ 0.13, 0.25 ] as const

/** How far a stone stands: dome height as a share of its radius. */
export const STONE_RISE = 0.55

/** The share of cells that hold a stone, at the stoniest patch. */
export const STONE_DENSITY = 0.85

/** How far the soil at a stone's foot darkens, and how far a wet stone does. */
export const STONE_FOOT = 0.4
export const STONE_WET  = 0.4

/** Pebble cells across the frame between which the term lets go. */
export const GRAVEL_REPEATS = [ 70, 170 ] as const

/** The cobble lattice's rotation against the pebbles', so the grids never line up. */
const TURN = { cos: 0.866, sin: 0.5 }

const fract = (v: number): number => v - Math.floor(v)

/** The same sine-free hash as the glsl (Hoskins), on a lattice point and a salt. */
export function stoneHash (x: number, y: number): number {
  let a = fract(x * 0.1031)
  let b = fract(y * 0.1031)
  let c = a
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33)
  a += d
  b += d
  c += d
  return fract((a + b) * c)
}

export interface Stone {

  /** Centre within the cell, 0..1 each way. */
  cx: number
  cy: number

  /** Radius along the long axis, as a share of the cell; the short one is `radius / squash`. */
  radius: number
  squash: number

  /** 0..1: the draw that decides whether the cell holds a stone at a given density. */
  chance: number

  /** 0..1: the stone's own lean, warm to cool. */
  tone: number
}

/** The stone a lattice cell holds, if the density lets it — the glsl's arithmetic. */
export function stone (ix: number, iy: number): Stone {
  const h0     = stoneHash(ix, iy)
  const h1     = stoneHash(ix + 71.3, iy + 19.1)
  const h2     = stoneHash(ix + 13.7, iy + 143.9)
  const radius = STONE_RADIUS[0] + (STONE_RADIUS[1] - STONE_RADIUS[0]) * fract(h0 * 7.13)

  return {
    cx:     radius + (1 - 2 * radius) * h1,
    cy:     radius + (1 - 2 * radius) * h2,
    radius,
    squash: 1 + 0.7 * fract(h1 * 13.7),
    chance: fract(h0 * 31.7),
    tone:   fract(h2 * 23.1),
  }
}

/**
 * How far an albedo (linear rgb) takes the stones, 0..1 — the glsl's `bare`:
 * warm, unvegetated and not pale.
 */
export function bareness (r: number, g: number, b: number): number {
  const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
  const smooth  = (e0: number, e1: number, v: number): number => {
    const t = clamp01((v - e0) / (e1 - e0))
    return t * t * (3 - 2 * t)
  }
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b

  return clamp01(1 - (g * 2 - r - b) / (g + 0.05) * 3) *
    clamp01((r - b) / (r + 0.02) * 2.5 - 0.45) *
    (1 - smooth(0.3, 0.5, lum))
}

/** Declared once per program, after the hummock's hash and octave. */
export const GRAVEL_PARS_FRAGMENT = /* glsl */`
#ifdef USE_COLOR_ALPHA
  // One cell's stone at p (lattice units): x the dome 0..1, yz its slope in
  // lattice units, w the stone's tone; x is zero off the stone or with no stone.
  vec4 scapeStone (vec2 p, float density) {
    vec2 i    = floor(p);
    vec2 t    = p - i;
    float h0  = scapeHash(i);
    float h1  = scapeHash(i + vec2(71.3, 19.1));
    float h2  = scapeHash(i + vec2(13.7, 143.9));
    float r   = ${f(STONE_RADIUS[0])} + ${f(STONE_RADIUS[1] - STONE_RADIUS[0])} * fract(h0 * 7.13);
    vec2 c    = vec2(r) + (1.0 - 2.0 * r) * vec2(h1, h2);
    float a   = h2 * 6.2832;
    mat2 turn = mat2(cos(a), sin(a), -sin(a), cos(a));
    vec2 q    = turn * (t - c);
    float sq  = 1.0 + 0.7 * fract(h1 * 13.7);
    q.y      *= sq;
    float d2  = dot(q, q) / (r * r);
    if (d2 >= 1.0 || fract(h0 * 31.7) >= density)
      return vec4(0.0, 0.0, 0.0, d2);
    float h   = sqrt(1.0 - d2);
    // d h / d t, through the squash and back out of the stone's own turn.
    vec2 g    = -(vec2(q.x, q.y * sq) * turn) / (r * r * max(h, 0.18));
    return vec4(h, g * r * ${f(STONE_RISE)}, fract(h2 * 23.1));
  }
#endif
`

/**
 * The term, on the terrain's variant, after the hummocks. Needs `scapeFlat`,
 * `uDetailStrength`, `uWetAmount`, `normal`, `vScapeGround` and the hummock's
 * `scapeOctave` in scope — the ground material declares all of them.
 */
export const GRAVEL_FRAGMENT = /* glsl */`
#ifdef USE_COLOR_ALPHA
  {
    float keep = ${repeatKeepGlsl(`scapeFrameMetres() * ${f(1 / PEBBLE_CELL)}`, GRAVEL_REPEATS)};
    vec3 c     = diffuseColor.rgb;
    float lum  = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // Warm, unvegetated, not pale: earth, peat, mud and shingle; not turf, snow, rock or dune.
    float bare = clamp(1.0 - (c.g * 2.0 - c.r - c.b) / (c.g + 0.05) * 3.0, 0.0, 1.0)
               * clamp((c.r - c.b) / (c.r + 0.02) * 2.5 - 0.45, 0.0, 1.0)
               * (1.0 - smoothstep(0.3, 0.5, lum));
    float w    = bare * scapeFlat * uDetailStrength * keep;
    if (w > 0.01) {
      // Stony and clean patches, a few metres across.
      float patchy  = scapeOctave(vScapeGround * 0.31 + vec2(41.0, 7.0)).x;
      float density = ${f(STONE_DENSITY)} * smoothstep(-0.6, 0.5, patchy);
      vec4 pebble   = scapeStone(vScapeGround * ${f(1 / PEBBLE_CELL)}, density);
      const mat2 turn = mat2(${f(TURN.cos)}, ${f(TURN.sin)}, ${f(-TURN.sin)}, ${f(TURN.cos)});
      vec4 cobble   = scapeStone(turn * vScapeGround * ${f(1 / COBBLE_CELL)} + vec2(3.1, 9.7), density * 0.6);
      cobble.yz     = cobble.yz * turn;
      vec4 s        = cobble.x > pebble.x ? cobble : pebble;
      float on      = smoothstep(0.0, 0.25, s.x) * w;
      // The soil just off a stone is the cavity under its rim.
      float foot    = (1.0 - smoothstep(1.0, 1.7, min(pebble.w, cobble.w))) * step(s.x, 0.0) * w;

      normal = normalize(normal - mat3(viewMatrix) * vec3(s.y, 0.0, s.z) * on);

      vec3 stoneTint = mix(vec3(1.1, 1.0, 0.88), vec3(0.94, 0.97, 1.02), s.w) * (0.65 + 0.6 * fract(s.w * 5.3));
      vec3 stoneCol  = vec3(lum * 0.85 + 0.01) * stoneTint * (0.7 + 0.45 * s.x);
      diffuseColor.rgb  = mix(c, stoneCol * (1.0 - ${f(STONE_WET)} * uWetAmount), on);
      diffuseColor.rgb *= 1.0 - ${f(STONE_FOOT)} * foot;
      roughnessFactor   = mix(roughnessFactor, mix(0.7, 0.3, uWetAmount), on);
    }
  }
#endif
`
