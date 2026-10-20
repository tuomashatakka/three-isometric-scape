/**
 * The lights of the places on the far coast.
 *
 * The eleventh section kept outside `config.ts`, and a companion to
 * `config-farshore.ts` rather than part of it. The coast itself is land, solved
 * once and merged into one static mesh; this is what is *on* it after dark, and
 * the two answer to different clocks — the mountain is the same mountain at
 * midnight and the lights are the whole difference between a dark ridge and a
 * place where people live.
 *
 * The run that built the far shore said this in its own follow-up: nothing out
 * there is lit, and a scattering of shore lights across a sound would be the
 * cheapest thing in the scape and the one that would most make it a place.
 *
 * ### where they are allowed to be
 *
 * A settlement on a coast like this one is not on the mountain. It is at the
 * water, in the low ground between two headlands, near enough to the way out to
 * sea to be worth living in. So the search is over the ring the far shore was
 * already solved on, scored on how far *below* the range's own summit each
 * bearing stands and on how near it is to a sound — and the sites are taken
 * greedily with {@link ShoreLightsConfig.shoreLights.spread} degrees between
 * them, because two hamlets a degree apart are one hamlet drawn twice.
 *
 * ### the scale classes
 *
 * - **metres.** {@link ShoreLightsConfig.shoreLights.climb} is how far up the
 *   hillside behind the quay the highest light in a place stands, and a village
 *   climbs the same fourteen metres in a bigger world. It is clamped against the
 *   crest of its own bearing, so a light never floats over the hill it is on.
 * - **degrees of the horizon.** `spread` is an arc, which is the unit the coast
 *   itself is solved in — a world that grows takes the ring out with it and the
 *   places stay the same distance apart *on the skyline*, which is where they
 *   are read.
 * - **device pixels.** {@link ShoreLightsConfig.shoreLights.size} is the one
 *   screen-sized number here and it has to be: these are point sources a
 *   kilometre off, and what a point source has is an apparent size. A diameter
 *   in metres would be a lamp that grew into a bonfire as the reader zoomed in
 *   on an island eight hundred metres in front of it.
 * - **dimensionless.** `glow`, `harbour`, `count` and `cluster` are strengths
 *   and counts.
 *
 * ### live and build-time, in one section
 *
 * `glow` and `size` are read every frame and are in the overlay beside the
 * farmstead's lamps, which is the same subject seen at the other end of the
 * water. Everything else is the siting search and is resolved once during the
 * survey, so it stays out of the panel for the reason `farShore` and `creek` do
 * — a slider that needs a rebuild to be seen lies about what a slider does.
 */
export interface ShoreLightsConfig {
  shoreLights: {

    /**
     * How hard a lit window on the far coast burns, 0..2.
     *
     * The switch, and the only one: 0 is a coast with nobody on it, and the
     * points are not drawn at all rather than drawn at zero. There is no boolean
     * beside this saying the same thing again.
     *
     * It is multiplied by the same dusk curve and the same household clock the
     * farmstead's own lamps use — see `shoreLightLevel` in `scene/shore-lights.ts`.
     * Two coasts in one frame that disagreed about when dusk was would be the
     * more obvious bug of the two.
     */
    glow: number

    /**
     * How wide a light is drawn, in device pixels at a pixel ratio of 1.
     *
     * Multiplied by the renderer's pixel ratio at build and at every resize, for
     * the reason the star field is: a point is sized in device pixels, so a
     * retina buffer needs twice as many of them for the same light or the whole
     * coast halves on the one display that can resolve it.
     *
     * Read off a capture rather than chosen. The first pass ran at 3.4 px, on
     * the reasoning that a window a kilometre off is a point — and at the only
     * zoom that can see this coast it came out at a tenth of a per cent of the
     * frame and `scape:diff` correctly called it `same`. Six is the smallest
     * that reads as a lit place on the mobile tier, which is the tier every
     * capture is taken on and the one with no bloom to help it. Past about ten
     * they stop reading as windows a kilometre off and start reading as
     * bonfires.
     */
    size: number

    /**
     * How many places the far coast carries.
     *
     * Settlements, not lights — each one is a cluster of up to
     * {@link cluster} of them. 0 is an empty coast, and the honest way to
     * get one; it is not a second switch, because it takes the *search* out
     * rather than the drawing, and `scape:map` reports the difference.
     *
     * Fourteen against three headlands is four or five places on each, which
     * is about what a coast of this length carries. Past about eighteen the
     * {@link spread} floor starts refusing sites before the count is spent, and
     * the report says so rather than leaving the shortfall silent.
     */
    count: number

    /**
     * The least arc between two places, in degrees of the horizon.
     *
     * The thing that stops the search returning nine versions of the one best
     * bearing: the score is smooth around a col, so the nine highest-scoring
     * samples on an unconstrained ring are nine neighbours of each other.
     *
     * Twelve degrees at the eight hundred metres the coast comes nearest is
     * about a hundred and seventy metres of shoreline between one place and
     * the next.
     */
    spread: number

    /**
     * The most lights one place is given.
     *
     * A ceiling rather than a count: each place rolls between one and this, so
     * the coast gets a couple of single crofts and one or two proper villages
     * rather than nine identical rows. 1 is a coast of single lights.
     */
    cluster: number

    /**
     * Metres over mean water the highest light in a place stands.
     *
     * A village on a coast like this climbs the hillside behind its quay, and
     * everything in it is within a few metres of the water. Clamped against the
     * crest of its own bearing by {@link ROOFLINE} in
     * `landscape/shore-lights.ts`, so a place in a low col keeps its lights
     * under the skyline instead of hanging them over it.
     */
    climb: number

    /**
     * How much a place prefers to be near a way out to sea, 0..1.
     *
     * The second term of the score, and the one that puts the villages at the
     * mouths of the sounds rather than evenly along the coast. 0 scores on the
     * low ground alone, which spreads them down the range's cols; 1 pulls
     * nearly every place to the two bearings either side of a sound.
     */
    harbour: number
  }
}

export const SCAPE_SHORE_LIGHTS: ShoreLightsConfig = {

  // Swept against the coast the default seed gives: three headlands, three
  // sounds, and a crest line running from nothing at the mouths of the sounds
  // to 103 m at the summit. `harbour` 0.45 is where the places stop lining the
  // cols of the range and start gathering at the water — under about 0.3 the
  // highest-scoring bearings are all inland saddles, which on this coast means
  // lights strung along the back of a bay with no reason to be there.
  //
  // `count` 14 at `spread` 12 is the pair that spends the whole budget: the
  // ring has 63% of the horizon standing, which is 227 degrees, so fourteen
  // places at twelve apart need 156 of it and the search still has room to
  // choose.
  //
  // `climb` 14 m against a 118 m range is a village on the shore of a mountain
  // rather than a village on the mountain, and `size` 6 px is what the first
  // capture asked for — see the knob.
  shoreLights: {
    glow:    1,
    size:    6,
    count:   14,
    spread:  12,
    cluster: 6,
    climb:   14,
    harbour: 0.45,
  },
}
