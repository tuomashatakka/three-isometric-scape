import type { ControlSection, RangeControl, ScapeControl, SelectControl } from './scape-controls.ts'


export interface GraphicsPanel {
  element: HTMLElement
  dispose(): void
}

export interface GraphicsPanelOptions {
  sections: ControlSection[]

  /** Shown in the footer — the tier the scene actually resolved to. */
  tier: string

  /** Start collapsed. Coarse pointers and narrow viewports should. */
  collapsed?: boolean
}

/** Two decimals, minus the noise: `0.30` reads worse than `0.3` in a column of numbers. */
function format (value: number, step: number): string {
  return step >= 1 ? String(Math.round(value)) : value.toFixed(step >= 0.1 ? 1 : 2)
}

/** Capture a control's current value as a restore closure, keeping its type intact. */
function remember (control: RangeControl | SelectControl): () => void {
  if (control.kind === 'select') {
    const value = control.get()
    return () => control.set(value)
  }

  const value = control.get()
  return () => control.set(value)
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
 * The panel owns no state. Every control reads its value from the config on
 * render and writes straight back on input, so the scene and the overlay cannot
 * drift apart — there is only ever one copy of the number.
 */
export function createGraphicsPanel (options: GraphicsPanelOptions): GraphicsPanel {
  const { sections, tier }      = options
  const refresh: (() => void)[] = []
  const cleanup: (() => void)[] = []

  const root   = element('aside', 'gfx')
  const form   = element('form', 'gfx-body')
  const head   = element('header', 'gfx-head')
  const title  = element('p', 'gfx-title', 'graphics')
  const reset  = element('button', 'gfx-reset', 'reset')
  const toggle = element('button', 'gfx-toggle')

  root.dataset.collapsed = String(options.collapsed ?? false)
  form.id                = 'gfx-body'

  toggle.type = 'button'
  toggle.setAttribute('aria-controls', form.id)
  reset.type  = 'button'

  function setCollapsed (collapsed: boolean): void {
    root.dataset.collapsed = String(collapsed)
    toggle.setAttribute('aria-expanded', String(!collapsed))
    toggle.setAttribute('aria-label', collapsed ? 'show graphics settings' : 'hide graphics settings')
    toggle.textContent = collapsed ? '‹' : '›'
  }

  /** Re-read every control from the config. Cheap, and only ever on reset. */
  function sync (): void {
    for (const update of refresh)
      update()
  }

  function listen (node: HTMLElement, type: string, handler: () => void): void {
    node.addEventListener(type, handler)
    cleanup.push(() => node.removeEventListener(type, handler))
  }

  function buildRange (control: RangeControl): HTMLElement {
    const row   = element('div', 'gfx-row')
    const label = element('label', 'gfx-label', control.label)
    const input = element('input', 'gfx-range')
    const value = element('output', 'gfx-value')

    input.type    = 'range'
    input.id      = `gfx-${control.id}`
    input.min     = String(control.min)
    input.max     = String(control.max)
    input.step    = String(control.step)
    label.htmlFor = input.id
    value.htmlFor = input.id

    if (control.available === false) {
      input.disabled          = true
      row.dataset.unavailable = 'true'
      label.title             = 'not available on this quality tier'
    }

    listen(input, 'input', () => {
      control.set(input.valueAsNumber)
      value.value = format(input.valueAsNumber, control.step)
    })

    refresh.push(() => {
      input.valueAsNumber = control.get()
      value.value         = format(control.get(), control.step)
    })

    row.append(label, input, value)
    return row
  }

  function buildControl (control: ScapeControl): HTMLElement {
    if (control.kind === 'range')
      return buildRange(control)

    if (control.kind === 'select') {
      const row    = element('div', 'gfx-row')
      const label  = element('label', 'gfx-label', control.label)
      const select = element('select', 'gfx-select')

      select.id     = `gfx-${control.id}`
      label.htmlFor = select.id

      for (const name of control.options) {
        const option = element('option', undefined, name)
        option.value = name
        select.append(option)
      }

      listen(select, 'change', () => control.set(select.value))
      refresh.push(() => {
        select.value = control.get()
      })

      row.append(label, select)
      return row
    }

    const group  = element('div', 'gfx-group')
    const field  = element('label', 'gfx-switch')
    const box    = element('input')
    const name   = element('span', undefined, control.label)
    const nested = element('div', 'gfx-nested')

    box.type = 'checkbox'
    box.id   = `gfx-${control.id}`

    if (control.available === false) {
      box.disabled              = true
      group.dataset.unavailable = 'true'
      field.title               = 'not available on this quality tier'
    }

    for (const child of control.children)
      nested.append(buildRange(child))

    listen(box, 'change', () => {
      control.set(box.checked)
      group.dataset.on = String(box.checked)
      sync()
    })

    refresh.push(() => {
      box.checked      = control.get()
      group.dataset.on = String(control.get())
    })

    field.append(box, name)
    group.append(field, nested)
    return group
  }

  // Snapshot the authored values before anything is built, so `reset` puts the
  // scene back exactly as it shipped rather than to whatever a slider's `min`
  // happens to be. Toggles carry no value of their own — their switch state is
  // derived from the strength underneath — so only the leaves are recorded.
  const defaults: (() => void)[] = []

  for (const section of sections)
    for (const control of section.controls) {
      const leaves = control.kind === 'toggle' ? control.children : [ control ]

      for (const leaf of leaves)
        defaults.push(remember(leaf))
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
    for (const restore of defaults)
      restore()
    sync()
  })

  head.append(title, reset, toggle)
  root.append(head, form, footer)

  setCollapsed(options.collapsed ?? false)
  sync()

  return {
    element: root,

    dispose () {
      for (const off of cleanup)
        off()
      cleanup.length = 0
      refresh.length = 0
      root.remove()
    },
  }
}
