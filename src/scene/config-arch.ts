/**
 * The hole the sea cut and has not yet dropped.
 *
 * The eighth section kept outside `config.ts`, and here for the reason the
 * guard, the treeline, the dunes, the kelp, the crag, the dyke and the stack
 * are: a subject, moved whole.
 *
 * `config-crag.ts` gave this coast a cliff and `config-stack.ts` gave it the
 * pillar left over when the sea has finished with one. Between those two there
 * is a landform, and the stack section's own prose names it: a weak line is
 * worked into a geo, then a cave, then **an arch**, and only when the arch
 * falls is there a stack. The archipelago had the beginning of that sequence
 * and the end of it and nothing in the middle.
 *
 * It is the one landform in this scape that **cannot be a height field**. A
 * height field has one surface per column of air, so it can raise a pillar and
 * it can cut a geo, but it cannot put rock over water and open sky over the
 * rock — which is the entire subject. So unlike the crag and the stack this
 * section authors *geometry*: two legs and a span, merged into the steading's
 * one hero draw the way the pier and the weir already are, standing on ground
 * neither of them changes by a millimetre.
 *
 * Which is also what makes it safe. Nothing in here touches the height field,
 * so the harbour, the fairway, the farm and the waterway router see exactly the
 * coast they saw before — the arch is drawn over the water rather than folded
 * into the ground under it.
 *
 * **Build-time, and out of the tuning overlay for the reason `crag` and `stack`
 * are.** The span is baked into a merged geometry at generation; nothing here
 * can move without the scape being generated again, and a slider that needs a
 * rebuild to be seen lies about what a slider does.
 *
 * **Every length here is metres and stays metres**, except
 * {@link ArchConfig.stature}, which is a share of the headland's own lip and so
 * scales itself with each island's crag. How much rock is left standing over a
 * hole the sea cut is not a fact about how wide the archipelago is.
 */
export interface ArchConfig {

  /**
   * Share of the headland's own lip height the crown of the span keeps, 0..1.
   *
   * The section's switch, and a share rather than a height for the reason the
   * stack's is: an arch is the spur it was cut through, so on the fell — whose
   * lip stands nine metres over the water — the rock over the hole has to stand
   * higher than the one off the home island's six.
   *
   * Below the stack's own `stature` on purpose, and the test beside
   * `landscape/arch.ts` states that as a fact about the pair rather than as an
   * intention. A spur thin enough for the sea to cut through is a spur the
   * weather had already taken the top off; when it falls, what is left standing
   * is the seaward end of it, and that end is the *stack* — which is why the
   * pillar is the taller of the two on every headland that carries both.
   *
   * At 0 there is no arch on any coast in the archipelago, and there is no
   * boolean beside it saying the same thing again.
   */
  stature: number

  /**
   * Furthest out the outer leg will be carried, in metres.
   *
   * **A ceiling rather than a length**, and that is the section's second
   * argument. How long the span comes out is not a number anybody can write
   * here: it is however much shelf the headland has, the same way the pier's
   * length is however much bottom the harbour has and for the same reason —
   * see `landscape/arch.ts`, which carries the outer leg to the last of the
   * shelf and stops there. What this bounds is the case where a coast offers
   * *too much*: a span twenty metres across is a viaduct, whatever the sea did
   * to put it there.
   *
   * Metres, and they stay metres. How far a hole can be cut through a spur of
   * granite before the roof of it comes down is a fact about rock rather than
   * about how wide the archipelago is.
   */
  reach: number

  /** Plan radius of each leg, in metres. */
  girth: number

  /**
   * Narrowest opening that is still a hole, in metres.
   *
   * The floor under the solved span, and the refusal that takes the landform
   * off a coast whose shelf is too short to have carried a spur with a hole in
   * it. Under about two and a half metres the two legs merge into one lump at
   * the far zoom and what the scape draws is a boulder with a crack in it —
   * which is the reading the whole landform cannot afford.
   */
  least: number

  /**
   * Metres of headroom the span springs off its legs at, over mean water.
   *
   * The reason the landform reads as an arch rather than as a boulder with a
   * shadow under it: the light and the sea both have to get through it. The
   * *middle* of the hole stands higher than this — the underside is a curve,
   * and `landscape/arch.ts` owns its rise — so what is written here is the
   * lowest daylight anywhere across the opening rather than the most.
   *
   * Sized against the tide rather than by eye. The springs in this scape run
   * ±0.4 m, so the default leaves better than two metres of daylight under the
   * legs and better than three under the crown at the top of the biggest tide
   * of the year, and `scape:map` reports the second of those rather than this.
   */
  clear: number

  /**
   * Deepest water the outer leg will stand in, in metres.
   *
   * The first refusal. An arch is a spur of the headland with a hole in it, and
   * a spur that ran out into ten metres of water was never joined to anything —
   * whatever stands out there is a stack, and `landscape/stack.ts` already puts
   * those where they belong. Read off the bare falloff seabed rather than the
   * drawn one, for `coastBedAt`'s reason: the shore band flattens the first
   * metres under every waterline in the archipelago, so a depth taken from the
   * terrain would say every coast has the same water off it.
   */
  founded: number

  /**
   * Metres of water under the middle of the portal, or there is no arch.
   *
   * The second refusal, and the one that says what the landform *is*. A span
   * over dry ground is a bridge, and this coast has one of those where the
   * track crosses the beck. The sea has to still be running through the hole it
   * cut, and this is how much of it there has to be.
   */
  drowned: number

  /**
   * Metres along the shore the arch keeps from the stack's own line.
   *
   * The third refusal. Both landforms are cut on the weakest rock the headland
   * has, so left to themselves they site on the same line and the pillar stands
   * in the portal. The stack takes the weakest line — it is the further-gone of
   * the two — and the arch takes the best line left outside this distance of
   * it, which is what puts a sequence on one headland instead of a collision.
   */
  apart: number
}

type SCAPE_ARCHType = { arch: ArchConfig }

export const SCAPE_ARCH: SCAPE_ARCHType = {
  // Measured against the archipelago rather than chosen, the way the stack's
  // numbers were.
  //
  // The crown at seventy-two hundredths of an authored 7 m lip stands 5.04 m
  // over mean water, against the stack's 5.95: two landforms off one headland,
  // the pillar the taller, which is the order the sequence happens in.
  //
  // The headroom is the number that was swept. Under about two metres the span
  // reads as a lintel lying on two boulders at the tour's far zoom, and past
  // about three the crown has to climb above the lip to keep any rock in the
  // arch at all. Two point six leaves a metre of granite over the middle of
  // the opening, better than twice that at the haunches, and 2.9 m of daylight
  // under the crown at the top of a spring tide.
  //
  // The founding depth is the refusal that decides how many headlands carry
  // one, and it is set against the crag's own platform depth (`crag.depth`,
  // 2.2 m) plus the fall of a bay: a shelf that has already gone deeper than
  // four metres is a shelf a spur never reached across, and whatever stands out
  // there is stack country. On this archipelago it leaves four headlands in
  // five with an arch, at openings from a shade over the floor to eight metres
  // — the same spread the pier's length has, and from the same kind of answer.
  //
  // `apart` is three girths: far enough that the two landforms on a headland
  // are two, near enough that both stay inside its arc.
  arch: {
    stature: 0.72,
    reach:   12,
    girth:   2.2,
    least:   2.6,
    clear:   2.6,
    founded: 4,
    drowned: 0.6,
    apart:   14,
  },
}
