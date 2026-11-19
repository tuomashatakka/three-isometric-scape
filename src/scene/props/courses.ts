import { leafShare } from './runoff.ts'

/**
 * Every pitched roof is laid in courses.
 *
 * Before this the chapel, the farmhouses, the boathouses and the mill wore
 * their roofs as single charcoal slabs — the flattest surfaces left in the
 * `near` frame, and the largest. A roof in a photograph is never a plane of
 * one tone: it is the rhythm of its courses, the shadow line every butt drops
 * onto the course below, the staggered joints, one shingle silvered by thirty
 * winters beside a newer brown one, and the moss that keeps to the wet lines.
 *
 * Which surfaces are roofing ({@link courseShare}): faces pitched between a
 * low and a steep roof, whose albedo is the shingle family — warm, dark,
 * low in chroma. Granite is cooler, timber and peat warmer, so neither lays
 * courses; the stone term (`weathering.ts`) leaves to this one whatever it
 * takes (`scapeRoof`), so a roof is never ruled with strata. The terrain's
 * program (`USE_COLOR_ALPHA`) never evaluates it: a bare brown slope is not
 * a roof.
 *
 * Geometry from numbers the fragment holds: the face's own normal gives the
 * fall line and the pitch, world height over the pitch's sine is the distance
 * up the slope, and the ground position across the fall is the distance along
 * the eave. No texture, no uniform, no varying — every tier, the phone too.
 * The lines fade with their own screen width ({@link COURSE_FADE}), so a roof
 * across the sound gets its mean tone rather than moiré.
 */

/** Metres of shingle exposed per course, up the slope. */
export const COURSE_GAUGE = 0.21

/** Metres across one shingle, on average. */
export const SHINGLE_WIDTH = 0.17

/** Normal-up band of a roof: from a low pitch (about 60°) to a shallow one (about 15°). */
export const ROOF_PITCH = [ 0.42, 0.55, 0.93, 0.98 ] as const

/** Warmth band, (√r − √b)/(√r + 0.02): the shingle family, between granite and timber. */
export const ROOF_WARMTH = [ 0.12, 0.145, 0.22, 0.26 ] as const

/** Luminance band of roofing: dark, never pale. */
export const ROOF_LUMA = [ 0.012, 0.025, 0.16, 0.22 ] as const

/** Peak-to-peak tone between neighbouring shingles. */
export const SHINGLE_TONE = 0.3

/** How dark the line under each butt falls, at full grain. */
export const BUTT_DARK = 0.58

/** Courses per pixel at which the lines are fully drawn, and fully let go. */
export const COURSE_FADE = [ 0.16, 0.45 ] as const

/** The share of shingles the weather has silvered. */
export const SILVER_SHARE = 0.22

/** Moss that keeps to the course lines, in linear albedo. */
export const ROOF_MOSS = [ 0.045, 0.06, 0.022 ] as const

function smooth (edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function band (edges: readonly [number, number, number, number], x: number): number {
  return smooth(edges[0], edges[1], x) * (1 - smooth(edges[2], edges[3], x))
}

/**
 * How much of a face of this linear albedo and world normal-up is roofing,
 * 0..1 — the cpu twin of the glsl, so a test can say which colours of the
 * palette lay courses.
 */
export function courseShare (r: number, g: number, b: number, up: number): number {
  const luma   = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const warmth = (Math.sqrt(r) - Math.sqrt(b)) / (Math.sqrt(r) + 0.02)

  return band(ROOF_PITCH, up) * band(ROOF_WARMTH, warmth) * band(ROOF_LUMA, luma) * (1 - leafShare(r, g, b))
}

/** A point on a roof as the courses see it. */
export interface CoursePlace {

  /** Which course, counted up from height zero. */
  course: number

  /** How far up that course, 0 at its butt to 1 under the next. */
  into: number
}

/** Which course a point a distance `along` up the slope sits in, and how far into it. */
export function courseAt (along: number): CoursePlace {
  const coord  = along / COURSE_GAUGE
  const course = Math.floor(coord)

  return { course, into: coord - course }
}

const f = (v: number): string => v.toFixed(4)

const bandGlsl = (edges: readonly [number, number, number, number], x: string): string =>
  `(smoothstep(${f(edges[0])}, ${f(edges[1])}, ${x}) * (1.0 - smoothstep(${f(edges[2])}, ${f(edges[3])}, ${x})))`

/**
 * The term, for the ground program's normal stage, after the boards and
 * before the weathering, which reads the `scapeRoof` it leaves behind. Reads
 * `vScapeFace`, `vScapeGround`, `uDetailStrength` and three's
 * `nonPerturbedNormal`, all declared ahead of it.
 */
export const COURSE_FRAGMENT = /* glsl */`
  float scapeRoof = 0.0;
  #ifndef USE_COLOR_ALPHA
  {
    vec3 c = diffuseColor.rgb;
    vec3 root = sqrt(max(c, vec3(0.0)));
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float leaf = clamp((c.g - max(c.r, c.b)) / (luma + 0.02) * 5.0, 0.0, 1.0);
    float warmth = (root.r - root.b) / (root.r + 0.02);
    scapeRoof = ${bandGlsl(ROOF_PITCH, 'vScapeFace.x')} * ${bandGlsl(ROOF_WARMTH, 'warmth')} *
      ${bandGlsl(ROOF_LUMA, 'luma')} * (1.0 - leaf) * min(1.0, uDetailStrength * 1.5);

    if (scapeRoof > 0.002) {
      vec3 roofN     = normalize(nonPerturbedNormal * mat3(viewMatrix));
      float roofSin  = max(length(roofN.xz), 0.2);
      vec2 roofFall  = roofN.xz / roofSin;
      vec2 roofEave  = vec2(-roofFall.y, roofFall.x);
      float roofUp   = cameraPosition.y - dot(vViewPosition, viewMatrix[1].xyz);
      float rowCoord = roofUp / roofSin / ${f(COURSE_GAUGE)};
      float row      = floor(rowCoord);
      float into     = rowCoord - row;

      // Staggered joints: every course starts half a shingle off the last,
      // and no two shingles are quite the same width.
      float stagger  = fract(sin(row * 12.9898) * 43758.5453);
      float colCoord = dot(vScapeGround, roofEave) / ${f(SHINGLE_WIDTH)} + row * 0.5 + stagger * 0.35;
      float col      = floor(colCoord);
      float across   = colCoord - col;
      float perPixel = max(max(fwidth(rowCoord), fwidth(colCoord) * 0.6), 1e-4);
      float keep     = scapeRoof * (1.0 - smoothstep(${f(COURSE_FADE[0])}, ${f(COURSE_FADE[1])}, perPixel));

      // One shingle a shade off the next, and some silvered by the weather.
      // Zero-mean in tone, so a far roof keeps its colour when the lines go.
      float pick   = fract(sin(dot(vec2(row, col), vec2(127.1, 311.7))) * 43758.5453);
      float tone   = fract(pick * 7.13) - 0.5;
      float silver = step(1.0 - ${f(SILVER_SHARE)}, pick) * keep;
      diffuseColor.rgb *= 1.0 + scapeRoof * tone * ${f(SHINGLE_TONE)};
      diffuseColor.rgb  = mix(diffuseColor.rgb, vec3(luma * 1.35), silver * 0.55);
      roughnessFactor   = clamp(roughnessFactor + scapeRoof * (tone * 0.15 + 0.08), 0.05, 1.0);

      // The butt of the course above throws a line onto this one, fading down
      // from it; the joint is a seam widened by the pixel so it never dashes.
      float under = smoothstep(0.62, 1.0, into);
      float edge  = min(across, 1.0 - across);
      float joint = (1.0 - smoothstep(0.0, 0.05 + perPixel, edge)) * (1.0 - smoothstep(0.7, 0.95, into));
      float line  = max(under, joint * 0.8);
      diffuseColor.rgb *= 1.0 - keep * ${f(BUTT_DARK)} * line;

      // Moss keeps to the lines, where the wet stays longest.
      float mossy = keep * line * (0.25 + 0.35 * max(vScapeFace.y, 0.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${ROOF_MOSS.map(f).join(', ')}), mossy * 0.5);

      // Relief: each shingle lies a little flatter than the roof (thick at the
      // butt), its butt a lip turned down the slope, its edges rolled.
      vec3 upSlope  = normalize(vec3(0.0, 1.0, 0.0) - roofN * roofN.y);
      vec3 slopeView = mat3(viewMatrix) * upSlope;
      vec3 eaveView  = mat3(viewMatrix) * vec3(roofEave.x, 0.0, roofEave.y);
      float lip      = 1.0 - smoothstep(0.0, 0.12, into);
      float roll     = (1.0 - smoothstep(0.0, 0.2, edge)) * sign(across - 0.5);
      normal = normalize(normal + (slopeView * (0.14 - lip * 0.85) + eaveView * roll * 0.45) * keep);
    }
  }
  #endif
`
