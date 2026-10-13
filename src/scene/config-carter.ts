/**
 * The cart that made the ruts.
 *
 * A section kept outside `config.ts`, for the reason the fence, the howe, the
 * shieling and the rest are: a subject, moved whole.
 *
 * The track has had a pair of worn wheel lines down the middle of it for a long
 * time — see `landscape/cart-ruts.ts` — and nothing in the scape had ever
 * driven down it. This is the thing that did. It is the first object on these
 * islands that is a *person* rather than a structure, an animal or a boat, and
 * the first thing anywhere in the scape whose whole state is an answer to the
 * question *what time is it*.
 *
 * ## read every frame, and still only two knobs
 *
 * Both of these are on the overlay, because both are read per frame and both
 * change the picture without a rebuild: where the cart is on the road is
 * recomputed from the clock every time the clock moves. Where the *road* is, is
 * not here at all — that is `layout.trackWidth` and the track the layout draws,
 * which is build-time, and the gauge the wheels run at is
 * `cartRuts.gauge`, which the cart's own geometry is held equal to by
 * `props/carter.test.ts`.
 *
 * ## why `reach` is not metres per second
 *
 * Every other rate in this config is per minute of wall clock, and this one
 * cannot be. The cart's place is a pure function of `daylight.time` and
 * `season.time` — it integrates nothing, exactly as the tide does not, so that
 * naming an hour puts the cart back where it was — and a pace in seconds would
 * mean that scrubbing the day slider faster got the cart further down the road.
 * Metres per turn of the day clock is the only unit in which the journey is the
 * same journey at every speed, the clock's own zero included. See the header of
 * `landscape/carter.ts`.
 */
export interface CarterConfig {
  carter: {

    /**
     * How far a cart gets in one whole turn of the day clock, in metres.
     *
     * **The switch, and the only one.** There is no `enabled` here for the
     * reason there is none anywhere: a round the cart cannot finish inside the
     * hours of daylight it has is a round nobody sets off on, and 0 is a reach
     * that finishes nothing. The scape then has no cart on any road, reached
     * through the arithmetic rather than around it.
     *
     * 330 m is a modest day for somebody hauling peat off a moor, and it is
     * chosen against the longest road in the archipelago rather than against a
     * pace: the biggest island's round is 192 m, which at this reach spends
     * 0.58 of a day, and the working day is capped at 0.62 — so every one of
     * the six roads is worked at the height of summer and none of them only
     * just. It is also what decides *how much of the year* each road is open:
     * a round is walked when the day is at least as long as the round takes,
     * which gives the short tracks three quarters of the year and the long ones
     * a summer season. Raising it lengthens every island's season and puts more
     * loads in each day; lowering it shuts the long roads first, which is the
     * right order — they are the ones a short day cannot do.
     */
    reach: number

    /**
     * The longest share of a day the round may take, 0..1.
     *
     * Not a second switch — it is the *ceiling* on the working day, and it is
     * here because at this latitude the sun does not set for weeks either side
     * of midsummer. Without it the window would be the whole twenty-four hours
     * and the cart would be on the road at what is nominally midnight, which is
     * astronomically true and reads as a bug. 0.62 is about fifteen hours, and
     * the floor at the other end of the year is not here at all: it is the
     * day's own length, which goes to exactly zero at midwinter and shuts the
     * road by itself.
     */
    day: number

    /**
     * How much of the ground's lean the cart takes, 0..1.
     *
     * The same weight every scattered thing on a hillside carries — see
     * `TiltWeight` in `landscape/align.ts` — and high rather than low, because
     * a cart is the one object in the scape that is *rigidly* on the ground: a
     * tree grows toward the light whatever it is rooted in, and a wheel is in
     * contact with the road or it is not a wheel. At 0 the cart stands plumb on
     * a one-in-six bank, which is the single most visible way a placement can
     * be wrong on a track that climbs.
     */
    lean: number
  }
}

export const SCAPE_CARTER: CarterConfig = {
  carter: {
    reach: 330,
    day:   0.62,
    lean:  0.88,
  },
}
