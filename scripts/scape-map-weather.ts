import { shadeAmount, shadowThrow } from '../src/scene/cloud-shadow.ts'
import {
  KEY_FLOOR,
  darkAmount,
  dayAmount,
  keyPlace,
  keyShare,
  moonAmount,
  moonIllumination,
  moonPhase,
  moonPlace,
  sunHeight,
  sunSwing,
} from '../src/scene/daylight.ts'
import { bowLight, bowPeak, bowPlace } from '../src/scene/rainbow.ts'
import { stormLive, stormPeak, stormSchedule, stormSites } from '../src/scene/storm.ts'
import { snowAmount } from '../src/scene/season.ts'
import { capsAmount } from '../src/scene/landscape/water-caps.ts'
import { phosphorAmount, trackAmount } from '../src/scene/landscape/water-gleam.ts'
import { haarAmount } from '../src/scene/haar.ts'
import { showerAmount, wetAmount } from '../src/scene/weather.ts'
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

/**
 * The moon, as a light rather than as a disc.
 *
 * The one instrument this system has, and it needs one badly: every way
 * moonlight goes quiet is a fact about an arc and invisible in a still. A night
 * pose with no moon up photographs exactly like a night pose with the knob at
 * zero, and a run reading the second picture concludes the first is broken.
 *
 * `up` is where the moon actually stands at the hour the config is parked on,
 * `lit` is how much of the disc the month has left, `lights` is the two of them
 * through the twilight gate — and `share` is the finding: how much of the key
 * light the moon has taken, which is how far the shadows have swung off the
 * bearing the sun set on. A `share` of 0 on a dark night is a coast lit by a sun
 * that is under the sea.
 *
 * `track` and `fire` are the same question asked of the *water*, and they are
 * the only reading either half of the night sea has. Both are black rectangles
 * in a capture and both have several ways of being zero, so a run that moved
 * `daylight.moonStrength`, the arcs, `water.moonTrack` or `water.phosphor` and
 * saw nothing has to come here to find out which. They also carry the coupling:
 * a night with a bright track in it is a night with no fire in it, and the two
 * columns sum to less than one at every hour of every month.
 */
export function moonStats (config: ScapeConfig): MapStats['moon'] {
  const { latitude, axialTilt, time, moonStrength } = config.daylight
  const year                                        = config.season.time
  const phase                                       = moonPhase(year)
  const place                                       = moonPlace(time, year, latitude, axialTilt)
  const sun                                         = sunHeight(time, year, latitude, axialTilt)
  const lights                                      = moonAmount(place.height, phase, darkAmount(sun))

  const lunar = lights * moonStrength

  return {
    phase:  round(phase, 3),
    lit:    round(moonIllumination(phase), 2),
    up:     round(elevation(place.height)),
    lights: round(lights, 3),
    share:  round(keyShare(dayAmount(sun), lunar), 2),
    track:  round(trackAmount(dayAmount(sun), lunar, config.water.moonTrack), 2),
    fire:   round(phosphorAmount(darkAmount(sun), lunar, config.water.phosphor), 2),
  }
}

/** Degrees per radian, for a bearing a person is meant to read. */
const COMPASS = 180 / Math.PI

/**
 * The shadow the deck lays on the archipelago, and the three ways it goes out.
 *
 * Here because every one of those ways is the same picture. A frame with no
 * dapple on it is a frame with a clear sky, or a frame at an hour with no light
 * to block, or a frame whose authored darkness is at zero — and a still cannot
 * tell you which. `shade` is the product the shader actually receives, so a
 * zero there with `cover` and `light` both up is the authored switch and
 * nothing else.
 *
 * `reach` is the finding the projection exists to produce: how far downsun of
 * the cloud the shadow lands, in metres, which at this latitude is most of a
 * home island. The key direction is built here rather than sampled, because a
 * `DaylightState` carries a `Vector3` and this file draws with nothing but bun
 * — and it does not need to be normalised, because {@link shadowThrow} reads
 * only the ratio.
 */
export function shadeStats (config: ScapeConfig): MapStats['shade'] {
  const { latitude, axialTilt, time, moonStrength, azimuth } = config.daylight
  const { cloudShadow, cloudCover, cloudHeight }             = config.atmosphere
  const year                                                 = config.season.time
  const sun                                                  = sunHeight(time, year, latitude, axialTilt)
  const place                                                = moonPlace(time, year, latitude, axialTilt)
  const day                                                  = dayAmount(sun)
  const lunar                                                = moonAmount(place.height, moonPhase(year), darkAmount(sun)) *
    moonStrength

  const key     = keyPlace(
    { height: sun, swing: sunSwing(time, year, latitude, axialTilt) },
    place,
    keyShare(day, lunar),
  )
  const bearing = azimuth / COMPASS + key.swing
  const flat    = Math.sqrt(Math.max(0, 1 - key.height * key.height))
  const at      = shadowThrow(
    Math.sin(bearing) * flat,
    Math.max(key.height, KEY_FLOOR),
    Math.cos(bearing) * flat,
    cloudHeight,
  )

  return {
    shade:   round(shadeAmount(cloudShadow, cloudCover, day, lunar), 3),
    dark:    round(cloudShadow, 2),
    cover:   round(cloudCover, 2),
    light:   round(Math.min(1, day + lunar), 3),
    reach:   round(Math.hypot(at.x, at.z)),
    bearing: round((Math.atan2(at.x, at.z) * COMPASS % 360 + 360) % 360),
  }
}

/**
 * The white out in the sound, at the three winds that decide whether it is
 * there.
 *
 * Here because every single way this system goes quiet is invisible in a
 * capture, and for once that is not about the subject being small — the sound
 * is the largest thing in most frames of this scape. It is about the
 * instrument: `STILL` zeroes `wind.strength`, so every still ever taken of this
 * archipelago was taken in a dead calm, and the only coverage a capture can
 * report is `still` below. The other two columns are the half of the effect a
 * picture cannot reach without a pose that names a wind.
 *
 * `rest` against `gust` is the finding, and the failure it catches has no other
 * symptom: if `whitecapOnset` is set at or under the authored `wind.strength`,
 * the sound is already saturated when nothing is gusting, the front crosses
 * water that cannot answer it, and every frame of every capture still looks
 * entirely correct.
 */
export function capsStats (config: ScapeConfig): MapStats['caps'] {
  const { whitecap, whitecapOnset, whitecapLee } = config.water
  const { strength, gust }                       = config.wind

  return {
    still: round(capsAmount(whitecap, whitecapOnset, 0), 3),
    rest:  round(capsAmount(whitecap, whitecapOnset, strength), 3),
    gust:  round(capsAmount(whitecap, whitecapOnset, strength * (1 + gust)), 3),
    onset: round(whitecapOnset, 2),
    wind:  round(strength, 2),
    lee:   round(whitecapLee, 2),
  }
}

/**
 * The night bank, and the two silences it has.
 *
 * Neither is a silence a picture can break. The first is the whitecaps' —
 * `STILL` zeroes `wind.strength`, so every still this scape takes is taken in a
 * dead calm and `still` is the only column a frame can report; whether the
 * authored wind leaves anything at all is `rest`, and whether a front sweeps it
 * away twice a cycle is `gust`. Set `haar.scour` at or under the authored wind
 * and the bank exists only in captures, which is a system nobody watching the
 * scape ever sees and every picture of it looks entirely correct.
 *
 * The second is the tour's. The bank is a thing of the dark and four of the six
 * tour poses are taken in daylight, so the wind columns are read at midwinter
 * midnight — the condition the bank is *for* — rather than at whatever hour the
 * config happens to be parked on. `now` is the parked hour and is allowed to be
 * zero, and the gap between it and `still` is the difference between "there is
 * no bank" and "there is no night".
 *
 * `drowned` is the structural reading and the one that catches a top set too
 * high: it is the share of the home island's *land* lying under it, measured
 * off the height field, and it answers at noon in midsummer exactly as it does
 * at midnight in January because relief has no clock.
 */
type HomeType = { drowned: number }

export function haarStats (
  config: ScapeConfig,
  home: HomeType,
  landmasses: { peak: { height: number }}[],
): MapStats['haar'] {
  const { haar, terrain, wind }       = config
  const { latitude, axialTilt, time } = config.daylight
  const year                          = config.season.time
  const parked                        = sunHeight(time, year, latitude, axialTilt)
  const wet                           = wetAmount(config.weather.time)

  // Midwinter, and the hour the sun is furthest under it. At latitude 68 that
  // is a polar night, so the terms are the same at any hour of the week — the
  // pair is named anyway, because the latitude is a slider and a scape moved
  // south has a midnight that is genuinely darker than its afternoon.
  const deep = sunHeight(0, 0, latitude, axialTilt)
  const gust = wind.strength * (1 + wind.gust)

  const at = (sun: number, strength: number): number =>
    haarAmount(haar, dayAmount(sun), strength, wet)

  const ceiling = terrain.waterLevel + haar.top
  const clear   = landmasses.filter(landmass => landmass.peak.height > ceiling).length

  return {
    top:      round(haar.top, 2),
    ceiling:  round(ceiling, 2),
    depth:    round(haar.depth, 2),
    floor:    round(Math.max(terrain.waterLevel + 0.25, ceiling - haar.depth), 2),
    now:      round(at(parked, wind.strength), 3),
    still:    round(at(deep, 0), 3),
    rest:     round(at(deep, wind.strength), 3),
    gust:     round(at(deep, gust), 3),
    scour:    round(haar.scour, 2),
    wind:     round(wind.strength, 2),
    drowned:  round(home.drowned),
    standing: clear,
    islands:  landmasses.length,
  }
}
