import { openStorage } from './settings-store.ts'


/**
 * Whether the reader wants the card in front of the scape.
 *
 * Its own key rather than a field in the graphics snapshot. That snapshot is
 * derived from the control list and typed against the config it writes into —
 * this is neither, it is a fact about the reader rather than about the scene,
 * and folding it in would mean inventing a config field for a piece of
 * furniture the scene has no opinion about.
 */
const KEY = 'three-iso.overlay.v1'

/**
 * @returns Whether the card was last left hidden, or `null` when nobody has
 * said — which is not the same as `false`, and is what lets the caller apply its
 * own default to a first visit.
 */
export function readCardHidden (storage: Storage | null = openStorage(KEY)): boolean | null {
  try {
    const raw = storage?.getItem(KEY)

    // Anything else — an older format, a hand-edited value, a key another app
    // on the origin happens to share — is treated as nobody having said.
    if (raw === 'true')
      return true
    if (raw === 'false')
      return false

    return null
  }
  catch {
    return null
  }
}

export function writeCardHidden (
  hidden:  boolean,
  storage: Storage | null = openStorage(KEY),
): void {
  try {
    storage?.setItem(KEY, String(hidden))
  }
  catch {
    // A full quota, or a store that only pretended to be writable. The card is
    // already where the reader put it; only the next load loses out.
  }
}

// perf: two `localStorage` calls per load, both off the frame path.
