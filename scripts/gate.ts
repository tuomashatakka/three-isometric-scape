import { parseArgs } from './args.ts'


/**
 * The four checks, as one command and one answer.
 *
 * They were always run one after another, which is both slower than it needs to
 * be and four blocks of output to read when three of them said nothing. Nothing
 * in the gate contends with anything else in it: no test opens a port, spawns a
 * process or launches a browser, and `vite build` only ever *writes* `dist/`,
 * which none of the others read. So they run at once and the answer is four
 * lines, with the full output of whichever one failed underneath.
 *
 * The order in the table is the order to read a failure in, not the order they
 * finish: a type error usually explains a test failure, and a lint warning
 * explains neither.
 */

interface Check {
  name: string

  /** The `package.json` script, so this cannot drift from what CI runs. */
  script: string
}

const CHECKS: readonly Check[] = [
  { name: 'lint', script: 'lint' },
  { name: 'typecheck', script: 'typecheck' },
  { name: 'test', script: 'test' },
  { name: 'build', script: 'build' },
]

interface Result {
  name:    string
  ok:      boolean
  seconds: number
  output:  string
}

async function run (script: string, argv: readonly string[] = []): Promise<{ ok: boolean; output: string }> {
  const child = Bun.spawn([ 'bun', 'run', script, ...argv ], {
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [ out, err, code ] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  return { ok: code === 0, output: `${out}${err}`.trimEnd() }
}

async function timed (check: Check, fast: boolean): Promise<Result> {
  const started = performance.now()

  // `build` is `tsc --noEmit && vite build`, so it typechecks a second time
  // while `typecheck` is doing it too. That is wasted cpu rather than a race,
  // and it is wasted the same way when the four run in sequence. Skipping it is
  // opt-in because the moment this stops running the exact command CI runs is
  // the moment "gate green, ci red" becomes possible.
  const { ok, output } = check.script === 'build' && fast
    ? await run('vite', [ 'build' ])
    : await run(check.script)

  return { name: check.name, ok, output, seconds: (performance.now() - started) / 1000 }
}

const args   = parseArgs(Bun.argv.slice(2))
const fast   = args.has('fast')
const serial = args.has('sequential')
const only   = args.list('only').flatMap(name => name.split(','))
const wanted = only.length ? CHECKS.filter(check => only.includes(check.name)) : CHECKS

if (wanted.length === 0)
  throw new Error(`--only wants some of ${CHECKS.map(check => check.name).join(', ')}`)

const started           = performance.now()
const results: Result[] = []

if (serial)
  // Four cpu-bound processes on a one- or two-core box thrash worse than they
  // parallelise, and the ref worktree `scape:diff` builds is exactly such a box.
  for (const check of wanted)
    results.push(await timed(check, fast))
else
  results.push(...await Promise.all(wanted.map(check => timed(check, fast))))

const elapsed = (performance.now() - started) / 1000
const failed  = results.filter(result => !result.ok)
const width   = Math.max(...results.map(result => result.name.length))

console.log(`\ngate · ${elapsed.toFixed(1)}s${serial ? ' (sequential)' : ''}${fast ? ' (fast)' : ''}\n`)

for (const result of results)
  console.log(
    `${result.name.padEnd(width + 2)}${result.ok ? 'ok  ' : 'FAIL'}${result.seconds.toFixed(1).padStart(7)}s`,
  )

// Only the failures get their output. The whole point of a summary is that a
// clean run is four lines rather than four screens.
for (const result of failed) {
  console.log(`\n${'─'.repeat(64)}\n${result.name}\n`)
  console.log(result.output || '(no output)')
}

if (failed.length > 0) {
  console.log(`\n${failed.length} of ${results.length} failed: ${failed.map(r => r.name).join(', ')}`)
  process.exitCode = 1
}
