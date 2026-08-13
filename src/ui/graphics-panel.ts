import { readNumber, readText, writePath } from './scape-controls.ts'
import type { ControlSection, RangeControl, ScapeControl, SelectControl } from './scape-controls.ts'


export interface GraphicsPanel {
  element: HTMLElement
  dispose(): void
}

export interface GraphicsPanelOptions {

  /** The live config every control addresses by path. */
  config:   object
  sections: ControlSection[]

  /** Shown in the footer — the tier the scene actually resolved to. */
  tier: string

  /** Start collapsed. Coarse pointers and narrow viewports should. */
  collapsed?: boolean

  /** Fired after any control writes to the config. */
  onChange?(): void

  /** Fired after `reset` restores the authored values. */
  onReset?(): void
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
 * `<fieldset>` with a `<legend>`. That is what gets keyboard support, screen
 * reader semantics and the platform's own touch targets for free, and none of
 * it is worth reimplementing to save a stylesheet rule.
 *
 * The panel owns no state beyond what a switch has to remember to be
 * non-destructive. Every control reads its value from the config on render and
 * writes straight back on input, so the scene and the overlay cannot drift
 * apart — there is only ever one copy of the number.
 */
export function createGraphicsPanel (options: GraphicsPanelOptions): GraphicsPanel {
  const { config, sections, tier, onChange, onReset } = options
  const refresh: (() => void)[]                       = []
  const liveRefresh: (() => void)[]                   = []
  const cleanup: (() => void)[]                       = []

  const root   = element('aside', 'gfx')
  const form   = element('form', 'gfx-body')
  const head   = element('header', 'gfx-head')
  const title  = element('p', 'gfx-title', 'graphics')
  const reset  = element('button', 'gfx-reset', 'reset')
  const toggle = element('button', 'gfx-toggle')

  root.dataset.collapsed = String(options.collapsed ?? false)
  form.id                = 'gfx-body'

  // Opt out of form-state restoration. Browsers put a reloaded form's controls
  // back the way the user left them, which is right for a form and wrong for a
  // panel: these controls are a *view* of the config, and restoration happens
  // after the initial sync — so a reload would show numbers the scene does not
  // have, which is precisely the drift the whole design exists to prevent.
  form.autocomplete = 'off'

  toggle.type = 'button'
  toggle.setAttribute('aria-controls', form.id)
  reset.type  = 'button'

  function setCollapsed (collapsed: boolean): void {
    root.dataset.collapsed = String(collapsed)
    toggle.setAttribute('aria-expanded', String(!collapsed))
    toggle.setAttribute('aria-label', collapsed ? 'show graphics settings' : 'hide graphics settings')
    toggle.textContent = collapsed ? '‹' : '›'
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
      label.title             = 'not available on this quality tier'
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
      field.title               = 'not available on this quality tier'
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

  for (const section of sections) {
    const fieldset = element('fieldset', 'gfx-section')
    const legend   = element('legend', 'gfx-legend', section.title)

    fieldset.append(legend)
    for (const control of section.controls)
      fieldset.append(buildControl(control))

    form.append(fieldset)
  }

  const footer = element('p', 'gfx-foot', `webgl · ${tier} tier · live`)

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

  head.append(title, reset, toggle)
  root.append(head, form, footer)

  setCollapsed(options.collapsed ?? false)
  sync()

  return {
    element: root,

    dispose () {
      for (const off of cleanup)
        off()
      cleanup.length     = 0
      refresh.length     = 0
      liveRefresh.length = 0
      root.remove()
    },
  }
}
