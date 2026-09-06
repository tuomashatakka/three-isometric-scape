/**
 * The guard, and everything that lives on it.
 *
 * The first slice of the config to be kept outside `config.ts`, and the seam is
 * the one that file's lint ceiling has been naming since the far squall raised
 * it: not "the interface here and the defaults there", which puts a knob and its
 * reason on two sides of an import, but a whole *section* — its part of the
 * schema and the numbers that answer it, moved together.
 *
 * These three belong in one slice because they are one subject. `skerries` puts
 * bare rock in the open sea; `littoral` is the band of weed and lichen the tide
 * paints round it; `haulout` is what comes out of the water onto what is left.
 * Each reads the one before it — the haul-out search is written against
 * `skerries.crest`, and the weed bands are tight because the rocks are low — so
 * a reader who has one of them open wants the other two.
 *
 * The dependency is a type in one direction and a value in the other, exactly as
 * `config-landmasses.ts` is, so the two modules never form a cycle at runtime:
 * the schema is erased and only the defaults survive into the bundle.
 */
export interface GuardConfig {

  /**
   * The bare rocks standing out in the open sea.
   *
   * Build-time like `strand`, `creek` and `layout`, and out of the tuning
   * overlay for the same reason: the rocks are folded into the composite height
   * field, baked into the bathymetry mask and drawn into the one terrain
   * geometry, so nothing here can move without the scape being generated again.
   *
   * The second landform built in world space rather than in a patch's frame —
   * see `landscape/skerry.ts` for why anything between the islands has to be.
   *
   * **Every length here is metres and stays metres.** A rock is the size a rock
   * is; a world that grew again must spread the guard further, not inflate it.
   * The only world-sized number involved is the domain the chains are thrown at,
   * and that is read from `archipelago.worldSize` rather than written here.
   */
  skerries: {

    /** How many chains to attempt. A chain that finds no sea is simply not there. */
    chains: number

    /** The most rocks one chain runs to. */
    perChain: number

    /** Radius of the first rock of a chain, in metres, out to its drowned foot. */
    radius: number

    /** How much the radius is allowed to vary rock to rock, 0..1. */
    radiusSpread: number

    /**
     * Metres the tallest rock of a chain stands above the waterline.
     *
     * The switch, and the only one: 0 drowns the whole guard and the open sea is
     * open sea again. There is no separate flag, because this is the flag.
     */
    crest: number

    /** Metres between rocks along a chain, centre to centre. */
    spacing: number

    /**
     * Metres of clear water kept round every island patch.
     *
     * Not decoration. The ferry network is planned over the field the rocks are
     * in, so a guard dropped across a harbour mouth is a route that has to squeeze
     * — and `createWaterways` throws rather than sail a boat through a rock. This
     * is the margin that keeps every landing's own water open before the planner
     * ever runs.
     */
    clearance: number
  }

  /**
   * The tidal band on the rocks in the open sea.
   *
   * The guard put forty-nine rocks in water that had been empty, and left every
   * one of them bare — `createSpotSampler` draws from the landmass discs and
   * their islets only, so no scatter budget in the scape could reach one. This
   * is the band that dresses them, and it is written as a *zone* rather than as
   * two more scatter counts: what grows on a sea rock is decided by how far
   * above the water it is standing and nothing else, which is the one fact a
   * littoral zone is.
   *
   * Build-time like `skerries` and `creek`, and out of the tuning overlay for
   * the same reason: the weed is stamped into instance matrices once, so a
   * slider here would need a rebuild to be seen and would be lying about what a
   * slider does.
   *
   * Every length is metres and stays metres. There is no world-sized number in
   * the section at all — a tide does not get deeper because the archipelago got
   * wider, and the one thing that does scale with the world, how many rocks
   * there are to dress, is already `skerries.chains`.
   */
  littoral: {

    /**
     * Metres under the waterline the weed still holds.
     *
     * The switch for the weed, and the only one: 0 leaves the rocks scoured and
     * there is no boolean beside it. Deep enough to reach the top of the shelf
     * and no deeper — bladderwrack is an intertidal weed, and a scape that grew
     * it four metres down would be growing it where no tide has ever gone.
     */
    weedDepth: number

    /**
     * Metres over the waterline the weed still holds.
     *
     * The splash zone. Weed does not stop dead at the waterline, and a band that
     * did would draw a machined line round every rock — the same failure the
     * ice edge has `iceBreak` to avoid.
     */
    weedRise: number

    /**
     * Metres over the waterline before the lichen starts.
     *
     * Above the weed and never in it: the two bands share the rock and must not
     * share a height, because a crust drawn under the tide is a crust that
     * spends its life submerged. Kept clear of `weedRise` so there is a strip of
     * bare stone between them, which is what the real zonation looks like.
     */
    lichenBase: number

    /**
     * How darkly the weed stains the stone it covers, 0..1.
     *
     * The band is painted into the rock's own vertex colours as well as being
     * stamped as clumps, and this is the paint. A rock forty metres across seen
     * from two hundred shows a dark ring at the waterline, not weed — so the
     * ring is a tint, and the clumps are what the close zoom finds on top of it.
     *
     * 0 leaves the stone bare and the clumps standing on unstained rock, which
     * looks exactly like weed that has been pasted on. It is not a second switch
     * for the band: `weedDepth` is the switch.
     */
    weedShade: number

    /** Weed clumps attempted across the whole guard. */
    wrack: number

    /** Lichen crusts attempted across the whole guard. */
    crust: number
  }

  /**
   * The seals on the guard, and the tide that decides how many are ashore.
   *
   * Half build-time and half live, and the seam between them is the one the
   * whole scape draws. `sill`, `reach` and `stone` are the *search* — which rocks
   * a seal would use at all — and a rock is chosen once, so they are out of the
   * tuning overlay like every other siting knob. `ashore`, `emerge` and `shuffle`
   * are read every frame and are in the panel, because every one of them changes
   * a picture that is already on the screen.
   *
   * **Every length here is metres and stays metres.** A seal is the size a seal
   * is and the sea swings through the height it swings through, neither of which
   * is a fact about how wide the world is. See `landscape/haulout.ts`.
   */
  haulout: {

    /**
     * Metres of freeboard a rock must carry before seals will use it.
     *
     * The bottom of the search. A rock under this never really dries — it is a
     * shoal with surf on it, and there is nowhere on it to lie.
     */
    sill: number

    /**
     * Metres of freeboard above which a rock is a cliff rather than a haul-out.
     *
     * The top of it, and the less obvious half. A seal comes out of deep water
     * on its belly; a rock standing two metres proud is one it cannot get onto,
     * however inviting the top of it looks from above.
     */
    reach: number

    /** Metres of rock radius under which there is no room for a two-metre animal. */
    stone: number

    /**
     * Share of the colony that is out of the water at all, 0..1.
     *
     * The switch, and the only one: 0 is a guard whose seals are all fishing and
     * there is no boolean beside it. A share rather than a count because the
     * count is the tier's — see `quality.sealCount` — and because a haul-out is
     * never all of a colony: the rest are at sea, which is where a seal spends
     * most of its life.
     */
    ashore: number

    /**
     * Metres of clearance over a ledge before the animal on it is fully hauled.
     *
     * The ramp the tide works through. A seal that vanished the instant the
     * water touched its ledge would pop, and a rockful of them popping together
     * on the flood is the sort of thing a diff catches. 0 makes it a step.
     */
    emerge: number

    /**
     * Rolls a minute of the basking shuffle. 0 holds the colony still.
     *
     * Its own rate rather than a share of the wind, because an animal shifting
     * its weight on a rock is not weather — so nothing else in the scape stops
     * it, and it is in `STILL` for exactly that reason.
     */
    shuffle: number
  }
}


/** The guard's own defaults, spread into `SCAPE_CONFIG`. */
export const SCAPE_GUARD: GuardConfig = {
  // Sixteen chains of up to five, which lands somewhere around sixty rocks in a
  // 1520 m sea — a guard every couple of hundred metres rather than a reef belt,
  // because the water between the islands is a place the boats cross and not a
  // place to fill in. 18 m of radius against 46 m of spacing leaves daylight
  // between the rocks of a chain and lets their drowned feet touch, which is
  // what makes a line of five read as one ridge. 1.9 m of freeboard is a rock a
  // swell washes over in a gale and never covers.
  //
  // 70 m of clearance is the number with a reason behind it: it is comfortably
  // more than `boats.routeCell`, so every harbour keeps a corridor several
  // navigation cells wide and the planner is never asked to thread one.
  skerries: {
    chains:       16,
    perChain:     5,
    radius:       18,
    radiusSpread: 0.34,
    crest:        1.9,
    spacing:      46,
    clearance:    70,
  },

  // The bands are tight because the rocks are low: `skerries.crest` carries the
  // tallest rock of a chain 1.9 m over the water, so a weed band a metre deep
  // and a lichen line 0.55 m up divide a rock into three legible parts. Widen
  // either and the whole guard is one colour again.
  // The counts are for the whole guard rather than for one island, and the guard
  // is large: forty-nine rocks of ten to twenty-two metres' radius is more stone
  // than the home island has coast. A budget sized like a scatter on one holding
  // works out at three clumps a rock and photographs as nothing at all.
  littoral: {
    weedDepth:  1,
    weedRise:   0.8,
    lichenBase: 1.15,
    weedShade:  0.88,
    wrack:      4_200,
    crust:      2_200,
  },

  // Read straight off the guard the search is aimed at. `skerries.crest` deals a
  // rock 1.9 m of freeboard at the head of a chain and 0.62 of that at the tail,
  // so a sill of half a metre throws away the shoals and a reach of one and a
  // half throws away the two or three rocks that stand up like a tooth — which
  // leaves the broad low ones in the middle of the range, and those are the ones
  // the ledges of interest are on. `stone` is a rock wide enough to have a band
  // rather than a summit.
  //
  // `emerge` is a hand's breadth, which at the default 0.8 m spring range is
  // about a fifth of an hour of flood: long enough not to pop, short enough that
  // a still is of animals rather than of ghosts. `shuffle` is slow on purpose —
  // three rolls a minute is a body settling, and anything faster is a colony
  // that looks nervous.
  haulout: {
    sill:    0.5,
    reach:   1.5,
    stone:   13,
    ashore:  0.78,
    emerge:  0.12,
    shuffle: 3,
  },
}
