/**
 * The wall between the farm and the hill.
 *
 * The sixth section kept outside `config.ts`, and here for the reason the
 * guard, the treeline, the dunes, the kelp and the crag are: a subject, moved
 * whole.
 *
 * Everything walled in this scape so far is walled because of what is *inside*
 * it — hay that must not be grazed, graves that must not be walked over, a crop
 * plot that must not be trodden. The head dyke is the other kind of wall, and on
 * a farm like this one it is the first kind that gets built: it does not enclose
 * anything, it *divides*. The hill is on one side of it and the farm is on the
 * other, and the whole reason a hillside this poor is worth keeping stock on is
 * that one line of stone means nobody has to herd them off the doorstep.
 *
 * Which is why there is no siting knob in here and no reach. A head dyke is not
 * put anywhere — it is drawn along a contour, and the only real decision about
 * it is *how far up the hill that contour is*. That is
 * {@link DykeConfig.headroom}, and it is the section's whole argument. See
 * `landscape/dyke.ts` for the trace and `landscape/dressing-enclosures.ts` for
 * the stones.
 *
 * **Build-time, and out of the tuning overlay for the reason `layout` is.** The
 * line is traced during the survey, the stones are baked into the steading's
 * one merged draw and the ground under them is claimed against the scatter
 * before a single spruce is seeded. Nothing in here can move without the scape
 * being generated again, and a slider that needs a rebuild to be seen lies
 * about what a slider does.
 *
 * **Every length here is metres and stays metres.** How high a drystone wall is
 * built and how wide a gate is are facts about stone and about people, so a
 * world that grows again must leave all of it alone. {@link DykeConfig.headroom}
 * is the one number that is not a length, and it is a fraction of the island's
 * own rise — which is what scales it.
 */
export interface DykeConfig {
  dyke: {

    /**
     * Where between the farmyard's ground and the summit the line is drawn,
     * 0..1.
     *
     * The section's whole argument, and the one number worth turning. At 0 the
     * wall would be laid along the farm's own doorsteps and at 1 round the
     * cairn on the top; the interesting band is the third of the hill nearest
     * the bottom, because that is where a slope stops being worth breaking.
     *
     * A *share of the island's own rise* rather than a height over the sea, and
     * that is what lets one number stand a dyke in the right place on the ridge
     * island, whose summit is six and a half metres up, and on the shield, whose
     * summit is twenty-six. Written as a height it would put the shield's wall
     * on the shore and the ridge's on the cairn.
     *
     * At 0.38 five of the archipelago's six islands come back with a wall — rings
     * of between fifty and two hundred and twenty metres, of which thirty-three
     * to two hundred and eleven actually stand. The farmyard is outside every
     * one of them and the summit inside every one of them, and the walled hay
     * meadow falls inside four, which is where a hain belongs relative to a head
     * dyke. The shield is the island that gets none: its contour at any headroom
     * runs under the ice cap, and a drystone wall under a glacier is not a wall.
     */
    headroom: number

    /**
     * Metres of dry ground a course of stone needs under it.
     *
     * Higher than the smokehouse's, and for a different reason: this is not a
     * building that would get wet, it is a wall that would look *silly*. The
     * contour the ring follows runs down to the waterline on any bearing where
     * the hill meets the sea, and without a freeboard the last few stations walk
     * out into the shallows and stand there. Half a metre puts the end of the
     * run on the bank above the water, which is where a dyke actually stops.
     */
    freeboard: number

    /**
     * Metres of wall a gate takes out of the run.
     *
     * The gate prop spans 2.6 m, so this is that plus a jamb's width either
     * side. It is deliberately not the pasture's `pastureGateway`, which is an
     * *angle*: a gap measured in degrees is a gap that gets wider as the
     * enclosure does, and a head dyke's ring is thirty times the area of a
     * churchyard's.
     */
    gateway: number

    /**
     * Metres the wall stands over the ground.
     *
     * It is the switch: at 0 no dyke is surveyed anywhere in the archipelago,
     * the gates go with it, and the ground it claimed goes back to the scatter.
     * There is no boolean beside it saying the same thing again. The refusal is
     * taken in the *survey* rather than by the dressing skipping the geometry,
     * so `scape:map` and the scene agree about whether there is a wall.
     *
     * Deliberately *taller* than the 0.92 m the enclosure walls default to, and
     * the difference is the difference between the two kinds of wall. A
     * churchyard wall marks a boundary and a garden wall keeps a dog in; a head
     * dyke has to turn a hill ewe that has spent all summer deciding to be
     * somewhere else, so it is built to about chest height and it is the stoutest
     * drystone on the island. It reads that way too — every centimetre of it is
     * a wider stone, and at this length that is the difference between a march
     * across a hillside and a line of field clearance.
     */
    height: number
  }
}

export const SCAPE_DYKE: DykeConfig = {

  // A third of the way up, and the number was measured rather than chosen. The
  // whole 0.28 .. 0.55 band was swept against the archipelago: below 0.32 the
  // rings on the sound and the fell reach out past the mill and the pasture and
  // come back half gaps, and above 0.44 the ridge island's ring shrinks under
  // the thirty metres that separates a march from a sheepfold and is refused
  // outright. 0.38 is the middle of what is left, and it is where five of the
  // six islands carry a wall.
  //
  // The freeboard is the dune belt's own lowest ground rounded up: sand blows to
  // within a few millimetres of the waterline on the weather shore, so a dyke
  // that ran down onto the belt would end in the beach without this.
  dyke: {
    headroom:  0.38,
    freeboard: 0.5,
    gateway:   3.2,
    height:    1.1,
  },
}
