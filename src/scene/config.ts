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
export type LandmassProfile = 'home' | 'ridge' | 'meadow'

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

  terrain: {
    size:        number
    height:      number
    shoreBand:   number
    islandInner: number
    islandOuter: number
  }

  layout: {
    yardRadius:    number
    trackWidth:    number
    plotCount:     number
    forestBias:    number
    harbourSpread: number
    pastureRadius: number
  }
}

export interface DressingBudget {
  spruce:     number
  pine:       number
  birch:      number
  deadSpruce: number
  sapling:    number
  stump:      number
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

    /** Offshore islets — landscape only, never built on. */
    isles: readonly Isle[]

    /** World units per tile of the ground grain. */
    detailScale: number

    /** Ground grain contrast, 0..1. */
    detailGrain: number

    /** Weight of the broad second octave of grain, relative to the fine one. */
    detailMacro: number
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
   * speed is live and may reach zero. The other values shape the route built
   * with the survey and therefore deliberately stay out of the tuning overlay.
   */
  boats: {

    /** Metres travelled per second. 0 freezes the fleet. */
    speed: number

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
  dressing: DressingBudget
  wind: {
    strength: number
    speed:    number
  }

  /** The lake's surface response. Every one of these is live. */
  water: {

    /** Sun-glitter strength, 0 disables the speckle. */
    sparkle: number

    /** Swell amplitude in metres. */
    waveHeight: number

    /** Ripple normal perturbation. */
    rippleStrength: number

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

    /** Elevation in degrees at full zoom-in — low reads flat and cinematic. */
    tiltNear: number

    /** Elevation in degrees at full zoom-out — steep reads like a map. */
    tiltFar: number
  }
  atmosphere: {
    fogDensity:   number
    fogBreath:    number
    mistAmount:   number
    mistWind:     number
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

    /** Cloud drift speed. Shared by the shadow map and the sky deck. */
    cloudSpeed: number

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

    /** Compass bearing of the noon sun, in degrees. */
    azimuth: number

    /** Noon elevation above the horizon, in degrees. */
    tilt: number

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
  }
}

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
    detailScale: 7.5,
    detailGrain: 0.34,
    detailMacro: 0.62,
  },
  // Three full holdings, each generated by the same local survey and projected
  // into one world only after its terrain, paths and landings have agreed. Their
  // terrain numbers are deliberately not cosmetic labels: the western island
  // is a compact high ridge, the eastern one a broader low meadow.
  archipelago: {
    worldSize:  520,
    landmasses: [
      {
        id:         'home',
        profile:    'home',
        origin:     [ 0, 0 ],
        seedOffset: 0,
        satellites: 'home',
        terrain:    {
          size:        196,
          height:      11.5,
          shoreBand:   1.15,
          islandInner: 0.52,
          islandOuter: 0.63,
        },
        layout: {
          yardRadius:    19,
          trackWidth:    3.2,
          plotCount:     4,
          forestBias:    0.72,
          harbourSpread: 38,
          pastureRadius: 6,
        },
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
    ],
  },
  boats: {
    speed:      4.2,
    clearance:  0.42,
    separation: 7,
    routeCell:  5.2,
    dockReach:  6.4,
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
  footpath: {
    width:  1.5,
    verge:  0.7,
    climb:  1.3,
    wander: 1.1,
    wear:   0.82,
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
  wind: {
    strength: 0.9,
    speed:    1.35,
  },
  water: {
    sparkle:        0.5,
    waveHeight:     0.075,
    rippleStrength: 0.2,
    roughness:      0.62,
    iceReach:       0.62,
    iceBreak:       0.5,
  },
  camera: {
    viewSize:    500,
    minViewSize: 8,
    maxViewSize: 560,
    rotation:    45,
    tiltNear:    21,
    tiltFar:     52,
  },
  atmosphere: {
    fogDensity:   0.3,
    fogBreath:    0.08,
    mistAmount:   0.34,
    mistWind:     0.36,
    skyTop:       0x5c727e,
    sunColor:     0xffe8bd,
    sunStrength:  2.85,
    hemiSky:      0xc2cfd2,
    hemiGround:   0x3d4433,
    hemiStrength: 0.72,
    cloudShadow:  0.42,
    cloudScale:   92,
    cloudSpeed:   0.9,
    cloudCover:   0.5,
    cloudHeight:  34,
    aurora:       1,
    auroraHeight: 52,
    auroraSpeed:  0.45,
  },
  // `time` and `azimuth` are set to land the opening frame on the light the
  // scape was graded under, so the cycle starts where the stills were taken.
  daylight: {
    time:      0.42,
    speed:     0.4,
    azimuth:   -106,
    tilt:      52,
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
  },
} satisfies ScapeConfig
