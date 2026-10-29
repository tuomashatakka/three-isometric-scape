import { parseArgs } from './args.ts'


/**
 * The checks, as one command and one answer — sized for a cloud box.
 *
 * Two shapes:
 *
 * - **default, the light gate.** lint (only the files the diff touched — a
 *   fresh cloud container has no eslint cache, and a cold lint of the whole
 *   repository is most of a minute) and typecheck side by side, then
 *   only the tests the diff can reach (`bun test --changed=<base>`, which walks
 *   the import graph), then `vite build` without its second `tsc`, then the prop
 *   audit. Never more than two processes at once: five heavy ones in parallel is
 *   what got the old gate killed for memory on a four-core cloud container.
 * - **`--full`, what CI runs.** Every test, `bun run build` as written. Run it
 *   before merging something that changes the world model.
 *
 * `--base <ref>` picks what "changed" means (default `origin/main`); `--only
 * lint,test` runs a subset. The answer is one line per check, with the full
 * output of whichever failed underneath.
 */

interface Check {
  name: string
  argv: string[]
}

interface Result {
  name:    string
  ok:      boolean
  seconds: number
  output:  string
}

async function run (check: Check): Promise<Result> {
  const started = performance.now()
  const child   = Bun.spawn(check.argv, { stdout: 'pipe', stderr: 'pipe' })

  const [ out, err, code ] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  return {
    name:    check.name,
    ok:      code === 0,
    seconds: (performance.now() - started) / 1000,
    output:  `${out}${err}`.trimEnd(),
  }
}

const args = parseArgs(Bun.argv.slice(2))
const full = args.has('full')
const base = args.str('base', 'origin/main')
const only = args.list('only').flatMap(name => name.split(','))

/** Source files changed against the base, committed or not — what the light lint reads. */
async function changedSources (): Promise<string[] | 'all'> {
  const child = Bun.spawn([ 'git', 'diff', '--name-only', '--diff-filter=ACMR', base ], { stdout: 'pipe' })
  const names = (await new Response(child.stdout).text()).split('\n').filter(Boolean)

  // A change to the lint config or the dependencies changes what every file means.
  if (names.some(name => (/^(eslint\.config|package\.json|bun\.lock|tsconfig)/).test(name)))
    return 'all'
  return names.filter(name => (/\.(ts|mts|js|mjs)$/).test(name))
}

const changed = full ? 'all' : await changedSources()
const lint    = changed === 'all'
  ? [ 'bun', 'run', 'lint' ]
  : [ 'bunx', 'eslint', '--max-warnings', '0', '--cache', '--cache-location', 'node_modules/.cache/eslint/', '--no-warn-ignored', ...changed ]

/** Each stage runs its checks side by side; the stages run in order. */
const STAGES: Check[][] = [
  [
    { name: 'lint', argv: changed === 'all' || changed.length > 0 ? lint : [ 'true' ]},
    { name: 'typecheck', argv: [ 'bun', 'run', 'typecheck' ]},
  ],
  [{ name: 'test', argv: full ? [ 'bun', 'test', '--only-failures' ] : [ 'bun', 'test', `--changed=${base}`, '--only-failures' ]}],
  [{ name: 'build', argv: full ? [ 'bun', 'run', 'build' ] : [ 'bunx', 'vite', 'build', '--logLevel', 'warn' ]}],
  [{ name: 'prop:audit', argv: [ 'bun', 'run', 'prop:audit' ]}],
]

const started           = performance.now()
const results: Result[] = []

for (const stage of STAGES) {
  const wanted = only.length ? stage.filter(check => only.includes(check.name)) : stage

  results.push(...await Promise.all(wanted.map(run)))
}

if (results.length === 0)
  throw new Error(`--only wants some of ${STAGES.flat().map(check => check.name)
    .join(', ')}`)

const elapsed = (performance.now() - started) / 1000
const failed  = results.filter(result => !result.ok)
const width   = Math.max(...results.map(result => result.name.length))

console.log(`\ngate · ${elapsed.toFixed(1)}s · ${full ? 'full' : `light, tests changed since ${base}`}\n`)

for (const result of results)
  console.log(`${result.name.padEnd(width + 2)}${result.ok ? 'ok  ' : 'FAIL'}${result.seconds.toFixed(1).padStart(7)}s`)

for (const result of failed)
  console.log(`\n${'─'.repeat(64)}\n${result.name}\n\n${result.output || '(no output)'}`)

if (failed.length > 0) {
  console.log(`\n${failed.length} of ${results.length} failed: ${failed.map(result => result.name).join(', ')}`)
  process.exitCode = 1
}
