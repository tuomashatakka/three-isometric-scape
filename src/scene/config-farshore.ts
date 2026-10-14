/**
 * The land on the other side of the water.
 *
 * The tenth section kept outside `config.ts`, and here for the reason the
 * guard, the treeline, the dunes, the kelp, the crag, the dyke, the shieling,
 * the wreck and the shoal are: a subject, moved whole.
 *
 * Every landform this scape has had until now stands inside the archipelago
 * plane, and the plane has always ended in open water on every bearing. Pull
 * the camera out and the six islands sit in the middle of a sea with nothing
 * behind them — which is not what an archipelago looks like from anywhere, and
 * not what this one is supposed to be. An island group is the *fringe* of
 * somewhere. The mainland is the reason the ferries have a timetable, the
 * reason the sound is a sound rather than an ocean, and the thing that closes
 * the top of the picture.
 *
 * So this is a coast the scape can see and can never reach: a mountain wall
 * standing a kilometre off, broken by the sounds the sea runs out through,
 * hazed by the same linear fog every other distant thing in the frame is hazed
 * by, and whitened by the same snow line that whitens the islands.
 *
 * **Build-time, and out of the tuning overlay for the reason `creek` and
 * `strand` are.** The ring is solved during the survey and merged into one
 * static mesh at build. Nothing in here can move without the scape being
 * generated again, and a slider that needs a rebuild to be seen lies about
 * what a slider does. The one knob that *is* live already exists and is
 * already in the panel: `atmosphere.fogDensity` is what decides how much of
 * this you can see, and a second haze beside it would be two answers to one
 * question.
 *
 * ### the scale classes
 *
 * Three classes, named rather than inherited:
 *
 * - **world-sized.** {@link FarShoreConfig.farShore.reach} is a multiple of
 *   `archipelago.worldSize`, not a number of metres, because the one thing this
 *   coast must never do is stand inside the archipelago. A world that grows
 *   takes the far shore out with it, and {@link FarShoreConfig.farShore.standOff}
 *   — metres, and the exception that proves the rule — is the clearance it
 *   keeps past whatever the islands actually occupy on each bearing.
 * - **metres.** {@link FarShoreConfig.farShore.rise} and
 *   {@link FarShoreConfig.farShore.sink} are heights, and a mountain is the
 *   same mountain in a bigger world.
 * - **dimensionless.** Everything else is a share: of the reach, of the
 *   horizon, of the rise, or of a revolution.
 *
 * Nothing here is frame-sized, and that is deliberate. A backdrop placed off
 * the camera's view size would slide when the view did, and land that slides
 * when you zoom is the one thing a distant coast must not do.
 */
export interface FarShoreConfig {
  farShore: {

    /**
     * Where the crest line stands, in multiples of `archipelago.worldSize`.
     *
     * The world is 1520 m across and the furthest corner any terrain patch
     * reaches is 882 m from the middle, so anything under about 0.58 would put
     * a mountain range through the sound island. It is not clamped against that
     * here — see {@link standOff}, which solves the clearance per bearing and
     * is the thing that actually guarantees it.
     *
     * The ceiling is the camera rather than the geometry. The frame at the
     * default 1400 m view reaches a little under 900 m of ground past the
     * focus, so a coast past that is a coast nobody will ever photograph. 0.55
     * puts most of the ring at 836 m — inside the frame on the bearings the
     * islands leave room on, pushed out past it on the two the big southern
     * patches occupy, which is why the skyline is not an even band.
     */
    reach: number

    /**
     * Metres of clear water the coast keeps past the furthest terrain patch on
     * its bearing.
     *
     * The guarantee, and the reason {@link reach} does not have to be one. The
     * ring is a circle and the archipelago is not, so a single radius either
     * stands clear of everything or cuts the two islands that reach furthest
     * out. Solved per bearing instead: the coast lies at {@link reach}, or past
     * the patches, whichever is further. A headland that gets pushed out this
     * way reads as a sound that is simply wider there, which is what a sound
     * that has a big island in it actually is.
     */
    standOff: number

    /**
     * Metres a summit at the top of the ridge field would stand over mean
     * water.
     *
     * The ceiling rather than a measurement: the field is noise and does not
     * reach 1 at any of the 360 bearings the ring is solved at, so the tallest
     * summit the archipelago actually gets is 103 m of this 118.
     *
     * The switch, and the only one: 0 is a sea with nothing behind it and no
     * geometry drawn rather than a mesh collapsed at the waterline. There is no
     * boolean beside it saying the same thing again.
     *
     * 118 m against islands that peak between 5.7 and 22.9 m is the proportion
     * that makes the archipelago read as *low* — which it is, and which nothing
     * in the frame could say while the islands were the tallest things in it.
     */
    rise: number

    /**
     * How much of {@link rise} the skyline gives up between its summits, 0..1.
     *
     * 0 is a wall of even height, which reads as a kerb. 1 brings every col
     * right down to the water and leaves a chain of separate peaks. 0.62 is a
     * range with passes in it.
     */
    relief: number

    /**
     * Control points per revolution in the ridge field.
     *
     * The feature size of the skyline, and the only number here that decides
     * what the coast *is* rather than how big it is. The detail octave runs at
     * three times it, so nine is a horizon with nine shoulders and twenty-odd
     * summits on it. Below about four the ring carries one lump per quadrant
     * and reads as a dome; past about twenty the summits are closer together
     * than the fog can separate and the whole thing goes back to being a wall.
     *
     * It sets the sounds too, through `SOUND_GRAIN` in
     * `landscape/farshore.ts` — a coast with more mountains has more valleys
     * between them, and giving the two their own numbers would have let a run
     * put twelve summits on a horizon with one way out of it.
     */
    grain: number

    /**
     * The level the land mask is cut at, 0..1.
     *
     * The sounds, and a threshold rather than the share it produces: the field
     * is noise and clusters about its middle, so 0.45 leaves 63% of the
     * horizon standing rather than 55%. What it does keep is the monotonicity
     * and both ends. 0 is a closed basin with no way out of it, which this
     * coast must not be — the ferries leave by them and the swell comes in by
     * them. 1 is open ocean on every bearing and no coast at all, which is the
     * same scape {@link rise} 0 gives, reached from the other end.
     *
     * `scape:map` prints the share the threshold actually produced, because
     * that is the number a reader wants and it is not this one.
     */
    openness: number

    /**
     * Degrees of arc a headland takes to come out of the water.
     *
     * Where the land mask runs out the crest is brought down to the toe over
     * this much bearing, so a headland ends in a slope rather than in a
     * vertical wall with the sea against it. Small, and it has to be: at more
     * than about fifteen degrees the taper eats the summits either side of
     * every sound and the range loses its skyline.
     */
    taper: number

    /**
     * Share of the standing distance between the waterline and the coastal
     * ridge behind it.
     *
     * A share rather than metres, so the coast keeps its proportions when
     * {@link reach} moves it: a range pushed twice as far away and left the
     * same depth is a painted flat, and from an orthographic camera at fifty
     * degrees the depth is most of what says it is not one.
     */
    width: number

    /**
     * How far the land runs back past the ridge, in multiples of the standing
     * distance.
     *
     * The knob that decides whether this is a coast or a reef, and the first
     * draft did not have it. A range with water on both sides of it is an
     * island chain however big the mountains on it are, and from this camera —
     * which at the zoom that can see any of this looks down at fifty degrees,
     * not along the water — that is exactly what it read as: a dark ribbon
     * curled round the archipelago with open sea behind it.
     *
     * So the land does not stop at the ridge. It carries on outward, over a
     * vale and up again, until it is past the corner of the widest frame the
     * camera has. 1.1 against a standing distance of 808 to 1203 m puts the
     * outer rim between 1.7 and 2.5 km out, which clears the 1.13 km half-diagonal
     * of a frame at `camera.maxViewSize`. A value that does not clear it is a
     * coast with a visible outside edge, which is worse than no coast.
     *
     * **Frame-sized, and the only thing in this section that is.** It is sized
     * against `camera.maxViewSize` rather than against the world, because what
     * it has to cover is the picture rather than the sea.
     */
    hinterland: number

    /**
     * Metres the toe is pushed under mean water.
     *
     * Not a foundation — nothing here is lit from below and nothing swims past
     * it. It is the margin that keeps the bottom edge of the range under the
     * sea at the bottom of a spring tide, which is half of `tide.range` and
     * well under a metre on this coast. Three metres is enough for any tide
     * this scape can be given, and it is also what collapses the cross-section
     * to nothing on the open bearings: the crest comes down to the toe, the toe
     * is under water, and the sounds cost two triangles of geometry nobody can
     * see rather than a branch in the loop that builds them.
     */
    sink: number
  }
}

export const SCAPE_FAR_SHORE: FarShoreConfig = {

  // Swept against the six islands at the default 1400 m view. `reach` 0.55 is
  // the largest value that still puts the ring inside the frame on the bearings
  // that are free — go past about 0.58 and the whole coast leaves the picture
  // at every pose the tour has, which is a system that exists only in the
  // report. The swing and the stand-off then spread it: the crest line comes in
  // to 808 m where the sea is open and is pushed to 1203 m across the southern
  // quadrant, where the sound and fell patches reach 882 m. That stretch is off
  // the frame edge on purpose — it is the one part of the horizon this
  // archipelago genuinely has no room for.
  //
  // `grain` 9 at `openness` 0.45 is the first pair that gives the coast three
  // ways out of it rather than two, which matters because the scape has five
  // ferry ports and a swell that has to come from somewhere. The 63% of the
  // horizon left standing is the realised share, not the knob.
  //
  // `rise` 118 and `relief` 0.62 were read off the skyline rather than chosen:
  // under about 70 m the range sits below the fog's strongest band and reads as
  // a smudge, and over about 160 m it starts clipping the top of the frame at
  // the default view.
  farShore: {
    reach:      0.55,
    standOff:   50,
    rise:       118,
    relief:     0.62,
    grain:      9,
    openness:   0.45,
    taper:      5,
    width:      0.45,
    hinterland: 1.1,
    sink:       3,
  },
}
