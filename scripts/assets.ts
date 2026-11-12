#!/usr/bin/env bun

/**
 * The asset catalog, as text: every prop in the roster, every shared kit
 * helper a prop is built through, and every texture the scape samples.
 *
 * The three lists already existed — `PROPS` in `props/index.ts`, the exported
 * helpers scattered across `src/scene/props`, `TEXTURES` in
 * `textures/catalogue.ts` — but a run that wanted "what is there to reuse" had
 * to know all three places and read them. This prints them in one table each,
 * with the file to open, in about a second and without a gpu. The same roster
 * with pixels is `/props.html` (the main page's card links to it).
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createSeededRng } from 'threejs-scene'
import { HERO_PROPS, PROPS, SCATTER_PROPS, buildProp, resolvePalette } from '../src/scene/props/index.ts'
import type { PropName } from '../src/scene/props/index.ts'
import { TEXTURES } from '../src/scene/textures/catalogue.ts'
import { parseArgs } from './args.ts'


const HELP = `assets — the asset catalog: props, kit helpers, textures

  bun run assets [filter...] [options]

  filter         keep rows whose name, group or file contains any of these
  --props        only the prop roster
  --kit          only the shared kit helpers
  --textures     only the textures
  --json         the same rows as json
  --seed <n>     build seed for the measurements   (default 11)

  see one:  bun run prop:map <name> --view front,right     (ascii, no gpu)
            bun run dev  →  /props.html?prop=<name>        (four views, gpu)
`

const PROP_DIR = join(import.meta.dir, '../src/scene/props')

interface PropRow {
  name:      string
  group:     'hero' | 'scatter' | 'unplaced'
  triangles: number
  size:      string
  file:      string
}

interface KitRow {
  name: string
  file: string
  line: number
}

/** Every non-test module in the prop directory, with its source. */
function propSources (): { file: string, source: string }[] {
  return readdirSync(PROP_DIR)
    .filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .sort()
    .map(file => ({ file, source: readFileSync(join(PROP_DIR, file), 'utf8') }))
}

function propRows (seed: number, sources: { file: string, source: string }[]): PropRow[] {
  const palette = resolvePalette()
  const heroes  = new Set<string>(HERO_PROPS)
  const scatter = new Set<string>(SCATTER_PROPS)

  return (Object.keys(PROPS) as PropName[]).map(name => {
    const geometry = buildProp(name, createSeededRng(seed), palette)
    geometry.computeBoundingBox()

    const box     = geometry.boundingBox
    const count   = geometry.index?.count ?? geometry.getAttribute('position').count
    const metres  = box ? [ box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z ] : [ 0, 0, 0 ]
    const builder = PROPS[name].name
    const file    = sources.find(entry => entry.source.includes(`function ${builder} `))?.file ?? '?'

    geometry.dispose()

    return {
      name,
      group:     heroes.has(name) ? 'hero' : scatter.has(name) ? 'scatter' : 'unplaced',
      triangles: Math.round(count / 3),
      size:      metres.map(value => value.toFixed(1)).join(' × '),
      file:      `props/${file}`,
    }
  })
}

/** Exported functions that are not prop builders: what a prop is built *through*. */
function kitRows (sources: { file: string, source: string }[]): KitRow[] {
  return sources.flatMap(({ file, source }) => source
    .split('\n')
    .flatMap((text, index) => {
      const name = (/^export function (\w+)/).exec(text)?.[1]

      return name && !name.startsWith('build') ? [{ name, file: `props/${file}`, line: index + 1 }] : []
    }))
}

function table (rows: string[][]): string {
  const widths = rows[0].map((_cell, column) => Math.max(...rows.map(row => row[column].length)))

  return rows.map(row => row.map((cell, column) => cell.padEnd(widths[column])).join('  ')
    .trimEnd()).join('\n')
}

function main (): void {
  const args = parseArgs(process.argv.slice(2))

  if (args.has('help')) {
    process.stdout.write(HELP)
    return
  }

  const wanted = args.rest.map(word => word.toLowerCase())
  const keep   = (...fields: string[]): boolean => wanted.length === 0 ||
    wanted.some(word => fields.some(field => field.toLowerCase().includes(word)))
  const only     = [ 'props', 'kit', 'textures' ].filter(section => args.has(section))
  const show     = (section: string): boolean => only.length === 0 || only.includes(section)
  const sources  = propSources()
  const props    = show('props') ? propRows(args.num('seed', 11), sources).filter(row => keep(row.name, row.group, row.file)) : []
  const kit      = show('kit') ? kitRows(sources).filter(row => keep(row.name, row.file)) : []
  const textures = show('textures') ? TEXTURES.filter(entry => keep(entry.id, entry.origin, entry.module)) : []

  if (args.has('json')) {
    process.stdout.write(JSON.stringify({ props, kit, textures }, null, 1) + '\n')
    return
  }

  const out: string[] = []

  if (props.length > 0)
    out.push(`props · ${props.length} · src/scene/props/index.ts (PROPS)`, table([
      [ 'name', 'group', 'tris', 'w × h × d (m)', 'file' ],
      ...props.map(row => [ row.name, row.group, String(row.triangles), row.size, row.file ]),
    ]), '')

  if (kit.length > 0)
    out.push(`kit · ${kit.length} shared helpers a prop is built through`, table([
      [ 'helper', 'where' ],
      ...kit.map(row => [ row.name, `${row.file}:${row.line}` ]),
    ]), '')

  if (textures.length > 0)
    out.push(`textures · ${textures.length} · src/scene/textures/catalogue.ts (TEXTURES)`, table([
      [ 'id', 'origin', 'px', 'module', 'what' ],
      ...textures.map(entry => [ entry.id, entry.origin, String(entry.size), entry.module, entry.purpose.slice(0, 70) ]),
    ]), '')

  process.stdout.write(out.length > 0 ? out.join('\n') : 'nothing matches\n')
}

main()
