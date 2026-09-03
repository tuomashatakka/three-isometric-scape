import { STEADING_BUILDINGS } from '../src/scene/landscape/steading.ts'
import type { MapStats } from './scape-map.ts'


/**
 * The stats block, as text.
 *
 * Split off `scape-map.ts` when that file went past the 666-line ceiling, and
 * the seam is the one the file already had: everything above it *measures* the
 * archipelago and everything here *says* what it measured. The per-finding
 * helpers were already collecting on this side of it — `windowLine` and
 * `skerryLine` exist because a finding wants somewhere to explain itself, and
 * there is no reason for that somewhere to be in the same file as the survey.
 */


/**
 * The grazing line, and the finding it carries.
 *
 * Its own function for the reason `windowLine` is: the empty case is a finding
 * rather than a reading. Every farm asks for its full quota of flocks, so a
 * count under `asked` means some farm's search walked every bearing out to its
 * reach and never found a disc of open ground — which is a composition that has
 * grown until there is nowhere left to put an animal, and is invisible in a
 * still because the thing it is about is the thing that is not there.
 */
function grazingLine (grazing: MapStats['grazing']): string {
  const head = `grazing ${grazing.count}/${grazing.asked} flocks  `

  if (grazing.sited.length === 0)
    return `${head}<- no farm found open ground to turn stock out on`

  const sited = grazing.sited
    .map(flock => `${flock.id}/${flock.kind} (${flock.x},${flock.z}) r${flock.radius}`)
    .join('  ')

  return `${head}thinnest cover ${grazing.cover}  ${sited}`
}

/**
 * The lamplight line, and the two findings it can carry.
 *
 * Its own function rather than another pair of ternaries inside `formatStats`,
 * which the lint config was right to stop: both of these are *findings* rather
 * than readings, and a finding wants somewhere to explain itself.
 */
function windowLine (windows: MapStats['windows']): string {
  const facing = `facing out ${windows.count - windows.inward}/${windows.count}`

  // A pane is inside a room, so half a metre of clearance is already generous;
  // under it means a window has been placed against a floor it does not stand
  // on, the way a chimney can be.
  const sunk = windows.lowest < 0.5 ? '  <- a pane is set into the hillside' : ''

  // The sign check. A glow on the inside face of its own wall is hidden by the
  // building, which from the default pose is indistinguishable from no lamps.
  const back = windows.inward > 0 ? '  <- a lamp is lit on the inside of its own wall' : ''

  return `windows ${windows.count}  lowest pane ${windows.lowest}m over the ground  ${facing}${sunk}${back}`
}

/**
 * The guard's line.
 *
 * Its own function rather than a third branch inside `formatStats`, which the
 * lint config's complexity ceiling is right about: that list is fifteen lines of
 * report and every one of them that grows a conditional makes the other fourteen
 * harder to read past.
 */
function skerryLine (skerries: MapStats['skerries']): string {
  if (!skerries.count)
    return 'skerries NONE  <- the crest is zero, or no chain found open water'

  return `skerries ${skerries.count} in ${skerries.guards} guards  ` +
    `widest ${skerries.widest}m  ` +
    `lowest ${skerries.lowest}m over the water  ` +
    `nearest island ${skerries.nearest}m` +
    (skerries.lowest <= 0 ? '  <- a rock is a shoal' : '')
}

/**
 * The channel and the water in it, as two lines.
 *
 * Their own function for the reason `windowLine` and `skerryLine` have one: a
 * course that failed to trace and a channel with nothing standing in it are
 * both *findings*, and two more ternaries inline is what took `formatStats`
 * past the complexity ceiling.
 */
function waterLines (stats: MapStats): string[] {
  return [
    stats.creek
      ? `creek OK  head (${stats.creek.head[0]},${stats.creek.head[1]}) ${stats.creek.head[2]}m ` +
        `-> mouth (${stats.creek.mouth[0]},${stats.creek.mouth[1]}) ${stats.creek.mouth[2]}m  ` +
        `len ${stats.creek.length}m`
      : 'creek NONE  <- no ridge fed one',
    stats.beck
      ? `beck  ${stats.beck.wetted}m wetted, ${stats.beck.fall}m of fall`
      : 'beck  DRY  <- no water standing in the channel',
    stats.tarn
      ? `tarn  (${stats.tarn.x},${stats.tarn.z}) surface ${stats.tarn.level}m  ` +
        `wetted r${stats.tarn.wetted}m  rim ${stats.tarn.spread}m`
      : 'tarn  NONE  <- no upland flat enough to hold one',
  ]
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
    ...waterLines(stats),
    (stats.pasture
      ? `pasture (${stats.pasture.x},${stats.pasture.z}) r${stats.pasture.radius}`
      : 'pasture NONE') +
      `   plots ${stats.plots}   ridges ${stats.ridges}   ` +
      `isles ${stats.isles.surfacing}/${stats.isles.total} surfacing`,
    stats.mill
      ? `mill (${stats.mill.x},${stats.mill.z}) prominence ${stats.mill.prominence}m`
      : 'mill NONE  <- no shoulder stood proud enough',
    stats.chapel
      ? `chapel (${stats.chapel.x},${stats.chapel.z}) prominence ${stats.chapel.prominence}m  ` +
        `${stats.chapel.fromYard}m from the yard`
      : 'chapel NONE  <- no knoll near enough to the farm',
    stats.smokehouse
      ? `smokehouse (${stats.smokehouse.x},${stats.smokehouse.z}) ` +
        `${stats.smokehouse.fromBank}m up the bank`
      : 'smokehouse NONE  <- no dry ground behind the harbour',
    stats.beacon
      ? `beacon (${stats.beacon.x},${stats.beacon.z}) isle ${stats.beacon.isle} ` +
        `freeboard ${stats.beacon.freeboard}m  reach ${stats.beacon.reach}m`
      : 'beacon NONE  <- no rock was broad enough to build on',
    `steading  ${steading}`,
    `landing ${stats.landing ? `(${stats.landing})` : 'NONE'}  ` +
      `harbour ${stats.harbour ? `(${stats.harbour})` : 'NONE'}`,
    `landmasses ${stats.landmasses.length}`,
    ...stats.landmasses.map(landmass =>
      `${landmass.id}/${landmass.profile} @ (${landmass.origin})  ` +
      `land ${landmass.land}% peak ${landmass.peak.height}m  ` +
      `paths ${landmass.footpaths.routes}  ` +
      `jetty ${landmass.landing ? `(${landmass.landing})` : 'NONE'}  ` +
      `mill ${landmass.mill ? `(${landmass.mill.x},${landmass.mill.z})` : 'NONE'}`),
    `waterways ${stats.waterways.legs} legs ${stats.waterways.length}m  ` +
      `connected ${stats.waterways.connected ? 'OK' : 'BROKEN'}  ` +
      `wet ${stats.waterways.wet ? 'OK' : 'DRY'}  ` +
      `clearance ${stats.waterways.clearance}m`,
    `boats ${stats.boats.count}  separation ${stats.boats.separation}m  ` +
      `conflicts ${stats.boats.conflicts}`,
    stats.strand
      ? `strand ${stats.strand.between[0]}<->${stats.strand.between[1]}  ` +
        `len ${stats.strand.length}m  crest ${stats.strand.crest}m  ` +
        `lowest ${stats.strand.lowest}m  ` +
        `${stats.strand.connected ? 'CONNECTED' : 'DROWNED'}`
      : 'strand NONE  <- no pair of islands is named, or the crest is zero',
    skerryLine(stats.skerries),
    ...stats.fjords.map(fjord =>
      `fjord ${fjord.id}  len ${fjord.length}m  sea ${fjord.sea}m  ` +
      `sill ${fjord.sill}m  basin ${fjord.basin}m  head +${fjord.head}m  ` +
      `${fjord.overdeepened ? 'OVERDEEPENED' : 'SHALLOWER THAN THE SEA IT OPENS INTO'}`),
    `hearths ${stats.hearths.count}  lowest mouth ${stats.hearths.lowest}m over the ground` +
      (stats.hearths.lowest < 3 ? '  <- a stack is standing in its own roof' : ''),
    windowLine(stats.windows),
    grazingLine(stats.grazing),
    `gulls ${stats.colonies.count}/${stats.colonies.asked} colonies  ` +
      (stats.colonies.sited
        .map(colony => `${colony.id}/${colony.kind} (${colony.x},${colony.z}) r${colony.radius}`)
        .join('  ') || '<- no coast had open water to fit a ring over'),
  ]

  return lines.join('\n')
}
