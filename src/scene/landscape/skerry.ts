import { createSeededRng } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import type { LandmassSurvey } from './archipelago.ts'
import type { Strand } from './strand.ts'


/**
 * The rocks the open sea is guarded by.
 *
 * Every landform before this one belonged to an island. The archipelago is
 * fifteen hundred metres across and five patches of it are inhabited; the rest
 * was one flat seabed quad nine metres down with a lake drawn over it, which at
 * the pulled-out poses is most of the frame and reads as paint.
 *
 * A skerry is the second thing in the scape built in *world* space, and it is
 * built that way for the same reason the strand is: the patches deliberately do
 * not overlap, so anything between them has to be a term added after the
 * composite field has dispatched. Like the bar it folds in as a **maximum**,
 * never a minimum — a rock may raise the seabed it stands on and must never cut
 * into the island it happens to lie off.
 *
 * Everything downstream then inherits it for nothing, which is the entire
 * argument for there being one height field:
 *
 * - the bathymetry mask bakes off it, so the shelf around every rock gets the
 *   depth tint and the surf breaks white on the weather side of it — which is
 *   the thing that actually fills the empty water, and not one line of it is
 *   written here
 * - the ferry navigation grid is baked from it, so the boats route *around* the
 *   guard rather than through it, by the clearance test they already ran
 * - `scape:map` samples it, so the rocks draw in ascii without the script being
 *   told they exist
 *
 * ### the scale classes
 *
 * `radius`, `crest`, `spacing` and `clearance` are **metres and stay metres** —
 * a rock is the size a rock is, and a world that grew again must not grow them.
 * What is world-sized is the domain they are thrown at, and that is read from
 * `archipelago.worldSize` rather than authored, so the guard spreads over
 * whatever sea there is. Nothing here is frame-sized: a skerry is ground, and
 * ground is never sized against the camera.
 */
export interface Skerry {

  /** Which chain it belongs to, and where in it. Carried for the survey line. */
  guard: number

  /** Centre, in world metres. */
  x: number
  z: number

  /** Metres from the centre to where the rock has fallen back to the seabed. */
  radius: number

  /** Metres the crown stands above the waterline. Always positive. */
  crest: number

  /** The two bearings its outline is warped on, so no rock is a disc. */
  lobes: readonly [number, number]
}

export interface SkerryGuard {
  skerries: readonly Skerry[]

  /** How many chains actually took. */
  chains: number

  /**
   * The rock at a point, in absolute world height.
   *
   * Returns the seabed where no rock has a claim, so a caller can take the
   * maximum unconditionally rather than testing for a claim first.
   */
  heightAt(x: number, z: number): number
}

/**
 * How much of the outline the two warp lobes may take, as a fraction.
 *
 * Derived rather than authored, like the strand's skirt. A skerry is a lump of
 * scoured granite; how lumpy is not a thing to tune per scape, and the shape has
 * to stay a closed curve — which is why these are cosines of an integer multiple
 * of the bearing rather than a noise fetch. A 1d noise sampled round a circle
 * has a seam at the wrap, and a seam is a crease down one side of every rock.
 */
const LOBE = 0.19

/**
 * How much of the radius is drowned shelf, leaving the rest as dry crown.
 *
 * The number that decides whether a skerry is a rock or a spike, and the first
 * cut of this file got it wrong by not having it at all. One smoothstep dome
 * from the seabed to the crown looks reasonable written down and is not: the
 * seabed is nine metres under the waterline and a rock carries one or two
 * metres over it, so the waterline crosses that dome at ninety-two per cent of
 * its height and the dry cap is a couple of metres across on a rock twenty-two
 * metres wide. Every one of them read as a pinprick, and the `--stats` line said
 * they were all safely above water, because at the centre they were.
 *
 * So the profile is two curves with the waterline as the seam between them, and
 * this is where the seam sits. The shelf is what the surf then breaks over, and
 * the crown is the part anybody can see.
 *
 * Exported because it is the only answer to "how much of a rock is out of the
 * water", and anything aiming at a rock rather than at the sea round it needs
 * that answer. A second copy of 0.42 elsewhere is a scatter that drifts off the
 * stone the first time the profile is retuned.
 */
export const SKERRY_WATERLINE = 0.42

const SHELF = SKERRY_WATERLINE

/** Attempts per rock before a chain gives up on the sea it is in. */
const TRIES = 24

/** The coarse index's cells across the world. See {@link createGuard}. */
const BUCKETS = 24

/** The bearing-warped radius of one rock, in metres. */
function warpedRadius (skerry: Skerry, angle: number): number {
  const [ first, second ] = skerry.lobes

  return skerry.radius * (
    1 + LOBE * Math.cos(angle * 2 + first) + LOBE * 0.62 * Math.cos(angle * 3 + second)
  )
}

/**
 * One rock's own height at a point, or `null` where it has no claim.
 *
 * Two curves meeting at the waterline — see {@link SHELF}. Neither of them is a
 * smoothstep, and deliberately: a smoothstep is flat at both ends, and two of
 * them either side of the seam would put a bench of dead-level ground exactly at
 * sea level all the way round the rock, which is the one height a bench must
 * never be. The water plane is drawn over it.
 *
 * So the shelf climbs into the waterline still gaining (`u^1.5`) and the crown
 * leaves it still gaining and flattens on top (`1 - (1 - u)²`), which is a rock
 * scoured by ice: steep where the sea works on it, broad where it does not.
 */
function skerryHeight (skerry: Skerry, waterLevel: number, seabed: number, x: number, z: number): number | null {
  const dx = x - skerry.x
  const dz = z - skerry.z

  const distance = Math.hypot(dx, dz)
  if (distance > skerry.radius * (1 + LOBE * 1.62))
    return null

  const reach = warpedRadius(skerry, Math.atan2(dz, dx))
  if (distance >= reach)
    return null

  const inward = 1 - distance / reach

  if (inward <= SHELF) {
    const climb = Math.pow(inward / SHELF, 1.5)

    return seabed + (waterLevel - seabed) * climb
  }

  const rise = (inward - SHELF) / (1 - SHELF)

  return waterLevel + skerry.crest * (1 - (1 - rise) * (1 - rise))
}

/**
 * The guard, indexed.
 *
 * Not a tidy-up to be done later — it is what makes the rocks affordable at all.
 * `heightAt` is the single query the whole scape stands on: every terrain
 * vertex, every placement, every cell of the ferry navigation grid and every
 * texel of the bathymetry mask goes through it, which on this archipelago is
 * millions of calls. A linear scan of thirty rocks per call is thirty times the
 * work for a query that is over open water almost every time, and the strand
 * already measured what that class of mistake costs: sixteen milliseconds to
 * forty-nine seconds.
 *
 * One bucket lookup answers it instead, and the bucket is empty for the great
 * majority of the sea.
 */
function createGuard (
  config:   ScapeConfig,
  skerries: readonly Skerry[],
  chains:   number,
): SkerryGuard {
  const { waterLevel, seabedDrop } = config.terrain
  const seabed                     = waterLevel - seabedDrop
  const span                       = config.archipelago.worldSize
  const cell                       = span / BUCKETS
  const buckets: Skerry[][]        = Array.from({ length: BUCKETS * BUCKETS }, () => [])

  const index = (value: number): number =>
    Math.min(BUCKETS - 1, Math.max(0, Math.floor((value + span * 0.5) / cell)))

  for (const skerry of skerries) {
    const reach = skerry.radius * (1 + LOBE * 1.62)

    for (let row = index(skerry.z - reach); row <= index(skerry.z + reach); row += 1)
      for (let column = index(skerry.x - reach); column <= index(skerry.x + reach); column += 1)
        buckets[row * BUCKETS + column].push(skerry)
  }

  return {
    skerries,
    chains,

    heightAt (x, z) {
      const bucket = buckets[index(z) * BUCKETS + index(x)]

      let height = seabed

      for (const skerry of bucket) {
        const rock = skerryHeight(skerry, waterLevel, seabed, x, z)

        // A maximum across the bucket too. Rocks in a chain are allowed to
        // touch at their drowned feet, and taking the first claim instead
        // would put a step where two skirts overlap.
        if (rock !== null && rock > height)
          height = rock
      }

      return height
    },
  }
}

/**
 * The world-space half-extent of a landmass patch, plus the margin kept round it.
 *
 * Read off the landmass's own resolved config, which is the same half-extent
 * `createCompositeField` dispatches on. Re-deriving it from the spec would be a
 * second answer to where a patch ends, and the two would part company the first
 * time a profile changed.
 */
function patchReach (config: ScapeConfig, landmass: LandmassSurvey): number {
  return landmass.config.terrain.size * 0.5 + config.skerries.clearance
}

/**
 * The rocks, thrown in chains rather than one at a time.
 *
 * A skerry guard is a drowned ridge with its high points showing, so the rocks
 * of one come in a line — and a line of five reads as a reef from four hundred
 * metres up, where the same five scattered read as five specks of noise. The
 * chain walks a bearing with a little wander on it and drops a rock every
 * `spacing` metres; a step that lands somewhere it may not sit is simply skipped
 * rather than relaxed, so a chain that runs into an island ends there.
 *
 * @returns a guard with no rocks in it when `skerries.crest` is zero — which is
 *   the switch, and the only one. There is no flag, because this is the flag.
 */
export function surveySkerries (
  config:     ScapeConfig,
  landmasses: readonly LandmassSurvey[],
  strand:     Strand | null,
): SkerryGuard {
  const { chains, perChain, radius, radiusSpread, crest, spacing } = config.skerries
  const halfWorld                                                  = config.archipelago.worldSize * 0.5

  if (crest <= 0 || chains <= 0 || perChain <= 0)
    return createGuard(config, [], 0)

  const rng              = createSeededRng(config.seed).fork('skerries')
  const reaches          = landmasses.map(landmass => ({ origin: landmass.origin, reach: patchReach(config, landmass) }))
  const placed: Skerry[] = []

  // Off every island, out of the bar, inside the plane, and not on top of a
  // rock already standing there. Every one of these is a place a rock may not
  // be rather than a place it is drawn to — where the guard ends up is the sea
  // that is left, which is why nothing here says where a reef should go.
  const room = (x: number, z: number, wide: number): boolean => {
    if (Math.abs(x) + wide > halfWorld || Math.abs(z) + wide > halfWorld)
      return false

    for (const { origin, reach } of reaches)
      if (Math.abs(x - origin.x) < reach + wide && Math.abs(z - origin.z) < reach + wide)
        return false

    // The bar is dry ground in open water and the only other thing out here.
    if (strand && strand.claimAt(x, z) > 0)
      return false

    for (const other of placed)
      if (Math.hypot(x - other.x, z - other.z) < wide + other.radius)
        return false

    return true
  }

  // A guard is a drowned ridge, so what shows of it is highest and broadest
  // where the ridge is and thins out along the line. `taper` is that one fact,
  // and both the size and the freeboard are read from it rather than each
  // rolling a shape of their own.
  const rock = (guard: number, x: number, z: number, taper: number): Skerry => ({
    guard,
    x,
    z,
    radius: radius * taper * rng.range(1 - radiusSpread, 1 + radiusSpread),
    crest:  crest * taper * rng.range(0.62, 1),
    lobes:  [ rng.next() * Math.PI * 2, rng.next() * Math.PI * 2 ],
  })

  let guards = 0

  for (let chain = 0; chain < chains; chain += 1) {
    let bearing             = rng.next() * Math.PI * 2
    let head: Skerry | null = null

    for (let attempt = 0; attempt < TRIES && !head; attempt += 1) {
      const candidate = rock(guards + 1, rng.range(-halfWorld, halfWorld), rng.range(-halfWorld, halfWorld), 1)

      if (room(candidate.x, candidate.z, candidate.radius))
        head = candidate
    }

    if (!head)
      continue

    guards += 1
    placed.push(head)

    let at = head

    for (let step = 1; step < perChain; step += 1) {
      // The wander is on the bearing rather than on the position, so a chain
      // curves the way a drowned ridge does instead of zig-zagging about a line.
      bearing += rng.range(-0.42, 0.42)

      const gap  = spacing * rng.range(0.8, 1.35)
      const next = rock(guards, at.x + Math.cos(bearing) * gap, at.z + Math.sin(bearing) * gap, 1 - step / perChain * 0.42)

      // Skipped rather than relaxed. A step that lands on an island or on a
      // rock already standing there is a chain that has run out of sea, and
      // nudging it somewhere legal is how a reef ends up drawn round a coast.
      if (!room(next.x, next.z, next.radius))
        continue

      placed.push(next)
      at = next
    }
  }

  return createGuard(config, placed, guards)
}
