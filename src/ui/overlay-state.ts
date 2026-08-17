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

/**
 * Which drawer sections the reader left open.
 *
 * Keyed by section title rather than by index, so reordering the panel — or
 * adding a section in the middle of it — does not reopen a different one than
 * the reader chose. A title nobody has answered for returns `null`, which is how
 * a new section gets to keep its own default.
 */
const SECTIONS = 'three-iso.sections.v1'

function readSectionMap (storage: Storage | null): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(SECTIONS) ?? '{}')
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, boolean> : {}
  }
  catch {
    return {}
  }
}

export function readSectionOpen (
  title:   string,
  storage: Storage | null = openStorage(SECTIONS),
): boolean | null {
  const value = readSectionMap(storage)[title]
  return typeof value === 'boolean' ? value : null
}

export function writeSectionOpen (
  title:   string,
  open:    boolean,
  storage: Storage | null = openStorage(SECTIONS),
): void {
  try {
    const map = readSectionMap(storage)

    map[title] = open
    storage?.setItem(SECTIONS, JSON.stringify(map))
  }
  catch {
    // As above — a full quota only costs the next load its layout.
  }
}

// perf: a handful of `localStorage` calls per load, all off the frame path.
