/**
 * The wash on the line.
 *
 * A subject moved whole, like the hjell beside the boats — and its opposite in
 * every way that matters to a reader. A rack of fish is the year's clock; a line
 * of washing is the *day's* and the *weather's*. It goes out in the morning,
 * comes in at dusk and comes in faster when the rain starts, and in between it
 * is the one thing at ground level that shows which way the wind is blowing and
 * how hard. Every farm in the archipelago has one, strung across the yard
 * beside the house — see `landscape/steading.ts` for where, `props/wash.ts`
 * for the posts and the cloth, and `landscape/wash.ts` for the draw.
 *
 * **Build-time for the line, per-frame for the cloth.** {@link WashConfig.wash.length},
 * `height` and `fill` decide what is raised and how much is pegged out, which
 * takes a rebuild to see, so they stay out of the overlay. `billow` and
 * `flutter` are read every frame and are in it.
 *
 * **Metres, except the two that are a share and a rate.** `length` and `height`
 * are lengths of rope and post and stay metres on an archipelago of any size;
 * `fill` is cloths per metre of rope; `billow` is radians at full wind;
 * `flutter` is flaps a second.
 */
export interface WashConfig {
  wash: {

    /** Metres of rope between the two posts. */
    length: number

    /**
     * How high the rope is tied at the posts, in metres.
     *
     * **The switch for the line.** 0 is a farm with no line, reached through
     * the arithmetic: the cloth hangs off the rope, so no rope is no wash.
     */
    height: number

    /**
     * Cloths per metre of rope. The density knob, under the tier's budget in
     * `quality.washCloths`, which thins every farm rather than stripping one.
     */
    fill: number

    /**
     * How far a cloth is blown out from plumb at full wind, in radians.
     *
     * Only the wind blowing *across* the rope lifts it — a wind along the line
     * runs down the edge of every sheet and leaves it hanging — so the same
     * gust stands one farm's wash straight out and leaves the next one limp.
     * 0 is wash that hangs plumb in a gale.
     */
    billow: number

    /**
     * How fast the cloth snaps in the gusts, in flaps a second.
     *
     * A rate, so it is in `STILL`: the flap is scaled by the wind already, but
     * a capture must not depend on a second knob's value to be reproducible.
     */
    flutter: number
  }
}

export const SCAPE_WASH: WashConfig = {
  wash: {
    length:  6.4,
    height:  1.95,
    fill:    1.1,
    billow:  1.05,
    flutter: 1.4,
  },
}
