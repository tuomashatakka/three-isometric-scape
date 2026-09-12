/**
 * The wreck the rock kept.
 *
 * The eighth section kept outside `config.ts`, and here for the reason the
 * guard, the treeline, the dunes, the kelp, the crag, the dyke and the shieling
 * are: a subject, moved whole.
 *
 * Everything else sited in this scape is somebody's judgement about where to put
 * a thing. This is the one place on the coast that is the opposite — a hull is
 * not *put* on a rock, and the whole section is written round that. It carries
 * no size, no count and no angle, because there is nothing to arrange: what is
 * left to decide is only which rock is the kind of rock that catches boats, and
 * that is three questions about the rock rather than one about the wreck.
 *
 * See `landscape/wreck.ts` for the search and `props/wreck.ts` for the timber.
 *
 * **Build-time, and out of the tuning overlay for the reason `dyke` and
 * `shieling` are.** The rock is settled during the survey, the hull is baked
 * into the island's one merged draw and the ground round her is claimed against
 * the scatter before a pine is seeded. Nothing in here can move without the
 * scape being generated again, and a slider that needs a rebuild to be seen lies
 * about what a slider does.
 *
 * **All three are metres and they stay metres.** How far a rock stands out of
 * the water, how much of it there is and how far the ground under a keel may
 * fall away are all facts about rock and hulls, not about how wide the
 * archipelago is — so a world that grows does not grow any of them.
 */
export interface WreckConfig {
  wreck: {

    /**
     * The most a stranding rock may stand out of mean water, in metres.
     *
     * The switch, and the only one: at 0 the search asks for a rock that is
     * above the water and no higher than the water, nothing in the ring is, and
     * the archipelago has no wrecks in it — the refusal taken in the *survey* so
     * that `scape:map` and the scene agree about whether there is a hull out
     * there. There is no boolean beside it saying the same thing again.
     *
     * It is also the argument. A rock that stands four metres up is a rock
     * everybody on this coast has known about since they were a child; what puts
     * a hull on the ground is the one that shows a hand's width of weed at low
     * water and next to nothing at high. So the ceiling is set beside the light's
     * own floor rather than at some fraction of the skerries' heights: 1.3 m is a
     * hand over the 1.2 m of freeboard `beacon.freeboard` wants before a tower
     * may be built on a rock, which makes the rocks this admits exactly the ones
     * that are marginal for a seamark.
     *
     * **It decides whether, never which.** Raising it does not move her onto a
     * better rock, because the score below takes the lowest rock that passes and
     * a higher ceiling only admits rocks that then lose: at this seed she is on
     * the same ledge at 1.3 as at 4. The only thing this number can do is take
     * her out of the scape, which it does below about 0.46.
     */
    awash: number

    /**
     * The least rock that will hold her, as a radius in metres.
     *
     * Not her length. A wreck overhangs what she is on — that is most of what a
     * wreck looks like — so what this has to cover is the bearing length in
     * `landscape/wreck.ts` rather than the whole seven metres of hull. At 2.6 the
     * rock is five metres across and takes the middle five metres of her keel,
     * and both broken ends hang out over the fall.
     *
     * Like {@link awash} it decides whether rather than which, and it is the
     * blunter of the two: past about 3 there is nothing left in this ring that is
     * both wide enough and low enough, and the archipelago simply has no wreck in
     * it. The reason is the shape of the ring rather than this number — on these
     * coasts the broad rocks are the high ones, so a search that insists on width
     * is a search that has quietly started asking for the rock the lighthouse is
     * on.
     */
    minRock: number

    /**
     * The most the rock may fall away under her keel, in metres.
     *
     * She bears on a length rather than on a point, and this is how much of a
     * hollow that length is allowed to bridge. Small, and it has to be: the
     * skerries here are plateaux with a near-vertical edge onto eleven metres of
     * sound, so the question this gate actually answers is not *how rough is the
     * ledge* but *is the whole bearing on the plateau at all*. At 0.9 the sweep
     * on the default seed keeps five of its nine bearings on the rock it chose
     * and throws the four that run off the edge.
     */
    bed: number
  }
}

export const SCAPE_WRECK: WreckConfig = {

  // Swept against the ring the way the shieling's headroom was, and read as how
  // many rocks survive each gate. Fifteen islets; at `minRock` 2.6 eleven of
  // them are wide enough, and at `awash` 1.3 two of those eleven are low enough
  // — the rest of the ring crowns between 1.6 and 6.4 m out of the water and is
  // exactly the part of it a boat can see coming.
  //
  // Of the two she takes the lower, whose crown stands 0.45 m proud at mean
  // water. That number is worth reading beside `tide.range`: the spring tide
  // swings 0.4 m either way, so at high springs there are five centimetres of
  // rock left showing and the sea is up her garboard. The rock that caught her
  // very nearly covers, which is why it caught her.
  //
  // The sweep is one-sided, and that is the section's best property rather than
  // a gap in it: raising either gate never moves her, only removes her. She is on
  // the same ledge at `awash` 4 as at 1.3, because nothing in the ring is lower;
  // she is gone below 0.46, and gone above `minRock` 3.
  //
  // 0.9 m of `bed` is not what chooses her — the ledge she lies on is flat to
  // within 12 cm on every bearing in the sweep, so the gate never bites there.
  // What it is for is the rock it would refuse: a crown two metres across with
  // eleven metres of open sound round it passes a centre test and fails this
  // one, and a hull that passed the centre test alone would be balanced on a
  // pinnacle with her whole length in the air.
  wreck: {
    awash:   1.3,
    minRock: 2.6,
    bed:     0.9,
  },
}
