/**
 * The fence that puts the drift somewhere else.
 *
 * The ninth section kept outside `config.ts`, and here for the reason the
 * guard, the treeline, the dunes, the kelp, the crag, the dyke, the shieling
 * and the howe are: a subject, moved whole.
 *
 * Everything the farm has built so far was sited by a *shape*. The mill takes
 * the one exposed shoulder, the chapel the one knoll the yard can see, the
 * weir the one flat the ebb drains, the howe the one top that stands against
 * the sky — all of them facts about ground that would be true in a place with
 * no weather in it at all. This one is not. `drift.ts` gave the hillside a
 * winter the wind had moved: bare on every face turned into the weather and
 * banked metres deep on every face turned out of it. A snow fence is the first
 * thing in this scape **sited from that** — from a season rather than from a
 * shape — and it is sited against the one piece of ground on the island that
 * has to stay open whatever the weather does, which is the cart track.
 *
 * The engineering is older than the road it protects and it is not a wall. A
 * fence does not *stop* blowing snow; it slows the air enough that the snow it
 * is carrying falls out of it, and the bank that was going to close the road
 * forms in the lee of the palings instead — which is why the thing is set back
 * from what it guards by fifteen times its own height rather than built beside
 * it, and why it is gappy rather than solid. A solid board fence throws a
 * shorter, steeper drift and scours a trench at its own foot. See
 * `landscape/snowfence.ts` for the siting and `props/snowfence.ts` for the
 * palings.
 *
 * **Build-time, and out of the tuning overlay for the reason `howe` is.** The
 * line is settled during the survey, the palings are baked into the steading's
 * one merged draw, and the ground under them is claimed against the scatter
 * before a spruce is seeded. A slider that needs a rebuild to be seen lies
 * about what a slider does.
 *
 * **Metres, except the one that is a ratio and the two that are shares.**
 * {@link SnowFenceConfig.snowFence.height}, `spacing` and `freeboard` are
 * lengths of sawn timber and stay metres on an archipelago of any size;
 * `setback` is a multiple of the fence's own height because that is what the
 * drift it throws is a multiple of; `bite` is a share; `reach` is the one that
 * is a length and a budget at once, and its note says why.
 */
export interface SnowFenceConfig {
  snowFence: {

    /**
     * How far the palings stand over the ground, in metres.
     *
     * **The switch, and the only one.** There is no `enabled` here for the
     * reason there is none anywhere: the drift a fence throws is a multiple of
     * this, the setback that places it is a multiple of this, and the stretch
     * of track it has to be long enough to cover is measured against it — so 0
     * is a scape with no fences in it, reached through the arithmetic rather
     * than around it.
     *
     * 1.3 m is a lath fence a person can step over at the stile and not walk
     * through anywhere else. Raising it walks the line further off the road
     * (see {@link setback}) and lengthens the run the drift is thrown across;
     * lowering it brings the bank back onto the track it was built to keep
     * open, which is the one failure this structure has.
     */
    height: number

    /**
     * How far upwind of the track the line stands, in **multiples of
     * {@link height}**.
     *
     * The one number in this section that is not a length, and it is a ratio
     * because the thing it is placing is: a fence throws a drift something like
     * fifteen times its own height downwind of itself, and a fence set closer
     * than that puts the bank it made on the road it was built for. It is the
     * only rule here a reader would get wrong from first principles — the
     * instinct is to build the fence *at* the thing it guards, which is how you
     * get a road with a wall of snow standing on it.
     *
     * Twelve is the shallow end of what the handbooks give, and it is chosen
     * against this scape rather than against them: these islands stand five to
     * twenty-three metres out of the water, their cart tracks run from a
     * farmyard to a shore, and a setback of twenty heights puts the line in the
     * sea on every one of them. It is already the binding constraint at twelve
     * — see the survey's own refusals — and that is the honest reading of this
     * coast rather than a number to soften until every island gets a fence.
     */
    setback: number

    /** Metres between posts. One bay of palings hangs between each pair. */
    spacing: number

    /**
     * The least drift a stretch of track has to be taking before it is fenced,
     * 0..1.
     *
     * A share of the worst a stretch could take, and the gate that decides
     * which islands get a fence at all. It is the product of two things that
     * both have to be true at once — the ground is a lee face, so snow is
     * banking on it, *and* the track runs across the weather rather than along
     * it, so the bank forms over the road rather than beside it. A stretch
     * scoring high on one and nothing on the other is a stretch that does not
     * drift, and a single threshold on either alone fences half the island.
     *
     * Raising it refuses the islands one at a time, longest-suffering last.
     * Lowering it fences track that would have stayed open, which costs
     * geometry and, worse, makes the structure read as decoration.
     */
    bite: number

    /**
     * The most fence one island gets, in metres.
     *
     * **Metres, and they stay metres**, for the reason the pier's `reach` does:
     * it is how much timber a farm will cut, stand and re-stand every autumn,
     * which is a fact about the farm rather than about how wide the archipelago
     * is. It is also the budget — six islands at this length is the whole of
     * what this structure can cost the scape, and that number is quotable
     * before a vertex is built.
     */
    reach: number

    /**
     * Least height over mean water a post may stand at, in metres.
     *
     * The same guard the dyke's has and for the same reason: the survey walks
     * the ground it measured, the dressing stands the posts on the ground the
     * tier actually tessellated, and a station the survey found a handspan
     * clear can come back under the waterline on a mobile grid.
     */
    freeboard: number
  }
}

export const SCAPE_SNOW_FENCE: SnowFenceConfig = {
  snowFence: {
    height:    1.3,
    setback:   12,
    spacing:   2.4,
    bite:      0.2,
    reach:     46,
    freeboard: 0.7,
  },
}
