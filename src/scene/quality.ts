export type AtmosphereQualityTier = 'mobile' | 'desktop'

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
}

export interface QualitySignals {
  coarsePointer:   boolean
  compactViewport: boolean
  pixelRatio:      number
}

const PRESETS: Record<AtmosphereQualityTier, Omit<AtmosphereQuality, 'tier'>> = {
  mobile: {
    pixelRatioMax:  1.25,
    antialias:      false,
    shadowMapSize:  1024,
    bloom:          false,
    grain:          false,
    mistLayers:     2,
    msaaSamples:    0,
    tiltShiftPairs: 1,
  },
  desktop: {
    pixelRatioMax:  1.75,
    antialias:      true,
    shadowMapSize:  2048,
    bloom:          true,
    grain:          true,
    mistLayers:     4,
    msaaSamples:    4,
    tiltShiftPairs: 2,
  },
}

export function selectAtmosphereQuality ({
  coarsePointer,
  compactViewport,
  pixelRatio,
}: QualitySignals): AtmosphereQuality {
  const tier: AtmosphereQualityTier = coarsePointer && compactViewport || pixelRatio >= 2.5
    ? 'mobile'
    : 'desktop'
  return { tier, ...PRESETS[tier] }
}

function matches (query: string): boolean {
  return typeof matchMedia === 'function' && matchMedia(query).matches
}

export function detectAtmosphereQuality (): AtmosphereQuality {
  return selectAtmosphereQuality({
    coarsePointer:   matches('(pointer: coarse)'),
    compactViewport: matches('(max-width: 900px)'),
    pixelRatio:      globalThis.devicePixelRatio ?? 1,
  })
}
