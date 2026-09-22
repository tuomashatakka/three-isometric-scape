import type { ArchConfig } from '../config-arch.ts'
import type { ScapeConfig } from '../config.ts'
import { coastBedAt } from './coast.ts'
import type { Vec2 } from './path.ts'


/**
 * The hole the sea cut and has not yet dropped.
 *
 * `crag.ts` is the sea taking the foot out from under standing rock, and
 * `stack.ts` is what is left when it has taken everything else. This is the
 * landform between the two, and the stack module's own prose is what named it:
 * the sea works the weakest line in a headland into a geo, then a cave, then an
 * **arch**, and only when the arch falls is there a pillar standing in open
 * water. The archipelago had the beginning of that sequence and the end of it
 * and nothing in the middle.
 *
 * ## it is not a height field, and it cannot be one
 *
 * Every other landform in this scape is a level the ground is raised to. A
 * height field has one surface per column of air, so it can stand a pillar up
 * and it can cut a cleft down, but it has no way at all to put rock *over*
 * water and sky over the rock — which is the whole subject here. So the arch is
 * surveyed in this file and **drawn as geometry** in `props/arch.ts`, merged
 * into the same hero draw the pier and the weir already land in.
 *
 * That is also what makes it safe to add to a coast everything else was already
 * solved against. `raiseCrag` and `raiseStack` both change the ground; nothing
 * in here touches it. The harbour, the fairway, the farm, the footpaths and the
 * waterway router see the coast they have always seen, and the span is drawn
 * over the water rather than folded into the bed under it.
 *
 * ## it is written against the crag, like the stack
 *
 * There is no siting search on the island in here. An arch cannot be anywhere a
 * headland is not, and on the headland it is on the weakest rock — the same
 * field the clefts are cut with and the same one the stack stands off. Both
 * facts already live in `crag.ts`, so {@link solveArch} is handed them (see
 * {@link ArchSite}) and spends its search on the three questions the crag
 * cannot answer: is there a line left once the stack has taken the weakest one,
 * is the bottom out there still shallow enough to have been a spur of the
 * headland, and is the sea still running through the hole.
 *
 * Pure, and free of `three`, so `scape:map` reports the reach and the headroom
 * of every arch in the archipelago without building a vertex of one.
 */

/** A leg of the span, in the island's own local frame. */
export interface ArchLeg extends Vec2 {

  /** Metres of water the bare seabed offers under it. Zero on dry platform. */
  water: number
}

/** One span, over one portal. */
export interface Arch {

  /** Radians from the island's middle to the middle of the portal. */
  bearing: number

  /** Metres along the shore from the headland's middle. The line the sea cut. */
  along: number

  /** The leg on the platform — the end still joined to the island. */
  inner: ArchLeg

  /** The leg in the sea. When this one goes, what is left is a stack. */
  outer: ArchLeg

  /** Metres from the island's middle to the waterline on the portal's bearing. */
  shore: number

  /**
   * Metres from the middle of one leg to the middle of the other.
   *
   * Solved rather than configured: the outer leg is carried out to the last of
   * the shelf, so this is how much shelf the headland had. The config's own
   * `reach` is only a ceiling on it.
   */
  span: number

  /** Plan radius of a leg, in metres. */
  girth: number

  /** Metres of clear water between the legs. */
  opening: number

  /** World height the underside of the span leaves its legs at. */
  springing: number

  /** World height of the top of the span. */
  crown: number

  /** World height of the clifftop it was cut through. */
  lip: number

  /** Metres of water under the middle of the portal, off the bare seabed. */
  portal: number

  /** How weak the rock is on the line the sea cut through, 0..1. */
  weakness: number

  /**
   * World height of the underside of the span, across the opening.
   *
   * `0` at the inner leg and `1` at the outer one. The one authority for the
   * shape of the hole: `props/arch.ts` builds every block down to this curve
   * and {@link measureArch} takes the headroom off it, so the rock that is
   * drawn and the daylight that is reported are the same arch rather than two
   * that agree today.
   */
  soffitAt(across: number): number
}

/** As much of the headland as the span needs to be placed on it. */
export interface ArchSite {

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

  /** How weak the rock is at a distance along the shore, 0..1. */
  weakAt(along: number): number

  /**
   * Where the pillar stands along the shore, or `null` on a headland with none.
   *
   * Handed over rather than read off a `Stack`, because what this module needs
   * from the stack is one number and not a landform: the arch has to be cut on
   * a *different* line, and a dependency on the pillar's whole record would be
   * an import in the direction the sequence does not run.
   */
  stackAlong: number | null
}


/** Bearings across the headland's arc the line is looked for on. */
const LINES = 33

/** Share of the half-arc the search stays inside. Matches the stack's. */
const ARC_INSET = 0.78

/**
 * Share of the rock above the springing the underside climbs at the middle.
 *
 * The curve of the hole, in one number, and it is a module constant rather than
 * a knob because it carries no tuning decision the headroom and
 * the stature do not already carry between them. Under about a
 * third and the opening is a slot with a flat top; past about a half and there
 * is no rock left over the middle of it, which is the one place an arch has to
 * have some.
 */
const SOFFIT = 0.6

/**
 * Least rock the span may carry over its own opening, in metres.
 *
 * The refusal that takes the arch off a low coast, and it is the reason the
 * landform is not simply on every headland the crag put a cliff on: the crown
 * is a share of the lip and the springing is a fixed headroom over the sea, so
 * a headland under about five metres has the two meeting. What would be drawn
 * there is a lintel one block thick, which is a thing that has already fallen.
 */
const THICKNESS = 0.8

/**
 * Share of the platform's width the inner leg stands out on.
 *
 * A hole is cut through the *neck* of a spur rather than through the cliff face
 * behind it, and on this coast the neck is out on the bench. Rooted at the
 * waterline the portal spans the shore band instead — ground the sea only
 * reaches at the top of the tide — and what gets drawn is an arch on a beach.
 * Half the bench out puts the opening past the platform's outer edge and over
 * water that is there all day.
 */
const ROOTED = 0.5

/** How finely the shelf is walked for its outer edge, in metres. */
const STEP = 0.25


/**
 * How far out the bottom will still carry the outer leg, in metres from the
 * root — or `0` where the shelf is too short to have held a hole at all.
 *
 * `pier.ts`'s answer to the same question, with a bed sampler instead of a
 * survey: where a run out over water ends is not where somebody chose, it is
 * where there stopped being anything for it to stand on. Taking the walk out of
 * {@link solveArch} keeps that function under the lint config's complexity
 * ceiling, which is worth more than the one indirection costs — the loop is the
 * only part of the search with a second exit in it.
 *
 * @param depthAt Metres of water at a distance out from the root.
 */
function carriedOut (arch: ArchConfig, depthAt: (out: number) => number): number {
  let span = 0

  for (let out = arch.girth * 2 + arch.least; out <= arch.reach; out += STEP) {
    if (depthAt(out) > arch.founded)
      break

    span = out
  }

  return span
}


/**
 * The span, or `null` where the headland has no line left to have cut one on.
 *
 * Pure, and a function of the config and the crag alone — no height field and
 * nothing else in the survey, which is what lets the dressing, the stats and
 * the tests all read one shape without any of them having to be built in a
 * particular order. The same property `solveCrag` and `solveStack` have.
 *
 * The search stays inside {@link ARC_INSET} of the half-arc for the stack's
 * reason: the outer edge of a headland is where its claim feathers into the
 * coast beside it, and an arch cut *there* is an arch standing off a beach.
 */
export function solveArch (config: ScapeConfig, site: ArchSite): Arch | null {
  const arch = config.terrain.arch

  if (arch.stature <= 0 || arch.girth <= 0 || arch.least <= 0)
    return null

  // The shortest span that is still a hole, measured leg middle to leg middle.
  const shortest = arch.girth * 2 + arch.least

  if (arch.reach < shortest)
    return null

  const { waterLevel } = config.terrain
  const springing      = waterLevel + arch.clear
  const crown          = waterLevel + (site.lip - waterLevel) * arch.stature

  // The rock over the hole, before any bearing is looked at. It is a function
  // of the headland's own lip and of nothing that varies across the arc, so a
  // coast too low to carry an arch is refused once here rather than thirty-three
  // times inside the loop.
  if (crown - springing < THICKNESS)
    return null

  const unitX = Math.cos(site.bearing)
  const unitZ = Math.sin(site.bearing)
  const rise  = (crown - springing) * SOFFIT

  let best: Arch | null = null
  let bestWeak          = -Infinity

  for (let step = 0; step < LINES; step += 1) {
    const angle = site.bearing + (step / (LINES - 1) * 2 - 1) * site.arc * ARC_INSET
    const shore = site.shoreAt(angle)

    if (shore <= 0)
      continue

    const cos    = Math.cos(angle)
    const sin    = Math.sin(angle)
    const rooted = shore + site.bench * ROOTED
    const along  = (sin * unitX - cos * unitZ) * (rooted + shortest * 0.5)

    // The pillar's line first, because it is the cheapest gate here and on a
    // headland that carries a stack it throws out the part of the arc the
    // sequence has already gone furthest on.
    if (site.stackAlong !== null && Math.abs(along - site.stackAlong) < arch.apart)
      continue

    const weak = site.weakAt(along)

    if (weak <= bestWeak)
      continue

    // And the ground last, for the reason the crag and the stack ask the bed
    // last: it is the only term in here that costs noise samples, and every
    // gate above has already thrown out all but a handful of lines. The *length*
    // of every arch in the archipelago therefore comes off the bottom rather
    // than out of the config — see {@link carriedOut} — and a headland whose
    // shelf is shorter than `least` gets none at all.
    const span = carriedOut(arch, out =>
      waterLevel - coastBedAt(config, cos * (rooted + out), sin * (rooted + out)))

    if (span <= 0)
      continue

    const middle = rooted + span * 0.5
    const x      = cos * middle
    const z      = sin * middle
    const portal = waterLevel - coastBedAt(config, x, z)

    if (portal < arch.drowned)
      continue

    const reach = rooted + span

    bestWeak = weak
    best     = {
      bearing:  angle,
      along,
      inner:    { x: cos * rooted, z: sin * rooted, water: Math.max(0, waterLevel - coastBedAt(config, cos * rooted, sin * rooted)) },
      outer:    { x: cos * reach, z: sin * reach, water: Math.max(0, waterLevel - coastBedAt(config, cos * reach, sin * reach)) },
      shore,
      span,
      girth:    arch.girth,
      opening:  span - arch.girth * 2,
      springing,
      crown,
      lip:      site.lip,
      portal,
      weakness: weak,
      soffitAt: across => springing + rise * Math.sin(Math.PI * Math.min(1, Math.max(0, across))),
    }
  }

  return best
}


/** What the span came out as, for `scape:map` and for the tests. */
export interface ArchReport {

  /** The bearing the portal faces, in degrees. */
  bearing: number

  /** Metres over mean water the crown of the span stands. */
  crown: number

  /** Metres over mean water the clifftop it was cut through stands. */
  lip: number

  /** Metres of clear water between the legs. */
  opening: number

  /** Metres of rock over the middle of the hole. */
  thickness: number

  /**
   * Metres of daylight under the middle of the span at high water springs.
   *
   * The landform's claim, and the number no still at the tour's far zoom could
   * give you: an arch whose headroom has gone to nothing is a boulder with a
   * shadow under it.
   */
  headroom: number

  /**
   * Metres of the opening whose floor is under mean water, *as drawn*.
   *
   * Measured on the height field the terrain is actually drawn from rather than
   * on the bare bed the solve refused against, the same seam `measureStack`
   * and `peatFaceStanding` are cut on. A reading of 0 is a bridge: the sea has
   * stopped running through the hole, whatever the falloff said.
   */
  wetted: number

  /** The deepest water under the opening, in metres. */
  depth: number

  /** Metres of water the outer leg stands in, as drawn. */
  founded: number

  /** How weak the rock was on the line the sea cut through, 0..1. */
  weakness: number
}

/** How finely the opening is walked, in metres. */
const WALK = 0.25


/**
 * The span, measured on the ground it stands over.
 *
 * The instrument, and deliberately not a second copy of the solve: the floor is
 * read off `ground` — the height field the terrain is drawn from — so an arch
 * whose portal the shore shelving filled in reports what happened rather than
 * what was intended.
 *
 * @param springs Half the spring range, in metres. See `tideAmplitudeAt`.
 */
export function measureArch (
  arch:       Arch,
  ground:     (x: number, z: number) => number,
  waterLevel: number,
  springs:    number,
): ArchReport {
  const cos  = Math.cos(arch.bearing)
  const sin  = Math.sin(arch.bearing)
  const from = Math.hypot(arch.inner.x, arch.inner.z) + arch.girth

  let wetted  = 0
  let deepest = 0

  for (let walked = WALK * 0.5; walked < arch.opening; walked += WALK) {
    const radius = from + walked
    const height = ground(cos * radius, sin * radius)

    if (height > waterLevel)
      continue

    wetted += WALK
    deepest = Math.max(deepest, waterLevel - height)
  }

  const round = (value: number): number => Number(value.toFixed(2))

  return {
    bearing:   Number(((arch.bearing * 180 / Math.PI % 360 + 360) % 360).toFixed(1)),
    crown:     round(arch.crown - waterLevel),
    lip:       round(arch.lip - waterLevel),
    opening:   round(arch.opening),
    thickness: round(arch.crown - arch.soffitAt(0.5)),
    headroom:  round(arch.soffitAt(0.5) - waterLevel - springs),
    wetted:    round(Math.min(wetted, arch.opening)),
    depth:     round(deepest),
    founded:   round(waterLevel - ground(arch.outer.x, arch.outer.z)),
    weakness:  Number(arch.weakness.toFixed(2)),
  }
}
