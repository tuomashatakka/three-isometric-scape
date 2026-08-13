/**
 * What this device has already proven about itself.
 *
 * The degradation ladder works — a phone that loses its context drops a tier and
 * comes back — but it re-learns the same lesson on every single load, and the
 * lesson costs a crash to teach. A device that dropped to `minimal` yesterday
 * has no business being handed `mobile` again today just because the signals it
 * broadcasts have not changed; the signals were never the thing that was wrong.
 *
 * So the outcome is written down. Two moments are worth recording: the tier a
 * loss dropped us *to*, written immediately because a reload during the crash
 * should not start over, and the tier that then ran for a while without dying,
 * written once the grace period has passed. Both are stamped with the build, so
 * a deploy that changes what a tier costs starts the argument again rather than
 * inheriting a verdict about code that no longer exists.
 *
 * Memory only ever argues downward — see `cheaperTier`. Something that survived
 * `ultra` last week may be throttled or on battery now, and a stored high-water
 * mark would be a way to push a device past what it can currently hold.
 */
import type { AtmosphereQualityTier } from './quality.ts'
import { cheaperTier, isAtmosphereQualityTier } from './quality.ts'


/** One key, one value. There is nothing here worth a schema. */
const KEY = 'three-iso:tier'

/**
 * Vite replaces `__SCAPE_BUILD__` textually, so under the bundler this collapses
 * to a literal. The guard is for everywhere else — `bun test` runs this module
 * directly and no define ever reaches it.
 */
const BUILD = typeof __SCAPE_BUILD__ === 'string' ? __SCAPE_BUILD__ : 'unbundled'

export interface TierMemory {

  /**
   * The remembered tier, if this build wrote one and it still parses.
   *
   * `null` covers every way this can legitimately fail — nothing stored, a
   * stamp from another build, a value that is no longer a tier name, or storage
   * that is not there at all.
   */
  readonly remembered: AtmosphereQualityTier | null

  /** Hold `tier` down to whatever the device has already proven. */
  clamp(tier: AtmosphereQualityTier): AtmosphereQualityTier

  /** Write `tier` down as this device's verdict. */
  remember(tier: AtmosphereQualityTier): void

  /** Throw the verdict away — for `?tier=`, which overrules it. */
  forget(): void
}

/**
 * `localStorage` is absent in more situations than it is worth enumerating —
 * private windows on some browsers, storage partitioning, a quota that is
 * already full, an embedding that disallows it. None of them are the scape's
 * problem, and none of them should stop it from starting.
 */
function readStamped (): AtmosphereQualityTier | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)

    if (!raw)
      return null

    const [ build, tier ] = raw.split(' ')

    if (build !== BUILD || !tier || !isAtmosphereQualityTier(tier))
      return null

    return tier
  }
  catch {
    return null
  }
}

export function createTierMemory (): TierMemory {
  const remembered = readStamped()

  function write (value: string | null): void {
    try {
      if (value === null)
        globalThis.localStorage?.removeItem(KEY)
      else
        globalThis.localStorage?.setItem(KEY, value)
    }
    catch {
      // A device that cannot remember is exactly the device we had before this
      // module existed, which was a working device. Nothing to report.
    }
  }

  return {
    remembered,

    clamp (tier) {
      return remembered ? cheaperTier(tier, remembered) : tier
    },

    remember (tier) {
      write(`${BUILD} ${tier}`)
    },

    forget () {
      write(null)
    },
  }
}

// perf: two `localStorage` calls per load, both off the frame path.
