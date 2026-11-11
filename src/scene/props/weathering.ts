import { repeatKeepGlsl } from '../frame.ts'

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
 * One fetch of the grain map, read along the face (the same skewed projection
 * the upright grain uses) so it does not smear down a wall. The low tail of the
 * field is lichen and the high half is moss, so the two never fight over one
 * texel. No knob: it rides on `terrain.detailGrain`, and a frame too wide to
 * resolve a rosette gets the mean cover instead of shimmer.
 */

/** Grain tiles per lichen tile: a 1.5 m repeat, rosettes a hand across. */
export const LICHEN_TILE = 5

/** Repeats across the frame the rosettes are let go between — the soil grain's. */
export const LICHEN_REPEATS = [ 40, 120 ] as const

/**
 * Chroma share (max − min over max) past which a colour is paint or plant, not
 * stone — measured on the square root of the linear albedo, which is near enough
 * the authored srgb that the band reads like the palette does.
 */
export const STONE_CHROMA = [ 0.19, 0.27 ] as const

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

  return (1 - smooth(STONE_CHROMA[0], STONE_CHROMA[1], chroma)) *
    smooth(STONE_DARK[0], STONE_DARK[1], luma) *
    (1 - smooth(STONE_LIGHT[0], STONE_LIGHT[1], luma))
}

const vec3 = (c: readonly number[]): string => `vec3(${c.map(v => v.toFixed(3)).join(', ')})`
const f    = (v: number): string => v.toFixed(3)

/**
 * The term, for the ground program's normal stage. Reads `scapeFlat`,
 * `scapeRepeats`, `scapeDetailScale`, `vScapeFace`, `vScapeGround`,
 * `uDetailStrength` and `uSwashLevel`, all of which the detail injection
 * declares ahead of it; `map` is the grain sampler.
 */
export function weatheringFragment (map: string): string {
  return /* glsl */`
  {
    vec3 c = diffuseColor.rgb;
    float hi = sqrt(max(c.r, max(c.g, c.b)));
    float lo = sqrt(max(0.0, min(c.r, min(c.g, c.b))));
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float stone = (1.0 - smoothstep(${f(STONE_CHROMA[0])}, ${f(STONE_CHROMA[1])}, (hi - lo) / (hi + 0.02))) *
      smoothstep(${f(STONE_DARK[0])}, ${f(STONE_DARK[1])}, luma) *
      (1.0 - smoothstep(${f(STONE_LIGHT[0])}, ${f(STONE_LIGHT[1])}, luma)) * min(1.0, uDetailStrength);

    if (stone > 0.002) {
      float alt  = cameraPosition.y - dot(vViewPosition, viewMatrix[1].xyz);
      float keep = ${repeatKeepGlsl(`scapeRepeats * ${f(LICHEN_TILE)}`, LICHEN_REPEATS)};
      float field = 0.5;

      // A uniform branch: the frame is too wide for a rosette or it is not.
      if (keep > 0.0) {
        vec2 side = vec2(vScapeGround.x + vScapeGround.y, alt);
        field = mix(0.5, texture2D(${map}, mix(side, vScapeGround, scapeFlat) * scapeDetailScale * ${f(LICHEN_TILE)}).r, keep);
      }

      // Moss takes the tops and the faces turned from the sun; the mean cover
      // stands in for the patches as they go below a pixel.
      float lie   = clamp(smoothstep(0.35, 0.85, vScapeFace.x) + max(vScapeFace.y, 0.0) * 0.5 * (1.0 - scapeFlat), 0.0, 1.0);
      float moss  = stone * lie * ${f(MOSS_COVER)} * mix(0.4, smoothstep(0.5, 0.63, field), keep);

      // Lichen on whatever the moss left: the low tail of the same field.
      float crust = stone * ${f(LICHEN_COVER)} * mix(0.12, smoothstep(0.42, 0.36, field), keep) * (1.0 - moss);
      vec3 lichen = mix(${vec3(XANTHORIA)}, ${vec3(LICHEN)}, smoothstep(0.0, ${f(SPLASH_ZONE)}, alt - uSwashLevel));

      diffuseColor.rgb = mix(mix(c, ${vec3(MOSS)}, moss), lichen, crust);
      roughnessFactor  = clamp(roughnessFactor + moss * 0.1 + crust * 0.05, 0.05, 1.0);
    }
  }
`
}
