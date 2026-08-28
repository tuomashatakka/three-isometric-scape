import { prominenceAt } from './mill.ts'
import type { MillKeepOff, MillObstacle } from './mill.ts'
import { distanceToPath } from './path.ts'
import type { Vec2 } from './path.ts'
import type { Standing } from './steading.ts'


/**
 * Where the chapel stands, in the island's own local frame.
 *
 * The mill is sited by wind, the landing by depth and the farm by shelter. A
 * chapel answers to two things at once, and they pull against each other: it
 * wants to be *seen* — which is a rise — and it wants to be *walked to* on a
 * winter morning, which is a rise near the farm rather than the best one on the
 * island. So the search scores prominence and pays for distance, and refuses
 * outright anything past `reach`. The mill's search is the same shape with the
 * sign of the distance term flipped, which is the whole difference between the
 * two buildings.
 *
 * Pure, and free of `three`, so `scape:map` reports the site without building a
 * vertex of it.
 */
export interface ChapelSite extends Vec2 {

  /** Ground height under the socle, in metres. */
  level: number

  /**
   * Bearing the door faces, in radians — back toward the farm.
   *
   * The one building in the kit whose front is not on local `+z`: the door is in
   * the tower's west face, so this feeds {@link chapelYaw} rather than
   * `yawAlong`. See `props/chapel.ts` for why the frame is the way it is.
   */
  bearing: number

  /** How far the ground stands above its surroundings, in metres. */
  prominence: number

  /** Metres from the yard. The reason this knoll and not the better one. */
  fromYard: number
}

/**
 * How much ground the building itself claims, in metres.
 *
 * The radius that holds the whole plan — the spire's eaves at the west end and
 * the chancel gable at the east — measured from the nave's middle, which is the
 * prop's own origin. Held in step with the geometry by the test in
 * `props/chapel.test.ts` rather than by hope.
 */
export const CHAPEL_FOOTING = 5.5

/**
 * How far in front of the door the doorstep is, in metres.
 *
 * Measured from the same origin: the west face of the tower plus the pace of
 * ground a person stands on before they open it. The footpath network ends
 * here, not at the middle of the building.
 */
export const CHAPEL_DOOR_REACH = 6.4

/**
 * The yaw that turns the chapel's west door toward a bearing.
 *
 * `rotateY(θ)` sends local `+x` to `(cos θ, -sin θ)`, so it sends local `-x` —
 * the tower, the door — to `(-cos θ, sin θ)`. Setting that equal to the bearing's
 * own `(cos b, sin b)` gives `θ = π - b`.
 *
 * Not `yawAlong`, and the difference is a quarter turn plus a reflection: that
 * helper points a `+z`-fronted prop along a bearing, which is every other
 * building in the kit and none of this one. Feeding a chapel to it stands the
 * building broadside to its own path.
 */
export function chapelYaw (bearing: number): number {
  return Math.PI - bearing
}

/** Where the path meets the door — the anchor the network is routed to. */
export function chapelDoorstep (chapel: ChapelSite): Vec2 {
  return {
    x: chapel.x + Math.cos(chapel.bearing) * CHAPEL_DOOR_REACH,
    z: chapel.z + Math.sin(chapel.bearing) * CHAPEL_DOOR_REACH,
  }
}

/**
 * The chapel as something standing on the ground, in world space.
 *
 * Two things need it and neither may derive it for itself: the dressing raises
 * the building here, and `windows.ts` carries each pane out of the prop's frame
 * through the same rotation. A second copy of `chapelYaw` is a second chance to
 * get the sign wrong, and a sign wrong here is lamplight on the inside of the
 * wall it belongs to.
 */
export function chapelStanding (chapel: ChapelSite, origin: Vec2): Standing {
  return {
    x:      chapel.x + origin.x,
    z:      chapel.z + origin.z,
    angle:  chapelYaw(chapel.bearing),
    radius: CHAPEL_FOOTING,
  }
}

export interface ChapelSearch {

  /** The ground as the island falloff leaves it, in metres. */
  ground(x: number, z: number): number

  /** Radius that is dry whichever way you walk, in metres. */
  landRadius: number
  waterLevel: number

  /** Metres the ground must stand above its surroundings before a chapel is built. */
  prominence: number

  /** Furthest from the yard the search will look, in metres. */
  reach: number

  /** Radius of the churchyard wall, in metres. The ground that has to be dry. */
  yardRadius: number
}

const CHAPEL_PROBES = 34

/**
 * How much fall the socle is willing to bridge, in metres.
 *
 * A post mill stands on four piers it can pack level and tolerates 1.3 of it. A
 * chapel stands on a continuous granite foundation, and what a foundation is
 * *for* is taking up the difference between a level floor and ground that is
 * not — up to about a metre, past which it stops reading as a foundation and
 * starts reading as a building on stilts. Which is the same number, and the same
 * sentence, as `PLINTH_REACH` in the dressing, because it is the same limit seen
 * from the other end: this refuses the ground that one would have to bridge.
 */
const SILL_FALL = 0.9

/**
 * How far apart the probes that measure that fall are, in metres.
 *
 * Half the nave's length plus a little, so the four of them bracket the whole
 * building rather than the middle of it.
 */
const SILL_SPAN = 3

/**
 * How many bearings the churchyard wall is probed on before a site is allowed,
 * and the freeboard each of them needs.
 *
 * The lesson the pasture already learned and wrote down: *a centre being on land
 * says nothing about the ring*. The meadow was once sited on its middle alone
 * and put a third of its wall out where the falloff had drowned the ground. A
 * churchyard is the same shape of thing at the same scale, so the whole
 * enclosure is probed rather than its middle — and with a metre in hand, because
 * `buildStoneWallRun` drops any station under `waterLevel + 0.5` and a wall with
 * a quarter of its stations missing is a gap rather than a gateway.
 */
const WALL_PROBES    = 12
const WALL_FREEBOARD = 1

function enclosureIsDry (search: ChapelSearch, x: number, z: number): boolean {
  for (let step = 0; step < WALL_PROBES; step += 1) {
    const around = step / WALL_PROBES * Math.PI * 2
    const px     = x + Math.cos(around) * search.yardRadius
    const pz     = z + Math.sin(around) * search.yardRadius

    if (search.ground(px, pz) <= search.waterLevel + WALL_FREEBOARD)
      return false
  }

  return true
}

/**
 * How far the ground stands above the *land* around it, in metres.
 *
 * `prominenceAt` averages a ring twenty-two metres out and subtracts, which is
 * the right question on an island's interior and the wrong one anywhere near its
 * edge: on a coast this ragged half that ring is water, the seabed is nine
 * metres down, and every point on every shoreline comes back as a hill. The
 * first cut of this search sited the chapel on a spit at the tideline with two
 * thirds of its graves in the sea, and scored it 3.95 m of prominence for it.
 *
 * So a probe that lands on water contributes the candidate's *own* level — it
 * neither raises the score nor lowers it. A knoll among land still reads as a
 * knoll; a flat rock in open water reads as flat, which is what it is.
 *
 * The mill is deliberately left reading the raw ground through the same helper.
 * A headland is exactly where a mill goes, and the drop to the water is the
 * fetch it is sited for.
 */
function landProminenceAt (search: ChapelSearch, x: number, z: number): number {
  const level = search.ground(x, z)

  return prominenceAt(
    (px, pz) => {
      const at = search.ground(px, pz)

      return at > search.waterLevel ? at : level
    },
    x,
    z,
  )
}

function fallAt (search: ChapelSearch, x: number, z: number): number {
  const centre = search.ground(x, z)
  let worst    = 0

  for (const [ dx, dz ] of [[ SILL_SPAN, 0 ], [ -SILL_SPAN, 0 ], [ 0, SILL_SPAN ], [ 0, -SILL_SPAN ]])
    worst = Math.max(worst, Math.abs(search.ground(x + dx, z + dz) - centre))

  return worst
}

/**
 * The knoll the chapel is built on, or `null` when the island has none near
 * enough to walk to.
 *
 * `null` is a real answer and not a failure, the same way the mill's is: an
 * island whose only rises are out past `reach`, or too steep to lay a socle on,
 * gets no chapel rather than one leaning off a hillside half an hour from the
 * farm. Raising `chapel.prominence` past what the ground offers is the supported
 * way to take the chapels back out of the scape — there is no separate switch,
 * for the same reason nothing else here has one.
 */
export function findChapelSite (
  search: ChapelSearch,
  yard:   MillObstacle,
  lines:  readonly MillKeepOff[],
  avoid:  readonly MillObstacle[],
): ChapelSite | null {
  const edge = search.landRadius - CHAPEL_FOOTING

  if (edge <= 0)
    return null

  // Clear of the graded shelf by the building's own footing. A chapel inside the
  // farmyard is a chapel in the way of the farm — and the yard is where the
  // score would otherwise put it, because the score rewards being near.
  const fromFarm = yard.radius * 1.05 + CHAPEL_FOOTING

  let best: ChapelSite | null = null
  let bestScore               = -Infinity

  for (let ix = 0; ix < CHAPEL_PROBES; ix += 1)
    for (let iz = 0; iz < CHAPEL_PROBES; iz += 1) {
      const x = -edge + ix / (CHAPEL_PROBES - 1) * edge * 2
      const z = -edge + iz / (CHAPEL_PROBES - 1) * edge * 2

      if (Math.hypot(x, z) > edge)
        continue

      const fromYard = Math.hypot(x - yard.x, z - yard.z)

      if (fromYard < fromFarm || fromYard > search.reach)
        continue
      if (lines.some(line => distanceToPath(line.points, x, z) < line.clearance))
        continue
      if (avoid.some(thing => Math.hypot(thing.x - x, thing.z - z) < thing.radius + CHAPEL_FOOTING))
        continue

      const dryness = search.ground(x, z) - search.waterLevel

      if (dryness < 2.6 || !enclosureIsDry(search, x, z))
        continue

      const rise = landProminenceAt(search, x, z)

      if (rise < search.prominence)
        continue
      if (fallAt(search, x, z) > SILL_FALL)
        continue

      // Prominence is worth about four metres of walk. Weighted the other way
      // the chapel climbs to the island's summit, which is where a beacon goes
      // and not where a parish puts the building it carries a coffin to.
      const score = rise * 4 - fromYard * 0.1

      if (score > bestScore) {
        bestScore = score
        best      = {
          x,
          z,
          level:      search.ground(x, z),
          bearing:    Math.atan2(yard.z - z, yard.x - x),
          prominence: rise,
          fromYard,
        }
      }
    }

  return best
}
