import { leafShare, RUN_WIDTH } from './runoff.ts'
import { STONE_LIGHT } from './weathering.ts'

/**
 * Every wall in the scape is built of boards.
 *
 * Before this the barns, sheds, boathouses and the chapel were flat painted
 * cards: one colour per face, with the stretched bark field the only thing on
 * them. A timber wall in a photograph is never that: it is the rhythm of its
 * boards, a dark seam between each pair, one board a shade off the next, and
 * the hard shadow line under every course of weatherboard. That rhythm is
 * what says a building is a building and not a block.
 *
 * Two cladding forms, and the albedo chooses which, so no prop carries a flag:
 *
 * - **board and batten.** Upright boards one {@link BOARD_WIDTH} wide with a
 *   seam between them and rolled edges: falu red, tar and brown timber.
 * - **weatherboard.** Horizontal courses {@link LAP_HEIGHT} high, each lip
 *   facing down and casting a line onto the course below: the light colours,
 *   limewash and trim white. The same arithmetic draws the dark bands across a
 *   birch stem, which is what a birch has.
 *
 * Which surfaces are cladding ({@link boardShare}): upright faces whose albedo
 * is paint (saturated) or whitewash (light), and not a plant. Stone is grey and
 * mid-toned, so it falls to the weathering term instead, and the two never
 * share a fragment.
 *
 * The board is as wide as a rain run (`runoff.ts`), so the runs a shower lays
 * down a wall run one per board. Arithmetic on numbers the fragment holds:
 * no texture, no uniform, no varying — every tier, the phone included. The
 * seams fade with their own screen width ({@link SEAM_FADE}), per fragment, so
 * a wall too far to resolve a board gets its mean tone rather than moiré.
 */

/** Metres across one upright board — and one rain run. */
export const BOARD_WIDTH = RUN_WIDTH

/** Metres up one course of weatherboard. */
export const LAP_HEIGHT = 0.19

/** The seam, as a share of a board. */
export const SEAM_SHARE = 0.07

/** How far one board's tone sits from its neighbour's, peak to peak. */
export const BOARD_TONE = 0.24

/** How dark a seam and the shadow under a lap fall, at full grain. */
export const SEAM_DARK = 0.62

/** Boards per pixel at which the seams are fully drawn, and fully let go. */
export const SEAM_FADE = [ 0.18, 0.5 ] as const

/** The luminance band over which board and batten gives way to weatherboard. */
export const LAP_LUMA = [ 0.22, 0.42 ] as const

/** The chroma band (on the square-root albedo, as `weatherable`) that is paint. */
export const PAINT_CHROMA = [ 0.27, 0.4 ] as const

function smooth (edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * How much of an upright face of this linear albedo is cladding, 0..1 — the
 * cpu twin of the glsl, so a test can say which colours of the palette are
 * built of boards.
 */
export function boardShare (r: number, g: number, b: number): number {
  const hi     = Math.sqrt(Math.max(r, g, b))
  const lo     = Math.sqrt(Math.min(r, g, b))
  const luma   = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const chroma = (hi - lo) / (hi + 0.02)
  const paint  = Math.max(smooth(PAINT_CHROMA[0], PAINT_CHROMA[1], chroma), smooth(STONE_LIGHT[0], STONE_LIGHT[1], luma))

  return paint * (1 - leafShare(r, g, b)) * smooth(0.008, 0.02, luma)
}

/** Weatherboard's share, 0..1, against board and batten: the light paints lap. */
export function lapShare (r: number, g: number, b: number): number {
  return smooth(LAP_LUMA[0], LAP_LUMA[1], 0.2126 * r + 0.7152 * g + 0.0722 * b)
}

const f = (v: number): string => v.toFixed(4)

/**
 * The term, for the ground program's normal stage, after the upright grain.
 * Reads `vScapeFace`, `vScapeGround` and `uDetailStrength`, which the detail
 * injection declares ahead of it.
 */
export const BOARD_FRAGMENT = /* glsl */`
  {
    vec3 c = diffuseColor.rgb;
    float hi = sqrt(max(c.r, max(c.g, c.b)));
    float lo = sqrt(max(0.0, min(c.r, min(c.g, c.b))));
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float leaf = clamp((c.g - max(c.r, c.b)) / (luma + 0.02) * 5.0, 0.0, 1.0);
    float paint = max(smoothstep(${f(PAINT_CHROMA[0])}, ${f(PAINT_CHROMA[1])}, (hi - lo) / (hi + 0.02)),
      smoothstep(${f(STONE_LIGHT[0])}, ${f(STONE_LIGHT[1])}, luma));
    float board = paint * (1.0 - leaf) * smoothstep(0.008, 0.02, luma) *
      (1.0 - smoothstep(0.05, 0.16, abs(vScapeFace.x))) * min(1.0, uDetailStrength * 1.5);

    if (board > 0.002) {
      vec3 boardN    = normal * mat3(viewMatrix);
      vec2 boardRun  = normalize(vec2(-boardN.z, boardN.x) + vec2(1e-5, 0.0));
      float boardUp  = cameraPosition.y - dot(vViewPosition, viewMatrix[1].xyz);
      float lap      = smoothstep(${f(LAP_LUMA[0])}, ${f(LAP_LUMA[1])}, luma);
      float coord    = mix(dot(vScapeGround, boardRun) / ${f(BOARD_WIDTH)}, boardUp / ${f(LAP_HEIGHT)}, step(0.5, lap));
      float cell     = floor(coord);
      float along    = coord - cell;
      float perPixel = max(fwidth(coord), 1e-4);
      float keep     = board * (1.0 - smoothstep(${f(SEAM_FADE[0])}, ${f(SEAM_FADE[1])}, perPixel));

      // One board a shade off its neighbour: stock from different trees,
      // repainted in different summers. A zero-mean tone, so a far wall keeps
      // its colour when the seams are let go.
      float tone = fract(sin(cell * 91.7 + dot(boardRun, vec2(17.3, 41.9))) * 43758.5453) - 0.5;
      diffuseColor.rgb *= 1.0 + board * tone * ${f(BOARD_TONE)};
      roughnessFactor   = clamp(roughnessFactor + board * tone * 0.2, 0.05, 1.0);

      // The seam, widened by the pixel so it never breaks into dashes.
      float edge = min(along, 1.0 - along);
      float seam = 1.0 - smoothstep(0.0, ${f(SEAM_SHARE)} + perPixel, edge);

      // Under a lap the lip of the course above throws a line that fades down
      // the board; on battens, the seam alone.
      float under = lap * smoothstep(0.55, 1.0, along) * 0.45;
      diffuseColor.rgb *= 1.0 - keep * ${f(SEAM_DARK)} * max(seam, under);

      // Relief: rolled edges on an upright board, the downward lip on a lap.
      vec3 sideView = mat3(viewMatrix) * vec3(boardRun.x, 0.0, boardRun.y);
      vec3 upView   = viewMatrix[1].xyz;
      float roll    = (1.0 - smoothstep(0.0, 0.22, edge)) * sign(along - 0.5);
      float lip     = 1.0 - smoothstep(0.0, 0.1, along);
      vec3 turn     = mix(sideView * roll * 0.7, upView * (0.12 - lip * 0.9), lap);
      normal = normalize(normal + turn * keep);
    }
  }
`
