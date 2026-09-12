/**
 * The hut the summer grazing needed.
 *
 * The seventh section kept outside `config.ts`, and here for the reason the
 * guard, the treeline, the dunes, the kelp, the crag and the dyke are: a
 * subject, moved whole.
 *
 * Every building in this scape so far stands where the *work* is — the farm on
 * its levelled shelf, the smokehouse at the boats, the mill on its shoulder, the
 * croft on the rock somebody rows to. A shieling is the one building that stands
 * where the work is *not*. Hill ground this poor grows a bite of grass for about
 * ten weeks a year and nothing else ever, so the stock go up to it in June and
 * somebody goes with them; and because the walk is too long to do twice a day,
 * that somebody sleeps up there. What they sleep in is a single room of dry
 * stone under a turf roof with a stock fold walled onto the back of it, and it is
 * shut up empty for the other forty-two weeks.
 *
 * Which is why the whole section is three numbers and none of them is a size.
 * Where a shieling *is* is the only real decision about one — it has to be above
 * the head dyke, because a hut inside the wall is a shed; it has to be a walk
 * from the farm, because a hut you can see from the door is a shed; and it has
 * to be at water, because ten weeks of a dairy is ten weeks of washing. See
 * `landscape/shieling.ts` for the search and `props/shieling.ts` for the stones.
 *
 * **Build-time, and out of the tuning overlay for the reason `dyke` is.** The
 * site is settled during the survey, the hut is baked into the steading's one
 * merged draw and the ground under it is claimed against the scatter before a
 * spruce is seeded. Nothing in here can move without the scape being generated
 * again, and a slider that needs a rebuild to be seen lies about what a slider
 * does.
 *
 * **Two of the three are metres and stay metres**, because how far somebody will
 * walk to the hill and how far they will carry a pail are facts about people
 * rather than about how wide the archipelago is. {@link ShielingConfig.headroom}
 * is the one that is not a length, and it is a share of the island's own rise —
 * which is what scales it. The furthest the search will look is neither: it is
 * the island's own land radius, read from the layout rather than written here,
 * so an island that grows is searched to its own new edge.
 */
export interface ShielingConfig {
  shieling: {

    /**
     * Where between the farmyard's ground and the island's summit the hut
     * stands, 0..1.
     *
     * The same shape as `dyke.headroom` and read against the same summit —
     * `summitOf` in `landscape/dyke.ts` is the one authority for where the top
     * of an island is, so the wall and the hut cannot disagree about which
     * ground is hill.
     *
     * It is deliberately *above* the dyke's 0.38, and that ordering is the
     * section's whole argument rather than a coincidence of two numbers: the
     * head dyke is the line between the farm and the hill, and a shieling is the
     * building on the far side of it. The test beside the search states it as a
     * fact about the data rather than leaving it to whoever next retunes either.
     *
     * It is also the switch, and there is no boolean beside it saying the same
     * thing again. At 1 the gate asks for ground above the summit, nothing on
     * the island is, and the archipelago has no shielings — the refusal taken in
     * the *survey* so that `scape:map` and the scene agree about whether there
     * is a hut. At 0.55 four of the six islands carry one.
     */
    headroom: number

    /**
     * Nearest the farmyard the hut may stand, in metres.
     *
     * A shieling is defined by the walk. The graded farmyard on the home island
     * is nineteen metres across on its own, so this is that with a margin: far
     * enough that the hut reads as somewhere you go rather than as an
     * outbuilding somebody put at an angle, and near enough that the sweep still
     * reaches the high ground on an island whose summit is thirty metres from
     * the farm. At 40 it did not, and the home island — the one with a hill
     * right behind the steading — was the one that got no hut.
     */
    setback: number

    /**
     * Furthest from running water the hut may stand, in metres.
     *
     * Ten weeks of milking is ten weeks of scalding pails, and nobody carries
     * that up a hill from the farm. So the search wants the beck, and the hut
     * ends up where the burn and the grazing are the same few hundred square
     * metres — which is where every shieling that was ever built ended up.
     *
     * Measured to the channel's *centreline* and gated above by the channel
     * itself, which the survey bars outright: near the water, and not in it.
     * On an island whose ridge fed no beck the gate is dropped rather than
     * refused, and the hut is sited on the grazing alone.
     */
    water: number
  }
}

export const SCAPE_SHIELING: ShielingConfig = {

  // Swept against the archipelago the way the dyke's headroom was, and read as
  // how many stations of the sweep survive each gate. At 0.55 the four islands
  // that carry a hut offer between three and thirty-five sites apiece — enough
  // for the score to be choosing rather than taking what it is given, and every
  // one of them above that island's own head dyke, which 0.38 draws. Below 0.45
  // the band reaches down onto the farm's own shoulder on the two low islands,
  // and above 0.68 the ridge island has nothing left but the cairn on its summit.
  //
  // 25 m of setback is the graded farmyard with a margin — see `setback`.
  //
  // 55 m to the burn is the number that decides whether rather than where, and
  // the sweep shows it plainly: on the sound it takes sixty-four stations of
  // grazing down to seven, and at 40 it takes them to one and the island loses
  // its hut. The becks here run about forty metres from spring to mouth and the
  // grazing band is a ring perhaps thirty metres wide, so under about fifty the
  // two sets come apart on every island whose channel runs off the far side of
  // the hill.
  //
  // Two islands get none, and both refusals are worth reading rather than
  // tuning away. The shield is the one the head dyke also refuses: its high
  // ground is under the ice cap, and a summer grazing under a glacier is not a
  // grazing. The ridge is refused by its own size — twenty-seven metres of land
  // radius puts the whole of its hill inside the twenty-five metre walk, so the
  // only ground the sweep is allowed to look at is the ground falling away from
  // it. An island too small to have anywhere far from the farm is an island with
  // no shieling on it, which is the right answer and not a gap.
  shieling: {
    headroom: 0.55,
    setback:  25,
    water:    55,
  },
}
