import { smoothstep } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { valueNoise } from '../noise.ts'
import { COAST_BEARINGS, bearingGap, coastBedAt, solveCoastline } from './coast.ts'
import type { Vec2 } from './path.ts'


/**
 * The crag on the steep shore.
 *
 * A landform written against the coastline, like the dune belt and for the same
 * reason — see `coast.ts`, which both of them solve the waterline through. What
 * differs is which coast it goes on and what it does when it gets there.
 *
 * ## which shore
 *
 * The steepest one. Where the sea meets ground that shelves, it makes a beach
 * out of what it takes away; where it meets ground that already stands up to
 * it, it takes the foot out from under it and the rest stays standing. So the
 * search measures the bare coast's own gradient over the first
 * {@link PROBE_REACH} metres inland on every bearing and puts the headland on
 * the best of them, subject to three refusals: not the shore the sand is on,
 * not across the beck's mouth, and not on a coast that fails
 * `crag.steep`. That last one is what leaves the gentle islands without one.
 *
 * This is deliberately *not* the weather shore. The dune belt has that coast,
 * for a physical reason rather than a bookkeeping one — a windward shore with
 * a sand supply builds a ridge — and putting a cliff on the same bearing would
 * be two landforms arguing about one beach. Steepness is the property that
 * actually decides which of the two a coast becomes, and reading it means the
 * two systems partition the island instead of overwriting each other.
 *
 * ## what it does to the ground
 *
 * It raises, and only raises. A cliff is the rock the sea did *not* take, so
 * what belongs in the height field is a headland standing over the coast either
 * side of it, never a bite out of an island the farm was already sited on. The
 * profile, walking in from open water:
 *
 * - the **platform**, `crag.bench` metres of it, cut off at about the level the
 *   sea did the cutting at and awash for much of the tide;
 * - the **talus**, a ramp of broken rock heaped against the bottom of the face,
 *   because a cliff sheds and what comes off it stays where it lands;
 * - the **face**, `crag.height` of rock gathered into `crag.face` of ground;
 * - the **top**, held at the lip and then given back to whatever the island was
 *   doing anyway over the rest of `crag.back`.
 *
 * And clefts cut through the lot of it along the shore — a geo is the local
 * word — because a cliff line drawn as an arc reads as masonry.
 *
 * ## what it does not touch
 *
 * The layout. The yard, the plots, the track and the pasture are all sited
 * before this is solved, exactly as the dune belt is, so the headland is laid
 * onto the island the farm already chose. The harbour and the pier are found
 * *after* it, against ground that has it in — which is the right way round too:
 * a cliff is not somewhere you land a boat, and the searches that look for a
 * bank find that out by measuring it.
 */
export interface Crag {

  /** Radians, and the middle of the headland: the steepest coast found. */
  bearing: number

  /** Half-angle of the headland, in radians. */
  arc: number

  /** World height of the clifftop. */
  lip: number

  /** The gradient of the bare coast the siting search picked this bearing for. */
  steepness: number

  /**
   * Metres from the island's middle to the waterline on a bearing, or 0 where
   * that bearing has no dry land on it at all. The island's, not the crag's —
   * see `coast.ts`.
   */
  shoreAt(angle: number): number

  /**
   * The world height the rock stands at, and how much of the point is crag.
   *
   * Both at once and into a caller-owned record, because every reader needs
   * both and the arc gate, the coastline lookup and the cleft field are the
   * expensive part of answering either. Called per terrain vertex on six
   * islands, so it allocates nothing.
   */
  formAt(x: number, z: number, target: CragForm): CragForm
}

/** What the crag is doing at one point. See {@link Crag.formAt}. */
export interface CragForm {

  /** How much of the crag's own shape stands here, 0..1. */
  claim: number

  /** The world height the rock would stand at, where the claim is full. */
  level: number

  /**
   * How near the foot of the face this is, 0..1.
   *
   * Peaks on the talus ramp and is gone by the top of the face and by the outer
   * edge of the platform. What the boulders are scattered by, and the reason
   * the form is a record rather than a number: "is this crag" and "is this the
   * bottom of it" are two questions, and the scree only belongs to the second.
   */
  foot: number
}


/** Metres inland the siting search measures the coast's own gradient over. */
const PROBE_REACH = 10

/**
 * Where the arc's own feather starts, as a fraction of the half-angle.
 *
 * The headland is at full height within this and gone by the half-angle, so it
 * tapers into the coast either side rather than ending in a wall of rock facing
 * along the beach. Tighter than the dune belt's, because a headland *is* mostly
 * its middle — feathered as gently as a belt of sand it would read as a dome.
 */
const ARC_INNER = 0.72

/** Metres of ramp at the platform's outer edge, so it is a shelf and not a box. */
const EDGE_RAMP = 1.1

/** Where the clifftop starts being given back to the island, as a fraction of `back`. */
const TOP_HOLD = 0.42

/** Where the cleft field starts cutting and where it has cut all it will. */
const GEO_ONSET = 0.56
const GEO_FULL  = 0.88

/**
 * How much of the lip the weakest rock costs, as a share.
 *
 * The gentle half of {@link weaknessAt}. A quarter, which on a seven-metre lip
 * is a metre and three quarters between the boldest part of a headland and the
 * lowest — plainly a varying cliff top, and nowhere near enough to make the low
 * end read as a different landform.
 */
const LIP_SWING = 0.25

/**
 * Metres of freeboard the platform fades out over, past the depth it may be
 * cut in.
 *
 * The ground's veto, and the reason the platform reads the bed rather than
 * trusting the arc: a shelf is rock the sea cut down, so it can only exist
 * where there was rock within reach of the cutting. The falloff drops four and
 * a half metres in the first five off the home island's steep coast, and a
 * platform written as a flat width alone stood the last of itself on four
 * metres of invented rock over open water.
 */
const SHELF_FADE = 1.2

/**
 * How near the dune belt a crag may be sited, as a share of the two arcs.
 *
 * One whole arc of clear coast between the two landforms' edges. Less and the
 * sand's landward apron runs onto the platform, which is a beach at the bottom
 * of a cliff — a real thing on a real coast, and not one either of these two
 * systems is written to draw.
 */
const SAND_CLEAR = 1

/** How near the beck's mouth a crag may be sited, as a share of its own arc. */
const MOUTH_CLEAR = 1.35

/**
 * The least of the arc that has to find a coast at all.
 *
 * A headland sited where the coast warp has bitten a bay out of the island is a
 * cliff with no ground under half of it. The search would otherwise be happy to
 * pick it: the one bearing that still has land can be the steepest on the
 * island precisely because it is the side of a hole.
 */
const ARC_COVER = 0.7


/** As much of the beck as the siting search reads. See {@link solveCrag}. */
interface BeckMouth {

  /** Where the channel gives up and becomes sea, in the island's own frame. */
  mouth: Vec2
}

/**
 * How steeply the bare coast climbs on one bearing, in metres per metre.
 *
 * Measured on the falloff's own ground rather than on the drawn ground, for the
 * reason `coastBedAt` exists: the shelving flattens the first metres over the
 * water on *every* coast, so a gradient read off the terrain would say every
 * shore in the archipelago is the same shore. What decides whether the sea cuts
 * a cliff is the rock it arrives at, which is this.
 *
 * 0 on a bearing with no land, and 0 where the ground inland is *lower* than
 * the coast — a bearing running into a bay does not get to be a headland
 * because its waterline happens to be steep at one probe.
 */
function coastGradient (config: ScapeConfig, angle: number, shore: number): number {
  if (shore <= 0)
    return 0

  const { waterLevel } = config.terrain
  const cos            = Math.cos(angle)
  const sin            = Math.sin(angle)

  let lowest = Infinity
  let rise   = 0

  // Every probe rather than the far one alone: a coast that climbs two metres
  // in three and then falls back into a hollow is not a cliff coast, and the
  // endpoint on its own cannot tell the difference.
  for (let inland = 1; inland <= PROBE_REACH; inland += 1) {
    const radius = shore - inland
    const height = coastBedAt(config, cos * radius, sin * radius) - waterLevel

    lowest = Math.min(lowest, height)
    rise   = height / inland
  }

  return lowest < 0 ? 0 : rise
}

/**
 * How weak the rock is along the shore, 0..1.
 *
 * One field with two jobs, and they are the same fact read at two strengths:
 * where the rock is poorer the sea takes the face down a little, and where it
 * is poorest the sea takes it away altogether and leaves a cleft — a geo, on
 * this coast. Two systems keyed on one number is the point. A cliff line with
 * clefts cut into an otherwise constant lip reads as a wall with doors in it;
 * a lip that wanders and gives out where it has wandered lowest reads as rock.
 *
 * Sampled along the shore rather than across it, so a cleft is a slot cut
 * *into* the headland — one you could take a boat into — rather than a dip in
 * the rock everywhere at one distance inland. Two octaves, because one on the
 * unit lattice gives evenly spaced clefts, and evenly spaced anything reads as
 * machinery. The same construction the dune belt's blowouts use, and
 * deliberately so: they are the same kind of fact about the same kind of coast.
 *
 * @param along Metres along the shore from the headland's middle.
 */
function weaknessAt (config: ScapeConfig, along: number): number {
  const { geo } = config.terrain.crag
  const seed    = config.seed ^ 0x3c19
  const at      = along / Math.max(1, geo)

  return valueNoise(at, 0, seed) * 0.62 +
    valueNoise(at * 2.13, 7.5, seed ^ 0x71) * 0.38
}

/**
 * The bearing the crag goes on, or `null` if this island has no coast for one.
 *
 * @param sand The dune belt's own bearing and half-arc, when there is one, so
 *   the two landforms cannot be put on the same shore. See {@link SAND_CLEAR}.
 *
 * @param beck The channel, when the island has one. A headland thrown across
 *   an estuary dams it: the channel is cut into the ground *before* this is
 *   laid, so the crag would stand in the cut and the inlet would end in a wall
 *   of rock. See {@link MOUTH_CLEAR}.
 */
function siteCrag (
  config: ScapeConfig,
  shoreAt: (angle: number) => number,
  sand: { bearing: number, arc: number } | null,
  beck: BeckMouth | null,
): { bearing: number, steepness: number } | null {
  const crag       = config.terrain.crag
  const arc        = crag.arc * Math.PI / 180
  const step       = Math.PI * 2 / COAST_BEARINGS
  const mouthAngle = beck ? Math.atan2(beck.mouth.z, beck.mouth.x) : null

  let bestBearing   = 0
  let bestSteepness = 0

  for (let index = 0; index < COAST_BEARINGS; index += 1) {
    const angle = index * step

    if (sand && Math.abs(bearingGap(angle, sand.bearing)) < (sand.arc + arc) * SAND_CLEAR)
      continue

    if (mouthAngle !== null && Math.abs(bearingGap(angle, mouthAngle)) < arc * MOUTH_CLEAR)
      continue

    // The arc has to have a coast in it, not just a bearing. Walked at the
    // coastline's own sampling, which is finer than the arc by a wide margin.
    let covered = 0
    let across  = 0

    for (let offset = -arc; offset <= arc; offset += step) {
      across += 1

      if (shoreAt(angle + offset) > 0)
        covered += 1
    }

    if (across === 0 || covered / across < ARC_COVER)
      continue

    const steepness = coastGradient(config, angle, shoreAt(angle))

    if (steepness > bestSteepness) {
      bestSteepness = steepness
      bestBearing   = angle
    }
  }

  return bestSteepness >= crag.steep ? { bearing: bestBearing, steepness: bestSteepness } : null
}

/**
 * The headland, or `null` on an island with no coast steep enough for one.
 *
 * Pure, and a function of the config and the beck's mouth — no height field and
 * nothing else in the survey. That is what lets the height field, the terrain
 * painter, the dressing and `scape:map` all read one shape without any of them
 * having to be built in a particular order.
 *
 * @param sand The dune belt, so the two are never sited on one shore.
 * @param beck The channel, so the crag is never thrown across its mouth. The
 *   whole record rather than the mouth alone, so the caller hands over what it
 *   has — `layout.creek` — instead of unwrapping an optional at every call
 *   site and branching on the result.
 */
export function solveCrag (
  config: ScapeConfig,
  sand: { bearing: number, arc: number } | null = null,
  beck: BeckMouth | null = null,
): Crag | null {
  const crag = config.terrain.crag

  if (crag.height <= 0 || crag.face <= 0 || crag.back <= crag.face)
    return null

  const { shoreAt } = solveCoastline(config)
  const site        = siteCrag(config, shoreAt, sand, beck)

  if (!site)
    return null

  const { waterLevel } = config.terrain
  const arc            = crag.arc * Math.PI / 180
  const unitX          = Math.cos(site.bearing)
  const unitZ          = Math.sin(site.bearing)
  const cosOuter       = Math.cos(arc)
  const cosInner       = Math.cos(arc * ARC_INNER)

  const bench = waterLevel + crag.awash
  const lip   = waterLevel + crag.height
  const hold  = crag.face + (crag.back - crag.face) * TOP_HOLD

  /** Metres of scree standing on the platform, at a distance from the foot. */
  const talusAt = (inland: number): number =>
    inland >= 0 || crag.bench <= 0
      ? 0
      : crag.talus * (1 - smoothstep(0, crag.bench * 0.7, -inland)) ** 2

  function formAt (x: number, z: number, target: CragForm): CragForm {
    target.claim = 0
    target.level = 0
    target.foot  = 0

    const radius = Math.hypot(x, z)

    if (radius <= 0)
      return target

    // The arc gate first, and as a dot product rather than as an angle: it
    // rejects nine tenths of every island for the cost of two multiplies, and
    // this runs per terrain vertex on six islands.
    const align = (x * unitX + z * unitZ) / radius

    if (align <= cosOuter)
      return target

    const angle = Math.atan2(z, x)
    const shore = shoreAt(angle)

    if (shore <= 0)
      return target

    const inland = shore - radius

    if (inland <= -crag.bench || inland >= crag.back)
      return target

    // Along the shore, which is the headland's own direction turned a quarter
    // turn. The clefts are cut in this axis and in no other.
    const along = z * unitX - x * unitZ
    const weak  = weaknessAt(config, along)
    const cleft = 1 - crag.notch * smoothstep(GEO_ONSET, GEO_FULL, weak)

    if (cleft <= 0)
      return target

    let claim = smoothstep(cosOuter, cosInner, align) *
      cleft *
      smoothstep(-crag.bench, -crag.bench + EDGE_RAMP, inland) *
      (1 - smoothstep(hold, crag.back, inland))

    // The bed is read last and only seaward of the waterline, which is what
    // keeps it affordable: every gate above is a multiply or a table lookup,
    // and between them they have already rejected all but the platform on one
    // headland of one island. What is left pays for five noise samples to ask
    // the sea floor whether there was ever rock here to cut. See
    // {@link SHELF_FADE}.
    if (inland < 0)
      claim *= 1 - smoothstep(crag.depth, crag.depth + SHELF_FADE, waterLevel - coastBedAt(config, x, z))

    if (claim <= 0)
      return target

    // The face, and the one place this profile is not a straight line: the drop
    // is eased at both ends rather than ramped, so the lip is a lip and the
    // foot meets the platform instead of running into it at a corner.
    const up   = smoothstep(0, crag.face, inland)
    const rock = bench + (lip - bench) * (1 - LIP_SWING * weak) * up

    target.claim = claim
    target.level = rock + talusAt(inland)
    target.foot  = (1 - smoothstep(0, crag.face * 0.55, Math.max(0, inland))) *
      (1 - smoothstep(0, crag.bench, Math.max(0, -inland))) *
      claim

    return target
  }

  return { bearing: site.bearing, arc, lip, steepness: site.steepness, shoreAt, formAt }
}


/**
 * The scratch the two convenience readers share.
 *
 * Module state, and the one piece of it in here — the same trade
 * `HeightField.normalAt` makes and for the same reason. `formAt` answers two
 * questions at once because finding them costs the same; a caller that wants
 * one of them should not have to allocate a record per terrain vertex to say
 * so. Nothing holds a reference to it past the call that filled it.
 */
const scratch: CragForm = { claim: 0, level: 0, foot: 0 }


/**
 * Stand the rock up over a ground height.
 *
 * **Only ever upward.** The claim scales how much of the crag's own level the
 * ground takes, and the `max` is what makes it an invariant rather than an
 * intention: on ground already standing higher than the lip — the inland end of
 * a steep coast, where the island is climbing anyway — the crag has nothing to
 * add and adds nothing. See {@link CragReport.cut}, which is this stated as a
 * number `scape:map` prints.
 *
 * Applied *after* the shore shelving, for the causeway's reason rather than the
 * dune belt's: what is authored here is an absolute level over mean water, and
 * the shelving is a multiplier on height above the water. Laid before it, a lip
 * asked to stand seven metres up would be compressed to about four.
 */
export function raiseCrag (crag: Crag | null, x: number, z: number, height: number): number {
  if (!crag)
    return height

  const form = crag.formAt(x, z, scratch)

  return height + Math.max(0, form.level - height) * form.claim
}

/**
 * How much of the headland stands at a point, 0..1.
 *
 * The one function the paint, the scatter, the stats and the tests all read, so
 * that the bare rock, the boulders on the platform and the number in
 * `scape:map` describe one crag rather than three that agree today.
 */
export function cragClaim (crag: Crag | null, x: number, z: number): number {
  return crag ? crag.formAt(x, z, scratch).claim : 0
}

/** How near the foot of the face a point is, 0..1. See {@link CragForm.foot}. */
export function cragFoot (crag: Crag | null, x: number, z: number): number {
  return crag ? crag.formAt(x, z, scratch).foot : 0
}


/** What the headland came out as, for `scape:map` and for the tests. */
export interface CragReport {

  /** The bearing it stands on, in degrees. */
  bearing: number

  /** The gradient of the bare coast that won the siting search. */
  steepness: number

  /** Metres over mean water the highest drawn ground on the headland stands. */
  lip: number

  /** The steepest drawn fall on the face, in degrees. */
  face: number

  /** Metres of coast the cliff line runs along, measured at the waterline. */
  length: number

  /** Bearings inside the arc the clefts have taken under three fifths of the lip. */
  clefts: number

  /**
   * Metres over mean water the *lowest* bearing of the cliff line stands.
   *
   * The other half of `lip`, and the pair is the claim: a cliff line that
   * wanders is two different numbers here, and one that was laid out with a
   * compass is the same number twice. The clefts alone cannot say it — they
   * count the bearings the sea took away altogether, and most of a real
   * headland's variation is rock that merely came out lower.
   */
  least: number

  /** The most metres of rock the crag stood over the coast that was there. */
  standing: number

  /**
   * The most metres of ground it took away.
   *
   * The invariant, said as a number. A crag is the rock the sea did *not* take,
   * so this is zero; anything else is a landform that has started cutting into
   * an island the farm was already sited on, and no pose in the tour is pointed
   * at the coast it would be eating.
   */
  cut: number

  /** Metres of water off the outer edge of the platform. */
  plunge: number
}

/** Metres between probes on the inland walk the report takes. */
const REPORT_STEP = 0.4

/**
 * Walk the headland and measure it.
 *
 * Along the arc at the coastline's own bearings and across it at 0.4 m steps,
 * which is a couple of thousand probes — this is an instrument, not a build
 * step.
 *
 * Measured against the bare coast rather than against the drawn ground, exactly
 * as the dune belt's report is: what is being checked is what the landform did,
 * and the shelving, the plots and the track all happen to it afterwards. The
 * two differ by less than a tenth of a metre anywhere the crag actually stands,
 * because the shelving only ever lowers ground toward a waterline the lip is
 * seven metres above.
 */
/**
 * One bearing of the headland, walked from the platform's outer edge inland.
 *
 * Split out of {@link measureCrag} because the walk carries five running
 * answers of its own and the report carries eight, and one function holding
 * thirteen accumulators is a function nobody can check against the thing it is
 * measuring.
 */
interface CragBearing {

  /** The highest the drawn ground stands over mean water on this bearing. */
  ridge: number

  /** The steepest drawn fall above the foot, in radians. */
  face: number

  /** The most metres of rock the crag stood over the coast that was here. */
  standing: number

  /** The most metres it took away. Zero, by construction — see {@link CragReport.cut}. */
  cut: number
}

function walkBearing (
  config: ScapeConfig,
  crag:   Crag,
  angle:  number,
  shore:  number,
  form:   CragForm,
): CragBearing {
  const { waterLevel } = config.terrain
  const settings       = config.terrain.crag
  const cos            = Math.cos(angle)
  const sin            = Math.sin(angle)

  const walked: CragBearing = { ridge: 0, face: 0, standing: 0, cut: 0 }
  let last = 0

  for (let inland = -settings.bench; inland <= settings.back; inland += REPORT_STEP) {
    const radius = shore - inland
    const x      = cos * radius
    const z      = sin * radius
    const bed    = coastBedAt(config, x, z)

    crag.formAt(x, z, form)

    const drawn = bed + Math.max(0, form.level - bed) * form.claim

    walked.standing = Math.max(walked.standing, drawn - bed)
    walked.cut      = Math.max(walked.cut, bed - drawn)
    walked.ridge    = Math.max(walked.ridge, drawn - waterLevel)

    // The fall between two probes, as an angle, and only from the foot inland.
    // Seaward of that the number would be the *submarine* slope — the falloff
    // drops eight metres in the first ten off some of these coasts, and a
    // platform laid over the top of that makes an eighty-degree face out of
    // water nobody can see.
    if (inland > 0)
      walked.face = Math.max(walked.face, Math.atan2(drawn - last, REPORT_STEP))

    last = drawn
  }

  return walked
}

export function measureCrag (config: ScapeConfig, crag: Crag | null): CragReport | null {
  if (!crag)
    return null

  const { waterLevel }                                                 = config.terrain
  const settings                                                       = config.terrain.crag
  const step                                                           = Math.PI * 2 / COAST_BEARINGS
  const bearings                                                       = Math.floor(crag.arc / step)
  const form: CragForm                                                 = { claim: 0, level: 0, foot: 0 }
  const walks: { angle: number, shore: number, walked: CragBearing }[] = []

  for (let index = -bearings; index <= bearings; index += 1) {
    const angle = crag.bearing + index * step
    const shore = crag.shoreAt(angle)

    if (shore > 0)
      walks.push({ angle, shore, walked: walkBearing(config, crag, angle, shore, form) })
  }

  const shores = walks.reduce((total, walk) => total + walk.shore, 0)
  const plunge = walks.reduce((deepest, walk) => {
    // The water off the platform's outer edge, a couple of metres out from
    // where the crag's own claim has given up.
    const off = walk.shore + settings.bench + 2
    const bed = coastBedAt(config, Math.cos(walk.angle) * off, Math.sin(walk.angle) * off)

    return Math.max(deepest, waterLevel - bed)
  }, 0)

  const ridges = walks.map(walk => walk.walked.ridge).filter(ridge => ridge > 0)

  return {
    bearing:   (crag.bearing * 180 / Math.PI % 360 + 360) % 360,
    steepness: crag.steepness,
    lip:       Math.max(0, ...ridges),
    face:      Math.max(0, ...walks.map(walk => walk.walked.face)) * 180 / Math.PI,
    length:    walks.length === 0 ? 0 : shores / walks.length * crag.arc * 2,

    // Six tenths, because a cleft is a place the cliff *gave out* rather than a
    // hole through it: the lip already wanders by a quarter of its height on
    // the weak rock, so anything under this is rock the sea took rather than
    // rock that came out low.
    clefts:   walks.filter(walk => walk.walked.ridge < settings.height * 0.6).length,
    least:    ridges.length === 0 ? 0 : Math.min(...ridges),
    standing: Math.max(0, ...walks.map(walk => walk.walked.standing)),
    cut:      Math.max(0, ...walks.map(walk => walk.walked.cut)),
    plunge,
  }
}
