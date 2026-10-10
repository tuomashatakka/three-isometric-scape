import type { IUniform, Vector2 } from 'three'
import type { ScapeConfig } from '../config.ts'
import type { WindState } from '../wind.ts'
import { MAX_DEPTH } from './shore-mask.ts'


/**
 * The shape of the sea, and the one thing on this coast the wind never turned.
 *
 * Everything else in the scape leans on the one wind. The smoke leans on it,
 * the grass leans on it, the caps lie downwind of it, the surf marches in on
 * it and the breakers pick their coast by it. The *surface* did not: the swell
 * was three sines locked to the world axes — `sin(x * 0.09)`, `sin(y * 0.13)`,
 * `sin((x + y) * 0.062)` — so a sea blowing from the south-west had its crests
 * running the same way as a sea blowing from the north, and the foam on it was
 * the only thing that knew the difference.
 *
 * Its own file rather than another chunk of `water.ts` for `water-caustics.ts`'s
 * reason: this is a complete idea with a shader chunk, a dispersion relation,
 * a fan of trains and one pure function that says how much a bank lifts what
 * passes over it. `water.ts` keeps the uniforms, because the uniforms are the
 * lake's.
 */

/** Metres per second squared. A swell runs on gravity and nothing else. */
export const SWELL_GRAVITY = 9.81

/**
 * One train of the swell.
 *
 * A real sea is never one wave. Three trains fanned either side of the bearing
 * the wind is pushing on give a surface that is short-crested where they
 * disagree and long-crested where they do not, which is the whole difference
 * between a swell and a corrugated roof.
 *
 * The amplitude shares are the ones the three axis-locked sines already had, so
 * `water.waveHeight` keeps its meaning across this change and a scape tuned
 * before it is tuned after it.
 */
export interface SwellTrain {

  /** Where it runs, in shares of `water.swellSpread`. */
  fan: number

  /** How long it is, in shares of `water.swellLength`. */
  length: number

  /** What it is worth, in shares of `water.waveHeight`. */
  amplitude: number
}

/**
 * The fan.
 *
 * Deliberately asymmetric — `+1` against `-0.62` — because a symmetric pair
 * either side of a dominant train is a standing beat, and a beat on open water
 * reads as a grid rather than as a sea.
 */
export const SWELL_TRAINS: readonly SwellTrain[] = [
  { fan: 0, length: 1, amplitude: 0.55 },
  { fan: 1, length: 0.69, amplitude: 0.3 },
  { fan: -0.62, length: 1.44, amplitude: 0.4 },
]

/** Radians per metre of a train that long. */
export function swellWavenumber (length: number): number {
  return Math.PI * 2 / Math.max(1e-3, length)
}

/**
 * Radians per second of a train that long, off the deep-water dispersion.
 *
 * `ω = sqrt(g k)`, which is the whole of why a long swell outruns a short one
 * and why the three trains in {@link SWELL_TRAINS} cannot share a rate. The
 * three axis-locked sines this replaces carried authored rates — 0.55, 0.41,
 * 0.29 — that happened to fall in roughly the right order and in no particular
 * ratio to their own wavelengths. A 70 m wave runs at 10.4 m/s; those ran at
 * about six, and nothing said why.
 */
export function swellRate (length: number): number {
  return Math.sqrt(SWELL_GRAVITY * swellWavenumber(length))
}

/** Seconds between crests of a train that long. */
export function swellPeriod (length: number): number {
  return Math.PI * 2 / swellRate(length)
}

/**
 * Where each train runs, as unit bearings, given the one the wind is pushing on.
 *
 * Resolved on the cpu because it is three sines of one angle that every vertex
 * and every lit fragment would otherwise re-derive, and because the shader then
 * needs nothing but a dot product per train.
 *
 * `spread` is in radians and 0 is a perfectly long-crested swell — the open
 * ocean arriving at a coast after a thousand miles of sorting — rather than a
 * sea switched off. There is no flag beside it for the same reason there is no
 * flag beside the surf.
 */
export function swellBearings (
  spread: number,
  dirX:   number,
  dirZ:   number,
): readonly (readonly [ number, number ])[] {
  const length = Math.hypot(dirX, dirZ)
  const runX   = length < 1e-6 ? 1 : dirX / length
  const runZ   = length < 1e-6 ? 0 : dirZ / length

  return SWELL_TRAINS.map(train => {
    const angle = spread * train.fan
    const cos   = Math.cos(angle)
    const sin   = Math.sin(angle)

    // Rotate the run bearing in the ground plane. The side vector is the run
    // turned a quarter, so this is a plain 2d rotation written out.
    return [ runX * cos - runZ * sin, runZ * cos + runX * sin ] as const
  })
}

/**
 * How far the ratio of depths is allowed to run before the gain is capped.
 *
 * Green's law is a fourth root of a ratio that goes to infinity at the
 * waterline, so something has to stop it. Sixteen is two doublings of the
 * amplitude, which is a wave about to break — and what a wave about to break
 * does next is the surf band's business, not this one's.
 */
const SHOAL_CEILING = 16

/**
 * How shallow the water has to get before the lip takes the swell away, as a
 * fraction of {@link MAX_DEPTH} — just under a metre of it.
 *
 * Much wider than the surf's own lip, because this one is the **breaking
 * limit** written as a band rather than as a cap: a wave cannot be taller than
 * the water under it, and a sea with a real amplitude would otherwise carry
 * three quarters of a metre of crest across a beach with forty centimetres of
 * water on it. Written as a depth band rather than as a ratio against
 * `water.waveHeight` on purpose — a cap keyed to the amplitude takes the
 * shoaling away at exactly the sea states a bank is most visible in, and what
 * happens to a wave that has run out of water is the surf band's business.
 * The surf is already white everywhere this is fading.
 */
const SHOAL_LIP = 0.3

/** Below this the fourth root is taken of the floor rather than of the depth. */
const SHOAL_FLOOR = 0.06

/**
 * How hard the faces of the swell are shaded, per metre of amplitude.
 *
 * The lake's ripple carries this note above its own albedo term: *texture the
 * albedo, not just the normal — a normal-only ripple is invisible wherever the
 * specular lobe does not reach, so the sea reads as flat paint from half the
 * angles the camera can orbit to.* The swell never got the same treatment, and
 * it is most of why a sea with twelve times the authored amplitude on it still
 * moved **one level of 255** at the tour's frames: at this camera's angles the
 * fresnel mirror takes up to four fifths of the water's colour, so a term that
 * only perturbs a normal is arguing with the one term that is not listening.
 *
 * It is a share of the *slope along the run* rather than of the height, because
 * what a swell shows from above is its faces: the side turned up into the light
 * and the side turned away from it, in ranks lying across the way it is going.
 * A height band would paint the crests and read as contour lines.
 */
const SWELL_SHADE = 2.4

/**
 * How much a bank lifts the swell passing over it.
 *
 * Green's law: a wave crossing onto a shelf keeps its energy, loses the water
 * under it, and pays for the difference in height — amplitude goes as the
 * inverse fourth root of the depth. It is the reason a sea that is nothing at
 * all out in the sound stands up in ranks over a bar with no wind having
 * changed, and the reason the drowned bank this scape already has is described
 * in the readme as something the swell *trips on* while the surface passing
 * over it was perfectly flat.
 *
 * **The depth is in fractions of {@link MAX_DEPTH}, which is 3.2 m**, and that
 * is the whole of what "deep" means here: the bathymetry mask saturates there,
 * so a fraction of 1 is the deepest water the scape resolves and is where the
 * gain is exactly 1. Everything shallower than that is on the shelf. This is
 * not a wavelength — a 70 m swell truly feels the bottom at 35 — and pretending
 * otherwise would be authoring a number the mask cannot see.
 *
 * `shoal` at 0 is a sea of even height from the horizon to the beach, which is
 * the surface this scape had. There is no flag beside it.
 */
export function shoalGain (depth: number, shoal: number): number {
  const clamped = Math.min(1, Math.max(SHOAL_FLOOR, depth))
  const green   = Math.pow(Math.min(SHOAL_CEILING, 1 / clamped), 0.25)
  const lip     = Math.min(1, Math.max(0, depth / SHOAL_LIP))

  return (1 + shoal * (green - 1)) * lip * lip * (3 - 2 * lip)
}

/**
 * Where the swell has got to, and when it was last asked.
 *
 * One object rather than two locals because the lake's `update` is at the lint
 * config's statement ceiling, and because a phase without the sample it was
 * integrated from is not a clock.
 */
export interface SwellClock {
  phase:   number
  sampled: number
}

/**
 * Carry the swell forward by one frame, and hand back where it stands.
 *
 * The clock is the **landscape's**, not the lake's, and that moved when the
 * shore learned to wet itself: two things draw this swell now — the surface,
 * and the band it runs up on the beach — and the way to give two readers one
 * phase is one authority above both of them rather than a getter on one of
 * them. See `landscape/index.ts`.
 *
 * Integrated off the frame's own step rather than read off `elapsed`, so
 * `water.waveSpeed` is a rate the overlay can drag to zero and back without the
 * sea jumping a crest when it does. A clamp on the step rather than a trust of
 * it: a tab that has been asleep hands back a step of minutes, and a sea that
 * teleported on a tab focus would be a capture that depended on when it ran.
 */
export function advanceSwell (clock: SwellClock, elapsed: number, speed: number): number {
  clock.phase  += Math.min(1, Math.max(0, elapsed - clock.sampled)) * speed
  clock.sampled = elapsed

  return clock.phase
}

/** Fold a number into glsl source without an integer literal sneaking through. */
const glsl = (value: number): string => value.toFixed(6)

/**
 * The swell and the shelf it crosses, shared verbatim by both stages.
 *
 * The vertex shader displaces by it and the fragment shader differences it for
 * a slope — sampling the *same* function is the only way the shading agrees
 * with the silhouette, and it is why the gain is an argument rather than
 * something each stage works out for itself. Each stage resolves it once, off
 * the bathymetry fetch it was already making, and hands the same number to all
 * three samples of the field: a train is locally a plane wave, so a gain that
 * varied across 1.6 m of difference step would be differencing two different
 * seas.
 *
 * Plain sines rather than a Gerstner sum, which is what the three axis-locked
 * sines were and remains right at an amplitude the eye reads as "slight".
 */
export const WATER_SWELL_GLSL = /* glsl */`
  uniform float uWaveTime;
  uniform float uWaveHeight;
  uniform vec2 uSwellRun[3];
  uniform float uSwellK;
  uniform float uSwellRate;
  uniform float uSwellShoal;

  float scapeWave (vec2 p, float gain) {
    return gain * (
${SWELL_TRAINS.map((train, index) => {
  const k = glsl(1 / train.length)
  const r = glsl(Math.sqrt(1 / train.length))

  return `      sin(dot(p, uSwellRun[${index}]) * uSwellK * ${k} + ` +
      `uWaveTime * uSwellRate * ${r}) * ${glsl(train.amplitude)}`
}).join(' +\n')}
    );
  }

  /**
   * Green's law on the mask's own depth, with a ceiling and a lip. The mirror
   * of shoalGain in swell.ts, which is where the reasoning is.
   */
  /**
   * What the albedo does with the swell's own faces.
   *
   * The slope along the run, over the 1.6 m the normal is differenced across,
   * turned into a gain on the water's colour. See SWELL_SHADE in swell.ts for
   * why the sea needs this at all and why it is the slope rather than the
   * height. Ice takes it away, as it takes away everything else the surface
   * does to itself.
   */
  float scapeSwellShade (float here, float east, float north, float ice) {
    float face = (east - here) * uSwellRun[0].x + (north - here) * uSwellRun[0].y;

    return 1.0 + face * uWaveHeight * ${glsl(SWELL_SHADE)} * (1.0 - ice);
  }

  float scapeShoal (float depth) {
    float clamped = min(1.0, max(${glsl(SHOAL_FLOOR)}, depth));
    float green   = pow(min(${glsl(SHOAL_CEILING)}, 1.0 / clamped), 0.25);

    return (1.0 + uSwellShoal * (green - 1.0)) *
      smoothstep(0.0, ${glsl(SHOAL_LIP)}, depth);
  }
`

/**
 * What a reader of `scape:map` is told about the sea's shape.
 *
 * The swell is the one system in the scape with no geometry, no placement and
 * no record — it is six uniforms and a dispersion relation — so the structural
 * instrument has nothing to survey unless the numbers are handed to it.
 */
export interface SwellStats {
  length:  number
  period:  number
  speed:   number
  spread:  number
  deep:    number
  crest:   number
  breaker: number
}

/**
 * The swell, measured rather than described.
 *
 * `crest` is the gain over nine tenths of a metre, which is what stands over
 * the drowned bank at mean tide, and `breaker` the gain at the depth the surf
 * band starts at — so the line says in two numbers whether the sea actually
 * stands up where the readme says it does.
 */
export function swellStats (
  length:    number,
  spread:    number,
  shoal:     number,
  shoalDepth: number,
  surfDepth: number,
): SwellStats {
  return {
    length,
    period:  swellPeriod(length),
    speed:   length / swellPeriod(length),
    spread,
    deep:    shoalGain(1, shoal),
    crest:   shoalGain(shoalDepth / MAX_DEPTH, shoal),
    breaker: shoalGain(surfDepth / MAX_DEPTH, shoal),
  }
}


/**
 * The shape of the sea, off the one wind and the four knobs that describe it.
 *
 * Its own function rather than six lines in `update` for `setRoost`'s reason:
 * `update` is at the lint config's statement ceiling, and a bearing, a fan, a
 * wavelength and the rate that falls out of it are one reading of one sea.
 * Nothing here integrates — the clock is the caller's.
 */
export function setSwell (
  uniforms: Record<string, IUniform>,
  run:      readonly Vector2[],
  water:    ScapeConfig['water'],
  wind:     WindState,
): void {
  // The fan is built on the same bearing the surf and the caps read, so turning
  // the wind turns the crests and not merely the foam on them. Three sines of
  // one angle, once a frame, rather than per vertex and per lit fragment.
  const bearings = swellBearings(water.swellSpread, wind.dirX, wind.dirZ)

  for (const [ index, bearing ] of bearings.entries())
    run[index].set(bearing[0], bearing[1])

  uniforms.uSwellK.value     = swellWavenumber(water.swellLength)
  uniforms.uSwellRate.value  = swellRate(water.swellLength)
  uniforms.uSwellShoal.value = water.swellShoal
}
