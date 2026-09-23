/**
 * The cliff the birds took over.
 *
 * The eighth section kept outside `config.ts`, and here for the reason the
 * guard, the treeline, the dunes, the kelp, the crag, the dyke and the shieling
 * are: a subject, moved whole.
 *
 * The crag was built as rock and has been rock ever since — seventy degrees of
 * bare stone standing over a platform the sea keeps scrubbing, on five of the
 * six islands. Nothing lives on it, and in this latitude that is the one thing
 * a cliff like it never is. A face too steep for a fox to climb, standing in
 * water deep enough to feed off, is the most contested nesting ground a
 * northern coast has: guillemots pack the broad ledges shoulder to shoulder,
 * kittiwakes take the narrow ones, and between them they whitewash the rock so
 * thoroughly that a bird cliff is visible from the sea as a pale stripe long
 * before a single bird on it can be made out.
 *
 * That stripe is why this section has a colour in it as well as a count. At the
 * zoom the tour pulls back to, four hundred birds on a headland are four
 * hundred pixels of nothing; the *stain* is what carries at that range, and it
 * carries because guano is the one thing on this coast paler than snow and it
 * is there in February as well as in June.
 *
 * **Build-time, and out of the tuning overlay for the reason `dyke` is.** Where
 * the ledges are is settled during the survey, the stain is baked into the
 * terrain's vertex colours, and the birds are stamped into one instanced draw.
 * Nothing in here can move without the scape being generated again, and a
 * slider that needs a rebuild to be seen lies about what a slider does. The one
 * thing that *does* move is which weeks of the year the ledges are occupied,
 * and that is not a knob here — it is read off the year's own clock.
 *
 * **Every share in it is a share and every length is metres.** How much room one
 * bird needs on a ledge is a fact about the bird; where up a cliff the nesting
 * band sits is a share of that cliff's own height, so a headland that grows
 * keeps its colony in the same place on the rock rather than at the same
 * altitude above the sea.
 */
export interface LedgeConfig {
  ledges: {

    /**
     * Metres of rock between mean water and the clifftop before birds take the
     * headland, and the switch for the whole system.
     *
     * Against the sea rather than against the coast either side, because what
     * makes a ledge safe is the water under it: a face standing six metres over
     * a beach is a face something can walk up the end of, and a face standing
     * six metres over ten of water is not. Every headland in this archipelago is
     * cut to the same seven metres of face by `terrain.crag.height` — the crag
     * is a shape imposed on a coast rather than one the coast happened to have
     * — so 4 takes all five and anything over 7 takes none. Which is the
     * refusal this knob is for, rather than a boolean saying the same thing.
     */
    face: number

    /**
     * Share of the face's height where the lowest row of ledges sits, 0..1.
     *
     * Above the splash. The bottom third of one of these faces is washed by
     * every gale that runs onto the headland and no egg laid there survives a
     * week of it, which is why the birds start where they start and why this is
     * a share rather than a height in metres — a taller cliff takes a bigger
     * beating and its birds start proportionally higher.
     */
    foot: number

    /**
     * Share of the face's height where the highest row sits, 0..1.
     *
     * Below the brow. The last metre under the turf is where anything that
     * walks can reach down, so it stays empty. Must be above {@link foot}; the
     * test beside the search states that as a fact about the data rather than
     * leaving it to whoever next retunes either.
     */
    brow: number

    /** Rows of ledges between {@link foot} and {@link brow}. 0 empties the cliff. */
    tiers: number

    /** Metres of ledge one bird takes up. The rows are dealt by division, not by count. */
    berth: number

    /**
     * Share of the headland's own arc the colony occupies, 0..1.
     *
     * The middle of the headland is where the face is steepest and the ledges
     * are; the ends of it are where the cliff line runs back into ordinary
     * shore. 1 would seat birds on ground a fox can walk along.
     */
    spread: number

    /**
     * How white the birds have made the rock, 0..1, and the switch for the
     * staining.
     *
     * Its own strength rather than a share of the colony's size, because the
     * two are not the same fact: the stain is decades of occupation and the
     * count is this afternoon's. A tier that cannot afford a single bird still
     * gets the cliff, which is most of what the cliff looks like from anywhere
     * but close to.
     */
    stain: number

    /**
     * Share of the year the ledges are occupied, 0..1, centred on midsummer.
     *
     * The seasonal coupling, and the switch for the birds themselves. An auk
     * comes ashore to breed and for nothing else — the rest of its year is
     * spent on open water, and the cliff it packed in June is bare rock in
     * November. 0 is a colony that never lands; 1 is one that never leaves.
     * Read off `season.time` rather than off a clock of its own, because the
     * scape has one year in it.
     */
    ashore: number
  }
}

/**
 * The colony, as tuned.
 *
 * `face` at 4 m takes all five crags the archipelago has and refuses nothing,
 * which is deliberate: the interesting refusal here is the *sixth* island,
 * which has no crag at all, and a gate that also dropped one of the five would
 * be hiding that behind a number.
 *
 * 0.32 and 0.86 put the band between about two and a quarter and six metres up
 * a seven-metre face — clear of the platform the sea washes and clear of the turf
 * anything can walk down to. Four tiers at 1.1 m of berth deal about forty
 * birds onto a headland forty metres wide at the waterline, which is a
 * respectable ledge rather than a full cliff; a real one would carry ten times
 * that and cost ten times the instances for a read that does not change.
 *
 * `spread` at 0.72 keeps the ends of the headland empty, where the face lies
 * back into shore and the search would otherwise seat a row of birds on a
 * slope. 0.62 of stain marks 7.3 % of `--poses ledge` against its own bare
 * control — a band across the headland rather than a wash over it — without the
 * rock going to chalk.
 *
 * 0.46 of the year ashore is a colony landing in the second week of April and
 * gone by the end of August, which is about right for a guillemot and means the
 * tour's winter pose photographs an empty cliff — the staining without the
 * birds, which is the whole point of their being two numbers.
 */
export const SCAPE_LEDGES: LedgeConfig = {
  ledges: {
    face:   4,
    foot:   0.32,
    brow:   0.86,
    tiers:  4,
    berth:  1.1,
    spread: 0.72,
    stain:  0.62,
    ashore: 0.46,
  },
}
