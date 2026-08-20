import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from './args.ts'


/**
 * Where a run starts, in one read.
 *
 * A scene enhancement run begins with no memory of the last one, and the brief
 * it is handed points at four prose documents totalling well over a thousand
 * lines. Reading all of it before touching anything is most of what a short run
 * costs, and almost none of it is what *this* run needed to know.
 *
 * So: the parts of those documents that are mechanically derivable, derived. It
 * does not replace reading — it replaces *searching*. The readme index means a
 * run opens the one section it is about to change at the line it starts on,
 * rather than skimming seven hundred lines to find it.
 *
 * Everything here is printed and nothing is committed. It all derives from this
 * working tree and would churn on every commit, so a committed copy would just
 * be a second thing for every branch to conflict on — the same reasoning that
 * keeps `.scape/` out of git. The one exception is the api digest, which moves
 * only when the dependency does; this checks its stamp and says so.
 *
 * Advisory, always. It never sets a failing exit code. Step 2 of the brief
 * orients and step 6 verifies, and collapsing that distinction would turn every
 * orientation into a gate.
 */

const ROOT = resolve(import.meta.dir, '..')

/** The enforced ceiling from the shared eslint config, comments and blanks skipped. */
const MAX_LINES = 666

const read = (path: string): string => {
  try {
    return readFileSync(join(ROOT, path), 'utf8')
  }
  catch {
    return ''
  }
}

function walk (dir: string): string[] {
  const out: string[] = []

  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`

    if (statSync(join(ROOT, rel)).isDirectory())
      out.push(...walk(rel))
    else if (rel.endsWith('.ts'))
      out.push(rel)
  }

  return out
}

/** Lines that count against the limit: not blank, not a comment. */
function effective (source: string): number {
  let count   = 0
  let inBlock = false

  for (const raw of source.split('\n')) {
    const line = raw.trim()

    if (inBlock) {
      if (line.includes('*/'))
        inBlock = false
      continue
    }

    if (line === '' || line.startsWith('//'))
      continue

    if (line.startsWith('/*')) {
      if (!line.includes('*/'))
        inBlock = true
      continue
    }

    count += 1
  }

  return count
}

function inventory (): string[] {
  const files = [ ...walk('src'), ...walk('scripts') ]
  const sized = files.map(path => ({ path, lines: effective(read(path)) }))
  const tests = sized.filter(file => file.path.endsWith('.test.ts'))
  const code  = sized.filter(file => !file.path.endsWith('.test.ts'))
  const heavy = sized.filter(file => file.lines > MAX_LINES).sort((a, b) => b.lines - a.lines)
  const total = sized.reduce((sum, file) => sum + file.lines, 0)

  const over = heavy.length === 0
    ? `none over ${MAX_LINES}`
    : `OVER ${MAX_LINES}: ${heavy.map(file => `${file.path} ${file.lines}`).join(', ')}`

  // The biggest few, because "what is large here" is the question a run asks
  // when it is deciding where a new thing belongs.
  const largest = [ ...code ].sort((a, b) => b.lines - a.lines).slice(0, 5)

  return [
    `${files.length} files · ${total} lines · ${code.length} code, ${tests.length} test · ${over}`,
    `largest: ${largest.map(file => `${file.path.replace(/^src\//, '')} ${file.lines}`).join(' · ')}`,
  ]
}

/** Every heading in the design record, and the line it starts on. */
function readmeIndex (): string[] {
  const lines         = read('README.md').split('\n')
  const out: string[] = []

  for (const [ index, line ] of lines.entries()) {
    const match = line.match(/^(#{1,3}) (.+)$/)

    if (match)
      out.push(`${'  '.repeat(match[1].length - 1)}${match[2]}  ·L${index + 1}`)
  }

  return out
}

/** What the last runs were about, so this one does not repeat a theme. */
function themes (count: number): string[] {
  return read('CHANGELOG.md')
    .split('\n')
    .filter(line => line.startsWith('## '))
    .slice(0, count)
    .map(line => line.slice(3))
}

function apiDigest (): string {
  const installed = JSON.parse(read('node_modules/threejs-scene/package.json') || '{}').version ?? 'unknown'
  const digest    = read('threejs-scene-api.md')

  if (!digest)
    return `MISSING — run \`bun run api:digest\``

  const stamped = digest.match(/^# threejs-scene (\S+)/)?.[1]
  const used    = digest.match(/\*\*(\d+) of (\d+) exports used/)

  if (stamped !== installed)
    return `STALE — installed ${installed}, digest stamped ${stamped}; run \`bun run api:digest\``

  return `matches threejs-scene@${installed}${used ? ` · ${used[1]}/${used[2]} exports used` : ''}`
}

async function shell (command: string[]): Promise<string> {
  try {
    const child         = Bun.spawn(command, { stdout: 'pipe', stderr: 'pipe' })
    const [ out, code ] = await Promise.all([ new Response(child.stdout).text(), child.exited ])

    return code === 0 ? out.trim() : ''
  }
  catch {
    return ''
  }
}

/**
 * Open pull requests, because the brief says to finish one before opening
 * another. Absent `gh`, that is a thing to check by hand rather than a failure.
 */
async function openPulls (): Promise<string> {
  const raw = await shell([ 'gh', 'pr', 'list', '--state', 'open', '--json', 'number,title,headRefName' ])

  if (!raw)
    return 'gh unavailable — check open pull requests by hand'

  const parsed = JSON.parse(raw) as { number: number; title: string; headRefName: string }[]

  return parsed.length === 0
    ? 'none open — clear to branch'
    : parsed.map(pr => `#${pr.number} ${pr.title} (${pr.headRefName})`).join('\n            ')
}

const args    = parseArgs(Bun.argv.slice(2))
const only    = args.list('sections').flatMap(name => name.split(','))
const wants   = (name: string): boolean => only.length === 0 || only.includes(name)
const started = performance.now()

const [ map, pulls ] = await Promise.all([
  wants('map') ? shell([ 'bun', 'scripts/scape-map.ts', '--stats' ]) : '',
  wants('prs') ? openPulls() : '',
])

const elapsed       = ((performance.now() - started) / 1000).toFixed(1)
const out: string[] = []
const row           = (label: string, body: string): void => {
  const [ first, ...rest ] = body.split('\n')

  out.push(`${label.padEnd(12)}${first}`)
  for (const line of rest)
    out.push(`            ${line}`)
}

out.push(`\nbrief · ${elapsed}s\n`)

if (wants('inventory'))
  for (const [ index, line ] of inventory().entries())
    row(index === 0 ? 'inventory' : '', line)

if (wants('themes'))
  row('themes', themes(args.num('themes', 8)).join('\n'))

if (wants('api'))
  row('api digest', apiDigest())

if (wants('prs'))
  row('open prs', pulls)

if (wants('map') && map)
  row('scape:map', map)

if (wants('readme')) {
  out.push('', 'readme      the design record, by section — read the one you are about to change')
  out.push('')
  for (const line of readmeIndex())
    out.push(`  ${line}`)
}

const text = out.join('\n')

console.log(text)

if (args.str('out'))
  await Bun.write(join(ROOT, args.str('out', '')), `${text}\n`)
