/**
 * The rock the headland left behind.
 *
 * The seventh section kept outside `config.ts`, and here for the reason the
 * guard, the treeline, the dunes, the kelp, the crag and the dyke are: a
 * subject, moved whole.
 *
 * `config-crag.ts` gave this coast the first half of what a hard shore does —
 * the sea takes the foot out from under standing rock and the rest stays up. A
 * cliff is not the end of that story, though, it is the middle of it. The sea
 * goes on working the weakest line in the face, and a weak line worked long
 * enough becomes a geo, then a cave, then an arch; and when the arch falls, the
 * seaward end of it is left standing in open water with nothing joining it to
 * the land. That is a stack, and it is the one landform in this scape that is
 * *made* of the absence between itself and the island.
 *
 * Which is why the whole section is written against the crag rather than
 * against the island. There is no bearing in here, no reach and no siting
 * score: a stack cannot be put anywhere a headland is not, and on the headland
 * it can only be at the one place the rock was weakest — `landscape/crag.ts`
 * already has that field, because it is the same field the clefts are cut with.
 * What is left to decide is how much of the old clifftop survives
 * ({@link StackConfig.stature}), how much rock is in it ({@link
 * StackConfig.girth}), and how much water the sea has opened behind it
 * ({@link StackConfig.gut}).
 *
 * **It only ever raises ground**, exactly as the crag does and for the same
 * reason: a stack is rock the sea did not take. The gut is not cut, it is the
 * sea floor that was always there — which is what makes the landform safe to
 * fold into a coast the harbour and the waterways were already solved against.
 *
 * **Build-time, and out of the tuning overlay for the reason `crag` is.** The
 * column is folded into the height field and painted into the one terrain
 * geometry; nothing here can move without the scape being generated again, and
 * a slider that needs a rebuild to be seen lies about what a slider does.
 *
 * **Every length here is metres and stays metres**, except
 * {@link StackConfig.stature}, which is a share of the headland's own lip and
 * therefore scales itself with each island's crag. How much rock is in a pillar
 * the sea left standing is not a fact about how wide the archipelago is.
 */
export interface StackConfig {

  /**
   * Share of the headland's own lip height the crown keeps, 0..1.
   *
   * The section's whole argument, and it is a *share* rather than a height for
   * the reason the head dyke's headroom is: a stack is the clifftop it was cut
   * out of, so on the fell, whose lip stands nine metres over the water, the
   * pillar has to be taller than the one off the home island's six. Written as
   * metres it would be a pillar overtopping one headland and a stump under
   * another.
   *
   * Under 1 by construction and not by luck. A stack is the old cliff *after*
   * the weather has had the top of it for as long as the sea has had the bottom,
   * so it always stands a little below the lip it came from — see the test
   * beside `landscape/stack.ts`, which states that as a fact rather than an
   * intention.
   *
   * It is also the switch: at 0 there is no pillar off any headland in the
   * archipelago, and there is no boolean beside it saying the same thing again.
   */
  stature: number

  /**
   * Mean plan radius at the foot, in metres.
   *
   * Mean, because the plan is warped — a column of constant radius is a chimney
   * pot, and this coast is jointed granite. The warp is the module's own and
   * not a knob: how ragged a pillar is in plan carries no tuning decision that
   * this number does not already carry better.
   *
   * Sized against the terrain grid as much as against the sea. The home
   * island's patch is drawn at 0.68 m a quad on the ultra tier and 2.33 on the
   * mobile one, so ten metres of rock across is fifteen quads and four — enough
   * for the warp and the taper to be shape on the first and a recognisable
   * blocky pillar on the second. Much under it and the *mobile* tier has two
   * quads to draw a landform with, and what it draws is a spike belonging to the
   * tessellation rather than to the rock.
   */
  girth: number

  /**
   * Metres of open water between the platform's outer edge and the foot.
   *
   * The landform's whole claim, in one number: a pillar with no water behind it
   * is a promontory. Measured from the edge of the crag's own wave-cut platform
   * rather than from the waterline, because the platform is the ground the sea
   * has already taken down and a stack standing on the end of it is a stack
   * standing on the island.
   *
   * What the scape reports is not this. `scape:map` walks the drawn ground back
   * from the foot toward the coast and prints the submerged run it actually
   * finds, which is the same instrument the peat face's `standing` is: the knob
   * says what was asked for, the survey says what the ground gave.
   */
  gut: number

  /**
   * Metres of water the foot needs under it, or there is no stack.
   *
   * The refusal, and the one that does the work. A headland whose platform runs
   * out into shallows has nowhere to leave a pillar — anything the sea cut off
   * there would be a skerry, and `landscape/skerry.ts` already puts those in the
   * open water where they belong. Read off the bare falloff seabed rather than
   * the drawn one, for `coastBedAt`'s reason: the shore band flattens the first
   * metres under every waterline in the archipelago, so a depth read off the
   * terrain would say every coast has the same water off it.
   */
  water: number

  /**
   * Metres the crown falls across the column, seaward.
   *
   * The bedding dip. A flat top reads as a cut-off cylinder from the one angle
   * this scape is ever seen from; a metre of fall across ten of rock reads as a
   * block that was tilted before the sea ever got to it, and it is the cheapest
   * detail in the landform — one dot product inside a function that already has
   * the vector.
   */
  dip: number

  /**
   * Metres of fallen rock heaped round the foot.
   *
   * The same term the crag's `talus` is and for the same reason: a column that
   * met the sea floor at a corner would be a pillar standing on a table. What
   * comes off a stack lands at the bottom of it, and on a shore this exposed
   * most of it stays there.
   */
  talus: number
}

type SCAPE_STACKType = { stack: StackConfig }

export const SCAPE_STACK: SCAPE_STACKType = {
  // Measured against the archipelago rather than chosen. Seventeen twentieths
  // of the lip puts the home island's pillar at 5.95 m over mean water against
  // a *drawn* clifftop of 6.28 — plainly the same rock, and plainly the shorter
  // of the two, which is what a stack looks like from the headland you are
  // standing on. The band above that is closed by the cliff rather than by
  // taste: the lip the share is taken of is the level the crag was *authored*
  // to stand at, and the weakness field takes up to a quarter off what actually
  // gets drawn, so a stature much past this stands a pillar over the headland it
  // came out of.
  //
  // Five metres of girth against six of crown is the proportion, and it is the
  // one number traded against the mobile tier's grid rather than chosen by eye:
  // a real stack is slimmer than this, and slimmer than this is four quads of
  // terrain on the tier that has the fewest.
  //
  // The gut is the number that was swept. Under about five metres the pillar
  // reads as the end of the platform at the far zoom, and past about ten the
  // seabed off most of these headlands has fallen away deeper than `water` on
  // every bearing and the archipelago comes back with no stacks at all. Seven
  // is the middle of the band that leaves four of the five headlands with one.
  //
  // The depth is deliberately just over the draught the fleet is routed to keep
  // (`boats.clearance`): a pillar standing in less water than a boat needs is a
  // pillar standing in a fairway, and the waterway solver reads the ground this
  // lays before it routes anything.
  stack: {
    stature: 0.85,
    girth:   5,
    gut:     7,
    water:   1.2,
    dip:     1.1,
    talus:   0.9,
  },
}
