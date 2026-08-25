/**
 * The order the transparent half of the scape is painted in.
 *
 * Three sorts opaque objects front-to-back and transparent ones back-to-front,
 * but the back-to-front part is a *heuristic*: it compares one projected point
 * per object — the centre of its bounding sphere — and two overlapping sheets
 * have no single depth to be sorted by. So every transparent layer here names
 * its place instead of hoping the sort guesses right.
 *
 * The rule three actually applies is `groupOrder`, then `renderOrder`, then that
 * projected depth, then object id (`reversePainterSortStable`). Anything that
 * leaves `renderOrder` at its default of 0 falls through to the depth compare —
 * and *that* is what put the lighthouse beams behind the sea. The beams carry a
 * hand-set bounding sphere centred on the lanterns, far out at the edge of the
 * map; the water's is its geometry's, near the origin. Rotating the camera
 * flipped which of those two points projected nearer, so the beams appeared over
 * land and vanished over water at half the headings on the compass.
 *
 * Spaced by ten so a layer can be slipped between two others without renumbering
 * the rest, and so a layer with several sheets can index off its own base.
 *
 * Depth is not an alternative to this. Every one of these draws with
 * `depthWrite: false`, which is correct — a transparent surface that wrote depth
 * would occlude the transparent surfaces behind it — and it is exactly why the
 * ordering has to be stated rather than measured.
 */
export const LAYER = {

  /** The sea. The floor of the transparent stack, and everything is over it. */
  water: 0,

  /** Steam coming off the water, under the fog that sits on the land. */
  seaSmoke: 10,

  /**
   * The lighthouse beams.
   *
   * Over the water, under the mist — which is where they already were relative
   * to the mist, and the half of the relationship that was never broken. The
   * beams are additive, so the fog in front of them dilutes them the way fog in
   * front of a light should.
   */
  beacon: 20,

  /** Ground fog. Sheets index up from here; the upright slices sit above those. */
  mist: 30,

  /**
   * Hearth smoke, over the ground fog rather than under it.
   *
   * The one ordering decision this layer has to make, and it goes the way the
   * thing itself does: a plume leaves the chimney *above* where the fog lies and
   * climbs away from it, so a column painted behind the mist would be a fire
   * burning under its own valley. Under the gulls, which fly twenty metres over
   * the highest of it.
   */
  hearth: 35,

  /**
   * The gulls.
   *
   * Over the ground fog they fly above and under the rain that falls past them.
   * A flock cruises at twenty-odd metres, which is well over the highest ground
   * in the archipelago — so a wing is never behind a hill, and the depth write
   * it gives up costs nothing.
   */
  birds: 40,

  /** Falling weather, over the fog and under the deck it falls from. */
  rain: 50,

  /** The cloud deck. Layers index up from here. */
  clouds: 60,

  /**
   * Auroral veils, over the deck.
   *
   * Weather is a kilometre off the ground and this is a hundred, so the clouds
   * pass beneath it.
   */
  aurora: 70,

  /** The star wheel, and the moon in front of it. Furthest away, painted last. */
  stars: 80,
  moon:  81,
} as const
