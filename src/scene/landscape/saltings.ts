import { smoothstep } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { valueNoise } from '../noise.ts'
import { COAST_BEARINGS, bearingGap, coastBedAt, solveCoastline } from './coast.ts'
import type { Vec2 } from './path.ts'


/**
 * The saltings at the beck's mouth.
 *
 * The third landform written against the *coastline* rather than against a
 * height — see `coast.ts`, which the dune belt and the crag solve the waterline
 * through, and which this one solves it through for the same reason. What
 * differs is which coast it goes on and what it does when it gets there.
 *
 * ## what it is
 *
 * Not a thickness laid on the ground, which is what the sand is, and not a
 * profile cut into it, which is what the cliff is. A tidal flat is a *level*:
 * silt settles out of still water until the ground it builds stands at about
 * the height the tide floods to, and then stops, because ground the sea has
 * stopped covering gets no more silt. So this fills — it raises whatever it
 * finds toward one surface and leaves alone anything already standing above it,
 * which is why the marsh ends up occupying the inlet, the back of the bay and
 * the hollows rather than a band of fixed width. The coast decides the shape;
 * the config decides only the level.
 *
 * That fill is also the whole visual argument for the landform. Half the spring
 * range is 0.4 m, and on a shore that climbs at a metre in four the tide moves
 * the waterline a metre and a half. Over a flat with a hand's breadth of rise
 * in twenty metres the same water walks twenty, which is the first ground in
 * the scape where the tide is a thing you can see happening rather than a
 * number in the config.
 *
 * ## which shore
 *
 * The one the beck comes out on. Silt is *delivered* — the only thing in this
 * archipelago carrying any is the watercourse — so the arc is centred on the
 * channel's own mouth rather than searched for. It is then refused two coasts:
 * the sand's, which is the weather shore by construction and the one coast with
 * no shelter on it, and the crag's, which is rock the sea is taking away rather
 * than ground it is putting down. Those two refusals are why an island can come
 * out with no saltings at all, and `null` is a real answer.
 *
 * ## what it does not touch
 *
 * The layout, like the belt and the cliff: the yard, the plots, the track and
 * the pasture are all sited before this is solved, and the levelling that
 * follows it in the height field flattens whatever silt ends up under a field.
 * And the beck, which is carved *after* it — the channel keeps its own way
 * across the flat instead of being silted over by ground it delivered.
 */
export interface Saltings {

  /** Radians, and the middle of the flat: the bearing the beck comes out on. */
  bearing: number

  /** Half-angle of the flat, in radians. */
  arc: number

  /** Absolute world height the marsh surface accretes to. */
  top: number

  /** Absolute world height the seaward edge of the mud lies at. */
  slob: number

  /**
   * Metres from the island's middle to the waterline on a bearing, or 0 where
   * that bearing has no dry land on it at all.
   *
   * @param angle Radians, in the island's own frame, `atan2(z, x)`.
   */
  shoreAt(angle: number): number

  /**
   * How much of the flat a point is inside, 0..1.
   *
   * The arc, the band and the bottom, and nothing about what the ground under
   * it happens to be doing — a point in the middle of the marsh has a claim of
   * 1 whether the silt raised it a metre or found it already there. That is the
   * separation the paint needs: the mud is the *shape* of the flat, and it has
   * to be painted onto the bank the flat merely levelled as well as onto the
   * ground it built.
   */
  claimAt(x: number, z: number): number

  /**
   * How much of a drainage gutter is cut at a point, 0..1.
   *
   * Published beside the level rather than folded into it because the two are
   * different questions and only one of them is answerable from the surface: a
   * gutter is a cut of a known depth, and a level is that cut plus the ramp it
   * was taken out of. `scape:map` counts this, and the tests state the flat's
   * claim about it against this rather than against a height they would have to
   * un-ramp first.
   */
  gutterAt(x: number, z: number): number

  /**
   * The world height the silt is filling toward at a point, gutters included.
   *
   * Undefined where the claim is 0 — callers gate on the claim first, which is
   * what {@link fillSaltings} does for every one of them.
   */
  levelAt(x: number, z: number): number
}


/**
 * Where the arc's own feather starts, as a fraction of the half-angle.
 *
 * The flat is at full strength within this and gone by the half-angle, so the
 * ends of it taper into the bare coast either side instead of stopping dead.
 * Without the taper the two ends are vertical walls of silt facing along the
 * beach, which is the one thing a marsh never has.
 */
const ARC_INNER = 0.6

/**
 * Metres of the band the seaward edge fades in over.
 *
 * The mudflat has to *become* the seabed rather than stop on it. Without the
 * fade the outer edge of the fill is a step of whatever the difference between
 * the bottom and `slob` happens to be, and a step in the sea is a reef.
 */
const EDGE_FADE = 6

/**
 * How much of the bottom's veto is spent before the silt gives out, 0..1.
 *
 * The fade on {@link SaltingsConfig.shoal}: the allowance is full over ground
 * the sea has nearly filled and gone by the depth the config names. Written as
 * a share rather than as metres because it is one end of a range whose other
 * end moves — retuning the shoal should not also retune how abruptly the flat
 * ends at it.
 */
const SHOAL_ONSET = 0.55

/** Where the gutter field starts cutting and where it has cut all it will. */
const GUT_ONSET = 0.34
const GUT_FULL  = 0.1

/**
 * How far seaward a gutter has to be before it is cutting its full depth.
 *
 * A drainage creek is the ebb's route off the marsh, so it is deepest where the
 * water leaves and dies out at its head, up at the landward limit — a system of
 * gutters cut to one depth everywhere reads as a pattern printed on the flat
 * rather than as something water did to it. Measured as a share of the band
 * seaward of the mean-water line.
 */
const GUT_REACH = 0.75


/** As much of the beck as the siting needs. See {@link solveSaltings}. */
interface BeckMouth {

  /** Where the channel gives up and becomes sea, in the island's own frame. */
  mouth: Vec2
}

/** As much of a neighbouring landform as the refusals need. */
interface Occupied {
  bearing: number
  arc:     number
}

/**
 * How much of the working gap off the berths a point has, 0..1.
 *
 * 0 on a bank the boats use and 1 a clear `saltings.clear` away from both of
 * them. A fade rather than a boundary, because what the rule is protecting is a
 * *depth* — a hard edge would put a step of silt across the fairway instead of
 * a bank of it beside the fairway.
 */
function offBerths (
  config: ScapeConfig,
  berths: readonly (Vec2 | null)[],
  x:      number,
  z:      number,
): number {
  const { clear } = config.terrain.saltings
  let gap         = 1

  for (const berth of berths)
    if (berth)
      gap = Math.min(gap, smoothstep(0, clear, Math.hypot(x - berth.x, z - berth.z)))

  return gap
}

/**
 * How much silt the bottom at a point will take, 0..1.
 *
 * One veto and nothing else: shallow. Read off the falloff's own bed rather
 * than off any height a caller happens to be holding, for the reason
 * `coastBedAt` exists — the shore shelving is in the drawn ground and answers a
 * different question from the one the sea was asking.
 */
function allowanceAt (config: ScapeConfig, x: number, z: number): number {
  const { waterLevel, saltings } = config.terrain
  const depth                    = waterLevel - coastBedAt(config, x, z)

  if (saltings.shoal <= 0)
    return 0

  return 1 - smoothstep(saltings.shoal * SHOAL_ONSET, saltings.shoal, depth)
}

/**
 * How much of a gutter is cut at a point, 0..1.
 *
 * Sampled in the flat's own frame — along the shore and across it — so a gutter
 * is a *line* running seaward rather than a dip at one distance out. The two
 * axes are scaled differently on purpose: the field varies quickly along the
 * shore and slowly across it, which is what turns a blob field into a set of
 * channels, and the along-shore coordinate is sheared by the distance out so
 * they meander instead of running straight down the beach.
 *
 * A ridge rather than a threshold: the gutter is where the field passes through
 * its own middle, so the cut is a narrow line with marsh either side of it,
 * which is what a creek in a saltmarsh is. A `smoothstep` on the field itself
 * would flood half the flat and leave the other half standing.
 *
 * @param across Metres along the shore from the flat's middle.
 * @param out    Metres seaward of the mean-water line.
 */
function gutterAt (config: ScapeConfig, across: number, out: number): number {
  const { gully } = config.terrain.saltings
  const seed      = config.seed ^ 0x6b2d
  const wave      = Math.max(1, gully)

  const along = across / wave + out * 0.06
  const deep  = out / (wave * 2.6)

  const field = valueNoise(along, deep, seed) * 0.66 +
    valueNoise(along * 2.11, deep * 1.7 + 5.5, seed ^ 0x3d) * 0.34

  return 1 - smoothstep(GUT_FULL, GUT_ONSET, Math.abs(field - 0.5))
}

/**
 * The flat, or `null` on an island with no coast for one.
 *
 * Pure, and a function of the config and the beck's mouth — no height field and
 * nothing else in the survey. That is what lets the height field, the terrain
 * painter, the dressing and `scape:map` all read one shape without any of them
 * having to be built in a particular order.
 *
 * @param beck The channel, and the reason the flat is where it is: silt is
 *   delivered rather than found. `null` — an island with no watercourse — has
 *   no saltings on it at all. The whole record rather than the mouth alone, so
 *   the caller hands over what it has.
 *
 * @param sand The dune belt, so the marsh is never put on the weather shore.
 * @param rock The headland, so the marsh is never put on the coast the sea is
 *   cutting back.
 *
 * @param berths The banks the boats use, so the silt keeps off the water they
 *   need. The one argument here that is not a fact about the coast, and the one
 *   that decides *when* this is solved: see {@link SaltingsConfig.clear} and
 *   `survey.ts`, where the flat is settled after the two banks for the reason
 *   the causeway is.
 */
export function solveSaltings (
  config: ScapeConfig,
  beck:   BeckMouth | null = null,
  sand:   Occupied | null = null,
  rock:   Occupied | null = null,
  berths: readonly (Vec2 | null)[] = [],
): Saltings | null {
  const saltings = config.terrain.saltings

  if (!beck || saltings.top <= 0 || saltings.out <= 0)
    return null

  const arc     = saltings.arc * Math.PI / 180
  const bearing = Math.atan2(beck.mouth.z, beck.mouth.x)

  // The two refusals, and they are the same test twice: the mouth has to be
  // outside the neighbour's own arc. The *mouth*, not this flat's whole arc —
  // a marsh whose middle is clear of the dune belt may still shade into the
  // tail of it, and that is what two coastal deposits do where they meet
  // rather than a fault, because both of them have already faded to nothing by
  // their own arc. Refusing the two arcs added together is the stricter rule
  // and it was tried: the belt's half-arc is fifty-eight degrees, so between
  // them the two refusals took half the compass and four islands in six lost a
  // marsh to a coast neither landform had anything on.
  for (const taken of [ sand, rock ])
    if (taken && Math.abs(bearingGap(bearing, taken.bearing)) < taken.arc)
      return null

  const { waterLevel } = config.terrain
  const { shoreAt }    = solveCoastline(config)

  const top      = waterLevel + saltings.top
  const slob     = waterLevel - saltings.slob
  const unitX    = Math.cos(bearing)
  const unitZ    = Math.sin(bearing)
  const cosOuter = Math.cos(arc)
  const cosInner = Math.cos(arc * ARC_INNER)

  function claimAt (x: number, z: number): number {
    const radius = Math.hypot(x, z)

    if (radius <= 0)
      return 0

    // The arc gate first, and as a dot product rather than as an angle: it
    // rejects five sixths of every island for the cost of two multiplies, and
    // this runs per terrain vertex on six islands.
    const align = (x * unitX + z * unitZ) / radius

    if (align <= cosOuter)
      return 0

    const angle = Math.atan2(z, x)
    const shore = shoreAt(angle)

    if (shore <= 0)
      return 0

    const inland = shore - radius

    if (inland <= -saltings.out || inland >= saltings.back)
      return 0

    // Seaward the band ends in the sea and has to fade into it; landward it
    // ends against ground that is already above the level it fills to, so the
    // fill is its own feather and a second one would only make the marsh shrink
    // away from the bank it runs up to.
    const edge = smoothstep(-saltings.out, -saltings.out + EDGE_FADE, inland)

    return edge *
      smoothstep(cosOuter, cosInner, align) *
      offBerths(config, berths, x, z) *
      allowanceAt(config, x, z)
  }

  function levelAt (x: number, z: number): number {
    const angle  = Math.atan2(z, x)
    const inland = shoreAt(angle) - Math.hypot(x, z)

    // The profile: the mud at the seaward edge, the marsh at the old waterline,
    // and a straight ramp between the two. Landward of the waterline it is the
    // marsh level and nothing else — a flat that went on rising inland would be
    // a ramp, and a ramp is the coast this landform exists not to be.
    const rise    = 1 - smoothstep(-saltings.out, 0, inland)
    const surface = top + (slob - top) * rise

    return surface - saltings.cut * gutterShare(x, z)
  }

  /**
   * The gutter at a point, deepening seaward: a creek is the ebb's route off
   * the marsh, so it is cut where the water leaves and dies out at its head.
   */
  function gutterShare (x: number, z: number): number {
    const angle  = Math.atan2(z, x)
    const inland = shoreAt(angle) - Math.hypot(x, z)
    const across = z * unitX - x * unitZ
    const out    = Math.max(0, -inland)
    const reach  = smoothstep(0, Math.max(1, saltings.out * GUT_REACH), out)

    return reach * gutterAt(config, across, out)
  }

  return { bearing, arc, top, slob, shoreAt, claimAt, gutterAt: gutterShare, levelAt }
}

/**
 * Fill a ground height toward the flat.
 *
 * Only ever upward, and that is the invariant the whole landform rests on:
 * silt is *deposited*, so it can raise a hollow to the level the tide floods to
 * and it can never cut into the bank behind it. A fill written as a lerp toward
 * the level would do both, and what it would cut is the one place it must not —
 * the bank the marsh runs up against, which is where the difference between the
 * two heights is largest.
 *
 * Applied after the shore shelving rather than before it, for a sharper version
 * of the causeway's reason: what is authored here is an absolute level over
 * mean water, and the shelving is a multiplier on height above it. Laid before,
 * a marsh asked for a third of a metre would come out at a seventh.
 *
 * Called per terrain vertex and per placement probe on every island, including
 * any that carries no flat, which is what the first-line return is for.
 */
export function fillSaltings (flat: Saltings | null, x: number, z: number, height: number): number {
  if (!flat)
    return height

  const claim = flat.claimAt(x, z)

  if (claim <= 0)
    return height

  const level = flat.levelAt(x, z)

  return level <= height ? height : height + (level - height) * claim
}

/**
 * How much of the flat is under a point, 0..1.
 *
 * The one function the paint, the scatter, the stats and the tests all read, so
 * that the mud, the sward growing on it and the number in `scape:map` describe
 * one marsh rather than three that agree today.
 */
export function saltingsClaim (flat: Saltings | null, x: number, z: number): number {
  return flat ? flat.claimAt(x, z) : 0
}

/**
 * Metres of freeboard over the marsh top the flat's own surface gives out in.
 *
 * The claim is the *shape* of the flat — an arc, a band and a bottom — and it
 * says nothing about what the ground inside it is doing. Inland of the old
 * waterline a good deal of that ground is the bank the marsh runs up against,
 * standing metres over the level the silt filled to, and a paint keyed on the
 * claim alone spreads mud and salt turf up a hillside. So the two painted
 * shares are narrowed to ground standing at about the level the flat is at, and
 * this is the width of that fade.
 */
const FACE_FADE = 0.25

/**
 * How much of a point is the flat's own surface, 0..1.
 *
 * The claim, narrowed to ground standing at the level the silt filled toward.
 * Keyed on the *drawn* height handed in rather than on the level the fill aimed
 * at, and that distinction is the whole of why this takes a height: the gutters
 * are cut into the level, the beck is carved through it afterwards, and the
 * bank behind is above it — so the ground the flat actually ended up occupying
 * is a different set from the ground the fill was aimed at.
 */
export function saltingsFace (
  config: ScapeConfig,
  flat:   Saltings | null,
  x:      number,
  z:      number,
  height: number,
): number {
  const claim = saltingsClaim(flat, x, z)

  if (claim <= 0)
    return 0

  const { waterLevel, saltings } = config.terrain

  return claim * (1 - smoothstep(saltings.top, saltings.top + FACE_FADE, height - waterLevel))
}

/**
 * How much salt-marsh turf is at a point, 0..1.
 *
 * The face, narrowed again to the part of it that spends most of the month out
 * of the water. Below `saltings.sward` the ground is bare mud — flooded by
 * every tide there is, and nothing roots in it — and by the marsh top it is
 * unbroken sward.
 */
export function saltingsTurf (
  config: ScapeConfig,
  flat:   Saltings | null,
  x:      number,
  z:      number,
  height: number,
): number {
  const face = saltingsFace(config, flat, x, z, height)

  if (face <= 0)
    return 0

  const { waterLevel, saltings } = config.terrain

  return face * smoothstep(saltings.sward, saltings.top, height - waterLevel)
}


/** What the flat came out as, for `scape:map` and for the tests. */
export interface SaltingsReport {

  /** The bearing the flat lies on, in degrees. */
  bearing: number

  /** Metres of coast the flat runs along, measured at the old waterline. */
  length: number

  /**
   * Square metres of the flat standing between low and high water at springs.
   *
   * The landform, in one number: ground the sea covers and uncovers. A marsh
   * whose surface came out over the top of the tide, or under the bottom of it,
   * is a field or a lagoon, and either way this is what goes to nothing.
   */
  tidal: number

  /** Square metres of the flat standing high enough to carry turf. */
  turf: number

  /** Share of the flat the drainage gutters have cut into, as a percentage. */
  gutters: number

  /**
   * Metres the waterline walks across the flat between low and high springs.
   *
   * The claim the landform exists to make, and the one number here a still
   * cannot check without two of them. The surface stands inside the spring
   * range from end to end, so the sea covers the whole flat at high water and
   * leaves the whole of it at low — which means this is the width of the flat
   * as well as the distance the shore moves, and on a flat that stopped being
   * flat it is the first number to go.
   */
  walk: number

  /**
   * The least freeboard any turf was found on, in metres.
   *
   * The other half of what `tidal` says, from underneath: turf on ground at or
   * below mean water is a sward growing in the sea.
   */
  lowest: number
}

/** Metres between probes on the march out along one bearing. */
const REPORT_STEP = 0.5

/**
 * The flat, walked along the coast it lies on.
 *
 * Eight numbers, and most of them are claims a still cannot check. A screenshot
 * of a muddy shore says nothing about whether the silt raised any ground at
 * all, whether the surface came out inside the tide's own range, or whether the
 * gutters cut anything — and nothing whatever about the one the landform exists
 * for, which is how far the waterline moves across it between low water and
 * high. That is `walk`, and on a flat that failed to be flat it is the first
 * number to go.
 *
 * Marched along the coastline's own bearings, exactly as the dune belt's report
 * is, so the two landforms are measured by one instrument. Areas come out of
 * the polar element — a step of the march is `REPORT_STEP` deep and as wide as
 * the bearing step is at that radius — rather than off a square grid, because a
 * band about a coast is the shape polar coordinates are for.
 */
/** What one bearing's march across the flat added up to. */
interface Reach {

  /** Square metres of it standing between low and high water at springs. */
  tidal: number

  /** Square metres of it standing high enough to carry turf. */
  turf: number

  /** Probes inside the flat, and probes of those a gutter had cut. */
  claimed: number
  gutters: number

  /** The least freeboard turf was found on, or `Infinity` where none was. */
  lowest: number

  /** Metres the waterline walks on this bearing, or 0 where it does not. */
  walk: number
}

/**
 * March out along one bearing and measure what the flat is doing on it.
 *
 * Split out of {@link measureSaltings} rather than nested in it because the
 * outer loop is the *survey* and this is the measurement — and because six
 * tallies and two waterlines in one function is past the lint config's ceiling,
 * which it is right about: a march that also owns the totals is a march you
 * cannot read without holding the totals in your head.
 */
function reachAlong (
  config:   ScapeConfig,
  flat:     Saltings,
  heightAt: (x: number, z: number) => number,
  angle:    number,
  step:     number,
): Reach {
  const { waterLevel, saltings } = config.terrain
  const springs                  = config.tide.range * 0.5
  const shore                    = flat.shoreAt(angle)
  const cos                      = Math.cos(angle)
  const sin                      = Math.sin(angle)

  const reach: Reach = { tidal: 0, turf: 0, claimed: 0, gutters: 0, lowest: Infinity, walk: 0 }

  // The two waterlines on this bearing, as radii, and they are the two ends of
  // the flat rather than two contours across it: the surface stands inside the
  // spring range from end to end, so at high water the whole marsh is under the
  // sea and at low water the whole of it is out of it.
  let highLine = 0
  let lowLine  = 0

  for (let inland = saltings.back; inland >= -saltings.out; inland -= REPORT_STEP) {
    const radius = shore - inland

    if (radius <= 0 || flat.claimAt(cos * radius, sin * radius) <= 0)
      continue

    const x         = cos * radius
    const z         = sin * radius
    const drawn     = heightAt(x, z)
    const freeboard = drawn - waterLevel
    const cell      = REPORT_STEP * step * radius

    reach.claimed += 1
    reach.gutters += flat.gutterAt(x, z) > 0.4 ? 1 : 0
    reach.tidal   += freeboard > -springs && freeboard < springs ? cell : 0

    if (saltingsTurf(config, flat, x, z, drawn) > 0.5) {
      reach.turf  += cell
      reach.lowest = Math.min(reach.lowest, freeboard)
    }

    if (highLine === 0 && freeboard <= springs)
      highLine = radius

    if (freeboard > -springs)
      lowLine = radius
  }

  reach.walk = highLine > 0 && lowLine > highLine ? lowLine - highLine : 0
  return reach
}

export function measureSaltings (
  config:   ScapeConfig,
  flat:     Saltings | null,
  heightAt: (x: number, z: number) => number,
): SaltingsReport | null {
  if (!flat)
    return null

  const step         = Math.PI * 2 / COAST_BEARINGS
  const bearings     = Math.floor(flat.arc / step)
  const total: Reach = { tidal: 0, turf: 0, claimed: 0, gutters: 0, lowest: Infinity, walk: 0 }

  let sampled = 0
  let shores  = 0

  for (let index = -bearings; index <= bearings; index += 1) {
    const angle = flat.bearing + index * step
    const shore = flat.shoreAt(angle)

    if (shore <= 0)
      continue

    const reach = reachAlong(config, flat, heightAt, angle, step)

    total.tidal   += reach.tidal
    total.turf    += reach.turf
    total.claimed += reach.claimed
    total.gutters += reach.gutters
    total.lowest = Math.min(total.lowest, reach.lowest)
    total.walk   = Math.max(total.walk, reach.walk)

    sampled += 1
    shores  += shore
  }

  return {
    bearing: (flat.bearing * 180 / Math.PI % 360 + 360) % 360,
    length:  sampled === 0 ? 0 : shores / sampled * flat.arc * 2,
    tidal:   total.tidal,
    turf:    total.turf,
    gutters: total.claimed === 0 ? 0 : total.gutters / total.claimed * 100,
    walk:    total.walk,
    lowest:  total.lowest === Infinity ? 0 : total.lowest,
  }
}
