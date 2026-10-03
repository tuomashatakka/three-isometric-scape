/**
 * The creel ground, and the gear left lying on it.
 *
 * A section kept outside `config.ts` for the reason the kelp, the guard and the
 * dunes are: a subject, moved whole — and because `config.ts` is within fifty
 * lines of the module ceiling and a tenth section inlined there would take it
 * over.
 *
 * Every harbour in this archipelago has had boats in it since the fleet was
 * routed, and not one sign that anybody fishes. The boats pass through; the sea
 * they pass over is empty from the kelp band to the horizon. A creel fleet is
 * what belongs in that gap and it is the cheapest possible thing to put there:
 * a string of pots is on the bottom, where nothing has to be drawn, and what
 * the scape shows of it is a line of floats.
 *
 * ### it is a depth and a distance from home, and nothing else
 *
 * Lobster and crab are on broken rock in a few metres of water, so the ground
 * is found the way the kelp bed is found — by how much sea is over it, between
 * {@link CreelGroundConfig.sill} and {@link CreelGroundConfig.deep}. The second
 * rule is the only one that is about people rather than about the sea: a string
 * is shot within {@link CreelGroundConfig.range} metres of the harbour that
 * works it, because a half-decked boat hauling by hand does not steam an hour
 * to its gear.
 *
 * There is no third knob saying where a string should lie. A fleet is wherever
 * the water is the right depth and the row is still within reach of home.
 *
 * ### what the tide and the wind do to it, for almost nothing
 *
 * A float rides the surface. That is the entire coupling and it is a maximum
 * rather than an integral: the sea is where the published `TideState` says it
 * is, the seabed is where the survey left it, and a float whose water has gone
 * is sitting on the ground instead — which is what a creel ground actually
 * looks like at low springs on a shelving coast, and which no still of this
 * scape could previously show at all.
 *
 * The wind lies it over. How far is {@link CreelGroundConfig.heel} times
 * `wind.strength`, so the gust that whitens the sea also lays the marks down
 * with it and `STILL` already holds them upright. The only clock the system
 * carries of its own is {@link CreelGroundConfig.bob}.
 *
 * **Every length here is metres and stays metres.** How deep a pot is set, how
 * far apart they are shot on one backline and how far a small boat goes from
 * its own harbour are facts about the fishery rather than about how wide this
 * world is, so an archipelago that grows again must leave all of them alone.
 */
export interface CreelGroundConfig {

  /**
   * Metres of water, at mean tide, a pot is shot in at the shallow end.
   *
   * Inside this is the band the swell works over every winter, which takes gear
   * off the ground and puts it on the beach. Written as a depth rather than as
   * a distance from the shore for the kelp sill's reason: the same depth is
   * four metres out on a steep bearing and thirty on a shelving one, and the
   * gear follows the water rather than the map.
   */
  sill: number

  /**
   * Metres of water, at mean tide, a pot is shot in at the deep end.
   *
   * The switch, and the only one: at 0 no water anywhere in the archipelago is
   * between the sill and this, so there is no string, no float and no draw —
   * and there is no boolean beside it saying the same thing again. Past the
   * shelf there is more rope to haul than there is anything worth hauling it
   * for, which on these coasts is a couple of bays offshore.
   */
  deep: number

  /** Metres between one pot and the next on a backline. */
  spacing: number

  /**
   * Pots on the longest string.
   *
   * A cap rather than a count. What a string actually carries is however many
   * of these the ground will take before the water goes over {@link deep} or
   * the row runs past {@link range} — so a shelving coast gets a long fleet and
   * a steep one gets a short one, and neither is written anywhere.
   */
  pots: number

  /**
   * Metres from the harbour the gear is worked within.
   *
   * The one rule here that is about people. **Metres, and they stay metres** —
   * how far somebody rows or putters to haul forty pots by hand is a fact about
   * the boat and the arms in it, so a world that grows does not grow this.
   */
  range: number

  /**
   * Metres of open water kept clear of gear round every landing.
   *
   * A harbour mouth is kept clear for the kelp bed's reason, and rather more
   * sharply: weed in the fairway is a nuisance and a backline in it is a rope
   * round somebody's propeller. Measured from the jetty the layout already
   * sited, so it moves when the harbour does.
   */
  clear: number

  /**
   * Radians a float is laid over at full strength of wind.
   *
   * 0 is a mark standing straight up in any weather, and the switch for the
   * heel. It is multiplied by `wind.strength` rather than carrying a strength
   * of its own — the scape has one wind — which is also what puts it in `STILL`
   * for free, by way of the two lines already there.
   *
   * It is scaled again by how much rope is under the float: a mark in six
   * metres of water has the scope to lie right over, and one in two has not.
   * That is not a knob, it is the depth the survey already measured.
   */
  heel: number

  /**
   * Metres the swell lifts and drops a float.
   *
   * The amplitude, and the other switch: at 0 the fleet rides the tide and
   * nothing else. Small on purpose — a float that moved a metre would be
   * reporting a sea state this scape's own surface never shows.
   */
  lift: number

  /**
   * Bobs a minute — the rate the swell runs at.
   *
   * Its own rate rather than a share of the wind, for the reason the kelp's
   * surge has one: a swell is weather that happened somewhere else a day ago
   * and runs through a flat calm, so nothing else in `STILL` stops it and it
   * carries an entry of its own. 0 holds every float wherever the swell left
   * it.
   */
  bob: number
}

export interface CreelConfig {
  creel: CreelGroundConfig
}

export const SCAPE_CREEL: CreelConfig = {
  // Measured against the ground the scape actually draws rather than chosen.
  // The islands shelve from the waterline to the nine-metre seabed over a few
  // dozen metres, so a band between 2 m and 6.5 m of water starts just outside
  // the kelp's own reach — gear is not shot into a forest — and stops before
  // the bottom drops away into the sounds the ferry runs down.
  //
  // 8 m between pots over at most 11 of them is a backline up to eighty metres
  // long, which is a real small-boat fleet and, at the home island's forty-four
  // metre land radius, a row that reads as a *line* from the default pose
  // rather than as three dots. 160 m of range is about as far as any of these
  // harbours can go before it is working another island's ground, and 20 m of
  // clear water round the jetty is comfortably outside a rowboat's turning room
  // and the weed's own clearing both.
  //
  // 0.5 rad of heel at a full wind is a mark lying nearly thirty degrees over,
  // which is what a float on a short scope does in a lop; the depth scaling
  // takes the shallow end of the ground to about half that. 0.07 m of lift at
  // 11 bobs a minute is a sea the surface's own 0.18 m swell could have made.
  creel: {
    sill:    2,
    deep:    6.5,
    spacing: 8,
    pots:    11,
    range:   160,
    clear:   20,
    heel:    0.5,
    lift:    0.07,
    bob:     11,
  },
}
