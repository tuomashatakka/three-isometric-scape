/**
 * The cliff the sea cut.
 *
 * The fourth section kept outside `config.ts`, and here for the reason the
 * guard, the treeline and the dunes are: a subject, moved whole.
 *
 * Every coast in this scape has so far met the water the same way — the shore
 * band grades the first metres over the waterline into a beach, the dune belt
 * lays sand on the shore the weather is on, and everywhere else the ground
 * simply shelves. Which leaves an archipelago of hard granite with no rock face
 * anywhere on it. A real coast of this kind is two coasts: where the sea meets
 * ground that shelves, it makes a beach out of what it takes; where it meets
 * ground that already stands up to it, it takes the foot away and leaves the
 * rest standing, and what is left is a cliff with a wave-cut platform at the
 * bottom of it.
 *
 * So the crag is sited by the one thing that decides which of those two a coast
 * becomes: **the steepness of the ground the sea arrives at.** The search walks
 * the island's own waterline, measures how fast the bare coast climbs over the
 * first few metres inland on each bearing, and puts the headland on the
 * steepest one it is allowed — never on the shore the sand is on, and never
 * across the beck's own mouth. An island whose every coast shelves gently gets
 * no crag at all, and getting nothing is half of what makes the ones that have
 * one read.
 *
 * **It only ever raises ground.** A cliff is the rock the sea did *not* take,
 * so what the height field lays is a headland standing over the coast beside
 * it — never a bite out of the island. That is the landform's invariant, it is
 * what makes it safe to fold into a ground the farm was already sited on, and
 * `scape:map` reports it as a number: `cut`, which is metres of ground the crag
 * took away, and which is zero.
 *
 * **Build-time, and out of the tuning overlay for the reason `dunes` is.** The
 * headland is folded into the height field, painted into the one terrain
 * geometry and dressed with a scatter of instance matrices; nothing here can
 * move without the scape being generated again, and a slider that needs a
 * rebuild to be seen lies about what a slider does.
 *
 * **Every length here is metres and stays metres.** A cliff is the height a
 * cliff is, and the platform at its foot is as wide as the sea has had time to
 * cut — neither is a fact about how wide the archipelago is, so a world that
 * grows again must leave all of this alone. The two numbers that are not
 * lengths are {@link CragConfig.arc}, which is degrees of the island's own
 * circumference and scales itself, and {@link CragConfig.steep}, which is a
 * gradient.
 */
export interface CragConfig {

  /**
   * Metres the clifftop stands over mean water.
   *
   * An elevation rather than a thickness, and the opposite of how the dune belt
   * is written — for the physical reason the two differ. Sand is a deposit, so
   * it is authored as a depth laid *on* whatever the coast already was; a crag
   * is the coast, cut back, so what is authored is the level the surviving rock
   * stands at. It is also the switch: at 0 there is no headland, no platform
   * and no talus anywhere in the archipelago, and there is no boolean beside it
   * saying the same thing again.
   */
  height: number

  /**
   * Metres of ground the drop is squeezed into.
   *
   * The face, and the one number here the terrain grid can argue with: the
   * ground is drawn at 0.94 m to a segment on desktop and 2.3 m on mobile, so a
   * face authored much under three metres is a slope the phone cannot resolve
   * and draws as an ordinary bank. Three and a half metres for seven of drop is
   * a face of about sixty degrees, which reads as a cliff at every tier and
   * still has a vertex or two across it on the cheap one.
   */
  face: number

  /**
   * Metres of wave-cut platform standing seaward of the foot.
   *
   * The half of this landform that is *not* the cliff, and the half that makes
   * it read as one. A rock face rising straight out of deep water is a sea
   * stack; a cliff has a shelf at the bottom of it — the ground the sea took the
   * face back over, left awash at about the level it did the cutting at. Take
   * this to zero and the headland still stands, with the water against its foot.
   */
  bench: number

  /**
   * Metres over mean water the platform lies at.
   *
   * Small and deliberately not zero: a shore platform is cut at about the level
   * of the tide's own work, so it stands a hand's breadth clear at low water
   * and washes over at high. The tide in this scape swings roughly half a metre
   * either side of mean, which puts a platform at a tenth of a metre under
   * water for much of the cycle and dry on the ebb — which is exactly the band
   * the wrack, the barnacles and the standing gulls belong in.
   */
  awash: number

  /**
   * Metres inland the clifftop runs before the island takes over again.
   *
   * The headland's depth. Inside it the ground is held at the lip; past it the
   * crag's claim fades and whatever the island was doing anyway resumes. It
   * wants to stay well inside the island's own radius for the reason the dune
   * belt's reach does: a crag that reaches the middle is not a coast, it is a
   * plateau.
   */
  back: number

  /**
   * Half-angle of the headland, in degrees of bearing from its middle.
   *
   * Degrees rather than metres, and for the dune belt's reason: a headland
   * written as a length of coast would have to be re-measured for every island
   * in the archipelago and they are six different sizes, while the same
   * half-arc puts a proportionate crag on the home island and on the fell.
   * Smaller than the belt's arc on purpose — sand is delivered to a whole side
   * of an island and a cliff is a *headland*, which is a feature of one part of
   * one coast.
   */
  arc: number

  /**
   * The least the bare coast may climb, in metres of rise per metre inland, for
   * a bearing to carry a cliff.
   *
   * The siting rule, and the whole of it. Measured over the first ten metres
   * inland of the waterline on the ground the falloff left, before the shelving
   * and before the farm. Raise it and the crags retreat to the boldest coasts in
   * the archipelago; lower it and every island grows one, including the flat
   * ones where a rock face would read as a wall somebody built.
   */
  steep: number

  /**
   * Metres of coast between one cleft and the next.
   *
   * A cliff line is not an arc. The sea finds the joints in the rock and works
   * them back into narrow inlets — a geo, on this coast — and those clefts are
   * what stop a headland reading as a bastion somebody laid out with a compass.
   * This is the along-shore wavelength of the field they are cut from.
   */
  geo: number

  /**
   * How deeply the clefts cut, 0..1.
   *
   * At 0 the cliff line runs unbroken from one end of the arc to the other; at
   * 1 the clefts take it back to the coast the island had and the headland is a
   * row of stacks. The switch for the cutting, and the only one.
   */
  notch: number

  /**
   * The most water the platform may be cut in, in metres.
   *
   * The ground's veto, and the reason a shelf is as wide as the sea floor lets
   * it be rather than as wide as {@link CragConfig.bench} asks. A wave-cut
   * platform is rock the sea took down to about its own working level, so it
   * can only be where there was rock within reach of the work — off a coast
   * whose bed falls away four metres in five, the shelf is a ledge, and off one
   * that shelves out slowly it is the full width. Without this the platform
   * stood its outer half on metres of invented rock over open water, which
   * `scape:map` reads as a plunge and a still would never have shown.
   */
  depth: number

  /**
   * Metres of broken rock heaped against the foot of the face.
   *
   * A cliff sheds. What comes off the face lands at the bottom of it and stays
   * there, and the ramp it builds is the difference between a face standing in
   * the sea and a face standing on the platform it cut. Also the density of the
   * boulders the dressing stands on that ramp — at 0 there is no scree and no
   * blocks, and the face meets the platform at a line.
   */
  talus: number
}

type SCAPE_CRAGType = { crag: CragConfig }

export const SCAPE_CRAG: SCAPE_CRAGType = {
  // Measured against the archipelago rather than chosen. Seven metres of lip is
  // a little under the home island's own peak of 8.6 m, so a headland reads as
  // the boldest thing on that coast without becoming the island's skyline — and
  // on the fell, whose summit is fifteen, it is plainly a coastal feature. The
  // face at 3.5 m of run is about 63° of rock, which is a cliff at the near zoom
  // and a hard dark edge at the far one.
  //
  // The half-arc is a fourteenth of the circle each way, so the headland covers
  // about a seventh of the coast: a *place* on the island rather than a side of
  // it, and small enough that the dune belt's third of the circumference and
  // this never have to argue about the same shore.
  //
  // Fifteen metres of top, which is a rim rather than a plateau, and that is a
  // siting decision as much as a shape one: the first cut of this held the lip
  // for twenty-six metres inland, and the tarn search — which looks for the
  // least tilted acre an island has spare — moved the home island's pool out of
  // the high ground and onto the clifftop.
  //
  // The gradient threshold is the number that decides how many islands have one
  // at all. At 0.35 — a coast climbing three and a half metres over its first
  // ten — the bold coasts qualify and the shelving ones do not, which is the
  // point: an archipelago where every island grew a cliff would be an
  // archipelago with no reason for any of them. The ridge island, whose steepest
  // coast climbs 0.18, is the one that gets none.
  crag: {
    height: 7,
    face:   3.5,
    bench:  5,
    awash:  0.12,
    depth:  2.2,
    back:   15,
    arc:    26,
    steep:  0.35,
    geo:    19,
    notch:  0.85,
    talus:  0.9,
  },
}
