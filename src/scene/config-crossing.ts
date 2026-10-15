/**
 * The plank bridge where a worn path steps into the beck.
 *
 * The tenth section kept outside `config.ts`, and here for the reason the
 * guard, the treeline, the dunes, the kelp, the crag, the dyke, the shieling,
 * the howe and the snow fence are: a subject, moved whole.
 *
 * Every route in this scape was planned against things that *stand* — a barn,
 * a fold, a mound, a mill — and against nothing that *runs*. `network.ts` costs
 * a leg by what it would have to walk round, and a stream is not something you
 * walk round; it is something you walk through. So the footpaths have always
 * crossed the beck wherever the straight line between two doors happened to
 * meet it, and the tread went down one bank, through standing water and up the
 * other with nothing laid over it. Nobody saw it because the channel is two
 * metres across and the default pose is forty metres up.
 *
 * This is the thing that was missing, and the smallest structure in the scape:
 * two stone abutments, three stringers, a deck of sawn boards and a rail on the
 * downstream hand. It is sited by the paths rather than by the ground — the
 * first structure here placed by **where people already walk** instead of by
 * what a hillside is like — and a crossing the farm does not use gets nothing,
 * however easy the span would be.
 *
 * **Build-time, and out of the tuning overlay for the reason `howe` is.** The
 * spans are settled during the survey, after the treads are traced, and the
 * timber is baked into the steading's one merged draw. A slider that needs a
 * rebuild to be seen lies about what a slider does.
 *
 * **Metres, all of them, and they stay metres on an archipelago of any size.**
 * Every number here is a length of sawn timber or a gap a person steps over;
 * none of them is a share of `archipelago.worldSize`, because a beck three
 * metres across is three metres across whether the world is one kilometre or
 * ten. See `landscape/crossing.ts` for the siting and `props/crossing.ts` for
 * the timber.
 */
export interface CrossingConfig {
  crossing: {

    /**
     * How wide the deck is, in metres.
     *
     * **The switch, and the only one.** There is no `enabled` here for the
     * reason there is none anywhere: 0 is an archipelago that fords its becks,
     * and the survey still reports every place a tread goes into the water, so
     * turning this off is a scape with wet feet rather than a scape with a
     * blank in it.
     *
     * 1.1 m is two boards and a person with a creel on each arm. Widening it
     * does nothing to where a bridge goes and everything to how much of the
     * beck it hides.
     */
    deck: number

    /**
     * How wide the deck is where the **cart road** crosses, in metres.
     *
     * Wider than a footbridge and railless, and both for the same reason: the
     * thing going over it is a cart at the gauge `cartRuts.gauge` sets, and a
     * handrail is what a hub takes off. 0 is a road that fords its beck, which
     * is a real thing on a real island and what the survey reports when the
     * gap is too wide to deck.
     */
    cart: number

    /**
     * The narrowest stream the farm will deck rather than step over, in metres
     * of standing water.
     *
     * The second refusal, and the one that reads the terrain rather than the
     * structure. A beck's cut ramps in over the first fifth of its course — see
     * `creek.ts` — so a way that meets the channel up near the spring is
     * crossing a damp crease, and a bridge over a damp crease is the kind of
     * thing that makes a whole scape read as a model village. Below this the
     * crossing is reported as a dry ford, which is what it is.
     */
    least: number

    /**
     * The longest stretch of deck that stands on nothing, in metres.
     *
     * Not a refusal: past this the run is divided into a whole number of bays
     * and a trestle is driven at each joint, which is what a farm does when the
     * gap outgrows the beam it has. It is here rather than inside the builder
     * because it is the number that decides whether a nine-metre crossing reads
     * as a bridge or as a plank levitating over an estuary, and because raising
     * {@link span} without it is exactly how you get the second one.
     */
    bay: number

    /**
     * The widest gap a bridge will take at all, in metres.
     *
     * The refusal, and the one that matters. Past this a crossing is a
     * different structure — a causeway, or a boat — and the survey reports it
     * as a ford and leaves it, which is the honest reading of a farm that has
     * a shallow place it wades at and no reason to build.
     *
     * Twelve metres is three or four bays of trestle work, which is a bridge a
     * township builds and about the limit of what a single farm would. It is
     * where the line should fall on these islands: it takes in the beck's
     * tidal reach and the sea guts the road to the landing crosses, and leaves
     * out the wide flats, which do not want a bridge — they want the tide to
     * go back out.
     */
    span: number

    /**
     * Metres of bearing each abutment takes on its own bank, past the edge of
     * the channel.
     *
     * Not decoration: it is what stops the deck ending on the lip of a cut
     * bank, which is the one place on a beck the ground is certain to give. It
     * is added to the measured gap at *both* ends, so widening it lengthens
     * every bridge and refuses the widest of them against {@link span}.
     */
    landing: number

    /**
     * The most height a level deck will make up between its two banks, in
     * metres.
     *
     * The third refusal, and the one that is about the *structure* rather than
     * about the water. A plank bridge is level, and a level deck laid between
     * banks at two different heights has one end standing in the air on an
     * abutment nobody could have built. Past this the ground wants a ramp cut
     * into the bank, which is a different structure and a different run.
     */
    step: number

    /**
     * Least metres of air between the deck's underside and the water standing
     * under it.
     *
     * A beck in spate is not the beck the survey measured, and a deck laid on
     * the summer water is a deck that floats away in October. It is also what
     * keeps the boards clear of the sheet when the two are within centimetres
     * of each other — the beck's surface and a deck at bank level z-fight long
     * before either of them looks wrong.
     */
    freeboard: number

    /**
     * How high the handrail stands over the deck, in metres.
     *
     * 0 is a bare plank crossing, which is a real thing on a real croft and the
     * graceful absence this knob has instead of a boolean. The rail goes on one
     * hand only — the downstream one, because that is the way you go in.
     */
    rail: number

    /**
     * The most bridges one island will carry.
     *
     * A budget rather than a rule about ground, and it is here because the
     * network is a *graph*: a beck that runs between the yard and the shore can
     * be crossed by five legs within thirty metres of each other, and five
     * bridges over one stream is not a farm, it is a trade fair. Crossings
     * closer together than {@link span} are already one bridge; this caps what
     * is left.
     */
    most: number
  }
}

export const SCAPE_CROSSING: CrossingConfig = {
  crossing: {
    deck:      1.1,
    cart:      2.1,
    least:     0.9,
    step:      1.2,
    bay:       4.5,
    span:      12,
    landing:   0.7,
    freeboard: 0.35,
    rail:      0.95,
    most:      2,
  },
}
