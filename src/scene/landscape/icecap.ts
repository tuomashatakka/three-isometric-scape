import { smoothstep } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { valueNoise } from '../noise.ts'


/**
 * The ice an island never loses.
 *
 * Every white thing in this scape until now has been weather. Lying snow
 * arrives on the cold half of the year and the thaw takes it back; sea ice
 * shuts the bays for a fortnight and breaks up again. This is the other kind:
 * ground that has not seen daylight in five thousand years, and that midsummer
 * finds exactly where midwinter left it.
 *
 * ## an ice cap is a parabola, not a blanket
 *
 * The tempting model is a coat of paint — take every vertex above some line and
 * lift it a metre. It is wrong in the way that matters: ice does not lie on a
 * hillside, it *flows*, and a body of ice that flows has one surface profile
 * whatever the rock under it is doing. Solved from the balance between the
 * driving stress at the bed and the ice's own yield strength, that profile is
 * `h(d) = H·sqrt(1 - d/R)` — near flat over the middle, steepening to a wall at
 * the margin. Every ice sheet that has been surveyed has that shape, from the
 * Greenland dome down to a cirque glacier.
 *
 * So the cap is authored as a *surface* and the ground is told to take the
 * higher of the two. Three things fall out of that for free, and not one of
 * them had to be written:
 *
 * - **nunataks.** A peak that stands above the dome stays rock. Nothing has to
 *   find them and nothing has to spare them: they are simply where the parabola
 *   is lower than the mountain.
 * - **a margin that follows the ground.** The ice ends where the falling dome
 *   meets the rising rock, so it reaches furthest down the valleys and stops
 *   short on the ridges, which is what an ice margin does on a map.
 * - **a front that stands in the sea.** Where the dome runs out over water
 *   rather than into a hillside there is nothing to meet it, so it is cut off
 *   at the grounding line instead — see {@link ScapeConfig.terrain.icecap}.
 *
 * ## it is in the raw ground, and it has to be
 *
 * `layout.ts` sites the farm on the ground `sunkAt` reports and `height.ts`
 * draws the ground the farm was sited on. The ice goes into *both*, at the same
 * stage of each, for the reason the fjord is cut in `baseAt`: a landform that
 * only the terrain knew about would be a dome with a farmyard levelled into the
 * side of it. Everything downstream inherits it without being told — the
 * bathymetry mask bakes off the field so the sea knows how deep the front
 * stands, the ferry lanes test the clearance so they route round it, the
 * scatter's zone tests refuse it, and `scape:map` samples the field so the cap
 * draws in ascii without the script being changed.
 *
 * And it is the ground rather than a thing standing on it: no mesh, no
 * material, no draw call, no texture. The cap costs a phone exactly what it
 * costs a workstation, which is why there is no tier gate on the one white
 * mountain in the world.
 */
export interface IceCapShape {

  /** The dome's centre, in the island's own frame. */
  x: number
  z: number

  /** Metres from that centre to where the surface comes back to the waterline. */
  reach: number

  /** Metres the apex stands above the waterline. */
  crown: number

  /** Metres of water the front may stand in before the ice floats away. */
  grounding: number
}


/**
 * Metres of rock the painted margin fades over.
 *
 * The colour, not the surface. The ground is the higher of two surfaces and
 * needs no feathering to be continuous, but the *paint* does: a hard edge
 * between white ice and dark rock lands on the terrain grid, which carries a
 * vertex every 1.4 m on the outer islands, and a step function sampled at 1.4 m
 * is a staircase. A metre and a half is one quad there and a soft margin
 * everywhere else — which is also what the ice has, because the last metre of
 * it is thin enough to see the moraine through.
 */
const MARGIN_FEATHER = 1.5

/**
 * Metres over which the front loses its footing.
 *
 * The width of the transition rather than its depth — the depth is
 * `icecap.grounding`. A hard cut would put a wall of ice on one vertex and open
 * water on the next, and the terrain grid draws that as a sawtooth rather than
 * as a cliff.
 */
const FLOAT_FEATHER = 0.6

/**
 * How much longer a fracture is than it is wide.
 *
 * A crevasse is a *line*, and how much of a line is this number: at 1 the field
 * is isotropic and the ice reads as pitted rather than cracked, and past about
 * eight the arcs run so far round the dome that they close into rings, which is
 * a lava flow. Six is a fracture a few metres across and twenty-odd long.
 */
const CREVASSE_STRETCH = 6

/**
 * The fall at which the ice is being pulled apart hard enough to break, and the
 * fall at which it is broken all the way across.
 *
 * Gradients of the *ice* surface rather than of the rock. A dome is flat on top
 * and steepens to its margin, so this is what puts the fractures in the two
 * places a photograph of an ice cap has them — in bands around the edge, and in
 * a fan wherever the ice turns a corner — and leaves the crown smooth.
 *
 * Measured rather than chosen, and the first pair was wrong by a long way. At
 * 0.06 to 0.34 the field was saturated over the whole dome — the flanks of a
 * parabola this size run at half a metre in one, well past the top of that
 * ramp — so every fracture fired at full strength everywhere and the ice
 * photographed as blue continents rather than as cracks. The band has to sit
 * where the *ice* is steep rather than where any ground would be.
 */
const STRAIN_ONSET = 0.55
const STRAIN_FULL  = 1.2


/** The dome, resolved out of the config's fractions and into metres. */
export function iceCapOf (config: ScapeConfig): IceCapShape | null {
  const cap  = config.terrain.icecap
  const half = config.terrain.size * 0.5

  if (cap.crown <= 0 || cap.reach <= 0)
    return null

  return {
    x:         cap.x * half,
    z:         cap.z * half,
    reach:     cap.reach * half,
    crown:     cap.crown,
    grounding: cap.grounding,
  }
}

/**
 * The surface the ice asks for at a point, in absolute world height.
 *
 * `-Infinity` outside the reach, so a caller can compare rather than ask first
 * whether it is inside. What the dome *wants*, not what it gets: where the rock
 * is higher this is below the ground and nothing happens, which is how a
 * nunatak stays a nunatak.
 */
function topAt (config: ScapeConfig, x: number, z: number): number {
  const cap = config.terrain.icecap

  if (cap.crown <= 0 || cap.reach <= 0)
    return -Infinity

  const half     = config.terrain.size * 0.5
  const reach    = cap.reach * half
  const distance = Math.hypot(x - cap.x * half, z - cap.z * half)

  if (distance >= reach)
    return -Infinity

  // `sqrt(1 - d/R)`, and the square root is the whole shape: at half the reach
  // the ice is still at seven tenths of its height, and the last tenth of the
  // radius spends a third of it. Flat on top and a wall at the edge.
  return config.terrain.waterLevel + cap.crown * Math.sqrt(1 - distance / reach)
}

/**
 * How much of the ice at a bed of this height is standing on something, 0..1.
 *
 * Ice that runs out past the shore has nothing under it but water, and ice with
 * water under it floats away — which is what calving *is*. So the dome is cut
 * off where the bed drops below what it can stand in, and the cut is the front.
 */
function grounded (config: ScapeConfig, bed: number): number {
  const floor = config.terrain.waterLevel - config.terrain.icecap.grounding

  return smoothstep(floor - FLOAT_FEATHER, floor, bed)
}

/**
 * Lay the ice over a ground height.
 *
 * Only ever upward, and only ever onto something. Called per terrain vertex and
 * per placement probe on every island, including the four that have no ice at
 * all — which is what the first-line return is for.
 *
 * `crown = 0` returns the height untouched, and that is the switch and the only
 * one: there is no boolean beside a height that already reaches zero.
 */
export function raiseIce (config: ScapeConfig, x: number, z: number, height: number): number {
  const top = topAt(config, x, z)

  if (top <= height)
    return height

  return height + (top - height) * grounded(config, height)
}

/**
 * How much ice covers a point, 0..1.
 *
 * The one function the paint, the scatter, the stats and the tests all read, so
 * that the white ground, the ban on planting a juniper on a glacier and the
 * number in `scape:map` describe one shape rather than three that agree today.
 *
 * Measured against the *drawn* ground rather than against the bed, which is
 * what makes it answerable anywhere: `raiseIce` has already set the surface to
 * the dome wherever there is ice, so a point is iced exactly to the extent that
 * the ground it draws at has been lifted to meet the parabola. Rock standing
 * proud of the dome — a nunatak — reads back as bare, and rock a handspan under
 * it as the thin, dirty margin it is.
 *
 * @param height The ground as the field reports it, ice included.
 */
export function iceClaim (config: ScapeConfig, x: number, z: number, height: number): number {
  const top = topAt(config, x, z)

  if (top === -Infinity)
    return 0

  const over = height - top

  if (over >= MARGIN_FEATHER)
    return 0

  return (1 - Math.max(0, over) / MARGIN_FEATHER) * grounded(config, height)
}

/**
 * How crevassed the ice is at a point, 0..1.
 *
 * Crevasses open where the ice is *stretched*, which on a dome is where it
 * accelerates — down the steep flanks and around whatever the bed puts in its
 * way — and they close again on the flat crown where nothing is pulling.
 *
 * The field is sampled in the dome's own frame rather than in the island's, and
 * that is what turns a noise field into crevasses. Ice on a cap flows outward
 * from the middle, and ice being pulled apart cracks *across* the pull, so the
 * fractures on a real cap are arcs concentric with the dome rather than a
 * spatter. Compressing the radial axis and stretching the tangential one by the
 * same factor is exactly that anisotropy, for the cost of one arc tangent.
 *
 * @param slope Fall of the *ice* surface, as a gradient.
 */
export function crevasseAt (config: ScapeConfig, x: number, z: number, slope: number): number {
  const strain = smoothstep(STRAIN_ONSET, STRAIN_FULL, slope)

  if (strain <= 0)
    return 0

  const cap    = config.terrain.icecap
  const half   = config.terrain.size * 0.5
  const dx     = x - cap.x * half
  const dz     = z - cap.z * half
  const radial = Math.hypot(dx, dz)
  const along  = Math.atan2(dz, dx) * radial
  const scale  = Math.max(0.05, cap.crevasseScale)

  const field = valueNoise(radial / scale, along / (scale * CREVASSE_STRETCH), config.seed ^ 0x1ce)

  // Ridges rather than blobs: a crevasse is a line, and the cheap way to a line
  // from a noise field is the fold at its middle. `1 - |2n - 1|` is that fold,
  // and the power sharpens it from a band into a crack.
  const ridge = 1 - Math.abs(field * 2 - 1)

  return Math.pow(ridge, 6) * strain
}

/** What the cap covers and how deep it stands, for `scape:map --stats`. */
export interface IceReport {

  /** Share of the island's dry ground under ice, 0..1. */
  share: number

  /** The highest the ice surface reaches, in metres above the waterline. */
  apex: number

  /** The most ice standing over rock anywhere on the island, in metres. */
  thickest: number

  /** How deep the front stands at its deepest, in metres. 0 is a cap that ends ashore. */
  front: number
}

/**
 * Measure the cap against the ground it stands on.
 *
 * Sampled on a grid rather than solved, because the margin is the intersection
 * of a parabola with an fBm and there is no closed form for the area of that.
 * Every number here is invisible in a still and load-bearing in a diff: a cap
 * that quietly stopped grounding, or one that swallowed a whole island, is a
 * line in the stats block long before it is a shape in a photograph.
 *
 * @param ground The field *with* the ice in it — the same one the terrain draws.
 * @param bed The same island with the ice taken back off, which is the only way
 *   to ask how thick the ice is.
 */
export function measureIce (
  config:  ScapeConfig,
  ground:  (x: number, z: number) => number,
  bed:     (x: number, z: number) => number,
  samples = 120,
): IceReport | null {
  const cap = iceCapOf(config)

  if (!cap)
    return null

  const { waterLevel }    = config.terrain
  const half              = config.terrain.size * 0.5
  const step              = half * 2 / samples
  const report: IceReport = { share: 0, apex: 0, thickest: 0, front: 0 }
  let land = 0
  let iced = 0

  for (let ix = 0; ix <= samples; ix += 1)
    for (let iz = 0; iz <= samples; iz += 1) {
      const x       = -half + ix * step
      const z       = -half + iz * step
      const surface = ground(x, z)
      const dry     = surface > waterLevel

      if (dry)
        land += 1

      if (iceClaim(config, x, z, surface) <= 0.5)
        continue

      const floor = bed(x, z)

      iced           += dry ? 1 : 0
      report.apex     = Math.max(report.apex, surface - waterLevel)
      report.thickest = Math.max(report.thickest, surface - floor)
      report.front    = Math.max(report.front, waterLevel - Math.min(waterLevel, floor))
    }

  report.share = land === 0 ? 0 : iced / land
  return report
}
