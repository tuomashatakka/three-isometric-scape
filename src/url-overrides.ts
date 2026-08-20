import { writePath } from 'threejs-scene'
import { SCAPE_CONFIG } from './scene/config.ts'
import type { AtmosphereQuality, QualitySignals } from './scene/quality.ts'
import {
  atmosphereQuality,
  isAtmosphereQualityTier,
  isQualityEffects,
  selectAtmosphereQuality,
} from './scene/quality.ts'
import type { TierMemory } from './scene/tier-memory.ts'


/** The query string as it arrived, and where its answers are announced. */
export interface UrlReader {
  params: URLSearchParams

  /** The diagnostics log, in practice — see `createUrlOverrides`. */
  say (message: string): void
}

/**
 * Everything the query string is allowed to overrule, in one place.
 *
 * A tier is a bundle of fifteen decisions at once, so a device that dies on one
 * cannot say which of the fifteen killed it. Every parameter here exists to pull
 * one decision out on its own — and every one of them is answered out loud
 * through `say`, because an override that applies silently turns a capture of
 * the wrong scape into a capture nobody can tell is wrong.
 *
 * This is a parser: it reads strings and writes a budget, and it touches nothing
 * that is alive. It lived in `main.ts` next to the mount and the context-loss
 * ladder, which is three state machines sharing one set of names.
 */
export interface UrlOverrideOptions extends UrlReader {

  /** What the device broadcasts about itself, before the url argues with it. */
  signals: QualitySignals

  /** What the device has already proven, which an explicit `?tier=` clears. */
  memory: TierMemory
}

export interface UrlOverrides {

  /**
   * Which tier to open on: what the signals ask for, held down by what the
   * device has already proven, unless the url overrules both.
   */
  startingQuality (): AtmosphereQuality

  /**
   * The effects mode, forced from the url.
   *
   * `?effects=all` is the capture-time equivalent of the drawer's switch, and
   * the only way to photograph a phone tier with the whole optical chain on it.
   * Written straight into the config, so it must run after `settings.load`.
   */
  startingEffects (): void

  /**
   * Every knob in the config, addressable from the url.
   *
   * `?set=camera.rotation=30,daylight.time=0.85`. The paths are the same dotted
   * strings the graphics overlay and the settings snapshot already use, written
   * with the same `writePath` — so there is exactly one vocabulary for "which
   * number", and a knob added to the config is reachable from here on the day it
   * lands without anyone wiring a parameter for it.
   *
   * Applied *after* `settings.load`, so a url beats whatever the last session
   * left in local storage. A capture that silently inherited someone else's
   * dragged sliders would be a capture of the wrong scape.
   */
  applyToConfig (): void
}

/**
 * The optical chain, forced either way.
 *
 * `?post=0` takes the whole optical chain out from under a tier that otherwise
 * keeps its geometry, resolution and frame cap, and `?post=1` puts it back where
 * a tier would not have built one — which is how the chain was ruled out as the
 * cause of the context loss rather than assumed either way.
 */
export function withPostOverride (quality: AtmosphereQuality, { params, say }: UrlReader): AtmosphereQuality {
  const forced = params.get('post')

  if (forced !== '0' && forced !== '1')
    return quality

  const post = forced === '1'

  say(`post chain forced ${post ? 'on' : 'off'} by the url`)

  return { ...quality, post }
}

/**
 * One knob at a time, over the top of whatever tier was chosen.
 *
 * A tier that survives where another dies cannot say which of its decisions
 * mattered. `?ratio=` and `?aa=` pull the two that touch the *surface* rather
 * than the workload out on their own — which is the difference between the tiers
 * this device lives on and the ones it dies on, once frame cost has been ruled
 * out.
 */
export function withSurfaceOverrides (quality: AtmosphereQuality, { params, say }: UrlReader): AtmosphereQuality {
  const ratio = Number(params.get('ratio'))
  const aa    = params.get('aa')
  let forced  = quality

  if (Number.isFinite(ratio) && ratio > 0) {
    say(`pixel ratio forced to ${ratio} by the url`)
    forced = { ...forced, pixelRatioMax: ratio }
  }

  if (aa === '0' || aa === '1') {
    say(`antialias forced ${aa === '1' ? 'on' : 'off'} by the url`)
    forced = { ...forced, antialias: aa === '1' }
  }

  return forced
}

export function createUrlOverrides (options: UrlOverrideOptions): UrlOverrides {
  const { params, say, signals, memory } = options

  function startingQuality (): AtmosphereQuality {
    const forced = params.get('tier')

    if (forced && isAtmosphereQualityTier(forced)) {
      // An explicit tier is a question about this build, and a stored verdict
      // would keep answering the old one over the top of it.
      memory.forget()
      say(`tier forced to ${forced} by the url`)

      return withSurfaceOverrides(withPostOverride(atmosphereQuality(forced), options), options)
    }

    const picked  = selectAtmosphereQuality(signals)
    const clamped = memory.clamp(picked.tier)

    if (clamped !== picked.tier)
      say(`${picked.tier} tier held down to ${clamped} · this device has dropped a context before`)

    return withSurfaceOverrides(withPostOverride(atmosphereQuality(clamped), options), options)
  }

  function startingEffects (): void {
    const forced = params.get('effects')

    if (forced && isQualityEffects(forced)) {
      SCAPE_CONFIG.runtime.effects = forced
      say(`effects forced to ${forced} by the url`)
    }
  }

  function applyToConfig (): void {
    const raw = params.get('set')

    if (!raw)
      return

    for (const entry of raw.split(',')) {
      const split = entry.indexOf('=')

      if (split === -1) {
        say(`?set wants path=value, ignoring "${entry}"`)
        continue
      }

      const path  = entry.slice(0, split).trim()
      const text  = entry.slice(split + 1).trim()
      const value = text === 'true' || text === 'false'
        ? text === 'true'
        : Number.isFinite(Number(text)) && text !== '' ? Number(text) : text

      writePath(SCAPE_CONFIG, path, value)
      say(`${path} set to ${String(value)} by the url`)
    }
  }

  return { startingQuality, startingEffects, applyToConfig }
}
