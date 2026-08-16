export interface ScapeCard {

  /** The handle. Appended to the host, never to the card it hides. */
  element: HTMLElement
  dispose(): void
}

export interface ScapeCardOptions {

  /** The card itself — the static `figcaption` from the document. */
  card: HTMLElement

  /** Where the handle goes. The figure, so it survives the card sliding away. */
  host: HTMLElement

  /** Whether to open hidden. */
  hidden: boolean

  /** Fired after every flip, with the state the card ended up in. */
  onToggle?(hidden: boolean): void
}

/** The key that puts the card away. Chosen for `hide`, and free on the canvas. */
const TOGGLE_KEY = 'h'

/**
 * Whether a key belongs to something else already.
 *
 * The graphics panel is full of ranges and selects, and a range answers letter
 * keys of its own. Taking `h` out from under a focused control would make the
 * panel feel haunted.
 */
function isTyping (target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement))
    return false

  return target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
}

/**
 * The card, and the handle that puts it away.
 *
 * The handle is appended to the *figure* rather than to the card, for the same
 * reason `.gfx-toggle` lives outside `.gfx`: a control that hides along with the
 * thing it controls is a one-way door. The card slides off the left edge and the
 * chevron stays exactly where it was.
 *
 * Nothing here is removed from the document — the card is markup that shipped
 * with the page, and the log inside it goes on collecting whether or not anyone
 * is looking at it. `inert` is what keeps a card parked off-screen out of the
 * tab order and out of the hit test.
 */
export function createScapeCard ({ card, host, hidden, onToggle }: ScapeCardOptions): ScapeCard {
  const toggle = document.createElement('button')

  toggle.type      = 'button'
  toggle.className = 'card-toggle'

  if (card.id)
    toggle.setAttribute('aria-controls', card.id)

  function setHidden (next: boolean): void {
    card.dataset.hidden = String(next)
    card.toggleAttribute('inert', next)

    toggle.setAttribute('aria-expanded', String(!next))
    toggle.setAttribute('aria-label', next ? 'show the scape details' : 'hide the scape details')
    toggle.title       = `${next ? 'show' : 'hide'} the scape details · ${TOGGLE_KEY}`
    toggle.textContent = next ? '›' : '‹'
  }

  function flip (): void {
    const next = card.dataset.hidden !== 'true'

    setHidden(next)
    onToggle?.(next)
  }

  function onKey (event: KeyboardEvent): void {
    if (event.key.toLowerCase() !== TOGGLE_KEY)
      return

    // Shift is fine — nothing else wants shift+h. The rest are the browser's and
    // the platform's, and a page that eats those is a page that broke a shortcut.
    if (event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target))
      return

    event.preventDefault()
    flip()
  }

  toggle.addEventListener('click', flip)
  window.addEventListener('keydown', onKey)
  host.append(toggle)
  setHidden(hidden)

  return {
    element: toggle,

    dispose () {
      toggle.removeEventListener('click', flip)
      window.removeEventListener('keydown', onKey)
      toggle.remove()

      // The card outlives this controller, so it is handed back the way it was
      // found rather than left inert with nothing able to un-hide it.
      card.removeAttribute('inert')
      delete card.dataset.hidden
    },
  }
}

// perf: one click listener, one key listener, and two attribute writes per flip.
