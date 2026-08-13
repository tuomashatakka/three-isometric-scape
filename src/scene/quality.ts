export type AtmosphereQualityTier = 'minimal' | 'mobile' | 'desktop' | 'ultra'

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

  /**
   * The full-screen post chain.
   *
   * Off means no `EffectComposer` at all — the renderer draws straight to the
   * canvas, which costs two HDR ping-pong targets and every fullscreen pass
   * less. The grade, the LUT and the tilt-shift go with it, so this is the last
   * thing to give up rather than the first.
   */
  post: boolean

  /**
   * Image-based fill, baked from a room environment.
   *
   * A PMREM cubemap is twelve megabytes of RGBA16F and a generator pass at
   * startup, which is a lot of a phone's budget for an ambient term the
   * hemisphere light is already approximating.
   */
  environment: boolean

  /**
   * Frames drawn per second. 0 draws on every animation frame the display
   * offers.
   *
   * The single most effective knob on a phone: the GPU is what runs out, and
   * halving how often it is asked to draw halves the heat as well as the load.
   * A capped scape holds its frame rate where an uncapped one saturates,
   * throttles, and eventually has its context taken away.
   */
  frameRate: number

  /** Lake plane subdivisions per side. */
  waterSegments: number

  /** Lake plane extent, as a multiple of the terrain size. */
  waterSpan: number
}

export interface QualitySignals {
  coarsePointer:       boolean
  compactViewport:     boolean
  pixelRatio:          number
  hardwareConcurrency: number
  wideViewport:        boolean
}

const PRESETS: Record<AtmosphereQualityTier, Omit<AtmosphereQuality, 'tier'>> = {
  // Not a tier any device is detected into — it is where a device lands after
  // it has already lost the WebGL context once, and it is sized to be survivable
  // rather than to look like anything in particular.
  minimal: {
    pixelRatioMax:   0.7,
    antialias:       false,
    shadowMapSize:   512,
    bloom:           false,
    grain:           false,
    mistLayers:      1,
    msaaSamples:     0,
    tiltShiftPairs:  0,
    terrainSegments: 48,
    scatterScale:    0.16,
    ao:              false,
    ssr:             false,
    godRays:         false,
    traa:            false,
    anamorphic:      false,
    post:            false,
    environment:     false,
    frameRate:       20,
    waterSegments:   24,
    waterSpan:       2.2,
  },
  mobile: {
    pixelRatioMax:   1,
    antialias:       false,
    shadowMapSize:   512,
    bloom:           false,
    grain:           false,
    mistLayers:      2,
    msaaSamples:     0,
    tiltShiftPairs:  1,
    terrainSegments: 64,
    scatterScale:    0.32,
    ao:              false,
    ssr:             false,
    godRays:         false,
    traa:            false,
    anamorphic:      false,

    // The chain stays. It was taken off this tier for one run on the strength of
    // two samples that both had it built when the context went away — and then a
    // third device log showed the post-free floor tier dying at 4.1s in firefox
    // and a fourth showed it dying at 8.4s in chrome, on the same handset, with
    // no composer anywhere. The same floor tier had already run 47 seconds clean
    // in an earlier run. A setting that both survives and dies unchanged is not
    // the setting that matters, so this one is not worth the grade, the LUT and
    // the tilt-shift it was costing every phone.
    post:          true,
    environment:   false,
    frameRate:     30,
    waterSegments: 48,
    waterSpan:     3,
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
    post:            true,
    environment:     true,
    frameRate:       0,
    waterSegments:   96,
    waterSpan:       8,
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
    post:            true,
    environment:     true,
    frameRate:       0,
    waterSegments:   128,
    waterSpan:       8,
  },
}

/** Tiers from cheapest to most expensive. `minimal` is the floor. */
export const LADDER: readonly AtmosphereQualityTier[] = [ 'minimal', 'mobile', 'desktop', 'ultra' ]

/** Whether an arbitrary string names a tier. For url and storage input. */
export function isAtmosphereQualityTier (value: string): value is AtmosphereQualityTier {
  return (LADDER as readonly string[]).includes(value)
}

/**
 * Whichever of the two asks less of the device.
 *
 * Used to let a remembered tier hold a device down without ever letting it push
 * one up: a machine that survived `ultra` last week may be thermally throttled
 * or on battery today, so memory is only ever allowed to argue downward.
 */
export function cheaperTier (
  a: AtmosphereQualityTier,
  b: AtmosphereQualityTier,
): AtmosphereQualityTier {
  return LADDER.indexOf(a) <= LADDER.indexOf(b) ? a : b
}

export function atmosphereQuality (tier: AtmosphereQualityTier): AtmosphereQuality {
  return { tier, ...PRESETS[tier] }
}

/**
 * The next tier down.
 *
 * Used when the device has already told us — by dropping the WebGL context —
 * that it cannot hold the budget it was given. Rebuilding on the same settings
 * is how one thermal loss becomes a loop, so recovery always costs a tier.
 *
 * @returns The cheaper tier, or `null` once there is nothing left to give up.
 */
export function reduceAtmosphereQuality (quality: AtmosphereQuality): AtmosphereQuality | null {
  const index = LADDER.indexOf(quality.tier)

  if (index <= 0)
    return null

  return atmosphereQuality(LADDER[index - 1])
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
    return atmosphereQuality('mobile')

  if (!coarsePointer && wideViewport && hardwareConcurrency >= 12 && pixelRatio < 2.5)
    return atmosphereQuality('ultra')

  return atmosphereQuality('desktop')
}

/**
 * What the device says about itself.
 *
 * Split out from the selection so the answer can be *shown*. A tier that turns
 * out to be wrong for a device is indistinguishable from a tier that is right
 * and still too heavy, unless you can read the signals it was picked from.
 */
export function readQualitySignals (): QualitySignals {
  return {
    coarsePointer:       globalThis.matchMedia?.('(pointer: coarse)').matches ?? false,
    // 1100px, not 900. A phone turned on its side is 844 to 932 css pixels wide
    // depending on the handset, so 900 cut straight through the middle of the
    // range and handed the larger half of every phone in landscape to the desktop
    // tier — a 2048 shadow map and a full optical chain, on a phone. The rule
    // above still asks for a coarse pointer as well, so a laptop with a
    // touchscreen keeps its tier; only devices that are compact *and* touch-first
    // are affected, and those are phones.
    compactViewport:     globalThis.matchMedia?.('(max-width: 1100px)').matches ?? false,
    pixelRatio:          globalThis.devicePixelRatio ?? 1,
    hardwareConcurrency: globalThis.navigator?.hardwareConcurrency ?? 4,
    wideViewport:        globalThis.matchMedia?.('(min-width: 1280px)').matches ?? false,
  }
}

export function describeQualitySignals (signals: QualitySignals): string {
  const memory = (globalThis.navigator as { deviceMemory?: number } | undefined)?.deviceMemory

  return [
    `coarse ${signals.coarsePointer}`,
    `compact ${signals.compactViewport}`,
    `wide ${signals.wideViewport}`,
    `dpr ${signals.pixelRatio}`,
    `cores ${signals.hardwareConcurrency}`,
    memory === undefined ? 'ram ?' : `ram ${memory}gb`,
    `${globalThis.innerWidth}×${globalThis.innerHeight}css`,
  ].join(' · ')
}

export function detectAtmosphereQuality (): AtmosphereQuality {
  return selectAtmosphereQuality(readQualitySignals())
}
