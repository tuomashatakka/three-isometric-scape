/**
 * The log, printed where the phone can show it.
 *
 * A WebGL context that dies on a device you cannot attach a debugger to leaves
 * you with exactly one channel: the page itself. So everything worth knowing —
 * the tier that was picked and why, the gpu that picked it up, the frame the
 * loss happened on, whatever three said on its way down — goes into the status
 * output as a rolling log, newest first, with the seconds since load on every
 * line. Tapping it copies the lot.
 *
 * Console patching is part of that channel and not an accident: three reports
 * shader compile failures, context loss and every other renderer complaint
 * through `console.error` and `console.warn`, and on a phone nobody is reading
 * those.
 */
export interface Diagnostics {

  /** Ordinary progress. The newest line is what the reader sees first. */
  say(message: string): void

  /** Something that went wrong. Same log, marked. */
  fail(message: string): void

  /**
   * Live numbers, rewritten in place at the top rather than appended.
   *
   * Only rendered in verbose mode — a line per second of frame stats would
   * bury the one line that matters.
   */
  vitals(line: string): void

  /** Whether the caller should bother gathering the numbers `vitals` prints. */
  readonly verbose: boolean

  dispose(): void
}

export interface DiagnosticsOptions {
  output: HTMLOutputElement

  /** Adds the live vitals line. Set from `?debug` in the url. */
  verbose?: boolean
}

/** Lines kept. Enough to hold the whole approach to a crash. */
const HISTORY = 40

/** Where a single entry is cut. Three prints entire shaders on a bad compile. */
const WIDTH = 460

/**
 * Where the run before this one is left for whoever comes next.
 *
 * A crash whose only witness is the page is a crash that a reload destroys, and
 * a reload is the first thing anyone does. `sessionStorage` rather than `local`:
 * this is evidence about the tab, and it should not outlive it.
 */
const CARRY = 'three-iso:log'

/** What separates the run that is happening from the run that already did. */
const SEPARATOR = '────── previous run ──────'

function readCarried (): string[] {
  try {
    const raw             = globalThis.sessionStorage?.getItem(CARRY)
    const parsed: unknown = raw ? JSON.parse(raw) : null

    if (!Array.isArray(parsed))
      return []

    return parsed.filter((line): line is string => typeof line === 'string').slice(0, HISTORY)
  }
  catch {
    // Storage that is unavailable, a quota that is full, a value someone else
    // wrote — all of them mean the same thing here: no previous run to show.
    return []
  }
}

const started = performance.now()

function elapsed (): string {
  return `${((performance.now() - started) / 1000).toFixed(1)}s`
}

function describe (value: unknown): string {
  if (typeof value === 'string')
    return value

  if (value instanceof Error)
    return `${value.name}: ${value.message}`

  if (typeof value === 'object' && value !== null)
    try {
      return JSON.stringify(value)
    }
    catch {
      return Object.prototype.toString.call(value)
    }

  return String(value)
}

function clip (text: string): string {
  const flat = text.replace(/\s+/gu, ' ').trim()
  return flat.length > WIDTH ? `${flat.slice(0, WIDTH)}…` : flat
}

export function createDiagnostics ({ output, verbose = false }: DiagnosticsOptions): Diagnostics {
  const log: string[] = []

  // Read once and then left alone. Only `log` is ever written back out, so the
  // carried section cannot compound into a copy of every run this tab has had.
  const carried = readCarried()

  let vital = ''

  function lines (): string[] {
    const body = verbose && vital ? [ vital, ...log ] : [ ...log ]

    return carried.length > 0 ? [ ...body, SEPARATOR, ...carried ] : body
  }

  function render (): void {
    output.textContent = lines().join('\n')

    // Assigning `textContent` leaves `scrollTop` where it was, so a log that is
    // taller than its box drifts the newest lines off the top as it grows — and
    // newest-first means the newest lines are the entire point. Three
    // photographs of a phone screen were needed to recover what this one
    // assignment keeps in view.
    output.scrollTop = 0
  }

  function persist (): void {
    try {
      globalThis.sessionStorage?.setItem(CARRY, JSON.stringify(log))
    }
    catch {
      // The log is still on screen. Losing the copy for the next load is not
      // worth an entry in the log about losing it.
    }
  }

  function push (mark: string, message: string): void {
    log.unshift(`${elapsed().padStart(6)} ${mark} ${clip(message)}`)

    if (log.length > HISTORY)
      log.length = HISTORY

    persist()
    render()
  }

  // Console output is the log's main source, so the log cannot be allowed to
  // become one — anything raised while rendering an entry is dropped rather
  // than fed back in.
  let reentrant = false

  function capture (mark: string, args: readonly unknown[]): void {
    if (reentrant)
      return

    reentrant = true
    try {
      push(mark, args.map(describe).join(' '))
    }
    finally {
      reentrant = false
    }
  }

  const nativeError = console.error
  const nativeWarn  = console.warn

  console.error = (...args: unknown[]): void => {
    capture('[err ]', args)
    nativeError(...args)
  }

  console.warn = (...args: unknown[]): void => {
    capture('[warn]', args)
    nativeWarn(...args)
  }

  function onError (event: ErrorEvent): void {
    capture('[err ]', [ `${event.message} — ${event.filename}:${event.lineno}` ])
  }

  function onRejection (event: PromiseRejectionEvent): void {
    capture('[err ]', [ `unhandled rejection · ${describe(event.reason)}` ])
  }

  async function onCopy (): Promise<void> {
    try {
      await navigator.clipboard.writeText(lines().reverse()
        .join('\n'))
      push('[    ]', 'log copied to the clipboard')
    }
    catch {
      push('[    ]', 'could not reach the clipboard · select the text instead')
    }
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  output.addEventListener('click', () => void onCopy())

  // The log rewrites itself line by line, and a polite live region would read
  // the whole thing out every time it did. `role="log"` keeps it navigable
  // without turning a debug surface into a monologue.
  output.dataset.log = 'true'
  output.setAttribute('role', 'log')
  output.setAttribute('aria-live', 'off')
  output.setAttribute('aria-label', 'scape diagnostics · tap to copy')
  output.title = 'tap to copy'

  return {
    verbose,

    say (message) {
      push('[    ]', message)
    },

    fail (message) {
      push('[FAIL]', message)
    },

    vitals (line) {
      // Stamped like a log entry, because it is the one line that does not
      // scroll away — without a time on it there is no telling whether it is
      // live or the last thing a dead scape managed to say.
      vital = `${elapsed().padStart(6)} [live] ${clip(line)}`

      if (verbose)
        render()
    },

    dispose () {
      console.error = nativeError
      console.warn  = nativeWarn
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    },
  }
}
