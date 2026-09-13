/**
 * The trap the ebb leaves full.
 *
 * The eighth section kept outside `config.ts`, and here for the reason the
 * guard, the treeline, the dunes, the kelp, the crag, the dyke and the stack
 * are: a subject, moved whole.
 *
 * Everything this settlement has built on the water so far was built to get a
 * boat *off* the island — the jetty, the slipway, the trestle out to a berth. A
 * fish weir is the opposite piece of the same economy. Nobody goes anywhere: a
 * low wall is laid out across the flat at low water, the flood covers it, the
 * fish come in over it with the tide, and the ebb takes the water back out from
 * under them and leaves them in the pound. It is the oldest structure on any
 * coast that has one, and it is made of nothing but stone that was already
 * lying there and an understanding of what the sea does twice a day.
 *
 * **`tide.range` is the switch, and there is no boolean beside it.** The band a
 * trap can be built in is the band the tide walks across — ground that covers at
 * high water and dries at low — so a tideless coast has nowhere to put one, the
 * search finds a band of zero width, and every island comes back `null`. That is
 * the same shape of refusal the rest of the settlement already has, and it is
 * not an accident of the implementation: a weir *is* a tide, built in stone.
 *
 * **It is the complement of the pier, and on this seed that is literal.** The
 * trestle needs a shelf that falls away to a berth with a way out of it, and
 * `landscape/pier.ts` reports three islands in six where it finds one. The trap
 * needs the exact opposite — water so shallow for so far that it dries — and it
 * finds its site on the home island, whose harbour is the enclosed shallow bay
 * the pier refused. The one cove in the archipelago with no way out of it is the
 * one cove in the archipelago worth trapping.
 *
 * **Build-time, and out of the tuning overlay for the reason `pier` is.** The
 * course is surveyed against the bed and the stone is merged into the steading's
 * one hero draw; nothing here can move without the scape being generated again,
 * and a slider that needs a rebuild to be seen lies about what a slider does.
 *
 * **Every length here is metres and stays metres.** How far somebody will carry
 * stone out over a flat, and how big a pool has to be before it is worth
 * walking out to, are facts about people and fish rather than about how wide the
 * archipelago is — so a world that grows does not grow any of them.
 */
export interface WeirConfig {

  /**
   * Furthest out the leader is carried from the bank, in metres.
   *
   * The ceiling rather than the length. What the leader actually measures is
   * where the flat stops being a flat — the search walks the intertidal band
   * out from the bank and the wall ends where the band does, which on the home
   * island is a good deal short of this. Raising it past the flat builds
   * nothing extra; lowering it under {@link least} plus a bay's walk takes the
   * trap off the island.
   */
  reach: number

  /**
   * The pound's plan radius, in metres.
   *
   * What the search asks for, and it is an ask rather than a fact: a pound is
   * only ever as round as the flat it is set on. The radius is drawn in until
   * the whole ring lies in the band, so what gets built is this or less, and
   * {@link least} is where "less" stops being a trap.
   */
  pound: number

  /**
   * The smallest pound worth setting, in metres.
   *
   * The refusal, and the one that does the work. A ring three metres across is
   * a rock pool somebody tidied, and an island whose flat will not hold more
   * than that keeps its lines and its creels. `null` is a real answer here the
   * way it is for the mill, the chapel, the smokehouse, the croft and the pier.
   */
  least: number

  /**
   * The gap left in the pound, in degrees of its own circle.
   *
   * The whole mechanism, in one number. A closed ring is a tank — the flood
   * fills it, the ebb empties it, and nothing that swam in is any worse off for
   * it. The gap faces back down the leader, so a fish running along the wall on
   * the ebb is turned into the pound rather than out of it, and then cannot find
   * the one opening again from the inside. At 0 the ring closes and the trap
   * stops being one; at 180 it is a crescent that anything can leave.
   */
  mouth: number

  /**
   * How wide the band of stone is at its crest, in metres.
   *
   * The dimension that makes a weir legible, and the one a wall does not have.
   * A head dyke is read off its height because it stands on ground somebody is
   * walking past; a trap is read from above, off a flat, at a third of a metre
   * tall, and what separates it from shingle is that it is *wide* — two or three
   * courses of boulder laid side by side, which is also simply what a structure
   * built by rolling stones rather than lifting them comes out as. The stone is
   * sized off this rather than off {@link height} for the same reason.
   */
  width: number

  /**
   * How far the wall stands over the bed it is laid on, in metres.
   *
   * Deliberately under half the tide's own range. A weir that stood proud of
   * high water would be a harbour wall, and the fish would never come over it;
   * one that never showed at all would be a line of stones nobody could see
   * from the shore. Under this it is exactly what it should be — submerged and
   * readable as a shadow at high water, standing clear of the drained flat at
   * low.
   */
  height: number
}

type SCAPE_WEIRType = { weir: WeirConfig }

export const SCAPE_WEIR: SCAPE_WEIRType = {
  // Measured against the flat rather than chosen. The home island's harbour cove
  // holds its intertidal band for twenty-four metres on the best bearing of the
  // sweep, so a reach of 26 is the flat's own length plus room for the search to
  // prove it has ended — and the leader that gets built comes out at whatever
  // the band gave, which is the number `scape:map` prints.
  //
  // Four metres of pound against a 0.8 m tide is the proportion that matters:
  // the pool the ebb leaves behind is a little over four metres across and a
  // little under half a metre deep, which is a morning's work for two people and
  // reads at the near zoom as a ring of stone with water still in it. `least` is
  // set at half of that. Under two metres the ring is a dozen stones and the
  // whole structure reads as a wall that stopped.
  //
  // The mouth is the one number swept rather than measured. Under about sixty
  // degrees the gap disappears into the stone spacing at the mobile tier and the
  // ring draws closed; past about a hundred and twenty the pound stops holding a
  // shape at all and reads as a bend in the leader. Ninety is the middle of that
  // band, and it is also the traditional answer — a quarter of the ring, facing
  // the shore.
  //
  // 0.34 m of wall against 0.8 m of spring range puts the crest a shade under
  // half tide: covered for most of the flood and standing for most of the ebb,
  // which is the only window in which a trap does anything at all.
  //
  // 1.8 m of band against 0.34 m of height is the proportion that decides
  // whether any of this reads at all, and it was measured rather than chosen.
  // The first cut sized the stone off the height the way the head dyke does and
  // came out as a line of fourteen-centimetre pebbles — shingle at every zoom
  // this scape is seen from. Sized off the band instead, a stone is a third of a
  // metre across, the foot course spreads to nearly three, and the whole thing
  // reads from above as the dark line it is.
  weir: {
    reach:  26,
    pound:  4,
    least:  2,
    mouth:  90,
    width:  1.8,
    height: 0.34,
  },
}
