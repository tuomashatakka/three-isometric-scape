/**
 * The light the gaps in the deck let through.
 *
 * The eleventh section kept outside `config.ts`, and here for the reason the
 * guard, the treeline, the dunes, the kelp, the crag, the dyke, the shieling,
 * the wreck, the shoal and the haar are: a subject, moved whole.
 *
 * It is the other half of a system this scape has had since the cloud shadow
 * became a module of its own. `cloud-shadow.ts` takes light *away* from the
 * ground under a cloud; it has never put any back between them. On a coast with
 * air in it that is the more visible half — a broken deck over a hazy sound
 * stands the beams up in the air as plainly as it lays the shadows down on the
 * water — and drawing one without the other is a sky that dapples and never
 * shines.
 *
 * ### it is not the post chain's god rays
 *
 * `look.godRays` is a screen-space radial smear out of whatever bright pixels
 * lie near the sun's projected position. It knows the sun and nothing else: not
 * where the cloud is, not where the gaps in it are, not what the ground under
 * them is doing. It is also `quality.godRays`, which is false on both of the
 * cheap tiers — and the capture harness pins `--tier mobile`, so it is an effect
 * no still in this repository has ever been able to show.
 *
 * This is the volume. It reads the *same* map the shadow does, cut at the same
 * threshold and thrown down the same key light, so a beam in the air and the
 * bright patch it lands on are one hole in one deck seen twice.
 *
 * ### the scale classes
 *
 * Every knob here is **dimensionless**, and that is the whole of the audit. The
 * column of air the shafts fill is a share of `atmosphere.cloudHeight`, which is
 * already metres and already the deck's own; the width of a beam is a share of
 * `atmosphere.cloudScale`, which is already the world unit the shadow tiles on;
 * the sheets reach `archipelago.worldSize` across, which is world-sized by
 * construction. There is no length in this section for a wider world or a wider
 * frame to invalidate.
 */
export interface ShaftsConfig {
  shafts: {

    /**
     * How brightly the lit air stands between the deck and the ground, 0..1.
     *
     * The switch, and the only one: 0 is the scape this section was added to.
     * There is no boolean beside it saying the same thing again.
     *
     * What is out on any given frame is not here. The beams are gated on the
     * hour and on how much of the sky is cloud — see `shaftAmount` in
     * `shafts.ts` — so a night has none of them, a clear sky has none of them
     * and an overcast one has none of them either, without a second knob saying
     * so.
     */
    strength: number

    /**
     * How much of the height under the deck the lit air fills, 0..1.
     *
     * A share of `atmosphere.cloudHeight` rather than a depth in metres, and
     * deliberately: what a shaft is, is the column between the hole and the
     * ground, so raising the deck lengthens the beams rather than leaving them
     * hanging under a cloud that has moved up away from them. 1 fills the whole
     * column and puts the top sheet in the deck's own plane, which is a sheet
     * fighting the cloud for pixels; the default stops short of it.
     */
    reach: number

    /**
     * What the bottom of a beam keeps of the top of it, 0..1.
     *
     * A shaft is brightest where it leaves the cloud and dimmest where it
     * arrives, because the light has been scattering out of it the whole way
     * down. 1 is an even column — a slab of light with a hard bottom edge — and
     * 0 is a beam that has nothing left by the time it reaches the water.
     */
    taper: number
  }
}


export const SCAPE_SHAFTS: ShaftsConfig = {
  shafts: {

    // Read off the `shafts` line of `scape:map --stats` and then off the
    // pictures, which is the only way to set an additive term: the number that
    // matters is not this one but what a stack of sheets composites to, and the
    // stack sums to about 1.35 of it in a hole the whole column can see
    // through. The first picture taken of this section went up at 0.17 with a
    // beam ramp four times as wide as the one it has now, and the sound between
    // the shafts came out milky — a lens flare rather than weather. Both
    // numbers came down together.
    strength: 0.22,

    // Five sixths of the way up to the deck. The last sixth is left clear
    // because the cloud layer is drawn in that plane and two transparent sheets
    // sharing a height is the projected-depth coin toss `layers.ts` exists to
    // settle.
    reach: 0.84,

    // Most of the way down, and short of an even column. The falloff is what
    // separates a beam from a slab at this camera's elevation: the eye reads the
    // *gradient* along a shaft as its direction, and a column of constant
    // brightness has no direction in it at all.
    taper: 0.35,
  },
}
