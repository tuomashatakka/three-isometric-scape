import { smoothstep } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { valueNoise } from '../noise.ts'
import { coastBedAt } from './coast.ts'


/**
 * The rock the headland left behind.
 *
 * `crag.ts` is the sea taking the foot out from under standing rock; this is
 * what happens when it keeps going. The face has a weakest line in it — the
 * same field the clefts are cut with — and the sea works that line into a geo,
 * a cave, an arch, and finally into nothing at all, at which point the seaward
 * end of the arch is a pillar in open water with the island behind it.
 *
 * ## it is written against the crag, not against the island
 *
 * There is no siting search in here. A stack cannot stand anywhere a headland
 * does not, and on the headland it stands off the weakest rock, because that is
 * the line the sea was able to cut behind. Both of those facts already exist in
 * `crag.ts`, so {@link solveStack} is handed them — see {@link StackSite} — and
 * spends its whole search on the one question the crag cannot answer: is there
 * enough water out there to have left a pillar standing in, or does the
 * platform run out into shallows where the sea would only have made a skerry?
 *
 * That is `stack.water`, and it is the refusal that decides how many headlands
 * in the archipelago carry one.
 *
 * ## the gut is not cut
 *
 * The landform **only ever raises ground**, exactly as the crag does. The water
 * between the pillar and the coast is the sea floor that was always there: the
 * column is stood up seaward of the platform's outer edge, and the gap between
 * the two is left alone. Nothing here can take ground away from a harbour, a
 * fairway or a farm, which is what makes it safe to fold into a coast the rest
 * of the survey was already solved against.
 *
 * `scape:map` reports the gap it *measures* on the drawn ground rather than the
 * one the config asked for — see {@link measureStack}. The two are different
 * questions, the same way the peat face's `standing` is a different question
 * from its `depth`: a pillar whose measured gut is zero is a promontory, and no
 * still taken from the tour's default pose could tell you so.
 */
export interface Stack {

  /** Radians from the island's middle to the pillar. Inside the crag's arc. */
  bearing: number

  /** Where it stands, in the island's own local frame. */
  x: number
  z: number

  /** Metres from the island's middle to the waterline on its own bearing. */
  shore: number

  /** Metres from the island's middle to the pillar's own middle. */
  radius: number

  /** Metres of open water asked for between the platform's edge and the foot. */
  gut: number

  /** World height of the crown, at the pillar's middle. */
  crown: number

  /** World height of the clifftop it was cut out of. */
  lip: number

  /** Mean plan radius at the foot, in metres. */
  girth: number

  /** How weak the rock is on the line the sea cut behind, 0..1. */
  weakness: number

  /** Metres of water the bare seabed offers under the foot. */
  water: number

  /** Metres the crown falls across the column, seaward. The bedding dip. */
  dip: number

  /** Metres of fallen rock heaped against the foot. */
  talus: number

  /** Plan radius on one bearing, in metres. See {@link PLAN_WARP}. */
  planAt(angle: number): number
}

/** As much of the headland as the pillar needs to be placed off it. */
export interface StackSite {

  /** Radians, the middle of the headland. */
  bearing: number

  /** Half-angle of the headland, in radians. */
  arc: number

  /** World height of the clifftop. */
  lip: number

  /** Metres of wave-cut platform seaward of the waterline. */
  bench: number

  /** Metres from the island's middle to the waterline on a bearing. */
  shoreAt(angle: number): number

  /**
   * How weak the rock is at a distance along the shore from the headland's
   * middle, 0..1.
   *
   * Handed over rather than imported, and that is the whole reason this module
   * does not know `crag.ts` exists. The field belongs to the cliff — it is what
   * wanders the lip and cuts the clefts — and a second copy of it in here would
   * be a stack standing off a geo that had moved.
   */
  weakAt(along: number): number
}


/**
 * Share of the girth the column holds at full height before it tapers out.
 *
 * The sides, in one number. A taper spanning the outer third of a five-metre
 * radius is 1.7 m of run against however much water the pillar is standing in —
 * ten metres off the home island's headland — which comes out of the terrain as
 * a face in the eighties: a wall from every pose, without the height field ever
 * being asked for a vertical one. Nearer 1 and the sides *are* vertical, which
 * on the mobile tier is one quad wide and reads as a sheet.
 */
const COLUMN = 0.66

/** How far the fallen rock reaches past the plan, as a share of it. */
const SKIRT = 1.9

/** How much the plan wanders from a circle, as a share of the girth. */
const PLAN_WARP = 0.22

/** How many lobes that wander has round the column. */
const PLAN_TURNS = 2.7

/** Bearings across the headland's arc the weakest line is looked for on. */
const LINES = 33

/** Share of the half-arc the search stays inside. See {@link solveStack}. */
const ARC_INSET = 0.78


/**
 * The pillar, or `null` where the headland has no water to have left one in.
 *
 * Pure, and a function of the config and the crag alone — no height field, and
 * nothing else in the survey. That is what lets the height field, the terrain
 * painter and `scape:map` all read one shape without any of them having to be
 * built in a particular order, and it is the same property `solveCrag` has.
 *
 * The search stays inside {@link ARC_INSET} of the half-arc because the outer
 * edge of a headland is where its claim feathers into the coast beside it: a
 * pillar stood off *there* is a pillar off a beach, standing beside a cliff
 * rather than out of one.
 */
export function solveStack (config: ScapeConfig, site: StackSite): Stack | null {
  const stack = config.terrain.stack

  if (stack.stature <= 0 || stack.girth <= 0)
    return null

  const { waterLevel } = config.terrain
  const unitX          = Math.cos(site.bearing)
  const unitZ          = Math.sin(site.bearing)
  const seed           = config.seed ^ 0x5a71

  let best: Stack | null = null
  let bestWeak           = -Infinity

  for (let step = 0; step < LINES; step += 1) {
    const angle = site.bearing + (step / (LINES - 1) * 2 - 1) * site.arc * ARC_INSET
    const shore = site.shoreAt(angle)

    if (shore <= 0)
      continue

    const radius = shore + site.bench + stack.gut + stack.girth
    const x      = Math.cos(angle) * radius
    const z      = Math.sin(angle) * radius
    const along  = z * unitX - x * unitZ
    const weak   = site.weakAt(along)

    if (weak <= bestWeak)
      continue

    // The ground's veto, and it is asked last for the reason the crag asks the
    // bed last: it is the only term here that costs noise samples, and the
    // weakness gate above has already thrown out all but the handful of
    // bearings that could win.
    const water = waterLevel - coastBedAt(config, x, z)

    if (water < stack.water)
      continue

    bestWeak = weak
    best     = {
      bearing:  angle,
      x,
      z,
      shore,
      radius,
      gut:      stack.gut,
      // Below the lip by construction: `stature` is a share, and the test
      // beside this file states that as a fact rather than an intention.
      crown:    waterLevel + (site.lip - waterLevel) * stack.stature,
      lip:      site.lip,
      girth:    stack.girth,
      weakness: weak,
      water,
      dip:      stack.dip,
      talus:    stack.talus,
      planAt:   angle_ => stack.girth * (1 - PLAN_WARP + PLAN_WARP * 2 * valueNoise(
        Math.cos(angle_) * PLAN_TURNS + 11.3,
        Math.sin(angle_) * PLAN_TURNS + 4.1,
        seed,
      )),
    }
  }

  return best
}

/**
 * Stand the pillar up over a ground height.
 *
 * **Only ever upward**, and in two terms that are deliberately different kinds
 * of number. The talus is a *thickness* laid on whatever the sea floor already
 * was, because what falls off a stack lands on the bed under it; the column is
 * an *absolute level* over mean water, because it is the old clifftop and the
 * clifftop is not a depth below anything. The `max` against the ground the
 * talus has already heaped is what makes the invariant hold on both.
 *
 * Applied after the crag and after the shore shelving, for the crag's own
 * reason: the shelving is a multiplier on height above the waterline, and a
 * crown asked to stand five metres up would come out at three if it were laid
 * before it.
 */
export function raiseStack (stack: Stack | null, x: number, z: number, height: number): number {
  if (!stack)
    return height

  const dx    = x - stack.x
  const dz    = z - stack.z
  const near  = dx * dx + dz * dz
  const reach = stack.girth * SKIRT

  if (near >= reach * reach)
    return height

  const distance = Math.sqrt(near)
  const plan     = stack.planAt(Math.atan2(dz, dx))

  // The heap of blocks at the bottom, squared so it piles against the foot
  // rather than sloping evenly away from it.
  const heaped = height + stack.talus * (1 - smoothstep(plan, plan * SKIRT, distance)) ** 2
  const claim  = smoothstep(plan, plan * COLUMN, distance)

  if (claim <= 0)
    return heaped

  // The bedding dip, off the vector this function already has: the seaward half
  // of the crown is the low half, so the block reads as tilted rather than as
  // sawn off level.
  const seaward = (dx * Math.cos(stack.bearing) + dz * Math.sin(stack.bearing)) / plan
  const crown   = stack.crown - stack.dip * 0.5 * seaward

  return heaped + Math.max(0, crown - heaped) * claim
}

/** How much of the pillar stands at a point, 0..1. The paint and the stats read this. */
export function stackClaim (stack: Stack | null, x: number, z: number): number {
  if (!stack)
    return 0

  const dx       = x - stack.x
  const dz       = z - stack.z
  const distance = Math.hypot(dx, dz)
  const plan     = stack.planAt(Math.atan2(dz, dx))

  return smoothstep(plan, plan * COLUMN, distance)
}


/** What the pillar came out as, for `scape:map` and for the tests. */
export interface StackReport {

  /** The bearing it stands off, in degrees. */
  bearing: number

  /** Metres over mean water the drawn crown stands. */
  crown: number

  /** Metres over mean water the clifftop it came out of stands. */
  lip: number

  /** Mean plan radius at the foot, in metres. */
  girth: number

  /**
   * Metres of submerged ground between the foot and the coast, *as drawn*.
   *
   * The landform's claim, measured rather than asked for. A reading of 0 is a
   * promontory — the platform has run out to meet the pillar — and no still
   * taken from the tour's default pose could tell you so.
   */
  gut: number

  /** The deepest water in that gap, in metres. */
  depth: number

  /** Metres the drawn crown stands clear of high water at springs. */
  freeboard: number

  /** How weak the rock was on the line the sea cut behind, 0..1. */
  weakness: number
}

/** How finely the gap is walked, in metres. */
const WALK = 0.25

/**
 * The pillar, measured on the ground that has it in it.
 *
 * The instrument, and it is deliberately not a second copy of the solve: every
 * number in here is read off `ground`, which is the height field the terrain is
 * actually drawn from, so a stack the shelving flattened or the talus filled in
 * reports what happened rather than what was intended. The same seam
 * `peatFaceStanding` is cut on.
 *
 * The gap is walked *inward*, from the foot toward the island's middle, and
 * stops at the first sample standing over mean water — which is the outer edge
 * of the wave-cut platform where there is one and the beach where there is not.
 *
 * @param springs Half the spring range, in metres. See `tideAmplitudeAt`.
 */
export function measureStack (
  stack:      Stack,
  ground:     (x: number, z: number) => number,
  waterLevel: number,
  springs:    number,
): StackReport {
  const cos   = Math.cos(stack.bearing)
  const sin   = Math.sin(stack.bearing)
  const plan  = stack.planAt(stack.bearing + Math.PI)
  const reach = stack.radius - stack.shore
  const crown = ground(stack.x, stack.z)

  let gut     = 0
  let deepest = 0

  for (let walked = WALK; plan + walked < reach; walked += WALK) {
    const radius = stack.radius - plan - walked
    const height = ground(cos * radius, sin * radius)

    if (height > waterLevel)
      break

    gut     = walked
    deepest = Math.max(deepest, waterLevel - height)
  }

  const round = (value: number): number => Number(value.toFixed(2))

  return {
    bearing:   Number(((stack.bearing * 180 / Math.PI % 360 + 360) % 360).toFixed(1)),
    crown:     round(crown - waterLevel),
    lip:       round(stack.lip - waterLevel),
    girth:     round(stack.girth),
    gut:       round(gut),
    depth:     round(deepest),
    freeboard: round(crown - waterLevel - springs),
    weakness:  Number(stack.weakness.toFixed(2)),
  }
}
