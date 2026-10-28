/**
 * The kiln the shell sand is burned in.
 *
 * The eleventh section kept outside `config.ts`, and here for the reason the
 * guard, the treeline, the dunes, the kelp, the crag, the dyke, the shieling,
 * the howe, the snow fence and the hjell are: a subject, moved whole.
 *
 * A lime kiln is the one piece of industry on a coast like this, and every
 * decision in it is a decision about a *bank*. The charge goes in at the top in
 * alternating courses of shell sand and peat, the fire is lit at the bottom, and
 * four days later the quicklime is raked out of the draw arch at the foot. That
 * only works if the two ends are at different heights, so a kiln is never built
 * on level ground: it is cut into a brae, with the charging floor level with the
 * ground above and the arch standing clear of the ground below.
 *
 * Which makes it the exact inverse of the smokehouse twenty metres along the
 * same bank. That search refuses anything with more than `SILL_FALL` of drop
 * across it; this one refuses anything with *less* than {@link KilnConfig.kiln.brae}.
 * Two buildings on one shore wanting opposite ground is most of what stops the
 * harbour reading as a row of sheds — see `landscape/kiln.ts` for the siting and
 * `props/kiln.ts` for the drum.
 *
 * **Build-time for the stone, per-frame for the burn.** The site is settled
 * during the survey and the geometry is plopped at build, so the shape of the
 * kiln has no knob here for the reason the smokehouse's does not. What does have
 * knobs is the year: a kiln is fired for a few weeks at the end of the summer,
 * when the peat cut in spring is finally dry enough to burn, and it stands cold
 * and empty for the rest of it.
 *
 * **Metres, except the two that are phases of the year and the one that is a
 * ratio.** `setback`, `reach`, `freeboard`, `brae` and `scarp` are lengths of
 * ground and stay metres on an archipelago of any size; `burn` and `peak` are
 * phases; `draw` is how hard this plume stands against a hearth's.
 */
export interface KilnConfig {
  kiln: {

    /** Nearest the harbour bank the drum may stand, in metres. */
    setback: number

    /** Furthest from the bank the search will look, in metres. */
    reach: number

    /**
     * Least height over mean water the draw sill may stand at, in metres.
     *
     * The same guard the smokehouse's and the hjell's have, and asked at the
     * *low* end of the kiln rather than at its middle: the arch is the end that
     * is downhill by construction, so a centre a metre clear of the water says
     * nothing about the sill the lime is raked out onto. Quicklime slakes on
     * contact with water hard enough to boil, so a kiln mouth the spring tide
     * reaches is a kiln nobody stands in front of.
     */
    freeboard: number

    /**
     * Least fall across the site, in metres, bank to sill.
     *
     * **The switch, and the only one.** There is no `enabled` here for the
     * reason there is none anywhere: a kiln exists because the ground has two
     * heights, so this number asked higher than {@link scarp} is a coast with no
     * kiln on it, reached through the arithmetic rather than around it.
     *
     * A metre is the honest floor. The charging floor has to be level with the
     * ground behind it and the arch has to stand clear of the ground in front,
     * and the drum is three and a half metres through — so ground falling less
     * than this over that distance is ground the burners would have had to dig
     * the difference out of by hand, which is what they built on a brae to
     * avoid.
     */
    brae: number

    /**
     * Most fall across the site, in metres.
     *
     * The other end of the same gate, and it is a fact about dry stone rather
     * than about taste: a drum is a ring of unmortared blocks holding a fire in,
     * and a bank steeper than the drum is tall has nothing for the uphill half
     * of that ring to bear on. Over about two and a half metres the kiln stops
     * being cut into the brae and starts being a tower with a cliff behind it.
     */
    scarp: number

    /**
     * The share of the year the kiln is fired, 0..1.
     *
     * **The switch for the smoke**, and the second of the two this section has.
     * A window round {@link peak} rather than a flag, ramped at both ends over
     * about a week, so the plume comes up and dies back rather than blinking: 0
     * is an archipelago of cold kilns, 1 is a farm that burns lime instead of
     * farming.
     *
     * A sixth of the year is roughly what the real season was — a kiln is
     * charged, fired, drawn and recharged over four or five days, and a holding
     * this size wants lime for a season's worth of mortar, byre floors and
     * sweetened ground. It is deliberately much shorter than the hjell's
     * {@link KilnConfig} neighbour: a rack is full for a third of the year and a
     * kiln is lit for a few weeks of it, and two things on one shore keyed to
     * the same clock at different *widths* is what stops the year reading as one
     * switch thrown twice.
     */
    burn: number

    /**
     * The phase of the year the burn is centred, 0..1, with 0 at midwinter.
     *
     * Late summer, and that is downstream of the peat rather than of the lime.
     * The fuel is cut off the moor in spring and stacked to dry, and it is not
     * fit to fire a kiln with until the end of a dry summer — so the burn sits
     * after the growing season has turned and before the autumn weather comes
     * in. Which puts it almost exactly half a year from the hjell's spring peak,
     * so the two structures on this shore are never busy in the same week.
     */
    peak: number

    /**
     * How hard the kiln draws at full burn, against a hearth's plume.
     *
     * Over one, and deliberately: a kitchen fire is a few billets and a kiln is
     * four tonnes of peat under a draught, so a plume off this that matched the
     * farmhouse's would read as a second chimney rather than as a burn. The
     * third way to put the smoke out — 0 here is a kiln that is fired and shows
     * nothing for it, which is the setting for a run that wants the stonework
     * without the column.
     */
    draw: number
  }
}

export const SCAPE_KILN: KilnConfig = {
  kiln: {
    setback:   6,
    reach:     46,
    freeboard: 1.2,
    brae:      1,
    scarp:     2.5,
    burn:      0.16,
    peak:      0.62,
    draw:      1.8,
  },
}
