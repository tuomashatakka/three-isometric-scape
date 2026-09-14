/**
 * The bank the swell trips on.
 *
 * The ninth section kept outside `config.ts`, and here for the reason the
 * guard, the treeline, the dunes, the kelp, the crag, the dyke, the shieling
 * and the wreck are: a subject, moved whole.
 *
 * The dune belt is where the sand this coast moves stops *on land*. This is
 * where the rest of it stops — a submerged spit trailing off the downdrift
 * flank of every island, drowned the whole of its length, never showing so much
 * as a metre of itself at the bottom of a spring tide.
 *
 * Which is the entire point. Nothing here is drawn. A bank is a term in the
 * seabed and the seabed is one flat quad; what the eye gets is what the water
 * already does with a depth — see `landscape/shoal.ts` for the three systems
 * that pick it up for free and the one line of shader it took to add them, which
 * is none.
 *
 * **Build-time, and out of the tuning overlay for the reason `dyke` and
 * `shieling` are.** The banks are settled during the survey, the bathymetry mask
 * is baked off the field they are in and the ferry lanes are planned over it.
 * Nothing in here can move without the scape being generated again, and a slider
 * that needs a rebuild to be seen lies about what a slider does.
 *
 * ### the scale classes
 *
 * **Every number here is metres, or a ratio, and stays that way.** How much
 * water stands over a bank, how far one runs and how wide it is are facts about
 * sand and swell, not about how wide the archipelago is — a world that grows
 * again grows the sea between the banks and not one of the banks. Nothing here
 * is world-sized and nothing here is frame-sized: a bank is ground, and ground
 * is never sized against the camera.
 */
export interface ShoalConfig {
  shoals: {

    /**
     * Metres the bank runs from the waterline out into the sound.
     *
     * The switch, and the only one: at 0 no island sheds anything and the
     * archipelago has the flat seabed it had before this section existed. There
     * is no boolean beside it saying the same thing again.
     *
     * 150 m against a home island whose waterline stands about 44 m off its
     * middle is a spit half again as long as the island is wide, which is the
     * proportion a real recurved spit runs at — the sand keeps going as long as
     * the drift that carries it does, and what stops it is the water getting
     * too deep to hold it rather than the island running out.
     *
     * Shortened per island by {@link margin} wherever the sound is too narrow
     * to take the whole of it, and refused outright below {@link minReach}.
     */
    reach: number

    /**
     * Metres of water standing over the crest at the root, at mean water.
     *
     * The one number that decides what a bank *is*, and three separate things
     * downstream read it:
     *
     * - **the depth tint** saturates at `MAX_DEPTH`, 3.2 m, so a crest under
     *   about three metres is the only kind that can be seen at all. At 1.1 the
     *   bank sits at a third of that range and reads as a pale ribbon against a
     *   sound that is saturated blue.
     * - **the surf** breaks out to `water.surfDepth`, 2.4 m. At 1.1 the crest is
     *   well inside the band, so the swell trips on it and stands up in sets —
     *   broken water in open sea, with nothing showing that made it.
     * - **the tide** swings 0.4 m either way at springs, which walks the whole
     *   of both effects up and down twice a day: 0.7 m of water over the crest
     *   at low springs and 1.5 m at high.
     *
     * Bounded from *below* rather than above, and by the tide: a crest that
     * dries is an islet, and an islet is a thing the terrain would have to
     * draw. A bank whose crest cannot keep {@link dry} metres of water over it
     * at the bottom of a spring tide is refused in the survey rather than
     * clamped, so that `scape:map` and the scene agree about what is out there.
     */
    crest: number

    /**
     * Half the bank's width at the root, in metres.
     *
     * A spit is narrow where it leaves the land and fans out where the drift
     * that carries it finally lets go, so this is the narrow end. 14 m at the
     * root against {@link spread} gives a bank about 28 m across where it
     * leaves the shore and 50 m across at the tip, which at the pulled-out
     * poses is a mark a few pixels wide and a hundred and fifty long — a
     * ribbon, which is what it should read as, rather than a stain.
     */
    halfWidth: number

    /** How much wider the bank is at its tip than at its root, as a fraction. */
    spread: number

    /**
     * Degrees the bank's axis is carried downwind of the flank it leaves.
     *
     * A spit does not run straight out of a coast; it is built by drift running
     * *along* that coast, so it leaves on the flank and then curves away in the
     * direction the drift is going. 34° is enough of a hook for the bank to
     * read as having come off the island rather than as a bar dropped beside
     * it, and little enough that the tip is still in open water rather than
     * back against the lee shore.
     */
    lean: number

    /**
     * Metres the tip must keep clear of another island's terrain patch.
     *
     * The sounds here are narrow — two of the six patches are twenty-odd metres
     * apart — so a bank at its full {@link reach} would run into the next
     * island on several bearings. It is shortened to whatever the sound will
     * take rather than swung to a bearing that fits, because the bearing is the
     * one thing about a spit that is not a choice: the drift puts it where the
     * weather does.
     */
    margin: number

    /**
     * Metres below which an island sheds no bank at all.
     *
     * A graceful absence rather than a stub. Under about forty metres what is
     * left after {@link margin} has taken its cut is shorter than the bank is
     * wide, which reads as a blister on the coast rather than as a spit, and
     * the honest thing for the scape to have there is open water.
     */
    minReach: number

    /**
     * Metres of water a crest must keep at the bottom of a spring tide.
     *
     * See {@link crest}. A quarter of a metre is the depth below which the
     * water plane's own alpha ramp starts fading out against the ground, so
     * this is not a comfort margin: it is the point at which a bank would stop
     * being water and start being a hole in the sea with a flat seabed quad
     * nine metres down at the bottom of it.
     */
    dry: number
  }
}

export const SCAPE_SHOAL: ShoalConfig = {

  // Swept against the six islands and read as how many of them still shed a
  // bank. At `reach` 150 and `margin` 40 all six do, and three of them are
  // shortened by the sound they are in rather than by the reach — the home
  // island keeps the whole 150, the two in the north are cut to what the
  // channel between them will take.
  //
  // `crest` 1.1 is the middle of the only range that can be seen: below about
  // 0.65 the bank dries at low springs and is refused, and above about 2.9 it
  // is under the depth tint's saturation and under the surf's band at once, so
  // it is in the field, in the report, in the mask — and invisible. That is a
  // narrow window and it is narrow for a good reason: the mask resolves 3.2 m
  // of water in a byte, and a bank is only a bank at all because it is the
  // shallow part of a sound.
  shoals: {
    reach:     240,
    crest:     0.9,
    halfWidth: 24,
    spread:    0.7,
    lean:      34,
    margin:    40,
    minReach:  40,
    dry:       0.25,
  },
}
