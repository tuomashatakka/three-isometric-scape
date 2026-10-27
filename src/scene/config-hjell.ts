/**
 * The racks the catch dries on.
 *
 * The tenth section kept outside `config.ts`, and here for the reason the
 * guard, the treeline, the dunes, the kelp, the crag, the dyke, the shieling,
 * the howe and the snow fence are: a subject, moved whole.
 *
 * A hjell is the oldest machine on a coast like this and it has no moving part
 * in it. Split cod is hung over poles in the cold months and left to the wind;
 * by early summer it is stockfish and it keeps for years. Everything about the
 * structure follows from that one sentence. It stands near the boats because
 * that is where the fish arrives, it stands in the open because still air does
 * not dry anything, its run lies **along** the wind rather than across it so
 * the air goes down the rack instead of around it, and it is empty for two
 * thirds of the year because the fish is either hanging or already eaten.
 *
 * That last one is what makes this different from the net rack the harbour
 * already has. The net rack is a fixed shape with cloth on it, and it looks the
 * same in February as in August. This one is a frame that the year fills and
 * empties, which is why the timber is baked into the steading's merged draw and
 * the fish are an `InstancedMesh` of their own — see `landscape/hjell.ts` for
 * the siting and the seats, `landscape/hjells.ts` for the draw, and
 * `props/hjell.ts` for the trestles and the fish.
 *
 * **Build-time for the frame, per-frame for the catch.** The run is settled
 * during the survey and the timber is merged at build, so the geometry knobs
 * stay out of the tuning overlay for the reason `howe`'s do. The year is not a
 * knob here at all: `season.time` already runs the clock the ground takes its
 * snow from, and a rack full of fish on a week the hillside above it is in
 * flower is the one failure this structure has.
 *
 * **Metres, except the three that are shares and the one that is a count.**
 * {@link HjellConfig.hjell.height}, `spacing`, `setback`, `reach`, `freeboard`,
 * `fall` and `fetch` are lengths of sawn timber and of ground, and they stay
 * metres on an archipelago of any size; `bays` is a count; `hung` and `peak`
 * are phases of the year; `fill` is fish per metre of rail.
 */
export interface HjellConfig {
  hjell: {

    /**
     * How far the top rail stands over the ground, in metres.
     *
     * **The switch for the timber, and the only one.** There is no `enabled`
     * here for the reason there is none anywhere: every other length in this
     * section is measured against a rack of this height — the fetch a site needs
     * is cleared against the top rail, the fish hang from it, and the lower rail
     * is a share of it — so 0 is a coast with no racks on it, reached through
     * the arithmetic rather than around it.
     *
     * 2.3 m is a rack a person can reach the top of with a pole and not with a
     * hand, which is what the real ones are: high enough that a fox and a spring
     * tide both miss the fish, low enough that one person can load it.
     */
    height: number

    /**
     * The most bays one island's run gets.
     *
     * A count rather than a length, because a hjell is built a bay at a time out
     * of poles that are all the same length — and it is the budget as well. Six
     * islands at six bays is the whole of what this structure can cost the scape
     * in timber, and that number is quotable before a vertex is built.
     *
     * It is also the gate that decides which coasts get racks at all, and it
     * does so more sharply than anything else here: a run is a *straight* line
     * and the ground it has to cross grows with every bay, so eight bays takes
     * the rack off three of these six islands and six leaves it on five. The
     * survey reports the length it laid, so a run that moves this number can see
     * which coasts it bought and which it lost.
     */
    bays: number

    /** Metres between trestles. One bay of rail hangs between each pair. */
    spacing: number

    /** Nearest the harbour bank the first trestle may stand, in metres. */
    setback: number

    /** Furthest from the bank the search will look, in metres. */
    reach: number

    /**
     * Least height over mean water a foot may stand at, in metres.
     *
     * The same guard the dyke's and the snow fence's have and for the same
     * reason: the survey walks the ground it measured, the dressing stands the
     * legs on the ground the tier actually tessellated, and a foot the survey
     * found a handspan clear can come back under the waterline on a mobile grid.
     * A metre rather than a handspan here, because this one is also the spring
     * tide: fish hung where the sea can reach it is fish nobody eats.
     */
    freeboard: number

    /**
     * The most fall the run is willing to stand across, in metres.
     *
     * A rack is a straight line of equal trestles and the rails between them are
     * level, so the ground under it has to be close to level too — a run laid
     * across a bank either has its lee end buried or its windward end in the
     * air. This is the gate that actually bites on a shore, the same way the
     * smokehouse's `SILL_FALL` is, and for the same reason: the steepest ground
     * anything in this scape is built on is the ground beside the boats.
     */
    fall: number

    /**
     * Metres of open ground the windward end needs upwind of it.
     *
     * The one number in this section that is a fact about the *weather* rather
     * than about the ground or the timber, and it is what makes this structure
     * sited rather than merely placed. A rack in the lee of a shoulder is a rack
     * the air stands still in, and still air does not dry fish — so the search
     * walks upwind from the windward trestle and refuses any site whose view of
     * the weather is shut off inside this distance by ground standing higher
     * than the top rail.
     *
     * It is deliberately short. These islands are five to twenty-three metres
     * out of the water and a hjell wants the harbour behind it, so a fetch asked
     * in hundreds of metres refuses every coast in the scape; asked in tens it
     * refuses the hollows and keeps the shoulders, which is the honest reading
     * of this coast. The survey reports what it measured, so a run that moves
     * this number can see which islands it bought and which it lost.
     */
    fetch: number

    /**
     * The share of the year the racks carry fish, 0..1.
     *
     * **The switch for the catch**, and the second of the two this section has.
     * A window round {@link peak} rather than a flag, ramped at both ends over a
     * fortnight, so the racks fill and empty rather than blinking: 0 is a scape
     * with bare frames in it all year, 1 is a coast that never eats what it
     * caught.
     *
     * A third of the year is what the real season is — hung after the winter
     * fishery and taken in before the flies — and it is also what makes the
     * structure worth having: a thing that is full in spring and bare in autumn
     * says more about where the year is than anything else at ground level.
     */
    hung: number

    /**
     * The phase of the year the racks are fullest, 0..1, with 0 at midwinter.
     *
     * Spring rather than midsummer, and that is the whole difference between
     * this and the bird cliff: an auk comes ashore to lay and leaves, so its
     * window is centred on the longest day, while a hjell is loaded out of the
     * winter fishery and emptied before the weather turns warm enough to spoil
     * it. Two things on the same coast keyed to the same clock at different
     * phases of it is most of what makes a year read as a year.
     */
    peak: number

    /**
     * Fish per metre of rail.
     *
     * The density knob, and the third way to empty the racks — a rack with no
     * fish on it is what {@link hung} gives in autumn and what this gives at 0
     * all year. The tier's budget sits over the top of it: `quality.hjellFish`
     * is how many seats of the ones this offers are actually stamped, so a phone
     * thins the whole coast rather than stripping one island of it.
     */
    fill: number
  }
}

export const SCAPE_HJELL: HjellConfig = {
  hjell: {
    height:    2.3,
    bays:      6,
    spacing:   2.6,
    setback:   5,
    reach:     40,
    freeboard: 1,
    fall:      2.2,
    fetch:     16,
    hung:      0.34,
    peak:      0.3,
    fill:      3,
  },
}
