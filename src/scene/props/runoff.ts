/**
 * Rain, after it has landed — on what faces the sky, and on what does not.
 *
 * Two things happen to a surface that has been rained on and they pull in
 * opposite directions: the albedo goes *down*, because a water film traps light
 * that dry grains would have scattered back out, and the specular goes *up*,
 * because that same film is smoother than anything under it. Doing only the
 * first gives a scape somebody turned the lights down on; doing only the second
 * gives a scape made of plastic.
 *
 * The film used to be weighted by the snow's `lie` alone — rain lands on what
 * faces the sky — so in a shower the yard went dark and glossy and every wall,
 * boulder flank, post and gable stood in it bone dry. A wall in rain is the
 * wettest thing on a coast: the wind drives the rain into the face it meets,
 * and what lands on the sill and the coping runs down the face below it in
 * streaks. So an upright face takes the film too ({@link wallWet}):
 *
 * - **the weather face.** A face turned into the wind (`vScapeFace.z`, the
 *   drift compass, negative upwind) takes all of it; the lee keeps a damp
 *   share ({@link LEE_DAMP}).
 * - **the runs.** Streaks a hand wide ({@link RUN_WIDTH}) laid along the face's
 *   own horizontal (the world normal turned a quarter, so a wall facing any
 *   bearing streaks across itself), each with its own drip line every few
 *   metres of height and wetter toward its foot, where the water has gathered.
 *
 * Ground materials only: foliage has no face varying, and a crown in rain is
 * the constant `lie` it always was. One sine, one hash and a fract on numbers
 * the fragment already holds — no texture, no uniform, no varying, every tier.
 * It is applied before the snow, so a week doing both ends with white over wet.
 */

/** Metres between one run and the next across a face. */
export const RUN_WIDTH = 0.22

/** The share of runs that carry water; the rest of the face is the damp between them. */
export const RUN_SHARE = 0.55

/** Metres of height one run falls before the next drip line starts. */
export const RUN_FALL = 2.4

/** How wet the lee face of a wall stands, against the weather face's one. */
export const LEE_DAMP = 0.35

/** How wet the face between the runs stands, against a run's one. */
export const FACE_DAMP = 0.45

/** How far a soaked surface's albedo falls, and the roughness its film reaches. */
export const WET_DARKEN = 0.48
export const WET_ROUGHNESS = 0.28

/**
 * The roughness a soaked *green* surface reaches. Grass, moss and heather hold
 * rain as beads on the blade, not as a film over it: they go dark and stay
 * matt. The film is for what is bare — soil, sand, stone, timber, slate. Before
 * the split, a shower smoothed every field to the sky's mirror and a rained-on
 * island read, against the light, as an island under snow.
 *
 * Which surfaces are plants: on the terrain, its own rough-ground share (the
 * vertex alpha `markRoughGround` writes, which is what the hummocks stand in);
 * on a prop, how green the albedo is ({@link leafShare}) — a turf roof or a
 * mossed stone is a plant, a slate or a board is not.
 */
export const WET_LEAF_ROUGHNESS = 0.8

/**
 * How green an albedo is, 0..1: the green channel's lead over the larger of
 * the other two, against the luminance. The same arithmetic as the glsl.
 */
export function leafShare (r: number, g: number, b: number): number {
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b

  return Math.min(1, Math.max(0, (g - Math.max(r, b)) / (luma + 0.02) * 5))
}

const glsl = (value: number): string => value.toFixed(4)

/** One run's hash, 0..1 — the same arithmetic the glsl does. */
export function runHash (index: number): number {
  const value = Math.sin(index * 91.7 + 3.1) * 43758.5453

  return value - Math.floor(value)
}

/**
 * How wet an upright face is, 0..1, before `weather.wet`'s amount: `up` is how
 * far the face points at the sky, `lee` the drift compass (-1 upwind, +1 lee),
 * `across` metres along the face and `height` metres up it.
 */
export function wallWet (up: number, lee: number, across: number, height: number): number {
  const t       = Math.min(1, Math.max(0, (up - 0.22) / 0.5))
  const upright = 1 - t * t * (3 - 2 * t)
  const weather = LEE_DAMP + (1 - LEE_DAMP) * Math.min(1, Math.max(0, -lee * 2 + 0.5))
  const column  = across / RUN_WIDTH
  const hash    = runHash(Math.floor(column))
  const lane    = Math.sin(Math.PI * (column - Math.floor(column))) ** 2
  const fall    = height / RUN_FALL + hash * 5
  const gather  = 1 - 0.6 * (fall - Math.floor(fall))
  const run     = hash < RUN_SHARE ? lane * gather : 0

  return upright * weather * (FACE_DAMP + (1 - FACE_DAMP) * run)
}

export const WET_PARS_FRAGMENT = /* glsl */`
  uniform float uWetAmount;
`

/**
 * The film, after `normal_fragment_begin` and the altitude line. `lie` is the
 * material's snow weighting; `faces` says whether it carries `vScapeFace` and
 * so has walls to run down.
 */
export function wetFragment (lie: string, faces: boolean): string {
  const wall = faces
    ? /* glsl */`
  vec3 runNormal  = normal * mat3(viewMatrix);
  vec2 runAlong   = normalize(vec2(-runNormal.z, runNormal.x) + vec2(1e-5, 0.0));
  float runColumn = dot(vScapeGround, runAlong) / ${glsl(RUN_WIDTH)};
  float runHash   = fract(sin(floor(runColumn) * 91.7 + 3.1) * 43758.5453);
  float runLane   = sin(3.14159265 * fract(runColumn));
  float runFall   = fract(scapeAltitude / ${glsl(RUN_FALL)} + runHash * 5.0);
  float runWater  = step(runHash, ${glsl(RUN_SHARE)}) * runLane * runLane * (1.0 - 0.6 * runFall);
  float runFace   = (1.0 - smoothstep(0.22, 0.72, vScapeFace.x)) *
    (${glsl(LEE_DAMP)} + ${glsl(1 - LEE_DAMP)} * clamp(0.5 - 2.0 * vScapeFace.z, 0.0, 1.0)) *
    (${glsl(FACE_DAMP)} + ${glsl(1 - FACE_DAMP)} * runWater);
  scapeWet = max(scapeWet, uWetAmount * runFace);`
    : ''

  return /* glsl */`
  float scapeWet = uWetAmount * (${lie});${wall}

  float wetLeaf = clamp((diffuseColor.g - max(diffuseColor.r, diffuseColor.b)) /
    (dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) + 0.02) * 5.0, 0.0, 1.0);
  #ifdef USE_COLOR_ALPHA
    wetLeaf = max(wetLeaf, vColor.a);
  #endif

  diffuseColor.rgb *= 1.0 - ${glsl(WET_DARKEN)} * scapeWet;
  roughnessFactor   = mix(roughnessFactor, mix(${glsl(WET_ROUGHNESS)}, ${glsl(WET_LEAF_ROUGHNESS)}, wetLeaf), scapeWet);
`
}
