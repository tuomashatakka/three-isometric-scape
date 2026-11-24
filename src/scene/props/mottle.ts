import { hypot } from '../hypot.ts'


/**
 * The mottle: the ground's grain at the scale a hillside is seen from.
 *
 * Every other ground term is metres or less — the grit, the hummocks, the
 * strands, the gravel — and each lets go with the frame's repeat budget, so at
 * the `default` and `far` frames none of them is left. What remained there was
 * the vertex colour, and on the far shore the vertices stand 35–60 m apart: a
 * mountainside as smooth as felt, a snowfield with no rock in it, a moor with
 * no hag. A real coast seen from a kilometre is a field of patches tens of
 * metres across, and their *kind* is what the ground already is:
 *
 * - **snow** (bright and neutral) is cut by rock wherever the field runs low,
 *   and more of it on a steep face, which is where snow does not hold. The
 *   rock is near-black and wet, the darkest thing on a winter fell — the
 *   contrast that makes a snowfield read as lying *on* something;
 * - **turf** (green) is a quilt of peat hags (dark, warm) and bleached straw;
 * - **stone** (neutral, not bright) is lichen-pale on the crowns and dark in
 *   the wet streaks.
 *
 * Value noise computed in place, not fetched: the grit map is not mipmapped
 * (its fine octave is centimetres), and read at tens of metres it aliases to
 * salt — the first version of this term was exactly that. Two fine octaves on
 * every tier, a broad rotated one on the six-tap path, no texture and no
 * uniform. It rides `terrain.detailGrain` as every soil term does, and it does *not*
 * let go with the zoom: the patches are tens of metres, so the close frame sees
 * one patch as a gentle tilt in the turf and the wide frame sees the quilt.
 * Placed after the year, so the snow it cuts is the snow the season laid.
 *
 * **On a slope the patches run down the fall line.** Snow lies in the gullies
 * and the rock between them is bare in ribs; scree and the wet streaks on a
 * crag run the same way. Isotropic blobs on a mountainside read as a camouflage
 * print. So the field a slope is tested against is the {@link gullyField}: a
 * narrow octave averaged over three taps laid along the fall line, as far apart
 * as the face is steep. The fall line is the smooth world normal turned
 * downhill (`nonPerturbedNormal` back through the view matrix, already in
 * scope), so the taps follow the face however it bends, and on level ground
 * they coincide and the term is the plain octave. Two value noises more, no
 * texture, no uniform, every tier.
 */

/** A number, as glsl reads it: always with a point. */
const f = (v: number): string => Number.isInteger(v) ? v.toFixed(1) : String(v)

/** Metres per tile of the fine octave, and of the broad one. */
export const MOTTLE_FINE  = 26
export const MOTTLE_BROAD = 83

/** How far the field's spread is stretched before it is clamped to -1..1. */
export const MOTTLE_CONTRAST = 1.6

/** How much a vertical face lowers the field before the snow is tested: rock shows on the steep. */
export const MOTTLE_STEEP = 1.6

/**
 * The field value (less the steepness) where rock begins to show through
 * snow, and where it is bare. Narrow: a snow line on rock is a crisp edge,
 * and a wide one printed every bare patch as a soot smudge.
 */
export const BARE_EDGE = [ -0.42, -0.78 ] as const

/**
 * How much deeper the field must run on the level before rock shows: snow
 * lies where it falls on a flat, and the rock it does not cover is on the
 * faces and the crests. Fades out by a lean of 0.4.
 */
export const LEVEL_HOLD = 0.32

/** Where the snow class begins and is full, in linear luminance. */
export const SNOW_LUMA = [ 0.22, 0.5 ] as const

/** The chroma (spread over max) under which a colour counts as neutral, soft edge. */
export const NEUTRAL_CHROMA = [ 0.1, 0.32 ] as const

/** Bare rock through snow, linear albedo: wet gneiss. */
export const BARE_ROCK = [ 0.05, 0.048, 0.045 ] as const

/** How far the lichen and the wet streak push a stone's albedo either way. */
export const STONE_SWING = 0.38

/** Peat hag and straw, as multipliers on a green. */
export const PEAT  = [ 0.55, 0.46, 0.36 ] as const
export const STRAW = [ 1.35, 1.18, 0.74 ] as const

/** Metres across one gully: the narrow octave the fall-line taps average. */
export const GULLY_CELL = 9

/** Metres either side of the fragment the outer taps reach on a vertical face; a slope reaches by its lean. */
export const GULLY_REACH = 16

/**
 * The gully field's weight against the round mottle: a share on the level,
 * where the narrow octave only breaks a patch's edge up, and all of
 * {@link GULLY_STEEP} by a lean of a half.
 */
export const GULLY_LEVEL = 0.35
export const GULLY_STEEP = 0.85

/** The spread a three-tap mean loses, put back so a gully is as deep as a patch. */
export const GULLY_GAIN = 1.5

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export interface MottleClass {
  snow:  number
  stone: number
  leaf:  number
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * The cpu half of the classifier the fragment runs: what share of a linear
 * albedo the mottle treats as snow, as stone and as turf. The shares never sum
 * past one — a colour is one kind of ground or a blend of neighbours.
 */
export function mottleClass (r: number, g: number, b: number): MottleClass {
  const hi      = Math.max(r, g, b)
  const lo      = Math.min(r, g, b)
  const luma    = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const neutral = 1 - smooth(NEUTRAL_CHROMA[0], NEUTRAL_CHROMA[1], (hi - lo) / (hi + 0.02))
  const snow    = neutral * smooth(SNOW_LUMA[0], SNOW_LUMA[1], luma)
  const leaf    = Math.min(1, Math.max(0, (g * 2 - r - b) / (g + 0.05) * 2)) * (1 - neutral)

  return { snow, stone: neutral - snow, leaf }
}

const vec3 = (v: readonly number[]): string => `vec3(${v.map(f).join(', ')})`

/** Hash of a lattice point, 0..1 — the cpu twin of the glsl below, for the tests. */
export function mottleHash (x: number, y: number): number {
  const fr = (v: number): number => v - Math.floor(v)
  let a = fr(x * 0.1031)
  let b = fr(y * 0.1031)
  let c = fr(x * 0.1031)
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33)
  a += d
  b += d
  c += d
  return fr((a + b) * c)
}

/** Value noise in -1..1 at one octave; smooth, so it never aliases however wide the frame. */
export function mottleNoise (x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const tx = x - ix
  const ty = y - iy
  const ux = tx * tx * (3 - 2 * tx)
  const uy = ty * ty * (3 - 2 * ty)
  const a  = mottleHash(ix, iy)
  const b  = mottleHash(ix + 1, iy)
  const c  = mottleHash(ix, iy + 1)
  const d  = mottleHash(ix + 1, iy + 1)
  return (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy) * 2 - 1
}

/**
 * The field at a world point, -1..1: the cpu twin of the fragment's `m`.
 * `full` adds the broad octave the six-tap path computes.
 */
export function mottleField (x: number, z: number, full: boolean): number {
  const u    = x / MOTTLE_FINE
  const v    = z / MOTTLE_FINE
  const fine = mottleNoise(u, v) + 0.5 * mottleNoise(u * 2.03 + 7.1, v * 2.03 - 3.4) + 0.3 * mottleNoise(u * 4.31 - 2.2, v * 4.31 + 5.3)
  const raw  = full ? 0.6 * fine + 0.6 * mottleNoise((0.8 * x - 0.6 * z) / MOTTLE_BROAD, (0.6 * x + 0.8 * z) / MOTTLE_BROAD) : fine
  return Math.min(1, Math.max(-1, raw * MOTTLE_CONTRAST))
}

/**
 * The gully field at a world point on a face whose smooth normal is
 * `(nx, ny, nz)`, -1..1: the narrow octave averaged over three taps down the
 * fall line, spread by the face's lean (the horizontal length of its normal).
 * The cpu twin of the fragment's `g`.
 */
export function gullyField (x: number, z: number, nx: number, nz: number): number {
  const lean = hypot(nx, nz)
  const fx   = lean > 1e-3 ? -nx / lean : 0
  const fz   = lean > 1e-3 ? -nz / lean : 0
  const u    = x / GULLY_CELL + 3.7
  const v    = z / GULLY_CELL - 1.9
  const sx   = fx * lean * GULLY_REACH / GULLY_CELL
  const sz   = fz * lean * GULLY_REACH / GULLY_CELL
  const sum  = mottleNoise(u - sx, v - sz) + mottleNoise(u, v) + mottleNoise(u + sx, v + sz)

  return Math.min(1, Math.max(-1, sum / 3 * GULLY_GAIN * lerp(1, 1.6, lean)))
}

/** The field a face is tested against: the round mottle on the level, the gully on the steep. */
export function slopeField (m: number, gully: number, lean: number): number {
  return m + (gully - m) * (GULLY_LEVEL + (GULLY_STEEP - GULLY_LEVEL) * Math.min(1, lean * 2))
}

/** Declared once per ground program. */
export const MOTTLE_PARS_FRAGMENT = /* glsl */`
  float scapeMottleHash (vec2 p) {
    vec3 p3 = fract(p.xyx * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float scapeMottleNoise (vec2 p) {
    vec2 i = floor(p);
    vec2 t = p - i;
    vec2 u = t * t * (3.0 - 2.0 * t);
    float a = scapeMottleHash(i);
    float b = scapeMottleHash(i + vec2(1.0, 0.0));
    float c = scapeMottleHash(i + vec2(0.0, 1.0));
    float d = scapeMottleHash(i + vec2(1.0, 1.0));
    return (a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y) * 2.0 - 1.0;
  }
`

/** The fragment, for the lite path (`full` false: the fine octaves) or the six-tap one. */
export function mottleFragment (full: boolean): string {
  const p     = `vScapeGround * ${f(1 / MOTTLE_FINE)}`
  const fine  = `scapeMottleNoise(${p}) + 0.5 * scapeMottleNoise(${p} * 2.03 + vec2(7.1, -3.4)) + 0.3 * scapeMottleNoise(${p} * 4.31 + vec2(-2.2, 5.3))`
  const broad = `scapeMottleNoise(mat2(0.8, 0.6, -0.6, 0.8) * vScapeGround * ${f(1 / MOTTLE_BROAD)})`
  const raw   = full ? `0.6 * (${fine}) + 0.6 * ${broad}` : fine

  return /* glsl */`
  {
    float m = clamp((${raw}) * ${f(MOTTLE_CONTRAST)}, -1.0, 1.0);

    // Down the fall line (see the head of the module): three taps of the
    // narrow octave, spread by the face's lean, and on the steep that field
    // replaces the round one for the snow and the stone.
    vec3 wn    = normalize(nonPerturbedNormal * mat3(viewMatrix));
    float lean = length(wn.xz);
    vec2 fall  = lean > 0.001 ? -wn.xz / lean : vec2(0.0);
    vec2 gq    = vScapeGround * ${f(1 / GULLY_CELL)} + vec2(3.7, -1.9);
    vec2 gs    = fall * lean * ${f(GULLY_REACH / GULLY_CELL)};
    float g    = clamp((scapeMottleNoise(gq - gs) + scapeMottleNoise(gq) + scapeMottleNoise(gq + gs)) * ${f(GULLY_GAIN / 3)} * mix(1.0, 1.6, lean), -1.0, 1.0);
    float ms   = mix(m, g, mix(${f(GULLY_LEVEL)}, ${f(GULLY_STEEP)}, min(1.0, lean * 2.0)));

    vec3 c        = diffuseColor.rgb;
    float hi      = max(c.r, max(c.g, c.b));
    float lo      = min(c.r, min(c.g, c.b));
    float luma    = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float neutral = 1.0 - smoothstep(${f(NEUTRAL_CHROMA[0])}, ${f(NEUTRAL_CHROMA[1])}, (hi - lo) / (hi + 0.02));
    float snow    = neutral * smoothstep(${f(SNOW_LUMA[0])}, ${f(SNOW_LUMA[1])}, luma);
    float leaf    = clamp((c.g * 2.0 - c.r - c.b) / (c.g + 0.05) * 2.0, 0.0, 1.0) * (1.0 - neutral);
    float steep   = 1.0 - clamp(vScapeFace.x, 0.0, 1.0);
    float gain    = smoothstep(0.0, 0.25, uDetailStrength);

    // Rock through the snow: low in the field, or steep.
    float bare = 0.9 * snow * smoothstep(${f(BARE_EDGE[0])}, ${f(BARE_EDGE[1])}, ms - steep * ${f(MOTTLE_STEEP)} + ${f(LEVEL_HOLD)} * (1.0 - min(1.0, lean * 2.5))) * gain;
    vec3 turf  = m < 0.0 ? mix(c, c * ${vec3(PEAT)}, -m) : mix(c, c * ${vec3(STRAW)}, m * 0.7);
    vec3 o     = c * (1.0 + (neutral - snow) * ms * ${f(STONE_SWING)} * gain);

    o = mix(o, turf, leaf * gain);
    o = mix(o, ${vec3(BARE_ROCK)} * (1.0 + ms * 0.4), bare);
    diffuseColor.rgb = o;
    roughnessFactor  = clamp(roughnessFactor + bare * 0.25 - leaf * m * 0.05 * gain, 0.05, 1.0);
  }
`
}
