import { repeatKeepGlsl } from '../frame.ts'

/** A number, as glsl reads it: always with a point. */
const f = (v: number): string => Number.isInteger(v) ? v.toFixed(1) : String(v)

/**
 * Trodden earth: the body of every bare surface between the gravel and the
 * hummocks.
 *
 * The farmyard is most of the `near` frame, and with the stones alone it read
 * as beige felt: one tone, one roughness, nothing at the half-metre a hoof, a
 * boot or a puddle makes. Real bare ground on a wet coast is two things at
 * that scale, and both come from where it stands, so the terrain fragment lays
 * them itself:
 *
 * - **damp hollows.** An octave of the hummock noise at a couple of metres is
 *   the ground's micro-relief; its low half holds water, so it is darker and
 *   smoother, and darker still in a shower (`weather.wet`). That is the field
 *   that turns one tan into a mottle of dry crust and dark mud at every zoom
 *   the yard is seen at.
 * - **pits.** Hoof- and boot-prints are the gravel's own one-cell lattice
 *   (`scapeStone`) turned over: the same dome, its slope inverted, so a pit has
 *   its lit and shaded walls the other way round from a stone. More of them in
 *   the damp, where the ground gives. The soil pushed up at the rim is drier and
 *   paler, the floor is the cavity the sky cannot see into, and in a shower
 *   water stands in the deepest ones — flat, dark and glossy.
 *
 * Keyed on the same bareness as the gravel (`BARE_KEY_GLSL`): the yard, the
 * track, peat banks, tidal mud and shingle, never turf, snow, rock or dune.
 * Only the terrain's own variant takes it (`USE_COLOR_ALPHA`); each scale lets
 * go with the frame's repeat budget, so a wide frame evaluates neither.
 */

/** Pitch of the pit lattice, metres: one print per cell at most. */
export const TREAD_CELL = 0.42

/** Width of a damp hollow, metres: the octave's period. */
export const DAMP_CELL = 2.4

/** Pit cells across the frame between which the prints let go. */
export const TREAD_REPEATS = [ 60, 150 ] as const

/** Damp cells across the frame between which the hollows let go. */
export const DAMP_REPEATS = [ 45, 120 ] as const

/** The share of cells holding a print, in the softest ground. */
export const TREAD_DENSITY = 0.7

/** How far a hollow darkens dry, and how much further in a shower. */
export const DAMP_DARK = 0.38
export const DAMP_WET  = 0.25

/** How deep a pit reads (the stone's slope gain, inverted), its floor's shade and its rim's lift. */
export const PIT_DEPTH = 1.4
export const PIT_SHADE = 0.35
export const RIM_LIFT  = 0.12

/**
 * How far an albedo (linear rgb) is bare ground, 0..1: warm, unvegetated and
 * not pale. The glsl's `scapeBare`, for tests and tools.
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

/** `scapeBare(c)`: the one bareness every bare-ground term is keyed on. */
export const BARE_KEY_GLSL = /* glsl */`
  float scapeBare (vec3 c) {
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    return clamp(1.0 - (c.g * 2.0 - c.r - c.b) / (c.g + 0.05) * 3.0, 0.0, 1.0)
         * clamp((c.r - c.b) / (c.r + 0.02) * 2.5 - 0.45, 0.0, 1.0)
         * (1.0 - smoothstep(0.3, 0.5, lum));
  }
`

/**
 * The tread, inside the bare-ground block: needs `w` (the bare ground's
 * weight), `scapeStone`, `scapeOctave`, `uWetAmount` and `normal` in scope.
 */
export const TREAD_FRAGMENT = /* glsl */`
      {
        float dampKeep = ${repeatKeepGlsl(`scapeFrameMetres() * ${f(1 / DAMP_CELL)}`, DAMP_REPEATS)};
        // Two octaves, so a hollow has a ragged edge rather than a blob's.
        float field    = scapeOctave(vScapeGround * ${f(1 / DAMP_CELL)} + vec2(-23.0, 61.0)).x
                       + 0.45 * scapeOctave(vScapeGround * ${f(2.7 / DAMP_CELL)} + vec2(5.0, -17.0)).x;
        float damp     = smoothstep(-0.05, 0.5, field);
        float wd       = w * dampKeep * damp;
        diffuseColor.rgb *= 1.0 - (${f(DAMP_DARK)} + ${f(DAMP_WET)} * uWetAmount) * wd;
        roughnessFactor   = mix(roughnessFactor, mix(0.75, 0.35, uWetAmount), wd * 0.7);

        float wt = w * ${repeatKeepGlsl(`scapeFrameMetres() * ${f(1 / TREAD_CELL)}`, TREAD_REPEATS)};
        if (wt > 0.01) {
          const mat2 tturn = mat2(0.5, 0.866, -0.866, 0.5);
          vec4 pit = scapeStone(tturn * vScapeGround * ${f(1 / TREAD_CELL)} + vec2(7.9, 2.3), ${f(TREAD_DENSITY)} * (0.35 + 0.65 * damp));
          pit.yz   = pit.yz * tturn;
          float on = smoothstep(0.0, 0.2, pit.x) * wt;
          float rim  = (1.0 - smoothstep(1.0, 1.6, pit.w)) * step(pit.x, 0.0) * wt;
          float pool = smoothstep(0.3, 0.6, pit.x) * on * uWetAmount;
          vec3 up    = mat3(viewMatrix)[1];

          // Concave: the stone's slope turned over, then levelled where water stands.
          normal = normalize(normal + mat3(viewMatrix) * vec3(pit.y, 0.0, pit.z) * ${f(PIT_DEPTH)} * on);
          normal = normalize(mix(normal, up, pool));
          diffuseColor.rgb *= (1.0 - ${f(PIT_SHADE)} * pit.x * on) * (1.0 + ${f(RIM_LIFT)} * rim) * (1.0 - 0.45 * pool);
          roughnessFactor   = mix(roughnessFactor, 0.06, pool);
        }
      }
`
