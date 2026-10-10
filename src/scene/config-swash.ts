/**
 * The band of shore the sea wets and lets go.
 *
 * The twelfth section kept outside `config.ts`, and here for the reason the
 * guard, the treeline, the dunes, the kelp, the crag, the dyke, the shieling,
 * the wreck, the shoal, the haar and the shafts are: a subject, moved whole.
 *
 * The scape has had a waterline that moves for as long as it has had a tide,
 * and a surf band that breaks on the **water** side of it since the shore
 * learned which way the weather was on. Above that line the ground was bone dry
 * to the last millimetre, at every state of the sea — so the one place in the
 * archipelago where the water actually touches the land was the one place
 * nothing happened. A coast does not have an edge. It has a band, and the band
 * is wet, dark, briefly white at the top of it, and wider on a beach than on a
 * cliff by exactly the ratio of their slopes.
 *
 * ### it is the swell's own number, not a width somebody chose
 *
 * The run-up is **Hunt's relation** on the ground the fragment is standing on:
 * `R = H · ξ`, where `ξ = tanβ / sqrt(H / L)` is the Iribarren number — the
 * beach's gradient measured against the steepness of the wave arriving on it.
 * Both halves of it are already in the scape: `H` is `water.waveHeight`, `L` is
 * `water.swellLength`, and `tanβ` is the ground's own normal, which the ground
 * program has carried in `vScapeFace.x` since the grain learned to weigh itself
 * by how horizontal a face is.
 *
 * That is what makes the band self-sizing rather than authored. The *vertical*
 * run grows with the slope and the *horizontal* walk shrinks with it — and on
 * flat ground the two cancel exactly, because `R / tanβ` reduces to
 * `sqrt(H · L)` with the gradient gone from it. So a dissipative sand flat gets
 * a long thin wash about six metres wide at the authored sea, a shingle bank
 * gets a short steep one, and the crag gets a splash zone a handspan deep. Not
 * one of those three is a number in this section.
 *
 * {@link SwashConfig.swash.steep} is what stops it: above a ξ of about three a
 * wave stops spilling and starts surging, and Hunt's line — which is a fit to
 * spilling breakers — would otherwise carry a sheer granite face metres of
 * run-up it has no beach to spend.
 *
 * ### the scale classes
 *
 * Every knob here is **dimensionless**, and that is the whole of the audit.
 * The two lengths the band is built from are `water.waveHeight` and
 * `water.swellLength`, both of them already metres and already the sea's own,
 * and both of them already carrying the note that says a wider archipelago must
 * not scale them. There is no length in this section for a wider world or a
 * wider frame to invalidate.
 */
export interface SwashConfig {
  swash: {

    /**
     * How far up the shore the sea runs, in Hunt run-ups.
     *
     * The switch for the whole band, and the only one: 0 is the dry shore this
     * scape had, where the ground was as dry a millimetre over the waterline as
     * it was on the fell. 1 is the relation as it is actually fitted, which is
     * where this sits — the knob exists to be turned *down* for a sheltered
     * sound, or up for a coast taking more sea than the swell alone says.
     *
     * Dimensionless: it multiplies a run-up that is already in metres because
     * the wave that made it is.
     */
    reach: number

    /**
     * The Iribarren number at which the shore stops dissipating.
     *
     * Dimensionless, because a surf-similarity parameter is. Below it a wave
     * spills up a beach and Hunt's line holds; above it the wave surges and
     * collapses against the slope instead, and the run-up stops growing with
     * the gradient. It is therefore the ceiling that keeps the band a splash
     * zone on the crag rather than a tide mark two storeys up: the vertical run
     * saturates at `waveHeight * steep`, so the horizontal walk goes on
     * shrinking as the ground stands up.
     *
     * 2.5 is about where the fit stops holding — plunging gives way to
     * collapsing and the run-up stops answering the slope — and on this
     * archipelago it is doing most of the work rather than guarding an edge
     * case. The `swash` line of `scape:map --stats` is why: the median gradient
     * within four metres of the waterline here is **1:2.8**, which puts ξ at
     * about four, so the typical shore is *over* the ceiling and the sloping
     * half of the relation is shaping the sand flats and the saltings alone. A
     * coast made mostly of rock is a coast where the clamp is the answer.
     *
     * At 0 there is no run-up anywhere, which is the honest reading of "the
     * shore dissipates everything" rather than a special case.
     */
    steep: number

    /**
     * How much darker wetted ground goes, 0..1.
     *
     * The same two-sided read `weather.wet` already uses for a shower, and for
     * the same reason: a water film traps light the dry grains would have
     * scattered back out, and that film is smoother than anything under it, so
     * the albedo falls and the specular rises together. Doing only one of them
     * gives a shore somebody turned the lights down on, or a shore made of
     * plastic.
     */
    wet: number

    /**
     * How much of the wet the ground keeps above the live edge, 0..1.
     *
     * The memory, and the reason the band reads as a band rather than as a
     * line that slides. Sand the last wave reached stays dark for a good many
     * waves after it, so the damp runs all the way up to the full run-up while
     * the dark, foam-edged part of it oscillates inside that.
     *
     * 0 is a shore that dries the instant the water leaves it, which is a
     * shore made of glass. 1 is a band with no movement in it at all — the
     * whole run-up wet to the same depth at every instant, which is the one
     * reading that would make {@link reach} invisible.
     */
    soak: number

    /**
     * How white the lace at the top of the run is, 0..1.
     *
     * Drawn in `palette.foam`, the same white the surf, the caps and the wakes
     * are in, because a bore running up a beach and a breaker tripping over a
     * bank are the same substance and a second white would be a second answer
     * to a settled question.
     *
     * 0 leaves the band wet and unmarked, which is a shore seen through enough
     * haze to lose the edge and still the right shape underneath.
     */
    foam: number

    /**
     * What a sheltered shore keeps of the weather shore's run, 0..1.
     *
     * The same shape as `water.surfExposure` and read off the same compass the
     * drift is — `vScapeFace.z`, the face resolved against the base wind
     * bearing — so a coast cannot be taking the sea on one side and running it
     * up the other. 1 runs the same height up all the way round an island,
     * which is an island in water with no direction in it; 0 leaves the lee
     * perfectly dry.
     */
    lee: number
  }
}


export const SCAPE_SWASH: SwashConfig = {
  swash: {

    // The relation at its own strength. There is no coefficient in front of
    // Hunt's line here because putting one there would be authoring the thing
    // the line exists to avoid authoring.
    reach: 1,

    // Where the fit is cut, which on this coast is where most of it lands: at
    // the authored sea — 0.55 m over 70 m — the ground only has to stand at
    // about a 1:4.5 gradient to reach it, and the measured median is 1:2.8. So
    // the ceiling sets the band on the rock and Hunt's line sets it on the
    // sand, which is the division the relation is worth having for.
    steep: 2.5,

    // Read off `--poses swash` rather than derived: the film is a multiply on
    // an albedo the fragment is already holding, and what it has to clear is
    // the shore's own vertex colour, which on sand is light and on the granite
    // of a wave-cut platform is not. Half is the shower's 0.48 rounded to a
    // number that is plainly the same kind of thing.
    wet: 0.5,

    // Most of the run stays damp. A swash period is six or seven seconds and
    // wet sand does not dry in six seconds, so the band's *outline* is the full
    // run-up and only the depth of the wet inside it moves.
    soak: 0.72,

    // Enough to draw the edge and not enough to paint the beach. The lace is
    // the narrowest term in the scape — a fifth of the band at its widest — so
    // it reads as a line rather than as cover, which is what separates a bore
    // from a snow line.
    foam: 0.55,

    // Set harder than the surf's 0.72 exposure keeps for its lee, and for the
    // reason the whitecaps' lee is: what reaches a sheltered beach has refracted
    // round the headland rather than been stopped by it, so the lee of an island
    // still has water walking up it. A third of the weather shore's run is a
    // sound that works on both sides without the two reading alike.
    lee: 0.35,
  },
}
