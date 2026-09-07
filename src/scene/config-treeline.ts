/**
 * Where the wood stops.
 *
 * The second section to be kept outside `config.ts`, and it is here for the
 * reason the guard is: a subject, moved whole. The scape has had trees since the
 * first island and has never had a treeline — `layout.forestBias` scaled the
 * roll by how close a point was to a ridge, so the wood came out as an even
 * sprinkle from the shore to the summit, thinning a little in the hollows. That
 * is the one thing a northern island does not look like. A wood at this latitude
 * has an *edge*, and the edge is not a contour: it is drawn by the wind. Ground
 * with sixty metres of open water upwind of it grows scrub at two metres and
 * bare rock above that; ground in the lee of its own hill carries spruce to
 * nine.
 *
 * So this is two lines rather than one — a height for exposed ground and a
 * height for sheltered ground — and every point on the archipelago sits
 * somewhere between them according to how much sea lies upwind. See
 * `landscape/treeline.ts` for the walk that answers that, and `dressing-zones.ts`
 * for the rules the answer gates.
 *
 * **Build-time, and out of the tuning overlay for the reason `dressing` is.**
 * Every one of these numbers decides which of a few thousand instance matrices
 * a tree ended up in; nothing here can move without the scape being generated
 * again, and a slider that needs a rebuild to be seen lies about what a slider
 * does.
 *
 * **Every length here is metres and stays metres.** A spruce gives out at the
 * height a spruce gives out at, and the fetch that decides where is a distance
 * over water — neither is a fraction of the world or of the frame, so a world
 * that grows again must leave all of this alone.
 */
export interface TreelineConfig {
  treeline: {

    /**
     * Metres of upwind water that count as fully exposed ground.
     *
     * Fetch, in the sense the sea uses it: how far the wind has run unobstructed
     * before it arrives. Seventy metres is a little over a third of the home
     * island's width, which is the scale at which shelter on this archipelago is
     * actually decided — at twenty the whole coast reads as sheltered because the
     * beach is dry, and at three hundred every island is exposed on every
     * bearing because they all sit in open sea.
     */
    fetch: number

    /**
     * Steps the fetch is sampled at, from the point outward.
     *
     * The walk runs once per candidate spot and there are tens of thousands of
     * candidates in a build, so this is the cost knob. Fourteen samples over
     * seventy metres is one every five, which is finer than the ground it is
     * asking about: an islet narrower than that is a rock, and the rocks are not
     * shelter.
     */
    samples: number

    /** Metres above the waterline the wood gives out with the sea full on it. */
    exposed: number

    /** Metres above the waterline it reaches in the lee of its own hill. */
    sheltered: number

    /**
     * Half-width of the margin band, in metres.
     *
     * A treeline is a gradient, not a fence: for a metre or two either side of
     * it the trees stand thinner and shorter until the last of them gives up.
     * This is that band, and {@link TreelineConfig.treeline.stunt} is what it
     * does to the ones inside it.
     */
    taper: number

    /**
     * Metres of the exposed shore the salt keeps low.
     *
     * The other end of the same fact. A coast with the weather on it is scoured
     * twice a day and salted for the rest of the year, so its trees start well
     * back from the water even where the ground behind them is perfectly good.
     * Sheltered shores are untouched by this — `bite` is scaled by the same
     * exposure the upper line is.
     */
    saltBand: number

    /** How much of a tree's vigour the salt takes at the waterline, 0..1. */
    saltBite: number

    /**
     * What a tree at the very edge is scaled to, as a fraction of its full size.
     *
     * Krummholz, at the one scale this scape can show it: the spruce at the
     * margin is the same geometry at half the height, which is what the wind
     * actually leaves. Below the margin every tree is full size, so this is the
     * bottom of a mix rather than a multiplier on the wood.
     */
    stunt: number
  }
}

export const SCAPE_TREELINE: TreelineConfig = {
  // Measured against the ground that exists rather than chosen: 38% of this
  // archipelago's land stands in the first metre over the water and the tail
  // runs to 22 m, so a single line anywhere in that range is either a summit
  // detail or a clear-fell. Two lines at 1.8 and 8.5 put 42% of the land in
  // closed wood, 39% in the margin and 19% bare — a wood with a shape, and the
  // bare fifth is the exposed coast and the tops, which is where it belongs.
  //
  // The salt band is deliberately wider than the spruce's own 1 m lift: the
  // lift only says a tree is not standing in the sea, and what this says is
  // that the first two and a half metres of a weather coast are scrub.
  treeline: {
    fetch:     70,
    samples:   14,
    exposed:   1.8,
    sheltered: 8.5,
    taper:     1.6,
    saltBand:  2.5,
    saltBite:  0.8,
    stunt:     0.5,
  },
}
