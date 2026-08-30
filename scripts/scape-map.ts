import { Color } from 'three'
import { SCAPE_CONFIG } from '../src/scene/config.ts'
import { surveyArchipelago } from '../src/scene/landscape/archipelago.ts'
import type { ArchipelagoSurvey, LandmassSurvey } from '../src/scene/landscape/archipelago.ts'
import { scheduledFleetMinimumSeparation } from '../src/scene/landscape/boat-motion.ts'
import { beckGeometry } from '../src/scene/landscape/beck.ts'
import type { Creek } from '../src/scene/landscape/creek.ts'
import type { HeightField } from '../src/scene/landscape/height.ts'
import { planColonies } from '../src/scene/landscape/colony.ts'
import { planGrazing } from '../src/scene/landscape/grazing.ts'
import { surveyHearths } from '../src/scene/landscape/hearths.ts'
import { surveyWindows } from '../src/scene/landscape/windows.ts'
import { distanceToTrack } from '../src/scene/landscape/layout.ts'
import { createPathQuery, pathLength } from '../src/scene/landscape/path.ts'
import { STEADING_BUILDINGS } from '../src/scene/landscape/steading.ts'
import { sampleWaterway } from '../src/scene/landscape/waterway.ts'
import type { ScapeConfig } from '../src/scene/config.ts'
import { formatStats } from './scape-map-format.ts'
import { applyOverrides, parseArgs } from './args.ts'


/**
 * The height ramp, shallowest first.
 *
 * Eight glyphs and no more. A longer ramp reads as noise at this cell size —
 * one terminal character is two metres of ground, which is coarser than the
 * fBm's finest octave, so the extra levels would only ever be aliasing.
 */
export const WATER_RAMP = [ '~', '-' ] as const
export const LAND_RAMP  = [ '.', ':', '=', '+', '*', '#' ] as const

/** Fractions of the terrain amplitude each land glyph gives way at. */
const LAND_BANDS = [ 0.06, 0.18, 0.34, 0.52, 0.72 ]

/** Fraction of the seabed drop below which water still reads as shallow. */
const SHALLOW = 0.45

export const LEGEND =
  '~ deep  - shallow  . shore  : low  = mid  + upper  * high  # peak\n' +
  ', footpath  ≡ track  · waterway  b boat  s beck  ' +
  'F/B/A/W/S steading  o well  J jetty  H harbour  p plot  ^ ridge'

export interface Layers {
  height:    boolean
  creek:     boolean
  paths:     boolean
  track:     boolean
  waterways: boolean
  boats:     boolean
  buildings: boolean
}

export const ALL_LAYERS: Layers = {
  height:    true,
  creek:     true,
  paths:     true,
  track:     true,
  waterways: true,
  boats:     true,
  buildings: true,
}

/** The square of world the grid covers, in metres. */
export interface Window {
  x:    number
  z:    number
  size: number
}

/**
 * Pick a glyph for one height, relative to the waterline.
 *
 * Pure and exported for the test — the ramp is the one piece of this tool whose
 * output every other reading depends on, so it is worth pinning byte for byte.
 */
export function glyphFor (
  height:     number,
  waterLevel: number,
  amplitude:  number,
  seabedDrop: number,
): string {
  if (height <= waterLevel) {
    const depth = (waterLevel - height) / Math.max(seabedDrop, 0.001)
    return depth > SHALLOW ? WATER_RAMP[0] : WATER_RAMP[1]
  }

  const above = (height - waterLevel) / Math.max(amplitude, 0.001)
  let band    = 0

  while (band < LAND_BANDS.length && above >= LAND_BANDS[band])
    band += 1

  return LAND_RAMP[band]
}

interface CompositionStats {
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
  beck:     { wetted: number, fall: number } | null
  pasture:  { x: number, z: number, radius: number } | null
  mill:     { x: number, z: number, prominence: number } | null
  chapel:   { x: number, z: number, prominence: number, fromYard: number } | null
  beacon:   { x: number, z: number, freeboard: number, reach: number, isle: number } | null
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
    beacon: survey.beacon && {
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

/**
 * Draw the grid.
 *
 * Overlays are stamped in ascending order of how much a reader needs to see
 * them: ground, then the beck, then what people wear into it, then what was
 * laid down, then the things that stand on it. A building is never hidden by a
 * path, because a path that ran under a barn would be the bug worth seeing.
 */
export function renderGrid (
  config:       ScapeConfig,
  archipelago:  ArchipelagoSurvey,
  window:       Window,
  w:            number,
  h:            number,
  layers:       Layers,
): string {
  const { field, paths, waterways }                   = archipelago
  const { waterLevel, height: amplitude, seabedDrop } = config.terrain
  const half                                          = window.size * 0.5
  const cellX                                         = window.size / w
  const cellZ                                         = window.size / h
  const routeReach                                    = Math.max(cellX, cellZ) * 0.48
  const routeAt                                       = createPathQuery(waterways.route.points, routeReach)

  const at = (x: number, z: number): [ number, number ] => [
    Math.floor((x - window.x + half) / cellX),
    Math.floor((z - window.z + half) / cellZ),
  ]

  function overlayAt (
    x:        number,
    z:        number,
    landmass: LandmassSurvey | null,
    localX:   number,
    localZ:   number,
  ): string | null {
    const creek = landmass?.survey.layout.creek

    if (layers.creek && creek && creek.claimAt(localX, localZ) > 0.35)
      return 's'

    if (layers.paths && paths.wearAt(x, z) > 0.25)
      return ','

    // At the default world grid one character spans several metres of ground,
    // is wider than the cart track itself — testing the true half-width would
    // sample the road only where a cell centre happened to land on it, and
    // draw a dotted line through a continuous thing.
    if (
      layers.track &&
      landmass &&
      distanceToTrack(landmass.survey.layout, localX, localZ) <
        Math.max(landmass.survey.layout.track.width * 0.5, cellX * 0.5)
    )
      return '≡'

    if (layers.waterways && routeAt(x, z).distance < routeReach)
      return '·'

    return null
  }

  function glyphAt (x: number, z: number): string {
    const landmass = field.landmassAt(x, z)
    const localX   = landmass ? x - landmass.origin.x : x
    const localZ   = landmass ? z - landmass.origin.z : z
    const overlay  = overlayAt(x, z, landmass, localX, localZ)

    if (overlay)
      return overlay

    if (!layers.height)
      return ' '

    return glyphFor(
      field.heightAt(x, z),
      waterLevel,
      landmass?.config.terrain.height ?? amplitude,
      seabedDrop,
    )
  }

  const grid = Array.from({ length: h }, (_row, row) =>
    Array.from({ length: w }, (_col, col) => {
      const x = window.x - half + (col + 0.5) * cellX
      const z = window.z - half + (row + 0.5) * cellZ

      return glyphAt(x, z)
    }))

  function stamp (x: number, z: number, glyph: string): void {
    const [ col, row ] = at(x, z)

    if (row >= 0 && row < h && col >= 0 && col < w)
      grid[row][col] = glyph
  }

  if (layers.buildings)
    for (const landmass of archipelago.landmasses) {
      const { layout, places, landing, harbour, beacon } = landmass.survey
      const worldX                                       = (x: number): number => x + landmass.origin.x
      const worldZ                                       = (z: number): number => z + landmass.origin.z

      for (const ridge of layout.ridges)
        stamp(worldX(ridge.x), worldZ(ridge.z), '^')

      for (const plot of layout.plots)
        stamp(worldX(plot.x), worldZ(plot.z), 'p')

      for (const name of STEADING_BUILDINGS)
        stamp(worldX(places[name].x), worldZ(places[name].z), name[0].toUpperCase())

      stamp(worldX(places.well.x), worldZ(places.well.z), 'o')

      if (layout.mill)
        stamp(worldX(layout.mill.x), worldZ(layout.mill.z), 'W')

      if (layout.chapel)
        stamp(worldX(layout.chapel.x), worldZ(layout.chapel.z), 'K')

      if (beacon)
        stamp(worldX(beacon.x), worldZ(beacon.z), 'L')

      if (landing)
        stamp(worldX(landing.x), worldZ(landing.z), 'J')

      if (harbour)
        stamp(worldX(harbour.x), worldZ(harbour.z), 'H')
    }

  if (layers.boats)
    for (const offset of waterways.boatOffsets) {
      const boat = sampleWaterway(waterways.route, offset, { x: 0, z: 0, angle: 0 })
      stamp(boat.x, boat.z, 'b')
    }

  return grid.map(row => row.join('')).join('\n')
}

/**
 * The guard, read off the composite field for the same reason the bar is.
 *
 * `lowest` asks the field how high each rock actually stands rather than asking
 * the survey what freeboard it dealt — the two are the same number here and are
 * only the same number for as long as nothing else ever raises the sea.
 */
function skerryStats (survey: ArchipelagoSurvey, config: ScapeConfig): MapStats['skerries'] {
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
 * The bar, walked end to end.
 *
 * Sampling the *composite* field rather than the strand's own profile, and that
 * is the whole point of the check: what a walker meets is the maximum of the bar
 * and whatever patch it is over, which is the thing the rest of the scape
 * actually reads. Asking the strand what it thinks it is would answer a question
 * nobody had.
 */
function strandStats (survey: ArchipelagoSurvey, config: ScapeConfig): MapStats['strand'] {
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

function readLayers (raw: string | undefined): Layers {
  if (!raw)
    return ALL_LAYERS

  const wanted = new Set(raw.split(',').map(name => name.trim()))

  return {
    height:    wanted.has('height'),
    creek:     wanted.has('creek'),
    paths:     wanted.has('paths'),
    track:     wanted.has('track'),
    waterways: wanted.has('waterways'),
    boats:     wanted.has('boats'),
    buildings: wanted.has('buildings') || wanted.has('steading'),
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
