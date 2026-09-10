import { Color } from 'three'
import { SCAPE_CONFIG } from '../src/scene/config.ts'
import { surveyArchipelago } from '../src/scene/landscape/archipelago.ts'
import type { ArchipelagoSurvey, LandmassSurvey } from '../src/scene/landscape/archipelago.ts'
import { scheduledFleetMinimumSeparation } from '../src/scene/landscape/boat-motion.ts'
import { beckGeometry } from '../src/scene/landscape/beck.ts'
import { planColonies } from '../src/scene/landscape/colony.ts'
import type { Creek } from '../src/scene/landscape/creek.ts'
import type { HeightField } from '../src/scene/landscape/height.ts'
import { planGrazing } from '../src/scene/landscape/grazing.ts'
import { surveyHearths } from '../src/scene/landscape/hearths.ts'
import { surveyWindows } from '../src/scene/landscape/windows.ts'
import { pathLength } from '../src/scene/landscape/path.ts'
import type { ScapeConfig } from '../src/scene/config.ts'
import { formatStats } from './scape-map-format.ts'
import { LEGEND, readLayers, renderGrid } from './scape-map-render.ts'
import type { Window } from './scape-map-render.ts'
import { cragStats, duneStats, fjordStats, forceStats, hauloutStats, icecapStats, kelpStats, skerryStats, strandStats, treelineStats } from './scape-map-landforms.ts'
import type { CragStats, DuneStats, FjordStats, ForceStats, IcecapStats, TreelineStats } from './scape-map-landforms.ts'
import { measureDrift } from '../src/scene/landscape/drift.ts'
import type { DriftSurvey } from '../src/scene/landscape/drift.ts'
import { causewayOf, croftOf, peatOf, pierOf, smokehouseOf, tarnOf } from './scape-map-sites.ts'
import { rainbowStats, stormStats } from './scape-map-weather.ts'
import { applyOverrides, parseArgs } from './args.ts'


export interface CompositionStats {
  seed:       number
  size:       number
  land:       number
  snowbound:  number
  peak:       { height: number, x: number, z: number }
  landRadius: number
  yard:       { x: number, z: number, radius: number }
  track:      { points: number, length: number }
  footpaths:  { routes: number, length: number, longest: number }
  creek:      { head: [ number, number, number ], mouth: [ number, number, number ], length: number } | null

  /**
   * The water standing in that channel — metres of wetted reach and the fall
   * over it.
   *
   * Measured against the height field rather than the drawn chord the scape
   * lays the sheet on, because this instrument has no terrain grid in it. The
   * two agree to within a quad's relief, which is well inside what this line is
   * for: a beck that stopped surfacing reads as `NONE` here, and a course that
   * drowned under a retuned falloff reads as a wetted reach that collapsed.
   */
  beck: { wetted: number, fall: number } | null

  /**
   * The pool up on the high ground: where it stands, how far the water reaches
   * and how level the rim the search chose is.
   *
   * `wetted` is the line worth reading. The sheet is drawn to the full radius
   * and occluded by the bank, so a basin that stopped holding any water at all
   * — a retuned falloff, a shifted yard, a carve that lost its containment —
   * draws exactly as it did and shows up nowhere except here.
   */
  tarn: { x: number, z: number, level: number, wetted: number, spread: number } | null

  /**
   * The turf cutting on the moor: where the face is, how flat the ground under
   * it measured, and how much of the face is actually standing.
   *
   * `standing` is the line worth reading, and it is the tarn's `wetted` in a
   * different substance: the carve is downward-only, so a working sited on
   * ground that already falls away as fast as the cut does draws a rectangle of
   * dark paint with no step in it at all — identical from every pose, and
   * visible nowhere except here.
   */
  peat:    { x: number, z: number, level: number, spread: number, standing: number } | null
  pasture: { x: number, z: number, radius: number } | null
  mill:    { x: number, z: number, prominence: number } | null
  chapel:  { x: number, z: number, prominence: number, fromYard: number } | null

  /**
   * The hut on the bank above the boat harbour, and how far up that bank it is.
   *
   * A structural line rather than a decorative one: `NONE` here on an island
   * that has a harbour means the shore behind it never came up dry enough to
   * keep a fire on, which is exactly the kind of thing a retuned falloff does
   * and a screenshot at the default pose never shows.
   */
  smokehouse: { x: number, z: number, fromBank: number } | null

  /**
   * The trestle out to deep water, at its head.
   *
   * `null` on an island whose harbour bank never reached `pier.berth` inside
   * `pier.reach` — a real answer, and one worth reading. Every other refusal in
   * this block is about dry ground being scarce; this one is about the *bottom*,
   * which nothing else in the stats measures and no still can show.
   */
  pier: {
    x:      number
    z:      number
    length: number
    depth:  number
    deck:   number
    bents:  number
  } | null

  /**
   * The bar out to the nearest rock, and the share of the tide that covers it.
   *
   * `springs` and `neaps` are the reason this is a stats line at all. The
   * crossing is a strip of ground two metres wide seen from two hundred, so a
   * still cannot say whether it is dry ground, a ford or a mole — and those are
   * three different scapes separated by a couple of centimetres of crest.
   */
  causeway: {
    x:        number
    z:        number
    isle:     number
    crossing: number
    crest:    number
    springs:  number
    neaps:    number
  } | null

  beacon:   { x: number, z: number, freeboard: number, reach: number, isle: number } | null
  croft:    { x: number, z: number, freeboard: number, isle: number, fromHarbour: number } | null
  plots:    number
  ridges:   number
  isles:    { total: number, surfacing: number }
  steading: Record<string, [ number, number ]>
  landing:  [ number, number ] | null
  harbour:  [ number, number ] | null
}

export interface LandmassMapStats extends CompositionStats {
  id:      string
  profile: string
  origin:  [ number, number ]
}

export interface MapStats extends CompositionStats {
  waterLevel: number
  worldSize:  number
  grid:       { w: number, h: number, metres: number, metresZ: number }
  landmasses: LandmassMapStats[]
  waterways:  {
    legs:      number
    length:    number
    connected: boolean
    wet:       boolean
    clearance: number
  }
  boats: {
    count:      number
    separation: number
    conflicts:  number
  }

  /**
   * The bar joining two of the islands, or `null` where there is none.
   *
   * The one landform in the scape that cannot be checked from a still. It runs
   * between two patches at the far south of the world, three hundred metres from
   * anything the tour aims at, and its whole claim — *these two islands are one
   * island* — is a fact about the ground rather than about the picture. So the
   * claim is a number: the lowest the crest gets anywhere along the line, which
   * is above the waterline or the bar is not a bar.
   */
  strand: {
    between:   [ string, string ]
    length:    number
    crest:     number
    lowest:    number
    connected: boolean
  } | null

  /**
   * The rocks out in the open water, and the two things that can go wrong.
   *
   * A guard is placed by rejection rather than by construction, so the count is
   * an outcome and not a setting — sixteen chains asked for do not have to be
   * sixteen chains got, and a run that quietly halved the reef would look
   * identical at every pose but the one nobody takes.
   *
   * `lowest` is the claim: a skerry that does not break the surface is a
   * shoal, and a shoal is a ferry hazard nobody can see. `nearest` is the
   * other one — metres from the closest rock to the nearest island patch,
   * which is the clearance the ferry planner is relying on being there.
   */
  skerries: {
    count:   number
    guards:  number
    widest:  number
    lowest:  number
    nearest: number
  }

  /**
   * The drowned valleys and the ice caps, one entry per island that has one.
   *
   * Both live in `scape-map-landforms.ts` beside the walks that measure them —
   * see {@link FjordStats} and {@link IcecapStats} for what each number is and
   * why a picture cannot check it.
   */
  fjords:  FjordStats[]
  icecaps: IcecapStats[]

  /**
   * The blown sand, one entry per island that has a belt on it.
   *
   * Alongside the caps rather than under the composition for the reason they
   * are: a dune belt is measured against the coastline, and the coastline is
   * only knowable by walking it.
   */
  dunes: DuneStats[]

  /**
   * The rock faces, one entry per island whose coast was steep enough for one.
   *
   * Beside the belts because they are the same kind of measurement of the same
   * kind of thing — a landform written against the coastline — and because the
   * two are each other's control: an island should never have both on one
   * bearing, and these two blocks are where that is checkable.
   */
  crags: CragStats[]

  /**
   * The falls, one entry per island whose beck goes over a step.
   *
   * Beside the belts for the reason they are beside the caps, and it is the one
   * block here that no other line can stand in for — see {@link forceStats} for
   * why the beck's own two figures are blind to it.
   */
  forces: ForceStats[]

  /**
   * The wood's edge — the shares of land inside it, at it and above it.
   *
   * The one block in this readout that measures something the scape *removes*
   * as well as something it adds, and it is here because both failures are
   * invisible in a still. See {@link TreelineStats}.
   */
  treeline: TreelineStats

  /**
   * What the wind does with the winter, island by island.
   *
   * A pair of cover shares — the same deep winter with the wind's swing and
   * without it — because the finding is the *difference* and no single share
   * carries one. It is here rather than in a still for the reason the treeline
   * is: at the tour's fifteen-hundred-metre frame an island that has lost the
   * snow off every weather face reads as an island with slightly less snow on
   * it. See {@link DriftSurvey}.
   */
  drift: DriftSurvey[]

  /**
   * The gull colonies, and the birds dealt across them.
   *
   * Here rather than in a screenshot on purpose: a flock is four pixels wide at
   * the default pose, so a harbour that lost its ring is invisible in a still
   * and is one number short here.
   */
  colonies: {
    count: number
    asked: number
    sited: { id: string, kind: string, x: number, z: number, radius: number }[]
  }

  /**
   * The seals on the guard, at both ends of a spring tide.
   *
   * Here rather than in a screenshot for the reason the flocks are, twice over.
   * A seal is two metres long on a rock seventy metres from the nearest island,
   * so at every pose in `tour` it is under a pixel — and the thing that would be
   * worth seeing is not the animal at all but *how many* of them the water has
   * taken, which is a difference between two states of the tide and cannot be in
   * one frame. `rocks` against `offered` is the search: how much of the guard
   * the three rules let through. `low` against `high` is the tide.
   */
  haulout: {
    rocks:   number
    offered: number
    seals:   number
    guards:  number
    low:     number
    high:    number
    lowest:  number
    highest: number
    springs: number
  }

  /**
   * The kelp in the shallows, and the two ends of a spring tide in it.
   *
   * Here rather than in a screenshot for the reason the colony is: a bed is a
   * relation between a plant's length and the water over it, and a still is one
   * state of the tide. `low` and `high` are the mean lean at low and high
   * springs — the same plants, standing up and lying over — and `low === high`
   * is the finding, a bed the sea has stopped mattering to.
   */
  kelp: {
    plants:  number
    offered: number
    beds:    number
    coasts:  number
    islands: number
    afloat:  number
    shallow: number
    deep:    number
    longest: number
    low:     number
    high:    number
  }

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
   * The rough grazing, and the flocks turned out on it.
   *
   * Here for the reason the colonies are, and rather more so: a sheep is a
   * metre long, which is two pixels at the default pose and nothing at all
   * pulled out. Every way this goes wrong is a number in this block and
   * invisible in a still — a farm whose search found no ground at all, a flock
   * sited on a disc that is a third forest, two flocks that collapsed onto the
   * same hillside. `asked` is what the archipelago offered: every farm's full
   * quota, so the gap between it and `count` is the finding.
   */
  grazing: {
    count: number
    asked: number
    cover: number
    sited: { id: string, kind: string, x: number, z: number, radius: number, cover: number }[]
  }

  /**
   * The chimneys, and how far each mouth stands over the ground under it.
   *
   * Here for the reason the colonies are: a plume is a few pixels at the default
   * pose, and a stack that came out at the wrong end of a roof — or inside the
   * hillside a building is cut into — is a single number here and invisible in a
   * still. `lowest` is the whole check: it is the clearance of the worst stack in
   * the archipelago, and anything under about three metres means a mouth has
   * been placed against a floor it does not stand on.
   */
  hearths: {
    count:  number
    lowest: number
  }

  /**
   * Every glazed pane, and the two ways a lamp goes wrong that a still cannot
   * report.
   *
   * `lowest` is the same clearance check the stacks get, from the other end of
   * the building: a pane is inside a room, so anything under about half a metre
   * over the ground means a window has been placed against a floor it does not
   * stand on. `inward` is the sign check — how many panes' outward bearings
   * point back at their own building's middle, which is a glow painted on the
   * inside of the wall it belongs to. From the default pose that is
   * indistinguishable from the lamps simply not working.
   */
  windows: {
    count:  number
    lowest: number
    inward: number
  }
}

const round = (value: number, places = 1): number => Number(value.toFixed(places))

type HearthStats = MapStats['hearths']
type WindowStats = MapStats['windows']

/**
 * Every hearth in the archipelago, and the tightest clearance among them.
 *
 * The stacks are surveyed rather than drawn — see `landscape/hearths.ts` — so
 * this asks the same pure function the scape does and reports what it got.
 */
function hearthStats (survey: ArchipelagoSurvey): HearthStats {
  const stacks = surveyHearths(survey)
  const clear  = stacks.map(stack => stack.y - survey.field.heightAt(stack.x, stack.z))

  return {
    count:  stacks.length,
    lowest: round(clear.length ? Math.min(...clear) : 0, 2),
  }
}

/**
 * Every pane in the archipelago, its tightest clearance, and its sign.
 *
 * Surveyed rather than drawn — see `landscape/windows.ts` — so this asks the
 * same pure function the scape does and reports what it got.
 */
function windowStats (survey: ArchipelagoSurvey): WindowStats {
  const panes = surveyWindows(survey)
  const clear = panes.map(pane => pane.y - survey.field.heightAt(pane.x, pane.z))

  const inward = panes.filter(pane =>
    Math.sin(pane.angle) * (pane.x - pane.centre.x) +
    Math.cos(pane.angle) * (pane.z - pane.centre.z) <= 0)

  return {
    count:  panes.length,
    lowest: round(clear.length ? Math.min(...clear) : 0, 2),
    inward: inward.length,
  }
}

/**
 * The water standing in one island's channel, measured rather than assumed.
 *
 * Built with the same function the scape draws with, so a beck this line calls
 * twenty-four metres long is twenty-four metres of ribbon in the frame — see
 * the note on {@link CompositionStats.beck} for the one difference.
 */
function beckOf (
  config: ScapeConfig,
  creek:  Creek | null,
  field:  HeightField,
): { wetted: number, fall: number } | null {
  if (!creek)
    return null

  const course = beckGeometry({
    ...config.beck,
    creek,
    waterLevel: config.terrain.waterLevel,
    surfaceAt:  field.heightAt,
    bed:        new Color(config.palette.streambed),
    water:      new Color(config.palette.deepWater),
  })

  if (!course)
    return null

  course.geometry.dispose()
  return { wetted: round(course.wetted), fall: round(course.fall, 2) }
}

/**
 * Everything the grid cannot say.
 *
 * The picture is for a person; this is for the run. A creek that failed to
 * trace, an island that drowned, a pasture that never found room — each one is
 * a single field here and none of them are legible in eighty columns of ascii.
 */
function compositionStats (landmass: LandmassSurvey, w: number, h: number): CompositionStats {
  const { config, origin, survey }                         = landmass
  const { layout, field, places, landing, harbour, paths } = survey
  const { waterLevel, size }                               = config.terrain
  const half                                               = size * 0.5

  let land      = 0
  let snowbound = 0
  let peak      = { height: -Infinity, x: 0, z: 0 }

  for (let row = 0; row < h; row += 1)
    for (let col = 0; col < w; col += 1) {
      const x      = -half + (col + 0.5) * size / w
      const z      = -half + (row + 0.5) * size / h
      const height = field.heightAt(x, z)

      if (height > peak.height)
        peak = { height, x, z }

      if (height <= waterLevel)
        continue

      land += 1

      if (height - waterLevel > config.season.snowLine)
        snowbound += 1
    }

  const lengths = paths.paths.map(path => pathLength(path.points))
  const worldX  = (x: number): number => x + origin.x
  const worldZ  = (z: number): number => z + origin.z

  return {
    seed:      config.seed,
    size,
    land:      round(100 * land / (w * h)),
    snowbound: land ? round(100 * snowbound / land) : 0,
    peak:      {
      height: round(peak.height, 2),
      x:      Math.round(worldX(peak.x)),
      z:      Math.round(worldZ(peak.z)),
    },
    landRadius: round(layout.landRadius),
    yard:       {
      x:      round(worldX(layout.yard.x)),
      z:      round(worldZ(layout.yard.z)),
      radius: round(layout.yard.radius),
    },
    track: {
      points: layout.track.points.length,
      length: round(pathLength(layout.track.points)),
    },
    footpaths: {
      routes:  paths.paths.length,
      length:  round(lengths.reduce((sum, one) => sum + one, 0)),
      longest: round(Math.max(0, ...lengths)),
    },

    // Head and mouth carry their own ground height, because a single "fall"
    // figure measured between them is a lie: the mouth is dredged below the
    // waterline and sits on a seabed that is nine metres further down again.
    creek: layout.creek && {
      head: [
        Math.round(worldX(layout.creek.head.x)),
        Math.round(worldZ(layout.creek.head.z)),
        round(field.heightAt(layout.creek.head.x, layout.creek.head.z), 2),
      ],
      mouth: [
        Math.round(worldX(layout.creek.mouth.x)),
        Math.round(worldZ(layout.creek.mouth.z)),
        round(field.heightAt(layout.creek.mouth.x, layout.creek.mouth.z), 2),
      ],
      length: round(layout.creek.length),
    },
    beck:    beckOf(config, layout.creek, field),
    tarn:    tarnOf(survey.tarn, field, worldX, worldZ),
    peat:    peatOf(survey.peat, field, worldX, worldZ),
    pasture: layout.pasture && {
      x:      round(worldX(layout.pasture.x)),
      z:      round(worldZ(layout.pasture.z)),
      radius: round(layout.pasture.radius),
    },
    mill: layout.mill && {
      x:          round(worldX(layout.mill.x)),
      z:          round(worldZ(layout.mill.z)),
      prominence: round(layout.mill.prominence, 2),
    },
    chapel: layout.chapel && {
      x:          round(worldX(layout.chapel.x)),
      z:          round(worldZ(layout.chapel.z)),
      prominence: round(layout.chapel.prominence, 2),
      fromYard:   round(layout.chapel.fromYard),
    },
    smokehouse: smokehouseOf(survey.smokehouse, worldX, worldZ),
    pier:       pierOf(survey.pier, worldX, worldZ),
    causeway:   causewayOf(survey.causeway, config, worldX, worldZ),
    croft:      croftOf(survey.croft, worldX, worldZ),
    beacon:     survey.beacon && {
      x:         round(worldX(survey.beacon.x)),
      z:         round(worldZ(survey.beacon.z)),
      freeboard: round(survey.beacon.freeboard, 2),
      reach:     round(survey.beacon.reach),
      isle:      survey.beacon.isle,
    },
    plots:  layout.plots.length,
    ridges: layout.ridges.length,
    isles:  {
      total:     config.terrain.isles.length,
      surfacing: config.terrain.isles.filter(isle => {
        const scale = size * 0.5
        return field.heightAt(isle.x * scale, isle.z * scale) > waterLevel
      }).length,
    },
    steading: Object.fromEntries(
      Object.entries(places).map(([ name, spot ]) => [
        name,
        [ Math.round(worldX(spot.x)), Math.round(worldZ(spot.z)) ],
      ]),
    ),
    landing: landing && [ Math.round(worldX(landing.x)), Math.round(worldZ(landing.z)) ],
    harbour: harbour && [ Math.round(worldX(harbour.x)), Math.round(worldZ(harbour.z)) ],
  }
}

function waterwaysConnected (survey: ArchipelagoSurvey): boolean {
  const ids = survey.ports.map(port => port.id)
  if (ids.length === 0)
    return false

  const seen  = new Set([ ids[0] ])
  const queue = [ ids[0] ]

  while (queue.length > 0) {
    const from = queue.pop()!

    for (const leg of survey.waterways.route.legs)
      if (leg.from === from && !seen.has(leg.to)) {
        seen.add(leg.to)
        queue.push(leg.to)
      }
  }

  return seen.size === ids.length
}

export function surveyStats (
  config: ScapeConfig,
  survey: ArchipelagoSurvey,
  window: Window,
  w:      number,
  h:      number,
): MapStats {
  const landmasses = survey.landmasses.map(landmass => ({
    id:      landmass.id,
    profile: landmass.profile,
    origin:  [ round(landmass.origin.x), round(landmass.origin.z) ] as [number, number],
    ...compositionStats(landmass, w, h),
  }))
  const home = landmasses.find(landmass => landmass.id === survey.home.id)

  if (!home)
    throw new Error('the map could not find the home landmass')

  const { id: _id, profile: _profile, origin: _origin, ...legacy } = home
  const strand                                                     = strandStats(survey, config)
  const { waterways }                                              = survey
  const colonies                                                   = planColonies(survey, config)
  const flocks                                                     = planGrazing(survey, config)
  const scheduleSeparation                                         = scheduledFleetMinimumSeparation(
    waterways.route,
    waterways.boatOffsets.length,
  )

  return {
    ...legacy,
    seed:       config.seed,
    waterLevel: survey.waterLevel,
    worldSize:  survey.size,
    grid:       {
      w,
      h,
      metres:  round(window.size / w, 2),
      metresZ: round(window.size / h, 2),
    },
    landmasses,
    waterways: {
      legs:      waterways.route.legs.length,
      length:    round(waterways.route.length),
      connected: waterwaysConnected(survey),
      wet:       waterways.minimumClearance + 1e-6 >= config.boats.clearance,
      clearance: round(waterways.minimumClearance, 2),
    },
    boats: {
      count:      waterways.boatOffsets.length,
      separation: round(scheduleSeparation, 2),
      conflicts:  scheduleSeparation + 1e-6 < config.boats.separation ? 1 : 0,
    },
    strand,
    skerries: skerryStats(survey, config),
    haulout:  hauloutStats(survey, config),
    kelp:     kelpStats(survey, config),
    fjords:   fjordStats(survey),
    icecaps:  icecapStats(survey),
    dunes:    duneStats(survey),
    crags:    cragStats(survey),
    forces:   forceStats(survey),
    treeline: treelineStats(survey, config),
    drift:    measureDrift(survey.field, config, survey.landmasses, config.archipelago.worldSize),
    grazing:  {
      count: flocks.length,
      asked: survey.landmasses.length * config.grazing.flocks,

      // The worst disc in the archipelago rather than the mean: a mean cover
      // stays comfortable while one farm's flock stands half in the sea, and
      // the one that is wrong is the one worth printing.
      cover: round(flocks.length ? Math.min(...flocks.map(flock => flock.cover)) : 0, 2),
      sited: flocks.map(flock => ({
        id:     flock.id,
        kind:   flock.kind,
        x:      Math.round(flock.x),
        z:      Math.round(flock.z),
        radius: round(flock.radius),
        cover:  round(flock.cover, 2),
      })),
    },
    storm:    stormStats(config, survey),
    rainbow:  rainbowStats(config),
    hearths:  hearthStats(survey),
    windows:  windowStats(survey),
    colonies: {
      count: colonies.length,

      // What every landmass *offered* — a landing and, where it has one, an
      // outer rock. The gap between this and the count is the finding: a coast
      // that could not fit a ring over open water lost its flock silently.
      asked: survey.landmasses.reduce(
        (sum, landmass) =>
          sum + (landmass.survey.landing ? 1 : 0) + (landmass.survey.beacon ? 1 : 0),
        0,
      ),
      sited: colonies.map(colony => ({
        id:     colony.id,
        kind:   colony.kind,
        x:      Math.round(colony.x),
        z:      Math.round(colony.z),
        radius: round(colony.radius),
      })),
    },
  }
}


function main (): void {
  const args = parseArgs(Bun.argv.slice(2))

  if (args.has('help')) {
    console.log([
      'scape:map — the whole composition, in a terminal, without a browser',
      '',
      '  --w 96 --h 48         grid size (cells are ~2:1, so this keeps the world square)',
      '  --seed 1234           shorthand for --set seed=1234',
      '  --set a.b=1           dotted config override, repeatable',
      '  --window x,z,size     crop to a square of world, in metres',
      '  --layers height,paths,track,creek,waterways,boats,buildings',
      '  --stats               stats block only, no grid',
      '  --json                machine-readable stats',
    ].join('\n'))
    return
  }

  const config = structuredClone(SCAPE_CONFIG) as ScapeConfig
  const seed   = args.str('seed')

  applyOverrides(config, [ ...seed ? [ `seed=${seed}` ] : [], ...args.list('set') ])

  const w       = Math.max(8, Math.round(args.num('w', 96)))
  const h       = Math.max(4, Math.round(args.num('h', 48)))
  const cropped = args.str('window')?.split(',')
    .map(Number)
  const survey         = surveyArchipelago(config)
  const window: Window = cropped?.length === 3
    ? { x: cropped[0], z: cropped[1], size: cropped[2] }
    : { x: 0, z: 0, size: survey.size }

  const stats  = surveyStats(config, survey, window, w, h)

  if (args.has('json')) {
    console.log(JSON.stringify(stats, null, 2))
    return
  }

  const head = `seed ${stats.seed}  world ${stats.worldSize}m  home ${stats.size}m  ` +
    `water ${stats.waterLevel}m  ` +
    `grid ${w}x${h}  ${stats.grid.metres}x${stats.grid.metresZ} m/cell` +
    (cropped?.length === 3 ? `  window (${window.x},${window.z}) ${window.size}m` : '')

  console.log(head)

  if (!args.has('stats')) {
    console.log('')
    console.log(renderGrid(config, survey, window, w, h, readLayers(args.str('layers'))))
    console.log('')
    console.log(LEGEND)
  }

  console.log('')
  console.log(formatStats(stats))
}

if (import.meta.main)
  main()
