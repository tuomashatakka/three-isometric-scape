export type AtmosphereQualityTier = 'minimal' | 'mobile' | 'desktop' | 'ultra'

export interface AtmosphereQuality {
  tier:          AtmosphereQualityTier
  pixelRatioMax: number
  antialias:     boolean

  /**
   * Whether the renderer builds shadow maps at all.
   *
   * This is separate from map size: a smaller map still compiles and runs the
   * same hidden MeshDepthMaterial pass, which Firefox on the Pixel 10 rejects.
   */
  shadows:        boolean
  shadowMapSize:  number
  bloom:          boolean
  grain:          boolean
  mistLayers:     number
  msaaSamples:    number
  tiltShiftPairs: number

  /**
   * Stacked veils in the auroral deck. 0 is a sky that never lights up.
   *
   * A count rather than a switch, because the depth of a flat deck is entirely
   * the parallax between its layers — one veil is an aurora, three is an aurora
   * with a sky behind it.
   */
  auroraLayers: number

  /**
   * Drops in the falling column. 0 is a tier it never rains on.
   *
   * A count and not a density: the column is sized against the *frame* rather
   * than against the map — see `rain.ts` — so the same count is the same rain on
   * screen at every zoom, and a phone can be given a thinner shower without
   * being given a smaller one.
   */
  rainDrops: number

  /**
   * Panels in the coastal light's optic — how many beams sweep at once. 0 is a
   * tier that gets a lit lantern and no beams.
   *
   * A count rather than a switch for the same reason the aurora's veils are one:
   * one beam is a light, three is a light with a character. The cost is fill
   * rather than geometry — each panel is one five-sided cone of additive
   * overdraw, only drawn while the sun is down — so this is what a phone gives
   * up first and a workstation spends freely.
   */
  beaconBlades: number

  /**
   * Terrain plane subdivisions per side.
   *
   * A count, not a density — so it is sized against `terrain.size`, and a run
   * that grows the island has to grow these with it or the same island arrives
   * with coarser ground under it. Roughly 0.94 metres to a segment on desktop.
   */
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

  /**
   * Texture fetches the ground-grain injection is allowed.
   *
   * The phone tier keeps one dependent read for albedo and roughness variation.
   * Desktop keeps the six-read normal and macro treatment. This controls steady
   * frame cost; shadow-map compilation is the separate context-loss boundary.
   */
  detailTaps: number

  /** Lake plane subdivisions per side. */
  waterSegments: number

  /** Lake plane baseline extent; the archipelago also enforces a world-sized minimum. */
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
    shadows:         false,
    shadowMapSize:   512,
    bloom:           false,
    grain:           false,
    mistLayers:      1,
    msaaSamples:     0,
    tiltShiftPairs:  0,
    auroraLayers:    0,
    rainDrops:       0,
    beaconBlades:    0,
    terrainSegments: 60,
    scatterScale:    0.16,
    ao:              false,
    ssr:             false,
    godRays:         false,
    traa:            false,
    anamorphic:      false,
    post:            false,
    environment:     false,
    frameRate:       20,
    detailTaps:      1,
    waterSegments:   24,
    waterSpan:       2.2,
  },
  mobile: {
    pixelRatioMax:   1,
    antialias:       false,
    shadows:         false,
    shadowMapSize:   512,
    bloom:           false,
    grain:           false,
    mistLayers:      2,
    msaaSamples:     0,
    tiltShiftPairs:  0,
    auroraLayers:    1,
    rainDrops:       900,
    beaconBlades:    1,
    terrainSegments: 84,
    scatterScale:    0.32,
    ao:              false,
    ssr:             false,
    godRays:         false,
    traa:            false,
    anamorphic:      false,

    // The optical chain dies on PowerVR tile-based deferred renderers. The
    // device profiler traced the loss not to shadow maps but to post-program
    // linking at startup (run A) and context churn during render (run B). Both
    // configurations fail on the same device where minimal survives — the
    // difference is post: true vs false. Colour grading, tilt-shift and depth
    // of field are visual cost we accept here; the scape is readable without
    // them, and a device that cannot hold the tier is not a device that
    // should try to.
    post:          false,
    environment:   false,
    frameRate:     30,
    detailTaps:    1,
    waterSegments: 48,
    waterSpan:     3,
  },
  desktop: {
    // One device pixel per css pixel, the same as every other tier that is
    // actually detected. This scape is drawn through a post chain whose cost is
    // per *pixel* — bloom, two tilt-shift pairs, god rays, the grade — so a
    // retina desktop rendering at 1.75 pays roughly three times the fill of one
    // rendering at 1, to sharpen an image whose whole look is soft focus and
    // grain. Raise it from the overlay (`runtime.pixelRatio`) when the point is
    // a crisp still rather than a smooth scape.
    pixelRatioMax:   1,
    antialias:       true,
    shadows:         true,
    shadowMapSize:   2048,
    bloom:           true,
    grain:           true,
    mistLayers:      4,
    msaaSamples:     4,
    tiltShiftPairs:  2,
    auroraLayers:    2,
    rainDrops:       2_600,
    beaconBlades:    2,
    terrainSegments: 208,
    scatterScale:    1,
    ao:              false,
    ssr:             false,
    godRays:         true,
    traa:            false,
    anamorphic:      false,
    post:            true,
    environment:     true,
    frameRate:       0,
    detailTaps:      6,
    waterSegments:   96,
    waterSpan:       8,
  },
  ultra: {
    pixelRatioMax:   1,
    antialias:       true,
    shadows:         true,
    shadowMapSize:   4096,
    bloom:           true,
    grain:           true,
    mistLayers:      6,
    msaaSamples:     8,
    tiltShiftPairs:  2,
    auroraLayers:    3,
    rainDrops:       4_200,
    beaconBlades:    3,
    terrainSegments: 288,
    scatterScale:    1.5,
    ao:              true,
    ssr:             true,
    godRays:         true,
    traa:            true,
    anamorphic:      true,
    post:            true,
    environment:     true,
    frameRate:       0,
    detailTaps:      6,
    waterSegments:   128,
    waterSpan:       8,
  },
}

/**
 * Which effects a tier is allowed to build.
 *
 * `tier` is the preset as authored: the cheap tiers leave whole systems out
 * rather than draw poor versions of them. `all` overrules that.
 */
export type QualityEffects = 'tier' | 'all'

export function isQualityEffects (value: string): value is QualityEffects {
  return value === 'tier' || value === 'all'
}

/**
 * The floor each counted effect is lifted to when everything is unlocked.
 *
 * A count that a tier zeroed is a system that does not exist on it, and the
 * point of unlocking is that it should. These are the smallest counts at which
 * each one still reads as itself — one veil is an aurora, a few hundred drops
 * are a shower — rather than the desktop numbers, because a phone asked for
 * every effect should get every effect at a phone's scale and not a
 * workstation's. A tier that already spends more than the floor keeps its own.
 */
const UNLOCKED_FLOOR = {
  mistLayers:     2,
  tiltShiftPairs: 1,
  auroraLayers:   1,
  rainDrops:      700,
  beaconBlades:   1,
  detailTaps:     6,
} as const

/**
 * Every effect the scape has, on whatever tier is running.
 *
 * The counts stay at the tier's own scale wherever the tier already spends more
 * than the floor, so this turns systems *on* rather than turning a phone into a
 * workstation: resolution, segment counts, scatter budgets and the frame cap are
 * untouched, because those are what the tier is actually for.
 *
 * `shadows` is included, and it is the one that has historically taken a device
 * down — the depth pass compiles a whole second material set. `post` is the
 * other. Both are here on purpose: the point of the switch is that the reader
 * gets to make that trade on their own hardware, and the context-loss recovery
 * in `main.ts` still takes it back off them if the device answers by crashing.
 */
export function unlockEffects (quality: AtmosphereQuality): AtmosphereQuality {
  return {
    ...quality,
    shadows:        true,
    bloom:          true,
    grain:          true,
    ao:             true,
    ssr:            true,
    godRays:        true,
    traa:           true,
    anamorphic:     true,
    post:           true,
    environment:    true,
    mistLayers:     Math.max(quality.mistLayers, UNLOCKED_FLOOR.mistLayers),
    tiltShiftPairs: Math.max(quality.tiltShiftPairs, UNLOCKED_FLOOR.tiltShiftPairs),
    auroraLayers:   Math.max(quality.auroraLayers, UNLOCKED_FLOOR.auroraLayers),
    rainDrops:      Math.max(quality.rainDrops, UNLOCKED_FLOOR.rainDrops),
    beaconBlades:   Math.max(quality.beaconBlades, UNLOCKED_FLOOR.beaconBlades),
    detailTaps:     Math.max(quality.detailTaps, UNLOCKED_FLOOR.detailTaps),
  }
}

/** The tier as asked for: its own budget, or every effect it can draw. */
export function withEffects (
  quality: AtmosphereQuality,
  effects: QualityEffects,
): AtmosphereQuality {
  return effects === 'all' ? unlockEffects(quality) : quality
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
