import { buildFootbridge } from '../props/crossing.ts'
import type { LandmassSurvey } from './archipelago.ts'
import type { Walling } from './dressing-enclosures.ts'


/**
 * Metres of scatter kept clear round each abutment.
 *
 * Narrow, and narrower than the deck is long. What has to be kept off a bridge
 * is a juniper grown through the handrail and a boulder sitting on the boards;
 * what does not have to be kept off it is the bank either side, which is wet
 * ground with reeds in it and reads better for having them. So the claim is the
 * stonework's own footprint and nothing more.
 */
const ABUTMENT_CLAIM = 1.1

/**
 * The bridges, raised on the spans the survey measured.
 *
 * Its own module rather than a block in `dressing.ts` or in the enclosures, for
 * the reason the watermill moved out: both of those files sit within a line or
 * two of the lint config's ceiling. It reaches back through {@link Walling}
 * exactly as the walls do.
 *
 * The one thing done here rather than in the survey is the **level**, and that
 * is deliberate. The survey settled the deck against the ground it measured;
 * the beck's own sheet is laid on the ground the tier actually tessellated, and
 * those two disagree by tens of centimetres wherever the bank curves — which is
 * most of the depth of a stream this size. A deck placed on the survey's answer
 * alone comes out under its own water on a mobile grid. So the level is taken
 * again here, against the drawn bed, and it only ever goes *up*: the freeboard
 * the config asks for is a floor, not a target.
 */
export function raiseCrossings (landmass: LandmassSurvey, walling: Walling): void {
  const { bridges } = landmass.survey.crossings

  const { crossing, beck } = landmass.config

  // The deck's own width is the switch — see `config-crossing.ts`. The survey
  // still settles and reports every crossing at zero, so turning this off is a
  // scape with wet feet rather than a scape with a blank in its instruments.
  if (bridges.length === 0 || crossing.deck <= 0)
    return

  const { x: ox, z: oz } = landmass.origin
  const { heightAt }     = walling

  bridges.forEach((site, index) => {
    const near = { x: site.near.x + ox, z: site.near.z + oz }
    const far  = { x: site.far.x + ox, z: site.far.z + oz }
    const cart = site.kind === 'cart'

    // The water as the tier actually drew it, and the same rule the survey
    // used: a beck's own sheet, or the sea, whichever is standing higher. At
    // the bottom of a course that is the sea every time, because the mouth is
    // dredged below the waterline.
    const sheet = site.over === 'beck'
      ? Math.max(heightAt(site.x + ox, site.z + oz) + beck.depth, walling.waterLevel)
      : walling.waterLevel

    const deck = Math.max(
      site.deck,
      heightAt(near.x, near.z),
      heightAt(far.x, far.z),
      sheet + crossing.freeboard,
    )

    const run = buildFootbridge({
      near,
      far,
      deck,
      width:   cart ? crossing.cart : crossing.deck,
      // No rail on the road's crossing. A cart's hub stands proud of its wheel
      // and takes the inside of a rail off at the first corner, so what a cart
      // bridge has instead is a wider deck — see `config-crossing.ts`.
      rail:    cart ? 0 : crossing.rail,
      bay:     crossing.bay,
      // The same board density the pier's deck takes, and the same argument:
      // the whole run is merged into the steading's one hero draw, so a bridge
      // costs no draw call on any tier and there is nothing here to turn off.
      // What scales is the vertex count of the boards.
      boards:  walling.bridgeBoards,
      heightAt,
      rng:     walling.rng.fork(`crossing-${landmass.id}-${index}`),
      palette: walling.palette,
    })

    if (run)
      walling.addHero(run)

    walling.reserve(near.x, near.z, ABUTMENT_CLAIM)
    walling.reserve(far.x, far.z, ABUTMENT_CLAIM)
  })
}
