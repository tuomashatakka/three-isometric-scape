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
/**
 * The wood's edge, in one line.
 *
 * The three shares first, because they are the finding: a wooded share that fell
 * off a cliff is a mistuned salt band, and a bare share of nothing is a treeline
 * that stopped reaching the ground. The lines themselves come after — a `low`
 * that climbed to meet `high` means the fetch walk stopped telling one coast
 * from another, which reads as a contour and not as a wood.
 */
function treelineLine (treeline: MapStats['treeline']): string {
  const islands = treeline.islands
    .map(island => `${island.id} ${island.wooded}%/${island.line}m/e${island.exposure}`)
    .join('  ')

  return `treeline wooded ${treeline.wooded}%  margin ${treeline.margin}%  ` +
    `bare ${treeline.bare}%  line ${treeline.line.low}..${treeline.line.high}m ` +
    `mean ${treeline.line.mean}m` +
    (treeline.wooded === 0 ? '  <- the archipelago has no wood left on it' : '') +
    (islands ? `\n            ${islands}` : '')
}

/**
 * One island's winter, with the wind in it and without.
 *
 * `cover -> cover` is the finding and the rest is the working: two identical
 * shares mean the swing never reached the ground, which is the failure this
 * line exists to catch and the one a winter still cannot show — a whitened
 * island looks whitened either way. `realised` says whether that would be the
 * knob's fault or the hillside's.
 */
function driftLine (island: MapStats['drift'][number]): string {
  return `drift ${island.id}  scoured ${island.scoured}% / drifted ${island.drifted}%  ` +
    `cover ${island.even}% -> ${island.cover}%  bared ${island.bared}%  banked ${island.banked}%  ` +
    `swing ${island.realised}m` +
    (island.bared === 0 && island.banked === 0
      ? '  <- the wind moved no snow on this island'
      : '')
}

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
 * The colony's line, and the two findings hiding in it.
 *
 * Its own function for `skerryLine`'s reason, and it carries two conditions
 * rather than one because a haul-out can fail in two unrelated ways. `usable`
 * at zero is the *search* having rejected every rock in the guard — a sill and
 * a reach that no longer straddle the freeboard the chains deal. `low === high`
 * is the *siting*: rocks were found, animals were put on them, and every one of
 * them ended up above the reach of a spring tide, which leaves a colony that is
 * decoration rather than a system.
 */
function hauloutLine (haulout: MapStats['haulout']): string {
  if (!haulout.rocks)
    return `seals NONE  <- none of ${haulout.offered} rocks is between the sill and the reach`

  return `seals ${haulout.seals} on ${haulout.rocks}/${haulout.offered} rocks ` +
    `in ${haulout.guards} guards  ` +
    `ashore ${haulout.low} low / ${haulout.high} high  ` +
    `ledges ${haulout.lowest}..${haulout.highest}m over mean  ` +
    `springs ±${haulout.springs}m` +
    (haulout.low === haulout.high ? '  <- the tide never reaches the colony' : '')
}

/**
 * The kelp's line, and the two findings hiding in it.
 *
 * Its own function for `hauloutLine`'s reason, and it carries the same two
 * classes of failure. `offered` at zero is the *search* having found no water at
 * all between the sill and the reach — a depth window that no longer straddles
 * anything the falloff and the shelving leave behind. `low === high` is the
 * *siting*: plants were grown, and every one of them is so much longer than its
 * own water that a spring tide no longer changes how it lies, which leaves a bed
 * that is decoration rather than a system.
 */
function kelpLine (kelp: MapStats['kelp']): string {
  if (!kelp.offered)
    return `kelp NONE  <- no water on any coast is between the sill and the reach`

  return `kelp ${kelp.plants}/${kelp.offered} plants ` +
    `in ${kelp.beds} beds on ${kelp.coasts}/${kelp.islands} coasts  ` +
    `water ${kelp.shallow}..${kelp.deep}m  longest ${kelp.longest}m  ` +
    `afloat ${kelp.afloat}%  ` +
    `lean ${kelp.low}° low / ${kelp.high}° high` +
    (kelp.afloat === 0 ? '  <- no plant is longer than its own water' : '') +
    (kelp.low === kelp.high ? '  <- the tide never reaches the canopy' : '')
}

/**
 * The channel and the water in it, as two lines.
 *
 * Their own function for the reason `windowLine` and `skerryLine` have one: a
 * course that failed to trace and a channel with nothing standing in it are
 * both *findings*, and two more ternaries inline is what took `formatStats`
 * past the complexity ceiling.
 *
 * The cutting is in here rather than with the sited buildings because what it
 * is a report about is the same thing the pool's line is: ground that was
 * chosen for being level, and the one measurement that says whether it still
 * is. It is the wettest ground the island has, which is why there is peat on
 * it at all.
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
    stats.peat
      ? `peat  (${stats.peat.x},${stats.peat.z}) moor ${stats.peat.level}m  ` +
        `face ${stats.peat.standing}m standing  ground ${stats.peat.spread}m` +
        (stats.peat.standing < 0.3 ? '  <- the cut left no face' : '')
      : 'peat  NONE  <- no low ground flat enough to cut',
  ]
}

/**
 * The four sited buildings that are not part of the farmyard, as four lines.
 *
 * Their own function for the reason `waterLines` is one, and the croft is what
 * made it necessary: each of these is a search that is allowed to come back with
 * nothing, so each is a ternary, and a fifth of them inline took `formatStats`
 * past the complexity ceiling. Which the lint config is right about — the block
 * is the run's whole structural readout, and every conditional inlined into it
 * makes the rest of it harder to read past.
 */
function sitedLines (stats: MapStats): string[] {
  return [
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
    stats.pier
      ? `pier (${stats.pier.x},${stats.pier.z}) ${stats.pier.length}m out  ` +
        `${stats.pier.bents} bents  berth ${stats.pier.depth}m  deck ${stats.pier.deck}m`
      : 'pier NONE  <- no bearing off the harbour found a berth with a way out of it',
    stats.beacon
      ? `beacon (${stats.beacon.x},${stats.beacon.z}) isle ${stats.beacon.isle} ` +
        `freeboard ${stats.beacon.freeboard}m  reach ${stats.beacon.reach}m`
      : 'beacon NONE  <- no rock was broad enough to build on',
    stats.croft
      ? `croft (${stats.croft.x},${stats.croft.z}) isle ${stats.croft.isle}  ` +
        `freeboard ${stats.croft.freeboard}m  ${stats.croft.fromHarbour}m from the harbour`
      : 'croft NONE  <- no free islet was broad, dry and level enough',
    stats.dyke
      ? `dyke (${stats.dyke.x},${stats.dyke.z}) contour ${stats.dyke.level}m  ` +
        `${stats.dyke.length}m built of ${stats.dyke.circuit}m  ${stats.dyke.runs} runs  ` +
        `${stats.dyke.gates} gates  encloses ${stats.dyke.encloses}m2`
      : 'dyke NONE  <- no hill over the farm, or its contour is under the ice',
    stats.causeway
      ? `causeway (${stats.causeway.x},${stats.causeway.z}) isle ${stats.causeway.isle}  ` +
        `crossing ${stats.causeway.crossing}m  crest ${stats.causeway.crest}m  ` +
        `covered ${Math.round(stats.causeway.springs * 100)}% springs / ` +
        `${Math.round(stats.causeway.neaps * 100)}% neaps`
      : 'causeway NONE  <- no rock close enough to the shore to walk to',
    shielingLine(stats.shieling),
    wreckLine(stats.wreck),
  ]
}

/**
 * The hull out on the rocks, as one line.
 *
 * Its own function for the reason `shielingLine` is one — {@link sitedLines} is
 * at the lint config's complexity ceiling — and the reading is the interesting
 * part rather than the position. `freeboard` is the search's whole argument: it
 * is meant to be a small number, so a run that grew it has quietly moved her
 * onto a rock the light would rather be on. `fall` says whether she is aground
 * along her keel or balanced on a point, and `turn` says whether she is still
 * lying on the course she was driven in on.
 */
function wreckLine (wreck: MapStats['wreck']): string {
  if (!wreck)
    return 'wreck NONE  <- every rock in the ring stands high enough to be seen coming'

  return `wreck (${wreck.x},${wreck.z}) isle ${wreck.isle}  ` +
    `freeboard ${wreck.freeboard}m  bed ${wreck.fall}m of fall  ` +
    `turn ${wreck.turn}deg  reach ${wreck.reach}m`
}

/**
 * The hut on the grazing, as one line.
 *
 * Its own function rather than an eighth ternary in {@link sitedLines}, which is
 * already at the lint config's complexity ceiling — and it wants one anyway: the
 * water reading is itself conditional, because an island with no beck reports no
 * distance to one rather than a distance of nothing.
 */
function shielingLine (shieling: MapStats['shieling']): string {
  if (!shieling)
    return 'shieling NONE  <- no hill, no burn by the grazing, or no level sill up there'

  return `shieling (${shieling.x},${shieling.z}) rise ${shieling.rise}m  ` +
    `${shieling.fromYard}m from the yard  ` +
    (shieling.toWater === null ? 'no burn' : `${shieling.toWater}m from the burn`)
}

/**
 * The storm line, and the findings it carries.
 *
 * Two of them. A comb that no rate lets through is a front with no lightning in
 * it, and an island with every strike on it is a hash that stopped spreading —
 * both are silent in a still, because a still is one instant of a front and
 * almost every instant of a front has no strike in it at all.
 */
function stormLine (storm: MapStats['storm']): string {
  if (!storm.peak)
    return 'storm  NO STRIKES  <- the rate lets none of the comb through'

  const sites = storm.sited
    .map(site => `${site.id}(${site.x},${site.z}) ${site.strikes}x on ${site.base}m`)
    .join('  ')

  return `storm ${storm.strikes}/${storm.asked} strikes  ` +
    `peak @ phase ${storm.peak.phase} over ${storm.peak.id}  ${sites}` +
    (storm.sited.some(site => site.strikes === storm.strikes)
      ? '  <- every strike on one island'
      : '')
}

/**
 * The bow line, and the two findings it carries.
 *
 * A front no instant of which has a bow in it, and a phase the config is parked
 * on that has none — the second is not a fault, because most of a front has no
 * bow, but it is what a run needs to know before it reads a still and concludes
 * the system is broken.
 */
function rainbowLine (bow: MapStats['rainbow']): string {
  return `bow   sun ${bow.sun}° up  apex ${bow.apex}°  bearing ${bow.swing}°  ` +
    `cover ${bow.cover}  now ${bow.now}  best ${bow.best} @ phase ${bow.at}` +
    (bow.best <= 0
      ? '  <- no instant of any front on this coast has a bow in it'
      : bow.now <= 0 ? '  <- the parked phase has no bow, only the front does' : '')
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
    ...sitedLines(stats),
    `steading  ${steading}`,
    `landing ${stats.landing ? `(${stats.landing})` : 'NONE'}  ` +
      `harbour ${stats.harbour ? `(${stats.harbour})` : 'NONE'}`,
    `landmasses ${stats.landmasses.length}`,
    ...stats.landmasses.map(landmass =>
      `${landmass.id}/${landmass.profile} @ (${landmass.origin})  ` +
      `land ${landmass.land}% peak ${landmass.peak.height}m  ` +
      `paths ${landmass.footpaths.routes}  ` +
      `jetty ${landmass.landing ? `(${landmass.landing})` : 'NONE'}  ` +
      `mill ${landmass.mill ? `(${landmass.mill.x},${landmass.mill.z})` : 'NONE'}  ` +
      `peat ${landmass.peat ? `(${landmass.peat.x},${landmass.peat.z}) face ${landmass.peat.standing}m` : 'NONE'}  ` +
      `pier ${landmass.pier ? `${landmass.pier.length}m berth ${landmass.pier.depth}m` : 'NONE'}  ` +
      `dyke ${landmass.dyke ? `${landmass.dyke.length}/${landmass.dyke.circuit}m ${landmass.dyke.gates}g` : 'NONE'}  ` +
      `shieling ${landmass.shieling ? `rise ${landmass.shieling.rise}m` : 'NONE'}`),
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
    hauloutLine(stats.haulout),
    kelpLine(stats.kelp),
    ...stats.fjords.map(fjord =>
      `fjord ${fjord.id}  len ${fjord.length}m  sea ${fjord.sea}m  ` +
      `sill ${fjord.sill}m  basin ${fjord.basin}m  head +${fjord.head}m  ` +
      `${fjord.overdeepened ? 'OVERDEEPENED' : 'SHALLOWER THAN THE SEA IT OPENS INTO'}`),
    ...stats.icecaps.map(cap =>
      `ice ${cap.id}  (${cap.x},${cap.z}) reach ${cap.reach}m  ` +
      `covers ${cap.share}% of the island  apex ${cap.apex}m  ` +
      `thickest ${cap.thickest}m  ` +
      `${cap.front > 0 ? `front in ${cap.front}m of water` : 'ends ashore'}`),
    ...stats.dunes.map(belt =>
      `dune ${belt.id}  crest ${belt.crest}m  ridge ${belt.ridgeAt}m inland  ` +
      `belt ${belt.length}m of coast  ${belt.gaps}/${belt.sampled} bearings blown out  ` +
      `${belt.refused}% refused  lowest ground ${belt.lowest}m` +
      (belt.lowest < 0 ? '  <- sand laid in the water' : '') +
      (belt.crest <= 0 ? '  <- the belt found no coast to build on' : '')),
    ...stats.saltings.map(flat =>
      `marsh ${flat.id}  mouth ${flat.bearing}°  runs ${flat.length}m of coast  ` +
      `flat ${flat.tidal}m2 tidal / ${flat.turf}m2 turf  gutters ${flat.gutters}%  ` +
      `the tide walks ${flat.walk}m across it  lowest turf ${flat.lowest}m` +
      (flat.lowest <= 0 ? '  <- turf laid in the water' : '') +
      (flat.walk <= 0 ? '  <- the tide crosses none of it' : '')),
    ...stats.crags.map(crag =>
      `crag ${crag.id}  headland ${crag.bearing}°  lip ${crag.lip}m  face ${crag.face}°  ` +
      `runs ${crag.length}m of coast  low ${crag.least}m  ${crag.clefts} clefts  ` +
      `stands ${crag.standing}m over the coast  plunge ${crag.plunge}m  coast ${crag.steep}` +
      (crag.cut > 0 ? `  <- the crag cut ${crag.cut}m out of the island` : '') +
      (crag.plunge <= 0 ? '  <- the platform has no water off the end of it' : '')),
    ...stats.stacks.map(stack =>
      `stack ${stack.id}  (${stack.x},${stack.z})  off the ${stack.bearing}° headland  ` +
      `crown ${stack.crown}m of a ${stack.lip}m lip  ` +
      `girth ${stack.girth}m  gut ${stack.gut}m of water ${stack.depth}m deep  ` +
      `clear ${stack.freeboard}m at springs  rock ${stack.weakness}` +
      (stack.gut <= 0 ? '  <- the platform has run out to meet it: a promontory, not a stack' : '') +
      (stack.freeboard <= 0 ? '  <- the crown goes under at springs' : '') +
      (stack.crown >= stack.lip ? '  <- the pillar overtops the cliff it came out of' : '')),
    ...stats.forces.map(fall =>
      `force ${fall.id}  lip (${fall.x},${fall.z}) ${fall.lip}m  drop ${fall.drop}m  ` +
      `over ${fall.run}m  sheet ${fall.width}m wide`),
    `hearths ${stats.hearths.count}  lowest mouth ${stats.hearths.lowest}m over the ground` +
      (stats.hearths.lowest < 3 ? '  <- a stack is standing in its own roof' : ''),
    windowLine(stats.windows),
    stormLine(stats.storm),
    rainbowLine(stats.rainbow),
    treelineLine(stats.treeline),
    ...stats.drift.map(driftLine),
    grazingLine(stats.grazing),
    `gulls ${stats.colonies.count}/${stats.colonies.asked} colonies  ` +
      (stats.colonies.sited
        .map(colony => `${colony.id}/${colony.kind} (${colony.x},${colony.z}) r${colony.radius}`)
        .join('  ') || '<- no coast had open water to fit a ring over'),
  ]

  return lines.join('\n')
}
