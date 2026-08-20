import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from './args.ts'


/**
 * What the runtime offers, and which half of it this scape uses.
 *
 * Every run of the brief starts with no memory, and nothing in the repository
 * said what `threejs-scene` can already do. So each run rebuilt what it could
 * not see: a gesture rig, a renderer bootstrap, three copies of one ribbon
 * builder. The fix is not a rule about checking first — it is a file that
 * answers *what is already there* in one read.
 *
 * It is generated, and it is **committed**, which is the opposite of the rule
 * for everything else the brief prints. The rest of that is derived from this
 * working tree and churns on every commit, so committing it would just add a
 * second thing every branch conflicts on. This one only moves when the
 * dependency's version does, so its diff is a review event worth having: *the
 * surface we build on changed, here is how*.
 *
 * The parse is a regex over the shipped `.d.ts` files rather than a trip
 * through the typescript compiler. That is the same bargain every instrument
 * here makes — these have to keep working when the dependency tree is exactly
 * what is under suspicion — and a barrel of `export { a, b } from './c.js'` is
 * not a language, it is a list.
 */

const PACKAGE = 'threejs-scene'
const ROOT    = resolve(import.meta.dir, '..')
const DIST    = join(ROOT, 'node_modules', PACKAGE, 'dist')
const OUT     = join(ROOT, `${PACKAGE}-api.md`)

/** The subpaths a consumer can import, and the barrel each one resolves to. */
const ENTRIES: Record<string, string> = {
  [PACKAGE]:                         'lib/index.d.ts',
  [`${PACKAGE}/modules/lighting`]:   'modules/lighting/index.d.ts',
  [`${PACKAGE}/modules/orbit`]:      'modules/orbit/index.d.ts',
  [`${PACKAGE}/modules/post`]:       'modules/post/index.d.ts',
  [`${PACKAGE}/modules/post/webgl`]: 'modules/post/webgl/index.d.ts',
  [`${PACKAGE}/modules/assets`]:     'modules/assets/index.d.ts',
  [`${PACKAGE}/modules/physics`]:    'modules/physics/index.d.ts',
}

interface Symbol_ {
  name: string

  /** `function`, `const`, `class`, `interface` or `type` — whatever it was declared as. */
  kind: string

  /** The `.d.ts` it is declared in, relative to `dist/`. */
  from: string
}

const read = (path: string): string => {
  try {
    return readFileSync(path, 'utf8')
  }
  catch {
    return ''
  }
}

/** Everything one file declares, by name. */
function declarationsIn (path: string): Map<string, Symbol_> {
  const found = new Map<string, Symbol_>()
  const rel   = path.slice(DIST.length + 1)

  for (const match of read(path).matchAll(/^export declare (?:abstract )?(function|const|class|enum) (\w+)/gm))
    found.set(match[2], { name: match[2], kind: match[1], from: rel })

  for (const match of read(path).matchAll(/^export (interface|type) (\w+)/gm))
    found.set(match[2], { name: match[2], kind: match[1], from: rel })

  return found
}

/**
 * Every name one barrel puts on a subpath.
 *
 * Follows both forms the package uses — the explicit `export { a, b } from`
 * and the wildcard `export * from` — and is depth-limited rather than
 * cycle-tracked because these barrels are a tree and a stack overflow is a
 * worse failure than a missing symbol.
 */
function exportsOf (path: string, depth = 0): Map<string, Symbol_> {
  const found = new Map<string, Symbol_>()

  if (depth > 6)
    return found

  const source = read(path)
  const here   = dirname(path)
  const local  = declarationsIn(path)

  for (const [ name, symbol ] of local)
    found.set(name, symbol)

  // export { a, b as c } from './d.js'  /  export type { E } from './d.js'
  for (const match of source.matchAll(/^export (?:type )?\{([^}]+)\} from '([^']+)'/gm)) {
    const target = join(here, match[2].replace(/\.js$/, '.d.ts'))
    const inner  = exportsOf(target, depth + 1)

    for (const entry of match[1].split(',')) {
      const parts = entry.trim().replace(/^type /, '')
        .split(/\s+as\s+/)
      const from = parts[0]?.trim()
      const as   = (parts[1] ?? parts[0])?.trim()

      if (!as || !from)
        continue

      found.set(as, inner.get(from) ?? { name: as, kind: 'unknown', from: match[2] })
    }
  }

  // export * from './d.js'
  for (const match of source.matchAll(/^export \* from '([^']+)'/gm)) {
    const target = join(here, match[1].replace(/\.js$/, '.d.ts'))

    for (const [ name, symbol ] of exportsOf(target, depth + 1))
      found.set(name, symbol)
  }

  return found
}

/** Every `.ts` under a directory, skipping nothing — tests import the runtime too. */
function sources (dir: string): string[] {
  const out: string[] = []

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)

    if (statSync(path).isDirectory())
      out.push(...sources(path))
    else if (path.endsWith('.ts'))
      out.push(path)
  }

  return out
}

/** Which of our files import each name, by the subpath they take it from. */
function callSites (): Map<string, Set<string>> {
  const used = new Map<string, Set<string>>()

  for (const path of [ ...sources(join(ROOT, 'src')), ...sources(join(ROOT, 'scripts')) ]) {
    const source = read(path)
    const rel    = path.slice(ROOT.length + 1)

    for (const match of source.matchAll(/import (?:type )?\{([^}]+)\} from '(threejs-scene[^']*)'/g))
      for (const entry of match[1].split(',')) {
        const name = entry.trim().replace(/^type /, '')
          .split(/\s+as\s+/)[0]?.trim()

        if (!name)
          continue

        const key = `${match[2]}::${name}`

        used.set(key, (used.get(key) ?? new Set()).add(rel))
      }
  }

  return used
}

const version = JSON.parse(read(join(ROOT, 'node_modules', PACKAGE, 'package.json')) || '{}').version ?? 'unknown'
const args    = parseArgs(Bun.argv.slice(2))

const used  = callSites()
const lines = [
  `# ${PACKAGE} ${version}`,
  '',
  'Generated by `bun run api:digest` — do not edit. Regenerate when the dependency',
  'version changes; the diff is the review.',
  '',
  'Every symbol the runtime exports, and whether this scape uses it. **Read this before',
  'writing a helper** — the reinvention this file exists to stop was never a discipline',
  'problem, it was that nothing here said what was already available.',
  '',
]

let total = 0
let mine  = 0

for (const [ entry, barrel ] of Object.entries(ENTRIES)) {
  const symbols = [ ...exportsOf(join(DIST, barrel)).values() ].sort((a, b) => a.name.localeCompare(b.name))

  if (symbols.length === 0)
    continue

  const usedHere = symbols.filter(symbol => used.has(`${entry}::${symbol.name}`))

  total += symbols.length
  mine  += usedHere.length

  lines.push(`## \`${entry}\``, '')
  lines.push(`${usedHere.length} of ${symbols.length} used.`, '')
  lines.push('| symbol | kind | used by |', '| --- | --- | --- |')

  for (const symbol of symbols) {
    const sites = used.get(`${entry}::${symbol.name}`)
    const where = sites
      ? [ ...sites ].slice(0, 3).join(', ') + (sites.size > 3 ? ` +${sites.size - 3}` : '')
      : '—'

    lines.push(`| \`${symbol.name}\` | ${symbol.kind} | ${where} |`)
  }

  lines.push('')
}

lines.splice(9, 0, `**${mine} of ${total} exports used.** Everything marked \`—\` is available and unused.`, '')

const markdown = `${lines.join('\n')}\n`

if (args.has('check')) {
  const current = read(OUT)
  const stamped = current.match(/^# threejs-scene (\S+)/)?.[1]

  if (!current)
    console.log(`api digest  MISSING — run \`bun run api:digest\``)
  else if (stamped !== version)
    console.log(`api digest  STALE — installed ${version}, digest stamped ${stamped}; run \`bun run api:digest\``)
  else
    console.log(`api digest  matches ${PACKAGE}@${version}`)

  // Never a failure and never a silent rewrite. Bumping the dependency is a
  // reviewed decision; regenerating a committed file as a side effect of a
  // status check would hide exactly the diff worth reading.
  process.exit(0)
}

await Bun.write(OUT, markdown)
console.log(`${OUT.slice(ROOT.length + 1)}  ${mine}/${total} used  (${PACKAGE}@${version})`)
