import type { IUniform } from 'three'
import type { ScapeConfig } from '../config.ts'
import type { TideState } from '../tide.ts'
import type { GroundNormal } from './height.ts'
import { swellBearings, swellRate, swellWavenumber } from './swell.ts'
import type { WindState } from '../wind.ts'


/**
 * The run-up, and the band of shore it leaves behind it.
 *
 * Its own file rather than another chunk of `props/material.ts` for
 * `swell.ts`'s reason: this is a complete idea with a shader chunk, a published
 * relation and a handful of pure functions that `scape:map` surveys the coast
 * with. `props/material.ts` keeps the uniforms, because the uniforms are the
 * ground's.
 *
 * Everything here is the gpu half's mirror — every constant the fragment shapes
 * the band with is interpolated into that shader from the exports below, the
 * way `drift.ts` and `seasonFragment` already are, so the band a survey measures
 * and the band the program draws cannot be two sets of numbers that agree today.
 *
 * See `config-swash.ts` for why the run-up is the swell's own Iribarren number
 * rather than a width somebody chose.
 */

/**
 * The most upright a face is allowed to be before its gradient stops growing.
 *
 * It guards the **steep** end rather than the flat one, which is worth saying
 * plainly because the name reads the other way round: `tanβ` is
 * `sqrt(1 - n.y²) / n.y`, so what runs away is a normal with no vertical
 * component left in it — an overhang, or the vertical side of a quad on a
 * flat-shaded mesh — and 0.08 caps the gradient there at about 1:0.08. A
 * horizontal face needs no guard at all: it has no run-up on it because `tanβ`
 * is zero, which is the answer rather than a division by one.
 */
export const SWASH_FLOOR = 0.08

/**
 * How much of the run the wet band fades out over, as a share of the run.
 *
 * The edge of a swash is not a step: there is a centimetre or two of sheet
 * water ahead of the bore and a gradient of damp behind it, and at this
 * camera's distance that band is what separates a wet shore from a shore with a
 * dark line painted on it.
 */
export const SWASH_BAND = 0.35

/**
 * Metres below the live waterline where the band gives out.
 *
 * Ground under the sea is wet and the shader need not be told so — the lake is
 * drawn over it. What the fade buys is the seam: the water plane thins out
 * against the sand rather than ending, so a wet band that stopped dead at the
 * waterline would show its own edge through the last few centimetres of water.
 * It gives out well inside the depth the surf band is already white over.
 */
export const SWASH_SUBMERGED = 0.4

/**
 * How hard the run-up answers the wind, and where the answer starts.
 *
 * The surf's own lift, verbatim — `water.surf` is scaled by
 * `0.75 + 0.25 * min(1.6, strength)` so a gust whitens the coast without the
 * knob being touched, and a dead calm still breaks at three quarters. The swash
 * and the surf are the same wave seen a second apart, so a swash that ran on
 * the authored amplitude while the foam over it ran on the gusted one would be
 * two readings of one sea.
 */
export const SWASH_REST = 0.75
export const SWASH_GUST = 0.25
export const SWASH_GUST_CAP = 1.6

/** The swell's steepness, inverted — the `1 / sqrt(H / L)` of Hunt's relation. */
export function swashSteepness (waveHeight: number, swellLength: number): number {
  return Math.sqrt(Math.max(1e-3, swellLength) / Math.max(1e-3, waveHeight))
}

/** What the wind is worth to the sea arriving, in shares of the authored swell. */
export function swashLift (strength: number): number {
  return SWASH_REST + SWASH_GUST * Math.min(SWASH_GUST_CAP, Math.max(0, strength))
}

/**
 * How far up a shore of that gradient the sea runs, in metres of rise.
 *
 * `R = H · min(ξmax, tanβ / sqrt(H / L))`, and the clamp is the whole of what
 * separates a beach from a cliff: under the ceiling the run grows with the
 * slope, over it the run stands still and only the horizontal walk goes on
 * shrinking. See `config-swash.ts`.
 */
export function swashRun (
  grade:       number,
  waveHeight:  number,
  swellLength: number,
  reach:       number,
  steep:       number,
): number {
  const iribarren = Math.max(0, grade) * swashSteepness(waveHeight, swellLength)

  return Math.max(0, waveHeight) * Math.min(Math.max(0, steep), iribarren) * Math.max(0, reach)
}

/**
 * How far across the ground that run reaches, in metres.
 *
 * The rise over the gradient, which is the number a picture actually shows: a
 * run of half a metre is a band six metres wide on a sand flat and a band a
 * handspan wide on the crag, and both of those are the same half metre.
 */
export function swashWalk (grade: number, run: number): number {
  // No guard and no floor: `run` carries the same gradient on its numerator, so
  // the quotient tends to sqrt(H * L) as the ground flattens rather than to
  // anything that needs catching, and a shore with no slope at all has no band
  // to measure rather than an infinite one.
  return grade > 0 ? run / grade : 0
}

/** A face's gradient, from the vertical component of its unit normal. */
export function swashGrade (up: number): number {
  const level = Math.min(1, Math.max(0, up))

  return Math.sqrt(Math.max(0, 1 - level * level)) / Math.max(SWASH_FLOOR, level)
}

/**
 * What a shore turned that far out of the weather keeps of the run, 0..1.
 *
 * `turn` is the face resolved against the base wind bearing, -1 on the shore
 * the sea is running into and 1 in its lee, which is `vScapeFace.z`'s own
 * range. Written here rather than only in the shader so that the survey and the
 * program share one curve.
 */
export function swashExposure (turn: number, lee: number): number {
  const shelter = Math.min(1, Math.max(0, 0.5 + 0.5 * turn))

  return 1 + (lee - 1) * shelter
}

/** Everything one instant of the shore needs, resolved once a frame. */
export interface SwashState {

  /** World height of the live waterline — mean water plus the tide. */
  level: number

  /** The swell arriving, in metres, after the gust has had its say. */
  height: number

  /** `1 / sqrt(H / L)`, so the fragment multiplies rather than divides. */
  steepness: number

  /** The dominant train's phase at the origin, in radians. */
  phase: number

  /** The dominant train's wavenumber, in radians per metre. */
  wavenumber: number

  /** Where that train runs, as a unit bearing. */
  runX: number
  runZ: number
}

/**
 * The shore at this instant, off the sea, the tide and the one wind.
 *
 * `phase` is the archipelago's one swell clock, integrated by
 * `landscape/index.ts` and handed to the lake in the same frame — so the bore
 * walking up a beach and the crest that raised it are one wave rather than two
 * readings of one. Everything else here is a pure function of the config and
 * the wind, resolved twice a frame rather than carried: three sines of one
 * angle cost less than a second piece of state that could disagree.
 */
export function swashState (
  config: ScapeConfig,
  tide:   TideState,
  wind:   WindState,
  phase:  number,
): SwashState {
  const { waveHeight, swellLength, swellSpread } = config.water
  const [ runX, runZ ]                           = swellBearings(swellSpread, wind.dirX, wind.dirZ)[0]

  return {
    level:      config.terrain.waterLevel + tide.level,
    height:     waveHeight * swashLift(wind.strength),
    steepness:  swashSteepness(waveHeight, swellLength),
    phase:      phase * swellRate(swellLength),
    wavenumber: swellWavenumber(swellLength),
    runX,
    runZ,
  }
}

/**
 * A swash with no sea in it.
 *
 * The reading for a ground material built with no lake under it — the prop
 * viewer's, and the harness's — so that a program which never gets a shore
 * draws a dry one rather than whatever `undefined` becomes on the driver.
 */
export const SWASH_DRY: SwashState = {
  level:      0,
  height:     0,
  steepness:  1,
  phase:      0,
  wavenumber: 0,
  runX:       1,
  runZ:       0,
}

/** Fold a number into glsl source without an integer literal sneaking through. */
const glsl = (value: number): string => Number.isInteger(value) ? value.toFixed(1) : String(value)

/** What the ground program declares for the band. */
export const SWASH_PARS_FRAGMENT = /* glsl */`
  uniform vec3 uSwashFoamColor;
  uniform vec2 uSwashRun;
  uniform float uSwashLevel;
  uniform float uSwashHeight;
  uniform float uSwashSteepness;
  uniform float uSwashPhase;
  uniform float uSwashK;
  uniform float uSwashReach;
  uniform float uSwashSteep;
  uniform float uSwashWet;
  uniform float uSwashSoak;
  uniform float uSwashFoam;
  uniform float uSwashLee;
`

/**
 * The band, on a fragment that already knows how high it is and which way it
 * is turned.
 *
 * Three things the ground program was already holding and one cosine. The
 * altitude is the snow line's own — see `ALTITUDE_FRAGMENT` — the gradient is
 * the grain's `vScapeFace.x` read as a slope rather than as a weight, and the
 * shelter is the drift's `vScapeFace.z` read against the same base bearing the
 * winter's banks are. Nothing here fetches.
 *
 * The phase is the **dominant swell train's**, dotted against the same run
 * bearing and advanced on the same integrated clock `scapeWave` draws the
 * surface with, with the sign the surface uses. So the bore walks up a beach as
 * the crest that raised it arrives, and a headland is wetted a moment before
 * the bay behind it — neither of which is authored anywhere, and both of which
 * fall out of sharing one clock rather than starting a second.
 *
 * Deliberately **not** weighted by the `lie` the shower and the snow are. Rain
 * lands on what faces the sky and snow settles on it; the sea wets what it
 * reaches, and what it reaches on this coast includes the seaward face of every
 * jetty pile, every mole stone and every wave-cut platform standing at the
 * waterline.
 */
export const SWASH_FRAGMENT = /* glsl */`
  float scapeGrade = sqrt(max(0.0, 1.0 - vScapeFace.x * vScapeFace.x)) /
    max(${glsl(SWASH_FLOOR)}, vScapeFace.x);
  float scapeShelter = 1.0 + (uSwashLee - 1.0) * clamp(0.5 + 0.5 * vScapeFace.z, 0.0, 1.0);
  float scapeRun = uSwashHeight *
    min(uSwashSteep, scapeGrade * uSwashSteepness) * uSwashReach * scapeShelter;

  if (scapeRun > 0.001) {
    float scapeAbove = scapeAltitude - uSwashLevel;

    // Fast up the beach and slow back down it, which is what a bore and a
    // backwash are: the cosine is the swell's own and the power is the only
    // place the asymmetry of the two lives.
    float scapeSurge = pow(
      0.5 - 0.5 * cos(dot(vScapeGround, uSwashRun) * uSwashK + uSwashPhase),
      0.6
    );
    float scapeBand = scapeRun * ${glsl(SWASH_BAND)};
    float scapeEdge = scapeRun * scapeSurge;

    // The outline is the full run and only the depth of the wet inside it
    // moves — see swash.soak. Under the waterline the band fades out rather
    // than ending, because the lake thins out against the sand rather than
    // ending either.
    float scapeSoaked = (1.0 - smoothstep(scapeRun - scapeBand, scapeRun, scapeAbove)) * uSwashSoak;
    float scapeLive   = 1.0 - smoothstep(scapeEdge - scapeBand, scapeEdge, scapeAbove);
    float scapeShore  = smoothstep(-${glsl(SWASH_SUBMERGED)}, 0.0, scapeAbove);
    float scapeSwash  = uSwashWet * scapeShore * max(scapeLive, scapeSoaked);

    diffuseColor.rgb *= 1.0 - 0.5 * scapeSwash;
    roughnessFactor   = mix(roughnessFactor, 0.1, scapeSwash);

    // The lace, at the top of the run and nowhere else. It is the narrowest
    // term in the scape and it is gated on the surge as well as on the edge,
    // so a shore at the bottom of its backwash carries no white at all.
    float scapeLace = uSwashFoam * scapeShore * scapeShelter *
      (1.0 - smoothstep(0.0, scapeBand * 0.8, abs(scapeAbove - scapeEdge))) *
      smoothstep(0.05, 0.4, scapeSurge);

    diffuseColor.rgb = mix(diffuseColor.rgb, uSwashFoamColor, clamp(scapeLace, 0.0, 1.0));
  }
`

/**
 * The band, written into the uniforms the ground program reads.
 *
 * Its own function rather than thirteen lines in `update` for `setSwell`'s
 * reason: the material's update is at the lint config's statement ceiling, and
 * a waterline, a sea, a phase and the five numbers that shape what they leave
 * on the shore are one reading of one coast.
 */
export function setSwash (
  uniforms: Record<string, IUniform>,
  swash:    SwashState,
  config:   ScapeConfig['swash'],
): void {
  uniforms.uSwashLevel.value     = swash.level
  uniforms.uSwashHeight.value    = swash.height
  uniforms.uSwashSteepness.value = swash.steepness
  uniforms.uSwashPhase.value     = swash.phase
  uniforms.uSwashK.value         = swash.wavenumber
  uniforms.uSwashReach.value     = config.reach
  uniforms.uSwashSteep.value     = config.steep
  uniforms.uSwashWet.value       = config.wet
  uniforms.uSwashSoak.value      = config.soak
  uniforms.uSwashFoam.value      = config.foam
  uniforms.uSwashLee.value       = config.lee
}

/**
 * How many samples a side the survey walks the world on.
 *
 * `measureDrift`'s own number, and the same argument: the band is a thin ring
 * round every coast, so a grid coarse enough to miss it reports a shore with no
 * sea on it. At 220 across 1520 m the step is just under seven metres, which is
 * about one sample per swash walk on the flattest ground in the archipelago —
 * the count is therefore a floor on what the line can claim rather than a
 * measurement of area, and the line reports lengths rather than shares for
 * exactly that reason.
 */
const SWASH_WALK = 220

/** Metres above the waterline the survey bothers looking at. */
const SWASH_WINDOW = 4

/** The part of the composite height field a coastal survey needs. */
export interface SwashField {
  heightAt(x: number, z: number): number
  normalAt(x: number, z: number, target: GroundNormal): GroundNormal
  landmassAt(x: number, z: number): { id: string } | null
}

/** What `scape:map --stats` is told about the band. */
export interface SwashSurvey {

  /** Land samples found inside the run-up at full surge. */
  wetted: number

  /** Land samples within {@link SWASH_WINDOW} of the waterline at all. */
  shore: number

  /** Median and greatest vertical run, in metres. */
  run:     number
  tallest: number

  /** Median and greatest horizontal walk, in metres. */
  walk:   number
  widest: number

  /** The gradient the median run was measured on. */
  grade: number
}

/** The middle value of a list already in order, or 0 for an empty one. */
function median (sorted: readonly number[]): number {
  return sorted.length ? sorted[sorted.length >> 1] : 0
}

/** Two places, which is a centimetre — finer than the band is ever drawn. */
function round (value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * The band, measured on the ground rather than described.
 *
 * The run-up is the one quantity in this scape that cannot be read off the
 * config at all: it is the config *through a gradient*, and the gradient is the
 * archipelago's own. So the survey walks the world, takes every land sample
 * within a few metres of the waterline, and asks the same two functions the
 * fragment asks. A median and a maximum, because a coast with one crag on it
 * has a maximum that says nothing about the rest of it and a median that says
 * everything.
 *
 * Deliberately not weighted by exposure. The shelter term is a fact about which
 * way a face is turned and it halves the run on a lee shore honestly; what the
 * line is for is whether the *relation* is producing a band at all, and mixing
 * the compass into it would hide a run-up of zero behind a coast that happens
 * to face the right way.
 */
export function measureSwash (
  field:   SwashField,
  config:  ScapeConfig,
  size:    number,
  samples: number = SWASH_WALK,
): SwashSurvey {
  const { waterLevel }              = config.terrain
  const { reach, steep }            = config.swash
  const { waveHeight, swellLength } = config.water
  const facing                      = { x: 0, y: 1, z: 0 }
  const half                        = size * 0.5
  const runs: number[]              = []
  const walks: number[]             = []
  const grades: number[]            = []
  let wetted = 0

  for (let row = 0; row < samples; row += 1)
    for (let column = 0; column < samples; column += 1) {
      const x     = -half + (column + 0.5) * size / samples
      const z     = -half + (row + 0.5) * size / samples
      const above = field.heightAt(x, z) - waterLevel

      if (above <= 0 || above > SWASH_WINDOW || !field.landmassAt(x, z))
        continue

      const grade = swashGrade(field.normalAt(x, z, facing).y)
      const run   = swashRun(grade, waveHeight, swellLength, reach, steep)

      runs.push(run)
      walks.push(swashWalk(grade, run))
      grades.push(grade)

      if (above <= run)
        wetted += 1
    }

  runs.sort((a, b) => a - b)
  walks.sort((a, b) => a - b)
  grades.sort((a, b) => a - b)

  return {
    wetted,
    shore:   runs.length,
    run:     round(median(runs)),
    tallest: round(runs.length ? runs[runs.length - 1] : 0),
    walk:    round(median(walks)),
    widest:  round(walks.length ? walks[walks.length - 1] : 0),
    grade:   round(median(grades)),
  }
}
