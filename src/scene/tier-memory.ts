/**
 * What this device has already proven about itself.
 *
 * The mechanism is the runtime's `createLadderMemory`: a verdict stamped with
 * the build that earned it, which only ever argues *downward*, and which is
 * harmless on a device with no storage at all. This module is that, pinned to
 * this scape's ladder and its storage key.
 *
 * Two moments are worth recording, and `main.ts` owns both: the tier a loss
 * dropped us *to*, written immediately because a reload during the crash should
 * not start over, and the tier that then ran for a while without dying.
 */

import { createLadderMemory } from 'threejs-scene'
import type { LadderMemory } from 'threejs-scene'
import { LADDER } from './quality.ts'
import type { AtmosphereQualityTier } from './quality.ts'


/** One key, one value. There is nothing here worth a schema. */
const KEY = 'three-iso:tier'

/**
 * Vite replaces `__SCAPE_BUILD__` textually, so under the bundler this collapses
 * to a literal. The guard is for everywhere else — `bun test` runs this module
 * directly and no define ever reaches it.
 *
 * This is the whole reason the stamp exists: a deploy that changes what a tier
 * costs has to start the argument again rather than inherit a verdict about code
 * that no longer exists.
 */
const BUILD = typeof __SCAPE_BUILD__ === 'string' ? __SCAPE_BUILD__ : 'unbundled'

export type TierMemory = LadderMemory<AtmosphereQualityTier>

export function createTierMemory (storage?: Storage | null): TierMemory {
  return createLadderMemory<AtmosphereQualityTier>({
    ladder: LADDER,
    key:    KEY,
    build:  BUILD,
    ...storage === undefined ? {} : { storage },
  })
}
