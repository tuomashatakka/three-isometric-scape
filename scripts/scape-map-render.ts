import type { ScapeConfig } from '../src/scene/config.ts'
import type { ArchipelagoSurvey, LandmassSurvey } from '../src/scene/landscape/archipelago.ts'
import type { HeadDyke } from '../src/scene/landscape/dyke.ts'
import { distanceToTrack } from '../src/scene/landscape/layout.ts'
import { createPathQuery } from '../src/scene/landscape/path.ts'
import { pierHead } from '../src/scene/landscape/pier.ts'
import { STEADING_BUILDINGS } from '../src/scene/landscape/steading.ts'
import { sampleWaterway } from '../src/scene/landscape/waterway.ts'


/**
 * The picture half of `scape:map`.
 *
 * Split off `scape-map.ts` when that file went past the 666-line ceiling for the
 * third time, and the seam is the one the tool has always had in it: the
 * instrument prints *a picture and a block of numbers*, and until now the two
 * shared a file only because they share a survey. Nothing here reads a stat and
 * nothing in `scape-map.ts`'s survey reads a glyph — the numbers already live in
 * `scape-map-landforms.ts`, `-sites.ts`, `-weather.ts` and `-format.ts`, and this
 * is the other half of that arrangement finally taking its own file.
 */

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
  ', footpath  ≡ track  · waterway  b boat  s beck  ≈ tarn  T peat  ' +
  'F/B/A/W/S steading  o well  J jetty  H harbour  V smokehouse  P pier  ' +
  'W mill  K chapel  L light  C croft  Y shieling  p plot  ^ ridge  x dyke  g gate'

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

/**
 * The wall round the hill, as stone and gates.
 *
 * Its own function rather than four lines inside `renderGrid`, because that one
 * is at the lint config's complexity ceiling and this is the second thing the
 * grid draws that is a line rather than a point — the same seam the `sited`
 * table was cut on, and for the same reason.
 */
function stampDyke (
  dyke:   HeadDyke | null,
  stamp:  (x: number, z: number, glyph: string) => void,
  worldX: (x: number) => number,
  worldZ: (z: number) => number,
): void {
  if (!dyke)
    return

  for (const run of dyke.runs)
    for (const station of run)
      stamp(worldX(station.x), worldZ(station.z), 'x')

  for (const gate of dyke.gates)
    stamp(worldX(gate.x), worldZ(gate.z), 'g')
}

/**
 * Draw the grid.
 *
 * Overlays are stamped in ascending order of how much a reader needs to see
 * them: ground, then the beck, then what people wear into it, then what was
 * laid down, then the things that stand on it. A building is never hidden by a
 * path, because a path that ran under a barn would be the bug worth seeing.
 */
/** Anything the grid stamps by position alone. */
interface MapPoint {
  x: number
  z: number
}

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

  /**
   * Running water and standing water, on one layer.
   *
   * Split out of {@link overlayAt} to keep that function under the complexity
   * ceiling, and it splits cleanly: both are the scape's own tests asked at a
   * cell centre — the channel's claim, and whether the ground here is under a
   * pool's surface.
   */
  function waterAt (
    x:        number,
    z:        number,
    landmass: LandmassSurvey | null,
    localX:   number,
    localZ:   number,
  ): string | null {
    const creek = landmass?.survey.layout.creek

    if (creek && creek.claimAt(localX, localZ) > 0.35)
      return 's'

    // At the default world grid a pool is a character or two — which is the
    // right size for it, and enough to notice when it is gone.
    const tarn = landmass?.survey.tarn

    if (tarn && field.heightAt(x, z) < tarn.level && tarn.claimAt(localX, localZ) > 0)
      return '≈'

    // Not water, and in here anyway: the cutting is the third thing on the moor
    // that is a *claim* rather than a height, and a third branch inline in
    // `overlayAt` is what the split above exists to avoid. At the default world
    // grid a working is a character, which is the right size for it and enough
    // to notice when it has gone.
    const peat = landmass?.survey.peat

    if (peat && peat.claimAt(localX, localZ) > 0.35)
      return 'T'

    return null
  }

  function overlayAt (
    x:        number,
    z:        number,
    landmass: LandmassSurvey | null,
    localX:   number,
    localZ:   number,
  ): string | null {
    const water = layers.creek ? waterAt(x, z, landmass, localX, localZ) : null

    if (water)
      return water

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
      const { layout, places, landing, harbour, beacon, croft, dyke, pier } = landmass.survey
      const { shieling, smokehouse }                                        = landmass.survey
      const worldX                                                          = (x: number): number => x + landmass.origin.x
      const worldZ                                                          = (z: number): number => z + landmass.origin.z

      // First of everything on this island, so a byre or a plot marker laid over
      // it wins the cell. The dyke is the one thing here that is a *line* rather
      // than a point, and a line that overwrote the things it runs between would
      // hide the very collision it is worth reading the grid for.
      stampDyke(dyke, stamp, worldX, worldZ)

      for (const ridge of layout.ridges)
        stamp(worldX(ridge.x), worldZ(ridge.z), '^')

      for (const plot of layout.plots)
        stamp(worldX(plot.x), worldZ(plot.z), 'p')

      for (const name of STEADING_BUILDINGS)
        stamp(worldX(places[name].x), worldZ(places[name].z), name[0].toUpperCase())

      stamp(worldX(places.well.x), worldZ(places.well.z), 'o')

      // Every place the survey is allowed to come back with nothing for, as a
      // table rather than as seven guards. The croft is the seventh, and seven
      // `if`s in a row is what took this function past the complexity ceiling —
      // which the lint config is right about: the branches were never the
      // interesting part, the glyphs are.
      const sited: [ MapPoint | null, string ][] = [
        [ layout.mill, 'W' ],
        [ layout.chapel, 'K' ],
        [ smokehouse, 'V' ],
        [ shieling, 'Y' ],
        [ beacon, 'L' ],
        [ croft, 'C' ],
        [ landing, 'J' ],
        [ harbour, 'H' ],
        // The *head*, not the root. The root sits a couple of metres along the
        // bank from the harbour's own glyph and would only ever overwrite it;
        // the head is the thing worth finding on the grid, because it is the one
        // point in the settlement that is out over deep water.
        [ pier && pierHead(pier), 'P' ],
      ]

      for (const [ place, glyph ] of sited)
        if (place)
          stamp(worldX(place.x), worldZ(place.z), glyph)
    }

  if (layers.boats)
    for (const offset of waterways.boatOffsets) {
      const boat = sampleWaterway(waterways.route, offset, { x: 0, z: 0, angle: 0 })
      stamp(boat.x, boat.z, 'b')
    }

  return grid.map(row => row.join('')).join('\n')
}

export function readLayers (raw: string | undefined): Layers {
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
