import { buildLadeRun } from '../props/lade.ts'
import { LADE_FEED, WATERMILL_SINK } from '../props/watermill.ts'
import type { Walling } from './dressing-enclosures.ts'
import type { Vec2 } from './layout.ts'
import { WATERMILL_FOOTING } from './watermill.ts'
import type { WatermillSite } from './watermill.ts'


/**
 * The mill on the beck: the house, and the trough that feeds it.
 *
 * Its own module rather than a block in `dressing.ts`, for the reason the
 * enclosures moved out: that file is within a line or two of the lint config's
 * ceiling, and this is the first thing raised there that is two structures
 * instead of one. It reaches back through {@link Walling} exactly as the walls
 * do — the placement rules stay in the dressing, and the reasons for the mill
 * stay here.
 *
 * Both halves are merged into the steading's one hero draw, and each for its own
 * reason. The house is merged rather than plopped, like the windmill and unlike
 * the smokehouse, because the search already refused ground the socle could not
 * sit level on; the lade is merged because a world-space run has no frame of its
 * own to be plopped in, which is the same thing the fences and the drystone
 * walls have always done.
 *
 * What is *not* here is the wheel. It turns, so it is an instanced fleet of its
 * own — see `mill-wheels.ts` — and the hub it turns on is resolved in
 * `landscape/index.ts` from the survey rather than reported back from here, for
 * the reason the post mill's is: where the wheel goes is a fact about the site,
 * not about the geometry that was raised on it.
 */
export function raiseWatermill (
  site:    WatermillSite | null,
  origin:  Vec2,
  walling: Walling,
): void {
  if (!site)
    return

  const { heightAt, palette, placeHero, reserve, rng } = walling
  const x                                              = site.x + origin.x
  const z                                              = site.z + origin.z

  placeHero('watermill', x, z, site.angle, WATERMILL_SINK)
  reserve(x, z, WATERMILL_FOOTING + 0.8)

  // The drawn ground and not the survey's, for the reason the beck and the cart
  // ruts read it: the trough has to meet a wheel standing on the triangles the
  // camera sees, and those differ from the field they were sampled from by tens
  // of centimetres wherever the bank curves.
  const base = heightAt(x, z) - WATERMILL_SINK
  const cos  = Math.cos(site.angle)
  const sin  = Math.sin(site.angle)

  const lade = buildLadeRun({
    // The mill's own frame, carried out into the world: local `+x` lands on
    // `(cos, -sin)` and local `+z` on `(sin, cos)`, which is the same pair
    // `placeHero`'s `rotateY` applies to the building itself.
    feed: {
      x: x + LADE_FEED.x * site.feedSide * cos + LADE_FEED.z * sin,
      y: base + LADE_FEED.y,
      z: z - LADE_FEED.x * site.feedSide * sin + LADE_FEED.z * cos,
    },
    intake: {
      x: site.intake.x + origin.x,
      // The bed as the survey cut it. Taking the drawn height here instead would
      // read the terrain *inside* the channel, where the mesh is a couple of
      // quads across and disagrees with the profile by most of the beck's depth.
      y: site.intakeLevel,
      z: site.intake.z + origin.z,
    },
    heightAt,
    rng: rng.fork('lade'),
    palette,
  })

  if (lade)
    walling.addHero(lade)
}
