import { smoothstep } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { valueNoise } from '../noise.ts'
import { baseAt, remapRelief, sinkToIsland } from './layout.ts'


/**
 * The dune belt on the weather shore.
 *
 * A landform written against the *coastline* rather than against a height, and
 * that is the whole of why it is a solved shape instead of a closed form like
 * the fjord's carve. Everything else in this scape that answers to the shore
 * answers to it by freeboard — the beach shelves over the first metres above
 * mean water, the snow line starts a couple of metres up, the salt band is the
 * first two and a half metres of an exposed coast. Freeboard is a fine proxy
 * for "near the sea" and a poor one for "twelve metres in from the water": the
 * coast warp means the ground climbs at a different rate on every bearing, so a
 * band written at a height is wide in the bays and a stripe on the headlands,
 * and a dune belt drawn that way reads as a contour rather than as a coast.
 *
 * So the belt is solved: the waterline's radius is found once per bearing, and
 * every query is a distance *inland* of it. The table is the only state, it is
 * a pure function of the config, and it is small — see {@link BEARINGS}.
 *
 * ## which shore
 *
 * The one the weather is on. `wind.bearing` is the direction the wind blows
 * toward, so the shore it arrives at is the one at the opposite bearing from the
 * island's middle — the same upwind sense `treeline.ts` walks in, and read from
 * the same base bearing rather than from this instant's gust, because a dune is
 * a century of weather and not a Tuesday. That the two systems read one number
 * is the point: the coast that loses its trees to the salt is the coast that
 * gets the sand, and they are that way round for the same reason.
 *
 * ## what it does not touch
 *
 * The layout. The yard, the plots, the track and the pasture are all sited
 * before this is solved, exactly as the tarn, the cutting and the causeway are —
 * so the belt is laid onto the island the farm already chose, and the levelling
 * that follows it in the height field flattens whatever sand ends up under a
 * field. That is the right way round: a farm is not built on a dune, and a farm
 * that was there first does not move because one appeared.
 */
export interface DuneBelt {

  /** Radians, and the middle of the belt: the bearing the weather comes from. */
  bearing: number

  /** Half-angle of the belt, in radians. */
  arc: number

  /** Metres of sand at the ridge — the belt's own scale, for readers of the claim. */
  height: number

  /**
   * Metres from the island's middle to the waterline on a bearing, or 0 where
   * that bearing has no dry land on it at all.
   *
   * @param angle Radians, in the island's own frame, `atan2(z, x)`.
   */
  shoreAt(angle: number): number

  /**
   * Metres inland the belt reaches on a bearing — `dunes.back`, or as much of
   * it as the island can afford. See {@link MAX_REACH}.
   */
  reachAt(angle: number): number

  /**
   * Metres of sand standing on the ground at a point, in the island's own frame.
   *
   * The single authority, and it takes nothing but a position: the belt asks the
   * ground itself what it is allowed, rather than being handed a height by
   * whoever is calling. That is what lets the height field, the terrain painter,
   * the dressing and `scape:map` all read one number — the painter has the drawn
   * ground, which already has this sand in it, and a rule keyed on *that* would
   * paint a different belt from the one it is standing on.
   */
  depthAt(x: number, z: number): number
}


/**
 * Bearings the waterline is solved at.
 *
 * Forty-eight is 7.5° apart, which on the home island's 44 m of land is a
 * sample every five and a half metres of coast — finer than the belt's own
 * blowouts and far finer than the ridge, so the interpolation between two
 * samples never invents a shape. It is also the whole cost of this landform at
 * build: forty-eight marches of a few dozen probes, against a terrain patch that
 * samples the ground a quarter of a million times.
 */
const BEARINGS = 48

/** Metres between probes on the inward march, before the refinement. */
const MARCH_STEP = 1.5

/** Bisection passes that turn a 1.5 m bracket into a waterline. Four is 9 cm. */
const REFINE = 4

/**
 * Where the arc's own feather starts, as a fraction of the half-angle.
 *
 * The belt is at full strength within this and gone by the half-angle, so the
 * ends of it taper into the bare coast either side instead of stopping dead.
 * Without the taper the two ends of the belt are vertical walls of sand facing
 * along the beach, which is the one thing a windward shore never has.
 */
const ARC_INNER = 0.55

/**
 * Metres of freeboard the sand fades in over, at the very foot of the belt.
 *
 * The invariant, and the reason the belt reads the ground itself rather than
 * trusting its own table: **no sand is ever laid on ground at or below mean
 * water.** The reach is measured radially and a coast is not a circle, so on a
 * bearing where the waterline wanders — the mouth of an inlet, the inside of a
 * bay — a distance solved from the table can land in the sea. A veto keyed on
 * the ground cannot, whatever the table says.
 */
const DRY_HOLD = 0.35

/**
 * Metres of freeboard the sand gives out over, above the ceiling.
 *
 * The other half of the ground's answer, and the second thing `scape:map` caught.
 * The reach alone says how far *in* the wind carried sand; it says nothing about
 * how far *up*, and on the two lowest islands in the archipelago the highest
 * ground is inside the coastal fringe — so the belt was raising the summit and
 * the map read a peak that was made of sand. Blown sand climbs a couple of
 * metres over the strand and stops; it does not stand on a hilltop. So the
 * ground has two vetoes rather than one, and this is the width of the second's
 * fade — `dunes.climb` is where it starts.
 */
const CLIMB_FADE = 1.8

/**
 * The most of the way to the middle a belt may reach, as a fraction of the
 * island's own radius on that bearing.
 *
 * The one place this landform's authored metres meet an island's size, and it
 * had to be measured rather than assumed. `dunes.back` is written in metres
 * because a dune coast *is* a fact about sand and wind rather than about how big
 * the island is — but the archipelago's islands are five different sizes, and a
 * belt running twenty-four metres inland of the coast is the outer half of the
 * home island's fringe and the *entire* ridge island, summit included. The first
 * cut of this had no cap and `scape:map` said so at once: the ridge's peak stood
 * 1.4 m higher than the rock under it, which is a landform that had stopped
 * being a coast and become a coat of sand over a whole island.
 *
 * Two fifths, so the middle three fifths of any island is ground the wind never
 * reached. A cap rather than a scale, because scaling would make the home
 * island's belt a fraction of a small island's in proportion to nothing —
 * an island large enough to carry the authored belt carries exactly it.
 */
const MAX_REACH = 0.4

/** Where the blowout field starts cutting and where it has cut all it will. */
const GAP_ONSET = 0.52
const GAP_FULL  = 0.86


/**
 * The ground the belt is measured against: the falloff's, before anything else.
 *
 * Not the ground the terrain draws, and the difference is the whole reason this
 * is exported rather than kept private. What the belt answers to is the *coast*
 * — the fBm sunk into an island and its relief shaped — because that is the
 * shape the sea delivered sand to. Everything the authored scape does afterwards
 * happens to the sand rather than deciding it: the shore shelving grades the
 * belt's foot into the beach, the farm levels whatever ended up under a field,
 * and the beck cuts its channel back out of the ridge on its way to the sea,
 * exactly as it cuts through the bar it meets there.
 *
 * So a test that wants to check what the belt was allowed has to ask this and
 * not the height field, which is a different question with a different answer.
 */
export function duneBedAt (config: ScapeConfig, x: number, z: number): number {
  return remapRelief(config, x, z, sinkToIsland(config, x, z, baseAt(config, x, z)))
}

/**
 * What the ground under a point will take, 0..1.
 *
 * Two vetoes and nothing else: dry, and low. Both are read off the bed rather
 * than off any height a caller happens to be holding — see {@link DRY_HOLD} and
 * {@link CLIMB_FADE} for why each exists, and {@link DuneBelt.depthAt} for why
 * they are answered here rather than at the call site.
 */
function allowanceAt (config: ScapeConfig, x: number, z: number): number {
  const { waterLevel, dunes } = config.terrain
  const freeboard             = duneBedAt(config, x, z) - waterLevel

  return smoothstep(0, DRY_HOLD, freeboard) *
    (1 - smoothstep(dunes.climb, dunes.climb + CLIMB_FADE, freeboard))
}

/**
 * Metres from the island's middle to the waterline on one bearing.
 *
 * Marched inward from open water rather than outward from the middle, and that
 * is not arbitrary: an island with a fjord in it, or a bay that cuts most of
 * the falloff band inward, has *several* waterline crossings on one bearing, and
 * the one the sand is delivered to is the outermost. Walking in from the sea
 * finds that one first. 0 where the bearing crosses no dry land at all — which
 * happens on any island the coast warp has bitten a whole quadrant out of.
 */
function shoreRadius (config: ScapeConfig, angle: number): number {
  const { size, waterLevel, islandInner, islandOuter } = config.terrain

  const half = size * 0.5
  const cos  = Math.cos(angle)
  const sin  = Math.sin(angle)
  const from = half * (islandOuter + 0.02)
  const to   = half * islandInner * 0.5

  let outer = from

  for (let radius = from; radius >= to; radius -= MARCH_STEP) {
    if (duneBedAt(config, cos * radius, sin * radius) > waterLevel) {
      let dry = radius
      let wet = outer

      for (let pass = 0; pass < REFINE; pass += 1) {
        const middle = (dry + wet) * 0.5

        if (duneBedAt(config, cos * middle, sin * middle) > waterLevel)
          dry = middle
        else
          wet = middle
      }

      return dry
    }

    outer = radius
  }

  return 0
}

/**
 * How far the blowouts have taken the ridge down at a point, 0..1.
 *
 * Sampled along the shore rather than across it, so a gap is a gap in the
 * *ridge* — a notch you could walk through — instead of a dip in the sand
 * everywhere at one distance inland. Two octaves, because one on the unit
 * lattice gives a field of evenly spaced gaps, and evenly spaced anything reads
 * as machinery.
 *
 * @param across Metres along the shore from the belt's middle.
 */
function blowoutAt (config: ScapeConfig, across: number): number {
  const { gap } = config.terrain.dunes
  const seed    = config.seed ^ 0x5a17
  const along   = across / Math.max(1, gap)

  const field = valueNoise(along, 0, seed) * 0.64 +
    valueNoise(along * 2.37, 11.5, seed ^ 0x2b) * 0.36

  return smoothstep(GAP_ONSET, GAP_FULL, field)
}

/**
 * The belt, or `null` on an island with no sand on it.
 *
 * Pure, and a function of the config alone — no layout, no height field and
 * nothing else in the survey. That is what lets the height field, the terrain
 * painter, the dressing and `scape:map` all read one shape without any of them
 * having to be built in a particular order.
 */
export function solveDunes (config: ScapeConfig): DuneBelt | null {
  const dunes = config.terrain.dunes

  if (dunes.height <= 0 || dunes.back <= dunes.foot)
    return null

  // Backwards down the wind: `wind.bearing` is the direction it blows toward,
  // so the coast it lands on is at the opposite bearing. See `treeline.ts`,
  // which walks the same way for the same reason.
  const bearing = config.wind.bearing * Math.PI / 180 + Math.PI
  const arc     = dunes.arc * Math.PI / 180
  const unitX   = Math.cos(bearing)
  const unitZ   = Math.sin(bearing)

  const cosOuter = Math.cos(arc)
  const cosInner = Math.cos(arc * ARC_INNER)

  const step  = Math.PI * 2 / BEARINGS
  const table = Array.from(
    { length: BEARINGS },
    (_unused, index) => shoreRadius(config, index * step),
  )

  function shoreAt (angle: number): number {
    const at    = (angle / step % BEARINGS + BEARINGS) % BEARINGS
    const index = Math.floor(at)
    const near  = table[index]
    const far   = table[(index + 1) % BEARINGS]

    // A bearing with no land on it does not get to be half a coastline. Without
    // this the interpolation walks a shore radius from 40 m down to nothing
    // across one 7.5° step and the belt follows it into the sea.
    if (near <= 0 || far <= 0)
      return 0

    return near + (far - near) * (at - index)
  }

  /** What the island can afford of the authored reach. See {@link MAX_REACH}. */
  function reachAt (angle: number): number {
    return Math.min(dunes.back, shoreAt(angle) * MAX_REACH)
  }

  function depthAt (x: number, z: number): number {
    const radius = Math.hypot(x, z)

    if (radius <= 0)
      return 0

    // The arc gate first, and as a dot product rather than as an angle: it
    // rejects two thirds of every island for the cost of two multiplies, and
    // this runs per terrain vertex on six islands.
    const align = (x * unitX + z * unitZ) / radius

    if (align <= cosOuter)
      return 0

    const angle = Math.atan2(z, x)
    const shore = shoreAt(angle)

    if (shore <= 0)
      return 0

    const back   = reachAt(angle)
    const inland = shore - radius

    if (inland <= dunes.foot || inland >= back)
      return 0

    const at   = (inland - dunes.foot) / (back - dunes.foot)
    const rise = smoothstep(0, dunes.peak, at)
    const fall = 1 - smoothstep(dunes.peak, 1, at)

    // Along the shore, which is the belt's middle direction turned a quarter
    // turn. The blowouts are cut in this axis and in no other.
    const across = z * unitX - x * unitZ

    const asked = dunes.height *
      rise *
      fall ** dunes.apron *
      smoothstep(cosOuter, cosInner, align) *
      (1 - dunes.blowout * blowoutAt(config, across))

    // The bed is read last and only here, which is what keeps it affordable:
    // every gate above is a multiply or a table lookup and between them they
    // have already rejected all but the coastal band on one side of one island.
    // What is left pays for five noise samples to ask the ground whether it will
    // have any sand at all.
    return asked <= 0 ? 0 : asked * allowanceAt(config, x, z)
  }

  return { bearing, arc, height: dunes.height, shoreAt, reachAt, depthAt }
}

/**
 * Lay the sand over a ground height.
 *
 * Only ever upward, and only ever onto dry ground — see {@link DRY_HOLD}, which
 * is the invariant this function exists to hold. Called per terrain vertex and
 * per placement probe on every island, including any that carries no belt, which
 * is what the first-line return is for.
 *
 * Applied *after* the shore shelving rather than before it, and the distinction
 * matters the way it does for the causeway: what is authored here is a
 * thickness of sand, and the shelving is a multiplier on height above the water.
 * Laid before it, a belt asked for two and a half metres of sand would be
 * compressed to a bit over one, and the ridge would quietly shrink again every
 * time somebody widened the beach.
 */
export function raiseDunes (belt: DuneBelt | null, x: number, z: number, height: number): number {
  return belt ? height + belt.depthAt(x, z) : height
}

/**
 * How much sand is standing at a point, as a fraction of the belt's own ridge.
 *
 * The one function the paint, the scatter, the stats and the tests all read, so
 * that the pale ground, the marram growing on it and the number in `scape:map`
 * describe one belt rather than three that agree today. A position and nothing
 * else, for the reason {@link DuneBelt.depthAt} takes nothing else: the ground's
 * own answer is already inside the belt, so a claim can never disagree with the
 * sand that was laid.
 */
export function duneClaim (belt: DuneBelt | null, x: number, z: number): number {
  return belt ? belt.depthAt(x, z) / belt.height : 0
}


/** What the belt came out as, for `scape:map` and for the tests. */
export interface DuneReport {

  /** Metres of sand at the highest point of the ridge. */
  crest: number

  /** Metres inland of the waterline that highest point stands. */
  ridgeAt: number

  /** Metres of coast the belt runs along, measured at the waterline. */
  length: number

  /** Bearings whose ridge the blowouts have taken under a quarter of the crest. */
  gaps: number

  /**
   * Percentage of the belt's own probes the ground refused sand to.
   *
   * The siting check, and the one number here that is about *where the arc is*
   * rather than about the profile. The reach is measured radially and a coast is
   * not a circle, so a belt whose arc lands over a bay asks for a ridge across
   * open water; and the reach says nothing about height, so a belt on a steep
   * weather shore asks for sand halfway up a hill. Both vetoes are counted here
   * and neither is a fault — they are what stops the landform lying. High means
   * the belt is pointed at a shore that has little room for one, which is a
   * siting answer rather than a shape one.
   */
  refused: number

  /** Of the bearings the arc covers, how many found a shore to build on. */
  sampled: number

  /**
   * The least freeboard any sand was laid on, in metres.
   *
   * The invariant, said as a number: at or under zero the belt has put a dune in
   * the sea, and no screenshot at any pose would show it.
   */
  lowest: number
}

/** Metres between probes on the inland walk the report takes. */
const REPORT_STEP = 0.5

/**
 * Walk the belt and measure it.
 *
 * Along the arc at the solve's own bearings and inland at half-metre steps,
 * which is a few hundred probes — this is an instrument, not a build step.
 */
export function measureDunes (config: ScapeConfig, belt: DuneBelt | null): DuneReport | null {
  if (!belt)
    return null

  const { waterLevel, dunes } = config.terrain
  const step                  = Math.PI * 2 / BEARINGS
  const bearings              = Math.floor(belt.arc / step)

  let crest   = 0
  let ridgeAt = 0
  let gaps    = 0
  let sampled = 0
  let shores  = 0
  let asked   = 0
  let vetoed  = 0
  let lowest  = Infinity

  for (let index = -bearings; index <= bearings; index += 1) {
    const angle = belt.bearing + index * step
    const shore = belt.shoreAt(angle)

    if (shore <= 0)
      continue

    const cos = Math.cos(angle)
    const sin = Math.sin(angle)

    let ridge = 0

    for (let inland = dunes.foot; inland <= belt.reachAt(angle); inland += REPORT_STEP) {
      const radius = shore - inland
      const x      = cos * radius
      const z      = sin * radius
      const depth  = belt.depthAt(x, z)
      const bed    = duneBedAt(config, x, z) - waterLevel

      // Inside the reach and inside the arc, so the belt wanted sand here. What
      // it got is the ground's business, and the two are counted apart: a probe
      // the sea or the hilltop refused is the siting check, not a hole in the
      // profile.
      asked += 1

      if (depth <= 0) {
        vetoed += 1
        continue
      }

      // Every probe the sand reached, not only the ones that raised the ridge:
      // the invariant is about the lowest ground *any* of it was laid on, and
      // the thin landward apron is where a belt would first walk into water.
      lowest = Math.min(lowest, bed)
      ridge  = Math.max(ridge, depth)

      if (depth > crest) {
        crest   = depth
        ridgeAt = inland
      }
    }

    sampled += 1
    shores  += shore

    if (ridge < dunes.height * 0.25)
      gaps += 1
  }

  return {
    crest,
    ridgeAt,
    length:  sampled === 0 ? 0 : shores / sampled * belt.arc * 2,
    gaps,
    refused: asked === 0 ? 0 : vetoed / asked * 100,
    sampled,
    lowest:  lowest === Infinity ? 0 : lowest,
  }
}
