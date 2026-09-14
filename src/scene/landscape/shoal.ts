import { smoothstep } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import type { LandmassSurvey } from './archipelago.ts'
import { solveCoastline } from './coast.ts'
import type { Vec2 } from './path.ts'


/**
 * The banks the swell trips on.
 *
 * The third thing in this scape built in *world* space, after the bar and the
 * guard, and folded into the composite field on exactly their terms — as a
 * **maximum**, never a minimum, so a bank may raise the seabed it lies on and
 * can never cut into the island it came off or the rock standing on it.
 *
 * What makes it worth having as its own landform is that it is the first one
 * that is never drawn. The bar is geometry, the guard is geometry, an island is
 * geometry; a bank is a term in a seabed that is one flat quad nine metres down
 * and is not drawn at all. Every single thing it does, it does by being a depth:
 *
 * - **the bathymetry mask** bakes off the field, and its depth channel saturates
 *   at `MAX_DEPTH`. A sound is past that and paints flat blue; a bank at a metre
 *   is a third of the way up the range and paints pale. That is the ribbon.
 * - **the surf** reads the mask's seaward bearing, which is the *gradient* of
 *   that same depth. A bank has flanks, so it has a gradient, so the swell that
 *   is running onto it breaks over it — in sets, on the weather side only,
 *   exactly as it does on a coast. Broken water standing in open sea with
 *   nothing showing that made it is the whole picture this section is for.
 * - **the caustics** are drawn over every shallow, and this is now a shallow.
 * - **the tide** is added to every depth the mask is read at, so all three of
 *   those walk up and down twice a day over a crest that has 0.7 m of water on
 *   it at low springs and 1.5 m at high.
 * - **the ferry grid** is baked from the field, so the lanes have been tested
 *   against the banks by the clearance rule they were already running.
 *
 * Not one line of shader was written for any of it. See `config-shoal.ts` for
 * why the crest is the number it is and how narrow the window is that a bank
 * can be seen through at all.
 *
 * ## where a spit goes is not a choice
 *
 * The dune belt sits on the shore the weather arrives at, because sand goes
 * where the weather puts it. A spit is the other half of that same sentence:
 * waves that arrive at an angle run sand *along* a coast rather than up it, and
 * where the coast turns away the drift keeps going and builds a bank out into
 * open water. So the root is a quarter turn off the weather bearing — the flank,
 * where a coast starts turning out of the swell — and the axis is that flank
 * carried downwind by `shoals.lean`, which is the hook every spit has.
 *
 * One wind gives one flank. Which of the two flanks is a fact about the sense
 * the drift runs in rather than a thing to site per island, so it is the same
 * quarter turn on every island and there is no search here at all. What *is*
 * per island is how much room the sound leaves — see {@link surveyShoals}.
 */
export interface Shoal {

  /** The island that shed it. */
  island: string

  /** Where it leaves the waterline, in world metres. */
  root: Vec2

  /** Radians, the way the bank runs from {@link root}. */
  bearing: number

  /** Metres from the root to where the bank has fallen back to the seabed. */
  length: number

  /** Half the bank's width at the root, in metres. */
  halfWidth: number

  /** How much wider the tip is than the root, as a fraction. */
  spread: number

  /** Metres of water over the crest at mean water. */
  crest: number

  /**
   * Whether the whole of {@link Shoal.reach} fitted, or the sound cut it short.
   *
   * Carried for the report rather than used: a bank shortened by the island
   * opposite is a different fact about the archipelago than a bank that ran out
   * of drift, and `scape:map` is the only place that difference can be seen.
   */
  crowded: boolean
}

export interface ShoalBanks {
  shoals: readonly Shoal[]

  /**
   * The bank at a point, in absolute world height.
   *
   * Returns the seabed where no bank has a claim, so a caller can take the
   * maximum unconditionally rather than testing for a claim first.
   */
  heightAt(x: number, z: number): number
}

/** A quarter turn, in radians. The flank is one of these off the weather. */
const QUARTER = Math.PI * 0.5

/** How finely the tip is walked out against the patch it might run into. */
const STEP = 4

/**
 * How much of the half-width, and of the length, the crest is flat across.
 *
 * The first cut of this profile was a rounded ridge — `(1 - u²)²` across and
 * `1 - t²` along — and the report is what caught it. A bank is only visible
 * where it stands in less than `MAX_DEPTH` of water, and a dome that reaches
 * its crest at exactly one point spends most of its footprint on the way down
 * to a seabed nine metres under: 1052 m² of a 5700 m² bank was inside the mask
 * and the rest of it was a shape in the field that nothing could see.
 *
 * A real bank is not a dome either. Sand is moved by water until the water can
 * no longer move it, which leaves a broad flat top at the depth the swell stops
 * working and steep flanks where it is still working — so the crest is a
 * plateau, and these are how much of the bank it covers.
 *
 * The flanks are still smooth. They have to be: the surf reads the *gradient*
 * of the depth channel, so a bank with a step in it would wear a hard white
 * line round its whole outline. What the plateau buys is where that gradient
 * *is* — nothing breaks over the flat middle, and the swell trips on the two
 * long edges, which is what breaking water over a bank actually looks like.
 */
const CREST_ACROSS = 0.45
const CREST_ALONG  = 0.5

/**
 * How far past the waterline radius the root is walked, and how finely.
 *
 * `solveCoastline` answers where the *land* ends, which on a coast that stands
 * up is not where the water starts: the home island's bank leaves a bearing
 * twenty degrees off its own crag, and the last dry metre there is three and a
 * half metres above the sea. A bank rooted on that is a bank whose first forty
 * metres are inside a cliff.
 *
 * So the root is walked seaward until the island's own field is actually under
 * water. It is a short walk by construction — the falloff drowns every coast
 * within a few metres of the line — and where it somehow is not, the island
 * sheds nothing, which is the same graceful absence a short sound gets.
 */
export const WADE = 40

const WADE_STEP = 0.5

/** How far either side of the flank a coastline is looked for. */
const FLANK_SWEEP = Math.PI / 4

/** How finely that sweep is walked. */
const FLANK_STEP = Math.PI / 36

/** One bank, with everything `heightAt` needs already resolved. */
interface Bank {
  shoal:   Shoal
  dirX:    number
  dirZ:    number
  crown:   number
  centreX: number
  centreZ: number
  bound:   number
}

/**
 * The height a bank claims at a point, or `null` where it has none.
 *
 * A flat-topped ridge, widening seaward and ending in a rounded tip — see
 * {@link CREST_ACROSS} for why it is flat rather than domed. Both falloffs are
 * smoothsteps, so the bank leaves the seabed tangentially at every edge it has
 * and there is no step anywhere in the depth channel for the surf to find.
 */
function bankHeight (bank: Bank, seabed: number, x: number, z: number): number | null {
  const dx = x - bank.shoal.root.x
  const dz = z - bank.shoal.root.z

  const along = dx * bank.dirX + dz * bank.dirZ
  if (along < 0 || along > bank.shoal.length)
    return null

  const at    = along / bank.shoal.length
  const width = bank.shoal.halfWidth * (1 + bank.shoal.spread * at)
  const cross = (dx * bank.dirZ - dz * bank.dirX) / width

  if (cross <= -1 || cross >= 1)
    return null

  const flank = 1 - smoothstep(CREST_ACROSS, 1, Math.abs(cross))
  const taper = 1 - smoothstep(CREST_ALONG, 1, at)

  return seabed + (bank.crown - seabed) * flank * taper
}

/**
 * The flank, or the nearest bearing to it that has a coast on it.
 *
 * An island is not a disc — the coast warp takes whole bearings away — and on
 * this seed one of the six has no land at all on the bearing the drift would
 * have left from. The honest answer there is the coast next door rather than no
 * bank: what the drift is doing is running along a shore until the shore turns
 * away from it, and a shore that is already gone is a shore that turned away
 * sooner. Swept outward from the flank so the nearest one always wins.
 */
function nearestCoast (
  landmass: LandmassSurvey,
  flank:    number,
): { bearing: number, shore: number } | null {
  const coast = solveCoastline(landmass.config)

  for (let offset = 0; offset <= FLANK_SWEEP + 1e-9; offset += FLANK_STEP)
    for (const bearing of offset === 0 ? [ flank ] : [ flank - offset, flank + offset ]) {
      const shore = coast.shoreAt(bearing)

      if (shore <= 0)
        continue

      const wet = wadeOut(landmass, bearing, shore)

      if (wet !== null)
        return { bearing, shore: wet }
    }

  return null
}

/** The first radius on a bearing where the island's own ground is under water. */
function wadeOut (landmass: LandmassSurvey, bearing: number, shore: number): number | null {
  const { waterLevel } = landmass.config.terrain

  for (let out = 0; out <= WADE; out += WADE_STEP) {
    const radius = shore + out
    const height = landmass.survey.field.heightAt(
      Math.cos(bearing) * radius,
      Math.sin(bearing) * radius,
    )

    if (height < waterLevel)
      return radius
  }

  return null
}

/**
 * Every landmass patch but this one, as the half-extents a tip has to stay out
 * of.
 *
 * The patches are axis-aligned and never overlap — `assertSeparate` in
 * `archipelago.ts` is what guarantees that — so a box test is exact rather than
 * an approximation of one, and the margin is added to the box rather than
 * measured to the island inside it. Deliberately: what a bank must not do is
 * reach the ground another island's *terrain* is drawn from, and that ground is
 * the patch, not the coastline in the middle of it.
 */
function patchReach (
  landmasses: readonly LandmassSurvey[],
  island:     string,
  margin:     number,
): readonly { x: number, z: number, half: number }[] {
  return landmasses
    .filter(landmass => landmass.id !== island)
    .map(landmass => ({
      x:    landmass.origin.x,
      z:    landmass.origin.z,
      half: landmass.config.terrain.size * 0.5 + margin,
    }))
}

/** How far the bank may run before its tip is inside somebody else's patch. */
function reachAvailable (
  root:    Vec2,
  dirX:    number,
  dirZ:    number,
  reach:   number,
  patches: readonly { x: number, z: number, half: number }[],
): number {
  for (let along = STEP; along <= reach; along += STEP) {
    const x = root.x + dirX * along
    const z = root.z + dirZ * along

    for (const patch of patches)
      if (Math.abs(x - patch.x) <= patch.half && Math.abs(z - patch.z) <= patch.half)
        return along - STEP
  }

  return reach
}

/**
 * Site one bank per island, and refuse the ones the archipelago has no room for.
 *
 * Surveyed from each island's *own* coastline rather than from the composite
 * field, for the reason the bar is: the shore a spit leaves is the shore that
 * island's coast warp actually put there, and the composite field does not
 * exist yet when this is asked.
 */
export function surveyShoals (
  config:     ScapeConfig,
  landmasses: readonly LandmassSurvey[],
): ShoalBanks {
  const { shoals }                 = config
  const { waterLevel, seabedDrop } = config.terrain
  const seabed                     = waterLevel - seabedDrop

  // The bearing the weather comes from, the same way `dunes.ts` reads it and
  // from the same base wind: `wind.bearing` is where the wind blows *to*, so
  // the shore it arrives at is half a turn round from it. A gust is not a
  // landform and this is read at build.
  const weather = config.wind.bearing * Math.PI / 180 + Math.PI
  const flank   = weather - QUARTER

  // A bank that dries is an islet, and an islet is a thing the terrain would
  // have to draw. Taken here rather than clamped so that the report and the
  // scene agree about what is out there.
  const lowest        = config.tide.range * 0.5 + shoals.dry
  const banks: Bank[] = []

  if (shoals.reach > 0 && shoals.crest > lowest)
    for (const landmass of landmasses) {
      const found = nearestCoast(landmass, flank)
      if (!found)
        continue

      const root = {
        x: landmass.origin.x + Math.cos(found.bearing) * found.shore,
        z: landmass.origin.z + Math.sin(found.bearing) * found.shore,
      }

      // The axis keeps its angle to the flank it actually left rather than to
      // the flank it asked for, so an island whose coast has run out on the
      // drift's own bearing still sheds a bank with the hook on it.
      const axis    = found.bearing - shoals.lean * Math.PI / 180
      const dirX    = Math.cos(axis)
      const dirZ    = Math.sin(axis)
      const patches = patchReach(landmasses, landmass.id, shoals.margin)
      const length  = reachAvailable(root, dirX, dirZ, shoals.reach, patches)

      if (length < shoals.minReach)
        continue

      const shoal: Shoal = {
        island:    landmass.id,
        root,
        bearing:   axis,
        length,
        halfWidth: shoals.halfWidth,
        spread:    shoals.spread,
        crest:     shoals.crest,
        crowded:   length < shoals.reach,
      }

      const middle = length * 0.5

      banks.push({
        shoal,
        dirX,
        dirZ,
        crown:   waterLevel - shoals.crest,
        centreX: root.x + dirX * middle,
        centreZ: root.z + dirZ * middle,
        bound:   middle + shoals.halfWidth * (1 + shoals.spread),
      })
    }

  // One bank an island and six islands, so the scan is six bounding circles
  // deep where the guard's is thirty rocks deep and had to be bucketed. The
  // reject is a squared distance against a circle that encloses the whole bank
  // — no square root, and true for every point of open sea, which is almost
  // every call this field ever takes.
  return {
    shoals: banks.map(bank => bank.shoal),

    heightAt (x, z) {
      let height = seabed

      for (const bank of banks) {
        const dx = x - bank.centreX
        const dz = z - bank.centreZ

        if (dx * dx + dz * dz > bank.bound * bank.bound)
          continue

        const claim = bankHeight(bank, seabed, x, z)

        if (claim !== null && claim > height)
          height = claim
      }

      return height
    },
  }
}
