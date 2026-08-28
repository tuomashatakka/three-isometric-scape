import type { AppModule } from 'threejs-scene'
import type { QualityEffects } from './quality.ts'


export type GradeName = 'natural' | 'cinematic' | 'warm' | 'cool' | 'noir' | 'dream' | 'nordic'

/**
 * A satellite islet, in fractions of the terrain half-extent.
 *
 * Applied *after* the island falloff, so the rim drowning that keeps the
 * terrain plane's square edge under water never touches them — they are their
 * own little islands standing in open sea.
 */
export interface Isle {
  x: number
  z: number

  /**
   * Outer radius, where the skirt meets the seabed. Dry land reaches roughly
   * `0.72 * radius`; see the plateau profile in `landscape/height.ts`.
   */
  radius: number

  /** Crown height above the waterline, in metres. */
  height: number
}

/** Per-type instance budgets, before the quality tier scales them. */
export type LandmassProfile = 'home' | 'ridge' | 'meadow' | 'sound' | 'fell'

/**
 * One inhabited island, surveyed in its own local coordinate frame.
 *
 * The origin is the only world-space value. Everything else is fed through the
 * existing single-island survey unchanged, which keeps the yard, coast, creek,
 * landing and path solvers agreeing about the same ground.
 */
export interface LandmassSpec {
  id:         string
  profile:    LandmassProfile
  origin:     readonly [number, number]
  seedOffset: number

  /** Whether this landmass inherits the home island's surrounding skerries. */
  satellites: 'home' | 'none'

  /**
   * Only what this island's ground does *differently*.
   *
   * The top-level `terrain` and `layout` sections are the defaults, and an
   * island that omits a field simply has the home island's answer for it. That
   * is not tidiness: the home landmass used to restate all eleven of those
   * numbers verbatim, which meant every one of them existed twice and had to be
   * kept in agreement by hand — and the two were read by different code, so a
   * pair that drifted apart would have shown up as a farm sited on one island
   * and drawn on a differently shaped one.
   */
  terrain?: Partial<LandmassTerrain>
  layout?:  Partial<LandmassLayout>

  /**
   * How closely this island is drawn and dressed, relative to the home island.
   *
   * One number for both, because they are one question: an island the camera
   * rarely reaches does not need the home island's metres-per-quad *or* its
   * stems-per-hectare, and two knobs for that would be two knobs to keep in
   * agreement. Terrain segments and every scatter budget scale by it together.
   *
   * 1 is the home island's own density. Below about 0.3 the coastline starts to
   * facet visibly at the near zoom; above 1 an outer island costs more than the
   * farm does, for ground nobody stands on.
   *
   * It is not a *look* knob dressed as a budget — an island at 0.45 reads as
   * wilder rather than as emptier, because the farm's own props are counted per
   * holding and only the wild scatter is a density.
   */
  detail?: number
}

/** The part of `terrain` an island is allowed its own answer to. */
export type LandmassTerrain =
  Pick<ScapeConfig['terrain'], 'size' | 'height' | 'shoreBand' | 'islandInner' | 'islandOuter' | 'ruggedness' | 'reliefSmoothing'>

/** The part of `layout` an island is allowed its own answer to. */
export type LandmassLayout = Pick<
  ScapeConfig['layout'],
  'yardRadius' | 'trackWidth' | 'plotCount' | 'forestBias' | 'harbourSpread' | 'pastureRadius'
>

/**
 * One island's ground, resolved out of the defaults and its own overrides.
 *
 * The single place that knows a spec is partial. Everything that asks an island
 * how big it is goes through here — the separation check, the mist's land mask,
 * the terrain patch and the local survey — so there is one answer rather than
 * one per caller.
 */
export function landmassTerrain (config: ScapeConfig, spec: LandmassSpec): ScapeConfig['terrain'] {
  return {
    ...config.terrain,
    ...spec.terrain,

    // The skerries belong to the home island's own composition. An outer
    // landmass that inherited them would be surrounded by a ring of rocks
    // measured against a coastline it does not have.
    isles: spec.satellites === 'home' ? config.terrain.isles : [],
  }
}

/** One island's composition, resolved the same way. See {@link landmassTerrain}. */
export function landmassLayout (config: ScapeConfig, spec: LandmassSpec): ScapeConfig['layout'] {
  return { ...config.layout, ...spec.layout }
}

/** How closely an island is drawn and dressed. See {@link LandmassSpec.detail}. */
export function landmassDetail (spec: LandmassSpec): number {
  return Math.max(0.05, spec.detail ?? 1)
}

export interface DressingBudget {
  spruce:     number
  pine:       number
  birch:      number
  deadSpruce: number
  sapling:    number
  stump:      number

  /** Juniper bushes on the open heath, spaced like the other structural shrubs. */
  juniper:    number
  grass:      number
  heather:    number
  wildflower: number
  reeds:      number
  lilyPads:   number
  crop:       number
  erratic:    number
  fieldStone: number
  cobble:     number

  /**
   * Cobbles set into the tread itself — what makes the network a paved one
   * rather than a strip of bare earth.
   *
   * Sampled along the traced legs rather than thrown at the island and tested,
   * so every one of these lands on a path and the count is the count. Turn the
   * footpath wear to zero and there are no legs to sample: the stones go with
   * the paths they were laid on, without a second switch.
   */
  pathStone: number
  cairn:     number
  hayBale:   number
  firewood:  number
  barrel:    number
  driftwood: number

  /** Stakes in the shallows — count before the tier scales it. */
  mooringPost: number

  /** Drying poles standing in the upland pasture. */
  hayPole: number
}

export interface ScapeConfig {
  seed:    number
  terrain: {
    size:       number
    height:     number
    waterLevel: number

    /** Vertical band around the waterline that gets shelved into a beach. */
    shoreBand: number

    /** Fraction of the half-extent where the island starts falling away. */
    islandInner: number

    /** Fraction of the half-extent where the island has fully sunk. */
    islandOuter: number

    /** How far below the waterline the seabed sits, in metres. */
    seabedDrop: number

    /**
     * Offshore islets. Nobody farms them, and one of them carries the light —
     * whichever the search in `landscape/beacon.ts` finds furthest out.
     */
    isles: readonly Isle[]

    /** World units per tile of the ground grain. */
    detailScale: number

    /** Ground grain contrast, 0..1. */
    detailGrain: number

    /** Weight of the broad second octave of grain, relative to the fine one. */
    detailMacro: number

    /**
     * Fraction of the island kept gentle, 0..1.
     *
     * A low-frequency noise field decides per region whether the ground is
     * gentle or rugged. At 0.55, roughly55% of the island is compressed toward
     * flat while the remaining 45% retains full relief — giving rolling,
     * walkable ground with concentrated steep places rather than a uniform
     * slope everywhere. Raising this makes more of the island gentle; lowering
     * it spreads the steep ground across a wider area.
     */
    ruggedness: number

    /**
     * How much gentle ground is compressed toward flat, 0..1.
     *
     * A power curve applied to the normalised elevation in regions the
     * ruggedness mask marks as gentle. At 0.7 the mid-slopes are pulled down
     * so the ground between peaks reads as markedly gentler than the peaks
     * themselves; at 0 the shaping is off and every slope carries the same
     * relief it started with. The steep regions are never touched — this only
     * softens the ground that the ruggedness mask has already chosen.
     */
    reliefSmoothing: number

    /**
     * Grain on everything the ground grain cannot reach, 0..1.
     *
     * The soil treatment weighs itself by how horizontal a face is, so walls,
     * gables, hulls, jetty timbers and granite faces get none of it — this is
     * the same idea with the projection turned on its side, so the read runs
     * along a board rather than across it. 0 leaves every upright surface flat
     * shaded, which is what the scape looked like before it existed.
     */
    propGrain: number
  }

  /**
   * The inhabited archipelago.
   *
   * terrain.size remains the home island's local size so every existing pure
   * layout test keeps its metre scale. worldSize is the separate span used by
   * the shared terrain, water, atmosphere and camera.
   */
  archipelago: {
    worldSize:  number
    landmasses: readonly LandmassSpec[]
  }

  /**
   * The scheduled ferry fleet.
   *
   * Runtime motion stays live and may reach zero; clearance and navigation
   * values shape the surveyed route and deliberately stay out of the overlay.
   */
  boats: {

    /** Metres travelled per second. 0 freezes the fleet. */
    speed: number

    /** Seconds all boats remain tied up after every boat has reached its next island. */
    dwellSeconds: number

    /** Maximum hull turn rate in radians per second. */
    turnRate: number

    /** Metres sampled either side of a hull to resolve its smooth route tangent. */
    turnLookAhead: number

    /** Minimum ground depth below the surface along a route, in metres. */
    clearance: number

    /** Minimum centre-to-centre distance between boats, in metres. */
    separation: number

    /** A* navigation grid spacing, in metres. */
    routeCell: number

    /** Distance beyond a jetty bank where a route may receive a boat. */
    dockReach: number
  }

  /** Knobs for the authored composition — the farmstead, its track and its fields. */
  layout: {
    yardRadius: number
    trackWidth: number
    plotCount:  number

    /** Metres between fence posts around a field plot. */
    fenceSpacing: number

    /** How strongly conifers cluster onto the ridges, 0..1. */
    forestBias: number

    /**
     * Degrees around the yard between the jetty's shoreline and the boathouse's.
     *
     * The harbour wants two coves, not one crowded bank — this is how far along
     * the shore the boathouse sits from the landing. Signed, so it can be put on
     * either side of the jetty.
     */
    harbourSpread: number

    /**
     * Radius of the walled upland pasture, in metres.
     *
     * Sized against the island rather than against the farm: the search that
     * sites it has to fit this whole disc onto high ground that the yard, the
     * plots and the track have all left alone, so raising it past roughly a
     * third of `landRadius` is how the pasture stops existing at all.
     */
    pastureRadius: number

    /** Width of the gap left in the pasture wall for its gate, in degrees. */
    pastureGateway: number
  }

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

  /**
   * The light that follows the cursor over the ground.
   *
   * A warm point light that sits at the point on the landscape under the mouse
   * pointer, so moving the cursor over the scape lights the ground, props and
   * buildings around it — a torch the reader carries. It is day-dependent the
   * same way the coastal lamp is: a lantern at midday is invisible and costs the
   * same forward-lit pass as a lantern at midnight, so the strength scales with
   * how far the sun is down.
   *
   * Every one of these is read per frame, and every one of them is in the
   * overlay. There is nothing build-time here: the light follows the pointer and
   * the daylight, both of which are resolved each tick. `intensity` at zero is
   * the switch — there is nothing to draw and the module does not mount.
   */
  cursorLight: {

    /** Lamp colour, as a hex integer. Warm by default — lantern light, not LED white. */
    color: number

    /**
     * Lamp brightness. 0 is a light that was never carried, and it is the switch.
     *
     * Scaled by how far the sun is down, so the lamp comes up through dusk and
     * out again at dawn without this being touched — the same way the coastal
     * lamp works. The multiplier is `(1 - day)^2`, so midday is invisible and
     * midnight is full strength.
     */
    intensity: number

    /**
     * How far the light reaches, in metres.
     *
     * Metres and not a fraction of the view: the light throws the same radius
     * of ground at any zoom, which is what a carried lantern does. 15 m is a
     * small clearing around the pointer — enough to see nearby props and the
     * ground they stand on, not a floodlight.
     */
    distance: number

    /** How quickly the light falls off, 0..2. 2 is physically correct inverse-square. */
    decay: number

    /**
     * Metres above the ground point the light sits at.
     *
     * A light buried in the surface it is lighting throws nothing. Two metres
     * is just over head height — close enough to feel like a carried lamp,
     * high enough to cast downward onto the ground and the props.
     */
    lift: number

    /**
     * Damping time constant for position and intensity smoothing, in seconds.
     *
     * The light does not snap to the raw pointer position every frame — that
     * reads as jitter because the pointer sample is not continuous. Instead it
     * is damped toward the target with an exponential form that is frame-rate
     * independent: `1 - exp(-dt / tau)`. 0.15 s is a quarter of a sixth at
     * sixty hertz, fast enough to feel responsive and slow enough to smooth
     * out a sub-pixel twitch.
     */
    damping: number
  }

  /**
   * The fires in the farmhouse and the sauna, and the smoke standing over them.
   *
   * Every one of these is live, and every length here is **metres and stays
   * metres**. A chimney is the same chimney over a wider archipelago and at any
   * zoom, so nothing in this section is scaled by `archipelago.worldSize` or by
   * the live `viewSize` — the audit the scale rule asks for, written down at the
   * knob rather than discovered by a later run.
   *
   * Where the stacks *are* is not here: that comes out of the survey and the
   * prop's own frame — see `FARMHOUSE_CHIMNEY` in `props/buildings.ts` — the
   * same way the lantern hubs and the mill's wheels do.
   */
  hearth: {

    /**
     * How thick the smoke stands over the roofs, 0..1.
     *
     * 0 is a farm with cold hearths, and it is the switch — there is no plume to
     * draw when this is zero. How much harder the fires are banked in the cold
     * is the year's business; see {@link ScapeConfig.hearth.winter}.
     */
    smoke: number

    /** Metres a plume climbs before it has thinned into the air. */
    rise: number

    /**
     * Metres a plume climbs in a second. 0 hangs the smoke where it stands.
     *
     * Its own rate rather than a share of `wind.speed`, because a column rises
     * on the heat under it and would go on rising on a still day. It is
     * therefore its own line in `STILL` — see `scripts/scape-shot.ts`.
     */
    speed: number

    /**
     * How hard a plume answers the wind, 0..1.
     *
     * A response, not a speed, the way `atmosphere.cloudDrag` and
     * `atmosphere.mistDrag` are: the bearing and the strength are the scape's
     * one wind, and this only decides how far downwind the column has been laid
     * over by the time it has climbed its full {@link ScapeConfig.hearth.rise}.
     */
    drag: number

    /**
     * How much harder the fires are banked in deep winter, as a multiple of
     * {@link ScapeConfig.hearth.smoke}.
     *
     * 0 is a farm that burns the same fire in July it burns in January. There is
     * no second winter strength, because there is one year in the scape: what
     * this reads is the same `season.growth` the grass is withered by.
     */
    winter: number
  }

  /**
   * The lamps behind the farmstead windows.
   *
   * Every one of these is read per frame, so every one of them is in the
   * overlay. There is nothing build-time here on purpose: even which windows are
   * occupied is a kept draw compared against `occupancy` each frame rather than
   * a lit set decided at build, so turning the farm up at midnight is a slider
   * rather than a reload. How much geometry the spill is drawn from is the
   * tier's — see `quality.lampSpill`.
   *
   * There is no length in this section, which is worth saying out loud given the
   * scale rule: the glow is sized by the pane it comes out of, in the pane's own
   * units, and `props/lamp.ts` is where that decision is written down.
   */
  windows: {

    /**
     * How brightly a lit pane burns, and the switch — 0 is a farm that never
     * lights a lamp. Whether it is *dusk* is the sun's business.
     */
    glow: number

    /**
     * How much of the farm is occupied, 0..1.
     *
     * Weighted per building by how lived-in it is, so this lights the farmhouse
     * before the sauna and the sauna before the byre. 1 is every pane in the
     * archipelago burning, which reads less like a farm than like a hotel.
     */
    occupancy: number

    /** Phase of the day the household is up, 0..1. 0 is midnight, 0.5 is noon. */
    rising: number

    /** Phase of the day it turns in. At or before {@link rising}, nobody gets up. */
    bedtime: number

    /**
     * How low a window falls once the house is asleep, 0..1.
     *
     * Not to nothing: a farmhouse at four in the morning still has a stove in
     * it, and a scape whose farms go absolutely black at the small hours reads
     * as abandoned rather than as asleep.
     */
    banked: number

    /**
     * Wobbles a second in a lamp's flame. 0 holds every lamp dead steady.
     *
     * Its own rate rather than a share of the wind — a wick gutters indoors on a
     * still night — and therefore its own line in `STILL`. See
     * `scripts/scape-shot.ts`.
     */
    flicker: number

    /** How deep the wobble goes, 0..1. 1 takes a lamp all the way out at the bottom. */
    unsteady: number
  }
  dressing: DressingBudget

  /**
   * The gulls, and the water they wheel over.
   *
   * Split the way `mill` and `beacon` are, and along the same seam: `spread` is
   * what the colony search is allowed to fit over open water, read once when the
   * archipelago is surveyed, so it stays out of the overlay. Everything else is
   * a uniform read every frame.
   *
   * Every length here is **metres** and stays metres. A gull is the same bird
   * over a bigger archipelago and at any zoom, so none of this is scaled by
   * `archipelago.worldSize` or by the live view — which is exactly the audit the
   * scale rule asks for, written down at the knob rather than discovered later.
   */
  birds: {

    /**
     * How much of the colony is up, 0..1. 0 is a coast whose gulls never fly.
     *
     * It is also the switch, and the only one: how many are up on any given hour
     * is the daylight's business and how many a squall keeps down is the
     * weather's. See `birdsAloft` in `birds.ts`.
     */
    flight: number

    /** Radians a bird sweeps around its colony every second. 0 hangs the flock where it is. */
    speed: number

    /** Wingbeats a second. 0 sets the wings where they are and holds them. */
    flap: number

    /** Metres from tip to tip. */
    wingspan: number

    /** Metres above the waterline the highest ring cruises at. */
    ceiling: number

    /**
     * Metres from a colony's centre to its outermost ring.
     *
     * What the siting search *asks* for rather than what it gets: a ring is
     * shrunk until no bearing around it crosses dry land, and a harbour with no
     * room for even a reduced ring carries no flock at all. Build-time, because
     * the colonies are surveyed once — see `landscape/colony.ts`.
     */
    spread: number
  }

  /**
   * The wind, and the only one in the scape.
   *
   * Every system that answers to it keeps a dimensionless *response* rather than
   * a rate of its own — `atmosphere.cloudDrag`, `atmosphere.mistDrag`,
   * `mill.spin`, the gulls' wingbeat — so one gust is one wave crossing the
   * grass, the mist, the sea and the sky together. See `scene/wind.ts`.
   */
  wind: {

    /** How hard it is blowing at rest, before the gust lifts it. 0 is a still day. */
    strength: number

    /**
     * How fast the wind travels, per unit of strength.
     *
     * The rate for everything, including the gust front — a wind that blows
     * harder brings its squalls through faster, and a separate fronts-per-minute
     * knob was a second rate saying the same thing twice. 0 freezes every
     * surface the scape scrolls *and* the front with it, which is the whole of
     * what a still needs.
     */
    speed: number

    /** Compass bearing the wind blows toward, in degrees. */
    bearing: number

    /**
     * How much the front varies, 0..1.
     *
     * The switch for the gusting, and the only one: 0 is a steady wind that
     * neither strengthens nor veers, however fast `gustSpeed` is running.
     */
    gust: number

    /** Phase of the gust front, 0..1. Carried by `wind.speed`. */
    time: number
  }

  /** The lake's surface response. Every one of these is live. */
  water: {

    /** Sun-glitter strength, 0 disables the speckle. */
    sparkle: number

    /** Swell amplitude in metres. */
    waveHeight: number

    /** Ripple normal perturbation. */
    rippleStrength: number

    /** Analytic foam/ripple strength behind moving boats. 0 removes their wakes. */
    wakeStrength: number

    /**
     * How hard it breaks on the shore the swell is running into, 0..1.
     *
     * The switch for the surf, and the only one: 0 leaves every coast with the
     * thin foam trim it had before there was any weather side to be on. Lifted
     * by `wind.strength`, so a gust whitens the coast without this being
     * touched — and a still day leaves a wash rather than nothing, because a
     * surf that a capture could zero by accident is a surf nobody photographs.
     */
    surf: number

    /**
     * Metres of water depth the breakers reach out over.
     *
     * **Metres, and they stay metres.** A wave feels the bottom at a depth set
     * by the wave, not by how wide the world is or how far the camera is pulled
     * out — so this is neither world-sized nor frame-sized, and a wider
     * archipelago must not scale it. What it *does* scale with is the ground:
     * the white water is as wide as the shelf is, so a shallow bay foams far
     * out and a rock that falls away sheer barely foams at all, and neither of
     * those had to be authored.
     */
    surfDepth: number

    /**
     * How strongly the weather shore is favoured over the lee, 0..1.
     *
     * 0 breaks the same all the way round an island, which is the coastline the
     * scape had; 1 gives the lee nothing at all. In between is a coast whose
     * sheltered side still works, which is what a real one does.
     */
    surfExposure: number

    /**
     * Specular spread. Low values concentrate the sun into a lobe narrow
     * enough to flare the whole lake white at the angle that catches it.
     */
    roughness: number

    /**
     * How far out of the shallows the winter ice carries, 0..1.
     *
     * 0 freezes the open sea as readily as the bank, which is a lake rather
     * than a coast; 1 confines the ice to water shallow enough to lose its
     * heat in a season. See `season.ice` for whether it freezes at all.
     */
    iceReach: number

    /**
     * How ragged the ice edge is, 0..1.
     *
     * The ice front follows depth, and depth alone draws a contour line around
     * the island. This is what breaks that line into floes — and at 0 the
     * winter sea reads as a bathymetry chart with the ice-fill turned on.
     */
    iceBreak: number
  }
  camera: {
    viewSize:    number
    minViewSize: number
    maxViewSize: number
    rotation:    number

    /**
     * Where the camera opens on, in world metres.
     *
     * The middle of the world, and the middle of the world is open sea — which
     * is the right place to arrive but the wrong place to have to stay. Nothing
     * on the ground can be captured from a pose that cannot be aimed, so a
     * still of a rut, a doorstep or a fence line needs this and a small view
     * size. Read once, when the controls are built; dragging moves the live
     * focus and does not write back here.
     */
    focusX: number
    focusZ: number

    /** Elevation in degrees at full zoom-in — low reads flat and cinematic. */
    tiltNear: number

    /** Elevation in degrees at full zoom-out — steep reads like a map. */
    tiltFar: number
  }
  atmosphere: {
    fogDensity: number
    fogBreath:  number
    mistAmount: number

    /**
     * How hard the ground mist answers the wind, 0..1.
     *
     * A response, not a speed. The rate is `wind.speed` and the direction is
     * `wind.bearing`; this only decides how much of that the sheets take, which
     * is what keeps a bank of fog moving slower than the cloud above it without
     * either of them having a wind of its own.
     */
    mistDrag:     number
    skyTop:       number
    sunColor:     number
    sunStrength:  number
    hemiSky:      number
    hemiGround:   number
    hemiStrength: number

    /** Drifting cloud-shadow darkness, 0..1. */
    cloudShadow: number

    /** World units per cloud-map tile. */
    cloudScale: number

    /**
     * How hard the cloud answers the wind, 0..1.
     *
     * Shared by the deck overhead and the shadow it casts on the ground, which
     * is the point: before the wind was shared these two scrolled at one speed
     * along two different headings, and a cloud crossed the sky one way while
     * its own shadow crossed the island another.
     */
    cloudDrag: number

    /** Sky-deck opacity when fully zoomed out, 0 disables the deck. */
    cloudCover: number

    /** Height of the sky deck above the waterline, in metres. */
    cloudHeight: number

    /**
     * Auroral brightness, 0 takes the veils off the sky.
     *
     * It is also the switch, and the only one — how much of it is on any given
     * night is the two clocks' business. See `aurora.ts`.
     */
    aurora: number

    /**
     * Height of the auroral deck above the waterline, in metres.
     *
     * Held above {@link cloudHeight} by the module whatever it is set to, so the
     * weather passes beneath the light rather than through it. Past about 70 the
     * deck climbs over the camera itself, which at full zoom-out is only eighty
     * metres up, and the sky goes dark again.
     */
    auroraHeight: number

    /** How fast the veils travel. Their own drift — an aurora does not blow on the wind. */
    auroraSpeed: number

    /**
     * Brightness of the star field. 0 is a sky that never comes out.
     *
     * It is also the switch, and the only one: how much of the field is up on
     * any given night is the daylight clock's business, and how far round it has
     * turned is that clock's phase read as an hour angle. See `nightsky.ts`.
     */
    starlight: number

    /**
     * Brightness of the moon. 0 takes the disc out of the sky.
     *
     * Above 1 on purpose by default: the disc has to clear the bloom's threshold
     * to bloom rather than merely be pale, the same trade `beacon.glow` is
     * written down for. The phase scales it, so a new moon is dark without this
     * being touched, and there is no separate switch for the month.
     */
    moonlight: number
  }

  /**
   * The clock.
   *
   * Colours are not keyframed here — the atmosphere palette above stays the noon
   * anchor and dusk and night are derived from it. See `daylight.ts`.
   */
  daylight: {

    /** Phase of the cycle, 0..1. 0 is midnight, 0.5 is noon. */
    time: number

    /** Full cycles per minute. 0 freezes the sky wherever `time` left it. */
    speed: number

    /** Compass bearing the noon sun is placed at, in degrees. */
    azimuth: number

    /**
     * How far north the coast is, in degrees.
     *
     * Not a look knob dressed as a place: the whole arc is solved from it, so
     * this is what decides how high the noon sun gets, how long the day is and
     * how far round the sky the light sweeps — each of them a different answer
     * every week of the year. Past the arctic circle at 66.56 the extremes stop
     * being figures of speech and the scape gains a polar night and a midnight
     * sun; below it the year still swings, it just never runs out of range.
     */
    latitude: number

    /**
     * How far the axis leans, in degrees.
     *
     * The seasonal coupling itself, and the switch for it: 0 is a world whose
     * axis stands straight, whose every day is an equinox, and whose sun runs
     * the same arc in December it ran in June. There is no separate flag,
     * because this is the flag.
     */
    axialTilt: number

    /** Golden-hour tint, pulled toward as the sun nears the horizon. */
    dusk: number

    /** Night tint, pulled toward once the sun is under it. */
    night: number

    /** Ambient floor at night, so midnight reads as moonlit rather than as black. */
    nightLift: number
  }

  /**
   * The year.
   *
   * The second clock, and deliberately the same shape as the first: a phase, a
   * speed, and strengths for what the phase derives. Colours are not keyframed
   * per month — the palette below stays the midsummer anchor and `season.ts`
   * derives the rest of the year from it.
   */
  season: {

    /** Phase of the year, 0..1. 0 is midwinter, 0.5 is midsummer. */
    time: number

    /** Full years per minute. 0 freezes the year wherever `time` left it. */
    speed: number

    /** How white deep winter gets, 0..1. 0 is a scape that never sees snow. */
    snow: number

    /**
     * Metres above the waterline where lying snow starts to hold.
     *
     * Absolute height, not slope: the beach is warmed by the sea it sits in and
     * the fields above it are not, so a snow line just off the waterline is what
     * puts the white on the island rather than on the shore.
     */
    snowLine: number

    /** How hard the year turns and withers what is green, 0..1. */
    turn: number

    /**
     * How hard the winter shuts the water, 0..1. 0 is a sea that never freezes.
     *
     * Separate from `snow` because they are separate winters: the land whitens
     * on one cold night and the sea needs the whole season, so the two curves
     * neither start nor end together. `water.iceReach` decides how far out from
     * the bank this carries.
     */
    ice: number

    /**
     * How hard the open water steams once the air has turned, 0..1. 0 is a
     * coast that never smokes.
     *
     * Its own strength rather than a share of `atmosphere.mistAmount`, because
     * sea smoke is not the ground mist gone offshore: the mist stands over the
     * island all year round, and this is a fortnight of the winter standing
     * exactly where the mist has already faded out. It is also the switch —
     * there is nothing to smoke over when this is zero.
     */
    seaSmoke: number
  }

  /**
   * The weather.
   *
   * The third clock, and the same shape as the two above it: a phase, a speed,
   * and everything else derived from the phase. What it deliberately does not
   * carry is a snowfall strength — `weather.ts` takes what falls from the year
   * and only decides how hard it comes down, so there is one winter in the scape
   * rather than two that have to be kept in step.
   */
  weather: {

    /** Phase of the front, 0..1. 0 is the middle of the clear spell. */
    time: number

    /** Fronts per minute. 0 freezes the sky wherever `time` left it. */
    speed: number

    /**
     * How hard it comes down at the height of a squall, 0..1.
     *
     * 0 is a coast it never rains on, and it is the switch — there is no drop to
     * draw and no ground to wet when this is zero.
     */
    rain: number

    /** How dark and how glossy the wet leaves the ground it fell on, 0..1. */
    wet: number

    /**
     * Metres a drop falls in a second.
     *
     * The knob that stops the fall, and the reason it is a knob at all: a rate
     * hard-coded into the module could not be zeroed, and a scape whose rain
     * cannot be stopped cannot be photographed twice the same way. Snow comes
     * down at a fraction of it — see `uSleet` in `rain.ts`.
     */
    fall: number
  }
  look: {
    grade:     GradeName
    intensity: number
    vignette:  number
    grain:     number
    bloom:     number
    tiltShift: number

    /** Volumetric sun-shaft strength, 0 disables the pass. */
    godRays: number

    /** Anamorphic streak strength on the ultra tier, 0 disables. */
    anamorphic: number

    /** Ambient-occlusion strength on the ultra tier, 0 disables. */
    ao: number
  }
  palette: {
    sky:          number
    fog:          number
    deepWater:    number
    shallowWater: number
    foam:         number
    silt:         number
    shore:        number
    meadow:       number
    dryGrass:     number
    heath:        number
    scree:        number
    lichen:       number

    /**
     * Bladderwrack on wet stone — the tidal band on the rocks in the open sea.
     *
     * Olive-brown and very dark, because weed out of the water nearly is. Its
     * own entry rather than a reuse of `heath` or `streambed`: the band has to
     * read as a different substance from the rock it is on, and a second name
     * for an existing tone is how two rocks in one scape end up different
     * colours. See `ScapeConfig.littoral`.
     */
    wrack: number

    /** Mown upland grass — the clearing inside the pasture wall. */
    pasture: number

    /** Wet gravel in the beck's channel, above and below the waterline alike. */
    streambed: number

    /**
     * Bare earth underfoot. Greyer and darker than `track`, because a cart road
     * is gravel laid down and a footpath is only the turf taken off.
     */
    trodden: number
    track:   number
    tilled:  number
    yard:    number

    /** Lying snow. The one colour the year adds that the scape has no other use for. */
    snow: number

    /** Turned leaf — what the year leans the straw toward in autumn. */
    autumn: number

    /**
     * Sea ice. Colder and greyer than lying snow on purpose — new ice is the
     * water seen through it, and it only goes white where it has been broken.
     */
    ice: number

    /**
     * A falling drop.
     *
     * Not the water's colour and not the fog's. A streak of rain seen against
     * dark ground is the sky it is falling out of, so this is a pale, slightly
     * blue grey — and the same streak is mixed toward `snow` as the year freezes
     * it, which is why there is no second colour for the snowfall.
     */
    rain: number

    /**
     * The cool end of the star field.
     *
     * One colour rather than two: the warm end of the field is the scape's own
     * `daylight.dusk` amber, so the sky's warm and its low sun stay in one
     * family and there is no second red that only the stars can be tuned by.
     */
    star: number

    /** The lit face of the moon. Paler and cooler than lying snow — it is a light, not a surface. */
    moon: number

    /**
     * Wood smoke, at the mouth of the flue.
     *
     * Neither the fog's grey nor the snow's white, and one colour rather than
     * two: a plume is dense and warm where it leaves the brick and pale where it
     * has spread, and the pale end is this same colour seen through less of it.
     * Browner than `fog` on purpose — birch smoke off a damp autumn fire is not
     * the sea haze it drifts into.
     */
    smoke: number

    /**
     * A gull, at its brightest.
     *
     * One colour rather than three, the way the star field carries one: a gull
     * is a white bird with a grey back and black tips, and both of those are
     * this white seen at a fraction of it. Three entries would be three things
     * to keep in one family by hand, and the first retune is when they stop
     * being in one.
     */
    gull: number

    /** The dense heart of an auroral curtain, where it is thick enough to be green. */
    aurora: number

    /** What the same curtain thins out to at its fringes and its crown. */
    auroraCrown: number
  }

  /**
   * What the machine is asked for, rather than what the scape is made of.
   *
   * Everything else here describes the place. These three describe the budget it
   * is drawn on, and they are the only values in the config that are seeded from
   * the resolved quality tier rather than authored — which is also why they are
   * the only section the settings store deliberately does not persist. A pixel
   * ratio kept from one session and replayed into the next is how a device that
   * has already lost a context gets handed back the budget that took it.
   */
  runtime: {

    /** Ceiling on `devicePixelRatio`, applied live. */
    pixelRatio: number

    /** Frames drawn per second. 0 draws on every animation frame the display offers. */
    frameCap: number

    /**
     * Frames between shadow-map rebuilds. 1 rebuilds every frame.
     *
     * Three rebuilds the whole depth pass — terrain, the merged steading and
     * every scattered instance — on every single frame by default, at up to
     * 4096². Nothing in this scape moves fast enough to need that: the sun
     * crosses the sky over minutes and the foliage sway is a slow shader
     * animation, so refreshing the map every other frame is invisible and costs
     * half the pass.
     */
    shadowCadence: number

    /**
     * Which effects the scape is allowed to build.
     *
     * `tier` is the device's own budget: the cheap tiers leave whole systems out
     * rather than drawing bad versions of them. `all` overrules that and builds
     * every effect the scape has on whatever tier is running, at that tier's
     * scale — a phone gets the aurora and the optical chain, with one veil
     * rather than three.
     *
     * Not a thing to reach for lightly, and deliberately not the default: the
     * mobile tier drops the post chain because a PowerVR handset loses its
     * WebGL context to it, and this is the switch that puts it back. Changing it
     * rebuilds the scape, because most of what it turns on is decided when the
     * renderer and its programs are made rather than per frame.
     */
    effects: QualityEffects
  }
}

/**
 * The config as of the tick being drawn.
 *
 * Call it on every read, and never hold what it hands back. The app's store is
 * the config's owner once the scape has mounted, and it commits a *new* object
 * on every write — so a section destructured at build time and read every frame
 * is a section frozen at whatever it held before the reader touched a slider.
 * Anything that outlives a single tick takes this instead of a `ScapeConfig`,
 * which is a distinction the compiler enforces rather than a rule to remember.
 */
export type LiveConfig = () => ScapeConfig

/** Every module in this scape projects the same state: the config itself. */
export type ScapeModule = AppModule<ScapeConfig>

export const SCAPE_CONFIG = {
  seed:    7_319,
  // The plane is far wider than the island it carries. `islandInner` and
  // `islandOuter` are fractions of the half-extent, so they are scaled to keep
  // the farmstead's landmass exactly where it was — the extra span is open sea,
  // and it is the only place islets big enough to read as islets can stand
  // without either merging into the mainland or running off the plane's edge.
  terrain: {
    // The island is a bearing away from a disc, not a radius: `sinkToIsland`
    // warps the falloff with the coast noise, so neither of these two is a
    // shoreline any more. `islandInner` is where the *average* bearing starts
    // falling away and `islandOuter` where it has finished; the coast wanders
    // either side of that band by `COAST_REACH` of its width, which is what
    // `landRadiusOf` subtracts back off to find ground that is dry whichever way
    // you walk. Widening the band buys raggedness and spends buildable middle.
    size:        196,
    height:      11.5,
    waterLevel:  -1.25,
    shoreBand:   1.15,
    islandInner: 0.52,
    islandOuter: 0.63,
    seabedDrop:  9,
    // An archipelago, not a pair of outliers. Every one of these clears the
    // mainland's `islandOuter` and its neighbours' skirts, so they surface as
    // separate islands rather than merging into a reef — the spacing is the
    // whole design, and it is why the ring reads as distance.
    // An archipelago, not a pair of outliers. Every one of these clears the
    // mainland's warped shore and its neighbours' skirts, so they surface as
    // separate islands rather than merging into a reef.
    //
    // The sizes are deliberately unequal and the spacing deliberately uneven.
    // A ring of like-sized islets at even bearings reads as decoration however
    // well each one is modelled — real archipelagos come in clusters with open
    // water between them, so these are grouped: a close pair off the west shore,
    // a scattered chain to the south, skerries too small to land on filling the
    // gaps, and one substantial outlier holding the north-east horizon.
    // Every one of these has to clear three things: the mainland's warped shore,
    // its neighbours' skirts, and — the one that is easy to forget — the plane's
    // own edge. An islet is placed by its centre and then grows a radius and a
    // warp on top of it, so `hypot(x, z) + radius * 1.34` is the number that
    // must stay under about 0.85. Past that the skerry is half in the void.
    // Every one of these has to clear three things: the mainland's *warped*
    // shore, its neighbours' skirts, and — the one that is easy to forget — the
    // plane's own edge. An islet is placed by its centre and then grows a radius
    // and a warp of its own on top of it, so the number that matters is
    // `hypot(x, z) ± radius * 1.34`: it must stay outside the mainland's
    // furthest headland (`islandOuter` plus the coast reach, about 0.70) and
    // inside about 0.88, past which the skerry is half in the void.
    isles:       [
      // The near western pair, close enough in to read as part of the place.
      { x: -0.754, z: 0.183, radius: 0.078, height: 5.2 },
      { x: -0.723, z: 0.376, radius: 0.045, height: 2.6 },

      // The southern chain, thinning as it runs out to sea.
      { x: 0.424, z: -0.666, radius: 0.068, height: 4.1 },
      { x: 0.602, z: -0.66, radius: 0.042, height: 2.3 },
      { x: 0.724, z: -0.656, radius: 0.026, height: 1.4 },

      // The north-eastern outlier, and the biggest thing out there.
      { x: 0.648, z: 0.401, radius: 0.088, height: 6.4 },
      { x: 0.795, z: 0.243, radius: 0.036, height: 2 },

      // Skerries. Barely more than rock, and the reason the water between the
      // clusters is not simply empty.
      { x: -0.26, z: -0.75, radius: 0.032, height: 1.6 },
      { x: 0.106, z: 0.799, radius: 0.055, height: 3.1 },
      { x: -0.346, z: 0.75, radius: 0.04, height: 2.2 },
      { x: -0.702, z: -0.378, radius: 0.062, height: 3.6 },
      { x: -0.613, z: -0.574, radius: 0.03, height: 1.5 },
      { x: 0.794, z: -0.255, radius: 0.034, height: 1.8 },
      { x: -0.577, z: 0.643, radius: 0.045, height: 2.5 },
      { x: 0.372, z: 0.735, radius: 0.042, height: 2.4 },
    ],
    detailScale:     7.5,
    detailGrain:     0.34,
    detailMacro:     0.62,
    ruggedness:      0.45,
    reliefSmoothing: 0.6,
    propGrain:       0.82,
  },
  // Five full holdings, each generated by the same local survey and projected
  // into one world only after its terrain, paths and landings have agreed. Their
  // terrain numbers are deliberately not cosmetic labels: the western island
  // is a compact high ridge, the eastern one a broader low meadow, and the two
  // great landmasses to the north are a drowned sound and a fell.
  archipelago: {
    worldSize:  1_520,
    landmasses: [
      // No `terrain` and no `layout`: the home island *is* the default, and the
      // sections above are where its eleven numbers live. Restating them here
      // is what this spec used to do, and it meant every one of them existed in
      // two places that nothing checked against each other.
      {
        id:         'home',
        profile:    'home',
        origin:     [ 0, 0 ],
        seedOffset: 0,
        satellites: 'home',
      },
      {
        id:         'ridge',
        profile:    'ridge',
        origin:     [ -178, 128 ],
        seedOffset: 20_311,
        satellites: 'none',
        terrain:    {
          size:        144,
          height:      14.8,
          shoreBand:   0.9,
          islandInner: 0.5,
          islandOuter: 0.69,
        },
        layout: {
          yardRadius:    14,
          trackWidth:    2.7,
          plotCount:     2,
          forestBias:    0.92,
          harbourSpread: -46,
          pastureRadius: 5,
        },
      },
      {
        id:         'meadow',
        profile:    'meadow',
        origin:     [ 178, 128 ],
        seedOffset: 40_927,
        satellites: 'none',
        terrain:    {
          size:        144,
          height:      7.6,
          shoreBand:   1.45,
          islandInner: 0.58,
          islandOuter: 0.73,
        },
        layout: {
          yardRadius:    14,
          trackWidth:    2.9,
          plotCount:     3,
          forestBias:    0.34,
          harbourSpread: 44,
          pastureRadius: 5,
        },
      },

      // The southern pair, and the reason the world is three times the span it
      // was. Each is ten times the *area* of the two outer holdings above —
      // 455 m across against 144 — which is a different kind of place rather
      // than a bigger version of the same one: a farm on either of these is a
      // holding on a landmass, with fell and forest it will never touch.
      //
      // Their patches sit 600 m apart on x and their coastlines about 300 m,
      // which is the water the strand crosses. Both clear `halfWorld` at 760
      // with 52 m to spare, and neither overlaps anything: `assertSeparate`
      // checks both rules and `archipelago.test.ts` states them as facts.
      //
      // `detail` at 0.45 is the whole affordability of this. Left at 1 the two
      // of them would take `areaScale` from 2.08 to 12.9 — every scatter budget
      // sixfold, and a placement solver that is O(claims) per attempt — and the
      // terrain patches would be 483 segments a side apiece. At 0.45 they are
      // drawn at about 1.4 m to a quad and dressed at half the farm's density,
      // which is what an uninhabited fell looks like anyway.
      {
        id:         'sound',
        profile:    'sound',
        origin:     [ -300, -480 ],
        seedOffset: 61_403,
        satellites: 'none',
        detail:     0.45,
        terrain:    {
          size:        455,
          height:      16.4,
          shoreBand:   1.2,
          islandInner: 0.5,
          islandOuter: 0.66,
        },
        layout: {
          yardRadius:    16,
          trackWidth:    2.8,
          plotCount:     2,
          forestBias:    0.84,
          harbourSpread: -40,
          pastureRadius: 7,
        },
      },
      {
        id:         'fell',
        profile:    'fell',
        origin:     [ 300, -480 ],
        seedOffset: 82_147,
        satellites: 'none',
        detail:     0.45,
        terrain:    {
          size:        455,
          height:      21.8,
          shoreBand:   0.95,
          islandInner: 0.47,
          islandOuter: 0.68,
        },
        layout: {
          yardRadius:    15,
          trackWidth:    2.6,
          plotCount:     2,
          forestBias:    0.66,
          harbourSpread: 42,
          pastureRadius: 8,
        },
      },
    ],
  },
  boats: {
    speed:         4.2,
    dwellSeconds:  7,
    turnRate:      1.4,
    turnLookAhead: 5,
    clearance:     0.42,
    separation:    7,
    routeCell:     5.2,
    dockReach:     6.4,
  },
  // The farmstead is not scaled with the island, and that is the point of a
  // bigger island: one holding on a landmass that is mostly wild, rather than a
  // landmass that is entirely one holding. Only the field count grows, because
  // three plots on this much arable read as a smallholding on a moor.
  layout: {
    yardRadius:     19,
    trackWidth:     3.2,
    plotCount:      4,
    fenceSpacing:   2.2,
    forestBias:     0.72,
    harbourSpread:  38,
    pastureRadius:  6,
    pastureGateway: 17,
  },
  creek: {
    width:      3.4,
    incision:   1.35,
    mouthDepth: 2.6,
    mouthFlare: 3.2,
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
  // A carried lantern. The colour is a warm amber — the same family as the
  // farmhouse lamps but without the pane to soften it. 0.6 of intensity is
  // visible against a daylit ground but not blinding at night; raising it past
  // about 1.5 would bloom on the desktop tier. 15 m of distance is a small
  // clearing; 2 m of lift is just over head height. 0.15 s of damping is fast
  // enough to feel responsive without reading as jitter.
  cursorLight: {
    color:     0xffa84c,
    intensity: 0.6,
    distance:  15,
    decay:     2,
    lift:      2,
    damping:   0.15,
  },
  // 11 metres of rise against a chimney standing 7 m over its own floor puts the
  // top of a plume at about 18 m — well clear of the 9 m peak on the home island
  // and well under the 34 m cloud deck, which is the band a column of smoke
  // actually occupies. 1.6 m/s is a domestic fire drawing steadily rather than a
  // bonfire. 0.55 of drag lays the column over by about six metres downwind at
  // the top of its climb in the authored breeze — a plume leaning hard without
  // being flattened onto the roof. 0.6 of winter takes midwinter to 0.99 — the
  // fire that is lit all day in January against the one lit for the sauna in
  // July, and just under the ceiling `hearthDensity` clamps at, so every week of
  // the year is a different plume rather than a third of them being the same
  // fully opaque one.
  hearth: {
    smoke:  0.62,
    rise:   11,
    speed:  1.6,
    drag:   0.55,
    winter: 0.6,
  },
  // A farmhouse keeps roughly two thirds of its windows lit in the evening, and
  // the weights in `landscape/windows.ts` take the sauna and the byre down from
  // there — so 0.66 is thirteen panes a holding of which six or seven burn,
  // which is a house with people in it rather than a row of identical lamps.
  //
  // Up at half past six and turned in at half past ten, which at this latitude
  // means the lamps are wanted for six hours in January and not at all in June —
  // and that is the daylight doing it, not a second seasonal knob.
  //
  // `banked` at 0.3 is what keeps a sleeping farm distinguishable from an empty
  // one, and 0.3 rather than the 0.12 it was first tuned at because the captures
  // are taken at the `mobile` tier, which has no bloom to spread a dim pane:
  // a tenth of the evening's brightness photographed as nothing at all at the
  // `yard-night` pose, which made the claim in the readme false at exactly the
  // frame that states it.
  windows: {
    glow:      0.95,
    occupancy: 0.66,
    rising:    0.27,
    bedtime:   0.94,
    banked:    0.3,
    flicker:   0.55,
    unsteady:  0.22,
  },
  // Roughly doubled against the run before this one, because the island is
  // roughly twice the ground. A budget is a *count*, not a density, so leaving
  // these alone would have grown the island and thinned everything standing on
  // it — the same forest spread over twice the hillside is a wood turning into
  // a scrub. What did not grow is the farm: one holding has the barrels, bales
  // and firewood one holding has, whatever it is standing on.
  dressing: {
    spruce:     520,
    pine:       180,
    birch:      148,
    deadSpruce: 48,
    sapling:    250,
    stump:      80,
    juniper:    140,
    grass:      1_700,
    heather:    500,
    wildflower: 230,
    reeds:      330,
    lilyPads:   70,
    crop:       560,
    erratic:    52,
    fieldStone: 176,
    cobble:     300,
    pathStone:  900,
    cairn:      14,
    hayBale:    14,
    firewood:   7,
    barrel:     9,
    driftwood:  44,

    mooringPost: 22,
    hayPole:     7,
  },
  // A 1.6 m wingspan is a great black-backed gull, the largest bird on this
  // coast, and it is the largest on purpose: pulled fully out a metre is three
  // pixels, and a herring gull's 1.2 m is a speck the grain eats. 26 m of
  // ceiling keeps the flocks well over the 9 m peak and under the 34 m cloud
  // deck. 28 m of spread is a ring the width of the harbour mouth — wide enough to
  // read as a wheel, tight enough that every bank in the archipelago fits one.
  birds: {
    flight:   0.85,
    speed:    0.34,
    flap:     1.6,
    wingspan: 1.6,
    ceiling:  26,
    spread:   28,
  },
  // A steady onshore breeze with a real gust in it. The bearing is the same
  // quarter the mill's search assumes the weather comes from — see
  // `landscape/mill.ts` — so the sails are turned into a wind that is now
  // actually blowing that way rather than into a wind nobody had written down.
  wind: {
    strength: 0.9,
    speed:    1.35,
    bearing:  -106,
    gust:     0.45,
    time:     0.31,
  },
  // 2.4 m of surf depth is where a swell of this size actually trips: at this
  // coast's shore band that is a broad wash off a beach and a narrow collar
  // round a granite face, which is the contrast the band exists for — the width
  // of the white water is the width of the shelf, and neither was authored per
  // island. 0.72 of exposure
  // leaves the lee about a quarter of the weather side's break — sheltered
  // rather than glassy, which is what a sound between islands actually looks
  // like on a day with a sea running.
  water: {
    sparkle:        0.5,
    waveHeight:     0.075,
    rippleStrength: 0.2,
    wakeStrength:   0.78,
    roughness:      0.62,
    iceReach:       0.62,
    iceBreak:       0.5,
    surf:           1,
    surfDepth:      2.4,
    surfExposure:   0.72,
  },
  // The screen-scale class, grown with the world it frames. `maxViewSize` is
  // what the cloud and aurora tiles are sized against, so a world that tripled
  // without it would have both of them repeating three times as often across the
  // archipelago and reading as wallpaper. `viewSize` opens on the whole thing.
  camera: {
    viewSize:    1_400,
    minViewSize: 8,
    maxViewSize: 1_600,
    rotation:    45,
    focusX:      0,
    focusZ:      0,
    tiltNear:    21,
    tiltFar:     52,
  },
  atmosphere: {
    fogDensity:   0.3,
    fogBreath:    0.08,
    mistAmount:   0.34,
    mistDrag:     0.36,
    skyTop:       0x5c727e,
    sunColor:     0xffe8bd,
    sunStrength:  2.85,
    hemiSky:      0xc2cfd2,
    hemiGround:   0x3d4433,
    hemiStrength: 0.72,
    cloudShadow:  0.42,
    cloudScale:   92,
    cloudDrag:    0.9,
    cloudCover:   0.5,
    cloudHeight:  34,
    aurora:       1,
    auroraHeight: 52,
    auroraSpeed:  0.45,
    starlight:    0.85,

    // Measured the way the beacon's glow was. The disc's own white is ~0.86
    // linear and a full moon opens at the whole of it, so 1.35 puts the lit face
    // over the bloom's 0.94 threshold and leaves a crescent's thin limb under
    // it — a full moon that flares and a young one that does not.
    moonlight: 1.35,
  },
  // `time` and `azimuth` are set to land the opening frame on the light the
  // scape was graded under, so the cycle starts where the stills were taken.
  // 68°N is a degree and a half inside the arctic circle, which is the whole
  // point of the number: it is the southernmost coast that still gets a true
  // polar night and a true midnight sun, so both ends of the year are real
  // rather than nearly. At midsummer it puts the noon sun at 45.4°, close
  // enough to the fixed 52° arc this replaced that the frame the scape was
  // graded on is still the frame it opens with.
  daylight: {
    time:      0.42,
    speed:     0.4,
    azimuth:   -106,
    latitude:  68,
    axialTilt: 23.44,
    dusk:      0xff9c56,
    night:     0x2b3d5e,
    nightLift: 0.4,
  },
  // Opens at midsummer, which is the season the scape was graded in — at
  // `time: 0.5` the year contributes exactly nothing and the first frame is the
  // frame it always was. The clock then runs it down into autumn, which is the
  // direction the change is worth seeing in.
  season: {
    time:     0.5,
    speed:    0.08,
    snow:     0.85,
    snowLine: 0.6,
    turn:     0.55,
    ice:      0.9,
    seaSmoke: 0.9,
  },
  // Opens on the leading edge of the squall rather than in the clear spell, and
  // that is a deliberate break with how the other two clocks are set. Daylight
  // and the year both open where they contribute nothing, so the first frame is
  // the frame the scape was graded on; weather opens at about a third of its
  // strength, because a system that is off in the opening frame is a system
  // nobody looking at the scape ever finds out it has.
  weather: {
    time:  0.19,
    speed: 0.14,
    rain:  0.9,
    wet:   0.62,
    fall:  17,
  },
  look: {
    grade:      'nordic',
    intensity:  0.78,
    vignette:   0.34,
    grain:      0.16,
    bloom:      0.34,
    tiltShift:  0.88,
    godRays:    0.26,
    anamorphic: 0.4,
    ao:         0.7,
  },
  palette: {
    sky:          0x9daaa2,
    fog:          0x8d9a93,
    deepWater:    0x263a3d,
    shallowWater: 0x44605a,
    foam:         0xd9e2da,
    silt:         0x565b4a,
    shore:        0xa9977a,
    meadow:       0x5d6b3c,
    dryGrass:     0x8f8a51,
    heath:        0x6b6a52,
    scree:        0x7d7a72,
    lichen:       0x9aa088,
    wrack:        0x3f3a20,
    pasture:      0x76803f,
    streambed:    0x585f57,
    trodden:      0x6c6049,
    track:        0x7d6a4f,
    tilled:       0x6d5a44,
    yard:         0x8a8560,
    snow:         0xe6ecf0,
    autumn:       0xb4762f,
    ice:          0xa8bcc0,
    rain:         0xc6d2d8,
    star:         0xdce8ff,
    moon:         0xe4e9e0,
    smoke:        0xb7b1a6,
    gull:         0xf2f4f1,
    aurora:       0x6df2a8,
    auroraCrown:  0x7a5bd6,
  },

  // Placeholders. `main.ts` overwrites all three from the resolved tier before
  // the settings store is built, so these are only ever what a test or a
  // headless import sees.
  runtime: {
    pixelRatio:    1,
    frameCap:      0,
    shadowCadence: 1,
    effects:       'tier' as QualityEffects,
  },
} satisfies ScapeConfig
