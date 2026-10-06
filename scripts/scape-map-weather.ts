import { weatherBankTile, skyRepeats } from '../src/scene/weather-bank.ts'
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
import { swellStats } from '../src/scene/landscape/swell.ts'
import type { SwellStats } from '../src/scene/landscape/swell.ts'
import { phosphorAmount, trackAmount } from '../src/scene/landscape/water-gleam.ts'
import { haarAmount } from '../src/scene/haar.ts'
import { TILE_UNITS } from '../src/scene/mist.ts'
import { shaftAmount, shaftSheetHeights } from '../src/scene/shafts.ts'
import {
  HAIL_CENTRE,
  HAIL_WIDTH,
  hailAmount,
  hailChill,
  showerAmount,
  wetAmount,
} from '../src/scene/weather.ts'
import { hailCellRadius, hailCellTravel } from '../src/scene/hail.ts'
import type { ScapeConfig } from '../src/scene/config.ts'
import type { ArchipelagoSurvey } from '../src/scene/landscape/archipelago.ts'


/**
 * What the map measures about the *weather*, rather than about the ground.
 *
 * Its own file for the reason `scape-map-landforms.ts` is one: `scape-map.ts`
 * is at its 666-line ceiling, and the seam it splits along is the same one the
 * landforms took — a survey of one system, answering one question, with nothing
 * above it that the rest of the block needs.
 */

/**
 * What the map measures about the weather, as a type.
 *
 * Moved out of `scape-map.ts` with the readings themselves when the hail line
 * took that file back past its 666-line ceiling, and the seam is the one it
 * already had: these eight are the whole of what this module computes, and
 * every one of them is here for the same reason — **a still cannot read it.**
 * A strike lasts two thirds of a second in seven minutes, a bow stands only on
 * the edges of a band, the moon is under the sea half the month, the beams and
 * the dapple are the opposite halves of one cover term, the hail is a twentieth
 * of a front, the caps and the bank are both invisible in a dead calm and
 * `STILL` zeroes the wind. `MapStats` extends this, so every reader — the
 * formatter included — goes on asking for `stats.caps` exactly as before.
 */
export interface WeatherStats {

  /**
   * The lightning the front carries, and where it lands.
   *
   * Here for a reason none of the others have: every other system in this block
   * is somewhere in every frame, and a strike is somewhere for two thirds of a
   * second in seven minutes. A still taken at any other instant of the front is
   * a still of a scape with no storm in it, so this is where a run finds out
   * that the comb went empty, that a site drifted into open water, or that the
   * fork stopped standing on ground. `asked` is the whole comb; `strikes` is
   * what the rate lets through.
   */
  storm: {
    strikes: number
    asked:   number

    /** The phase a `storm` pose is aimed at, and the island it is aimed over. */
    peak:  { phase: number, id: string, x: number, z: number, base: number } | null
    sited: { id: string, x: number, z: number, base: number, strikes: number }[]
  }

  /**
   * The bow the shower leaves behind it.
   *
   * Here for the same reason the storm is, and it catches the same class of
   * silence: the arc is only out on the edges of a band, so the phase the
   * config is parked on decides whether a still has one in it at all. `now` is
   * this phase's bow and `best` is the brightest the whole front ever gets —
   * and a `best` of zero is the finding, because it means no instant of any
   * front on this coast has a bow in it. `apex` is how far the top of the inner
   * arc stands over the sea, which goes negative in the middle of a summer day
   * and leaves the outer bow standing on its own.
   */
  rainbow: {
    sun:   number
    apex:  number
    swing: number
    cover: number
    now:   number
    best:  number
    at:    number
  }

  /**
   * The moon, read as a light rather than as a disc.
   *
   * Here for the reason the bow is, and it catches the same class of silence:
   * the moon is a body on an arc, so half of every month it is under the sea at
   * the hour a pose asks for, and a night with no moon up photographs exactly
   * like a night with the light switched off. `share` is how much of the key
   * light it has taken — which is to say how far round the shadows have swung
   * from the bearing the sun set on, and the one number a still cannot give.
   */
  moon: {
    phase:  number
    lit:    number
    up:     number
    lights: number
    share:  number

    /** The specular budget the key light has on the water — the moon track. */
    track: number

    /** How hard the broken water burns tonight — the sea fire. */
    fire: number
  }

  /**
   * The shadow the cloud deck lays on the ground and on the sound.
   *
   * Here because the three ways it goes quiet are the same picture: a clear
   * sky, an hour with no light to block, and the authored darkness at zero all
   * produce a frame with no dapple on it. `shade` is the product the shader is
   * handed, and the three columns behind it say which of them took it there.
   */
  /**
   * The daylight standing in the gaps of that same deck.
   *
   * Here because every way this one goes quiet is a frame that looks like a
   * frame with the section removed, and two of them are the *opposite* of each
   * other: a clear sky has no holes cut in it and an overcast has no holes left
   * in it, and both come out as a sound with no beams over it. A picture can
   * show neither as a cause. `bright` is the product the shader is handed;
   * `broken` is the curve that separates the two silences, and `lean` is the
   * horizontal run of a beam over the height it falls through — the number that
   * says whether a shaft leans across the frame or stands up in it.
   */
  shafts: {
    bright: number

    /** `shafts.strength` — the authored end, and the switch. */
    strength: number

    /** `atmosphere.cloudCover`, and `4c(1-c)`: how broken the sky is. */
    cover:  number
    broken: number

    /** `day`: a beam needs a sun, and takes no moon. */
    light: number

    /** Metres the top of a beam is thrown from the foot of it. */
    lean: number

    /** Metres of air the column is lit through, and the world height of its top. */
    column: number
    top:    number
  }

  shade: {
    shade: number

    /** `atmosphere.cloudShadow` — the authored end, and the switch. */
    dark: number

    /** `atmosphere.cloudCover` — whether there is any cloud up there at all. */
    cover: number

    /** `day + moon`: how much light there is for a cloud to take away. */
    light: number

    /** Metres downsun the shadow lands from the cloud casting it. */
    reach: number

    /** Which way it is thrown, in degrees. */
    bearing: number

    /** `atmosphere.weatherBank` — how hard the weather is banked, 0 is the flat tile. */
    bank: number

    /** Width of the bank tile, in metres. */
    bankTile: number

    /**
     * How many times the cloud tile repeats across the world, and how many times
     * the bank does.
     *
     * The instrument the banking exists for. A still cannot measure a period —
     * the eye reads a lattice long before it can count one — and these two
     * numbers say it outright: sixteen repeats of a hundred-metre tile is
     * wallpaper, and a bank that does not complete one period across the whole
     * archipelago is weather.
     */
    mistRepeats: number
    repeats:     number
    bankRepeats: number
  }

  /**
   * The hail: when it falls, how hard, and how wide the patch of it is.
   *
   * Here because the pulse is five per cent of the front and a capture taken at
   * any other phase is a frame with no stones in it — indistinguishable from
   * the switch being off, from a midwinter that delivers snow instead, and from
   * a camera that is not under the cell. One line separates all four.
   */
  hail: {

    /** `weather.hail` — the switch, and the height of the pulse. */
    strength: number

    /** The fall at the parked phase and week, which is the one a still reports. */
    now: number

    /** The hardest this week's fronts hail, and the hardest any week does. */
    peak: number
    best: number

    /** What the year is doing to it at the parked week, 0..1. */
    chill: number

    /** Share of the front's cycle with stones in it, 0..100. */
    share: number

    /** Where the pulse sits, and how far ahead of the rain's own peak it is. */
    centre: number
    lead:   number
    width:  number

    /** Width of one cell in metres, the world it falls on, and how far it crosses. */
    cell:   number
    world:  number
    travel: number
  }

  /**
   * The shape of the sea itself, which no picture of this scape has ever had in
   * it.
   *
   * Here for the same reason the caps are, doubled: until `water.waveSpeed`
   * existed the only way `STILL` could make a frame reproducible was to zero
   * `water.waveHeight`, so the swell was absent from every capture by
   * construction and the instruments were all a reader had. Three of these are
   * facts about the water — how long, how fast, how sorted — and three are what
   * the ground does to it: the gain in deep water, over the drowned bank's
   * crest, and at the depth the surf starts.
   */
  swell: SwellStats

  /**
   * The whitecaps out in the sound, at the three winds that matter.
   *
   * Here because the capture harness cannot reach two of the three: `STILL`
   * zeroes `wind.strength`, so a still is taken in a dead calm and `still` is
   * the only column a picture can report. `rest` against `gust` is the reading
   * that says whether a gust front is something the water can answer.
   */
  caps: {
    still: number
    rest:  number
    gust:  number
    onset: number
    wind:  number

    /** How much of the white the lee of a coast is spared, 0..1. */
    lee: number
  }

  /**
   * The night fog bank: where its top is, what it covers, and the three winds.
   *
   * Here for two reasons the picture cannot cover. The first is the whitecaps'
   * reason exactly — `STILL` zeroes `wind.strength`, so a capture can only ever
   * report `still`, and whether the authored wind leaves any bank at all is
   * invisible in every frame. The second is the tour's: the bank is a thing of
   * the dark, four of the six tour poses are taken in daylight, and a bank
   * raised until it drowns the archipelago photographs as an unchanged noon.
   *
   * So the wind columns are read at the darkest night of the year rather than
   * at the parked hour. `now` is the parked hour, and it is allowed to be zero.
   */
  haar: {

    /** Metres of the top over mean water, and the world height that puts it at. */
    top:     number
    ceiling: number

    /** Metres of fog under the top, and the world height the lowest sheet lies at. */
    depth: number
    floor: number

    /** The bank as the config is parked: this hour, this week, the authored wind. */
    now: number

    /** The bank at midwinter midnight, at a dead calm, at rest and in the gust. */
    still: number
    rest:  number
    gust:  number

    scour: number
    wind:  number

    /** Share of the home island's land under the top, 0..100. */
    drowned: number

    /** Islands whose peak stands clear of the top, out of all of them. */
    standing: number
    islands:  number
  }
}


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
export function stormStats (config: ScapeConfig, survey: ArchipelagoSurvey): WeatherStats['storm'] {
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
export function rainbowStats (config: ScapeConfig): WeatherStats['rainbow'] {
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
export function moonStats (config: ScapeConfig): WeatherStats['moon'] {
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
export function shadeStats (config: ScapeConfig): WeatherStats['shade'] {
  const { latitude, axialTilt, time, moonStrength, azimuth }              = config.daylight
  const { cloudShadow, cloudCover, cloudHeight, weatherBank, cloudScale } = config.atmosphere
  const bankTile                                                          = weatherBankTile(config.archipelago.worldSize)
  const world                                                             = config.archipelago.worldSize
  const year                                                              = config.season.time
  const sun                                                               = sunHeight(time, year, latitude, axialTilt)
  const place                                                             = moonPlace(time, year, latitude, axialTilt)
  const day                                                               = dayAmount(sun)
  const lunar                                                             = moonAmount(place.height, moonPhase(year), darkAmount(sun)) *
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

    // The period, in the only unit that says whether it can be seen: how many
    // times the tile fits across the world the camera can be pointed at.
    bank:        round(weatherBank, 2),
    bankTile:    round(bankTile),
    mistRepeats: round(skyRepeats(world, TILE_UNITS), 1),
    repeats:     round(skyRepeats(world, cloudScale), 1),
    bankRepeats: round(skyRepeats(world, bankTile), 2),
  }
}

/**
 * The beams standing in the gaps of the deck, at the parked hour.
 *
 * It shares the shadow's arithmetic down to the throw and then parts from it on
 * the one term that matters: the cover. `shadeAmount` multiplies by it and this
 * runs it through `4c(1-c)`, so the two systems reading one cloud map report
 * opposite things about a sky at nine tenths cover — the dapple at its
 * strongest and the beams gone. That divergence is the section's whole claim
 * and it is invisible in a still, because a frame with no beams in it looks
 * exactly like a frame taken before the section existed.
 *
 * `lean` is measured rather than authored: it is the same key-light throw the
 * shadow reports, taken over the part of the column that is lit, so it answers
 * the question a picture at the default pose cannot — whether the stack is
 * standing up in a pillar or laid flat across the sound.
 */
export function shaftStats (config: ScapeConfig): WeatherStats['shafts'] {
  const { latitude, axialTilt, time, azimuth } = config.daylight
  const { cloudCover, cloudHeight }            = config.atmosphere
  const { strength, reach }                    = config.shafts
  const year                                   = config.season.time
  const sun                                    = sunHeight(time, year, latitude, axialTilt)
  const day                                    = dayAmount(sun)
  const swing                                  = sunSwing(time, year, latitude, axialTilt)
  const bearing                                = azimuth / COMPASS + swing
  const height                                 = Math.max(sun, KEY_FLOOR)
  const flat                                   = Math.sqrt(Math.max(0, 1 - height * height))
  const at                                     = shadowThrow(
    Math.sin(bearing) * flat,
    height,
    Math.cos(bearing) * flat,
    cloudHeight,
  )

  const heights = shaftSheetHeights(config.terrain.waterLevel, cloudHeight, reach, 2)
  const column  = heights[1] - heights[0]

  return {
    bright:   round(shaftAmount(strength, cloudCover, day), 3),
    strength: round(strength, 3),
    cover:    round(cloudCover, 2),
    broken:   round(4 * cloudCover * (1 - cloudCover), 3),
    light:    round(day, 3),

    // The run of the top sheet over the foot of the stack: the full ground
    // throw is the run of the deck itself, and the lit column stops short of it.
    lean:   round(Math.hypot(at.x, at.z) * (column / Math.max(cloudHeight, 1e-3)), 1),
    column: round(column, 1),
    top:    round(heights[1], 1),
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
/**
 * The sea state, measured off the config rather than described.
 *
 * A thin wrapper on `swellStats`, which lives beside the shader chunk it is the
 * mirror of. What this adds is the two depths worth probing in *this*
 * archipelago: the crest of the drowned bank, which the readme says the swell
 * trips on, and the depth the surf band starts at.
 */
export function seaStats (config: ScapeConfig): WeatherStats['swell'] {
  const { swellLength, swellSpread, swellShoal, surfDepth } = config.water

  const sea = swellStats(swellLength, swellSpread, swellShoal, config.shoals.crest, surfDepth)

  return {
    length:  round(sea.length, 1),
    period:  round(sea.period, 2),
    speed:   round(sea.speed, 2),
    spread:  round(sea.spread, 3),
    deep:    round(sea.deep, 3),
    crest:   round(sea.crest, 3),
    breaker: round(sea.breaker, 3),
  }
}

export function capsStats (config: ScapeConfig): WeatherStats['caps'] {
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
): WeatherStats['haar'] {
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


/**
 * The hail: when it falls, how much of it there is, and how wide the patch is.
 *
 * Here because **every way this system goes quiet looks the same in a still**,
 * and there are four of them. The pulse is five per cent of the front, so a
 * capture taken at any other phase is a frame with no stones in it — identical
 * to a frame with the switch at zero, identical to a midwinter where the column
 * is cold the whole way down and delivers snow instead, and identical to a
 * frame the cell simply is not standing over. A picture separates none of those
 * and this line separates all four.
 *
 * `now` is the parked instant, which is the one a still can report, and it is
 * allowed to be anything. `peak` is the hardest this week's fronts ever hail
 * and `best` is the hardest any week does — a `best` of zero is the finding,
 * because it means no instant of any front in any season of this scape has a
 * stone in it. `share` is how much of the cycle is hailing, and it is the
 * number that says this is an event rather than a setting.
 *
 * `cell` is the world-sized half, and the pair beside it is the whole argument
 * for having one: the patch is a few hundred metres across in a world of 1 520,
 * so it has an *edge* and `travel` is how far that edge moves over the pulse. A
 * cell as wide as the archipelago is white weather with no edge in any frame.
 */
export function hailStats (config: ScapeConfig): WeatherStats['hail'] {
  const { hail, hailCell, time } = config.weather
  const chill                    = hailChill(snowAmount(config.season.time) * config.season.snow)
  const radius                   = hailCellRadius(config.archipelago.worldSize, hailCell)

  let best    = 0
  let share   = 0
  let peakRun = 0
  let soonest = 0

  for (let step = 0; step < 1_000; step += 1) {
    const phase  = step / 1_000
    const amount = hailAmount(phase)

    if (amount > 0)
      share += 1

    best = Math.max(best, amount * hailChill(snowAmount(phase) * config.season.snow) * hail)

    // Where the rain is hardest, resolved rather than written down: the lead is
    // the claim, and a decimal copied out of `weather.ts` would go stale the
    // moment a run reshaped a band — silently, and in the direction of saying
    // the system works.
    if (showerAmount(phase) > peakRun) {
      peakRun = showerAmount(phase)
      soonest = phase
    }
  }

  return {
    strength: round(hail, 2),
    now:      round(hailAmount(time) * chill * hail, 3),
    peak:     round(hailChill(snowAmount(config.season.time) * config.season.snow) * hail, 3),
    best:     round(best, 3),
    chill:    round(chill, 2),
    share:    round(share / 10, 1),
    lead:     round(soonest - HAIL_CENTRE, 3),
    centre:   round(HAIL_CENTRE, 3),
    width:    round(HAIL_WIDTH * 2, 3),
    cell:     round(radius * 2),
    world:    round(config.archipelago.worldSize),
    travel:   round(hailCellTravel(radius)),
  }
}
