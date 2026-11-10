/**
 * The ring the cold puts round the sun.
 *
 * Another section kept outside `config.ts`, and here for the reason the guard,
 * the treeline, the dunes, the kelp, the crag, the shafts and the haar are: a
 * subject, moved whole.
 *
 * It is the other half of a system this scape has had since `rainbow.ts`
 * landed, and the two are deliberately exclusive. A bow is sunlight dispersed
 * by *drops*, so `rainbow.ts` multiplies its light by the share of the fall
 * that is **not** frozen. A halo is sunlight refracted through hexagonal ice,
 * so everything here multiplies by the share that **is**. One coast, one front,
 * one sun, and the frozen share of the fall is the whole of what chooses
 * between the two optics — a week of rain gets a bow and no ring, a week of
 * snow gets a ring and no bow, and the sleet between them gets a weakened
 * version of each. There is no flag anywhere saying so, because the year is
 * already saying it.
 *
 * ### it is not a second bow with different numbers
 *
 * Three things separate them, and all three fall out of the physics rather than
 * out of a style sheet:
 *
 * - **it stands round the sun, not opposite it.** the bow's centre is the
 *   antisolar point and sinks as the sun climbs. the halo's centre *is* the
 *   sun, so it climbs with it, and the sea takes the bottom of the ring only
 *   while the sun is lower than the ring is wide.
 * - **the red is on the inside.** a prism bends short wavelengths further, so
 *   the ring's sharp lip is its red inner edge and the blue washes outward into
 *   white. the primary bow is the other way round. anyone who has seen both can
 *   tell which is which from that one fact, and it is why the ramp here is not
 *   simply the bow's run backwards.
 * - **there is more than a ring.** the same crystals, settling flat rather than
 *   tumbling, put a mock sun on each side of the real one and stand a shaft of
 *   light up through it. see `halo.ts` for where each of those three sits, and
 *   note that nothing in this section says when any of them is out.
 *
 * ### the scale classes
 *
 * Every angle here is **degrees of sky** and stays degrees — a ring is at
 * optical infinity and does not grow when the archipelago does. The ring
 * hangs `SKY_OPTIC_REACH` frames out (`rainbow.ts`), a share of the live view,
 * which is what decides how large it is *in the picture* — a constant, not a
 * knob, since it is the bow's number too. There is no world-sized length in this section at
 * all, which is the whole of its audit.
 */
export interface HaloConfig {

  /**
   * The ring the cold puts round the sun.
   *
   * Not a fourth clock, for the same reason `rainbow` is not: a halo is a thing
   * the front, the year and the sun do together, and all three already have a
   * phase. Every knob here shapes the optics; nothing here decides when they
   * are out.
   */
  halo: {

    /**
     * How brightly the ring stands at the best moment of a front, 0..1.
     *
     * The switch, and the only one. Whether a given week has a halo in it at
     * all is the year's business — a coast whose fall is all rain has no ice
     * aloft to refract through — and how much of the ring clears the sea is the
     * sun's height. 0 is a coast that never gets one.
     */
    strength: number

    /**
     * How far ahead of the fall the ice veil runs, in phases of the front.
     *
     * The one knob here that is about *time*, and it is what puts the halo on
     * the other side of the weather from the bow. High ice cloud is the first
     * thing a front sends: it arrives hours before the rain does, which is why
     * a ring round the sun has been read as a sign of coming weather for as
     * long as anyone has been reading the sky. So the veil is the shower
     * sampled this far *later* in the cycle, weighted by how little is falling
     * here yet — the bow comes out on a band's trailing edge and the halo on
     * the approach to its leading one.
     *
     * 0 collapses the two onto the same instant, which is a halo in the heart
     * of a downpour and the one setting that reads wrong.
     */
    lead: number

    /**
     * The mock suns' share of the ring's brightness, 0..1.
     *
     * Its own knob rather than a fixed fraction, because this is the half of
     * the phenomenon a tier gives up (`haloArcs`) and the half a reader is most
     * likely to want either gone or overstated. In life they are usually the
     * brighter half, which is why the default is over 1.
     */
    dogs: number

    /**
     * The shaft standing through the sun, as a share of the ring.
     *
     * The third optic and the quietest: plate crystals catch a low sun on their
     * faces and reflect it straight back up, so a pillar is a column rather
     * than an arc and it is gone by the time the sun is properly up. There is
     * no separate switch for that — see `pillarLight` in `halo.ts`, where the
     * sun's own height takes it away.
     */
    pillar: number
  }
}


/** The halo's own defaults, spread into `SCAPE_CONFIG`. */
export const SCAPE_HALO: HaloConfig = {
  halo: {

    // Fainter than the bow's 0.65, and the reason is the sky it is drawn on.
    // The bow stands on the dark half of the frame — the sea opposite the sun,
    // under the back of a shower — where an additive band has everything to
    // add. The ring stands round the sun itself, on the brightest sky the grade
    // ever produces, and the first pass at 0.6 came out as a white smear with a
    // hole in the middle of it. What is left reads as a ring on the pictures
    // and still disappears into an overcast, which is what a halo does.
    strength: 0.46,

    // Just under a tenth of a cycle, which on the default front speed is the
    // better part of a minute of wall clock ahead of the rain. Long enough that
    // the veil's peak and the fall's do not overlap on the `scape:map` line —
    // which is the test this number was set by, rather than by a picture.
    lead: 0.09,

    // Over 1, and the only multiplier in the scape that is. Parhelia really are
    // brighter than the ring they sit on — the crystals that make them are
    // aligned rather than tumbling, so the same light goes into two patches
    // instead of round a whole circle. Set from the pictures at the halo poses:
    // under about 1.1 the mock suns stop being the thing the frame is about.
    dogs: 1.35,

    // Over 1, like the mock suns, and the two numbers were found the same way:
    // off the pictures, going up. A pillar has no colour and no edge to carry
    // it — it is a soft column of reflected sunlight on a sky the ring is
    // already standing on — and a broad gradient is far harder to see than a
    // line, so the ring reads at a brightness the shaft disappears at. The
    // first pass at half the ring was invisible in every frame, and the second
    // at 0.7 was still invisible. What finally carried it was this and a
    // proportion: two degrees of sky across against eighteen tall, where the
    // first cut was 2.2 by 14 and came out a round blob sitting inside the
    // circle rather than a column standing through it.
    pillar: 1.6,
  },
}
