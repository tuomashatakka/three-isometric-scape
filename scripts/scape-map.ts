import { SCAPE_CONFIG } from '../src/scene/config.ts'
import { distanceToTrack } from '../src/scene/landscape/layout.ts'
import { pathLength } from '../src/scene/landscape/path.ts'
import { STEADING_BUILDINGS } from '../src/scene/landscape/steading.ts'
import { surveyScape } from '../src/scene/landscape/survey.ts'
import type { ScapeSurvey } from '../src/scene/landscape/survey.ts'
import type { ScapeConfig } from '../src/scene/config.ts'
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
  ', footpath  ≡ track  s beck  F/B/A/W/S steading  o well  J jetty  H harbour  p plot  ^ ridge'

export interface Layers {
  height:    boolean
  creek:     boolean
  paths:     boolean
  track:     boolean
  buildings: boolean
}

export const ALL_LAYERS: Layers = {
  height:    true,
  creek:     true,
  paths:     true,
  track:     true,
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

export interface MapStats {
  seed:       number
  size:       number
  waterLevel: number
  grid:       { w: number, h: number, metres: number, metresZ: number }
  land:       number
  snowbound:  number
  peak:       { height: number, x: number, z: number }
  landRadius: number
  yard:       { x: number, z: number, radius: number }
  track:      { points: number, length: number }
  footpaths:  { routes: number, length: number, longest: number }
  creek:      { head: [ number, number, number ], mouth: [ number, number, number ], length: number } | null
  pasture:    { x: number, z: number, radius: number } | null
  plots:      number
  ridges:     number
  isles:      { total: number, surfacing: number }
  steading:   Record<string, [ number, number ]>
  landing:    [ number, number ] | null
  harbour:    [ number, number ] | null
}

const round = (value: number, places = 1): number => Number(value.toFixed(places))

/**
 * Everything the grid cannot say.
 *
 * The picture is for a person; this is for the run. A creek that failed to
 * trace, an island that drowned, a pasture that never found room — each one is
 * a single field here and none of them are legible in eighty columns of ascii.
 */
export function surveyStats (
  config:  ScapeConfig,
  survey:  ScapeSurvey,
  window:  Window,
  w:       number,
  h:       number,
): MapStats {
  const { layout, field, places, landing, harbour, paths } = survey
  const { waterLevel }                                     = config.terrain
  const half                                               = window.size * 0.5
  const cell                                               = window.size / w

  let land      = 0
  let snowbound = 0
  let peak      = { height: -Infinity, x: 0, z: 0 }

  for (let row = 0; row < h; row += 1)
    for (let col = 0; col < w; col += 1) {
      const x      = window.x - half + (col + 0.5) * cell
      const z      = window.z - half + (row + 0.5) * (window.size / h)
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

  return {
    seed:       config.seed,
    size:       config.terrain.size,
    waterLevel,
    grid:       { w, h, metres: round(cell, 2), metresZ: round(window.size / h, 2) },
    land:       round(100 * land / (w * h)),
    snowbound:  land ? round(100 * snowbound / land) : 0,
    peak:       { height: round(peak.height, 2), x: Math.round(peak.x), z: Math.round(peak.z) },
    landRadius: round(layout.landRadius),
    yard:       { x: round(layout.yard.x), z: round(layout.yard.z), radius: round(layout.yard.radius) },
    track:      { points: layout.track.points.length, length: round(pathLength(layout.track.points)) },

    footpaths: {
      routes:  paths.paths.length,
      length:  round(lengths.reduce((sum, one) => sum + one, 0)),
      longest: round(Math.max(0, ...lengths)),
    },

    // Head and mouth carry their own ground height, because a single "fall"
    // figure measured between them is a lie: the mouth is dredged below the
    // waterline and sits on a seabed that is nine metres further down again, so
    // the drop it reports is mostly bathymetry the beck never ran over.
    creek: layout.creek && {
      head: [
        Math.round(layout.creek.head.x),
        Math.round(layout.creek.head.z),
        round(field.heightAt(layout.creek.head.x, layout.creek.head.z), 2),
      ],
      mouth: [
        Math.round(layout.creek.mouth.x),
        Math.round(layout.creek.mouth.z),
        round(field.heightAt(layout.creek.mouth.x, layout.creek.mouth.z), 2),
      ],
      length: round(layout.creek.length),
    },

    pasture: layout.pasture && {
      x:      round(layout.pasture.x),
      z:      round(layout.pasture.z),
      radius: round(layout.pasture.radius),
    },

    plots:  layout.plots.length,
    ridges: layout.ridges.length,

    isles: {
      total:     config.terrain.isles.length,
      surfacing: config.terrain.isles.filter(isle => {
        const scale = config.terrain.size * 0.5
        return field.heightAt(isle.x * scale, isle.z * scale) > waterLevel
      }).length,
    },

    steading: Object.fromEntries(
      Object.entries(places).map(([ name, spot ]) => [ name, [ Math.round(spot.x), Math.round(spot.z) ]]),
    ),

    landing: landing && [ Math.round(landing.x), Math.round(landing.z) ],
    harbour: harbour && [ Math.round(harbour.x), Math.round(harbour.z) ],
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
  config: ScapeConfig,
  survey: ScapeSurvey,
  window: Window,
  w:      number,
  h:      number,
  layers: Layers,
): string {
  const { layout, field, places, landing, harbour, paths } = survey
  const { waterLevel, height: amplitude, seabedDrop }      = config.terrain
  const half                                               = window.size * 0.5
  const cellX                                              = window.size / w
  const cellZ                                              = window.size / h

  const at = (x: number, z: number): [ number, number ] => [
    Math.floor((x - window.x + half) / cellX),
    Math.floor((z - window.z + half) / cellZ),
  ]

  const grid = Array.from({ length: h }, (_row, row) =>
    Array.from({ length: w }, (_col, col) => {
      const x = window.x - half + (col + 0.5) * cellX
      const z = window.z - half + (row + 0.5) * cellZ

      if (!layers.height)
        return ' '

      const ground = glyphFor(field.heightAt(x, z), waterLevel, amplitude, seabedDrop)

      if (layers.creek && layout.creek && layout.creek.claimAt(x, z) > 0.35)
        return 's'

      if (layers.paths && paths.wearAt(x, z) > 0.25)
        return ','

      // At the default grid one character is over two metres of ground, which
      // is wider than the cart track itself — testing the true half-width would
      // sample the road only where a cell centre happened to land on it, and
      // draw a dotted line through a continuous thing.
      if (layers.track && distanceToTrack(layout, x, z) < Math.max(layout.track.width * 0.5, cellX * 0.5))
        return '≡'

      return ground
    }))

  function stamp (x: number, z: number, glyph: string): void {
    const [ col, row ] = at(x, z)

    if (row >= 0 && row < h && col >= 0 && col < w)
      grid[row][col] = glyph
  }

  if (layers.buildings) {
    for (const ridge of layout.ridges)
      stamp(ridge.x, ridge.z, '^')

    for (const plot of layout.plots)
      stamp(plot.x, plot.z, 'p')

    for (const name of STEADING_BUILDINGS)
      stamp(places[name].x, places[name].z, name[0].toUpperCase())

    stamp(places.well.x, places.well.z, 'o')

    if (landing)
      stamp(landing.x, landing.z, 'J')

    if (harbour)
      stamp(harbour.x, harbour.z, 'H')
  }

  return grid.map(row => row.join('')).join('\n')
}

/** The stats block, as the run reads it. */
export function formatStats (stats: MapStats): string {
  const steading = Object.entries(stats.steading)
    .filter(([ name ]) => (STEADING_BUILDINGS as readonly string[]).includes(name))
    .map(([ name, [ x, z ]]) => `${name}(${x},${z})`)
    .join(' ')

  const lines = [
    `land ${stats.land}%  above snowline ${stats.snowbound}%  ` +
      `peak ${stats.peak.height}m @ (${stats.peak.x}, ${stats.peak.z})`,
    `yard (${stats.yard.x},${stats.yard.z}) r${stats.yard.radius}    ` +
      `track ${stats.track.points}pts ${stats.track.length}m    landRadius ${stats.landRadius}`,
    `footpaths ${stats.footpaths.routes} routes, ${stats.footpaths.length}m total, ` +
      `longest ${stats.footpaths.longest}m`,
    stats.creek
      ? `creek OK  head (${stats.creek.head[0]},${stats.creek.head[1]}) ${stats.creek.head[2]}m ` +
        `-> mouth (${stats.creek.mouth[0]},${stats.creek.mouth[1]}) ${stats.creek.mouth[2]}m  ` +
        `len ${stats.creek.length}m`
      : 'creek NONE  <- no ridge fed one',
    (stats.pasture
      ? `pasture (${stats.pasture.x},${stats.pasture.z}) r${stats.pasture.radius}`
      : 'pasture NONE') +
      `   plots ${stats.plots}   ridges ${stats.ridges}   ` +
      `isles ${stats.isles.surfacing}/${stats.isles.total} surfacing`,
    `steading  ${steading}`,
    `landing ${stats.landing ? `(${stats.landing})` : 'NONE'}  ` +
      `harbour ${stats.harbour ? `(${stats.harbour})` : 'NONE'}`,
  ]

  return lines.join('\n')
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
    buildings: wanted.has('buildings'),
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
      '  --layers height,paths,track,creek,buildings',
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
  const window: Window = cropped?.length === 3
    ? { x: cropped[0], z: cropped[1], size: cropped[2] }
    : { x: 0, z: 0, size: config.terrain.size }

  const survey = surveyScape(config)
  const stats  = surveyStats(config, survey, window, w, h)

  if (args.has('json')) {
    console.log(JSON.stringify(stats, null, 2))
    return
  }

  const head = `seed ${stats.seed}  size ${stats.size}m  water ${stats.waterLevel}m  ` +
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
