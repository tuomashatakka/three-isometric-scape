/**
 * The surveyed sites of every holding: the water that runs through it, the ways worn across it, and the buildings that stand on it.
 *
 * Moved whole out of `config.ts`, which had grown past the line ceiling. Every
 * knob here is build-time unless its own comment says otherwise.
 */
export interface SitesConfig {

  /**
   * The beck, and the inlet it cuts at the shore.
   *
   * Build-time geometry, like `layout` and unlike `water` — the channel is
   * carved into the terrain mesh and baked into the bathymetry mask, so these
   * are read once when the scape is generated rather than per frame, and they
   * are deliberately absent from the tuning overlay for that reason.
   */
  creek: {

    /** Width of the channel floor up on the hill, in metres. */
    width: number

    /** How deep the channel is cut into the ground it runs through, in metres. */
    incision: number

    /** How far below the waterline the tidal reach is dredged, in metres. */
    mouthDepth: number

    /**
     * How much wider the mouth is than the head.
     *
     * The one knob that decides whether the scape gained a stream or a sound.
     * Below about 2 the lower reach never resolves on the mobile tier, where a
     * terrain quad is two metres across.
     */
    mouthFlare: number
  }

  /**
   * The water standing in that channel.
   *
   * Its own section rather than two more fields on `creek`, and the split is
   * the usual one in this config: `creek` is the shape cut into the ground and
   * is read once when the terrain is generated, and this is the sheet lying in
   * it — half build-time and half live. `depth` and `fill` decide where the
   * surface is laid and stay out of the overlay; `flow` and `riffle` are read
   * every frame and are on it.
   *
   * **Every length here is metres and stays metres.** A beck is the same beck
   * over a wider archipelago and at any zoom, so nothing in this section is
   * scaled by `archipelago.worldSize` or by the live `viewSize` — the audit the
   * scale rule asks for, written at the knob. What the water *does* scale with
   * is the channel: the sheet is as wide as `creek.halfWidthAt` says the floor
   * is at that point, so it opens out at the mouth without that being authored.
   */
  beck: {

    /**
     * Metres the surface stands above the channel floor.
     *
     * The switch, and the only one: 0 is a dry bed, and there is no geometry to
     * draw rather than a sheet drawn at nothing. Kept well under
     * `creek.incision`, because a depth deeper than the cut is a beck that has
     * burst its own banks.
     */
    depth: number

    /**
     * How much of the channel floor the water covers, 0..1.
     *
     * 1 wets the floor bank to bank, which is the beck in spate; below about
     * 0.6 it reads as a trickle down the middle of a wide dry bed. There is
     * gravel showing either side at the default, which is what a summer beck
     * on this coast actually looks like.
     */
    fill: number

    /**
     * Metres of channel a fleck of foam travels in a second.
     *
     * 0 holds the surface where it stands, and it is therefore its own line in
     * `STILL` — see `scripts/scape-shot.ts`. Its own rate rather than a share
     * of `wind.speed`: a beck runs on the fall under it and would go on running
     * through a dead calm.
     */
    flow: number

    /**
     * How white the water breaks where it falls, 0..1.
     *
     * Not a second switch for the beck: where the white goes is the *bed's*
     * business — the fall is baked into the sheet at build time, so a flat
     * reach stays dark however far this is turned up and no slider can put
     * rapids on a pool. Zero is a beck that runs black over every step in it.
     */
    riffle: number
  }

  /**
   * The pool up on the high ground.
   *
   * Four build-time numbers and two the frame reads. The shape of the basin is
   * folded into the composite height field, so `radius`, `depth`, `lift` and
   * `spread` are absent from the tuning overlay for the reason `creek` and
   * `strand` are: nothing there can move without the scape being generated
   * again, and a slider that lies about that is worse than no slider.
   *
   * Where the pool stands is not here and cannot be: the surface is the lowest
   * point of the rim the search found — see `landscape/tarn.ts`.
   */
  tarn: {

    /**
     * Wetted radius of the pool, in metres.
     *
     * **Metres, and they stay metres.** A tarn is a real-world thing the size
     * of a field, not a fraction of the island it sits on — the fell is three
     * times the home island's span and the pools on it are not three times the
     * size. 0 is a scape with no standing water on its high ground.
     */
    radius: number

    /**
     * Metres the floor is cut below the surface at the deepest point.
     *
     * The switch as well as the depth: at 0 there is no basin to cut and no
     * pool to draw, the same way `beck.depth` is the beck's switch. Cutting
     * deeper than the ground has relief to give simply carves a hole with
     * water in it, which is why the rim tests below run first.
     */
    depth: number

    /**
     * Metres above the waterline the whole rim has to stand.
     *
     * **Metres, and they stay metres.** What makes a tarn a tarn is that it is
     * a *separate* body of water: a pool sited a hand's breadth above the sea
     * is a lagoon with a bank in front of it, and the first spring tide makes
     * that argument for itself. It is also what keeps the search off the
     * foreshore, which is the flattest ground most of these islands have.
     */
    lift: number

    /**
     * Metres of relief across the rim above which there is no pool at all.
     *
     * The test that separates ground which holds water from ground which is
     * simply a hillside, and it is the range rather than the mean on purpose:
     * a bowl open on one bearing has a perfectly ordinary average rim and
     * holds nothing. An island whose flattest upland still fails this has no
     * tarn, and that absence is the right answer.
     */
    spread: number

    /**
     * How mirror-like the surface is, 0..1.
     *
     * Read every frame, and the whole character of the thing. A tarn is the one
     * body of water in the scape with no fetch on it — nothing moves it, so
     * what it does is reflect. 0 is a flat matte disc; 1 is glass.
     */
    mirror: number

    /**
     * How much earlier than the sound the pool locks, 0..1.
     *
     * A shallow pool on the fell is ice weeks before the sea between the
     * islands is, and this is that difference rather than a second winter: the
     * one `season.freeze` the lake and the beck read is still the input, and
     * this only says how much sooner this water gives up. 0 freezes with the
     * sea; 1 is ice on the first cold week of the year.
     */
    frost: number
  }

  /**
   * The turf the farm burns, and the ground it is cut out of.
   *
   * Build-time like `tarn` and `creek`, and absent from the tuning overlay for
   * the same reason: the working is a step cut into the height field and a
   * rectangle painted into the terrain's vertex colours, and nothing here can
   * move without the scape being generated again.
   */
  peat: {

    /**
     * Metres of open working face.
     *
     * **Metres, and they stay metres.** A peat bank is a real-world thing the
     * size of a barn wall — a family's winter fuel and not a fraction of the
     * island it is cut from — so the fell gets the same fourteen metres of face
     * the home island does.
     */
    face: number

    /**
     * Metres the cutting has been worked back from that face.
     *
     * The other side of the rectangle, and the one that says how many years the
     * bank has been worked: a face is opened and then retreats a couple of
     * metres a summer, so the stripped floor behind it is the record of how long
     * this farm has been burning turf.
     */
    reach: number

    /**
     * Metres the floor stands below the moor at the face.
     *
     * The switch as well as the depth, the way `tarn.depth` is: at 0 there is no
     * step to cut and no working to paint. It is also the one number the reader
     * actually sees at a distance — the dark rectangle is the paint, but what
     * makes it read as a *cutting* rather than as a stain is the shadow standing
     * along its uphill edge, and that shadow is exactly this deep. The floor is
     * cut one of these below whatever the moor was doing, so the depth is a
     * guarantee rather than a hope: see `carvePeat`.
     */
    depth: number

    /**
     * Metres above the waterline the whole footprint has to stand.
     *
     * **Metres, and they stay metres.** Peat forms in ground that never drains,
     * which is exactly the ground a spring tide reaches — so without this the
     * search takes the flattest, lowest acre on the island every time, and that
     * acre is the foreshore. See `tarn.lift`, which is the same guard against
     * the same mistake from the other direction.
     */
    lift: number

    /**
     * Metres of relief **along the face** above which there is no cutting.
     *
     * The test that separates moor from hillside, and it is deliberately about
     * the face rather than about the whole working: the floor follows the ground
     * down, so a cutting is perfectly happy on a slope, but the top of a cut face
     * is one line and a face that climbs three metres from one end to the other
     * was never cut by anybody. An island whose flattest low ground still fails
     * this has no peat bank, and that absence is the right answer.
     */
    spread: number
  }

  /**
   * The bar of sand and shingle joining the two southern islands.
   *
   * Build-time geometry, like `creek` and `layout`, and absent from the tuning
   * overlay for the same reason: the crest is folded into the composite height
   * field and baked into the bathymetry mask, so nothing here can move without
   * the scape being generated again.
   *
   * It is the one landform in the scape that is *between* islands rather than
   * on one. Every local survey happens in a patch's own frame and the patches do
   * not overlap, so a tombolo has to be a world-space term added after the
   * composite field has dispatched — see `landscape/strand.ts`.
   */
  strand: {

    /**
     * The two landmasses it joins, by id.
     *
     * Named rather than searched for, and that is not laziness: the *closest*
     * two coasts in this archipelago are the home island's and the ridge's, a
     * hundred metres apart, and a bar found by proximity would join those and
     * call it a tombolo. Which two islands are one island is a fact about the
     * place, so the place says it. An id that no landmass answers to leaves the
     * scape with no strand rather than throwing — see `landscape/strand.ts`.
     */
    between: readonly [string, string]

    /** Half-width of the dry crest, in metres. */
    width: number

    /**
     * Metres the crest stands above the waterline.
     *
     * The switch, and the only one: 0 drowns the bar and the two islands are two
     * islands again. There is no separate flag, because this is the flag.
     */
    crest: number
  }

  /**
   * The shingle bar out to the nearest rock, and the tide that takes it back.
   *
   * The other bar, and the opposite construction. `strand` joins two landmasses
   * and has to be built in world space because the ground between two patches
   * belongs to neither of them. This one joins an island to one of its own
   * islets, which is ground *inside* a patch — so it is surveyed in that
   * island's own frame, sited against the banks the boats use, and folded into
   * that island's height field. See `landscape/causeway.ts`.
   *
   * Build-time, and out of the tuning overlay for the reason `strand` and
   * `skerries` are: the crest is in the ground the terrain patch is built from
   * and the bathymetry mask is baked off, so nothing here can move without the
   * scape being generated again.
   *
   * **Every length here is metres and stays metres.** A crossing is as wide as
   * the water is and a bar is as high as the sea allows; a world that grew again
   * puts its rocks further out, it does not build a wider mole.
   */
  causeway: {

    /**
     * Longest crossing the bar will bridge, in metres.
     *
     * The switch, and the only one: 0 is an archipelago whose rocks are all
     * reached by boat, which is what this scape was before the section existed.
     * There is no flag beside it, because a bar that will bridge no water is
     * already no bar.
     *
     * It is also the whole of the siting policy. A rock further off than this
     * gets no causeway rather than a mole out into open water, and on four of
     * the five holdings — which have no islets at all — the answer is no
     * causeway however this is set.
     */
    gap: number

    /** Smallest islet radius worth walking out to, in metres. */
    minIsle: number

    /**
     * Metres the landfall must keep from the landing and the harbour.
     *
     * The one hard rule in the search rather than a term in its score. A bar
     * laid across the water the jetty stands in is a bar the ferry cannot get
     * past, and the fleet finds that out by failing to route rather than by
     * looking wrong.
     */
    clear: number

    /**
     * Metres the middle of the bar stands above mean water.
     *
     * The number the whole idea rests on, and it is sized against
     * {@link ScapeConfig.tide.range} rather than against anything here: at less
     * than half the spring amplitude the crossing is under water for a good part
     * of every day, and at more than the amplitude the tide never reaches it and
     * the causeway is simply a mole. Between the two it is what a causeway to an
     * offshore rock actually is — dry ground that the springs close over.
     *
     * Nothing implements that. The sea rides the tide and the ground does not,
     * so the covering is arithmetic the scape already did.
     */
    crest: number

    /**
     * Metres the two anchors stand above that middle.
     *
     * A bar is highest where it is held and lowest where the swell washes over
     * it, so the crossing sags in the middle — which is also what makes the sea
     * take it as a widening gap rather than as a strip that vanishes all at
     * once. 0 is a level causeway, and reads as one.
     */
    camber: number

    /** Half-width of the bar at its skirt, in metres. */
    halfWidth: number
  }

  // `skerries`, `littoral` and `haulout` — the guard, what grows on it and what
  // hauls out on it — are in `config-guard.ts`, and they are the first section
  // of this document to live outside it. The seam is the one the lint ceiling
  // has been naming for three runs: a slice of the interface and the defaults
  // that go with it, moved together so a knob never leaves its reason behind.


  /**
   * The paths worn between the places the farm has to be.
   *
   * Build-time like `creek` and `layout`, and absent from the tuning overlay for
   * the same reason: the routes are traced across the ground once and baked into
   * the terrain's vertex colours, and the scatter is placed around what they
   * claim. Nothing here can move without the scape being generated again.
   */
  footpath: {

    /** Width of the bare tread, in metres. */
    width: number

    /** Metres of thinning grass either side of the tread. */
    verge: number

    /**
     * How hard a route works to keep off a climb.
     *
     * 0 walks straight lines between the anchors, which is a survey rather than
     * a path; the useful range is a metre or so of sidestep per unit of ground
     * gradient. Past about 3 the routes start preferring the contour so strongly
     * that a short walk over a low shoulder becomes a long walk around it.
     */
    climb: number

    /** Lateral wander, in metres. Nobody surveyed these. */
    wander: number

    /**
     * How bare the treads get, 0..1.
     *
     * 0 is a scape nobody walks: no route is traced at all, so the grass and the
     * stones close back over ground that would otherwise be a path. There is no
     * separate switch, because this is the switch.
     */
    wear: number
  }

  /**
   * The wheel lines worn down the middle of the cart track.
   *
   * Build-time, like `footpath`: the ruts are a ribbon of geometry traced along
   * the track once and merged into the terrain draw, so nothing here can move
   * without the scape being generated again — and so none of it belongs on the
   * overlay.
   */
  cartRuts: {

    /** Metres between the wheel lines — a cart's axle track. */
    gauge: number

    /** Metres from a rut's centre to where its wear has gone. */
    width: number

    /**
     * Metres from the farmyard over which the wear fades out.
     *
     * The traffic all comes from one end. Past this the track is a track that
     * somebody laid rather than one that anybody uses.
     */
    reach: number

    /**
     * How worn the ruts get, 0..1.
     *
     * 0 is a track nothing has driven down: the ribbon is not built at all, so
     * the ruts cost nothing rather than costing a merge and drawing nothing.
     * There is no separate switch, because this is the switch.
     */
    wear: number
  }

  /**
   * The windmill on the exposed shoulder.
   *
   * Two build-time knobs and one live one, and the split is the usual one: where
   * the mill *stands* is surveyed once and baked into the merged settlement, so
   * `prominence` and `sailSpan` stay out of the overlay; how fast the wheel
   * turns is read every frame, so `spin` is on it.
   */
  mill: {

    /**
     * Radians the sails turn per second at a wind strength of 1.
     *
     * The rate is multiplied by `wind.strength`, so the one number that already
     * says how hard it is blowing says it here too rather than being duplicated.
     * 0 is a mill with its brake on — and, because the strength is a factor,
     * a still day stops the wheel without this being touched at all.
     */
    spin: number

    /**
     * Metres the ground has to stand above what surrounds it before a mill is
     * built on it.
     *
     * The switch, and the only one. A mill wants the open shoulder nobody built
     * on; 0 will put one on the first flat dry patch the search reaches, which
     * is a mill in a hollow, and raising it past what an island offers takes
     * that island's mill back out of the scape. See `landscape/mill.ts`.
     */
    prominence: number

    /** Diameter of the sail wheel, in metres. Sized against the hub height. */
    sailSpan: number
  }

  /**
   * The chapel on the knoll, and the churchyard around it.
   *
   * Build-time, all four, so none of them is in the overlay: moving a building
   * and re-walling its yard needs the whole composition re-surveyed, and a
   * slider that requires a reload lies about what a slider does. See
   * `landscape/chapel.ts` for the siting and `props/chapel.ts` for the building.
   */
  chapel: {

    /**
     * Metres the ground has to stand above what surrounds it before a chapel is
     * built on it.
     *
     * The switch, and the only one — the same shape as `mill.prominence` and for
     * the same reason. 0 puts the chapel on the first level dry patch inside
     * `reach`, which is a chapel in a hollow; raising it past what an island
     * offers takes that island's chapel back out of the scape.
     */
    prominence: number

    /**
     * How far from the yard the search will look, in metres.
     *
     * **Metres, and they stay metres.** This is how far a person will walk to a
     * service on a winter morning, which is a fact about people rather than
     * about how wide the archipelago is — so a larger world must not scale it.
     * What it does interact with is the island: a rise past this is not a site,
     * however prominent, and an island with nothing inside it gets no chapel.
     */
    reach: number

    /**
     * Radius of the walled churchyard, in metres.
     *
     * Measured from the chapel, and it has to clear `CHAPEL_FOOTING` — a wall
     * inside the building's own footprint is a wall through the chancel. The
     * ground between the two is where the markers stand.
     */
    yardRadius: number

    /**
     * How many grave markers the churchyard holds.
     *
     * A count rather than a density, because a churchyard is a fixed enclosure
     * and not a scattered zone; 0 leaves the walled ground empty, which is what
     * a chapel built this decade would look like.
     */
    graves: number
  }

  /**
   * The smokehouse on the bank above the boat harbour.
   *
   * Build-time, all three, and for the reason the chapel's four are: moving a
   * building re-plans the footpath network around it, and a slider that needs a
   * reload lies about what a slider does. See `landscape/smokehouse.ts` for the
   * siting and `props/smokehouse.ts` for the building.
   *
   * **Metres, and they stay metres.** All three are measured off the harbour
   * bank — how far a barrow is wheeled up from the boats, and how much dry
   * ground a fire needs under it. None of them is a fraction of the world or of
   * the frame, so a wider archipelago must not scale them.
   */
  smokehouse: {

    /**
     * Nearest the bank the building may stand, in metres.
     *
     * Past the net rack, which dries five metres back from the same bank — the
     * two are the whole of the harbour's dry ground, and the rack was there
     * first.
     */
    setback: number

    /**
     * Furthest from the bank the search will look, in metres.
     *
     * A smokehouse belongs to the harbour, not to the island. Past this the
     * search gives up rather than walking one up the hillside, and a harbour cut
     * into a shelf that shelves straight into rock gets no smokehouse at all.
     */
    reach: number

    /**
     * Metres of dry ground the sill needs under it, at the middle and at all
     * four corners of the footing.
     *
     * The switch, and the only one — the same shape as `mill.prominence` and for
     * the same reason. Raising it past what the bank offers takes the
     * smokehouses back out of the scape.
     */
    freeboard: number
  }

  pier: {

    /**
     * Metres of water the head has to stand in.
     *
     * The switch, and the only one. There is no `enabled` here for the reason
     * there is none anywhere: raising this past what a shelf offers takes the
     * pier off that island, and taking it past the deepest water inside `reach`
     * on every island takes piers out of the scape. What it must not become is a
     * *shorter* pier — a deck that stops in half a metre of water is a jetty
     * with extra timber in it, and the scape already has jetties.
     */
    berth: number

    /**
     * Deepest water a pile is driven in, in metres.
     *
     * The other switch, and on this archipelago it is the one that decides which
     * coasts get a pier at all. These coasts are rock: the bottom goes from
     * boot-deep to twelve metres of open sound inside a couple of bays, so where
     * a trestle stops is where there stopped being anything to drive a pile
     * into — and at the default seed that is the three-bay minimum on every
     * island that qualifies. Lowering it refuses them one at a time; raising it
     * past the sound's own floor would walk one out over deep water on stilts
     * nine metres long.
     */
    piled: number

    /**
     * Furthest out the trestle is carried, in metres.
     *
     * The walk rather than the engineering, and on this coast it is the loosest
     * of the three: {@link piled} stops every pier in the archipelago well
     * inside it. It is here so that a shelf which runs out flat for a hundred
     * metres — which a retuned falloff could produce tomorrow — gets a pier
     * rather than a promenade.
     */
    reach: number

    /**
     * Metres of navigable water the head needs still ahead of it.
     *
     * The third switch, and the one the first cut of this section did not have.
     * A run that stays wet the whole way has not necessarily gone *out*: rooted
     * on the harbour cove — which is chosen for shelter and never tested for a
     * way out — the home island's pier crossed an enclosed bay and stopped three
     * metres short of the far shore, which draws as a pier and reads as an
     * unfinished bridge. The depth this is measured at is `boats.clearance`
     * rather than {@link berth}: a berth is where a hull lies still and the
     * offing is where it is under way, and asking for the deeper of the two out
     * here took every pier in the archipelago.
     */
    offing: number

    /** Metres between bents — one pair of piles and the cap beam over them. */
    bay: number

    /**
     * Metres the deck stands over mean water.
     *
     * Over *mean* water, like every other thing on this coast that was solved
     * rather than animated — see `tide`. It has to clear the spring high water
     * `tide.range` reaches, or the pier is awash twice a month.
     */
    freeboard: number
  }

  /**
   * The croft out on the islets — the one holding that is not on the island.
   *
   * All three are read once, at build time, and none of them belong in the
   * overlay: moving a building is a rebuild, and a slider that needs one lies
   * about what a slider does. Every number here is **metres** and stays metres —
   * a hut is the size a hut is, and `reach` is how far somebody will row rather
   * than a fraction of a world that has grown twice already.
   */
  croft: {

    /**
     * Metres of islet radius before a rock is big enough to be lived on.
     *
     * The switch, and the same shape as `beacon.minRock` seen from the other
     * end. Raising it past the largest islet the light is not already on takes
     * the croft back out of the scape.
     */
    minIsle: number

    /**
     * Metres of dry rock the sill needs under it, at the middle and at all four
     * corners of the walls.
     *
     * Higher than the smokehouse asks for, and a fact about the site rather than
     * about caution: a bank behind a harbour is sheltered, and an islet in open
     * water takes the whole of the swell that `water.surf` breaks on it.
     */
    freeboard: number

    /**
     * Furthest from the harbour the search will row, in metres.
     *
     * A croft is worked from the home harbour, so past this the rock is somewhere
     * a boat visits rather than somewhere anybody lives on. It bounds which
     * islets are candidates; which of them wins is the score in
     * `landscape/croft.ts`.
     */
    reach: number
  }

  /**
   * The seamark on the outer rock, and the light it turns.
   *
   * Split the way `mill` is: the first two decide which islet the tower is built
   * on and are read once at build time, and the last two are live. `beamReach`
   * and `beamSpread` are metre-sized — the throw of a real coastal light, not a
   * fraction of the world or of the frame — so they stay put when either grows.
   */
  beacon: {

    /**
     * Metres of islet radius before a rock is big enough to build a tower on.
     *
     * The switch, and the only one worth having: the ring runs from skerries a
     * few metres across up to a substantial outlier, and this is what decides
     * how far out the masonry is allowed to go. Raising it past the largest
     * islet takes the lighthouse back out of the scape.
     */
    minRock: number

    /** Metres of rock the plinth must have between it and the water. */
    freeboard: number

    /**
     * Turns of the optic per minute. 0 stops the sweep where it stands.
     *
     * A real coastal light turns two to six times a minute, which is slow enough
     * that the sweep reads as a sweep rather than a strobe. Zero is the still a
     * capture needs, and the reason this is a rate and not a period.
     */
    turn: number

    /**
     * Lamp brightness. 0 is a light that was never lit.
     *
     * Scaled by how far the sun is down, so the lamp comes up through dusk and
     * out again at dawn without this being touched — see `scene/beacon.ts`.
     */
    lamp: number

    /**
     * How far above white the lamp burns, so the bloom can find it.
     *
     * A multiplier, not a brightness: 1 leaves the lamp exactly as bright as it
     * is drawn, and anything above pushes it past the bloom's threshold so it
     * blooms instead of merely being pale. Only does anything on a tier that
     * has a bloom — see `scene/beacon.ts`.
     */
    glow: number

    /** How far a beam reaches out over the water, in metres. */
    beamReach: number

    /** Half-width of a beam where it dies, in metres. */
    beamSpread: number
  }
}

export const SCAPE_SITES: SitesConfig = {
  creek: {
    width:      3.4,
    incision:   1.35,
    mouthDepth: 2.6,
    mouthFlare: 3.2,
  },

  // 0.22 m of water in a channel cut 1.35 m deep is a beck you could wade
  // without wetting a knee — a sixth of the incision, which leaves the banks
  // reading as banks. 0.78 of fill puts a hand's breadth of wet gravel either
  // side of the water at the spring and a good deal more at the mouth, where
  // the floor is three times as wide. 1.1 m/s is a hill beck walking rather
  // than a river: it crosses the home island's 38 m course in about half a
  // minute, which is a streak of foam you can follow with your eye at the near
  // poses and a shimmer at the far ones.
  beck: {
    depth:  0.22,
    fill:   0.78,
    flow:   1.1,
    riffle: 0.55,
  },

  // 7 m of radius against 1.4 m of depth is a pool you could throw a stone
  // across and not wade — the proportions of a rock basin rather than of a
  // reservoir. 1.5 m of lift is a storm surge and a spring tide clear of the
  // sea. 2.9 m of allowed rim relief sounds generous and is not: the farm has
  // already taken every genuinely level acre on the home island, so what is
  // left to a pool is the least tilted of the rough ground — and the four
  // islands that clear it do so between 1.7 and 2.7, while the ridge, which is
  // nothing but hillside once the holding has had its share, has no tarn.
  tarn: {
    radius: 7,
    depth:  1.4,
    lift:   1.5,
    spread: 2.9,
    mirror: 0.86,
    frost:  0.55,
  },

  // 11 m of face against 7 m of reach is one family's bank: a wall of turf you
  // could walk in three seconds and a floor behind it that is maybe a dozen
  // summers of cutting. 0.9 m of depth is two spits — the depth a man reaches
  // standing on the floor and throwing up — and it is what the shadow along the
  // face is made of at the pulled-out zoom.
  //
  // 1.3 m of lift is the storm surge clear of the sea, a little under the pool's
  // because a cutting is *meant* to be on wet ground and only has to keep out of
  // the salt. 1.8 m of allowed relief along an 11 m face is the flattest low
  // ground these islands have once the farm has taken its share: the home island
  // and the two southern fells clear it, and the ridge and the meadow — whose
  // level acres are all inside a wall already — have no peat, the way the ridge
  // has no tarn.
  peat: {
    face:   11,
    reach:  7,
    depth:  0.9,
    lift:   1.3,
    spread: 1.8,
  },

  // 11 metres of half-width is a bar you could drive a cart along, against a
  // crossing of roughly three hundred — narrow enough at that length to read as
  // a thread rather than as a causeway. 1.1 m of crest is one storm surge above
  // the water, which is what keeps it dry at the middle and awash at both ends.
  strand: {
    between: [ 'sound', 'fell' ],
    width:   19,
    crest:   1.1,
  },

  // A third of the strand's half-width and a fifth of its crest, because this
  // one is the other kind of bar: a footway out to a rock rather than the ground
  // that makes two islands one. 3.4 m of skirt leaves a crown not quite three
  // metres wide, which is a path with room to pass on and still three quads
  // across at desktop detail.
  //
  // 0.22 m of crest is the whole design and it is measured against `tide.range`
  // rather than chosen here. Half the spring range is 0.4 m, so the springs
  // close over the middle of the crossing for a little under a third of every
  // cycle; half the *neap* range is 0.18 m, so at the quarters of the month the
  // sea never reaches it at all. A causeway that is covered twice a day is a
  // ford, and one that is never covered is a mole — this is neither, and moving
  // this number past either end of that band is how it becomes one of them.
  //
  // 26 m of gap with 4 m of minimum radius picks the near western pair off the
  // home island's own shore and refuses everything else in the ring, which is
  // the intent: one crossing, to the rock that is plainly close enough to walk
  // to. 24 m of clearance is comfortably outside the boathouse, the slipway and
  // the stakes, so the bar can never be found on the water the ferry comes in
  // on.
  causeway: {
    gap:       26,
    minIsle:   4,
    clear:     24,
    crest:     0.22,
    camber:    0.55,
    halfWidth: 3.4,
  },

  footpath: {
    width:  1.5,
    verge:  0.7,
    climb:  1.3,
    wander: 1.1,
    wear:   0.82,
  },

  // A gauge of 1.45 m against a 3.2 m track leaves the ruts a little inboard of
  // the wheel-worn edges, with a crown between them — which is what a farm road
  // that drains looks like. Widening the ruts much past a third of a metre
  // closes that crown and the track reads as one dark strip instead.
  cartRuts: {
    gauge: 1.45,
    width: 0.34,
    reach: 40,
    wear:  0.85,
  },

  // A sail wheel of 8.4 m against a hub 5.4 m up leaves the tips 1.2 m clear of
  // the trestle's own ground at the bottom of the turn, which is about what a
  // common-sail post mill actually had. Widen it much past nine and the sails
  // are sweeping the heather.
  mill: {
    spin:       1.15,
    prominence: 1.6,
    sailSpan:   8.4,
  },

  // An eighth of the mill's prominence, and it is not a slack number — it is
  // measured against the *land* rather than against the sea beside it (see
  // `landProminenceAt`), which on this coast is a far harder question. The yard,
  // the pasture, four plots and the mill hold every rise the home island has, so
  // what is left for a chapel is ground that merely does not lie in a hollow: at
  // 0.2 the search finds five squares that qualify and takes the best at 0.37.
  // 90 metres is about two minutes' walk from the yard. The wall at 9 m clears
  // the building's 5.5 m footing by two rows of graves.
  chapel: {
    prominence: 0.2,
    reach:      90,
    yardRadius: 9,
    graves:     12,
  },

  // 6 metres of radius takes in the two largest islets and leaves every skerry
  // out, which is what puts the tower on the north-eastern outlier — the
  // furthest rock in the ring with ground to spare. 1.2 metres of freeboard is
  // one storm surge, and the smallest rise the plinth reads as standing on.
  // Five metres puts the hut alongside the net rack rather than behind it — the
  // rack's own footing keeps the two apart — and eighteen is about as far up a
  // bank as anyone wheels a barrow of fish. The reach has to be that generous
  // because the harbour bank is by construction the nearest water to the *yard*:
  // on the home island the shore shelves at a metre in four for seventeen metres
  // and the first ground a socle can stand on is at the bottom of the farmyard.
  // The score pays for every one of those metres, so the four islands with a
  // gentler bank put theirs six to nine metres up instead.
  //
  // 0.6 m of freeboard is a shore building rather than a hill one, and it is
  // measured against its neighbours rather than against the chapel: the
  // boathouse's deck sits at the waterline plus five centimetres and the net
  // rack asks for half a metre. Demanding the chapel's two and a half here reads
  // as caution and is really a refusal — at 1.4 m no bank in the archipelago
  // qualified and every island came back with no smokehouse at all.
  smokehouse: {
    setback:   5,
    reach:     18,
    freeboard: 0.6,
  },

  // The berth is sized against the two numbers the fleet already lives by: the
  // waterways are routed to keep `boats.clearance` — 0.55 m — under every hull,
  // and the tide takes half of `tide.range` off that twice a day. A berth is
  // where a boat *lies* rather than passes, so 1.4 m is two and a half times the
  // running clearance and stays afloat at the bottom of a spring tide.
  //
  // 8 m of piling is the number that was measured rather than chosen, and on
  // this archipelago it is what decides *whether* rather than how long: these
  // coasts are rock, the bottom goes from boot-deep to twelve metres of open
  // sound inside a couple of bays, and every pier that gets built comes out at
  // the three-bay minimum because the shelf ends there. At 5.5 the count was one
  // island in six; at 8 it is three.
  //
  // 12 m of offing is a hull's length and a bit — the room a boat needs to lie
  // alongside and get away again — and it is the rule that halves the count. The
  // three coasts it refuses are the enclosed ones: a harbour is sited for
  // shelter, and the most sheltered cove on a coast is often the one with no way
  // out of it.
  //
  // Three metres a bay is a span a sawn stringer actually holds, and 1.05 m of
  // freeboard puts the deck a hand under the jetty's — the same waterfront,
  // built to the same height, clearing the 0.4 m a spring high water reaches.
  pier: {
    berth:     1.4,
    piled:     8,
    reach:     27,
    offing:    12,
    bay:       3,
    freeboard: 1.05,
  },

  // Sized against the ring the home island actually has. Its islets run from
  // 2.5 m of skerry up to 8.6 m, the light is already on the largest, and 5.5
  // leaves the four next-biggest as candidates rather than one — which is what
  // keeps the answer a search instead of a hard-coded rock. 0.9 m of freeboard
  // is half a metre more than the swell reaches up a shelving crown, and 80 m
  // of reach is the width of the water between the home harbour and the near
  // clusters: past that the boats are on the ferry route, not going home.
  croft: {
    minIsle:   5.5,
    freeboard: 0.9,
    reach:     80,
  },

  beacon: {
    minRock:   6,
    freeboard: 1.2,
    turn:      4,
    lamp:      0.34,

    // Measured rather than chosen: the optic's warm white is ~0.76 linear and
    // the lamp opens at 0.34 of it, so the frame saw ~0.26 against a threshold
    // of 0.94. Five puts the core comfortably over and leaves the far end of
    // each blade under, which is the lamp glowing and not the whole beam.
    glow:       5,
    beamReach:  88,
    beamSpread: 11,
  },
}
