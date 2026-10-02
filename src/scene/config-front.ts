/**
 * The front, and the four systems that read it.
 *
 * One more slice of the config kept outside `config.ts`, cut on exactly the
 * seam `config-guard.ts` named when it was the first: not "the interface here
 * and the defaults there", which puts a knob and its reason on two sides of an
 * import, but a whole *subject* — its part of the schema and the numbers that
 * answer it, moved together.
 *
 * These four belong in one slice because there is one front and these are the
 * four things that happen to it. `weather` is the clock itself — the phase, the
 * speed, what comes down and how much of it. `squall` is that same front read a
 * tenth of a cycle ahead of here, so the shower on the horizon is the shower
 * that has not arrived. `storm` is the instant it has electricity in it, and
 * `rainbow` is the two instants on each band's *edges* when there are drops in
 * the air and sky enough left to light them. Not one of the last three has a
 * clock of its own, by design, and a reader who has any of them open wants
 * `weather.time` in the same file.
 *
 * It went out when the two hail knobs took `config.ts` past its own raised
 * ceiling, which is the ceiling doing the job the guard's section describes.
 */
export interface FrontConfig {

  /**
   * The weather.
   *
   * The third clock, and the same shape as the two above it: a phase, a speed,
   * and everything else derived from the phase. What it deliberately does not
   * carry is a snowfall strength — `weather.ts` takes what falls from the year
   * and only decides how hard it comes down, so there is one winter in the scape
   * rather than two that have to be kept in step.
   */
  weather: {

    /** Phase of the front, 0..1. 0 is the middle of the clear spell. */
    time: number

    /** Fronts per minute. 0 freezes the sky wherever `time` left it. */
    speed: number

    /**
     * How hard it comes down at the height of a squall, 0..1.
     *
     * 0 is a coast it never rains on, and it is the switch — there is no drop to
     * draw and no ground to wet when this is zero.
     */
    rain: number

    /** How dark and how glossy the wet leaves the ground it fell on, 0..1. */
    wet: number

    /**
     * Metres a drop falls in a second.
     *
     * The knob that stops the fall, and the reason it is a knob at all: a rate
     * hard-coded into the module could not be zeroed, and a scape whose rain
     * cannot be stopped cannot be photographed twice the same way. Snow comes
     * down at a fraction of it — see `uSleet` in `rain.ts`; hail comes down at a
     * multiple of it, out of the same knob, which is what keeps `STILL` able to
     * stop both falls with one line.
     */
    fall: number

    /**
     * How hard the stones come down at the height of a hail pulse, 0..1.
     *
     * The switch, and its own rather than a share of {@link rain}: hail and rain
     * are two falls out of one cloud at two moments of its life, not one fall
     * with a white setting. `weather.ts` owns *when* — a narrow pulse on the
     * band's leading flank, weighed by the week of the year — and this owns how
     * much of it there is. 0 is a coast that gets rain and never stones.
     */
    hail: number

    /**
     * How wide one hail cell runs, as a share of the world.
     *
     * **World-sized, and the one number in the fall that is.** A shower of this
     * kind is a single convective cell a few hundred metres across: it hails
     * here and it is dry over the next island, and the edge between the two is
     * the thing a wide frame of this system actually shows. A share rather than
     * a span in metres for the reason `WEATHER_BANK_WORLD_FRACTION` is one — an
     * archipelago that grows again must grow its cells with it, or the one patch
     * of hard fall becomes a speck in the sound.
     *
     * The stones inside it stay metres and the column that carries them stays
     * frame-sized. Three scales in one module, and this is the only one that
     * moves with `archipelago.worldSize`. See `hail.ts`.
     */
    hailCell: number
  }

  /**
   * The weather you can see but are not in yet.
   *
   * Not a fifth clock and deliberately not one — every knob here is read against
   * the front `weather` already owns. See `squall.ts`.
   */
  squall: {

    /**
     * How heavily the shower stands on the water it is crossing, 0..1.
     *
     * It is also the switch, and the only one: whether there is anything to see
     * on any given pass of the front is the weather's business, and whether the
     * frame is far enough back to read it is the zoom's.
     */
    strength: number

    /**
     * How far ahead of the local front the visible squall is, in cycles.
     *
     * The idea of the module as a number. 0 puts the shower under the same rain
     * the ground is already under, which is a squall with nothing to say; a lead
     * of a tenth of a cycle is weather arriving, and it both places the band and
     * weighs it without either being animated separately.
     */
    lead: number

    /**
     * How far upwind the shower stands at the height of its approach, in bands.
     *
     * The sweep, in the band's own width: at 1 the shower is a full band clear
     * of the frame's middle when the front is furthest from arriving, and it has
     * crossed to the same distance downwind by the time the fall is over. 0
     * parks it over the middle and lets it fade in and out where it stands,
     * which is a shower that never arrives.
     */
    reach: number

    /** How wide the band of shower is, as a fraction of the frame. */
    span: number

    /**
     * The share of the wind's travel the stipple itself travels at.
     *
     * A share rather than a rate of its own, so there is one wind in the scape
     * and the surface under the shower moves on the same bearing everything else
     * does. 0 holds the texture wherever the wind left it — which is what the
     * captures set, because a shower with a different grain in every frame of a
     * tour is a tour that cannot be diffed.
     */
    drift: number
  }

  /**
   * The lightning in that same front.
   *
   * Not a sixth clock either, and for the squall's reason: every knob here is
   * read against the phase `weather` already owns, so a strike fires at an
   * instant of the front rather than at an instant of its own. See `storm.ts`.
   */
  storm: {

    /**
     * How brightly a flash lies on the cloud over the far islands, 0..1.
     *
     * The switch for the flash, and the only one it has: whether a given pass of
     * the front carries a strike at all is `rate`'s business, and whether the
     * frame is far enough back to read the lit cloud is the zoom's.
     */
    strength: number

    /**
     * How electric the front is: the share of its slots that carry a strike, 0..1.
     *
     * A threshold rather than a count. The scape's storm is a fixed comb of
     * possible strikes resolved from the seed, and this is the level each one's
     * own roll is compared against — so the knob moves the number of strikes a
     * front carries without replanning any of them, and 0 is a front with no
     * lightning in it at all.
     */
    rate: number

    /**
     * How long one strike stays lit, as a fraction of the front's cycle.
     *
     * In the front's cycle rather than in seconds, because that is the clock the
     * whole system is measured on — see `stormAge` in `storm.ts`. At the default
     * front speed the default is about two thirds of a second, and a front driven
     * faster has faster lightning in it, which is the honest consequence of a
     * storm that belongs to one front rather than running beside it.
     */
    flash: number

    /** How far the lit cloud spreads, as a share of the world. */
    reach: number

    /**
     * How strongly the channel itself draws, 0..1.
     *
     * Its own knob rather than a share of `strength`, because the two are seen at
     * opposite ends of the zoom: the lit cloud is a wash at close range and the
     * thirty-metre fork is two pixels pulled out, so each fades where the other
     * arrives and each is worth setting on its own.
     */
    fork: number
  }

  /**
   * The bow the shower leaves behind it.
   *
   * Not a fourth clock and deliberately not one, for the reason `squall` is not
   * a fifth: a rainbow is a thing the front and the sun do *together*, and both
   * of those already have a phase. Every knob here shapes the arc; nothing here
   * decides when it is out. See `rainbow.ts`.
   */
  rainbow: {

    /**
     * How brightly the bow stands at the best moment of a shower, 0..1.
     *
     * The switch, and the only one: whether this pass of the front has a bow in
     * it at all is the weather's business, and how much of the arc clears the
     * horizon is the sun's height. 0 is a coast that never gets one.
     */
    strength: number

    /**
     * The outer bow's share of the inner one's brightness, 0..1.
     *
     * Its own knob rather than a fixed fraction, because the second arc is the
     * half of the phenomenon that is genuinely optional — it is the one a tier
     * gives up (`rainbowArcs`), and the one a reader is most likely to want
     * either gone or overstated. Nature's answer is about 0.43.
     */
    secondary: number

    /**
     * Width of the primary band, in **degrees of arc**.
     *
     * Degrees, and they stay degrees: this is an angle in the sky and not a
     * distance in the world, so it is the one extent in this section that does
     * not move when the archipelago or the frame does. The real bow is about
     * 2.2° across; anything wider is a stylistic choice about how much spectrum
     * the picture gets. The secondary is drawn {@link SECONDARY_SPREAD} times
     * wider, the way the real one is.
     */
    width: number

    /**
     * How saturated the spectrum is, 0..1.
     *
     * 1 is the schoolbook bow. 0 is a fogbow — the same arc in the same place
     * with the colour washed out of it, which is what a bow in droplets too
     * small to disperse actually looks like, and which is why this is a
     * saturation rather than a palette entry.
     */
    saturation: number

    /**
     * How far out the bow hangs, in **frames**.
     *
     * Frame-sized, like everything else in the sky: a bow is at optical infinity
     * and does not get bigger as the eye pulls back, so the arc is hung a share
     * of the live view away and its radius follows from the opening angle. That
     * makes this the one knob that decides how large the bow is *in the
     * picture* — and the reason it is not sized against the world is that a bow
     * scaled by the archipelago would be a smudge at one zoom and four frames
     * wide at another.
     */
    reach: number
  }
}


/** The front's own defaults, spread into `SCAPE_CONFIG`. */
export const SCAPE_FRONT: FrontConfig = {
  // Opens on the leading edge of the squall rather than in the clear spell, and
  // that is a deliberate break with how the other two clocks are set. Daylight
  // and the year both open where they contribute nothing, so the first frame is
  // the frame the scape was graded on; weather opens at about a third of its
  // strength, because a system that is off in the opening frame is a system
  // nobody looking at the scape ever finds out it has.
  weather: {
    time:  0.19,
    speed: 0.14,
    rain:  0.9,
    wet:   0.62,
    fall:  17,

    // Opens with stones in the air, and the parked `time` above is why it can.
    // 0.19 is on the leading flank of the first band — a third of the way into
    // the rain and the better part of the way into the hail — so the frame the
    // scape is graded on is a frame this system is in, which is the same
    // argument the weather's own phase is set by.
    hail:     0.75,
    hailCell: 0.22,
  },
  squall: {
    strength: 0.7,
    lead:     0.1,
    reach:    1.1,
    span:     0.75,
    drift:    0.5,
  },
  // Opens electric, for the reason the weather opens a third of the way into a
  // front: a system nobody ever sees fire is a system nobody finds out the scape
  // has. Two thirds of the comb carry a strike, which is five or six flashes in
  // the minute and a half a squall takes to cross.
  storm: {
    strength: 0.85,
    rate:     0.66,
    flash:    0.0016,
    reach:    0.12,
    fork:     0.9,
  },
  // Every one of these came down after the first frames were looked at, and the
  // first set is worth recording because it is the obvious set: a wide band, a
  // high saturation and a strong light, on the reasoning that a two-degree arc
  // is four pixels at the frame this scape opens on. What that produced was a
  // flat neon ribbon — the spectrum at full strength is six saturated primaries,
  // and six saturated primaries laid additively over a nordic grade is a decal
  // whatever shape it is cut in. The band now carries its width in its *tail*
  // instead of its core, so it is half a degree over the real 2.2° rather than
  // a degree and a half, and the light it is drawn at is what a bow is: faint.
  rainbow: {
    strength:   0.65,
    secondary:  0.42,
    width:      2.8,
    saturation: 0.7,
    reach:      0.3,
  },
}
