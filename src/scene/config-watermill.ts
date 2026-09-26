/**
 * The mill the beck turns.
 *
 * The eleventh section kept outside `config.ts`, and here for the reason the
 * guard, the treeline and the rest are: a subject, moved whole.
 *
 * This coast has had a mill since the windmill went up on its shoulder, and it
 * has had running water with a step in it since `force` gathered the beck's
 * fall into one drop. It has never had the building that is the whole point of
 * the second one. A post mill is the *exposed* answer to grinding a crop — the
 * one you build when the only power on the island is the weather — and a farm
 * with a burn falling two metres over six does not need the weather. It needs a
 * trough, a wheel and somewhere to stand them.
 *
 * So this is a siting section and nothing else, exactly as `shieling` is. Where
 * a watermill *is* is the only real decision about one: it has to be beside the
 * channel, because a lade is a trough and not an aqueduct; it has to be below a
 * reach that falls far enough to fill that trough, which on these islands means
 * below the fall; and it has to be on ground dry enough and level enough to
 * stand a sill on. Everything else about the building is geometry, and geometry
 * belongs in `props/watermill.ts`.
 *
 * **Three of the four are build-time and out of the tuning overlay**, for the
 * reason `dyke` and `shieling` are: the site is settled during the survey, the
 * mill is baked into the steading's one merged draw and the ground under it is
 * claimed against the scatter before a spruce is seeded. A slider that needs a
 * rebuild to be seen lies about what a slider does.
 * {@link WatermillConfig.watermill.spin} is the fourth, it is read every frame,
 * and it is on the panel.
 *
 * **Every length here is metres and stays metres.** How far a bank stands back
 * from a burn and how far a burn falls are facts about water, not about how wide
 * the archipelago is. Nothing in this section is scaled by
 * `archipelago.worldSize` or by the live `viewSize`, and a world that grows
 * again must leave all of it alone.
 */
export interface WatermillConfig {
  watermill: {

    /**
     * Metres the beck must fall between the intake and the mill's own sill.
     *
     * The gate, and the switch. The lade is a baked timber trough of a fixed run
     * and a fixed rise — see `LADE_RUN` and `LADE_RISE` in `props/watermill.ts`
     * — so this is not a taste about how dramatic a mill site should be. It is
     * the floor under which the trough's upstream end would hang in the air
     * above the channel it is supposed to be fed from, and the test beside the
     * search states that as a fact about the data rather than leaving it to
     * whoever next retunes either number.
     *
     * Surplus is allowed and is not a defect: a reach that falls further than
     * the trough needs is a lade cut deeper into its own bank, which is what a
     * lade on a steep burn actually is. The search *prefers* the reach that
     * matches the trough, so the surplus stays small wherever the island offers
     * a choice — see `findWatermillSite`.
     *
     * Raised past what any island's beck offers, the archipelago has no
     * watermills, and the refusal is taken in the survey so `scape:map` and the
     * scene agree about whether there is a building. There is no boolean beside
     * it saying the same thing again.
     */
    head: number

    /**
     * Metres of dry bank between the channel's outer edge and the mill.
     *
     * Measured with `Creek.clearanceAt`, which is the channel's *edge* and not
     * its centreline — a beck here is two metres across at the spring and six at
     * the mouth, and a single distance to the middle of it would put the mill in
     * the water at one end of the course and in the next field at the other.
     *
     * Gated above as well as below, and the ceiling is the half of this that
     * matters. A mill is a building on a bank; without a ceiling the search is
     * free to walk the sill out into the pasture and point a six-metre trough at
     * a burn it can no longer reach, which is what the first cut of it did on
     * every island with a hill behind the channel.
     */
    standoff: number

    /**
     * Longest trough the farm would dig, in metres.
     *
     * Not a shape knob. Every metre of lade is a metre of timber somebody cut,
     * carried up a bank and now has to keep watertight through a winter, so this
     * is the point past which a farm would rather grind its corn at the windmill
     * on the shoulder. The search takes the *nearest* mouth that clears the head
     * rather than the best one, so this is a ceiling it rarely reaches — on the
     * default seed the three troughs come out at six, seven and nine metres.
     *
     * It is also the second switch, and the gentler one: below the shortest
     * workable trough nothing is built anywhere.
     */
    reach: number

    /**
     * Least metres the mill's sill stands above mean water.
     *
     * The tidal reach of a beck on this coast is dredged several metres below
     * the sea for the boats, so the steepest water in any of these long profiles
     * is the last of it — and a search with no freeboard on it finds the estuary
     * every time and does so honestly. A mill is a thing on a hillside, the same
     * way a fall is.
     */
    freeboard: number

    /**
     * Radians a second the wheel turns at full flow.
     *
     * **Live**, and on the panel: the one number in this section that is read
     * every frame. It reaches zero, which is what lets a capture be taken twice
     * the same way — see `STILL` in `scripts/scape-poses.ts`.
     *
     * Scaled by what is left of the beck after the winter rather than by a rate
     * of its own, so the wheel stops in the weeks the channel is locked and
     * starts again when it thaws. That is `beckFreeze`, the same function the
     * water in the channel reads, so there is one winter in the scape rather
     * than two to keep in step.
     */
    spin: number
  }
}

export const SCAPE_WATERMILL: WatermillConfig = {

  // Swept against the archipelago the way the shieling's headroom was, and read
  // as how many stations of the sweep survive each gate.
  //
  // 1.6 m of head is the trough's own rise with a hand's width of fall on it,
  // and it is the number that decides *which* islands carry a mill rather than
  // where the mill goes on one. Four of the six clear it — the home island at
  // 1.76 m of head over a 9.2 m lade, the sound at 1.86 over 11.6, the fell at
  // 3.02 over 16 and the shield at 3.46 over 10.1 — and both refusals are worth
  // reading rather than tuning away, because they are not the same refusal.
  //
  // The meadow's beck has no step in it: nowhere on its course falls a wheel's
  // head inside a lade's reach, which is what a burn over peat looks like. The
  // ridge never gets that far — twenty-seven metres of land radius leaves a
  // handful of stations in the whole sweep that are both off the channel and a
  // metre above the sea, and none of them is level enough to lay a sill on.
  //
  // Raised to 2.0 the home island loses its own, which is the one the default
  // pose is looking at.
  //
  // 1.2 m of standoff is the mill's half-depth with a step outside the wall, so
  // somebody can walk between the gable and the water. The ceiling of 3 m in the
  // search is a bank rather than a field — see `standoff`.
  //
  // 16 m of reach is about twice the longest trough the search actually digs on
  // this seed, and it is deliberately slack: it is there to stop a mill on a
  // slack-graded beck reaching half the island for its water, not to decide
  // which islands get one. `head` does that.
  //
  // 1.2 m of freeboard is the smokehouse's, and for the smokehouse's reason: it
  // is the band in which a spring tide and a metre of surge are the same thing.
  //
  // 1.05 rad/s is a little under ten turns a minute, which is what a breastshot
  // wheel of this diameter runs at. Faster than that and the buckets strobe
  // against the frame rate; slower and the scape reads as stopped.
  watermill: {
    head:      1.6,
    standoff:  1.2,
    reach:     16,
    freeboard: 1.2,
    spin:      1.05,
  },
}
