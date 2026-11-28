import { hypot } from '../hypot.ts'
import { repeatKeepGlsl } from '../frame.ts'
import { FISSURE_GLSL } from './fissure.ts'
import { STRATA_GLSL } from './strata.ts'

/**
 * A hundred northern winters, on everything that stands out in them.
 *
 * Grey stone and silvered timber in a real coastal photograph are never the
 * colour they were cut: moss sits on every top and in the shade, and lichen
 * crusts every face the moss has not taken — pale grey-green inland, the orange
 * of *Xanthoria* on the rocks the spray and the gulls reach. Without it a
 * boulder is a grey blob and a wall is new paint.
 *
 * It lands in the shared ground material (both tap paths), so one change
 * reaches every stone, wall, post, roof and outcrop on every island. It keys
 * on what the albedo already is rather than on a per-prop flag: weathering
 * takes only near-neutral mid-greys (stone, old wood, slate, concrete). Paint,
 * grass, sand, straw and snow are too saturated, too dark or too light, and
 * keep their colour — see `weatherable`, which the test pins against the
 * palette.
 *
 * **Patches and rosettes, not contours.** The term used to threshold the grit
 * map (a 1.5 m tile of centimetre noise) twice — its low tail lichen, its high
 * half moss — and a band of a fine field is a contour line: every boulder in
 * the `near` frame wore a pale web like camouflage netting. Now each growth has
 * the shape it grows in:
 *
 * - **moss** is broad cushions, a smooth world field at {@link MOSS_PATCH} and
 *   a third of it (value noise in place, `scapeMottleNoise`), on the tops and
 *   the shaded faces, its edge ragged by the grit;
 * - **lichen** is rosettes: one disc per {@link ROSETTE_CELL} cell of the face,
 *   kept on a hash ({@link ROSETTE_SHARE}), at a hashed place and radius that
 *   never reaches the cell's edge — no search, no seam — orange in the splash
 *   zone, grey-green above it, with a darker rim where the thallus grows;
 *
 * The grit is still fetched once (read along the face, the upright grain's
 * skewed projection, so nothing smears down a wall) — it rags the edges. Each
 * scale lets go to its mean cover by its own width on screen. No knob: it
 * rides `terrain.detailGrain`.
 */

/** Grain tiles per rag tile: the grit read at a 1.5 m repeat, for the growths' edges. */
export const LICHEN_TILE = 5

/** Repeats across the frame the grit's ragging is let go between — the soil grain's. */
export const LICHEN_REPEATS = [ 40, 120 ] as const

/** Metres one moss cushion field spans; a second octave at a third of it. */
export const MOSS_PATCH = 0.9

/** Metres of face one lichen rosette owns, and the share of cells that carry one. */
export const ROSETTE_CELL  = 0.34
export const ROSETTE_SHARE = 0.55

/** A rosette's radius, as a share of its cell: never past the cell's edge. */
export const ROSETTE_RADIUS = [ 0.1, 0.28 ] as const

/** The clear margin, as a share of the cell, a rosette always leaves at its cell's edge. */
export const ROSETTE_MARGIN = 0.04

/** Cells per pixel past which the rosettes stand in their mean cover. */
export const ROSETTE_FADE = [ 0.25, 0.7 ] as const

/**
 * Chroma share (max − min over max) past which a colour is paint or plant, not
 * stone — measured on the square root of the linear albedo, which is near enough
 * the authored srgb that the band reads like the palette does.
 */
export const STONE_CHROMA = [ 0.19, 0.27 ] as const

/**
 * Green over red and over blue (on the square root), past which a grey is turf
 * and not stone: the terrain's olive sward is as neutral as granite by chroma,
 * and without this gate three quarters of the land took lichen and strata. Every
 * stone and timber in the palette leans red of green.
 */
export const TURF_LEAN = [ 0.005, 0.02 ] as const
export const TURF_COOL = [ 0.02, 0.05 ] as const

/** The linear luminance band weathering takes: not soot, not whitewash or snow. */
export const STONE_DARK  = [ 0.025, 0.07 ] as const
export const STONE_LIGHT = [ 0.45, 0.66 ] as const

/** Moss and lichen albedo, linear. */
export const MOSS      = [ 0.07, 0.1, 0.03 ] as const
export const LICHEN    = [ 0.34, 0.37, 0.29 ] as const
export const XANTHORIA = [ 0.42, 0.17, 0.035 ] as const

/** Metres above the waterline the orange lichen holds to — the splash zone. */
export const SPLASH_ZONE = 3

/** The most of a face the moss and the lichen ever take, at full grain. */
export const MOSS_COVER   = 0.8
export const LICHEN_COVER = 0.7

function smooth (edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * How much weathering a linear albedo takes, 0..1 — the cpu twin of the glsl
 * below, so a test can say which colours of the palette weather and which do not.
 */
export function weatherable (r: number, g: number, b: number): number {
  const hi     = Math.sqrt(Math.max(r, g, b))
  const lo     = Math.sqrt(Math.min(r, g, b))
  const luma   = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const chroma = (hi - lo) / (hi + 0.02)
  const turf   = smooth(TURF_LEAN[0], TURF_LEAN[1], Math.sqrt(g) - Math.sqrt(r)) *
    smooth(TURF_COOL[0], TURF_COOL[1], Math.sqrt(g) - Math.sqrt(b))

  return (1 - turf) * (1 - smooth(STONE_CHROMA[0], STONE_CHROMA[1], chroma)) *
    smooth(STONE_DARK[0], STONE_DARK[1], luma) *
    (1 - smooth(STONE_LIGHT[0], STONE_LIGHT[1], luma))
}

const fract = (v: number): number => v - Math.floor(v)

/** The glsl's four cell hashes (Hoskins) for a lattice cell: keep, x, y, radius. */
export function rosetteHashes (x: number, y: number): [ number, number, number, number ] {
  let a = fract(x * 0.1031)
  let b = fract(y * 0.1031)
  let c = fract((x + y) * 0.1031)
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33)
  a += d
  b += d
  c += d
  return [ fract((a + b) * c), fract((b + c) * a), fract((c + a) * b), fract((a + c) * c) ]
}

/**
 * The lichen rosette at a point of a face (metres, the face's 2d projection),
 * 0..1, unfaded and unragged — the cpu twin of the glsl's disc.
 */
export function rosetteAt (u: number, v: number): number {
  const cx                   = Math.floor(u / ROSETTE_CELL)
  const cy                   = Math.floor(v / ROSETTE_CELL)
  const [ keep, hx, hy, hr ] = rosetteHashes(cx, cy)
  const reach                = 2 * (0.5 - ROSETTE_RADIUS[1] - ROSETTE_MARGIN)
  const radius               = ROSETTE_RADIUS[0] + (ROSETTE_RADIUS[1] - ROSETTE_RADIUS[0]) * hr
  const d                    = hypot(u / ROSETTE_CELL - cx - 0.5 - (hx - 0.5) * reach, v / ROSETTE_CELL - cy - 0.5 - (hy - 0.5) * reach)

  return keep <= ROSETTE_SHARE && d < radius ? 1 : 0
}

const vec3 = (c: readonly number[]): string => `vec3(${c.map(v => v.toFixed(3)).join(', ')})`
const f    = (v: number): string => v.toFixed(3)

/**
 * The term, for the ground program's normal stage. Reads `scapeFlat`,
 * `scapeRepeats`, `scapeDetailScale`, `vScapeFace`, `vScapeGround`,
 * `uDetailStrength`, `uSwashLevel` and the roof share `scapeRoof` (`courses.ts`), all of which the detail injection
 * declares ahead of it; `map` is the grain sampler.
 */
export function weatheringFragment (map: string): string {
  return /* glsl */`
  {
    vec3 c = diffuseColor.rgb;
    float hi = sqrt(max(c.r, max(c.g, c.b)));
    float lo = sqrt(max(0.0, min(c.r, min(c.g, c.b))));
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 root = sqrt(max(c, vec3(0.0)));
    float turf = smoothstep(${f(TURF_LEAN[0])}, ${f(TURF_LEAN[1])}, root.g - root.r) *
      smoothstep(${f(TURF_COOL[0])}, ${f(TURF_COOL[1])}, root.g - root.b);
    float stone = (1.0 - turf) * (1.0 - smoothstep(${f(STONE_CHROMA[0])}, ${f(STONE_CHROMA[1])}, (hi - lo) / (hi + 0.02))) *
      smoothstep(${f(STONE_DARK[0])}, ${f(STONE_DARK[1])}, luma) *
      (1.0 - smoothstep(${f(STONE_LIGHT[0])}, ${f(STONE_LIGHT[1])}, luma)) * min(1.0, uDetailStrength) * (1.0 - scapeRoof);

    if (stone > 0.002) {
      float alt  = cameraPosition.y - dot(vViewPosition, viewMatrix[1].xyz);
${STRATA_GLSL}
${FISSURE_GLSL}
      float keep = ${repeatKeepGlsl(`scapeRepeats * ${f(LICHEN_TILE)}`, LICHEN_REPEATS)};
      vec2 side  = mix(vec2(vScapeGround.x + vScapeGround.y, alt), vScapeGround, scapeFlat);
      float rag  = 0.0;

      // A uniform branch: the frame is too wide for the grit or it is not.
      if (keep > 0.0)
        rag = (texture2D(${map}, side * scapeDetailScale * ${f(LICHEN_TILE)}).r - 0.5) * keep;

      // Moss: cushions on the tops and the faces turned from the sun, a smooth
      // field at two scales with the grit on its edge.
      float lie   = clamp(smoothstep(0.35, 0.85, vScapeFace.x) + max(vScapeFace.y, 0.0) * 0.5 * (1.0 - scapeFlat), 0.0, 1.0);
      vec2 mp     = side * ${f(1 / MOSS_PATCH)};
      float mk    = 1.0 - smoothstep(${f(ROSETTE_FADE[0])}, ${f(ROSETTE_FADE[1])}, max(fwidth(mp.x), fwidth(mp.y)));
      float cush  = mk * (0.65 * scapeMottleNoise(mp) + 0.35 * keep * scapeMottleNoise(mp * 3.1 + vec2(4.7, -2.3))) + 0.6 * rag;
      float mossW = smoothstep(0.55, 0.0, lie);
      float moss  = stone * lie * ${f(MOSS_COVER)} * mix(0.4, smoothstep(mossW - 0.08, mossW + 0.08, cush), mk);

      // Lichen: one rosette a cell, kept on a hash, never reaching the edge.
      vec2 rq    = side * ${f(1 / ROSETTE_CELL)};
      vec2 rc    = floor(rq);
      float rfw  = max(fwidth(rq.x), fwidth(rq.y));
      float rk   = 1.0 - smoothstep(${f(ROSETTE_FADE[0])}, ${f(ROSETTE_FADE[1])}, rfw);
      vec3 rh    = fract(vec3(rc.x, rc.y, rc.x + rc.y) * 0.1031);
      rh        += dot(rh, rh.yzx + 33.33);
      vec4 rr    = fract(vec4((rh.x + rh.y) * rh.z, (rh.y + rh.z) * rh.x, (rh.z + rh.x) * rh.y, (rh.x + rh.z) * rh.z));
      vec2 ro    = 0.5 + (rr.yz - 0.5) * ${f(2 * (0.5 - ROSETTE_RADIUS[1] - ROSETTE_MARGIN))};
      float rrad = ${f(ROSETTE_RADIUS[0])} + ${f(ROSETTE_RADIUS[1] - ROSETTE_RADIUS[0])} * rr.w;
      float rd   = length(rq - rc - ro) + rag * 0.12;
      float disc = step(rr.x, ${f(ROSETTE_SHARE)}) * (1.0 - smoothstep(rrad - rfw - 0.02, rrad + rfw, rd));
      float rim  = disc * smoothstep(rrad * 0.55, rrad, rd);
      float mean = ${f(ROSETTE_SHARE)} * 0.55 * ${f(ROSETTE_RADIUS[1] * ROSETTE_RADIUS[1] * Math.PI)};
      float crust = stone * ${f(LICHEN_COVER)} * mix(mean, disc, rk) * (1.0 - moss);
      vec3 lichen = mix(${vec3(XANTHORIA)}, ${vec3(LICHEN)}, smoothstep(0.0, ${f(SPLASH_ZONE)}, alt - uSwashLevel)) * (1.0 - 0.15 * rim * rk);

      // Over what the strata and the joints left, not the albedo the block began with.
      diffuseColor.rgb = mix(mix(diffuseColor.rgb, ${vec3(MOSS)}, moss), lichen, crust);
      roughnessFactor  = clamp(roughnessFactor + moss * 0.1 + crust * 0.05, 0.05, 1.0);
    }
  }
`
}
