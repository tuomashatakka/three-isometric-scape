/**
 * The year.
 *
 * The twelfth section kept outside `config.ts`, and the first of them that is
 * not a *place*. Every slice before it — the guard, the treeline, the dunes, the
 * kelp, the crag, the dyke, the shieling, the howe, the snow fence, the hjell
 * and the kiln — is a thing standing somewhere on the archipelago. This one is a
 * clock, and it is here for the same reason they are: it is a subject, and the
 * document had run out of room again.
 *
 * It moved on the run that gave the hearth system a second lane. A kiln burns
 * for a fortnight of the year and a house fire never goes out, and writing that
 * difference down meant reading this section beside `config-kiln.ts` rather than
 * nine hundred lines away from it — which is the argument the per-section seam
 * was drawn for.
 *
 * Nothing about the shape of the section changed in the move. `season.time` is
 * still the one year in the scape: the snow on the ground, the turn in the
 * leaves, the ice on the sound, the fish on the racks and the smoke over the
 * kiln all read this same phase, and there is no second clock anywhere that
 * could drift from it. See `scene/season.ts` for what it derives.
 */
export interface SeasonConfig {
  season: {

    /** Phase of the year, 0..1. 0 is midwinter, 0.5 is midsummer. */
    time: number

    /** Full years per minute. 0 freezes the year wherever `time` left it. */
    speed: number

    /**
     * How hard the winter is, 0..1: how white the land gets, and — by
     * `winterFreeze` in `season.ts` — how hard the sea shuts. 0 is a scape
     * that never sees snow or ice.
     *
     * One knob since the sea ice's own `ice` leaf retired: the two curves
     * still neither start nor end together (the land whitens on one cold
     * night, the sea needs the whole season — `snowAmount` and `freezeAmount`
     * keep that), but how *hard* a winter is was one decision split over two
     * panel rows. `water.iceReach` decides how far out from the bank the
     * freeze carries.
     */
    snow: number

    /**
     * Metres above the waterline where lying snow starts to hold.
     *
     * Absolute height, not slope: the beach is warmed by the sea it sits in and
     * the fields above it are not, so a snow line just off the waterline is what
     * puts the white on the island rather than on the shore.
     */
    snowLine: number

    /**
     * Metres the snow line swings between the sunward face and the shaded one.
     *
     * **Metres, and they stay metres.** How far up a hill the last snow of a
     * thaw survives is set by how much sun that face takes, which is a fact
     * about the latitude rather than about the world's width or the frame's.
     *
     * 0 is the flat contour the scape had — a white line drawn round an island
     * at one height, which is the read every winter still had left in it after
     * {@link ScapeConfig.season.snowLine} learned to wander. This is the other
     * half of that: the shaded side keeps its cover metres lower than the side
     * the sun has been on, so the thaw eats the south face first and leaves the
     * north one white, which is what a thaw looks like. Which way is shaded is
     * `daylight.azimuth`, exactly as it is for `terrain.aspectMoss`.
     */
    snowSwing: number

    /**
     * Metres the snow line swings between the weather face and the lee of it.
     *
     * **Metres, and they stay metres**, for the reason
     * {@link ScapeConfig.season.snowSwing} is: how deep a drift banks is set by
     * how much snow crosses the hill, which is a fact about the winter rather
     * than about the world's width or the frame's.
     *
     * The other half of where lying snow *is*. `snowSwing` is a fact about melt
     * — the shaded face keeps its cover longest — and this is a fact about
     * fall: a winter's snow crossing a hill in a wind that never stops is taken
     * off every face turned into the weather and banked against every face
     * turned out of it. 0 is a hillside evenly whitened to one contour, which is
     * a hillside in a place with no wind in it. Which way the weather comes from
     * is `wind.bearing`, exactly as which way is shaded is `daylight.azimuth`.
     */
    snowDrift: number

    /** How hard the year turns and withers what is green, 0..1. */
    turn: number
  }
}

export const SCAPE_SEASON: SeasonConfig = {
  // Opens at midsummer, which is the season the scape was graded in — at
  // `time: 0.5` the year contributes exactly nothing and the first frame is the
  // frame it always was. The clock then runs it down into autumn, which is the
  // direction the change is worth seeing in.
  season: {
    time:     0.5,
    speed:    0.08,
    snow:     0.85,
    snowLine: 0.6,

    // Wider than the 1.6 m the line already fades over, so the two sides of a
    // ridge are separated by more than the softness of the edge between them —
    // under that and the swing reads as a blurrier contour rather than as two
    // faces.
    snowSwing: 2.2,

    // Deeper than the sun's swing on purpose, and it is the one number in this
    // section measured against the ground rather than chosen: the islands stand
    // 5 m to 23 m out of the water and 77% of that is already over the line at
    // midwinter, so a swing under about 2 m only re-shades ground that is white
    // either way. At 3.4 the weather faces come out from under the cover
    // altogether and the drift banks a good two metres further down the lee,
    // which is the read — bare rock on one side of a ridge, filled hollow on
    // the other.
    snowDrift: 3.4,
    turn:      0.55,
  },
}
