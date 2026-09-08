/**
 * The fall on the beck.
 *
 * The third section kept outside `config.ts`, and here for the reason the guard
 * and the treeline are: a subject, moved whole. The scape has had running water
 * since the first island and has never had a *step* in it. `height.ts` smooths
 * the beck's long profile four times and then clamps it to fall the whole way,
 * which is exactly right for a channel that has to cut through a bar — and it is
 * also what guarantees the fall is spread evenly over every metre of the course.
 * A hill beck on this coast does not do that. It runs slack over the peat, meets
 * a band of rock that will not cut, and goes over it in one drop.
 *
 * So this section is a *redistribution* rather than an addition: nothing here
 * lowers the mouth or raises the spring, and `drop` at 0 leaves the long profile
 * exactly as it was. What it does is find the steepest reach the course already
 * has and gather that reach's fall into one step, leaving a slacker hanging
 * reach above it and a slacker tail below. The total fall between the spring and
 * the tideline is the same number afterwards, which is why the beck's mouth
 * still lands where every other search expects to find it.
 *
 * **Half build-time and half live**, split the way `beck` is split. Everything
 * that decides where the step is and what shape it is cut to is folded into the
 * height field and into the sheet's vertices, so it is absent from the tuning
 * overlay; `flow`, `white` and `spray` are read every frame and are on it.
 *
 * **Every length here is metres and stays metres.** A waterfall is the height a
 * waterfall is. Nothing in this section is scaled by `archipelago.worldSize` or
 * by the live `viewSize` — a world that grows again must leave all of it alone.
 * The one number that is not a length is `breadth`, and it is a multiple of the
 * channel's own wetted width, so the sheet opens out with the beck rather than
 * against it.
 */
export interface ForceConfig {
  force: {

    /**
     * Metres of the course's own fall gathered into one step.
     *
     * The switch as well as the size: 0 leaves the long profile untouched and
     * there is no fall anywhere in the archipelago, the way `beck.depth` at 0 is
     * a dry bed rather than a sheet drawn at nothing. It is a ceiling rather
     * than a promise — a reach with only a metre of fall in it gives up a metre,
     * because a step deeper than the ground it is cut into would run the beck
     * uphill on the way out of its own plunge.
     */
    drop: number

    /**
     * Metres of channel the face itself occupies.
     *
     * What separates a fall from a steep reach, and the only knob here that
     * cannot always be honoured: the long profile carries one level per point of
     * the traced course and those points stand about {@link ForceConfig.force.gather}
     * apart over a tenth of the course, so the face is shaped *inside* the
     * interval it lands in rather than by moving the interval's ends. Asking for
     * a face shorter than a fifth of that interval buys nothing the terrain grid
     * can draw — a quad on the home island is a little under a metre across.
     */
    run: number

    /**
     * Metres of channel the fall is gathered from.
     *
     * The window the search slides along the course looking for the steepest
     * reach, and the reach that pays for the step. Too short and the step is
     * built out of ground that was already the steepest metre on the hill, so
     * the fall barely changes and the hanging reach above it never appears; too
     * long and a quarter of the beck is levelled to feed one drop.
     */
    gather: number

    /**
     * Metres of drop below which there is no fall at all.
     *
     * An island whose course has no reach steep enough simply has no force, and
     * that absence is the right answer — the same answer the tarn, the mill and
     * the pier are each allowed to come back with. Without it, a flat island
     * gets a token step of a few centimetres, which is a seam in the streambed
     * with a sheet of white water standing on it.
     */
    least: number

    /**
     * Width of the sheet, as a multiple of the channel's wetted width at the lip.
     *
     * Over one because water spreads as it leaves an edge, and because a sheet
     * exactly as wide as the beck above it shows the streambed either side of
     * the lip straight through the fall.
     */
    breadth: number

    /**
     * Metres the water carries forward from the lip before it lands.
     *
     * Water leaving a lip keeps the speed it arrived with, so it lands out from
     * the foot of the face rather than against it. This is what puts daylight
     * between the sheet and the rock behind it, and it is why the fall reads as
     * falling rather than as a wet slab.
     */
    reach: number

    /** Metres the sheet stands off the face behind it, to keep out of its depth. */
    standoff: number

    /**
     * Metres of fall a fleck of the sheet travels in a second.
     *
     * 0 holds the water where it stands, and it is therefore its own line in
     * `STILL` — see `scripts/scape-shot.ts`. Its own rate rather than a multiple
     * of `beck.flow`: a fall is the one place on the course where the water is
     * not going at the speed of the channel, and the whole difference between a
     * fall and a reach is that it is going faster.
     */
    flow: number

    /**
     * How white the sheet breaks, 0..1.
     *
     * Not a second switch for the fall: how much of the sheet is broken is a
     * fact about how far it has fallen, which is baked into the vertices, so
     * this scales a gradient rather than painting a flat colour. Zero leaves a
     * fall of clear green water, which is what the top of one actually is.
     */
    white: number

    /**
     * How far the spray stands up from the plunge, as a share of the drop.
     *
     * 0 removes it, which is the mobile tier's answer as well as a knob's: the
     * band is drawn in the same fragment as the sheet, so the tier with no
     * texture in its water compiles no spray either — see `quality.beckRipples`.
     */
    spray: number
  }
}

export const SCAPE_FORCE: ForceConfig = {
  // Measured against the courses that exist rather than chosen. The home
  // island's beck falls 8.2 m over 38 m of channel and the steepest 9 m of it
  // carries about 3 m of that, so a 2.2 m ceiling is most of one reach's fall
  // and none of the rest of the course's — which is what leaves a hanging reach
  // above the lip instead of merely tilting the whole hill a little harder.
  //
  // It is a ceiling that is rarely reached, and the reason is the channel rather
  // than the hill: a face may only lift its own approach by seventy per cent of
  // `creek.incision`, so what the six courses actually take is 1.3 m to 3.9 m,
  // with the home island at 2.03. Raising this alone moves none of them.
  //
  // 1.2 m of face inside an interval of about 2.4 m is the steepest the traced
  // course can carry without the drawn ground turning it into a seam: a terrain
  // quad on the home island is 0.94 m across, so the face is one quad wide and
  // the two either side of it are the lip and the foot.
  //
  // 0.7 m of least drop is a step you could not sit on, and it is set just under
  // what the shallowest course can pay: the sound's window gives up 0.83 m and
  // the meadow's 1.26. At 0.9 the sound had no force at all, which is a valid
  // answer and the wrong one — its ground had a face, and the carve had only
  // made it a little shallower than the gate.
  force: {
    drop:     2.2,
    run:      1.2,
    gather:   9,
    least:    0.7,
    breadth:  1.35,
    reach:    0.55,
    standoff: 0.14,
    flow:     3.2,
    white:    0.85,
    spray:    0.4,
  },
}
