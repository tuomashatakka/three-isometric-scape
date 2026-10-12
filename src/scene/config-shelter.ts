/**
 * How much of the weather the land upwind has already taken.
 *
 * The thirteenth section kept outside `config.ts`, and here for the reason the
 * guard, the treeline, the dunes, the kelp, the crag, the dyke, the shieling,
 * the wreck, the shoal, the haar, the shafts and the swash are: a subject,
 * moved whole.
 *
 * Six islands, fifty-nine skerries, a breakwater twenty-four metres out and a
 * causeway across a sound — and until now the sea went through every one of
 * them. The surf knew which way a *coast* faced, because the bathymetry mask
 * bakes a seaward bearing and a fragment can dot against it; the whitecaps
 * borrowed the same reading, and a baked gradient only exists within a texel or
 * two of a bank. Neither is shelter. Shelter is a fact about what is half a
 * kilometre upwind, and nothing in this scape could see that far.
 *
 * So the sea broke the same way on both sides of every island in the
 * archipelago, raised the same swell inside the harbour as outside it, and put
 * whitecaps in the lee of the mole that was built to stop exactly that. Which
 * is the one thing a sheltered coast never looks like, and the whole reason a
 * harbour is a harbour.
 *
 * ### what is measured
 *
 * One search over the depth grid `shore-mask.ts` already builds: sixteen
 * bearings out of every texel, and how far each one gets before it strikes
 * land. That is a *function of bearing*, and what is stored is its mean and its
 * first harmonic — three numbers, which the shader turns back into the shelter
 * for the bearing the wind is actually on with one dot product and no
 * trigonometry. See `landscape/shelter.ts`.
 *
 * ### why the two seas answer to different distances
 *
 * The fourth number is the same search at {@link ShelterConfig.shelter.swellReach},
 * kept as a mean with no bearing in it, and the two reaches are the opposite
 * way round from the first guess.
 *
 * A **wind sea** has to be *built*. Water that has just come out from under a
 * hill is flat, and the wind has to work on it over distance to get it up
 * again — most of a kilometre before it is properly breaking — so the shadow a
 * headland throws on the white is long, and it lies squarely downwind, because
 * only the land the wind actually crossed is of any account.
 *
 * A **swell** is already made, somewhere else, days ago, and arrives as a long
 * wave that bends round what it meets. Nothing has to rebuild it: its own
 * shadow fills in from the sides, over a few hundred metres on a seventy-metre
 * wave and an island this size, and it fills in from every bearing at once.
 * So the swell's reach is the *shorter* of the two and its channel carries no
 * direction — a mean, not a bearing.
 *
 * ### the scale classes
 *
 * Both knobs here are **metres, and real-world ones** — the third class in the
 * audit, with the wisp, the ripple and the swell's own length, and not the
 * class that follows `archipelago.worldSize`. Fetch is a physical distance: the
 * sea needs about a kilometre of open water to get properly up and a few
 * hundred metres to fill a shadow back in, on this coast and on any other, and
 * it would need the same if the archipelago were ten times the span. A world
 * that grows resolves these at a coarser step; it does not lengthen them.
 */
export interface ShelterConfig {
  shelter: {

    /**
     * How far upwind land still counts for the sea that is breaking, in metres.
     *
     * The fetch a wind sea needs to get fully up. Inside it the water is
     * sheltered in proportion; past it the wind has had its run and whatever
     * stands behind is of no account. 0 is the sea this scape had, which went
     * through every island in it.
     *
     * 900 m is a little over half the home island's own patch and twice the
     * widest sound in the archipelago, which is the scale that makes the
     * difference legible rather than universal: at this reach the `shelter`
     * line of `scape:map --stats` puts **8.2 %** of the water at or over half
     * sheltered at the authored wind, with the middle of the open sound at 0.18
     * and the water behind the mole at 0.86. Set it much shorter and only the
     * harbours answer; much longer and the whole archipelago reads as one
     * sheltered pool, because at this span almost every piece of water has
     * *something* within two kilometres upwind of it.
     */
    reach: number

    /**
     * How far land counts for the swell, in metres.
     *
     * Shorter than {@link reach} by about three, for the reason in the section
     * note: a swell is not rebuilt downwind of an island, it bends back in
     * behind it, and what it takes to fill its own shadow is a few hundred
     * metres rather than most of a kilometre. Sampled as a mean over the same
     * sixteen bearings and stored without a direction.
     *
     * 320 m is about twice the width of the home island and about the Fresnel
     * scale of a seventy-metre swell behind a body that size. It puts the water
     * inside the harbour at 0.43 of a full shadow and the middle of the open
     * sound at 0.05 — a lee that is a *place* rather than a tint over the whole
     * sea, which is what a longer reach gave: at 1_150 m every corner of the
     * world came back a tenth sheltered and the swell quietly lost a tenth of
     * its height everywhere.
     */
    swellReach: number
  }
}


export const SCAPE_SHELTER: ShelterConfig = {
  shelter: {

    // Both measured against the archipelago rather than chosen — see each
    // knob's note for the three numbers off the `shelter` line that settled it.
    reach:      900,
    swellReach: 320,
  },
}
