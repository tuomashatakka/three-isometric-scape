import { sunHeight } from '../src/scene/daylight.ts'
import { bowLight, bowPeak, bowPlace } from '../src/scene/rainbow.ts'
import { stormLive, stormPeak, stormSchedule, stormSites } from '../src/scene/storm.ts'
import { snowAmount } from '../src/scene/season.ts'
import { showerAmount } from '../src/scene/weather.ts'
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

/** Degrees of arc from a sine of elevation, which is how the sky is solved. */
function elevation (height: number): number {
  return Math.asin(Math.min(1, Math.max(-1, height))) * 180 / Math.PI
}

/**
 * The bow, as the map reads it.
 *
 * Here for the reason the storm is: the arc is only out for two stretches of
 * each band of a front, so a still taken at any other phase is a still of a
 * scape with no bow in it, and every way this system goes quiet is a number
 * rather than a picture. `best` is the brightest instant of the whole front —
 * `bowPeak` finds the phase, which is also the phase the capture harness aims
 * its `bow` poses at — and `now` is what the phase the config is parked on
 * actually gets. A `best` of zero is a coast whose bow
 * never comes out at all: the sun too high all day, the fall switched off, or
 * a year cold enough that everything that falls is snow.
 *
 * `apex` is the geometry: how far the top of the primary arc stands over the
 * sea, in degrees, which is 42 less the sun's own elevation. Negative is an
 * inner bow that has gone under the horizon and left only the outer one, which
 * is a real sight rather than a fault — and the reason the module gates on 51°.
 */
export function rainbowStats (config: ScapeConfig): MapStats['rainbow'] {
  const { latitude, axialTilt, time } = config.daylight
  const year                          = config.season.time
  const sun                           = sunHeight(time, year, latitude, axialTilt)
  // The live share of the fall that is frozen this week, the way `weather.ts`
  // takes it — `season.snow` alone is the *authored* depth of winter, and
  // reading that as the sleet would put snow in the middle of midsummer and
  // take the bow away all year.
  const sleet = Math.min(1, Math.max(0, snowAmount(year) * config.season.snow))

  const light = (phase: number): number =>
    bowLight(phase, config.weather.rain, sleet, sun, config.rainbow.strength)

  const peak = bowPeak()

  return {
    sun:   round(elevation(sun)),
    apex:  round(42 - elevation(sun)),
    swing: round(bowPlace(time, year, latitude, axialTilt).swing * 180 / Math.PI),
    cover: round(showerAmount(config.weather.time), 2),
    now:   round(light(config.weather.time), 3),
    best:  round(light(peak), 3),
    at:    round(peak, 3),
  }
}
