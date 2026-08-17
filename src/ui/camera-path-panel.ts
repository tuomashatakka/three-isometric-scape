import type { CameraOpening } from '../scene/camera-controls.ts'
import type { CameraPath } from '../scene/camera-path.ts'


export interface CameraPathPanel {

  /** The section's contents, for the drawer to wrap in a `<details>`. */
  content: HTMLElement
  dispose(): void
}

export interface CameraPathPanelOptions {
  path: CameraPath

  /** Where the camera is now — what "add" captures. */
  poseNow(): CameraOpening

  /** Fired whenever the tour or its settings change, so the session can be stored. */
  onChange(): void
}

function element<K extends keyof HTMLElementTagNameMap> (
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)

  if (className)
    node.className = className
  if (text !== undefined)
    node.textContent = text

  return node
}

/** How often the play button re-reads a tour that can finish on its own. */
const TICK = 400

interface TimingRow {
  timing:  HTMLElement
  seconds: HTMLInputElement
  secOut:  HTMLOutputElement
  loopRow: HTMLLabelElement
  loopBox: HTMLInputElement
}

/** The two settings a tour has, as ordinary form controls. */
function buildTimingRow (): TimingRow {
  const timing  = element('div', 'gfx-row')
  const seconds = element('input', 'gfx-range')
  const secLbl  = element('label', 'gfx-label', 'seconds a leg')
  const secOut  = element('output', 'gfx-value')
  const loopRow = element('label', 'gfx-switch')
  const loopBox = element('input')

  seconds.type         = 'range'
  seconds.autocomplete = 'off'
  seconds.id           = 'gfx-path-seconds'
  seconds.min          = '1'
  seconds.max          = '30'
  seconds.step         = '0.5'
  secLbl.htmlFor       = seconds.id
  secOut.htmlFor       = seconds.id

  loopBox.type         = 'checkbox'
  loopBox.autocomplete = 'off'
  loopBox.id           = 'gfx-path-loop'

  timing.append(secLbl, seconds, secOut)
  loopRow.append(loopBox, element('span', undefined, 'loop back to the first stop'))
  return { timing, seconds, secOut, loopRow, loopBox }
}

/**
 * The waypoint tour, as a control.
 *
 * Deliberately not expressible in the drawer's generic control vocabulary. Every
 * other section is a list of dotted config paths, which is what makes the panel,
 * the settings snapshot and the url overrides one mechanism — and a tour is not
 * a number in the config. It is a list the reader builds by *flying the camera
 * somewhere and pressing a button*, which is a different kind of thing, so it
 * gets a different kind of section rather than four fake knobs.
 *
 * A waypoint is captured rather than typed for the same reason. Nobody knows
 * what heading they want in degrees; everybody knows what they want the frame to
 * look like, and the frame they are looking at already is the answer.
 */
export function createCameraPathPanel (options: CameraPathPanelOptions): CameraPathPanel {
  const { path, poseNow, onChange } = options
  const cleanup: (() => void)[]     = []

  const content = element('div', 'gfx-fields')
  const list    = element('ol', 'gfx-waypoints')
  const empty   = element('p', 'gfx-note', 'fly the scape, then add a stop. two or more make a tour.')
  const actions = element('div', 'gfx-actions')

  const add  = element('button', 'gfx-action', 'add stop')
  const play = element('button', 'gfx-action gfx-action-wide', 'play')
  const drop = element('button', 'gfx-action', 'clear')

  const { timing, seconds, secOut, loopRow, loopBox } = buildTimingRow()

  for (const button of [ add, play, drop ])
    button.type = 'button'

  function listen (node: HTMLElement, type: string, handler: () => void): void {
    node.addEventListener(type, handler)
    cleanup.push(() => node.removeEventListener(type, handler))
  }

  /** Rebuilt outright on every change. Nobody has forty waypoints. */
  function render (): void {
    const { waypoints } = path
    const settings      = path.options

    list.replaceChildren()

    for (const [ index, point ] of waypoints.entries()) {
      const row    = element('li', 'gfx-waypoint')
      const label  = element('span', 'gfx-waypoint-name', `${index + 1}`)
      const where  = element('span', 'gfx-waypoint-where')
      const remove = element('button', 'gfx-waypoint-drop', '×')

      where.textContent = `${Math.round(point.x)}, ${Math.round(point.z)} · ${Math.round(point.viewSize)}m · ${Math.round(point.heading)}°`

      remove.type = 'button'
      remove.setAttribute('aria-label', `remove stop ${index + 1}`)
      listen(remove, 'click', () => {
        path.removeAt(index)
        onChange()
        render()
      })

      row.append(label, where, remove)
      list.append(row)
    }

    empty.hidden          = waypoints.length > 0
    play.disabled         = waypoints.length < 2
    drop.disabled         = waypoints.length === 0
    play.textContent      = path.playing ? 'stop' : 'play'
    seconds.valueAsNumber = settings.legSeconds
    secOut.value          = `${settings.legSeconds.toFixed(1)}s`
    loopBox.checked       = settings.loop
  }

  listen(add, 'click', () => {
    path.add(poseNow())
    onChange()
    render()
  })

  listen(play, 'click', () => {
    if (path.playing)
      path.stop()
    else
      path.play()
    render()
  })

  listen(drop, 'click', () => {
    path.clear()
    onChange()
    render()
  })

  listen(seconds, 'input', () => {
    path.set({ legSeconds: seconds.valueAsNumber })
    secOut.value = `${seconds.valueAsNumber.toFixed(1)}s`
    onChange()
  })

  listen(loopBox, 'change', () => {
    path.set({ loop: loopBox.checked })
    onChange()
    render()
  })

  // A tour that does not loop stops when it runs out of path, and a grab of the
  // scape stops one mid-flight — neither of which this panel is told about. One
  // slow poll is cheaper than a callback for a button caption.
  const timer = setInterval(() => {
    const caption = path.playing ? 'stop' : 'play'

    if (play.textContent !== caption)
      play.textContent = caption
  }, TICK)

  cleanup.push(() => clearInterval(timer))

  actions.append(add, play, drop)
  content.append(empty, list, actions, timing, loopRow)

  render()

  return {
    content,

    dispose () {
      for (const off of cleanup)
        off()
      cleanup.length = 0
    },
  }
}
