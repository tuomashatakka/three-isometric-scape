import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import type { FencePoint } from '../props/fence.ts'
import type { PropName } from '../props/index.ts'
import type { NordicPalette } from '../props/palette.ts'
import { buildMoleRun } from '../props/mole.ts'
import { PIER_WIDTH, buildPierRun } from '../props/pier.ts'
import { buildWeirRun } from '../props/weir.ts'
import type { AtmosphereQuality } from '../quality.ts'
import {
  BOATHOUSE_CLEARING,
  CREEL_STACK_CLEARING,
  NET_RACK_CLEARING,
  boathouseSpot,
  creelStackSpot,
  netRackSpot,
} from './landing.ts'
import type { Spot } from './landing.ts'
import { yawAlong } from './layout.ts'
import type { Vec2 } from './layout.ts'
import type { ScapeSurvey } from './survey.ts'
import { weirCourse } from './weir.ts'


/**
 * Everything the settlement puts at the water, raised together.
 *
 * A module of its own rather than four nested functions in `dressing.ts` for the
 * reason `dressing-enclosures.ts` and `dressing-zones.ts` are: that file is at
 * the lint config's line ceiling, and the waterfront is a subject that can be
 * moved whole. It is also the one part of the dressing where the *order* matters
 * — the shed claims its ground, the rack has to miss it, and the two runs built
 * on the water are rooted a fixed offset either side of the shed's own line — so
 * having all four in one place is worth more than having them near the buildings
 * they are not related to.
 *
 * Nothing in here is plopped. The boathouse is anchored to the *water* rather
 * than to the terrain, and the pier and the weir are parametric runs in world
 * coordinates: their shapes came from the bed rather than from a roster, so
 * there is nothing to stamp. All of it lands in the steading's one merged hero
 * draw, which is why a waterfront costs no draw call on any tier.
 */
export interface WaterfrontDressing {

  /** Where the island sits in the world. */
  origin: Vec2

  /** The island's own survey — the pier and the weir are read off it. */
  survey: ScapeSurvey

  /** The island's own config, which a landmass spec may have overridden. */
  config:  ScapeConfig
  quality: AtmosphereQuality
  rng:     SeededRng
  palette: NordicPalette

  /** Mean water, in metres. */
  water: number

  /** The ground as the dressing reads it. */
  heightAt(x: number, z: number): number

  placeHero(name: PropName, x: number, z: number, angle: number): void
  placeHeroAt(name: PropName, x: number, y: number, z: number, angle: number): void
  reserve(x: number, z: number, radius: number): void

  /** Where merged world-space geometry goes. */
  heroes: BufferGeometry[]

  /** Where the harbour bank itself goes, for everything that has to find it later. */
  anchors: Vec2[]
}

/**
 * The waterfront, plus the one bank only the harbour's own pieces have.
 *
 * The split is not bookkeeping. The arm is rooted on the **landing** and
 * everything else in this module on the **harbour**, and those are two
 * different coves chosen by two opposite tests — see `landscape/mole.ts`. An
 * island can have one and not the other, so the harbour bank is the harbour
 * pieces' own argument rather than part of the shared waterfront.
 */
export interface HarbourDressing extends WaterfrontDressing {

  /** The bank the harbour is dug into, in the island's own local frame. */
  bank: Spot
}

/**
 * Metres of scatter kept clear around each station of the weir's stone.
 *
 * Sized off the band rather than off the line, which is the difference between
 * this and the pier's reserve: the foot course spreads to about three metres
 * across, so a clearing cut to the *centreline* leaves the outer stones in the
 * marram. The first capture of this had a pound with reeds growing out of the
 * top of it.
 */
const WEIR_CLEARING = 2.1


/**
 * The trestle out to deep water, alongside the boathouse.
 *
 * Built rather than plopped, and world-space rather than local: its length came
 * from the shelf and every pile was cut to the bed under its own bent, so there
 * is no fixed shape to stamp — see `props/pier.ts`. The bents are carried into
 * world metres here because that is where the offsets live; the survey solved
 * the whole thing in the island's own frame.
 *
 * Each bent is reserved against the scatter for the reason the boathouse is: the
 * littoral band seeds wrack and driftwood along exactly this depth, and a clump
 * of bladderwrack growing out of a deck is the one place on this coast where the
 * shallows and the settlement are drawn on top of each other.
 */
function raisePier (dressing: HarbourDressing): void {
  const { survey, origin, quality, rng, palette, heroes, reserve } = dressing
  const { pier }                                                   = survey

  if (!pier)
    return

  heroes.push(buildPierRun({
    bents:  pier.bents.map(bent => ({ x: bent.x + origin.x, z: bent.z + origin.z, bed: bent.bed })),
    deck:   pier.deck,
    angle:  pier.angle,
    width:  PIER_WIDTH,
    boards: quality.pierBoards,
    rng:    rng.fork('pier'),
    palette,
  }))

  for (const bent of pier.bents)
    reserve(bent.x + origin.x, bent.z + origin.z, PIER_WIDTH)
}

/**
 * Metres of scatter kept clear around each station of the arm.
 *
 * Sized off the *foot* rather than off the crest, which is the same lesson the
 * weir's clearing is: a breakwater is a wedge, so the stone it actually stands
 * on is several metres wider than the track along the top of it, and a clearing
 * cut to the centreline leaves wrack growing up the seaward face.
 */
const MOLE_CLEARING = 6

/**
 * The arm across the landing, raised on the shore beside the jetty.
 *
 * Exported rather than folded into {@link raiseHarbour}, because it is the
 * landing's piece and not the harbour's — see `landscape/mole.ts` for why those
 * are two different banks — and `dressing.ts` already has the landing in hand
 * when it sets the jetty down.
 *
 * World-space and parametric for the reason the pier and the weir are: the
 * course came out of the bed and the height of every course of stone is
 * whatever the crest left over that particular station, so there is no fixed
 * shape to stamp. It lands in the steading's one merged hero draw, which is why
 * an arm costs no draw call on any tier.
 */
export function raiseMole (dressing: WaterfrontDressing): void {
  const { survey, origin, config, quality, rng, palette, heroes, heightAt, reserve } = dressing
  const { mole }                                                                     = survey

  if (!mole)
    return

  const stations = mole.stations.map(station => ({
    x: station.x + origin.x,
    z: station.z + origin.z,
  }))

  // Reserved before it is raised, and generously. The littoral band seeds wrack
  // and driftwood along exactly the depths this thing walks through, and a mound
  // is the one structure on the coast wide enough to have a clump of bladderwrack
  // growing out of the middle of it rather than beside it.
  for (const station of stations)
    reserve(station.x, station.z, MOLE_CLEARING)

  const stone = buildMoleRun({
    stations,
    heightAt,
    crest:   mole.crest,
    width:   config.mole.width,
    batter:  config.mole.batter,
    spacing: quality.dykeSpacing,
    armour:  quality.moleArmour,
    // The hand the survey built the arm on is the side the open sea is on, so
    // the armour needs no second opinion about which face gets hit.
    seaward: mole.hand,
    rng:     rng.fork('mole'),
    palette,
  })

  if (stone)
    heroes.push(stone)
}

/**
 * The fish trap on the flat, on the other hand of the harbour from the pier.
 *
 * `null` on five islands in six at the default seed, and that is the finding
 * rather than a gap — a trap needs a coast shallow enough to dry twice a day,
 * and this one is rock. Built for the reason the pier is built: its leader is
 * whatever length the intertidal band gave it and its pound whatever radius that
 * band would hold, so there is no fixed shape to stamp.
 *
 * Every station on both runs is reserved against the scatter. The littoral band
 * seeds wrack and driftwood along precisely this depth — the whole point of the
 * weir is that it stands where the tide works — so without the reserve the one
 * structure on the coast built *in* the wrack line would have bladderwrack
 * growing out of its own crest.
 */
function layTrap (dressing: HarbourDressing): void {
  const { survey, origin, config, quality, rng, palette, heroes, heightAt, reserve } = dressing
  const { weir }                                                                     = survey

  if (!weir)
    return

  const course = weirCourse(weir, quality.dykeSpacing)
  const shift  = (points: readonly Vec2[]): FencePoint[] =>
    points.map(point => ({ x: point.x + origin.x, z: point.z + origin.z }))
  const leader = shift(course.leader)
  const pound  = shift(course.pound)

  for (const station of [ ...leader, ...pound ])
    reserve(station.x, station.z, WEIR_CLEARING)

  const stone = buildWeirRun({
    leader,
    pound,
    heightAt,
    height:  config.weir.height,
    width:   config.weir.width,
    spacing: quality.dykeSpacing,
    stakes:  quality.weirStakes,
    rng:     rng.fork('weir'),
    palette,
  })

  if (stone)
    heroes.push(stone)
}

/**
 * The boat harbour, in the next cove along from the landing.
 *
 * The boathouse is anchored to the *water* level rather than plopped onto the
 * terrain the way the five farmstead buildings are: its floor is a deck on piles
 * and its slipway runs out under the surface, so a foundation cut into the bank
 * would bury exactly the part that has to be open to the lake.
 */
function raiseHarbour (dressing: HarbourDressing): void {
  const { bank, origin, water, heightAt, placeHero, placeHeroAt, reserve, anchors } = dressing
  const bearing                                                                     = bank.angle
  const house                                                                       = boathouseSpot(bank)
  const rack                                                                        = netRackSpot(bank)
  const stack                                                                       = creelStackSpot(bank)

  anchors.push({ x: bank.x + origin.x, z: bank.z + origin.z })
  placeHeroAt('boathouse', house.x + origin.x, water + 0.05, house.z + origin.z, yawAlong(bearing))
  reserve(house.x + origin.x, house.z + origin.z, BOATHOUSE_CLEARING)

  // The rack dries nets on dry ground behind the shed, never in the shallows.
  if (heightAt(rack.x + origin.x, rack.z + origin.z) > water + 0.5) {
    placeHero('netRack', rack.x + origin.x, rack.z + origin.z, yawAlong(bearing))
    reserve(rack.x + origin.x, rack.z + origin.z, NET_RACK_CLEARING)
  }

  // The pots come ashore beside the nets, on the same dry ground and under the
  // same test — a stack standing in the shallows is gear nobody left there.
  if (heightAt(stack.x + origin.x, stack.z + origin.z) > water + 0.5) {
    placeHero('creelStack', stack.x + origin.x, stack.z + origin.z, yawAlong(bearing))
    reserve(stack.x + origin.x, stack.z + origin.z, CREEL_STACK_CLEARING)
  }

  raisePier(dressing)
  layTrap(dressing)
}

/**
 * Metres of scatter kept clear around the jetty.
 *
 * The landing's own clearing, moved here with the rest of the waterfront. Wider
 * than the deck, because a jetty is approached as well as stood on.
 */
const JETTY_CLEARING = 7

/**
 * Everything the settlement put at the water, in the order it has to go up.
 *
 * One entry point rather than three, because the waterfront wants the same
 * twelve things wherever it is rooted and only the *bank* differs — and because
 * the order is the part worth keeping in one place: the shed claims its ground,
 * the rack and the pots have to miss it, and the two runs built on the water are
 * offset either side of the shed's own line.
 *
 * **The two banks are not interchangeable.** The jetty and the arm are rooted
 * on the landing, which is the cove chosen for a way out of the island; the
 * boathouse, the pier and the trap are rooted on the harbour, which is the cove
 * chosen for shelter. An island can have one and not the other, so each half is
 * guarded on the bank it actually needs.
 */
export function raiseWaterfront (dressing: WaterfrontDressing): void {
  const { survey, origin, water, placeHeroAt, reserve } = dressing
  const shore                                           = survey.landing

  // The jetty and the route consume the same surveyed landing. A static rowboat
  // no longer lives here; the shared fleet owns every hull.
  if (shore) {
    const shoreX = shore.x + origin.x
    const shoreZ = shore.z + origin.z

    placeHeroAt('jetty', shoreX, water + 0.05, shoreZ, yawAlong(shore.angle))
    reserve(shoreX, shoreZ, JETTY_CLEARING)
    raiseMole(dressing)
  }

  if (survey.harbour)
    raiseHarbour({ bank: survey.harbour, ...dressing })
}
