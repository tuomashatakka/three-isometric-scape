export type GradeName = 'natural' | 'cinematic' | 'warm' | 'cool' | 'noir' | 'dream' | 'nordic'

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
}

export interface ScapeConfig {
  seed:    number
  terrain: {
    size:       number
    segments:   number
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
  }
  dressing: DressingBudget
  wind: {
    strength: number
    speed:    number
  }
  camera: {
    viewSize:    number
    minViewSize: number
    maxViewSize: number
    tilt:        number
    rotation:    number
  }
  atmosphere: {
    fogDensity:   number
    fogBreath:    number
    mistAmount:   number
    mistWind:     number
    skyTop:       number
    sunColor:     number
    sunStrength:  number
    sunDirection: readonly [number, number, number]
    hemiSky:      number
    hemiGround:   number
    hemiStrength: number

    /** Drifting cloud-shadow darkness, 0..1. */
    cloudShadow: number

    /** World units per cloud-map tile. */
    cloudScale: number

    /** Cloud drift speed. */
    cloudSpeed: number
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
    track:        number
    tilled:       number
    yard:         number
  }
}

export const SCAPE_CONFIG = {
  seed:    7_319,
  terrain: {
    size:        84,
    segments:    160,
    height:      8.2,
    waterLevel:  -1.25,
    shoreBand:   1.15,
    islandInner: 0.74,
    islandOuter: 0.98,
    seabedDrop:  7,
  },
  layout: {
    yardRadius:   11,
    trackWidth:   3.2,
    plotCount:    3,
    fenceSpacing: 2.2,
    forestBias:   0.72,
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
  },
  wind: {
    strength: 0.9,
    speed:    1.35,
  },
  camera: {
    viewSize:    54,
    minViewSize: 18,
    maxViewSize: 92,
    tilt:        30,
    rotation:    45,
  },
  atmosphere: {
    fogDensity:   0.3,
    fogBreath:    0.08,
    mistAmount:   0.22,
    mistWind:     0.36,
    skyTop:       0x5c727e,
    sunColor:     0xffe8bd,
    sunStrength:  2.85,
    sunDirection: [ -0.5, 0.62, -0.42 ],
    hemiSky:      0xc2cfd2,
    hemiGround:   0x3d4433,
    hemiStrength: 0.72,
    cloudShadow:  0.42,
    cloudScale:   62,
    cloudSpeed:   0.9,
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
    deepWater:    0x39474c,
    shallowWater: 0x5c6f6c,
    foam:         0xcdd5cf,
    silt:         0x565b4a,
    shore:        0xa9977a,
    meadow:       0x5d6b3c,
    dryGrass:     0x8f8a51,
    heath:        0x6b6a52,
    scree:        0x7d7a72,
    lichen:       0x9aa088,
    track:        0x7d6a4f,
    tilled:       0x6d5a44,
    yard:         0x8a8560,
  },
} satisfies ScapeConfig
