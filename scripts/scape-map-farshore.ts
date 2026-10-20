import type { ScapeConfig } from '../src/scene/config.ts'
import type { ArchipelagoSurvey } from '../src/scene/landscape/archipelago.ts'
import { patchReach } from '../src/scene/landscape/farshore.ts'


/** Its own copy, as in `scape-map-landforms.ts`: one line, and not worth an import. */
const round = (value: number, places = 1): number => Number(value.toFixed(places))

/**
 * The coast on the far side of the water.
 *
 * The only block in this report about something that is not in the height
 * field, so every number here is read off the ring survey rather than sampled
 * off the ground. Two of them are the ones that matter: `land` says whether
 * there is a horizon at all, and `clearance` is the proof that it is not
 * standing in the archipelago — the far shore is the one landform in this
 * scape that can be wrong by being in the right place for the report and the
 * wrong place for the picture.
 */
export interface FarShoreStats {
  land:      number
  headlands: number
  sounds:    number
  summit:    number
  at:        number
  nearest:   number
  furthest:  number
  widest:    number
  clearance: number
}

/**
 * The places on that coast, after dark.
 *
 * Three readings a still cannot make, and the run that added the lights wanted
 * all three. `refused` is the count the spread floor could not seat and is the
 * one that moves when the coast or the knobs change under it. `highest` is the
 * claim this system can silently break — a light over the crest of its own
 * bearing is a lamp hanging in the sky — stated against the geometry rather
 * than against the arithmetic. And `lowest` says the lights are out of the
 * water, which is the other half of the same claim.
 */
export interface ShoreLightStats {
  places:  number
  lights:  number
  refused: number
  most:    number
  spread:  number
  lowest:  number
  highest: number
  over:    number
}

export function shoreLightStats (survey: ArchipelagoSurvey): ShoreLightStats {
  const { settlements, lights, refused } = survey.shoreLights
  const bearings                         = settlements.map(site => site.bearing * 180 / Math.PI)
  const heights                          = lights.map(light => light.height)
  const crests                           = new Map(survey.farShore.samples.map(sample => [ sample.bearing, sample.crest ]))

  return {
    places:  settlements.length,
    lights:  lights.length,
    refused,
    most:    settlements.reduce((top, site) => Math.max(top, site.lights), 0),
    spread:  bearings.length > 1 ? round(Math.max(...bearings) - Math.min(...bearings)) : 0,
    lowest:  heights.length ? round(Math.min(...heights), 2) : 0,
    highest: heights.length ? round(Math.max(...heights), 2) : 0,

    // The lamps-in-the-sky check, counted rather than asserted: a light may
    // stand on the face of its own bearing and nowhere above it.
    over: lights.filter(light => light.height > (crests.get(light.bearing) ?? 0)).length,
  }
}

export function farShoreStats (survey: ArchipelagoSurvey, config: ScapeConfig): FarShoreStats {
  const shore = survey.farShore
  const gaps  = shore.sounds.map(sound => sound.arc)
  let clearance = Number.POSITIVE_INFINITY

  for (const sample of shore.samples) {
    const toe = sample.distance * (1 - config.farShore.width * 0.5)

    clearance = Math.min(clearance, toe - patchReach(config, sample.bearing))
  }

  return {
    land:      round(shore.land * 100, 1),
    headlands: shore.headlands.length,
    sounds:    shore.sounds.length,
    summit:    round(shore.summit?.crest ?? 0, 1),
    at:        round((shore.summit?.bearing ?? 0) * 180 / Math.PI),
    nearest:   round(shore.nearest, 0),
    furthest:  round(shore.furthest, 0),
    widest:    gaps.length ? round(Math.max(...gaps)) : 0,
    clearance: round(clearance, 0),
  }
}
