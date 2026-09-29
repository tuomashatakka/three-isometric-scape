/**
 * The water the narrows hurry.
 *
 * The tenth section kept outside `config.ts`, and here for the reason the
 * guard, the treeline, the dunes, the kelp, the crag, the dyke, the shieling,
 * the wreck and the shoal are: a subject, moved whole.
 *
 * The scape has had a tide since `tide.ts` landed, and until now the only thing
 * the tide did was move the water *up and down*. A tide is a wave crossing a
 * shelf, which means the water it raises has to arrive from somewhere and leave
 * again six hours later — and between two islands a quarter of a mile apart,
 * the whole of a sound's worth of sea goes through a gap a hundred metres wide,
 * twice each way, every day. That is a roost: standing broken water in a place
 * that is flat calm at slack and white an hour later, with no wind anywhere in
 * the reason.
 *
 * Nothing here is drawn, in the sense the dyke and the pier are drawn. The gates
 * are found in the bathymetry the mask is already baked from, packed into the
 * one channel of it that has carried nothing since it was written — see
 * `landscape/shore-mask.ts` — and the white is arithmetic on the fetch the
 * surface was already making. The strength is the tide's own rate of change,
 * resolved once on the cpu. See `landscape/roost.ts`.
 *
 * ### the scale classes
 *
 * **Every length here is metres, and stays metres.** How wide a gap has to be
 * before the tide stops hurrying through it is a fact about how much water is
 * trying to get past and how fast — which is a fact about the sea, not about
 * how wide this world is drawn or how much of it the camera holds. A world that
 * grows again puts the islands further apart and opens the sounds between them,
 * and the correct consequence of that is *fewer* roosts, not wider ones.
 *
 * ### what is build-time and what is not
 *
 * {@link RoostConfig.roost.gate}, {@link RoostConfig.roost.reach},
 * {@link RoostConfig.roost.opening} and {@link RoostConfig.roost.spread} bake
 * the mask, so they are out of the tuning overlay for the reason `shoals` and
 * `dyke` are: a slider that needs a rebuild to be seen lies about what a slider
 * does. {@link RoostConfig.roost.strength} and {@link RoostConfig.roost.chop}
 * are read per frame and are in the panel.
 */
export interface RoostConfig {
  roost: {

    /**
     * How white the water in a gate gets at the top of the stream, 0..1.
     *
     * The switch, and the only one: at 0 the sounds run as smooth at half ebb
     * as they do at slack, which is the sea this scape had before this section
     * existed. There is no boolean beside it saying the same thing again.
     *
     * A share of the way to `palette.foam` rather than a colour of its own, the
     * same way `CAP_TORN` is in `water-caps.ts` and for the same reason: an
     * overfall seen from two hundred metres up is a crest with some air torn
     * into it, not a patch of surf, and water mixed the whole way to foam stops
     * reading as water at all.
     */
    strength: number

    /**
     * Metres across which a gap still hurries the tide.
     *
     * The number the whole system stands on, and the one that decides *which*
     * channels in the archipelago get a race rather than how hard they run. A
     * sound that is wide has the same volume of water through it over the same
     * six hours as a narrow one and is doing it at a tenth of the speed, so
     * there is nothing to see; the white starts where the gap gets tight.
     *
     * 90 m is measured against this archipelago rather than chosen for the look
     * of the number. The six islands stand two to five hundred metres apart, so
     * none of the open sounds is a gate at any setting; what is inside 90 m is
     * the channels between the home island's own islets, the lanes through the
     * skerry guards, and the mouths the beck and the creek run out of. Those
     * are the places a boat actually has to wait for slack, which is the test
     * of whether the number is honest.
     *
     * Half of it is the widest a gate's *centreline* can be from either shore,
     * which is what the search below actually measures — see `roost.ts`.
     */
    gate: number

    /**
     * Metres along the channel the search looks for a way out of it.
     *
     * A narrow piece of water is not a gate unless the sea is trying to get
     * through it. A cove is narrow, a tarn is narrow, and the inside of a
     * harbour is narrow; none of them has a tide running through, because the
     * water in them is a dead end. So the search walks the channel's own axis
     * both ways and asks whether it comes out into open water at each end, and
     * this is how far it is willing to walk before giving up.
     *
     * Comfortably past {@link gate} rather than near it: a gate as wide as the
     * search is long is a gate the search cannot tell from a bay.
     */
    reach: number

    /**
     * Metres of open water that has to be found at *both* ends of the channel.
     *
     * The other half of {@link reach}, and the half that throws out the bays. A
     * walk up a cove reaches the head of it and stops; a walk out of a gate
     * reaches a sound. "Open" here is the distance from that water to the
     * nearest dry ground, so this is stated in the same currency the gate is —
     * half a channel width — and has to be comfortably more than half of
     * {@link gate} or every gate would qualify as its own exit.
     */
    opening: number

    /**
     * Metres the broken water trails out of the gate before it dies.
     *
     * A roost is not confined to the line between the two headlands. The stream
     * carries what it tore up out past the narrowest point and it takes a while
     * to lie down again, so the band the search found is spread along and
     * across the channel from there, fading as it goes.
     *
     * Short, and the first build had it at 34 m. Around the home island that was
     * enough for the trails out of fifteen islets' worth of channels to meet
     * each other in the middle, and the inshore water came out as one continuous
     * white field with the islands standing in rings of it. 16 m keeps each gate
     * a piece of water with a shape rather than a contribution to a wash — the
     * measure of the number is `scape:map`'s lit share, which it takes from
     * about nine per cent of the archipelago's water down to six.
     */
    spread: number

    /**
     * How much the race roughens the water it is standing in, 0..1.
     *
     * Separate from {@link strength} because they are separate halves of what
     * broken water is: one is the air torn into it, which is white, and this is
     * the surface being pulled about, which shows at every angle the white does
     * not. 0 is a race that is a stain on a flat sea.
     */
    chop: number
  }
}

export const SCAPE_ROOST: RoostConfig = {

  // Swept against the six islands with `scape:map --stats`, and read as how many
  // gates the archipelago has and how tight the tightest is. At `gate` 90 and
  // `opening` 58 the search finds the lanes through the guards and the channels
  // between the home islets and refuses the open sounds, the tarn and the
  // harbour — which is the split the section is for.
  //
  // `strength` 0.72 is what the *squared* stream curve needs rather than what
  // the top of it wants. At springs and half tide a roost goes most of the way
  // to foam, which is right — a race running at four knots is as white as
  // anything in this archipelago — but the archipelago's default week is a long
  // way off springs, and `roostAmount` squares what is left. At the clock every
  // pose in `tour` is parked on, 0.72 comes out as about a third of the way to
  // foam down the middle of the tightest gate, which is a pale band in a blue
  // sound rather than a stripe of paint.
  roost: {
    strength: 0.72,
    gate:     90,
    reach:    150,
    opening:  58,
    spread:   16,
    chop:     0.55,
  },
}
