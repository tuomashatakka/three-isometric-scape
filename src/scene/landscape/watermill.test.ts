import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { SCAPE_CONFIG } from '../config.ts'
import { buildProp, resolvePalette } from '../props/index.ts'
import { LADE_FEED, WATERMILL_SINK, WHEEL_RADIUS, WHEEL_REACH } from '../props/watermill.ts'
import { surveyArchipelago } from './archipelago.ts'
import type { LandmassSurvey } from './archipelago.ts'
import { distanceToPath } from './path.ts'
import type { Vec2 } from './path.ts'
import { doorstepOf } from './steading.ts'
import { WATERMILL_FOOTING, findWatermillSite } from './watermill.ts'
import type { WatermillSearch, WatermillSite } from './watermill.ts'


const archipelago = surveyArchipelago(SCAPE_CONFIG)
const watermill   = SCAPE_CONFIG.watermill

/** Every island that got one, with the survey it came out of. */
const built = archipelago.landmasses.filter(landmass => landmass.survey.watermill !== null)

function siteOf (landmass: LandmassSurvey): WatermillSite {
  return landmass.survey.watermill!
}

/** The mill's own frame, carried out into its island's. */
function local (site: WatermillSite, x: number, z: number): Vec2 {
  const cos = Math.cos(site.angle)
  const sin = Math.sin(site.angle)

  return { x: site.x + x * cos + z * sin, z: site.z - x * sin + z * cos }
}

/**
 * The search one island's survey would run, rebuilt from what it already has.
 *
 * The alternative is a second `surveyArchipelago`, and that is eighteen seconds
 * of composite field for two assertions about a search that takes milliseconds.
 * What is deliberately *not* reproduced here is the survey's `avoid` and its
 * `barred` — those are facts about the rest of the island, and the two tests
 * below are about this search's own gates.
 */
function searchOn (landmass: LandmassSurvey, head = watermill.head): WatermillSearch {
  const { creek } = landmass.survey.layout

  return {
    ground:      landmass.survey.field.heightAt,
    course:      creek!.points,
    clearanceAt: creek!.clearanceAt,
    courseAt:    (x, z) => creek!.sampleAt(x, z).at,
    waterLevel:  SCAPE_CONFIG.terrain.waterLevel,
    head,
    standoff:    watermill.standoff,
    freeboard:   watermill.freeboard,
    reach:       watermill.reach,
    barred:      () => false,
  }
}

describe('watermill siting', () => {
  test('the archipelago carries mills, and says which islands do not', () => {
    // Not a law of the search — `null` is a real answer — but a fact about this
    // seed, and the one the run's headline rests on. The two refusals are named
    // rather than counted, and they are not the same refusal: the meadow's beck
    // has no step in it worth building on, while the ridge never gets as far as
    // being asked, because an island twenty-seven metres across has no ground
    // that is at once off the channel, above the sea and level.
    const missing = archipelago.landmasses
      .filter(landmass => landmass.survey.watermill === null)
      .map(landmass => landmass.id)
      .sort()

    expect(missing).toEqual([ 'meadow', 'ridge' ])
    expect(built.length).toBe(4)
  })

  test('the trough is never asked to hang in the air', () => {
    // The claim the whole section rests on, and the one that would otherwise be
    // left to whoever next retunes either number. `props/watermill.ts` bakes the
    // height the lade delivers at; the config gates the fall the ground has to
    // provide. If the gate ever drops below the bake, every mill in the scape
    // gets a trough whose mouth stands above the channel it is fed from.
    expect(watermill.head).toBeGreaterThan(LADE_FEED.y - WATERMILL_SINK)

    for (const landmass of built)
      expect(siteOf(landmass).head).toBeGreaterThanOrEqual(watermill.head)
  })

  test('the underbuilding always reaches the ground it stands on', () => {
    // The sill gate and the stone that answers for it, in one assertion. The
    // search refuses ground that falls further across the room than the socle is
    // deep, so the deepest stone under the room has to be at least that far
    // down — measured on the room's own footprint rather than on the whole prop,
    // because the wheel's frame is longer still and is gated separately.
    const geometry = buildProp('watermill', createSeededRng(11), resolvePalette())
    const position = geometry.getAttribute('position').array as Float32Array
    let socle      = 0

    for (let index = 0; index < position.length; index += 3)
      if (Math.abs(position[index]) < 2.4 && Math.abs(position[index + 2]) < 1.8)
        socle = Math.min(socle, position[index + 1])

    // `SILL_FALL`, as the search's own refusals expose it.
    for (const landmass of built) {
      const site   = siteOf(landmass)
      const ground = landmass.survey.field.heightAt
      let worst    = 0

      for (const [ dx, dz ] of [[ -2, -1.45 ], [ 2, -1.45 ], [ 2, 1.45 ], [ -2, 1.45 ]]) {
        const corner = local(site, dx, dz)

        worst = Math.max(worst, Math.abs(ground(corner.x, corner.z) - site.level))
      }

      expect(socle).toBeLessThanOrEqual(-worst)
    }

    geometry.dispose()
  })

  test('it stands on the bank rather than in the channel', () => {
    for (const landmass of built) {
      const { creek } = landmass.survey.layout
      const site      = siteOf(landmass)

      expect(creek!.clearanceAt(site.x, site.z)).toBeGreaterThanOrEqual(watermill.standoff)
      expect(site.level - SCAPE_CONFIG.terrain.waterLevel).toBeGreaterThanOrEqual(watermill.freeboard)
    }
  })

  test('the mouth is on the beck, upstream of the wheel it feeds', () => {
    for (const landmass of built) {
      const { creek } = landmass.survey.layout
      const site      = siteOf(landmass)

      // On the channel's own centreline, and not merely near it: the intake is
      // one of the traced course's points, so the mouth cannot drift onto a
      // neighbouring gully the way a solved point could.
      expect(distanceToPath(creek!.points, site.intake.x, site.intake.z)).toBeLessThan(1e-6)

      // And above the mill, by the head the site claims.
      expect(site.intakeLevel - site.level).toBeCloseTo(site.head, 6)
      expect(Math.hypot(site.intake.x - site.x, site.intake.z - site.z)).toBeCloseTo(site.lade, 6)
      expect(site.lade).toBeLessThanOrEqual(watermill.reach)
    }
  })

  test('the wheel hangs over the water and the door faces away from it', () => {
    // The whole of the building's orientation, as two facts about the data. The
    // prop's frame is spoken for on three sides — see `props/watermill.ts` — and
    // nothing downstream of the search re-derives any of it.
    for (const landmass of built) {
      const { creek } = landmass.survey.layout
      const site      = siteOf(landmass)
      const wheel     = local(site, 0, -WHEEL_REACH)
      const door      = doorstepOf(site)
      const toWheel   = distanceToPath(creek!.points, wheel.x, wheel.z)
      const toDoor    = distanceToPath(creek!.points, door.x, door.z)
      const toSill    = distanceToPath(creek!.points, site.x, site.z)

      expect(toWheel).toBeLessThan(toSill)
      expect(toDoor).toBeGreaterThan(toSill)
    }
  })

  test('the lade comes in over one end of the wet wall, never across it', () => {
    for (const landmass of built) {
      const site = siteOf(landmass)
      const feed = local(site, LADE_FEED.x * site.feedSide, LADE_FEED.z)
      const run  = Math.hypot(site.intake.x - feed.x, site.intake.z - feed.z)

      expect(Math.abs(site.feedSide)).toBe(1)

      // The trough reaches the wheel from the side it was said to, which is what
      // the instanced wheel reads to decide which way round it turns.
      const along = ((site.intake.x - feed.x) * Math.cos(site.angle) -
        (site.intake.z - feed.z) * Math.sin(site.angle)) / run

      expect(Math.sign(along)).toBe(site.feedSide)
    }
  })

  test('the trough clears the ground it is carried over', () => {
    // `SETTLE` stated as a fact about every lade the archipelago actually built,
    // rather than as a constant nobody reads. A run that dives into a rise
    // halfway along and comes out the other side is the one failure mode of this
    // structure that a still would show and no other number here would.
    for (const landmass of built) {
      const site   = siteOf(landmass)
      const ground = landmass.survey.field.heightAt
      const feed   = local(site, LADE_FEED.x * site.feedSide, LADE_FEED.z)
      const feedY  = site.level - WATERMILL_SINK + LADE_FEED.y

      for (let probe = 1; probe < 8; probe += 1) {
        const share = probe / 8
        const deck  = feedY + (site.intakeLevel - feedY) * share

        expect(ground(
          feed.x + (site.intake.x - feed.x) * share,
          feed.z + (site.intake.z - feed.z) * share,
        )).toBeLessThanOrEqual(deck + 0.25)
      }
    }
  })

  test('the claim holds the whole of the works, and nothing of the trough', () => {
    const geometry = buildProp('watermill', createSeededRng(11), resolvePalette())
    const bounds   = new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)
    const reach    = Math.max(
      Math.abs(bounds.min.x), bounds.max.x,
      Math.abs(bounds.min.z), bounds.max.z,
    )

    // The house, the frame and the tail race, held by the footing. The wheel is
    // not in the geometry — it is its own fleet — so it is added back here.
    expect(WATERMILL_FOOTING).toBeGreaterThanOrEqual(reach)
    expect(WATERMILL_FOOTING).toBeGreaterThanOrEqual(WHEEL_REACH + WHEEL_RADIUS)

    geometry.dispose()
  })

  test('a head no beck can supply takes every mill out of the scape', () => {
    // The switch, and the reason there is no boolean beside it. Asked of the
    // search rather than of a second archipelago, and asked of every island
    // including the three that have no mill anyway — a switch that only works on
    // the islands that were already refusing is not a switch.
    for (const landmass of archipelago.landmasses)
      if (landmass.survey.layout.creek)
        expect(findWatermillSite(searchOn(landmass, 99), [])).toBeNull()
  })

  test('one seed gives one mill', () => {
    for (const landmass of built) {
      const search = searchOn(landmass)

      expect(findWatermillSite(search, [])).toEqual(findWatermillSite(search, []))
    }
  })
})
