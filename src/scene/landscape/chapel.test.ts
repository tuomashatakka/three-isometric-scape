import { describe, expect, test } from 'bun:test'
import { Euler, Vector3 } from 'three'
import { SCAPE_CONFIG } from '../config.ts'
import {
  CHAPEL_DOOR_REACH,
  CHAPEL_FOOTING,
  chapelDoorstep,
  chapelStanding,
  chapelYaw,
  findChapelSite,
} from './chapel.ts'
import type { ChapelSearch } from './chapel.ts'
import { createScapeLayout } from './layout.ts'
import { farmWaypoints } from './network.ts'
import { distanceToPath } from './path.ts'
import { steadingPlaces } from './steading.ts'


const YARD = { x: -14, z: 3, radius: 12 }

/** A gentle rise near the farm, so a search that wants one has it to find. */
function knoll (height: number, at = { x: 14, z: -16 }): ChapelSearch {
  return {
    ground:     (x, z) => height * Math.exp(-((x - at.x) ** 2 + (z - at.z) ** 2) / 900) + 2,
    landRadius: 44,
    waterLevel: -1.25,
    prominence: 0.8,
    reach:      90,
    yardRadius: 11,
  }
}

describe('siting a chapel', () => {
  test('finds the rise, off the yard and inside the island', () => {
    const search = knoll(7)
    const site   = findChapelSite(search, YARD, [], [])

    expect(site).not.toBeNull()
    expect(site!.prominence).toBeGreaterThanOrEqual(search.prominence)
    expect(Math.hypot(site!.x - YARD.x, site!.z - YARD.z))
      .toBeGreaterThanOrEqual(YARD.radius * 1.05 + CHAPEL_FOOTING)
    expect(Math.hypot(site!.x, site!.z)).toBeLessThanOrEqual(search.landRadius - CHAPEL_FOOTING)
  })

  test('refuses flat ground rather than settling for it', () => {
    expect(findChapelSite({ ...knoll(7), ground: () => 4 }, YARD, [], [])).toBeNull()
  })

  /**
   * The one rule that makes this a different search from the mill's. A knoll at
   * the far end of the island is a fine mill site and a useless chapel: nobody
   * carries a coffin an hour up a headland, so `reach` refuses it outright
   * rather than merely scoring it down.
   */
  test('refuses a rise nobody would walk to, however prominent', () => {
    const far = knoll(9, { x: 38, z: 20 })

    expect(findChapelSite(far, YARD, [], [])).not.toBeNull()
    expect(findChapelSite({ ...far, reach: 30 }, YARD, [], [])).toBeNull()
  })

  /**
   * A socle is a foundation, not a stilt. Ground that falls a metre and a half
   * across the nave is ground the building cannot be laid on, and the search has
   * to say so before the dressing tries to plop a chapel onto it.
   */
  test('refuses ground the socle could not bridge', () => {
    const ramp: ChapelSearch = { ...knoll(7), ground: (x, z) => 6 + (x + z) * 0.4 }

    expect(findChapelSite(ramp, YARD, [], [])).toBeNull()
  })

  /**
   * The lesson the pasture wrote down, applied a second time: *a centre being on
   * land says nothing about the ring*. The meadow was once sited on its middle
   * alone and put a third of its wall out where the falloff had already drowned
   * the ground. A churchyard is the same shape of thing at the same scale, and
   * the failure would be quieter — `buildStoneWallRun` simply drops the drowned
   * stations, so the wall comes out with a gap in it and nothing says why.
   */
  test('refuses a knoll whose churchyard would be half in the water', () => {
    // A flat-topped spit: level under the building, gone by the wall line.
    const spit: ChapelSearch = { ...knoll(7), ground: (_, z) => 6 - Math.max(0, Math.abs(z) - 6) * 2 }

    expect(findChapelSite(spit, YARD, [], [])).toBeNull()
  })

  /**
   * The score is against the land, not against the sea. `prominenceAt` averages
   * a ring twenty-two metres out, and on a coast this ragged half of that ring
   * is water nine metres down — so every point on every shoreline reads as a
   * hill, and the first cut of this search put the chapel on a spit at the
   * tideline with two thirds of its graves under water.
   */
  test('does not read the sea beside a point as ground below it', () => {
    // Genuinely flat land that simply stops. Only the drop to the seabed could
    // make anything here look prominent.
    const coast: ChapelSearch = {
      ...knoll(7),
      ground:     (x, z) => Math.hypot(x, z) < 30 ? 4 : -9,
      waterLevel: -1.25,
      prominence: 0.8,
    }

    expect(findChapelSite(coast, YARD, [], [])).toBeNull()
  })

  test('keeps the whole building off the lines and the discs', () => {
    const line = [{ x: 0, z: 0 }, { x: 44, z: 0 }]
    const site = findChapelSite(
      knoll(7),
      YARD,
      [{ points: line, clearance: 6 }],
      [{ x: 14, z: -16, radius: 5 }],
    )

    expect(site).not.toBeNull()
    expect(distanceToPath(line, site!.x, site!.z)).toBeGreaterThanOrEqual(6)
    expect(Math.hypot(site!.x - 14, site!.z + 16)).toBeGreaterThanOrEqual(5 + CHAPEL_FOOTING)
  })

  test('turns the door back toward the farm, and puts the doorstep in front of it', () => {
    const site = findChapelSite(knoll(7), YARD, [], [])!
    const step = chapelDoorstep(site)

    expect(site.bearing).toBeCloseTo(Math.atan2(YARD.z - site.z, YARD.x - site.x), 6)
    expect(Math.hypot(step.x - site.x, step.z - site.z)).toBeCloseTo(CHAPEL_DOOR_REACH, 6)

    // In front of the door means *nearer the farm*, which is the half of it a
    // sign error would silently invert.
    expect(Math.hypot(step.x - YARD.x, step.z - YARD.z)).toBeLessThan(site.fromYard)
  })
})

/**
 * The claim `yawAlong` cannot make for this building: the chapel is fronted on
 * local `-x` rather than on `+z`, so the rotation that turns its door toward a
 * bearing is a different one, and getting it wrong stands the church broadside
 * to the path worn to its door.
 */
describe('the yaw the chapel is raised with', () => {
  test('carries the tower end onto the bearing itself', () => {
    for (const bearing of [ 0, 0.7, 2.4, -1.9, Math.PI ]) {
      const west = new Vector3(-1, 0, 0).applyEuler(new Euler(0, chapelYaw(bearing), 0))

      expect(west.x).toBeCloseTo(Math.cos(bearing), 6)
      expect(west.z).toBeCloseTo(Math.sin(bearing), 6)
    }
  })

  test('the standing carries the site into world space exactly once', () => {
    const site     = findChapelSite(knoll(7), YARD, [], [])!
    const standing = chapelStanding(site, { x: 178, z: 128 })

    expect(standing.x).toBeCloseTo(site.x + 178, 6)
    expect(standing.z).toBeCloseTo(site.z + 128, 6)
    expect(standing.angle).toBeCloseTo(chapelYaw(site.bearing), 6)
    expect(standing.radius).toBe(CHAPEL_FOOTING)
  })
})

describe('the chapel the scape actually has', () => {
  const layout = createScapeLayout(SCAPE_CONFIG)

  test('the home island builds one, clear of the mill and the beck', () => {
    expect(layout.chapel).not.toBeNull()
    expect(layout.chapel!.fromYard).toBeLessThanOrEqual(SCAPE_CONFIG.chapel.reach)

    if (layout.mill)
      expect(Math.hypot(layout.chapel!.x - layout.mill.x, layout.chapel!.z - layout.mill.z))
        .toBeGreaterThan(CHAPEL_FOOTING)

    if (layout.creek)
      expect(distanceToPath(layout.creek.points, layout.chapel!.x, layout.chapel!.z))
        .toBeGreaterThan(CHAPEL_FOOTING)
  })

  /**
   * The chapel is only in the scape if a path reaches it. Everything else about
   * the building could be right and it would still read as scenery dropped on a
   * hill — so the waypoint's presence, and its distance from the site, is the
   * claim worth stating.
   */
  test('the network walks to its door rather than to its middle', () => {
    const points = farmWaypoints(layout, steadingPlaces(layout.yard), [])
    const chapel = points.find(point => point.kind === 'chapel')

    expect(chapel).toBeDefined()
    expect(Math.hypot(chapel!.x - layout.chapel!.x, chapel!.z - layout.chapel!.z))
      .toBeCloseTo(CHAPEL_DOOR_REACH, 6)
  })
})
