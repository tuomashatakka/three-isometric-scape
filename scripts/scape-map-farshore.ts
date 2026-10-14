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
