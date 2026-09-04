import { stormLive, stormPeak, stormSchedule, stormSites } from '../src/scene/storm.ts'
import type { ScapeConfig } from '../src/scene/config.ts'
import type { ArchipelagoSurvey } from '../src/scene/landscape/archipelago.ts'
import type { MapStats } from './scape-map.ts'


/**
 * What the map measures about the *weather*, rather than about the ground.
 *
 * Its own file for the reason `scape-map-landforms.ts` is one: `scape-map.ts`
 * is at its 666-line ceiling, and the seam it splits along is the same one the
 * landforms took — a survey of one system, answering one question, with nothing
 * above it that the rest of the block needs.
 */

/** Round to `places`, the way every other number in the block is rounded. */
function round (value: number, places = 1): number {
  const scale = 10 ** places

  return Math.round(value * scale) / scale
}

/**
 * The storm, as the map reads it.
 *
 * The strikes are counted per site rather than only in total, because the
 * failure this catches is one island taking every bolt in the front — which is
 * a hash that stopped spreading, and which no single still would ever show.
 */
export function stormStats (config: ScapeConfig, survey: ArchipelagoSurvey): MapStats['storm'] {
  const sites    = stormSites(config, survey)
  const schedule = stormSchedule(config.seed, sites.length)
  const firing   = schedule.filter(strike => stormLive(strike, config.storm.rate))
  // The same strike the capture harness aims its `storm` poses at, asked for
  // the same way rather than found again here: two searches for one strike is
  // how a stats block ends up describing a frame nobody photographed.
  const peak = stormPeak(config)

  return {
    strikes: firing.length,
    asked:   schedule.length,
    peak:    peak && {
      phase: round(peak.strike.phase, 4),
      id:    sites[peak.strike.site].id,
      x:     Math.round(sites[peak.strike.site].x),
      z:     Math.round(sites[peak.strike.site].z),
      base:  round(sites[peak.strike.site].base, 2),
    },
    sited: sites.map((site, index) => ({
      id:      site.id,
      x:       Math.round(site.x),
      z:       Math.round(site.z),
      base:    round(site.base, 2),
      strikes: firing.filter(strike => strike.site === index).length,
    })),
  }
}
