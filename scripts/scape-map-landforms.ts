import type { ScapeConfig } from '../src/scene/config.ts'
import type { ArchipelagoSurvey } from '../src/scene/landscape/archipelago.ts'
import { surveyFjord } from '../src/scene/landscape/fjord.ts'
import type { MapStats } from './scape-map.ts'


/**
 * The three landforms that live in world space, measured.
 *
 * Split off `scape-map.ts` when that file went past the 666-line ceiling a
 * second time, and the seam is a real one rather than a line count: the bar, the
 * guard and the drowned valleys are the only features in the scape that are not
 * surveyed inside a single island's frame, so they are the only ones this
 * instrument cannot read out of a `LandmassSurvey` and has to walk itself.
 *
 * Each of them also has to say *which* field it walked, and they do not all
 * answer the same way — see the note on {@link fjordStats}, which is the one
 * that had to disagree with its neighbours.
 */


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
export function fjordStats (survey: ArchipelagoSurvey): MapStats['fjords'] {
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
