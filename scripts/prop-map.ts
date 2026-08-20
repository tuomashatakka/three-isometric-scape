import { createSeededRng } from 'threejs-scene'
import { ASCII_VIEWS, auditPalette, rasterizeAscii } from 'threejs-scene/modules/assets'
import type { AsciiViewName } from 'threejs-scene/modules/assets'
import { NORDIC_PALETTE } from '../src/scene/props/palette.ts'
import { PROPS, buildProp, resolvePalette } from '../src/scene/props/index.ts'
import type { PropName } from '../src/scene/props/index.ts'
import { parseArgs } from './args.ts'


/**
 * Draw one prop, on its own, in the terminal.
 *
 * `scape:map` answers *where is everything*; this answers *what does one thing
 * look like*, which is the question you actually have while editing a mesh. It
 * builds exactly one geometry — no scene, no terrain, no GL context, no browser
 * — so the loop between changing a number in `buildings.ts` and seeing what it
 * did is about 40 ms.
 *
 * ```
 * bun run prop:map farmhouse                 # the play angle
 * bun run prop:map farmhouse --view right    # the angle you can measure from
 * bun run prop:map barn --view front,right   # both, stacked
 * bun run prop:map farmhouse --audit         # what colour is where, by height
 * bun run prop:map --all --cols 48           # the whole roster as contact sheet
 * bun run prop:watch farmhouse               # the same, on every save
 * ```
 */

const HELP = `prop:map — draw one prop as ASCII, without a GPU

  bun run prop:map <name...> [options]

  --view <a,b>   ${Object.keys(ASCII_VIEWS).join(' ')}          (default iso)
  --cols <n>     grid width                       (default 96)
  --cell <n>     terminal cell height/width       (default 2)
  --seed <n>     build seed                       (default 11)
  --audit        palette-by-height table
  --all          every prop in the roster
  --list         just the names
`

function fixed (value: number, places = 2): string {
  return value.toFixed(places).padStart(places + 4)
}

/**
 * One prop, one block of output.
 *
 * The stats line carries the numbers a picture cannot: a base that is not zero
 * means the prop floats or sinks when it is plopped, and the triangle count is
 * the only honest measure of what a "small tweak" to a builder actually cost.
 */
function drawProp (name: PropName, views: AsciiViewName[], cols: number, cell: number, seed: number, audit: boolean): string {
  const palette       = resolvePalette()
  const geometry      = buildProp(name, createSeededRng(seed), palette)
  const out: string[] = []

  for (const view of views) {
    const shot = rasterizeAscii(geometry, { view, cols, cell })
    const size = [ 0, 1, 2 ].map(axis => shot.max[axis] - shot.min[axis])

    out.push(`── ${name} · ${view} ${'─'.repeat(Math.max(0, cols - name.length - view.length - 6))}`)
    out.push(...shot.lines)
    out.push('')
    out.push(
      `   tris ${String(shot.triangles).padStart(5)}` +
      `   size ${fixed(size[0])} ×${fixed(size[1])} ×${fixed(size[2])} m` +
      `   base ${fixed(shot.min[1])} m` +
      `   ${(1 / shot.scale).toFixed(3)} m/col`,
    )
    out.push('')
  }

  if (audit) {
    out.push(`   ${'colour'.padEnd(16)}${'facets'.padStart(7)}${'lowest'.padStart(9)}${'highest'.padStart(9)}`)
    for (const row of auditPalette(geometry, NORDIC_PALETTE))
      out.push(`   ${row.name.padEnd(16)}${String(row.facets).padStart(7)}${fixed(row.minY).padStart(9)}${fixed(row.maxY).padStart(9)}`)
    out.push('')
  }

  geometry.dispose()

  return out.join('\n')
}

function main (): void {
  const args  = parseArgs(process.argv.slice(2))
  const names = Object.keys(PROPS) as PropName[]

  if (args.has('help')) {
    process.stdout.write(HELP)
    return
  }

  if (args.has('list')) {
    process.stdout.write(names.join('\n') + '\n')
    return
  }

  const wanted = args.has('all')
    ? names
    : args.rest.filter((name): name is PropName => name in PROPS)

  const unknown = args.has('all') ? [] : args.rest.filter(name => !(name in PROPS))

  if (unknown.length > 0) {
    process.stderr.write(`unknown prop: ${unknown.join(', ')}\n\n${HELP}`)
    process.exitCode = 1
    return
  }

  if (wanted.length === 0) {
    process.stdout.write(HELP)
    return
  }

  const views = (args.str('view', 'iso').split(',') as AsciiViewName[]).filter(view => view in ASCII_VIEWS)
  const cols  = Math.max(16, Math.min(400, args.num('cols', 96)))
  const cell  = args.num('cell', 2)
  const seed  = args.num('seed', 11)
  const audit = args.has('audit')

  for (const name of wanted)
    process.stdout.write(drawProp(name, views.length > 0 ? views : [ 'iso' ], cols, cell, seed, audit) + '\n')
}

main()
