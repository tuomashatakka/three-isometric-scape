import { createSeededRng, smoothstep } from 'threejs-scene'
import type { SeededRng } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { valueNoise } from '../noise.ts'
import { toWorld } from './archipelago.ts'
import type { ArchipelagoSurvey, LandmassSurvey } from './archipelago.ts'
import type { Vec2 } from './path.ts'


/**
 * Where the weed grows, and how long each plant is.
 *
 * The half of the kelp bed with no mesh in it. `config-kelp.ts` states the rule
 * — a depth of water, and nothing else — and this is the search that applies it
 * to the ground the scape actually draws. `landscape/kelp.ts` is the half that
 * puts one `InstancedMesh` over the answer.
 *
 * ### the band is found by depth, and the coast is walked to find it
 *
 * Everything else in this scape that follows a coastline follows it by
 * *freeboard*: the beach shelves over the first metres above the water, the salt
 * band is the first two and a half. Kelp cannot be written that way, because it
 * lives on the other side of the waterline and the one thing it answers to is
 * how much sea is over it. So each island is walked on {@link BEARINGS}
 * bearings; the outermost waterline crossing is found on each, the way
 * `landscape/dunes.ts` finds it and for the same reason — an island with a fjord
 * or a deep bay has several, and the sea is outside the last one — and then the
 * band is marched *outward* from there until the water is deeper than the light
 * reaches.
 *
 * Which makes the bed a genuine reading of the ground rather than a ring drawn
 * round it: a steep bearing gets a narrow strip four metres offshore and a
 * shelving one gets a wide bed thirty metres out, and neither is written
 * anywhere.
 *
 * ### the length is fixed and the lean is not
 *
 * A plant's length is settled here, once, against **mean** water — see
 * {@link KelpPlant.length}. What the tide moves is the angle, and that is
 * resolved per frame by {@link kelpLean} from the published `TideState`. This
 * survey therefore knows nothing about what hour it is, which is exactly the
 * property that lets a still be taken twice and come out the same.
 *
 * **Every length here is metres and stays metres.** A frond is the length a
 * frond is; a world that grew again gets more coast to grow it on, not longer
 * plants.
 */

/** One plant, in world metres. */
export interface KelpPlant {

  /** The island whose skirt it belongs to, so the map can say which coast is used. */
  island: string

  x: number
  z: number

  /** Absolute world height of the seabed the holdfast is on. What the tide is measured against. */
  bed: number

  /**
   * Metres from the holdfast to the tip.
   *
   * Fixed at the survey, from the depth at **mean** water times `kelp.over` — a
   * plant is the length it grew to, and it does not grow and shrink twice a day.
   * Everything the tide does to this bed it does through {@link kelpLean}.
   */
  length: number

  /**
   * Radians: the bearing the plant leans along — offshore, and jittered.
   *
   * Offshore because that is where the water it is falling into is: a plant on a
   * shelving coast leans down the slope, and a bed whose every plant leaned the
   * same way across the map would read as a combed carpet.
   */
  trail: number

  /** Where this plant is in the surge, 0..1. Dealt so a bed does not breathe as one. */
  phase: number
}

/**
 * One island's weed, and the shape of it.
 *
 * Carries the plants and the two numbers that say whether the search found a
 * coast at all — see {@link KelpSkirt.beds} and {@link KelpSkirt.offered}.
 */
export interface KelpSkirt {
  island: string

  /**
   * Separate beds round this coast — runs of shore the clearings did not break.
   *
   * The structural finding, and the reason it is counted rather than inferred: a
   * skirt of one bed is a rubber ring round the island, which is what `kelp.bare`
   * exists to prevent, and a skirt of forty is a scatter of single plants that
   * happens to be near the sea.
   */
  beds: number

  /** Places the band offered before the tier's budget was applied. */
  offered: number

  plants: readonly KelpPlant[]
}

/**
 * Bearings each island's waterline is solved at.
 *
 * Two degrees, which is finer than anything the bed does along the shore: the
 * clearings are thirty-odd metres apart and the plants four, and at the home
 * island's forty-four metre radius one step is a metre and a half of coast. The
 * step is *not* what spaces the plants — the walk accumulates arc length and
 * plants a row whenever `kelp.spacing` metres of coast have gone by, so the
 * spacing is the same on the smallest island and the largest.
 */
const BEARINGS = 180

/** Metres between probes on the inward march to the waterline. */
const MARCH_STEP = 2

/** Bisection passes that turn a 2 m bracket into a waterline. Three is 25 cm. */
const REFINE = 3

/** Metres between probes on the outward march across the band. */
const PROBE = 0.6

/**
 * The most band any one bearing may be walked, in metres.
 *
 * A stop rather than a shape. Almost every bearing leaves the depth window
 * within a dozen metres, but a coast can shelve so gently that the window runs
 * on for the width of the patch — and a single bearing carrying two hundred
 * metres of bed is not a kelp bed, it is a lagoon.
 */
const MAX_BAND = 60

/** Where the clearing field starts cutting and where it has cut all it will. */
const GAP_ONSET = 0.46
const GAP_FULL  = 0.82

/**
 * The golden ratio's fractional part, and the whole of how a tier is thinned.
 *
 * The budget cannot simply take the first *n* places the walk offered: the walk
 * goes round the coast in order, so a prefix of it is one side of the island and
 * a phone would get a bed on its north shore and bare sand everywhere else.
 * Ordering the places by `frac(index · PHI)` and taking a prefix of *that* gives
 * a subset spread evenly round the whole skirt at every budget — and, because it
 * is an ordering rather than a stride, raising the budget adds plants without
 * moving the ones already there. It is the haul-out's golden angle, applied to a
 * list instead of to a circle.
 */
const PHI = 0.618_033_988_749_895

/**
 * Metres of water over a plant, at a state of the tide.
 *
 * The whole of the tide coupling, and it is a subtraction rather than a state:
 * the sea is where the published tide says it is, the seabed is where the survey
 * left it, and the difference is how much water the plant has to stand up in.
 * Nothing here integrates and nothing here remembers — the same discipline
 * `sealClearance` is held to, for the same reason.
 */
export function kelpDepth (plant: KelpPlant, waterLevel: number, tideLevel: number): number {
  return waterLevel + tideLevel - plant.bed
}

/**
 * Radians a plant leans off vertical, given the water over it.
 *
 * The one authority over the angle, and it is the arccosine of a ratio because
 * that is literally what the geometry is: a rod of length `length`, hinged at
 * the seabed, whose far end is floating at a surface `depth` above it. Lean it
 * until the vertical rise equals the depth and the surplus is lying flat on the
 * sea, which is what a kelp canopy *is*.
 *
 * Two ends worth naming. In water deeper than the plant is long the ratio passes
 * 1, the clamp holds it there and the lean is zero — a plant standing straight
 * up with its head under the surface, which is correct and is what a bed does at
 * high springs. And at zero depth the lean is a right angle: a plant lying flat
 * on ground the sea has left, which is also correct, and is why nothing here
 * needs a special case for a bared bed.
 */
export function kelpLean (depth: number, length: number): number {
  if (length <= 0)
    return 0

  return Math.acos(Math.max(0, Math.min(1, depth / length)))
}

/**
 * Metres from an island's middle to the outermost waterline on one bearing.
 *
 * Marched inward from the edge of the patch rather than outward from the middle,
 * for the reason `dunes.ts` marches that way: a bearing that crosses a fjord or
 * a bay has several waterline crossings, and the sea the weed grows in is
 * outside the last of them. 0 where the bearing finds no dry land at all.
 *
 * Read off the *composite* field — the ground as the scape draws it, bar,
 * skerries and all — because a bed is planted on the seabed that is actually
 * there, not on the falloff the island was cut from.
 */
function shoreRadius (
  survey:   ArchipelagoSurvey,
  landmass: LandmassSurvey,
  angle:    number,
): number {
  const { waterLevel } = survey
  const half           = landmass.config.terrain.size * 0.5
  const cos            = Math.cos(angle)
  const sin            = Math.sin(angle)
  const at             = (radius: number): number =>
    survey.field.heightAt(landmass.origin.x + cos * radius, landmass.origin.z + sin * radius)

  let outer = half * 0.98

  for (let radius = outer; radius >= half * 0.15; radius -= MARCH_STEP) {
    if (at(radius) > waterLevel) {
      let dry = radius
      let wet = outer

      for (let pass = 0; pass < REFINE; pass += 1) {
        const middle = (dry + wet) * 0.5

        if (at(middle) > waterLevel)
          dry = middle
        else
          wet = middle
      }

      return dry
    }

    outer = radius
  }

  return 0
}

/**
 * How far the clearings have taken the weed out at a point on the coast, 0..1.
 *
 * Sampled along the shore and in no other axis, so a clearing is a gap you could
 * row through rather than a thinning of the whole band at one depth. Two
 * octaves, because one on the unit lattice gives evenly spaced gaps and evenly
 * spaced anything reads as machinery — the dune belt's blowouts are cut from the
 * same field for the same reason.
 *
 * @param along Metres of coast from the bearing the walk started at.
 */
function clearingAt (config: ScapeConfig, seed: number, along: number): number {
  const { patch } = config.kelp
  const at        = along / Math.max(1, patch)

  const field = valueNoise(at, 0, seed) * 0.62 +
    valueNoise(at * 2.41, 7.5, seed ^ 0x3d) * 0.38

  return smoothstep(GAP_ONSET, GAP_FULL, field)
}

/** What one bearing's march across the band needs to know. */
interface Row {
  survey:   ArchipelagoSurvey
  landmass: LandmassSurvey
  config:   ScapeConfig
  rng:      SeededRng

  /** Radians, in the island's own frame, and the bearing the plants lean along. */
  angle: number

  /** Metres from the island's middle to the waterline on that bearing. */
  shore: number

  /** The island's jetty in world metres, or `null` on an island with none. */
  landing: Vec2 | null
}

/**
 * Every plant one bearing's band will carry, dealt outward from the waterline.
 *
 * Its own function rather than a nested loop, because the walk round the coast
 * and the march out across the band are two different questions: one is about
 * how much coast has gone by, the other about how much water is over the ground.
 */
function plantRow ({ survey, landmass, config, rng, angle, shore, landing }: Row): KelpPlant[] {
  const { reach, sill, over, spacing, clear } = config.kelp
  const { waterLevel }                        = survey

  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  const row: KelpPlant[] = []

  let last = -Infinity

  for (let out = 0; out <= MAX_BAND; out += PROBE) {
    const radius = shore + out
    const x      = landmass.origin.x + cos * radius
    const z      = landmass.origin.z + sin * radius
    const bed    = survey.field.heightAt(x, z)
    const depth  = waterLevel - bed

    if (depth > reach)
      break

    if (depth < sill)
      continue

    // A row is dealt outward at the same spacing it is dealt along the shore, so
    // the bed has one density rather than a different one on every bearing — and
    // it is measured from the plant before it rather than from the waterline,
    // because where the band *starts* is a different distance offshore on every
    // bearing.
    if (out - last < spacing)
      continue

    last = out

    // The harbour is kept cut, and the place is spent rather than shuffled
    // along: a row that stepped round the jetty would draw a ring of weed
    // against the one thing it is supposed to leave alone. See `kelp.clear`.
    if (landing && Math.hypot(x - landing.x, z - landing.z) < clear)
      continue

    row.push({
      island: landmass.id,
      x,
      z,
      bed,
      length: depth * over,
      trail:  angle + rng.range(-0.5, 0.5),
      phase:  rng.next(),
    })
  }

  return row
}

/** Every place one island's coast offers a plant, in the order the coast was walked. */
type WalkSkirtReturnType = { plants: KelpPlant[], breaks: boolean[] }

function walkSkirt (
  survey:   ArchipelagoSurvey,
  landmass: LandmassSurvey,
  config:   ScapeConfig,
): WalkSkirtReturnType {
  const { spacing, bare } = config.kelp

  const rng     = createSeededRng(config.seed ^ 0x4e17).fork(`skirt-${landmass.id}`)
  const step    = Math.PI * 2 / BEARINGS
  const landing = landmass.survey.landing
    ? toWorld(landmass, landmass.survey.landing)
    : null

  const plants: KelpPlant[] = []
  const breaks: boolean[]   = []

  let along = 0
  let owed  = 0

  for (let bearing = 0; bearing < BEARINGS; bearing += 1) {
    const angle = bearing * step
    const shore = shoreRadius(survey, landmass, angle)

    if (shore <= 0) {
      // No coast on this bearing is a break in the skirt as surely as a clearing
      // is: an island bitten through by the coast warp has two beds, not one.
      breaks.push(true)
      continue
    }

    // Arc length at the waterline, which is what the spacing is written in.
    const arc = shore * step

    along += arc
    owed  += arc

    if (owed < spacing)
      continue

    owed -= spacing

    if (clearingAt(config, config.seed ^ 0x4b3d, along) > 1 - bare) {
      breaks.push(true)
      continue
    }

    const row = plantRow({ survey, landmass, config, rng, angle, shore, landing })

    plants.push(...row)
    breaks.push(row.length === 0)
  }

  return { plants, breaks }
}

/**
 * How many separate beds a walk's clearings left, from the breaks between them.
 *
 * A bed is a run of planted coast with a clearing at each end, and the walk is a
 * closed circuit — so a run that spans the seam where the walk started and
 * finished is one bed rather than two, which is what the wrap-around here is
 * for.
 */
function countBeds (breaks: readonly boolean[]): number {
  const kept = breaks.filter(broken => !broken).length

  if (kept === 0)
    return 0

  if (kept === breaks.length)
    return 1

  let beds = 0

  for (const [ index, broken ] of breaks.entries())
    if (!broken && breaks[(index - 1 + breaks.length) % breaks.length])
      beds += 1

  return beds
}

/**
 * Thin a walk's places down to what the tier will pay for.
 *
 * Every place, ordered by {@link PHI}, prefix taken. See that constant for why
 * it is not simply the first `budget` of them.
 */
function thin (plants: readonly KelpPlant[], budget: number): KelpPlant[] {
  if (plants.length <= budget)
    return [ ...plants ]

  return plants
    .map((plant, index) => ({ plant, key: (index + 1) * PHI % 1 }))
    .sort((first, second) => first.key - second.key)
    .slice(0, budget)
    .map(entry => entry.plant)
}

/**
 * Every kelp plant in the archipelago, on the coasts that carry one.
 *
 * Deterministic: one rng forked per island off the scape's seed, so an island
 * that gains a bed does not reshuffle the weed on every other island — the same
 * discipline every scatter in the scape is held to.
 *
 * @param budget Plants one island's skirt may carry, from the tier. 0 is a sea
 *   with no weed in it, and the whole system is then absent rather than cheap.
 */
export function planKelp (
  survey: ArchipelagoSurvey,
  config: ScapeConfig,
  budget: number,
): readonly KelpSkirt[] {
  const heads = Math.max(0, Math.floor(budget))

  if (heads < 1 || config.kelp.reach <= config.kelp.sill)
    return []

  return survey.landmasses.map(landmass => {
    const { plants, breaks } = walkSkirt(survey, landmass, config)

    return {
      island:  landmass.id,
      beds:    countBeds(breaks),
      offered: plants.length,
      plants:  thin(plants, heads),
    }
  })
}

/** Every plant in the archipelago, flattened out of the skirts that carry them. */
export function kelpPlants (skirts: readonly KelpSkirt[]): readonly KelpPlant[] {
  return skirts.flatMap(skirt => skirt.plants)
}
