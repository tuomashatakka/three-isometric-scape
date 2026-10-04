/**
 * The mound somebody raised to be looked at.
 *
 * The eighth section kept outside `config.ts`, and here for the reason the
 * guard, the treeline, the dunes, the kelp, the crag, the dyke and the shieling
 * are: a subject, moved whole.
 *
 * Everything standing on these islands so far was built for a job. The farm
 * works its shelf, the mill takes the wind, the weir takes the tide, the croft
 * takes the rock nobody else wanted, and the shieling takes the ten weeks of
 * grass that are the only thing the hill grows. A howe is the one thing here
 * with no job at all. It is a barrow — turf and field stone piled over a burial
 * three thousand years before the farmhouse was cut — and the only thing it was
 * ever meant to do is **be seen**, from the ground the living were working.
 *
 * Which is why the search for one is unlike every other search in the scape.
 * The others ask where the work is: at the water, out of the wind, above the
 * dyke, on the flattest acre. This one asks a question about *sightlines* —
 * where on this island does a mound stand against the sky from the farmyard
 * door — and answers it by walking the ground between the two and checking that
 * none of it gets in the way. See `landscape/howe.ts` for the sweep and
 * `props/howe.ts` for the mound, its kerb and the hole the diggers left in it.
 *
 * **Build-time, and out of the tuning overlay for the reason `shieling` is.**
 * The site is settled during the survey, the mound is baked into the steading's
 * one merged draw and the ground under it is claimed against the scatter before
 * a spruce is seeded. A slider that needs a rebuild to be seen lies about what a
 * slider does.
 *
 * **Three metres and one share.** {@link HoweConfig.prospect} and
 * {@link HoweConfig.setback} are distances a person judges by eye and by foot,
 * so they stay metres on an archipelago of any size; {@link HoweConfig.eye} is
 * a person's own height and is the most fixed number in the file.
 * {@link HoweConfig.stature} is the one that is not a length, and it is the
 * switch as well — see its own note.
 */
export interface HoweConfig {
  howe: {

    /**
     * How far around the mound the ground has to fall away, in metres.
     *
     * The radius of the ring the site is measured against: a howe stands where
     * nothing within a prospect of it is higher. Fourteen metres is three times
     * the mound's own foot — far enough that a knuckle of rock two paces wide
     * does not read as a top, and near enough that an island six metres tall
     * still has three or four of them.
     *
     * Raising it walks the mound up toward each island's single summit, which
     * is usually the one patch of ground the chapel, the dyke or the hut has
     * already claimed; the sweep then comes back with nothing on the islands
     * that are mostly farm. At 18 the home island loses its barrow.
     */
    prospect: number

    /**
     * Least the crest's ground must stand over its own prospect ring, in
     * metres.
     *
     * The local prominence gate, measured against the *highest* ground a
     * {@link prospect} away rather than the mean, so a site that passes is a
     * site with nothing looking down on it from a stone's throw.
     *
     * Deliberately a low bar rather than a tight one. It is a *floor* and not
     * the chooser: what actually picks between the tops an island has is the
     * skyline term in the score, and this is only here to keep the sweep off
     * open field, where the ring test would otherwise read a centimetre of fbm
     * as a hill. A quarter of a metre under a mound that stands two and a half
     * is a site the sweep found rather than one it settled for.
     *
     * It is also the switch, and there is no boolean beside it saying the same
     * thing again. At 0 every flat field passes and the skyline is left to
     * decide alone; at 3 nothing in the archipelago stands that far clear of
     * its own neighbourhood and the scape has no howes — the refusal taken in
     * the *survey*, so `scape:map` and the scene agree about whether there is a
     * mound.
     */
    stature: number

    /**
     * Nearest the farmyard a howe may stand, in metres.
     *
     * Larger than the shieling's twenty-five, and for a reason that is about
     * the eye rather than the legs: a mound on the skyline is a mound with sky
     * behind it, and anything close enough to be seen against the hill it is
     * standing on is a heap in a field. Thirty metres is the graded yard with
     * half an island of margin — far enough that the sightline has a chance to
     * leave the ground it starts on.
     */
    setback: number

    /**
     * The height the sightline leaves the farmyard at, in metres.
     *
     * Somebody standing at the door. This is the one number here that is a fact
     * about people rather than about the island, and it is load-bearing: the
     * skyline test is a straight line from this height at the yard to the top
     * of the mound, and ground that rises above that line is ground the howe is
     * hidden behind. Drop it to zero and a reader lying on the yard sees fewer
     * tops, which is true and not useful.
     */
    eye: number
  }
}

export const SCAPE_HOWE: HoweConfig = {

  // Swept against the archipelago, and read as how many stations of the sweep
  // survive each gate in turn.
  //
  // The binding gate is not the one the section is about. Four of the six
  // islands have tens of visible tops and the score is spoilt for choice on
  // them; the home island has exactly four stations that are prominent, dry,
  // outside the setback and not already standing under something the farm
  // built, and only one of those is flat enough to kerb. That is what these
  // numbers are tuned against — an archipelago whose crowded island still gets
  // a barrow — and it is why `prospect` is 14 rather than the 18 the first
  // sweep used and `stature` is a quarter of a metre rather than the 0.6 that
  // went with it. At either of those the home island comes back with nothing,
  // and the one island a reader actually spends time on is the one with no
  // mound on it.
  //
  // One island gets none, and the refusal is worth reading rather than tuning
  // away. The ridge is the smallest land in the scape — twenty-seven metres of
  // land radius — and the whole of its dry ground outside the setback is
  // either the farm's already or within a metre and a half of the waterline.
  // An island with no room for a barrow is an island with no barrow on it,
  // which is the right answer and not a gap.
  howe: {
    prospect: 14,
    stature:  0.25,
    setback:  30,
    eye:      1.6,
  },
}
