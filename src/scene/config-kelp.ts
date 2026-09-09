/**
 * The weed the shallows grow.
 *
 * The fourth section kept outside `config.ts`, and here for the reason the
 * guard, the treeline and the dunes are: a subject, moved whole.
 *
 * Every island in this archipelago shelves out of the water into a band of
 * bright, empty seabed a few metres deep, and that band has been the one part of
 * the scape with nothing living in it. The rocks of the guard carry a wrack line
 * and a lichen crust; the strand above the waterline carries marram and
 * driftwood; between them, in the two to four metres of water a coast like this
 * one is *most* alive in, there was a depth tint and nothing else.
 *
 * A kelp bed is what belongs there, and it is a landform rather than a scatter
 * because it is decided entirely by the water over it:
 *
 * - too shallow and the swell scours the holdfast off the rock every winter
 * - too deep and the light gives out before the frond does
 *
 * Those two are {@link KelpBedConfig.sill} and {@link KelpBedConfig.reach}, and
 * between them they are the whole siting rule. There is no third knob saying
 * where a bed should be, because a bed is wherever the sea is the right depth.
 *
 * ### what the tide does to it, for nothing
 *
 * A kelp plant is longer than the water it grows in. It does not shrink twice a
 * day — it *leans*, and the surplus lies along the surface as canopy, which is
 * the thing anyone standing on a Nordic shore actually sees. So the length of a
 * plant is fixed at the survey, from the depth at mean water, and the only thing
 * that moves is the angle: taut and near-upright at high springs, splayed over
 * with half its length on the surface at low water. Nothing integrates a clock
 * for that — it is `acos(depth / length)` against the published tide, the same
 * subtraction the haul-out makes, and it means a still taken with every speed at
 * zero shows the bed the hour actually puts there.
 *
 * **Every length here is metres and stays metres.** How deep light reaches
 * through cold water and how long a frond grows are facts about the sea rather
 * than about how wide this world is, so an archipelago that grows again must
 * leave all of them alone. The two numbers that are not lengths are
 * {@link KelpBedConfig.over}, a ratio, and {@link KelpBedConfig.bare}, a share.
 */
export interface KelpBedConfig {

  /**
   * Metres of water, at mean tide, the weed gives out at.
   *
   * The light limit, and the switch: at 0 no depth anywhere in the archipelago
   * qualifies, so there is no bed, no plant and no draw — and there is no boolean
   * beside it saying the same thing again. It is also what sets the *biggest*
   * plant in the scape, because a plant is as long as its water is deep times
   * {@link KelpBedConfig.over}.
   */
  reach: number

  /**
   * Metres of water, at mean tide, the weed starts at.
   *
   * The scour limit. Above this is the band the swell works over every winter
   * and the tide bares twice a day — which is the bladderwrack's ground, and it
   * already has it. Written as a depth rather than as a distance from the shore
   * because that is physically what decides it, and because a coast is not a
   * circle: the same depth is four metres out on a steep bearing and thirty on a
   * shallow one, and the bed should follow the water rather than the map.
   */
  sill: number

  /**
   * How much longer a plant is than the water it stands in, as a ratio.
   *
   * The canopy, in one number. At 1 every plant is exactly as long as its own
   * depth, stands straight up and its tip touches the surface from below — a bed
   * that is technically correct and reads as a lawn on the seabed. Above 1 the
   * surplus has nowhere to go but along the surface, and the lean that puts it
   * there is `acos(1 / over)` at mean water: 1.6 is a plant leaning about
   * fifty-one degrees with well over a third of itself trailing on the top of
   * the sea.
   *
   * Under 1 is not forbidden and is not meaningful either — a plant shorter than
   * its water simply stands upright and short, which is what the arccosine
   * already does with it.
   */
  over: number

  /**
   * Metres of seabed a plant is given, along the shore and across the band.
   *
   * A spacing rather than a count, because the band is a different width on
   * every bearing of every island and a count would crowd the steep coasts and
   * strand the shallow ones. What the tier caps is how many of the places this
   * spacing offers are actually planted — see `quality.kelpCount`.
   */
  spacing: number

  /**
   * Metres of shore between one clearing in the weed and the next.
   *
   * The along-shore wavelength of the gaps, and it is the dune belt's `gap` for
   * the same reason that one exists: a band that runs unbroken round every
   * island is a rubber ring, not a kelp bed. Real weed comes in beds with sand
   * and scoured rock between them.
   */
  patch: number

  /**
   * How much of the band the clearings take, 0..1.
   *
   * At 0 the skirt is unbroken all the way round every coast; at 1 there is
   * almost nothing left of it. The switch for the patchiness and the only one.
   */
  bare: number

  /**
   * Metres of open water kept clear of weed round every landing.
   *
   * A harbour is cut. A bed that grew across the one place in the parish where
   * boats come alongside would be cleared by the people who live here within a
   * season, so it is never grown in the first place — which is also what keeps
   * the fleet from mooring in a forest. Measured from the jetty the layout
   * already sited, so it moves when the harbour does.
   */
  clear: number

  /**
   * Radians of extra lean the swell pushes the canopy through.
   *
   * The whole of the motion, and it only ever leans the plant *further* over —
   * never straighter. That is not a stylistic choice: the tip of a leaning plant
   * is exactly at the surface by construction, so a surge that straightened it
   * would lift the head of every plant in the archipelago out of the sea twice a
   * cycle. Leaning further pushes the head down into the water, where a head may
   * always be. 0 is a dead calm and the switch for the motion.
   */
  surge: number

  /**
   * Surges a minute — the rate the swell runs at.
   *
   * Its own rate rather than a share of the wind, because a swell is weather
   * that happened somewhere else a day ago: it runs through a flat calm, so
   * nothing else in the scape stops it and it carries an entry in `STILL` of its
   * own. 0 holds the bed wherever the surge left it.
   */
  sway: number
}

export interface KelpConfig {
  kelp: KelpBedConfig
}

export const SCAPE_KELP: KelpConfig = {
  // Measured against the water rather than chosen, and then measured again
  // against a picture. The islands shelve from the waterline to the nine-metre
  // seabed over a few dozen metres, so a band between 1 m and 4.2 m of water is
  // a strip roughly a dozen metres wide running round every coast — outside the
  // beach the tide bares, inside the depth the light gives out at, and never
  // anywhere a boat is.
  //
  // 1.6 of length over depth is a plant leaning 51° with well over a third of
  // itself lying on the surface. The first cut asked for 1.35 and a band from
  // 0.8 m, which is a legible arrangement on paper and photographed as *stubble*
  // — plants a metre long standing nearly upright in water too shallow to lean
  // them. What a reader sees of a bed is the canopy, so the run that has none
  // has nothing. 2.4 m of spacing against plants one and a half to seven metres
  // long lets the crowns of the deep ones overlap, which is what makes a bed read
  // as one dark mat rather than as a scatter of weed — and a mat is the only
  // thing about this system that carries past forty metres of view.
  //
  // The clearings are 34 m apart and take half the band, so no island wears an
  // unbroken ring and the archipelago carries thirty-three separate beds rather
  // than six skirts — measured, not guessed: at 0.44 the meadow's coast came out
  // as one continuous run all the way round, which is the one shape a kelp bed
  // never has. And 16 m of clear water round every jetty is comfortably more
  // than a rowboat's turning room.
  kelp: {
    reach:   4.2,
    sill:    1,
    over:    1.6,
    spacing: 2.4,
    patch:   34,
    bare:    0.5,
    clear:   16,
    surge:   0.22,
    sway:    5,
  },
}
