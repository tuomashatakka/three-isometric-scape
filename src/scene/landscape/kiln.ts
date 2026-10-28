import { smoothstep } from 'threejs-scene'
import type { Obstacle } from './footpath.ts'
import type { Spot } from './landing.ts'
import type { Vec2 } from './path.ts'
import { faceToward } from './steading.ts'
import type { Standing } from './steading.ts'


/**
 * Where the lime kiln is cut into the bank, in the island's own local frame.
 *
 * The second building on this island sited against the *harbour* rather than
 * against the farm, and the first sited against a **slope**. Everything else
 * ashore wants ground that is level enough to stand a sill on; a kiln wants the
 * opposite, because the charge goes in at the top and the lime comes out at the
 * foot and those have to be two different heights. So this search scores the
 * fall across a site rather than refusing it — and it refuses a site for being
 * *flat*, which nothing else in the survey does.
 *
 * A {@link Standing}, like the smokehouse and for the same reason: the drum is
 * modelled in the farmstead's frame with its draw arch on local `+z`, so the
 * same `faceToward` that aims a door aims the mouth. What it is aimed at is not
 * the bank, though — see {@link findKilnSite}.
 *
 * Pure, and free of `three`, so `scape:map` reports the site without building a
 * vertex of it.
 */
export interface KilnSite extends Standing {

  /** Ground height under the draw sill, in metres. */
  level: number

  /** Metres from the harbour bank. The reason this patch and not a better one. */
  fromBank: number

  /** Metres the ground falls across the drum, charging floor to draw sill. */
  fall: number

  /** Height of the charging floor at the back of the drum, in metres. */
  crown: number
}

/**
 * How much ground the kiln claims, in metres.
 *
 * The radius that holds the whole works measured from the drum's own axis — the
 * stone out past the revetment wings behind it and the lime heap spread in front
 * of the arch, which is the part that reaches furthest. Held in step with the
 * geometry by the test beside this file rather than by hope, the same way
 * `SMOKEHOUSE_FOOTING` is.
 *
 * Larger than the drum is through, and deliberately: what a kiln actually
 * occupies is the ground somebody has to stand on to rake it out.
 */
export const KILN_FOOTING = 3.95

/**
 * The drum's radius at the foot, in metres — and the one length this module and
 * the geometry both have to agree about.
 *
 * It is three questions with one answer. It is half the span the fall is
 * measured across, because a kiln is scored on the drop between its two *ends*
 * and not on the slope of the ground under its own spoil heap. It is where the
 * draw sill sits, so it is where the freeboard is asked. And it is how far
 * forward of the axis the dressing has to sample the ground to set the building
 * down, because a kiln is merged at its arch rather than levelled on its
 * footprint. `props/kiln.ts` builds the drum to this radius and
 * `props/kiln.test.ts` is what keeps the two in step.
 */
export const KILN_SILL = 1.85

export interface KilnSearch {

  /** The ground as the height field leaves it, in metres. */
  ground(x: number, z: number): number
  waterLevel: number

  /** Metres of dry ground the draw sill needs under it. */
  freeboard: number

  /** Nearest the bank a site may be, in metres. */
  setback: number

  /** Furthest from the bank the search will look, in metres. */
  reach: number

  /** Least fall across the drum, in metres. */
  brae: number

  /** Most fall across the drum, in metres. */
  scarp: number
}

/** Bearings swept around the bank, and rings of distance out from it. */
const BEARINGS = 24
const RINGS    = 10

/** Bearings the downhill probe sweeps when it looks for the way the ground goes. */
const ASPECTS = 16

/**
 * The way the ground falls at a point, as a yaw in the prop's own convention.
 *
 * A sweep rather than a two-sample gradient, because the gradient of a height
 * field sampled at one spacing on a shore bank is as likely to name the lip of a
 * gully as the line of the brae. Sixteen probes at the drum's own radius ask the
 * question at the scale the building is actually built at, which is the only
 * scale that matters to it.
 *
 * Returned as a yaw — `atan2(dx, dz)` — rather than a bearing, so it can be used
 * where `faceToward` would be. Getting that reflection wrong turns the arch into
 * the hill, and a kiln drawn into a bank is a kiln nobody can draw.
 */
export function downhillYaw (
  ground: (x: number, z: number) => number,
  x:      number,
  z:      number,
): number {
  let yaw    = 0
  let lowest = Infinity

  for (let step = 0; step < ASPECTS; step += 1) {
    const around = step / ASPECTS * Math.PI * 2
    const dx     = Math.cos(around) * KILN_SILL
    const dz     = Math.sin(around) * KILN_SILL
    const at     = ground(x + dx, z + dz)

    if (at < lowest) {
      lowest = at
      yaw    = faceToward({ x: 0, z: 0 }, { x: dx, z: dz })
    }
  }

  return yaw
}

/**
 * The bank the kiln is cut into, or `null` when the harbour has no brae behind
 * it steep enough to build one on.
 *
 * `null` is a real answer and not a failure, the same way the pier's and the
 * smokehouse's are: a harbour on a flat shelf has nowhere to put a kiln, and
 * gets none rather than one standing in the open with its arch in the dirt.
 * Raising `kiln.brae` past `kiln.scarp` is the supported way to take them out of
 * the scape entirely — there is no separate switch, for the same reason nothing
 * else here has one.
 *
 * The sweep is the smokehouse's, because the question "where on this bank" has
 * one good answer and both buildings ask it. What differs is everything after
 * the ring: the fall is measured along the line the ground itself goes down
 * rather than across a fixed rectangle, the freeboard is asked at the *sill*
 * rather than at the centre, and the yaw is the downhill one rather than the one
 * that looks at the water. On a cove shore those two are often a quarter circle
 * apart, and the difference is whether the lime comes out onto the beach or into
 * the hillside.
 */
export function findKilnSite (
  search: KilnSearch,
  bank:   Spot,
  avoid:  readonly Obstacle[],
): KilnSite | null {
  if (search.reach <= search.setback || search.brae > search.scarp)
    return null

  let best: KilnSite | null = null
  let bestScore             = -Infinity

  for (let ring = 0; ring < RINGS; ring += 1) {
    const fromBank = search.setback + ring / (RINGS - 1) * (search.reach - search.setback)

    for (let step = 0; step < BEARINGS; step += 1) {
      const around = step / BEARINGS * Math.PI * 2
      const x      = bank.x + Math.cos(around) * fromBank
      const z      = bank.z + Math.sin(around) * fromBank

      if (avoid.some(thing =>
        Math.hypot(thing.x - x, thing.z - z) < thing.radius + KILN_FOOTING))
        continue

      const angle = downhillYaw(search.ground, x, z)
      const sinA  = Math.sin(angle)
      const cosA  = Math.cos(angle)

      // The two ends of the building, and not a ring: a kiln has a front and a
      // back, and the only drop that means anything to it is the one between
      // them. The sill is local +z at the drum's radius, the charging floor is
      // local -z at the same.
      const sillX  = x + sinA * KILN_SILL
      const sillZ  = z + cosA * KILN_SILL
      const crownX = x - sinA * KILN_SILL
      const crownZ = z - cosA * KILN_SILL

      const level = search.ground(sillX, sillZ)
      const crown = search.ground(crownX, crownZ)

      if (level - search.waterLevel < search.freeboard)
        continue

      const fall = crown - level

      if (fall < search.brae || fall > search.scarp)
        continue

      // Near the boats, and on the best brae the bank offers. The fall term is
      // a reward rather than a penalty — the inverse of every other building's
      // search on this shore — and it is weighted to beat the walk, because a
      // kiln on poor ground is a kiln that does not draw while a kiln ten metres
      // further along the bank is just a longer barrow-push.
      const score = fall * 6 - fromBank * 0.25

      if (score > bestScore) {
        bestScore = score
        best      = {
          x,
          z,
          angle,
          radius: KILN_FOOTING,
          level,
          fromBank,
          fall,
          crown,
        }
      }
    }
  }

  return best
}

/**
 * The patch of ground the kiln is actually set down on, in the island's frame.
 *
 * The arch rather than the axis, and published because three callers have to
 * agree about it: the search that measured the freeboard there, the dressing
 * that translates the geometry to it, and the hearth survey that publishes the
 * rim above it. Two of those answering it separately is a plume hanging off its
 * own stack, which is the failure `fixtures.ts` already has a paragraph about.
 */
export function kilnSill (site: KilnSite): Vec2 {
  return {
    x: site.x + Math.sin(site.angle) * KILN_SILL,
    z: site.z + Math.cos(site.angle) * KILN_SILL,
  }
}

/**
 * How hard the kiln is burning at a phase of the year, 0..1.
 *
 * Pure, and the claim this structure makes: a kiln is not a hearth. A house
 * fire is lit every day of the year and banked harder as the cold comes on —
 * that is `hearthDensity`, and it never reaches zero — while a kiln is charged,
 * fired for four or five days, drawn, and then stands cold until the next
 * summer's peat is dry. So this curve *does* reach zero, and stays there for
 * most of the year.
 *
 * The same shape as `hjellHung` and for the same reason — a window round a peak,
 * ramped at both ends so nothing blinks — but keyed half a year away from it and
 * cut to half its width. Two clocks of the same kind at different phases and
 * different widths is what makes a year read as a year rather than as a switch.
 *
 * It integrates nothing and remembers nothing: the year is where the published
 * season says it is, so a still taken with every clock stopped shows the plume
 * that week actually has.
 */
export function kilnBurn (time: number, burn: number, peak: number): number {
  if (burn <= 0)
    return 0

  if (burn >= 1)
    return 1

  // Distance from the peak round the ring, 0 on the week itself and 0.5 half a
  // year away from it.
  const phase = Math.abs(((time - peak) % 1 + 1.5) % 1 - 0.5)
  const edge  = burn * 0.5

  return 1 - smoothstep(edge * 0.7, edge, phase)
}
