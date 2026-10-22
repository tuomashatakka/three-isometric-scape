/**
 * The rotation the fields turn in — which plot is under corn this year, which
 * is down to grass, and which is lying fallow.
 *
 * The twenty-ninth section kept outside `config.ts`, and here for the reason
 * the rigs, the howe and the shieling are: a subject, moved whole.
 *
 * The farm has had ploughed fields since `config-rigs.ts` landed, and every one
 * of them is doing the same thing. Four plots on the home island, fifteen
 * across the archipelago, each levelled, each painted toward `palette.tilled`,
 * each carrying rigs crowned the same height with the same crop standing on
 * them. From the pulled-out zoom that is one brown block with corduroy on it,
 * and the one thing it does not look like is a farm — because no farm in the
 * north ever cropped the same ground two years running and lived.
 *
 * A **rotation** is what it did instead. The infield is cut into as many
 * courses as the land can stand; each field walks round them a year at a time,
 * and at any one instant the fields are in *different* courses. That is the
 * whole visible claim of this section: the infield stops being one colour. One
 * plot is green with standing corn, its neighbour is bare turned earth resting,
 * the one past that has been down to grass long enough for the rigs under it to
 * have settled and gone green over.
 *
 * **Build-time, and out of the tuning overlay for the reason the rigs are.**
 * Which course a field is in is decided when its plot is sited, in
 * `landscape/layout.ts`, and baked into the terrain's one merged draw at
 * generation. A slider here would need a rebuild to be seen, and a slider that
 * needs a rebuild lies about what a slider does.
 *
 * **Counts and shares, and not one metre in it.** A course is a year, not a
 * distance: {@link CroppingConfig.cropping.courses}, `ley` and `fallow` count
 * years of a cycle and {@link CroppingConfig.cropping.leyCrown} and `leyGrass`
 * are shares of something the rigs already own. Nothing here follows
 * `archipelago.worldSize`, because a rotation on a bigger island is still three
 * years long.
 *
 * **There is no season in here either.** A course is what a field is doing this
 * *year*; the year itself is `season.ts`, and it tints the corn on a corn plot
 * exactly as it tints everything else green. A field does not change course
 * while the clock runs — the scape is one year of a farm, and `season.ts` is
 * explicit that the year is a surface response and never a change of shape.
 */
export interface CroppingConfig {
  cropping: {

    /**
     * Years in the rotation — how many courses a field walks round.
     *
     * **The switch, and the only one.** There is no `enabled` here for the
     * reason there is none anywhere: a cycle one year long has every field in
     * the same course as every other, which is the single-crop infield this
     * section was written to break, reached through the arithmetic rather than
     * around it. 0 is the same thing, clamped.
     *
     * 4 is the northern infield and it is the plot count on the home island,
     * which is not a coincidence: a cycle as long as the farm has fields is the
     * one length at which every field is in a different course and the whole
     * rotation is on the ground at once. Two years of corn, one of grass, one
     * of rest. Pushing it past the plot count leaves a course no field happens
     * to be in — a farm with more years in its rotation than fields to put them
     * in, which is a real farm and still reads as a missing field rather than
     * as a resting one.
     */
    courses: number

    /**
     * Courses of the cycle that are down to grass.
     *
     * A ley is sown grass, left two or three years to put the heart back in the
     * ground before it is broken again. Visually it is the one course that is
     * *green at the ground* rather than at the crop, and the rigs under it are
     * old: see {@link leyCrown} and {@link leyGrass} for what that does to them.
     *
     * Counted in courses rather than given as a share, because a rotation is a
     * whole number of years and a farm with two thirds of a year in grass is
     * not a thing anybody worked.
     */
    ley: number

    /**
     * Courses of the cycle that are ploughed and left bare.
     *
     * The fallow: turned ground with the relief of the plough on it and nothing
     * growing. It is the state `rigs.crop` at 0 already described, now reached
     * by a field rather than by the whole farm, and it is the course that reads
     * hardest from the far zoom — bare earth beside standing corn is the widest
     * colour gap the infield has.
     *
     * {@link ley} and this together are clamped to {@link courses}; whatever is
     * left over is under corn. All of it left over is the farm that never rests
     * its ground, which is the scene as it stood before this section existed.
     */
    fallow: number

    /**
     * How far a standing crop closes over the ground between its own rigs, 0..1.
     *
     * The corn course's share, and the number that decides whether the
     * rotation is legible from the far zoom or only from the near one. The
     * rigs lean their *crowns* toward `palette.crop` and leave the furrow the
     * colour the painter gave it, which is right — a crop is thicker on the
     * ridge, where the drainage is — but it means a 0.17 m band of a 2.1 m
     * pitch carries the whole of the green. Pulled out to where the corduroy
     * is sub-pixel, a field of corn and a field of bare fallow were the same
     * brown rectangle, which is the thing this section exists to stop.
     *
     * So the ground of a cropped field leans the same way its crowns do, less
     * far. 0 is the first cut of this: a crop that is a stripe on a ridge and
     * nothing between them. 1 is a crop standing thick enough to have closed
     * over the furrows completely, which is a lawn rather than a field and
     * takes the rows out of it.
     *
     * 0.4 keeps the soil showing between the drills — the field still reads as
     * *rows* close up, and as green from four hundred metres.
     */
    cornSward: number

    /**
     * How much of a rig's crown survives under grass, 0..1.
     *
     * A rig is not ploughed while the field is in grass, so the one under a ley
     * is however much of the last ploughing has not yet slumped — the soil
     * creeps back down into its own furrow a little every winter. 1 is a ley
     * sown on ground ploughed last season; 0 is ground that has been in grass
     * long enough to be flat, which loses the one cue that says it is a *field*
     * rather than rough pasture.
     *
     * 0.45 is a rig a few years old: legible as corduroy at the close zoom,
     * gone at the far one, which is exactly the right place for it to disappear.
     */
    leyCrown: number

    /**
     * How far the grass has taken the tilth back on a ley, 0..1.
     *
     * The ground colour, and the one number that decides whether this section
     * is visible from four hundred metres up. 0 is a ley indistinguishable from
     * the soil of the field beside it — sown so lately that the tilth still
     * shows through. 1 is a full sward, the colour the grazed pasture up the
     * hill already is.
     *
     * 0.85 leaves a wash of brown in the green, which is what a field two years
     * out of corn actually looks like and is also the honest answer: a ley is
     * not pasture, it is a field resting, and it should not read as the hill.
     */
    leyGrass: number
  }
}

export const SCAPE_CROPPING: CroppingConfig = {
  cropping: {
    courses:   4,
    ley:       1,
    fallow:    1,
    cornSward: 0.4,
    leyCrown:  0.45,
    leyGrass:  0.85,
  },
}
