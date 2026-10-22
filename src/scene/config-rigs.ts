/**
 * The ridges the plough leaves, and the crop standing on them.
 *
 * The twenty-eighth section kept outside `config.ts`, and here for the reason
 * the howe, the snow fence and the shieling are: a subject, moved whole.
 *
 * The farm has had fields since the layout had plots in it, but only as a
 * colour — `layout.plots` are levelled rectangles and the terrain painter
 * lerps them toward `palette.tilled`, which from the pulled-out zoom reads as
 * four brown rectangles and from the close one reads as four brown rectangles
 * seen from nearer. Nothing in them says a plough has been through, and a
 * field with no direction in it is the one piece of this farm that does not
 * look worked.
 *
 * A rig is the direction. Ridge-and-furrow is what a single-furrow plough
 * leaves behind when it is turned always the same way down a strip: the soil
 * walks inward year on year, the middle stands proud, and the hollow between
 * two rigs carries the water off. It is the oldest field pattern in the north
 * and the only one that survives being seen from four hundred metres up,
 * because what it makes is *corduroy* — a row of parallel crowns that catch a
 * low sun on one flank and shade on the other. See `landscape/rigs.ts` for the
 * geometry and `landscape/terrain.ts` for where it merges.
 *
 * **Build-time, and out of the tuning overlay for the reason `howe` is.** The
 * ridges are ribbons baked into the terrain's one merged draw at generation,
 * so a slider here would need a rebuild to be seen, and a slider that needs a
 * rebuild lies about what a slider does.
 *
 * **Metres, except the one that is a share.** A rig is a *plough's* width, not
 * an island's: {@link RigsConfig.rigs.spacing}, `crown`, `headland` and
 * `margin` are the dimensions of a day's work with one horse and stay metres
 * on an archipelago of any size. `crop` is the only share.
 *
 * **There is no season in here, and that is the point.** The crop is painted
 * one green and the year does the rest — `props/material.ts` weighs its
 * seasonal tint by how far a fragment's albedo leans green, so a sown rig goes
 * straw in autumn, takes lying snow on its crown and comes back in spring
 * without this section owning a single second of time. A `cropSummer` beside a
 * `cropWinter` here would be a second opinion about the year, and the two
 * would disagree on the first retune.
 */
export interface RigsConfig {
  rigs: {

    /**
     * Metres from one rig's crown to the next.
     *
     * **The switch, and the only one.** There is no `enabled` here for the
     * reason there is none anywhere: the rig count across a plot is its width
     * divided by this, so 0 is a farm whose fields were never ploughed —
     * reached through the arithmetic rather than around it.
     *
     * 2.1 m is a rig a person could stand in the furrow of and touch the crown
     * of either side, which is about what one horse and one mouldboard make.
     * Widening it empties the field until the plots read as striped rather than
     * worked; narrowing it past a metre makes a washboard no plough could have
     * left and no camera in this scape can resolve.
     */
    spacing: number

    /**
     * Metres the crown of a rig stands above the furrow beside it.
     *
     * The whole visible claim of the system, and it is geometry rather than
     * paint because that is the only way it survives the light changing: a
     * painted stripe looks the same at noon and at dusk, and a raised one is
     * lit on its southern flank at noon and edge-on at dusk. 0 is a field that
     * has been ploughed flat — the crop still stands on it, and the corduroy
     * is gone.
     *
     * 0.17 m is a working rig rather than the metre-deep relic ones that
     * survive under pasture. Pushing it past a quarter of {@link spacing}
     * makes ridges with sides too steep for a horse to walk, and they begin to
     * read as drainage pipe rather than as ground.
     */
    crown: number

    /**
     * Metres of unploughed turning ground at each end of every rig.
     *
     * The headland: the strip a team needs to swing the plough round on, and
     * the reason a rig stops short of its own field boundary rather than
     * running into the wall. It is also what keeps the ribbons off the fence
     * line, where a raised end would otherwise poke through a post.
     *
     * 1.6 m is a horse and a plough turning. 0 runs every rig to the field
     * edge, which is a field nobody could have worked.
     */
    headland: number

    /**
     * Metres of plot edge left unploughed along the sides, in metres.
     *
     * The sideways twin of {@link headland}, and a different measurement for a
     * different reason: the ends need room to turn, the sides only need the
     * outermost furrow not to be the field boundary itself. Smaller than the
     * headland for exactly that reason.
     */
    margin: number

    /**
     * How far the crown of a rig leans toward `palette.crop`, 0..1.
     *
     * 0 is fallow — turned ground with the relief on it and nothing growing,
     * which is a real state for a third of any infield and the thing to set
     * this to if the rigs ever need to be judged as shape alone. 1 is a crop
     * standing thick enough to hide the soil it is in.
     *
     * Only the crown leans. The furrow keeps whatever the terrain painter
     * already decided, which is what makes the seam at the ribbon's edge
     * invisible and what makes a half-grown crop read as rows rather than as a
     * lawn.
     */
    crop: number
  }
}

export const SCAPE_RIGS: RigsConfig = {
  rigs: {
    spacing:  2.1,
    crown:    0.17,
    headland: 1.6,
    margin:   0.8,
    crop:     0.72,
  },
}
