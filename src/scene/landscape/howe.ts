import type { Obstacle } from './footpath.ts'
import type { Vec2 } from './path.ts'
import { faceToward } from './steading.ts'
import type { Standing } from './steading.ts'


/**
 * Where the howe stands, in the island's own local frame.
 *
 * The one thing on this island sited against a *sightline* rather than against
 * ground. Every other search here asks what the site is like underfoot — how
 * level, how high, how near the water, how far from the farm. This one asks
 * what the site looks like from somewhere else, and the somewhere else is the
 * farmyard, because that is where the people who would have been looking at it
 * were standing.
 *
 * A {@link Standing}, like the shieling and the smokehouse, because the mound
 * is modelled in the farmstead's frame with its one open side on local `+z`.
 * `faceToward` turns that side back down at the yard: the hole in the crest and
 * the spoil thrown out of it face the farm, because a barrow that was dug into
 * was dug into from the side somebody walked up.
 *
 * Pure, and free of `three`, so `scape:map` reports the site without building a
 * vertex of it.
 */
export interface HoweSite extends Standing {

  /** Ground height under the crest, in metres. */
  level: number

  /**
   * Metres the ground here stands over the highest ground a prospect away.
   *
   * The local prominence, and the number that says the mound is on a top rather
   * than on a slope. Measured against the ring's *highest* station and not its
   * mean, so a reading of half a metre means nothing within a prospect looks
   * down on it by more than nothing.
   */
  stands: number

  /**
   * Metres the crest clears the highest ground between it and the farmyard.
   *
   * The whole argument of the section as one number. The sightline is a
   * straight line from a person's eye at the yard to the top of the raised
   * mound; this is the smallest gap between that line and the ground under it,
   * anywhere along the walk. Above zero the howe is seen against the sky. At or
   * below it, something in between is standing in front of it — which is the
   * failure a screenshot at the default pose cannot tell from a mound that is
   * simply far away.
   */
  skyline: number

  /** Metres from the yard. How far away the thing being looked at is. */
  fromYard: number
}

/**
 * How much ground the mound and its kerb claim, in metres.
 *
 * The radius that holds the whole monument from its own origin — the turf, the
 * ring of set stones round its foot, and the spoil the diggers threw out past
 * them. Held in step with the geometry by the test beside this file rather than
 * by hope, the same way `SHIELING_FOOTING` and `CHAPEL_FOOTING` are.
 *
 * Smaller than the shieling's, and that is the one number in this file the
 * scape's own crowding chose rather than the subject. A barrow of the size
 * these actually were would claim twenty metres, and on the home island —
 * where the yard, the plots, the pasture, the tarn, the peat bank, the mill,
 * the chapel and the hut have between them taken every top but four — a claim
 * that size finds nowhere at all. See `config-howe.ts` for the sweep that
 * settled it.
 */
export const HOWE_FOOTING = 4.8

/** Radius of the mound's own foot, in metres. The kerb is set on this line. */
export const HOWE_RADIUS = 3.6

/** How far the crest stands over the ground it was raised on, in metres. */
export const HOWE_HEIGHT = 2.6

/**
 * Where the probes that measure the kerb's fall sit, in metres.
 *
 * Four stations on the kerb line itself. A barrow is piled rather than built,
 * and it is plopped rather than merged, so the skirt a `Ploppable` grows takes
 * most of what a fall does to it — which is why {@link KERB_FALL} is three
 * times the tightest sill gate in the scape. What it cannot take is a ring of
 * set stones with half of itself buried and the other half in the air, and
 * that is what these four probes are measuring the risk of.
 */
const KERB_PROBES = [[ -HOWE_RADIUS, 0 ], [ HOWE_RADIUS, 0 ], [ 0, -HOWE_RADIUS ], [ 0, HOWE_RADIUS ]] as const

/**
 * Least the ground must stand over mean water, in metres.
 *
 * Written here rather than in the config for the reason the shieling's `HILL`
 * is: it is a judgement about what counts as dry land and not a knob anybody
 * would turn. Without it the sweep is happy to put a barrow on the seabed —
 * the ring test only asks whether the ground falls away, and drowned ground
 * has tops on it like any other. The ridge island's best three stations were
 * all under the waterline before this line existed.
 */
const DRY = 1.5

/**
 * How much fall across that ring the kerb will take, in metres.
 *
 * 1.8 m across a 7.2 m ring, which is a quarter gradient — loose beside the
 * shieling's 0.55 m across three, and it has to be: this is the gate that was
 * binding on the home island at every size the mound was tried at, and the
 * skirt is what makes it affordable. See {@link KERB_PROBES}.
 */
const KERB_FALL = 1.8

/** Bearings the prospect ring is read on. */
const PROSPECT_BEARINGS = 12

/**
 * How often the sightline is sampled, in metres.
 *
 * A metre and a half, which is about the width of a footpath and well under
 * the narrowest ridge any of these islands has. The gate is a *minimum* over
 * the samples, so a step coarse enough to stride over a thin rise is a step
 * that reports a hidden mound as visible — which is the one failure this whole
 * search exists to prevent.
 */
const SIGHT_STEP = 1.5

/**
 * How far apart the stations of the sweep are, in metres.
 *
 * **Metre-sized, and a grid rather than the rings every other siting search
 * here uses.** That is the one real departure in this module and it follows
 * from the score: a ring sweep is a sweep already sorted by distance from the
 * yard, which is exactly what the smokehouse, the shieling and the mill are
 * scoring on — and this search does not score on distance at all. Swept in
 * rings it kept finding the same three stations on the one shoulder the hut
 * was already standing on, and reported four of the six islands as having
 * nowhere; swept on a grid at two and a half metres it finds every top each
 * island has.
 *
 * Two and a half metres is well inside the mound's own foot, so a top wide
 * enough to take a barrow cannot fall between two stations.
 */
const STATION = 2.5

export interface HoweSearch {

  /** The ground as the height field leaves it, in metres. */
  ground(x: number, z: number): number

  /** How far around the crest the ground has to fall away, in metres. */
  prospect: number

  /** Least the crest's ground must stand over that ring, in metres. */
  stature: number

  /** Nearest the yard the mound may stand, in metres. */
  setback: number

  /**
   * Furthest from the yard the search will look, in metres.
   *
   * **World-sized.** The island's own land radius, the same reach the dyke and
   * the shieling are given, so an archipelago whose islands grow is searched to
   * their new edge.
   */
  reach: number

  /** The height the sightline leaves the yard at, in metres. */
  eye: number

  /** Mean sea level, in metres. Nothing is raised within {@link DRY} of it. */
  waterLevel: number

  /** Ground nothing can be founded on at all — the ice, and the beck's channel. */
  barred(x: number, z: number): boolean
}

/**
 * The highest ground a prospect away, read on {@link PROSPECT_BEARINGS}.
 *
 * A ring rather than a disc, because what matters is whether the ground comes
 * back *up* somewhere out there, and a disc would be dominated by the site's own
 * shoulder every time.
 */
function ringHigh (search: HoweSearch, x: number, z: number): number {
  let high = -Infinity

  for (let step = 0; step < PROSPECT_BEARINGS; step += 1) {
    const around = step / PROSPECT_BEARINGS * Math.PI * 2

    high = Math.max(high, search.ground(
      x + Math.cos(around) * search.prospect,
      z + Math.sin(around) * search.prospect,
    ))
  }

  return high
}

/**
 * The worst drop between the kerb stations, in metres.
 *
 * One walk round the ring, like the shieling's walk round its sill, and against
 * the extremes rather than against the centre: the kerb is a closed ring and
 * what breaks it is the difference between its own highest and lowest stone.
 */
export function kerbFall (ground: (x: number, z: number) => number, x: number, z: number): number {
  let low  = Infinity
  let high = -Infinity

  for (const [ dx, dz ] of KERB_PROBES) {
    const level = ground(x + dx, z + dz)

    low  = Math.min(low, level)
    high = Math.max(high, level)
  }

  return high - low
}

/**
 * How far the mound's crest clears the ground between it and the yard.
 *
 * The straight line from `eye` metres over the yard to the top of the raised
 * mound, walked at {@link SIGHT_STEP} and measured against the ground under it.
 * Positive is a howe standing against the sky; zero or below is a howe with a
 * shoulder of its own island in front of it.
 *
 * Exported because it is the claim, and the test beside this file states it as
 * a fact about every mound the survey sited rather than trusting the gate that
 * sited them.
 */
export function skylineClearance (
  ground: (x: number, z: number) => number,
  yard:   Vec2,
  eye:    number,
  site:   Vec2,
  crest:  number,
): number {
  const span  = Math.hypot(site.x - yard.x, site.z - yard.z)
  const steps = Math.max(2, Math.ceil(span / SIGHT_STEP))
  const from  = ground(yard.x, yard.z) + eye

  let least = Infinity

  // Both ends are skipped: at the yard the line is the eye and at the mound it
  // is the crest, and neither is ground the view can be blocked by.
  for (let step = 1; step < steps; step += 1) {
    const t = step / steps

    least = Math.min(least, from + (crest - from) * t - ground(
      yard.x + (site.x - yard.x) * t,
      yard.z + (site.z - yard.z) * t,
    ))
  }

  return least
}

/**
 * The top the howe was raised on, or `null` when the island has none to offer.
 *
 * `null` is a real answer and not a failure, the same way the mill's, the
 * shieling's and the croft's are. Two kinds of island get none: one with no top
 * outside the setback that stands {@link HoweSearch.stature} clear of its own
 * neighbourhood, and one whose tops are all behind something — ground the
 * sightline from the yard runs into before it gets there. Raising
 * `howe.stature` past the archipelago's relief takes them out everywhere, and
 * there is no separate switch for the reason nothing else here has one.
 *
 * The sweep is a grid over the island rather than rings out from the yard, and
 * {@link STATION} says why.
 *
 * What the score says, in the order it says it: stand against the sky, and
 * stand over your own ground. Distance is deliberately not in it — a mound
 * twice as far away is not twice the monument, and the setback has already
 * thrown out everything too close to read as one. The kerb's fall is a gate
 * rather than a term for the same reason: ground either takes a ring of set
 * stone or it does not.
 */
export function findHoweSite (
  search: HoweSearch,
  yard:   Vec2,
  avoid:  readonly Obstacle[],
): HoweSite | null {
  if (search.reach <= search.setback)
    return null

  const steps = Math.floor(search.reach / STATION)

  let best: HoweSite | null = null
  let bestScore             = -Infinity

  // Over the island's own frame rather than out from the yard: the island is
  // centred on its local origin and the reach is its own land radius with the
  // falloff's shoulder on it, so this walks the whole of the ground a mound
  // could stand on and nothing of the water round it.
  for (let row = -steps; row <= steps; row += 1)
    for (let column = -steps; column <= steps; column += 1) {
      const x = column * STATION
      const z = row * STATION

      if (Math.hypot(x, z) > search.reach)
        continue

      const fromYard = Math.hypot(x - yard.x, z - yard.z)

      if (fromYard < search.setback || search.barred(x, z))
        continue

      const level = search.ground(x, z)

      if (level < search.waterLevel + DRY)
        continue

      const stands = level - ringHigh(search, x, z)

      if (stands < search.stature)
        continue

      if (avoid.some(thing =>
        Math.hypot(thing.x - x, thing.z - z) < thing.radius + HOWE_FOOTING))
        continue

      if (kerbFall(search.ground, x, z) > KERB_FALL)
        continue

      const skyline = skylineClearance(search.ground, yard, search.eye, { x, z }, level + HOWE_HEIGHT)

      if (skyline <= 0)
        continue

      const score = skyline * 3 + stands * 2

      if (score > bestScore) {
        bestScore = score
        best      = {
          x,
          z,
          angle:  faceToward({ x, z }, yard),
          radius: HOWE_FOOTING,
          level,
          stands,
          skyline,
          fromYard,
        }
      }
    }

  return best
}
