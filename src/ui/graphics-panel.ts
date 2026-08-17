import { readSectionOpen, writeSectionOpen } from './overlay-state.ts'
import { readNumber, readText, writePath } from './scape-controls.ts'
import type { ControlSection, RangeControl, ScapeControl, SelectControl } from './scape-controls.ts'


export interface GraphicsPanel {
  element: HTMLElement
  dispose(): void
}

/** A section the panel does not build — a bespoke one, handed in ready-made. */
export interface PanelExtra {
  group: string
  title: string

  /** The section's contents. The `<details>` and its summary are still the panel's. */
  content: HTMLElement
  open?:   boolean
  dispose?(): void
}

export interface GraphicsPanelOptions {

  /**
   * The drawer's chrome, from the page.
   *
   * The `<aside>`, its header, the collapse handle, the form and the footer all
   * ship in `index.html`. This module fills the form and wires the two buttons;
   * it does not build furniture. That is what lets the panel survive the canvas
   * being replaced under it after a context loss, and what gives the drawer a
   * shape before this module has parsed.
   */
  root: HTMLElement

  /** The live config every control addresses by path. */
  config:   object
  sections: ControlSection[]

  /** Bespoke sections — the waypoint tour — filed into the groups by name. */
  extras?: PanelExtra[]

  /** Shown in the footer — the budget the scene was actually built on. */
  tier: string

  /** Start collapsed. Coarse pointers and narrow viewports should. */
  collapsed?: boolean

  /** Fired after any control writes to the config. */
  onChange?(): void

  /** Fired after `reset` restores the authored values. */
  onReset?(): void

  /** Fired after a control that cannot take effect without the scape being rebuilt. */
  onRebuild?(): void
}

/** How often knobs marked `live` re-read a value the scene is driving itself. */
const LIVE_INTERVAL = 250

/** Two decimals, minus the noise: `0.30` reads worse than `0.3` in a column of numbers. */
function format (value: number, step: number): string {
  if (step >= 1)
    return String(Math.round(value))
  if (step >= 0.1)
    return value.toFixed(1)

  return value.toFixed(step >= 0.01 ? 2 : 3)
}

function slug (path: string): string {
  return `gfx-${path.replace(/\./gu, '-')}`
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

/**
 * The graphics overlay.
 *
 * Built from real form elements rather than styled divs — a range is an
 * `<input type="range">`, a switch is a checkbox in a `<label>`, a section is a
 * `<details>` with a `<summary>`. That is what gets keyboard support, screen
 * reader semantics, the platform's own touch targets and — for the sections —
 * open/close behaviour and its animation for free, with no script and no state
 * of this module's own. None of it is worth reimplementing to save a stylesheet
 * rule.
 *
 * The panel owns no state beyond what a switch has to remember to be
 * non-destructive. Every control reads its value from the config on render and
 * writes straight back on input, so the scene and the overlay cannot drift
 * apart — there is only ever one copy of the number.
 */
export function createGraphicsPanel (options: GraphicsPanelOptions): GraphicsPanel {
  const { root, config, sections, tier, onChange, onReset, onRebuild } = options
  const refresh: (() => void)[]                                        = []
  const liveRefresh: (() => void)[]                                    = []
  const cleanup: (() => void)[]                                        = []

  const form   = root.querySelector<HTMLFormElement>('#gfx-body')
  const reset  = root.querySelector<HTMLButtonElement>('#gfx-reset')
  const toggle = root.querySelector<HTMLButtonElement>('#gfx-toggle')
  const foot   = root.querySelector<HTMLElement>('#gfx-foot')

  if (!form || !reset || !toggle)
    throw new Error('the graphics drawer needs its markup from index.html')

  function setCollapsed (collapsed: boolean): void {
    root.dataset.collapsed = String(collapsed)
    toggle!.setAttribute('aria-expanded', String(!collapsed))
    toggle!.setAttribute('aria-label', collapsed ? 'show graphics settings' : 'hide graphics settings')
    toggle!.textContent = collapsed ? '‹' : '›'
  }

  /** Re-read every control from the config. Cheap, and only ever on a switch or a reset. */
  function sync (): void {
    for (const update of refresh)
      update()
  }

  function listen (node: HTMLElement, type: string, handler: () => void): void {
    node.addEventListener(type, handler)
    cleanup.push(() => node.removeEventListener(type, handler))
  }

  function buildRange (control: RangeControl, after?: () => void): HTMLElement {
    const row   = element('div', 'gfx-row')
    const label = element('label', 'gfx-label', control.label)
    const input = element('input', 'gfx-range')
    const value = element('output', 'gfx-value')

    input.type         = 'range'
    input.autocomplete = 'off'
    input.id           = slug(control.path)
    input.min          = String(control.min)
    input.max          = String(control.max)
    input.step         = String(control.step)
    label.htmlFor      = input.id
    value.htmlFor      = input.id

    if (control.available === false) {
      input.disabled          = true
      row.dataset.unavailable = 'true'
      label.title             = 'not built on this tier · set effects to “all” to turn it on'
    }

    listen(input, 'input', () => {
      writePath(config, control.path, input.valueAsNumber)
      value.value = format(input.valueAsNumber, control.step)
      after?.()
      onChange?.()
    })

    const update = (): void => {
      input.valueAsNumber = readNumber(config, control.path)
      value.value         = format(input.valueAsNumber, control.step)
    }

    refresh.push(update)

    // A live knob is one the scene moves on its own — the day clock. Skip it
    // while it has focus, or the running cycle fights the hand dragging it.
    if (control.live)
      liveRefresh.push(() => {
        if (document.activeElement !== input)
          update()
      })

    row.append(label, input, value)
    return row
  }

  function buildSelect (control: SelectControl): HTMLElement {
    const row    = element('div', 'gfx-row')
    const label  = element('label', 'gfx-label', control.label)
    const select = element('select', 'gfx-select')

    select.autocomplete = 'off'
    select.id           = slug(control.path)
    label.htmlFor       = select.id

    for (const name of control.options) {
      const option = element('option', undefined, name)
      option.value = name
      select.append(option)
    }

    listen(select, 'change', () => {
      writePath(config, control.path, select.value)
      onChange?.()

      // After the change is written and saved, never before: a rebuild tears
      // this panel down and puts a new one up, so anything left to do afterwards
      // would be done by a disposed closure.
      if (control.rebuild)
        onRebuild?.()
    })

    refresh.push(() => {
      select.value = readText(config, control.path)
    })

    row.append(label, select)
    return row
  }

  function buildControl (control: ScapeControl): HTMLElement {
    if (control.kind === 'range')
      return buildRange(control)
    if (control.kind === 'select')
      return buildSelect(control)

    const strength = control.children[0]
    const group    = element('div', 'gfx-group')
    const field    = element('label', 'gfx-switch')
    const box      = element('input')
    const name     = element('span', undefined, control.label)
    const nested   = element('div', 'gfx-nested')
    let remembered = readNumber(config, strength.path) || control.restore

    box.type         = 'checkbox'
    box.autocomplete = 'off'
    box.id           = `${slug(strength.path)}-on`

    if (strength.available === false) {
      box.disabled              = true
      group.dataset.unavailable = 'true'
      field.title               = 'not built on this tier · set effects to “all” to turn it on'
    }

    // Dragging the strength itself to zero *is* switching the effect off — there
    // is no other flag for it to disagree with — so the switch follows its own
    // knob rather than waiting for the next full sync to notice.
    const track = (): void => {
      const on = readNumber(config, strength.path) > 0

      box.checked      = on
      group.dataset.on = String(on)
    }

    for (const [ index, child ] of control.children.entries())
      nested.append(buildRange(child, index === 0 ? track : undefined))

    listen(box, 'change', () => {
      if (box.checked)
        writePath(config, strength.path, remembered || control.restore)
      else {
        remembered = readNumber(config, strength.path) || remembered
        writePath(config, strength.path, 0)
      }

      group.dataset.on = String(box.checked)
      sync()
      onChange?.()
    })

    refresh.push(track)

    field.append(box, name)
    group.append(field, nested)
    return group
  }

  /**
   * One collapsible section.
   *
   * `<details>` rather than a `<fieldset>` and a click handler: it collapses,
   * takes the keyboard, announces its state and — with `::details-content` in
   * the stylesheet — animates, all without this module knowing that it did. The
   * only script here is remembering which ones the reader left open.
   */
  function buildSection (title: string, contents: HTMLElement, fallbackOpen: boolean): HTMLElement {
    const details = element('details', 'gfx-section')
    const summary = element('summary', 'gfx-summary', title)

    details.open = readSectionOpen(title) ?? fallbackOpen
    details.append(summary, contents)

    listen(details, 'toggle', () => writeSectionOpen(title, details.open))
    return details
  }

  const extras  = options.extras ?? []
  const groups  = new Map<string, HTMLElement>()
  const ungroup = '·'

  /**
   * The block a group's sections live in, made on first mention.
   *
   * Runs of sections that share a group get one heading and one rule above them.
   * A section with no group gets a block with no heading, which is what keeps a
   * panel that has never been grouped looking exactly as it did.
   */
  function groupBody (name: string): HTMLElement {
    const existing = groups.get(name)

    if (existing)
      return existing

    const block = element('section', 'gfx-block')

    if (name !== ungroup)
      block.append(element('h2', 'gfx-group-title', name))

    groups.set(name, block)
    form!.append(block)
    return block
  }

  /** Bespoke sections, filed under the group they named. */
  function placeExtras (group: string): void {
    for (const extra of extras)
      if (extra.group === group && !extra.content.isConnected)
        groupBody(group).append(buildSection(extra.title, extra.content, extra.open ?? false))
  }

  for (const section of sections) {
    const body  = element('div', 'gfx-fields')
    const group = section.group ?? ungroup

    for (const control of section.controls)
      body.append(buildControl(control))

    groupBody(group).append(buildSection(section.title, body, section.open ?? false))
    placeExtras(group)
  }

  // Anything filed under a group no section declared still gets a home rather
  // than silently not rendering.
  for (const extra of extras)
    placeExtras(extra.group)

  if (foot)
    foot.textContent = `webgl · ${tier} · live`

  listen(toggle, 'click', () => setCollapsed(root.dataset.collapsed !== 'true'))
  listen(reset, 'click', () => {
    onReset?.()
    sync()
  })

  if (liveRefresh.length > 0) {
    const timer = setInterval(() => {
      if (root.dataset.collapsed === 'true')
        return
      for (const update of liveRefresh)
        update()
    }, LIVE_INTERVAL)

    cleanup.push(() => clearInterval(timer))
  }

  setCollapsed(options.collapsed ?? false)
  sync()

  return {
    element: root,

    dispose () {
      for (const off of cleanup)
        off()
      for (const extra of extras)
        extra.dispose?.()

      cleanup.length     = 0
      refresh.length     = 0
      liveRefresh.length = 0

      // The chrome is the page's and stays; only what this module built goes.
      form.replaceChildren()
    },
  }
}
