import { readPath } from 'threejs-scene'
import { controlPaths } from './scape-controls.ts'
import type { ControlSection } from './scape-controls.ts'
import type { ConfigAccess, ConfigValue } from '../scene/config-access.ts'


export interface SettingsStore {

  /** Apply the stored snapshot over the config. Call before the scene is built. */
  load(): void

  /** Snapshot the config. Debounced — safe to call on every slider tick. */
  save(): void

  /** Put the config back to the values it shipped with, and forget the snapshot. */
  reset(): void
  dispose(): void
}

const KEY   = 'three-iso.graphics.v1'
const DELAY = 220

/**
 * `localStorage` that cannot throw.
 *
 * Access alone throws in a sandboxed frame and in Safari's private mode — not
 * the write, the *property read*. A graphics overlay is not worth taking the
 * scene down for, so a missing store degrades to "settings do not persist".
 *
 * Exported because it is the lesson rather than the helper. Anything else in the
 * ui that wants to remember something should reach for this instead of learning
 * about Safari's private mode a second time.
 *
 * @param probe - A key to read, to prove the store answers rather than throws.
 */
export function openStorage (probe: string): Storage | null {
  try {
    const store = globalThis.localStorage
    store.getItem(probe)
    return store
  }
  catch {
    return null
  }
}

function parse (raw: string | null): Record<string, unknown> {
  if (!raw)
    return {}

  try {
    const value = JSON.parse(raw) as unknown
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  }
  catch {
    return {}
  }
}

/**
 * Persistence for the graphics overlay.
 *
 * The set of persisted values is derived from the control sections rather than
 * listed again here, so a knob added to the panel is saved by construction and
 * one removed stops being restored. Stored values are only accepted when their
 * type still matches what the config holds — that is what makes a stale or
 * hand-edited snapshot harmless instead of a way to poke a string into a
 * uniform and take the shader down on load.
 *
 * Construct this *before* calling `load`: the authored values are captured here,
 * and they are the only copy of them left once a stored snapshot has been
 * applied over the config. `reset` is what gives them back.
 */
export function createSettingsStore (
  config:   ConfigAccess<object>,
  sections: readonly ControlSection[],
  storage:  Storage | null = openStorage(KEY),
): SettingsStore {
  const paths    = controlPaths(sections)
  const authored = paths.map(path => readPath(config.read(), path) as ConfigValue)
  let pending: ReturnType<typeof setTimeout> | null = null

  function flush (): void {
    pending = null
    if (!storage)
      return

    const snapshot: Record<string, unknown> = {}

    for (const path of paths)
      snapshot[path] = readPath(config.read(), path)

    try {
      storage.setItem(KEY, JSON.stringify(snapshot))
    }
    catch {
      // Quota, or a store that only pretended to be writable. Nothing to do.
    }
  }

  return {
    load () {
      if (!storage)
        return

      const stored = parse(storage.getItem(KEY))

      for (const path of paths) {
        const value = stored[path]

        if (value !== undefined && typeof value === typeof readPath(config.read(), path))
          config.write(path, value as ConfigValue)
      }
    },

    save () {
      if (pending)
        clearTimeout(pending)
      pending = setTimeout(flush, DELAY)
    },

    reset () {
      if (pending)
        clearTimeout(pending)
      pending = null

      for (const [ index, path ] of paths.entries())
        config.write(path, authored[index])

      try {
        // Removed rather than overwritten with the defaults. Re-authoring a
        // value in `config.ts` should reach anyone who has pressed reset, and it
        // cannot if reset leaves a snapshot of the old defaults behind.
        storage?.removeItem(KEY)
      }
      catch {
        // Same as above — a store that will not forget is not worth a crash.
      }
    },

    dispose () {
      if (pending)
        clearTimeout(pending)
      pending = null
    },
  }
}
