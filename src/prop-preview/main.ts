import { createSeededRng } from 'threejs-scene'
import { HERO_PROPS, PROPS, SCATTER_PROPS, buildProp, resolvePalette } from '../scene/props/index.ts'
import type { PropName } from '../scene/props/index.ts'
import { PANES, createQuadView } from './quad-view.ts'
import type { PaneName, QuadView } from './quad-view.ts'
import { renderContactSheet } from './contact-sheet.ts'
import type { Thumbnail } from './contact-sheet.ts'
import './preview.css'


/**
 * The prop preview page, at `/props.html`.
 *
 * Kept off the scape entirely — its own entry, its own canvas, nothing imported
 * from the scene beyond the prop roster itself. That separation is the feature:
 * the page cannot be broken by a change to the terrain, the atmosphere or the
 * post chain, so it stays usable exactly when those are what you are debugging.
 *
 * ## Two modes, decided by the query string
 *
 * `?prop=` names one prop and gets the four viewports. Bare, the page is a
 * contact sheet of the whole roster — because arriving at a prop editor already
 * knowing which of forty-odd props you want is the rare case, not the common
 * one, and a page that demands that answer up front has to guess it. It used to
 * guess `farmhouse`.
 *
 * Both are real URLs, so a viewpoint is a link and Back does what it says.
 */

const palette = resolvePalette()

function el<T extends HTMLElement> (id: string): T {
  const found = document.getElementById(id)

  if (!found)
    throw new Error(`prop preview is missing #${id}`)

  return found as T
}

const canvas  = el<HTMLCanvasElement>('preview-canvas')
const picker  = el<HTMLSelectElement>('prop-picker')
const seedBox = el<HTMLInputElement>('prop-seed')
const readout = el<HTMLElement>('prop-readout')
const labels  = el<HTMLElement>('pane-labels')
const index   = el<HTMLElement>('prop-index')
const filter  = el<HTMLInputElement>('prop-filter')
const back    = el<HTMLAnchorElement>('back-to-index')

const toggles: Record<string, HTMLInputElement> = {
  grid:      el<HTMLInputElement>('toggle-grid'),
  axes:      el<HTMLInputElement>('toggle-axes'),
  wireframe: el<HTMLInputElement>('toggle-wireframe'),
  bounds:    el<HTMLInputElement>('toggle-bounds'),
}

const NAMES   = Object.keys(PROPS) as PropName[]
const heroes  = new Set<string>(HERO_PROPS)
const scatter = new Set<string>(SCATTER_PROPS)

/** Group the roster the way the scape spends it, not alphabetically. */
const GROUPS: [string, PropName[]][] = [
  [ 'placed by hand', NAMES.filter(name => heroes.has(name)) ],
  [ 'scattered', NAMES.filter(name => scatter.has(name)) ],
  [ 'unplaced', NAMES.filter(name => !heroes.has(name) && !scatter.has(name)) ],
]

function fillPicker (): void {
  for (const [ label, members ] of GROUPS) {
    if (members.length === 0)
      continue

    const group = document.createElement('optgroup')

    group.label = label

    for (const name of members) {
      const option = document.createElement('option')

      option.value       = name
      option.textContent = name
      group.append(option)
    }

    picker.append(group)
  }
}

interface Route {
  prop: PropName | null
  seed: number
}

function readUrl (): Route {
  const params = new URLSearchParams(location.search)
  const asked  = params.get('prop')
  const seed   = Number(params.get('seed'))

  return {
    prop: asked && asked in PROPS ? asked as PropName : null,
    seed: Number.isFinite(seed) && seed > 0 ? seed : 11,
  }
}

function urlFor (prop: PropName | null, seed: number): string {
  const params = new URLSearchParams()

  if (prop)
    params.set('prop', prop)

  params.set('seed', String(seed))

  return `${location.pathname}?${params}`
}

function layoutLabels (solo: PaneName | null): void {
  labels.textContent = ''

  for (const name of PANES) {
    if (solo && solo !== name)
      continue

    const tag = document.createElement('span')

    tag.className   = `pane-label pane-${solo ? 'solo' : name}`
    tag.textContent = solo ? `${name} · press 0 for all four` : name
    labels.append(tag)
  }
}

/** One card. An anchor, so middle-click and ⌘-click open a real second tab. */
function card (thumb: Thumbnail, seed: number): HTMLAnchorElement {
  const link = document.createElement('a')

  link.className    = 'prop-card'
  link.href         = urlFor(thumb.name, seed)
  link.dataset.name = thumb.name

  thumb.canvas.className = 'prop-card-shot'
  link.append(thumb.canvas)

  const name = document.createElement('span')

  name.className   = 'prop-card-name'
  name.textContent = thumb.name

  const meta = document.createElement('span')

  meta.className   = 'prop-card-meta'
  meta.textContent = `${thumb.triangles} tris · ` +
    `${thumb.size.x.toFixed(1)}×${thumb.size.y.toFixed(1)}×${thumb.size.z.toFixed(1)} m`

  link.append(name, meta)

  // A prop whose base is not on the ground plane floats or sinks when the
  // dressing plops it. A few are meant to — the boathouse stands on piles in
  // the water — so this is a flag to look at, not a failure.
  if (Math.abs(thumb.base) > 0.05) {
    const flag = document.createElement('span')

    flag.className   = 'prop-card-flag'
    flag.textContent = `base ${thumb.base.toFixed(2)}`
    link.append(flag)
  }

  return link
}

function main (): void {
  fillPicker()

  let view: QuadView | null = null
  let solo: PaneName | null = null
  let sheet: Thumbnail[]    = []
  let sheetSeed             = -1

  function applyToggles (): void {
    view?.setOptions({
      grid:      toggles.grid.checked,
      axes:      toggles.axes.checked,
      wireframe: toggles.wireframe.checked,
      bounds:    toggles.bounds.checked,
      solo,
    })
  }

  function paint (seed: number): void {
    const wanted = filter.value.trim().toLowerCase()

    index.textContent = ''

    let shown = 0

    for (const [ label, members ] of GROUPS) {
      const matching = members.filter(name => name.toLowerCase().includes(wanted))

      if (matching.length === 0)
        continue

      const heading = document.createElement('h2')

      heading.className   = 'prop-group'
      heading.textContent = `${label} · ${matching.length}`

      const grid = document.createElement('div')

      grid.className = 'prop-grid'

      for (const name of matching) {
        const thumb = sheet.find(entry => entry.name === name)

        if (thumb) {
          grid.append(card(thumb, seed))
          shown += 1
        }
      }

      index.append(heading, grid)
    }

    readout.textContent = shown === NAMES.length
      ? `${NAMES.length} props`
      : `${shown} of ${NAMES.length} props`
  }

  function showIndex (seed: number): void {
    document.body.dataset.mode = 'index'

    // Built once per seed and kept. The sheet is static once drawn, so building
    // it again on every visit would be paying for a WebGL context to produce a
    // picture that is already sitting in memory.
    if (sheetSeed !== seed) {
      readout.textContent = 'drawing the roster…'
      sheet     = renderContactSheet(NAMES, seed)
      sheetSeed = seed
    }

    paint(seed)
  }

  function showSingle (prop: PropName, seed: number): void {
    document.body.dataset.mode = 'single'
    picker.value               = prop
    back.href                  = urlFor(null, seed)

    view ??= createQuadView(canvas)
    applyToggles()
    view.setGeometry(buildProp(prop, createSeededRng(seed), palette))

    readout.textContent = `${view.triangles} tris · ` +
      `${view.size.x.toFixed(2)} × ${view.size.y.toFixed(2)} × ${view.size.z.toFixed(2)} m · ` +
      `base ${view.base.toFixed(3)} m`
  }

  function route (): void {
    const { prop, seed } = readUrl()

    seedBox.value = String(seed)

    if (prop)
      showSingle(prop, seed)
    else
      showIndex(seed)
  }

  function currentSeed (): number {
    return Math.max(1, Math.round(Number(seedBox.value) || 11))
  }

  function go (prop: PropName | null, seed: number): void {
    history.pushState(null, '', urlFor(prop, seed))
    route()
  }

  picker.addEventListener('change', () => go(picker.value as PropName, currentSeed()))

  seedBox.addEventListener('change', () => {
    history.replaceState(null, '', urlFor(readUrl().prop, currentSeed()))
    route()
  })

  filter.addEventListener('input', () => paint(currentSeed()))

  for (const toggle of Object.values(toggles))
    toggle.addEventListener('change', applyToggles)

  // Modified clicks are left to the browser — the cards are real links, and
  // behaving like links is the whole reason they are anchors.
  index.addEventListener('click', event => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('.prop-card')

    if (!link || event.metaKey || event.ctrlKey || event.shiftKey)
      return

    event.preventDefault()
    go(link.dataset.name as PropName, currentSeed())
  })

  back.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey)
      return

    event.preventDefault()
    go(null, currentSeed())
  })

  window.addEventListener('popstate', route)

  window.addEventListener('keydown', event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
      if (event.key === 'Escape')
        event.target.blur()

      return
    }

    if (event.key === 'Escape' && document.body.dataset.mode === 'single') {
      go(null, currentSeed())
      return
    }

    if (document.body.dataset.mode !== 'single')
      return

    const digit = Number(event.key)

    if (event.key === '0' || digit >= 1 && digit <= PANES.length) {
      solo = event.key === '0' ? null : PANES[digit - 1]
      layoutLabels(solo)
      applyToggles()
      return
    }

    const shortcut: Record<string, HTMLInputElement | undefined> = {
      g: toggles.grid,
      x: toggles.axes,
      w: toggles.wireframe,
      b: toggles.bounds,
    }

    const toggle = shortcut[event.key.toLowerCase()]

    if (toggle) {
      toggle.checked = !toggle.checked
      applyToggles()
      return
    }

    if (event.key.toLowerCase() === 'f')
      view?.frame()
  })

  layoutLabels(solo)
  route()
}

main()
