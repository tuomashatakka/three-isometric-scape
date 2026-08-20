import { describe, expect, test } from 'bun:test'
import { createUrlOverrides, withPostOverride, withSurfaceOverrides } from './url-overrides.ts'
import type { UrlReader } from './url-overrides.ts'
import { SCAPE_CONFIG } from './scene/config.ts'
import { atmosphereQuality } from './scene/quality.ts'
import type { AtmosphereQualityTier, QualitySignals } from './scene/quality.ts'
import type { TierMemory } from './scene/tier-memory.ts'


/** A device that would be detected into `ultra`, so a clamp has room to show. */
const CAPABLE: QualitySignals = {
  coarsePointer:       false,
  compactViewport:     false,
  pixelRatio:          1,
  hardwareConcurrency: 16,
  wideViewport:        true,
}

function reader (query: string): UrlReader & { said: string[] } {
  const said: string[] = []

  return {
    params: new URLSearchParams(query),
    said,
    say:    message => void said.push(message),
  }
}

function memoryHolding (tier: AtmosphereQualityTier | null): TierMemory & { forgotten: boolean } {
  return {
    forgotten:  false,
    remembered: tier,
    clamp:      asked => tier ?? asked,
    remember:   () => undefined,
    forget () {
      this.forgotten = true
    },
  }
}


describe('the surface overrides', () => {
  test('a url that says nothing hands the tier straight back', () => {
    const quality = atmosphereQuality('desktop')

    expect(withPostOverride(quality, reader(''))).toBe(quality)
    expect(withSurfaceOverrides(quality, reader(''))).toBe(quality)
  })

  test('?post= forces the optical chain either way, and says so', () => {
    const off = reader('post=0')
    const on  = reader('post=1')

    expect(withPostOverride(atmosphereQuality('ultra'), off).post).toBe(false)
    expect(withPostOverride(atmosphereQuality('minimal'), on).post).toBe(true)
    expect(off.said[0]).toContain('forced off')
    expect(on.said[0]).toContain('forced on')
  })

  test('?ratio= and ?aa= move only the two knobs that touch the surface', () => {
    const url    = reader('ratio=1.5&aa=0')
    const forced = withSurfaceOverrides(atmosphereQuality('ultra'), url)

    expect(forced.pixelRatioMax).toBe(1.5)
    expect(forced.antialias).toBe(false)
    expect(forced.shadowMapSize).toBe(atmosphereQuality('ultra').shadowMapSize)
    expect(url.said).toHaveLength(2)
  })

  test('a ratio that is not a positive number is ignored rather than obeyed', () => {
    const quality = atmosphereQuality('desktop')

    expect(withSurfaceOverrides(quality, reader('ratio=0')).pixelRatioMax).toBe(quality.pixelRatioMax)
    expect(withSurfaceOverrides(quality, reader('ratio=nope')).pixelRatioMax).toBe(quality.pixelRatioMax)
  })
})

describe('the opening tier', () => {
  test('what the device has proven holds down what the signals asked for', () => {
    const url     = reader('')
    const memory  = memoryHolding('mobile')
    const quality = createUrlOverrides({ ...url, signals: CAPABLE, memory }).startingQuality()

    expect(quality.tier).toBe('mobile')
    expect(url.said.join(' ')).toContain('held down')
  })

  test('an explicit ?tier= clears the stored verdict rather than arguing with it', () => {
    const url     = reader('tier=ultra')
    const memory  = memoryHolding('minimal')
    const quality = createUrlOverrides({ ...url, signals: CAPABLE, memory }).startingQuality()

    expect(quality.tier).toBe('ultra')
    expect(memory.forgotten).toBe(true)
  })

  test('the surface overrides still land on top of a forced tier', () => {
    const url     = reader('tier=minimal&ratio=2&post=1')
    const quality = createUrlOverrides({ ...url, signals: CAPABLE, memory: memoryHolding(null) }).startingQuality()

    expect(quality.tier).toBe('minimal')
    expect(quality.pixelRatioMax).toBe(2)
    expect(quality.post).toBe(true)
  })
})

describe('?set=', () => {
  test('reads numbers as numbers, booleans as booleans and the rest as text', () => {
    const authored = {
      rotation: SCAPE_CONFIG.camera.rotation,
      time:     SCAPE_CONFIG.daylight.time,
    }

    const url = reader('set=camera.rotation=30,daylight.time=0.85,nothing.here')

    createUrlOverrides({ ...url, signals: CAPABLE, memory: memoryHolding(null) }).applyToConfig()

    try {
      expect(SCAPE_CONFIG.camera.rotation).toBe(30)
      expect(SCAPE_CONFIG.daylight.time).toBe(0.85)

      // An entry with no `=` is reported and skipped, not guessed at.
      expect(url.said.join(' ')).toContain('wants path=value')
    }
    finally {
      SCAPE_CONFIG.camera.rotation = authored.rotation
      SCAPE_CONFIG.daylight.time   = authored.time
    }
  })
})
