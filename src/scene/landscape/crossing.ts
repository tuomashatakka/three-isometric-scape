import type { Creek } from './creek.ts'
import type { Vec2 } from './path.ts'


/**
 * The bridges, and the fords the farm never bothered to bridge.
 *
 * Sited by **where people already walk** rather than by what a hillside is like,
 * which is the one thing that makes this different from everything else in the
 * survey. The mill wants a head, the chapel a knoll, the barrow a skyline; a
 * bridge wants nothing except a tread going into water, and if no tread goes
 * into the water on an island then that island gets no bridge however good the
 * ground on either bank is.
 *
 * Pure and rng-free: the treads are already traced when this runs, so the same
 * paths over the same channel always give the same spans.
 */

/**
 * What wore the crossing.
 *
 * The distinction is not decoration: a plank a person walks over and a deck a
 * loaded hand cart is pulled across are different structures, and the second
 * one has no handrail on it — a cart's hub needs the edge of the deck, and a
 * rail is the thing it takes off.
 */
export type CrossingKind = 'foot' | 'cart'

/**
 * What the deck carries the way over.
 *
 * Two kinds of water and one structure, which is the generalisation this run
 * is built on. `beck` is running water in a cut channel. `tide` is the sea
 * itself, in a hollow the road has to get across on its way down to the
 * landing — no channel, no course, and the level to clear is the waterline
 * rather than a sheet lying on a bed. Everything after the finding is the same
 * for both: square the deck across the water, walk out to the first ground on
 * each hand that stands a freeboard clear of it, and build between them.
 */
export type CrossingWater = 'beck' | 'tide'

/** One way across the island that might meet the water: a tread, or the road. */
export interface Way {
  points: readonly Vec2[]
  kind:   CrossingKind
}

/** A bridge, as the survey settled it. In the island's own local space. */
export interface CrossingSite {

  /** Whether it carries the road or a tread. */
  kind: CrossingKind

  /** Whether it stands over the beck or over the sea. */
  over: CrossingWater


  /** The middle of the deck, over the channel's centreline. */
  x: number
  z: number

  /** The near bank's abutment, on firm ground. */
  near: Vec2

  /** The far bank's, likewise. */
  far: Vec2

  /** Bearing from {@link near} to {@link far}, in radians. */
  angle: number

  /** Metres between the two abutments — the length of deck that gets built. */
  span: number

  /** Metres of standing water it carries the way over. */
  wet: number

  /** World height of the top of the deck. */
  deck: number

  /** Metres of air between the deck's underside and the water under it. */
  freeboard: number

  /** How far down the beck it crosses, 0 at the spring and 1 at the mouth. `null` over the sea. */
  course: number | null

  /** How many of the farm's worn ways go over it. */
  routes: number
}

/**
 * Why a ford was left a ford.
 *
 * Reported rather than dropped, because the useful finding here is never the
 * bridge — it is the crossing that did *not* get one, and a blank cannot say
 * which of the five reasons it was. `dry` is the one that carries a real
 * reading about the terrain: the beck's cut ramps in over the first fifth of
 * its course, so a way that meets it up there is crossing a damp crease rather
 * than a stream, and the farm steps over it.
 */
export type FordRefusal = 'tidal' | 'dry' | 'wide' | 'uneven' | 'budget'

/** One place a way goes into the channel, bridged or not. */
export interface Ford {
  x: number
  z: number

  /** Whether it is the road that goes in, or a tread. */
  kind: CrossingKind

  /** Whether the water is the beck or the sea. */
  over: CrossingWater

  /** Metres across, abutment to abutment, had anything been built. */
  span: number

  /** Metres of standing water the way goes through. */
  wet: number

  /** How far down the beck it is, 0 at the spring and 1 at the mouth. `null` over the sea. */
  course: number | null

  /** How many worn ways use it. */
  routes: number

  /** `null` on a ford that was bridged. */
  refused: FordRefusal | null
}

export interface CrossingSurvey {

  /** Every place a worn way steps into the channel, bridged or not. */
  fords: readonly Ford[]

  /** The ones that got a deck over them. */
  bridges: readonly CrossingSite[]
}

export interface CrossingOptions {
  creek: Creek | null

  /** The treads and the cart road, as they ended up on the ground. */
  ways: readonly Way[]

  /** The ground as the survey cut it — the bed included. */
  heightAt(x: number, z: number): number

  /** Metres the beck's sheet stands over the channel floor. */
  water: number

  /** World height of mean sea level — what a dip in the road has to clear. */
  waterLevel: number

  /** Metres of bearing each abutment takes past the edge of the channel. */
  landing: number

  /** The widest gap a deck of sawn boards will take, in metres. */
  span: number

  /** The narrowest stream worth a deck. Below this the farm steps over it. */
  least: number

  /** The most height a level deck will make up between its two banks, in metres. */
  step: number

  /** Least metres of air between the deck and the water under it. */
  freeboard: number

  /** The most bridges one island carries. */
  most: number
}

/**
 * How far past the tideline a bridge refuses to go, as a share of the tidal
 * claim on the bed.
 *
 * Past this the channel is an inlet rather than a stream: it is ten metres and
 * more across, it is salt twice a day, and what a farm does with it is keep a
 * boat. The refusal is on the *water* rather than on the span, so a narrow
 * estuary is still refused — a bridge that went under at every spring tide
 * would be a bridge nobody built.
 */
const TIDAL = 0.3

/**
 * Metres between samples when the gap is measured out from the centreline.
 *
 * Finer than the tread's own resample, because the thing being measured is the
 * width of a channel two metres across and a step of the path's own size would
 * read it to the nearest half.
 */
const PROBE = 0.1

/** How far out from the centreline the measurement gives up, in metres. */
const REACH = 24

/**
 * How much of the channel's claim a way has to be standing in before it is
 * crossing it rather than running beside it.
 *
 * `Creek.claimAt` is 1 on the centreline and falls to 0 past the bank, so this
 * is about halfway out to the bank. The threshold is what distinguishes the two
 * things a way can do near water, and the distinction is the whole of this
 * function's value: a tread that walks the bank for thirty metres and a tread
 * that steps over the stream both spend time inside the claim, and only one of
 * them needs a deck. A crossing peaks; a towpath does not.
 */
const GRIP = 0.45

/**
 * Where a way crosses the water.
 *
 * The *peak* of the claim along each contiguous stretch the way spends inside
 * the channel, rather than the point it first steps over the edge. That is the
 * correction that made this work at all. A way's entry into the claim can be
 * five metres of dry bank away from the water and, on the fell island's cart
 * road, twenty metres upstream of the place the wheels actually go in — the
 * road runs down the side of the beck before it crosses it, so the first step
 * inside the corridor is nowhere near the crossing. The claim's maximum is on
 * the centreline by construction, so taking the peak puts the crossing in the
 * water every time.
 *
 * A way that crosses twice gives two peaks, because the stretches between them
 * drop back below {@link GRIP}.
 */
function entries (way: Way, creek: Creek): Vec2[] {
  const found: Vec2[]                               = []
  let peak: { claim: number, at: Vec2 } | null = null

  for (const point of way.points) {
    const claim = creek.claimAt(point.x, point.z)

    if (claim <= GRIP) {
      if (peak)
        found.push(peak.at)

      peak = null
      continue
    }

    if (!peak || claim > peak.claim)
      peak = { claim, at: { x: point.x, z: point.z }}
  }

  if (peak)
    found.push(peak.at)

  return found
}

/**
 * The two banks either side of a point in the channel, on the bearing that
 * crosses it squarest.
 *
 * Measured rather than taken from the route, and that is the first decision
 * worth writing down. A tread meets a beck at whatever angle the walk happened
 * to arrive at, and a bridge laid on the tread's own bearing is a bridge at
 * forty-five degrees across the stream — half again as long as it needs to be,
 * and standing on the one part of each bank that is being undercut. So the
 * crossing is squared: the bearing tried is the one perpendicular to the
 * channel's own run, and the deck follows the water rather than the walker.
 *
 * The second decision is **what is measured**, and it is the one that was got
 * wrong first. `Creek.clearanceAt` reports the edge of the channel's *claim* —
 * the cut plus the banks either side of it, which is the corridor the placement
 * searches keep out of and is four or five metres of dry ground wider than the
 * stream. A span measured against that is a bridge sized for a corridor, and on
 * this seed it refused a cart crossing of a two-metre beck as ten metres of
 * water. What a deck has to cover is the ground that is too low to stand an
 * abutment on, so that is what is walked out to: the water's own edge for the
 * record, and then the first ground on each hand that stands a freeboard clear
 * of the sheet for the bearing.
 */
function banks (
  at:      Vec2,
  bearing: number,
  water:   number,
  options: CrossingOptions,
): Gap | Unbridged {
  const { heightAt, landing, freeboard } = options
  const cos                              = Math.cos(bearing)
  const sin                              = Math.sin(bearing)
  const edges: number[]                  = []
  const dries: number[]                  = []

  for (const hand of [ -1, 1 ]) {
    let dry  = NaN
    let firm = NaN

    for (let out = PROBE; out <= REACH; out += PROBE) {
      const ground = heightAt(at.x + cos * out * hand, at.z + sin * out * hand)

      if (Number.isNaN(dry) && ground >= water)
        dry = out

      if (ground >= water + freeboard) {
        firm = out
        break
      }
    }

    // No bank within reach on one hand. The crease is already refused by the
    // cut test before anything is measured, so what is left here is water
    // wider than the measurement goes — an estuary, or a flat the beck has
    // spread itself across.
    if (Number.isNaN(firm))
      return { reason: 'wide' }

    edges.push(firm)
    dries.push(Number.isNaN(dry) ? firm : dry)
  }

  const nearOut = edges[0] + landing
  const farOut  = edges[1] + landing

  return {
    near: { x: at.x - cos * nearOut, z: at.z - sin * nearOut },
    far:  { x: at.x + cos * farOut, z: at.z + sin * farOut },
    span: nearOut + farOut,
    wet:  dries[0] + dries[1],
  }
}

/** A measured crossing: where the abutments go, how long the deck is, how wide the water is. */
interface Gap {
  reason?: undefined
  near:    Vec2
  far:     Vec2
  span:    number
  wet:     number
}

/** A crossing the measurement would not settle, and why. */
interface Unbridged {
  reason: 'wide'
}

/**
 * The point on the channel's own centreline nearest a point, and the bearing
 * the water runs on there.
 *
 * The crossing is moved onto the centreline before anything is measured, and
 * that is not tidying. A way is found to be crossing when its tread steps over
 * the edge of the channel's *claim*, which is four or five metres of dry bank
 * out from the water; a span measured from there is measured from ground that
 * is already higher than the sheet, and the walk outward for a bank never
 * finds one. The centreline is where the bed is, so the centreline is where
 * the measuring starts and where the deck ends up centred.
 */
type OnCourseReturnType = { centre: Vec2, bearing: number }

function onCourse (creek: Creek, at: Vec2): OnCourseReturnType {
  const { at: along } = creek.sampleAt(at.x, at.z)
  const first         = Math.max(0, Math.min(creek.points.length - 2, Math.floor(along)))
  const from          = creek.points[first]
  const to            = creek.points[first + 1]
  const slice         = Math.max(0, Math.min(1, along - first))

  return {
    centre: {
      x: from.x + (to.x - from.x) * slice,
      z: from.z + (to.z - from.z) * slice,
    },
    bearing: Math.atan2(to.z - from.z, to.x - from.x),
  }
}

/** A crossing with everything that wears it, before anything is measured. */
interface Meeting {
  at:     Vec2
  routes: number
  kind:   CrossingKind
  over:   CrossingWater

  /** The bearing the deck is laid on — square across whatever is running under it. */
  across: number

  /** World height of the water to be cleared. */
  sheet: number

  /** Position down the beck, or `null` over the sea. */
  course: number | null

  /** How deep the water is where the deck would go — the siting key within a group. */
  cut: number
}

/**
 * Fold a crossing into the group it belongs to, or start a new one.
 *
 * Crossings within a deck's length of each other are one crossing. A cluster
 * the road goes through is a *cart* crossing however many treads also use it,
 * and never the other way round: one deck gets built at a place and it has to
 * be the one that carries the heaviest thing that goes over it — a plank bridge
 * beside a ford the cart still drives through is two structures where the farm
 * would have built one.
 */
function fold (groups: Meeting[], found: Meeting, within: number): void {
  const near = groups.find(group =>
    Math.hypot(group.at.x - found.at.x, group.at.z - found.at.z) < within)

  if (!near) {
    groups.push(found)
    return
  }

  near.routes += found.routes
  near.kind    = near.kind === 'cart' || found.kind === 'cart' ? 'cart' : 'foot'

  // Water of two sorts in one place is one place, and the beck wins it. A
  // channel whose mouth is drowned is found twice — once as a stream and once
  // as a hollow the sea is in — and the two sites are a metre apart, which on
  // the meadow island built a second nine-metre deck beside the first. The
  // stream is the better description because it has a line to be squared
  // across, where a hollow has only the road's.
  if (near.over === 'tide' && found.over === 'beck') {
    near.at     = found.at
    near.across = found.across
    near.sheet  = found.sheet
    near.course = found.course
    near.over   = 'beck'
    near.cut    = found.cut

    return
  }

  if (found.over !== near.over)
    return

  // One deck serves the whole group, so it goes where the water is deepest.
  // Two ways can meet the beck a stride apart with one of them up where the
  // cut has barely opened, and siting the shared bridge on whichever happened
  // to be found first refused the pair over a crease with a perfectly good
  // gorge beside it.
  if (found.cut > near.cut) {
    near.at     = found.at
    near.across = found.across
    near.sheet  = found.sheet
    near.course = found.course
    near.cut    = found.cut
  }
}

/** Every place a way crosses the beck, grouped. */
function beckMeetings (
  groups:  Meeting[],
  ways:    readonly Way[],
  creek:   Creek,
  options: CrossingOptions,
): void {
  for (const way of ways)
    for (const entry of entries(way, creek)) {
      // On the centreline before the grouping and not after it. Two ways can
      // meet the water twenty metres apart along the bank and cross at the
      // same stone, which is one crossing and one bridge.
      const { centre, bearing } = onCourse(creek, entry)
      const { course }          = creek.sampleAt(centre.x, centre.z)

      fold(groups, {
        at:     centre,
        across: bearing + Math.PI / 2,
        // The higher of the stream and the sea, which matters at the bottom of
        // the course: the mouth is dredged *below* the waterline, so a sheet
        // taken from the bed alone puts the water a metre under the tide that
        // is actually standing in the channel there — and the deck with it.
        sheet:  Math.max(
          options.heightAt(centre.x, centre.z) + options.water,
          options.waterLevel,
        ),
        over:   'beck',
        course,
        cut:    creek.incisionAt(course),
        routes: 1,
        kind:   way.kind,
      }, options.span)
    }
}

/**
 * Every place a way goes under the sea itself, grouped.
 *
 * The road down to the landing crosses hollows the tide gets into, and a road
 * through standing salt water is the same failure as a road through a stream —
 * it was simply invisible to a survey that only watched the beck. There is no
 * channel to square against here, so the deck is laid **along the way**: the
 * water has no run of its own in a hollow, and the line that has to be carried
 * is the line of the road.
 *
 * The seaward hand of a crossing on open beach never finds firm ground, so the
 * measurement refuses it as too wide without needing a rule about beaches.
 */
function tideMeetings (groups: Meeting[], ways: readonly Way[], options: CrossingOptions): void {
  const { heightAt, waterLevel } = options

  for (const way of ways) {
    let low: { at: Vec2, depth: number, across: number } | null = null

    way.points.forEach((point, index) => {
      const depth = waterLevel - heightAt(point.x, point.z)

      if (depth <= 0) {
        if (low)
          fold(groups, {
            at:     low.at,
            across: low.across,
            sheet:  waterLevel,
            over:   'tide',
            course: null,
            cut:    low.depth,
            routes: 1,
            kind:   way.kind,
          }, options.span)

        low = null
        return
      }

      if (!low || depth > low.depth)
        low = { at: { x: point.x, z: point.z }, depth, across: wayBearing(way, index) }
    })

    // A way that ends under water is a jetty approach rather than a crossing:
    // there is no far bank to build to, so the open run is dropped rather than
    // measured and refused.
  }
}

/** The way's own bearing at one of its points. */
function wayBearing (way: Way, index: number): number {
  const first = Math.max(0, Math.min(way.points.length - 2, index - 1))
  const from  = way.points[first]
  const to    = way.points[first + 1]

  return Math.atan2(to.z - from.z, to.x - from.x)
}

/**
 * Every bridge one island gets, and every ford it did not.
 *
 * Ordered busiest first and then narrowest, which is the order a farm would
 * build them in: the crossing five legs of the network go over is worth timber
 * before the one that carries a single path to a peat bank.
 */
/**
 * Why this crossing gets no deck, or `null` when it gets one.
 *
 * Its own function because the refusals are the interesting half of this
 * survey and they read as a list when they are one: tidal water, a cut that
 * has not opened, a stream you step over, a gap past what a beam will carry.
 * The budget is decided afterwards, against the others.
 */
function refuse (
  met:     Meeting,
  gap:     Gap | Unbridged,
  creek:   Creek | null,
  options: CrossingOptions,
): FordRefusal | null {
  const { course, over } = met

  if (over === 'beck' && creek && course !== null) {
    if (creek.tideAt(course) > TIDAL)
      return 'tidal'

    // The cut before the gap, and it is the cheap test as well as the right
    // one. A channel incised less deeply than the sheet standing in it is not
    // a channel: it is wet ground on a hillside, which is what the beck is for
    // the first tenth of its course while the cut ramps in. Measuring a span
    // across that produces a bank on the uphill hand, nothing at all on the
    // downhill one, and a refusal that reads as an estuary.
    if (creek.incisionAt(course) < options.water)
      return 'dry'
  }

  if (gap.reason)
    return gap.reason
  if (gap.wet < options.least)
    return 'dry'
  if (gap.span > options.span)
    return 'wide'

  // A plank bridge is a level deck, and a level deck between banks at two
  // different heights is a deck with one end in the air. The abutment makes up
  // a course or two of stone and no more; past that what the ground wants is a
  // ramp cut into the bank, which is a different structure and a different
  // run. Without this the fell island put a three-metre-span footbridge across
  // a sea gut with one end on a bank nearly four metres over the other.
  const fall = Math.abs(
    options.heightAt(gap.near.x, gap.near.z) - options.heightAt(gap.far.x, gap.far.z))

  return fall > options.step ? 'uneven' : null
}

export function solveCrossings (options: CrossingOptions): CrossingSurvey {
  const { creek, ways, heightAt, freeboard, most } = options
  const fords: Ford[]                              = []
  const ready: CrossingSite[]                      = []
  // One list, and the beck goes into it first. A drowned channel mouth is
  // found twice — as a stream and as a hollow the sea is in — and the two
  // findings have to meet in the same set of groups or the island builds two
  // decks a metre apart. See `fold`.
  const met: Meeting[] = []

  if (creek)
    beckMeetings(met, ways, creek, options)

  tideMeetings(met, ways, options)

  for (const meeting of met) {
    const { at: centre, across, sheet, over, course, routes, kind } = meeting
    const gap                                                       = banks(centre, across, sheet, options)
    const refused                                                   = refuse(meeting, gap, creek, options)
    const ford                                                      = {
      x:    centre.x,
      z:    centre.z,
      kind,
      over,
      span: round(gap.reason ? Infinity : gap.span),
      wet:  round(gap.reason ? Infinity : gap.wet),
      course,
      routes,
      refused,
    }

    fords.push(ford)

    if (refused || gap.reason)
      continue

    const { near, far } = gap
    const deck          = Math.max(
      heightAt(near.x, near.z),
      heightAt(far.x, far.z),
      sheet + freeboard,
    )

    ready.push({
      kind,
      over,
      x:         centre.x,
      z:         centre.z,
      near,
      far,
      angle:     Math.atan2(far.z - near.z, far.x - near.x),
      span:      gap.span,
      wet:       gap.wet,
      deck,
      freeboard: deck - sheet,
      course,
      routes,
    })
  }

  // The road first, then the busiest tread, then the narrowest gap. A farm
  // with timber for one bridge builds it where the cart goes, because a person
  // can wade and a loaded cart cannot.
  ready.sort((a, b) =>
    Number(b.kind === 'cart') - Number(a.kind === 'cart') ||
    b.routes - a.routes ||
    a.span - b.span)

  // Past the budget a crossing goes back to being a ford, and says so. The
  // sites were already settled, so this is a refusal about the farm rather than
  // about the ground — which is why it has its own reason.
  for (const site of ready.slice(most)) {
    const left = fords.find(found => found.x === site.x && found.z === site.z)

    if (left)
      left.refused = 'budget'
  }

  return { fords, bridges: ready.slice(0, most) }
}

function round (metres: number): number {
  return Number.isFinite(metres) ? Math.round(metres * 100) / 100 : metres
}
