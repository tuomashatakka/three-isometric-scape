/**
 * The ground the tide walks across.
 *
 * The fourth section kept outside `config.ts`, and here for the reason the
 * dunes and the crag are: a subject, moved whole. Every coast in this scape so
 * far answers the sea by standing up to it — the beach shelves, the headland
 * plunges, the blown sand piles behind the strand — and all three are shores
 * the water arrives at and leaves again within a metre or two of where it was.
 * Which means the tide this scape raises is very nearly invisible: 0.8 m of
 * spring range on ground that climbs at a metre in four moves the waterline
 * three metres, and three metres at the far zoom is nothing.
 *
 * A saltmarsh is the coast that answers the other way. Where a river carries
 * silt into water too sheltered to take it back out again, the sediment settles
 * until the flat it builds stands at about the height the tide floods to — and
 * then stops, because ground the sea no longer covers gets no more silt. What
 * that leaves is a shore with almost no gradient at all: a hand's breadth of
 * rise over twenty-odd metres of ground, cut through by the drainage creeks the
 * ebb needs to get off it, turfed over on the part that is dry most of the
 * month and bare mud on the part that is not. On a flat like that the same
 * 0.8 m of tide walks the waterline *tens* of metres, twice a day.
 *
 * So this is the landform that makes the tide legible, and it is sited where
 * the silt comes from: the arc of coast about the beck's own mouth. It wants
 * shelter, so it is refused the shore the sand is on — that one is the weather
 * shore by construction — and it is refused the headland for the same reason
 * the headland is refused the mouth. Sand goes where the weather puts it, rock
 * stands where the sea cut it, and silt settles only on the coast that is doing
 * neither.
 *
 * **Build-time, and out of the tuning overlay for the reason `dunes` is.** The
 * flat is folded into the height field, painted into the one terrain geometry
 * and planted with a scatter of instance matrices; nothing here can move
 * without the scape being generated again.
 *
 * **Every length here is metres and stays metres.** A tidal flat is the height
 * the tide floods to, and that is a fact about the sea rather than about how
 * wide the world is — so an archipelago that grows again must leave all of this
 * alone. The one number that is not a length is {@link SaltingsConfig.arc},
 * which is degrees of the island's own circumference and scales itself.
 */
export interface SaltingsConfig {

  /**
   * Metres above mean water the marsh surface accretes to.
   *
   * The switch, and the only one: at 0 there is no flat, no mud, no turf and no
   * cordgrass anywhere in the archipelago, and there is no boolean beside it
   * saying the same thing again.
   *
   * It wants to sit *inside* half the spring range and *outside* half the neap
   * one — that is the whole definition of a saltings rather than a meadow with
   * a wet edge. Above high water of every tide there is no salt and the turf
   * would be a field; below high water of all of them the marsh never dries and
   * nothing roots in it. Between the two it floods a handful of times a month,
   * which is the ground a marsh is. `saltings.test.ts` states that as a fact
   * about this number and `tide.range`.
   */
  top: number

  /**
   * Metres below mean water the seaward edge of the flat lies at.
   *
   * The other end of the same profile, and the mudflat rather than the marsh:
   * ground the ebb uncovers on the big tides and the neaps never show at all.
   * Written as a depth rather than as a share of the range because that is what
   * it physically is — the sea fills the hollow it is given, and how much of
   * this the tide happens to uncover is the tide's business.
   */
  slob: number

  /**
   * Metres seaward of the waterline the flat reaches.
   *
   * The width of the whole intertidal band, measured from the coast the island
   * had before any silt was laid. Wants to be wide: the point of the landform
   * is a shore the tide crosses in tens of metres rather than in threes, and a
   * narrow flat is just a muddy beach.
   */
  out: number

  /**
   * Metres inland of that waterline the marsh runs on to.
   *
   * Short, and much shorter than {@link SaltingsConfig.out}, because there is
   * very little for it to do: inland of the old waterline the ground is already
   * above the height silt settles to, so all this reaches is the hollows, the
   * inlet the beck has cut and the back of the bay. What it must not do is run
   * so far in that it floods ground the farm is standing on.
   */
  back: number

  /**
   * Metres below mean water past which no silt settles, on the coast's own bed.
   *
   * The ground's veto, and the reason the flat's outer edge is a ragged line
   * rather than an arc somebody drew. Accretion is the sea filling water it has
   * nearly filled already; it does not build a bank out into a sound. Without
   * this the reach alone decides, and on a bearing where the bottom drops away
   * inside the band the flat comes out as a wall of silt standing in open water
   * — which is a landform no coast has and which `scape:map` reads as an island
   * that grew.
   *
   * Measured on the falloff's own bed — `coastBedAt`, the same ground the dune
   * belt and the crag are written against — rather than on the drawn surface,
   * which has the shore shelving in it and answers a different question.
   */
  shoal: number

  /**
   * Half-angle of the flat, in degrees of bearing either side of the mouth.
   *
   * The one number here that is not metres, and it does not want to be: a flat
   * written as a length of coast would have to be re-measured for every island
   * in the archipelago, and they are five different sizes. Degrees of the
   * island's own circumference scale themselves.
   */
  arc: number

  /**
   * Metres of shore between one drainage creek and the next.
   *
   * A marsh is not a table. The water that floods it has to get off it again,
   * and what it cuts on the way out is a branching system of steep-sided
   * gutters — the one feature that stops a flat this level reading as a slab of
   * poured concrete. This is the along-shore wavelength of the field they are
   * cut from.
   */
  gully: number

  /**
   * Metres the drainage creeks cut below the surface around them.
   *
   * Deep enough to hold water at low tide, which is what makes them read from
   * above: a gutter that drains dry is the same colour as the marsh it is cut
   * into. At 0 the flat is unbroken and there is no gutter anywhere on it.
   */
  cut: number

  /**
   * Metres of working water the flat keeps off a berth.
   *
   * The settlement was there first. Every other coastal landform in this scape
   * is laid on an island the farm has already been sited on and simply lets the
   * levelling flatten whatever ends up under a field — which is harmless,
   * because sand under a barley plot is still a barley plot. Silt in a harbour
   * is not harmless: it is the one deposit that takes a *place* away, and the
   * first cut of this landform proved it by silting the meadow island's harbour
   * until the trestle out of it could no longer find a berth with a way out.
   *
   * So the flat gives both banks a working gap, faded to nothing over this
   * distance, and it is sized against the pier rather than guessed — the root
   * stands a shed's footing along the bank from the boathouse, the run itself
   * reaches `pier.reach`, and the offing is measured past the head of that.
   * A gap shorter than the three added together silts water the trestle needs.
   */
  clear: number

  /**
   * Metres above mean water the turf begins at.
   *
   * The line between the two halves of the landform: bare silt below it and
   * salt-marsh sward above. Written as a height rather than as a share of the
   * flat because it is one — what decides whether anything roots is how much of
   * the month the ground spends under salt water, and that is a level.
   */
  sward: number
}

type SCAPE_SALTINGSType = { saltings: SaltingsConfig }

export const SCAPE_SALTINGS: SCAPE_SALTINGSType = {
  // Sized against the tide rather than chosen. `tide.range` is 0.8 m, so half
  // the spring range is 0.4 m and half the neap range is 0.18 m: a marsh top at
  // 0.34 m over mean water is covered by every spring high water and by no neap
  // one, which is the definition of the ground rather than a taste. The seaward
  // edge at 0.3 m under mean water is the mirror of it — uncovered by every
  // spring low water and by no neap one — so the two ends of the profile are
  // the two ends of the tide, and the whole band between them is ground the sea
  // is doing something to.
  //
  // Twenty-six metres out and twelve in puts the mean-water line about half way
  // along the band: the coast advances a dozen metres or so where the bottom
  // lets it, and the flat is nearly forty metres across where it is widest.
  // With a half-arc of thirty degrees that is a sixth of the island's coast, or
  // about forty-five metres of shore on the home island — a side of a bay
  // rather than a patch, and far enough short of the dune belt's own arc that
  // the two could not meet even if the mouth were on the weather shore.
  saltings: {
    top:   0.34,
    slob:  0.3,
    out:   30,
    back:  12,
    shoal: 3.6,
    arc:   30,
    clear: 34,
    gully: 14,
    cut:   0.4,
    sward: 0.1,
  },
}
