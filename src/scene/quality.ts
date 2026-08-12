export type AtmosphereQualityTier = 'mobile' | 'desktop' | 'ultra'

export interface AtmosphereQuality {
  tier:           AtmosphereQualityTier
  pixelRatioMax:  number
  antialias:      boolean
  shadowMapSize:  number
  bloom:          boolean
  grain:          boolean
  mistLayers:     number
  msaaSamples:    number
  tiltShiftPairs: number

  /** Terrain plane subdivisions per side. */
  terrainSegments: number

  /** Multiplier on every dressing budget. */
  scatterScale: number

  /** Screen-space ambient occlusion. */
  ao: boolean

  /** Screen-space reflections on the lake. */
  ssr: boolean

  /** Volumetric sun shafts. */
  godRays: boolean

  /** Temporal reprojection anti-aliasing. */
  traa: boolean

  /** Anamorphic streak bloom. */
  anamorphic: boolean
}

export interface QualitySignals {
  coarsePointer:       boolean
  compactViewport:     boolean
  pixelRatio:          number
  hardwareConcurrency: number
  wideViewport:        boolean
}

const PRESETS: Record<AtmosphereQualityTier, Omit<AtmosphereQuality, 'tier'>> = {
  mobile: {
    pixelRatioMax:   1.25,
    antialias:       false,
    shadowMapSize:   1024,
    bloom:           false,
    grain:           false,
    mistLayers:      2,
    msaaSamples:     0,
    tiltShiftPairs:  1,
    terrainSegments: 96,
    scatterScale:    0.45,
    ao:              false,
    ssr:             false,
    godRays:         false,
    traa:            false,
    anamorphic:      false,
  },
  desktop: {
    pixelRatioMax:   1.75,
    antialias:       true,
    shadowMapSize:   2048,
    bloom:           true,
    grain:           true,
    mistLayers:      4,
    msaaSamples:     4,
    tiltShiftPairs:  2,
    terrainSegments: 160,
    scatterScale:    1,
    ao:              false,
    ssr:             false,
    godRays:         true,
    traa:            false,
    anamorphic:      false,
  },
  ultra: {
    pixelRatioMax:   2,
    antialias:       true,
    shadowMapSize:   4096,
    bloom:           true,
    grain:           true,
    mistLayers:      6,
    msaaSamples:     8,
    tiltShiftPairs:  2,
    terrainSegments: 224,
    scatterScale:    1.5,
    ao:              true,
    ssr:             true,
    godRays:         true,
    traa:            true,
    anamorphic:      true,
  },
}

/**
 * Pick a tier from device signals.
 *
 * The rules are ordered by what actually costs frames. A dense display is the
 * first thing that sinks a fullscreen post chain, so it drops to the cheap tier
 * regardless of how many cores the machine has; ultra then asks for the things
 * that predict a real GPU — a mouse, a wide viewport, and cores to spare.
 */
export function selectAtmosphereQuality ({
  coarsePointer,
  compactViewport,
  pixelRatio,
  hardwareConcurrency,
  wideViewport,
}: QualitySignals): AtmosphereQuality {
  if (coarsePointer && compactViewport || pixelRatio >= 2.5)
    return { tier: 'mobile', ...PRESETS.mobile }

  if (!coarsePointer && wideViewport && hardwareConcurrency >= 12 && pixelRatio < 2.5)
    return { tier: 'ultra', ...PRESETS.ultra }

  return { tier: 'desktop', ...PRESETS.desktop }
}

export function detectAtmosphereQuality (): AtmosphereQuality {
  return selectAtmosphereQuality({
    coarsePointer:       globalThis.matchMedia?.('(pointer: coarse)').matches ?? false,
    compactViewport:     globalThis.matchMedia?.('(max-width: 900px)').matches ?? false,
    pixelRatio:          globalThis.devicePixelRatio ?? 1,
    hardwareConcurrency: globalThis.navigator?.hardwareConcurrency ?? 4,
    wideViewport:        globalThis.matchMedia?.('(min-width: 1280px)').matches ?? false,
  })
}
