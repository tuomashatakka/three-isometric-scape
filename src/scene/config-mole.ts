/**
 * The arm the landing never had.
 *
 * The ninth section kept outside `config.ts`, and here for the reason the
 * guard, the treeline, the dunes, the kelp, the crag, the dyke, the stack and
 * the weir are: a subject, moved whole.
 *
 * **It is the third answer to a question the settlement had already asked
 * twice, and the first one that is about the sea rather than about the bed.**
 * The pier asks where the bottom will take a pile. The weir asks where the tide
 * walks far enough to strand a fish. Both are questions about ground. A
 * breakwater is a question about *water*: how much of it has room to build up
 * before it arrives, and whether anything stands between that and the boats.
 *
 * **And it is the landing's piece rather than the harbour's**, which is the
 * whole siting decision. The harbour is a cove chosen for shelter — on the home
 * island so sheltered that the pier refuses it for want of a way out — so it
 * needs no wall. The landing is chosen for a way out, which on this archipelago
 * means two hundred metres of open fetch on the bearings that matter and a
 * seven-metre timber jetty standing in it. The one piece of water the fleet
 * actually uses is the one piece nothing was ever built to protect.
 *
 * **`exposure` is the switch, and there is no boolean beside it.** Raise it past
 * what the sweep finds off a landing and that landing keeps its bare jetty;
 * raise it past what every landing finds and the archipelago has no arms in it
 * at all. Lower it and a sheltered creek gets a sea wall it has no sea for.
 *
 * **Build-time, and out of the tuning overlay for the reason `pier` and `weir`
 * are.** The course is surveyed against the bed and the stone is merged into the
 * steading's one hero draw; nothing here can move without the scape being
 * generated again, and a slider that needs a rebuild to be seen lies about what
 * a slider does.
 *
 * **Every length here is metres and stays metres.** How far a settlement will
 * cart stone into the sea, how deep it will tip it, and how high it wants the
 * crest are facts about carts, winters and the boats lying behind it rather than
 * about how wide the archipelago is — so a world that grows does not grow any
 * of them. See `landscape/mole.ts` for the solve and `props/mole.ts` for the
 * mound.
 */
export interface MoleConfig {
  mole: {

    /**
     * Metres of open water on the worst bearing before a landing is worth
     * walling.
     *
     * The switch. The sweep looks 280 m out and stops — see `HORIZON` in
     * `landscape/mole.ts` — so anything at or above that reads as "open sea" and
     * this is really asking how much of one. At the default seed every landing
     * in the archipelago saturates the sweep on at least one bearing and every
     * one of them qualifies, which is the honest answer for six islands whose
     * ports all face the sound.
     */
    exposure: number

    /**
     * Deepest water rubble is tipped into, in metres.
     *
     * The other switch, and the one that decides the *length* of what gets
     * built. A mound is stone falling off the end of the last stone: there is no
     * driving and no spanning, so where it stops is where the bottom went out
     * from under it. On these rock coasts that is close in, which is why the
     * arms come out short and thick rather than long and thin.
     */
    tipped: number

    /** Furthest the arm is carried, in metres, stem and hook together. */
    reach: number

    /**
     * Degrees the hook turns off the stem.
     *
     * The shape of the thing, and the only number here that is a composition
     * decision rather than an engineering one. Under about thirty the arm reads
     * as a slightly bent pier; past about seventy the head is pointing back at
     * the beach and the pool it encloses has a mouth too narrow to row out of.
     */
    turn: number

    /**
     * Metres the crest stands over mean water.
     *
     * Over *mean* water, like every other solved thing on this coast — see
     * `tide`. It has to stand clear of the spring high water `tide.range`
     * reaches, or the arm is awash twice a month and shelters nothing at the
     * only times anybody would notice.
     */
    crest: number

    /** Metres across the crest, where the stone is widest at the top. */
    width: number

    /**
     * Metres the foot spreads either side, per metre the crest stands over the
     * bed.
     *
     * The batter, and the difference between a breakwater and a wall somebody
     * left in the sea. A mound of loose stone cannot stand steeper than the
     * stone's own angle of repose, so a crest a metre and a half over a bed
     * three metres down has a foot four and a half metres wider than its top on
     * each side. That spread is most of what reads from above: the arm is a
     * broad dark wedge in the water rather than a line.
     */
    batter: number
  }
}

type SCAPE_MOLEType = MoleConfig

export const SCAPE_MOLE: SCAPE_MOLEType = {
  // Measured against the coast rather than chosen. The sweep off every landing
  // in the archipelago saturates `HORIZON` on at least one bearing, so an
  // exposure gate of 120 m is comfortably below what the sea actually offers and
  // is set where it is to keep its meaning if the falloff is ever retuned: it is
  // the point at which a bank stops being a creek and starts being a coast.
  //
  // 3.8 m of tipped depth is the one number here that was found by sweeping it
  // rather than reasoned out, and the sweep is worth recording because it says
  // more about the coast than about the arm. At 2.6 m — a depth a cart and a
  // winter can plausibly fill — three islands build and the home island is not
  // one of them: its landing stands on a shelf that reaches five metres of water
  // inside two station lengths. At 3.8 five of six build, the home island's
  // among them. Past 5 it starts *losing* islands again, because a deeper
  // allowance lets the stem run further out before it hooks and the hook then
  // finds nothing to turn onto. So this is where the coast has the most arms on
  // it, and the one island that still refuses is refusing for a reason the map
  // prints.
  //
  // 34 m of reach is above what the bed gives on any island at this seed; it is
  // there so that a flat shelf, which a retuned falloff could produce tomorrow,
  // gets an arm rather than a causeway.
  //
  // 55 degrees of turn is the middle of the band where the hook still reads as a
  // hook: the head comes round far enough to stand in front of the jetty and
  // stops well short of closing the water in behind it.
  //
  // 1.4 m of crest against a 0.8 m spring range puts the walkway a full metre
  // clear of the highest water of the month, which is the least that keeps a
  // mound reading as a mound at high tide. 3.2 m across the top is a cart's
  // width plus the stone that fell off either side of it.
  //
  // 1.25 of batter is a shade steeper than loose granite's own angle of repose,
  // and that shade is deliberate. At true repose a crest standing five metres
  // over the bed at the head spreads nearly nine metres either side, and the
  // arm stops reading as a built thing and starts reading as a second island
  // with a path on it. At 1.25 the head is about fifteen metres across the
  // foot, tapering to nothing at the root — a wedge, which is the silhouette
  // the whole structure is for.
  mole: {
    exposure: 120,
    tipped:   3.8,
    reach:    34,
    turn:     55,
    crest:    1.4,
    width:    3.2,
    batter:   1.25,
  },
}
