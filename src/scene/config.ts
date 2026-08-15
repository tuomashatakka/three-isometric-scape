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
  cairn:      number
  hayBale:    number
  firewood:   number
  barrel:     number
  driftwood:  number

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
    size:        132,
    height:      8.2,
    waterLevel:  -1.25,
    shoreBand:   1.15,
    islandInner: 0.44,
    islandOuter: 0.576,
    seabedDrop:  7,
    // An archipelago, not a pair of outliers. Every one of these clears the
    // mainland's `islandOuter` and its neighbours' skirts, so they surface as
    // separate islands rather than merging into a reef — the spacing is the
    // whole design, and it is why the ring reads as distance.
    isles:       [
      { x: -0.71, z: 0.17, radius: 0.17, height: 4.4 },
      { x: 0.38, z: -0.63, radius: 0.14, height: 3.6 },
      { x: 0.72, z: 0.31, radius: 0.115, height: 2.9 },
      { x: -0.19, z: -0.7, radius: 0.1, height: 2.4 },
      { x: 0.1, z: 0.76, radius: 0.13, height: 3.2 },
      { x: -0.55, z: -0.52, radius: 0.12, height: 2.7 },
      { x: 0.78, z: -0.16, radius: 0.105, height: 2.2 },
      { x: -0.79, z: -0.14, radius: 0.09, height: 1.9 },
      { x: 0.5, z: 0.62, radius: 0.1, height: 2.55 },
      { x: -0.34, z: 0.72, radius: 0.115, height: 3 },
    ],
    detailScale: 7.5,
    detailGrain: 0.34,
    detailMacro: 0.62,
  },
  layout: {
    yardRadius:     17,
    trackWidth:     3.2,
    plotCount:      3,
    fenceSpacing:   2.2,
    forestBias:     0.72,
    harbourSpread:  34,
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
  dressing: {
    spruce:     260,
    pine:       90,
    birch:      74,
    deadSpruce: 24,
    sapling:    130,
    stump:      42,
    grass:      900,
    heather:    260,
    wildflower: 120,
    reeds:      190,
    lilyPads:   44,
    crop:       420,
    erratic:    26,
    fieldStone: 92,
    cobble:     170,
    cairn:      8,
    hayBale:    14,
    firewood:   7,
    barrel:     9,
    driftwood:  20,

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
    viewSize:    54,
    minViewSize: 8,
    maxViewSize: 92,
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
    cloudScale:   62,
    cloudSpeed:   0.9,
    cloudCover:   0.5,
    cloudHeight:  34,
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
  },
} satisfies ScapeConfig
