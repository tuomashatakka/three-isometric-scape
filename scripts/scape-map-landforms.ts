import type { ScapeConfig } from '../src/scene/config.ts'
import type { ArchipelagoSurvey } from '../src/scene/landscape/archipelago.ts'
import { measureCrag } from '../src/scene/landscape/crag.ts'
import { measureDunes } from '../src/scene/landscape/dunes.ts'
import { measureSaltings } from '../src/scene/landscape/saltings.ts'
import { measureStack } from '../src/scene/landscape/stack.ts'
import { surveyFjord } from '../src/scene/landscape/fjord.ts'
import { findFall } from '../src/scene/landscape/force.ts'
import { createHeightField } from '../src/scene/landscape/height.ts'
import { countAshore, hauledSeals, planHaulouts } from '../src/scene/landscape/haulout.ts'
import { iceCapOf, measureIce } from '../src/scene/landscape/icecap.ts'
import { kelpDepth, kelpLean, kelpPlants, planKelp } from '../src/scene/landscape/kelpbed.ts'
import { planTreeline } from '../src/scene/landscape/treeline.ts'
import { tideAmplitudeAt } from '../src/scene/tide.ts'
import type { MapStats } from './scape-map.ts'


/**
 * The features that live in world space, measured.
 *
 * Split off `scape-map.ts` when that file went past the 666-line ceiling a
 * second time, and the seam is a real one rather than a line count: the bar, the
 * guard, the drowned valleys and now the wood's own edge are the features in the
 * scape that are not surveyed inside a single island's frame, so they are the
 * ones this instrument cannot read out of a `LandmassSurvey` and has to walk
 * itself.
 *
 * Each of them also has to say *which* field it walked, and they do not all
 * answer the same way — see the note on {@link fjordStats}, which is the one
 * that had to disagree with its neighbours.
 */


/**
 * One drowned valley, measured.
 *
 * A fjord's whole claim is a *relation between three depths* — the open sea
 * outside the mouth, the sill across it, and the basin behind — and no still can
 * measure three depths through a depth tint. A run that retunes the falloff, the
 * shelving or the seabed drop can leave the picture looking identical while the
 * sill has drowned to the seabed and the landform has quietly become a bay, so
 * the numbers are the check.
 */
export interface FjordStats {
  id:     string
  length: number

  /** Metres of water in the open sea off the mouth. */
  sea: number

  /** Metres of water over the shallowest of the way in. */
  sill: number

  /** Metres of water over the deepest of the basin. */
  basin: number

  /** Metres the valley floor at the head stands over the waterline. */
  head: number

  /** Whether the basin is deeper than the sea it opens into. The claim. */
  overdeepened: boolean
}

/**
 * One ice cap, measured against the rock under it.
 *
 * The fjords' reason turned over: an inlet's claim is three depths a picture
 * cannot separate, and a cap's is a *thickness* a picture cannot see at all.
 * White ground at the top of an island is white ground whether it is a dome of
 * ice or a hill with snow on it, and the difference between those two is the
 * whole landform.
 */
export interface IcecapStats {
  id: string

  /** Where the dome stands, in world coordinates. */
  x: number
  z: number

  /** Metres from that centre to where the surface reaches the waterline. */
  reach: number

  /** Percentage of the island's dry ground under ice. */
  share: number

  /** Metres the ice surface stands above the waterline at its highest. */
  apex: number

  /** Metres of ice over rock, at the thickest. */
  thickest: number

  /** Metres of water the front stands in at its deepest. 0 is a cap that ends ashore. */
  front: number
}

/** Round for the report, not for the maths. */
const round = (value: number, places = 1): number => Number(value.toFixed(places))

/**
 * The guard, read off the composite field for the same reason the bar is.
 *
 * `lowest` asks the field how high each rock actually stands rather than asking
 * the survey what freeboard it dealt — the two are the same number here and are
 * only the same number for as long as nothing else ever raises the sea.
 */
export function skerryStats (survey: ArchipelagoSurvey, config: ScapeConfig): MapStats['skerries'] {
  const { skerries }   = survey.skerries
  const { waterLevel } = config.terrain

  if (!skerries.length)
    return { count: 0, guards: 0, widest: 0, lowest: 0, nearest: 0 }

  const freeboard = skerries.map(rock => survey.field.heightAt(rock.x, rock.z) - waterLevel)

  const nearest = Math.min(...skerries.flatMap(rock => survey.landmasses.map(landmass =>
    Math.max(
      Math.abs(rock.x - landmass.origin.x),
      Math.abs(rock.z - landmass.origin.z),
    ) - landmass.config.terrain.size * 0.5 - rock.radius)))

  return {
    count:   skerries.length,
    guards:  survey.skerries.chains,
    widest:  round(Math.max(...skerries.map(rock => rock.radius)), 1),
    lowest:  round(Math.min(...freeboard), 2),
    nearest: round(nearest),
  }
}

/**
 * How many animals a rock is dealt when the map asks, whatever tier is running.
 *
 * `scape:map` has no renderer and therefore no device to read a tier off, and
 * the number it prints has to be the same on every box or the instrument is
 * useless for comparing two runs. So it reports the desktop budget — the tier
 * `quality.ts` calls the reference one — and the line says which rocks were
 * chosen rather than how many animals a phone would put on them.
 */
const MAP_TIER_HEADS = 11

/**
 * The colony on the guard, and what the tide does to it.
 *
 * Two counts of one colony rather than one, and that pair is the whole reason
 * this line exists. A haul-out is a claim about a *relation* — the animals lie
 * where the sea reaches them — and no still can state a relation, because a
 * still is one state of the tide. `low` and `high` are the same rocks at the two
 * ends of a spring tide, and `low === high` is the finding: a colony sited so
 * high up its rocks that the sea has stopped mattering to it.
 */
export function hauloutStats (survey: ArchipelagoSurvey, config: ScapeConfig): MapStats['haulout'] {
  const rocks          = planHaulouts(survey, config, MAP_TIER_HEADS)
  const seals          = hauledSeals(rocks)
  const offered        = survey.skerries.skerries.length
  const springs        = tideAmplitudeAt(1, config.tide)
  const { waterLevel } = config.terrain

  return {
    rocks:   rocks.length,
    offered,
    seals:   seals.length,
    guards:  new Set(rocks.map(rock => rock.skerry.guard)).size,
    low:     countAshore(seals, waterLevel, -springs),
    high:    countAshore(seals, waterLevel, springs),
    lowest:  seals.length ? round(Math.min(...seals.map(seal => seal.ledge - waterLevel)), 2) : 0,
    highest: seals.length ? round(Math.max(...seals.map(seal => seal.ledge - waterLevel)), 2) : 0,
    springs: round(springs, 2),
  }
}

/**
 * How many plants a coast is dealt when the map asks, whatever tier is running.
 *
 * The desktop budget, for the reason {@link MAP_TIER_HEADS} is the desktop one:
 * `scape:map` has no renderer and so no device to read a tier off, and a number
 * that changed with the box it ran on would make the instrument useless for
 * comparing two runs.
 */
const MAP_TIER_PLANTS = 250

/**
 * The kelp beds, and the relation the tide has with them.
 *
 * Here rather than in a screenshot for the reason the colony is, and more so: a
 * bed is under the sea, seen through a depth tint, and the two things worth
 * knowing about it cannot be in a still at all. `offered` against `plants` is
 * the *search* — how much band the depth rule actually found, before any tier
 * spent a budget on it — and `beds` is whether the clearings left a coast with
 * several beds on it or one unbroken ring. `afloat` is the claim the whole
 * system rests on: the share of plants long enough to have canopy lying on the
 * surface at mean water, which at 0 is a bed that is technically present and
 * reads as a lawn on the seabed.
 */
export function kelpStats (survey: ArchipelagoSurvey, config: ScapeConfig): MapStats['kelp'] {
  const skirts         = planKelp(survey, config, MAP_TIER_PLANTS)
  const plants         = kelpPlants(skirts)
  const { waterLevel } = config.terrain
  const springs        = tideAmplitudeAt(1, config.tide)

  const depths = plants.map(plant => kelpDepth(plant, waterLevel, 0))
  const afloat = plants.filter(plant => plant.length > kelpDepth(plant, waterLevel, 0)).length

  // The two ends of a spring tide, in degrees of lean. One number would say
  // nothing: the whole behaviour of this system is that the same plant stands up
  // as the water comes in, and only the pair states it.
  const lean = (tide: number): number => plants.length === 0
    ? 0
    : plants.reduce(
      (sum, plant) => sum + kelpLean(kelpDepth(plant, waterLevel, tide), plant.length),
      0,
    ) / plants.length * 180 / Math.PI

  return {
    plants:  plants.length,
    offered: skirts.reduce((sum, skirt) => sum + skirt.offered, 0),
    beds:    skirts.reduce((sum, skirt) => sum + skirt.beds, 0),
    coasts:  skirts.filter(skirt => skirt.plants.length > 0).length,
    islands: skirts.length,
    afloat:  plants.length === 0 ? 0 : round(afloat / plants.length * 100, 1),
    shallow: depths.length ? round(Math.min(...depths), 2) : 0,
    deep:    depths.length ? round(Math.max(...depths), 2) : 0,
    longest: plants.length ? round(Math.max(...plants.map(plant => plant.length)), 2) : 0,
    low:     round(lean(-springs), 1),
    high:    round(lean(springs), 1),
  }
}

/**
 * Every drowned valley, walked mouth to head.
 *
 * Across the trench as well as along it, because the centreline bends and the
 * deepest water is not on the straight line between the ends.
 *
 * Sampled off the *island's own* field rather than the composite one, which is
 * the opposite of what {@link strandStats} does and for a reason worth writing
 * down: `createCompositeField` folds the guard in as a maximum, and the guard
 * answers with the seabed wherever it has no rock — so the composite is floored
 * at `waterLevel - seabedDrop` and cannot report anything deeper than nine
 * metres. Nothing visible depends on that today (the depth channel of the shore
 * mask saturates at `MAX_DEPTH`, well above the floor, and the ferry planner
 * only ever wants to know whether there is *enough* water), but a trench is
 * precisely the thing it cannot measure. The patch geometry is built from the
 * island's local field — see `withStrand` in `landscape/terrain.ts` — so that is
 * also the ground the scape actually draws.
 */
export function fjordStats (survey: ArchipelagoSurvey): FjordStats[] {
  const steps  = 160
  const across = 6

  return survey.landmasses.flatMap(landmass => {
    const fjord = surveyFjord(landmass.config)

    if (!fjord)
      return []

    const water = landmass.config.terrain.waterLevel

    function depthAt (at: number): number {
      const centre = fjord!.pointAt(at)
      const edge   = fjord!.halfWidthAt(at)
      const step   = fjord!.pointAt(Math.min(1, at + 0.01))
      const run    = Math.hypot(step.x - centre.x, step.z - centre.z) || 1

      // The across-axis of the centreline at this point, from its own tangent.
      const nx = -(step.z - centre.z) / run
      const nz = (step.x - centre.x) / run

      let deepest = -Infinity

      for (let lane = -across; lane <= across; lane += 1) {
        const reach = lane / across * edge * 0.7

        deepest = Math.max(
          deepest,
          water - landmass.survey.field.heightAt(centre.x + nx * reach, centre.z + nz * reach),
        )
      }

      return deepest
    }

    let basin = -Infinity
    let sill  = Infinity

    for (let step = 0; step <= steps; step += 1) {
      const at    = step / steps
      const depth = depthAt(at)

      basin = Math.max(basin, depth)

      // The shallowest water anywhere on the way in, which is where the bar is
      // whether or not the profile put it where it meant to.
      if (at <= 0.5)
        sill = Math.min(sill, depth)
    }

    const sea = depthAt(0)

    return [{
      id:           landmass.id,
      length:       round(fjord.length),
      sea:          round(sea, 1),
      sill:         round(sill, 1),
      basin:        round(basin, 1),
      head:         round(landmass.survey.field.heightAt(fjord.head.x, fjord.head.z) - water, 1),
      overdeepened: basin > sea,
    }]
  })
}

/**
 * The bar, walked end to end.
 *
 * Sampling the *composite* field rather than the strand's own profile, and that
 * is the whole point of the check: what a walker meets is the maximum of the bar
 * and whatever patch it is over, which is the thing the rest of the scape
 * actually reads. Asking the strand what it thinks it is would answer a question
 * nobody had.
 */
export function strandStats (survey: ArchipelagoSurvey, config: ScapeConfig): MapStats['strand'] {
  const { strand } = survey

  if (!strand)
    return null

  const steps = 240
  const from  = strand.points[0]
  const to    = strand.points[strand.points.length - 1]
  let lowest   = Infinity

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    const x = from.x + (to.x - from.x) * t
    const z = from.z + (to.z - from.z) * t

    // Widthwise as well as lengthwise: the centreline wanders, so a straight
    // walk between the anchors leaves it and comes back. The best the bar offers
    // across a few metres either side is what a walker would find.
    let best = -Infinity

    for (let across = -3; across <= 3; across += 1) {
      const dx = -(to.z - from.z) / strand.length * across * config.strand.width * 0.5
      const dz = (to.x - from.x) / strand.length * across * config.strand.width * 0.5

      best = Math.max(best, survey.field.heightAt(x + dx, z + dz))
    }

    lowest = Math.min(lowest, best)
  }

  return {
    between:   [ ...config.strand.between ] as [ string, string ],
    length:    round(strand.length),
    crest:     config.strand.crest,
    lowest:    round(lowest - config.terrain.waterLevel),
    connected: lowest > config.terrain.waterLevel,
  }
}

/**
 * Every ice cap, measured against the rock it is standing on.
 *
 * Four numbers, and every one of them is a claim the pictures cannot check. A
 * still shows white ground; it does not show whether that white is a dome
 * eighteen metres thick or a coat of paint over a hill, whether the cap has
 * quietly swallowed the whole island, or whether the front is standing in the
 * sea or has floated off into it. Those are exactly the failures a retune of
 * the falloff, the shelving or the seabed drop produces.
 *
 * The second field is what makes it measurable at all: the island is surveyed a
 * second time with `crown` set to zero, which is the same ground with the ice
 * taken back off. Thickness is the difference between the two, and there is no
 * other way to ask — by the time anything can be sampled, the ice *is* the
 * ground.
 */
export function icecapStats (survey: ArchipelagoSurvey): IcecapStats[] {
  return survey.landmasses.flatMap(landmass => {
    const cap = iceCapOf(landmass.config)

    if (!cap)
      return []

    const bare = {
      ...landmass.config,
      terrain: {
        ...landmass.config.terrain,
        icecap: { ...landmass.config.terrain.icecap, crown: 0 },
      },
    }

    // The dune belt goes into the control too. It is not what is being measured
    // here, but it is part of the bed the ice is standing on, and a control
    // missing a landform reads its thickness back as the dome's.
    const bed = createHeightField(
      bare,
      landmass.survey.layout,
      landmass.survey.tarn,
      landmass.survey.peat,
      null,
      landmass.survey.dunes,
    )
    const report = measureIce(landmass.config, landmass.survey.field.heightAt, bed.heightAt)

    if (!report)
      return []

    return [{
      id:       landmass.id,
      x:        round(cap.x + landmass.origin.x),
      z:        round(cap.z + landmass.origin.z),
      reach:    round(cap.reach),
      share:    round(report.share * 100),
      apex:     round(report.apex, 2),
      thickest: round(report.thickest, 2),
      front:    round(report.front, 2),
    }]
  })
}

/**
 * The wood's edge, walked.
 *
 * Here rather than in `scape-map-sites.ts` for the reason the bar and the guard
 * are: the fetch that decides where a wood gives out runs over the sea *between*
 * the islands, so a shore in the lee of the next island along is sheltered by
 * ground that is not in its own patch. There is no reading this out of one
 * `LandmassSurvey`.
 *
 * And it is the block the treeline needs, because none of it is visible in a
 * still. A summit that lost its trees looks like a summit; a wood that quietly
 * lost four fifths of itself to a mistuned salt band looks like a thinner wood.
 * The three shares are what say which of those happened.
 */
export interface TreelineStats {

  /** Share of land, as a percentage, in closed wood — vigour over 0.75. */
  wooded: number

  /** Share in the margin band, where the trees stand thin and stunted. */
  margin: number

  /** Share above the line or salted off it, where nothing woody stands. */
  bare: number

  /** The lowest and highest the line itself came out, in metres over the water. */
  line: { low: number, high: number, mean: number }

  /** Per island: how much of it is wooded, and the line it averaged. */
  islands: { id: string, wooded: number, line: number, exposure: number }[]
}

/** Rows and columns the archipelago's land is walked at. */
const TREELINE_WALK = 220

export function treelineStats (
  survey: ArchipelagoSurvey,
  config: ScapeConfig,
): TreelineStats {
  const treeline = planTreeline(survey.field, config, survey.waterLevel)
  const half     = survey.size * 0.5
  const totals   = new Map<string, { land: number, wooded: number, line: number, exposure: number }>()

  let land   = 0
  let wooded = 0
  let margin = 0
  let low    = Infinity
  let high   = -Infinity
  let lines  = 0

  for (let row = 0; row < TREELINE_WALK; row += 1)
    for (let col = 0; col < TREELINE_WALK; col += 1) {
      const x = -half + (col + 0.5) * survey.size / TREELINE_WALK
      const z = -half + (row + 0.5) * survey.size / TREELINE_WALK

      if (survey.field.heightAt(x, z) <= survey.waterLevel)
        continue

      const vigour   = treeline.vigourAt(x, z)
      const limit    = treeline.limitAt(x, z)
      const openness = treeline.exposureAt(x, z)
      const id       = survey.field.landmassAt(x, z)?.id ?? 'between'
      const tally    = totals.get(id) ?? { land: 0, wooded: 0, line: 0, exposure: 0 }

      land  += 1
      lines += limit
      low    = Math.min(low, limit)
      high   = Math.max(high, limit)

      if (vigour > 0.75)
        wooded += 1
      else if (vigour > 0.15)
        margin += 1

      tally.land     += 1
      tally.wooded   += vigour > 0.75 ? 1 : 0
      tally.line     += limit
      tally.exposure += openness
      totals.set(id, tally)
    }

  const share = (count: number): number => land ? round(100 * count / land) : 0

  return {
    wooded: share(wooded),
    margin: share(margin),
    bare:   share(land - wooded - margin),
    line:   {
      low:  land ? round(low, 2) : 0,
      high: land ? round(high, 2) : 0,
      mean: land ? round(lines / land, 2) : 0,
    },
    islands: survey.landmasses.flatMap(landmass => {
      const tally = totals.get(landmass.id)

      return tally
        ? [{
          id:       landmass.id,
          wooded:   round(100 * tally.wooded / tally.land),
          line:     round(tally.line / tally.land, 2),
          exposure: round(tally.exposure / tally.land, 2),
        }]
        : []
    }),
  }
}


/** One island's dune belt, measured. */
export interface DuneStats {
  id: string

  /** Metres of sand standing over the ground at the highest point of the ridge. */
  crest: number

  /** Metres inland of the waterline that highest point stands. */
  ridgeAt: number

  /** Metres of coast the belt runs along, at the waterline. */
  length: number

  /** Bearings the blowouts have taken under a quarter of the crest. */
  gaps: number

  /** Percentage of the belt's probes the ground refused sand to. */
  refused: number

  /** Bearings inside the arc that found a shore at all. */
  sampled: number

  /** The least freeboard any sand was laid on, in metres. */
  lowest: number
}

/**
 * Every dune belt, walked along the coast it lies on.
 *
 * Six numbers, and five of them are claims a still cannot check. A screenshot
 * of a pale shore says nothing about whether the ridge is two metres of sand or
 * two centimetres, whether it has any gaps in it or runs as one unbroken
 * embankment, whether the arc found a coast to sit on at all — an island whose
 * weather side the coast warp has bitten into a bay has bearings with no
 * waterline on them — or whether the belt has walked into the sea. That last one
 * is `lowest`, and it is the landform's whole invariant: sand is laid on dry
 * ground or it is not laid. At or under zero the belt has put a dune in the
 * water, and no pose in the tour is pointed at the shore it would be on.
 */
export function duneStats (survey: ArchipelagoSurvey): DuneStats[] {
  return survey.landmasses.flatMap(landmass => {
    const report = measureDunes(landmass.config, landmass.survey.dunes)

    if (!report)
      return []

    return [{
      id:      landmass.id,
      crest:   round(report.crest, 2),
      ridgeAt: round(report.ridgeAt, 1),
      length:  round(report.length),
      gaps:    report.gaps,
      refused: round(report.refused),
      sampled: report.sampled,
      lowest:  round(report.lowest, 3),
    }]
  })
}


/** One island's tidal flat, measured. */
export interface SaltingsStats {
  id: string

  /** The bearing the flat lies on, in degrees. */
  bearing: number

  /** Metres of coast it runs along, at the waterline the island had before it. */
  length: number

  /** Square metres of it standing between low and high water at springs. */
  tidal: number

  /** Square metres of it standing high enough to carry turf. */
  turf: number

  /** Share of the flat the drainage gutters have cut, as a percentage. */
  gutters: number

  /** Metres the waterline walks across it between low and high springs. */
  walk: number

  /** The least freeboard any turf was found on, in metres. */
  lowest: number
}

/**
 * Every saltings, walked along the coast it lies on.
 *
 * Seven numbers, and the important one is `walk` — how far the sea moves across
 * the flat between low water and high. That is the whole reason the landform is
 * in the scape, it takes two stills at two states of the tide to see, and a
 * marsh whose surface came out over the top of the spring range or under the
 * bottom of it reports it as nothing while still looking like a marsh in both
 * of them.
 *
 * `lowest` is the invariant, the way the dune belt's is: turf on ground at or
 * below mean water is a sward growing in the sea. It is measured against the
 * *drawn* ground rather than against the level the silt filled toward, because
 * the beck's channel and the gutters are both cut after the fill.
 */
export function saltingsStats (survey: ArchipelagoSurvey): SaltingsStats[] {
  return survey.landmasses.flatMap(landmass => {
    const report = measureSaltings(
      landmass.config,
      landmass.survey.saltings,
      landmass.survey.field.heightAt,
    )

    if (!report)
      return []

    return [{
      id:      landmass.id,
      bearing: round(report.bearing, 1),
      length:  round(report.length),
      tidal:   round(report.tidal),
      turf:    round(report.turf),
      gutters: round(report.gutters, 1),
      walk:    round(report.walk, 1),
      lowest:  round(report.lowest, 2),
    }]
  })
}


/** One island's headland, measured. */
export interface CragStats {
  id: string

  /** The bearing the cliff stands on, in degrees. */
  bearing: number

  /** The gradient of the bare coast that won the siting search. */
  steep: number

  /** Metres over mean water the highest drawn ground on the headland stands. */
  lip: number

  /** The steepest drawn fall on the face, in degrees. */
  face: number

  /** Metres of coast the cliff line runs along. */
  length: number

  /** Bearings inside the arc the clefts have taken under three fifths of the lip. */
  clefts: number

  /** Metres over mean water the lowest bearing of the cliff line stands. */
  least: number

  /** The most metres of rock the crag stood over the coast that was there. */
  standing: number

  /** The most metres of ground it took away. The invariant: zero. */
  cut: number

  /** Metres of water off the outer edge of the platform. */
  plunge: number
}

/**
 * Every crag, walked across the coast it stands on.
 *
 * Nine numbers, and a still can check exactly one of them — that there is a
 * cliff there. A screenshot of a dark headland says nothing about whether the
 * face is sixty degrees of rock or a bank at twenty; whether the lip stands at
 * the seven metres it was asked for or at three because the coast under it was
 * already high; whether the clefts cut anything or the line runs unbroken like
 * a sea wall; whether there is water off the platform at all, which is the
 * difference between a cliff and a step in a field. And `cut` is the whole
 * invariant: a crag is the rock the sea did *not* take, so it only ever raises
 * ground, and anything over zero here is a landform that has started eating an
 * island the farm was already sited on.
 */
export function cragStats (survey: ArchipelagoSurvey): CragStats[] {
  return survey.landmasses.flatMap(landmass => {
    const report = measureCrag(landmass.config, landmass.survey.crag)

    if (!report)
      return []

    return [{
      id:       landmass.id,
      bearing:  round(report.bearing),
      steep:    round(report.steepness, 2),
      lip:      round(report.lip, 2),
      face:     round(report.face),
      length:   round(report.length),
      clefts:   report.clefts,
      least:    round(report.least, 2),
      standing: round(report.standing, 2),
      cut:      round(report.cut, 3),
      plunge:   round(report.plunge, 2),
    }]
  })
}


/** One island's pillar, measured on the ground that has it in it. */
export interface StackStats {
  id: string

  /** Where it stands, in world metres. */
  x: number
  z: number

  /** The bearing it stands off, in degrees. */
  bearing: number

  /** Metres over mean water the drawn crown stands. */
  crown: number

  /** Metres over mean water the headland it came out of was authored to stand. */
  lip: number

  /** Mean plan radius at the foot, in metres. */
  girth: number

  /** Metres of submerged ground between the foot and the coast. The claim. */
  gut: number

  /** The deepest water in that gap, in metres. */
  depth: number

  /** Metres the crown stands clear of high water at springs. */
  freeboard: number

  /** How weak the rock was on the line the sea cut behind, 0..1. */
  weakness: number
}

/**
 * Every stack, measured against the ground the terrain is drawn from.
 *
 * The block exists for one number. `gut` is the whole landform — a pillar is
 * only a pillar because there is water behind it — and it is the one fact about
 * this scape that the tour is structurally unable to check: from every pose the
 * scape is ever drawn at, a stack standing ten metres off a headland and a
 * stack welded to the end of its own platform are the same dark shape against
 * the same sea. Read here, they are 9.5 and 0.
 *
 * `freeboard` is the second one, and it is the tide's. A crown that stood five
 * metres clear at mean water and went under at springs would be a landform that
 * appears and disappears twice a month, which is a skerry — and this scape
 * already has fifty-nine of those.
 */
export function stackStats (survey: ArchipelagoSurvey, config: ScapeConfig): StackStats[] {
  const springs = tideAmplitudeAt(1, config.tide)

  return survey.landmasses.flatMap(landmass => {
    const stack = landmass.survey.crag?.stack

    if (!stack)
      return []

    const report = measureStack(
      stack,
      landmass.survey.field.heightAt,
      config.terrain.waterLevel,
      springs,
    )

    return [{
      id: landmass.id,
      x:  round(landmass.origin.x + stack.x),
      z:  round(landmass.origin.z + stack.z),
      ...report,
    }]
  })
}


/** One island's fall, measured. */
export interface ForceStats {
  id: string

  /** Where the water goes over, in world metres. */
  x: number
  z: number

  /** World height of the lip. */
  lip: number

  /** Metres the sheet falls, and metres of channel it crosses doing it. */
  drop: number
  run:  number

  /** Width of the sheet at the lip, in metres. */
  width: number
}

/**
 * Every fall, measured against the ground its lip is cut into.
 *
 * The block a still cannot replace, and for a sharper reason than most: the
 * whole landform is a *rearrangement* of a long profile whose two ends do not
 * move, so every number the beck's own line reports — the wetted reach, the
 * total fall, the mouth — comes out identical whether the step is two metres
 * deep or was never cut at all. A run that retuned the smoothing, the gather
 * window or the carve's claim could delete every fall in the archipelago without
 * moving one figure anywhere else in this readout. These four are the only place
 * that shows.
 *
 * Measured off the continuous field rather than the drawn one, the same way
 * {@link beckOf} is and with the same consequence: the scene hangs its sheet on
 * the triangles, which stand off this ground by tens of centimetres wherever it
 * curves, so a drop here is the step the carve asked for rather than the one a
 * given tier's grid resolved. A fall that reads well here and is invisible in a
 * frame is a terrain segment count that cannot carry it.
 */
export function forceStats (survey: ArchipelagoSurvey): ForceStats[] {
  return survey.landmasses.flatMap(landmass => {
    const { config, origin } = landmass
    const { creek }          = landmass.survey.layout

    if (!creek)
      return []

    const fall = findFall({
      creek,
      depth:      config.beck.depth,
      fill:       config.beck.fill,
      waterLevel: config.terrain.waterLevel,
      least:      config.force.least,
      surfaceAt:  landmass.survey.field.heightAt,
    })

    if (!fall)
      return []

    return [{
      id:    landmass.id,
      x:     round(fall.x + origin.x),
      z:     round(fall.z + origin.z),
      lip:   round(fall.lip, 2),
      drop:  round(fall.drop, 2),
      run:   round(fall.run, 1),
      width: round(fall.half * 2 * config.force.breadth, 2),
    }]
  })
}
