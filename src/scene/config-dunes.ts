/**
 * The sand the wind piled up.
 *
 * The third section kept outside `config.ts`, and here for the reason the guard
 * and the treeline are: a subject, moved whole. Every coast in this scape
 * shelves out of the water at the same angle on every bearing — `terrain.shoreBand`
 * grades the first metres over the waterline into a beach and that beach is the
 * same beach all the way round the island. Which is the one thing a sandy coast
 * is not. Sand does not stay where the sea put it: the wind lifts it off the dry
 * strand and carries it inland until something stops it, and what it builds
 * there is a *ridge*, standing a few metres over the beach it came off, with a
 * thinning sheet of blown sand running on behind it.
 *
 * So the belt has a side. It is on the shore the weather is on — `wind.bearing`
 * read backwards, the same upwind walk the treeline takes — because that is the
 * shore the sea delivers sand to and the wind then blows inland. The lee coasts
 * get nothing, and getting nothing is half of what makes the windward one read.
 *
 * **Build-time, and out of the tuning overlay for the reason `treeline` is.**
 * The belt is folded into the height field, painted into the one terrain
 * geometry and planted with a scatter of instance matrices; nothing here can
 * move without the scape being generated again, and a slider that needs a
 * rebuild to be seen lies about what a slider does.
 *
 * **Every length here is metres and stays metres.** A dune is the height a dune
 * is, and the distance it stands inland of the waterline is a fact about sand
 * and wind rather than about how wide the world is — so an archipelago that
 * grows again must leave all of this alone. The one number that is *not* a
 * length is {@link DuneBeltConfig.arc}, and it is degrees of the island's own
 * circumference, which scales itself.
 */
export interface DuneBeltConfig {

  /**
   * Metres of sand standing over the ground at the ridge.
   *
   * A thickness, not an elevation — the sand is laid *on* the coast the island
   * already has, so a ridge over a rising beach ends up higher than a ridge over
   * a flat one, which is what a dune does. It is also the switch: at 0 there is
   * no belt, no paint and no marram anywhere in the archipelago, and there is no
   * boolean beside it saying the same thing again.
   */
  height: number

  /**
   * Metres inland of the waterline where the sand begins.
   *
   * The dry strand: the band the sea still reaches on a spring tide and the
   * storms rework every winter, which is why nothing accumulates on it. Written
   * as distance from the coast rather than as height above the water because
   * that is what it physically is — the beach is what the tide can reach, and
   * how high that ground happens to stand is the shore band's business.
   */
  foot: number

  /**
   * Metres inland of the waterline where the blown sand gives out.
   *
   * The whole belt is between here and {@link DuneBeltConfig.foot}, so this is
   * the depth of the system rather than its height, and it wants to stay well
   * inside the island's own radius: a belt that reaches the middle is not a
   * dune coast, it is a desert.
   */
  back: number

  /**
   * Where the ridge stands between the foot and the back, 0..1.
   *
   * Near the seaward end on purpose. A dune builds where the wind first loses
   * the speed to carry what it picked up, which is a short way in from the
   * strand — so the profile is steep on the sea side and long on the land side,
   * and that asymmetry is most of what makes a ridge read as one.
   */
  peak: number

  /**
   * The exponent on the landward fall, under 1.
   *
   * The apron, and the second half of the asymmetry above. At 1 the sand falls
   * away inland exactly as steeply as it rose, which is a symmetrical bank; the
   * lower this goes the further a thinning sheet of sand runs on behind the
   * ridge before it gives out, which is the sand plain a real dune coast carries
   * on its back.
   */
  apron: number

  /**
   * Metres above mean water the blown sand gives out at.
   *
   * The ground's second veto, and the one number in here that is a height rather
   * than a distance along the ground. Sand is carried up off the strand and
   * dropped; how far *in* it gets is {@link DuneBeltConfig.back}, and how far
   * *up* it gets is this, and neither implies the other. Without it a belt on a
   * low island reaches the island's own high ground and the summit turns out to
   * be made of sand — which `scape:map` reads as a peak that moved, and which
   * `landscape/dunes.ts` explains at `CLIMB_FADE`.
   */
  climb: number

  /**
   * Half-angle of the belt, in degrees of bearing from the weather shore's
   * middle.
   *
   * The one number here that is not metres, and it does not want to be: a belt
   * written as a length of coast would have to be re-measured for every island
   * in the archipelago, and they are five different sizes. Degrees of the
   * island's own circumference scale themselves — the same half-arc puts a
   * proportionate belt on the home island and on the fell.
   */
  arc: number

  /**
   * Metres of shore between one blowout and the next.
   *
   * A dune ridge is not a wall. The same wind that built it cuts through it
   * wherever the marram fails to hold, and the gaps — blowouts — are what stop
   * the belt reading as an embankment somebody bulldozed along the coast. This
   * is the along-shore wavelength of the field those gaps are cut from.
   */
  gap: number

  /**
   * How deep the blowouts cut, 0..1.
   *
   * At 0 the ridge runs unbroken from one end of the arc to the other; at 1 the
   * gaps take it to bare ground and the belt is a row of hillocks. The switch
   * for the gapping, and the only one.
   */
  blowout: number
}

type SCAPE_DUNESType = { dunes: DuneBeltConfig }

export const SCAPE_DUNES: SCAPE_DUNESType = {
  // Measured against the ground rather than chosen. The home island's dry land
  // reaches 44 m from its middle, so a belt running 3 m to 24 m inland of the
  // waterline is the outer half of the coastal fringe and leaves the farm, the
  // track and the pasture on ground that has never seen sand. The ridge at 0.3
  // of that stands about nine metres in from the strand, which is where the
  // marram line sits on a real machair coast, and 2.4 m of sand over a beach
  // that is already a metre up is a ridge you can see from the far zoom without
  // it becoming the island's skyline.
  //
  // The half-arc is a little under a sixth of the circle each way, so the belt
  // covers about a third of the coast — enough that a reader sees a *side* of
  // the island rather than a patch, and far enough short of half that the lee
  // shores stay obviously bare.
  dunes: {
    height:  2.4,
    foot:    3,
    back:    24,
    peak:    0.3,
    climb:   3,
    apron:   0.6,
    arc:     58,
    gap:     46,
    blowout: 0.55,
  },
}
