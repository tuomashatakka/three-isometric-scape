import { findChromium } from './browser.ts'
import { parseArgs } from './args.ts'


/**
 * Everything a run should have before it starts thinking.
 *
 * Three of these are ordinary. The fourth is the point.
 *
 * **Chromium is checked first**, not at stage 5. It used to be discovered at
 * the moment a run wanted a picture — which is *after* the budget has been
 * spent on building the thing it wanted a picture of. Knowing at minute one
 * that the captures are unavailable changes what a run chooses to do: it picks
 * a theme the ascii instruments can judge, and says so in the pull request,
 * rather than finishing blind and claiming it looks fine.
 *
 * **The reference build starts here, detached, and keeps running.** The half of
 * `scape:diff` that is slow — checking out another commit, building it, and
 * photographing six poses through a software rasteriser — depends on nothing
 * the run is about to write. Started now, it finishes while the change is being
 * authored, and stage 5 pays almost nothing for it. It is best-effort in the
 * strict sense: it cannot fail this script, it cannot block the agent, and
 * `scape:diff` remains the source of truth, doing the work itself if the
 * prewarm never finished or was of the wrong commit.
 */

const args = parseArgs(Bun.argv.slice(2))
const ref  = args.str('ref', 'origin/main')

const line = (label: string, body: string): void => console.log(`${label.padEnd(12)}${body}`)

/** Run something quietly, and say only what the reader needs. */
async function run (command: string[], label: string, echo = false): Promise<boolean> {
  const child              = Bun.spawn(command, { stdout: 'pipe', stderr: 'pipe' })
  const [ out, err, code ] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  if (code !== 0)
    line(label, `FAILED · ${err.trim().split('\n')
      .at(-1) ?? `exit ${code}`}`)
  else if (echo)
    // The api digest reports through its own output, and swallowing it would
    // leave the one line that says the map has gone stale unread.
    for (const text of out.trim().split('\n')
      .filter(Boolean))
      line(label, text.replace(/^api digest\s+/, ''))

  return code === 0
}

console.log('\nsetup\n')

const installed = await run([ 'bun', 'install', '--frozen-lockfile' ], 'install')

if (installed)
  line('install', 'ok, from the lockfile')

/**
 * Whether a picture is available at all, said now rather than at stage 5.
 */
let canCapture = false

try {
  const found = findChromium()

  canCapture = Boolean(found)
  line('chromium', found ? `ok · ${found}` : 'NOT FOUND')
}
catch (error) {
  line('chromium', `NOT FOUND · ${error instanceof Error ? error.message.split('\n')[0] : error}`)
}

if (!canCapture) {
  line('', 'scape:shot and scape:diff cannot run. `bunx playwright install chromium`')
  line('', 'fixes it; otherwise pick a theme scape:map can judge and say so in the pr.')
}

// Warn only. Bumping the dependency is a reviewed decision, and regenerating a
// committed file as a side effect of a status check would hide the diff.
await run([ 'bun', 'scripts/api-digest.ts', '--check' ], 'api digest', true)

if (canCapture && !args.has('no-prewarm')) {
  // Detached on purpose: tied to the agent's own turn it would be cancelled by
  // the first thing that interrupts it, which is the opposite of a head start.
  Bun.spawn([ 'bun', 'scripts/scape-diff.ts', '--ref-only', '--ref', ref ], {
    stdout: 'ignore',
    stderr: 'ignore',
    stdin:  'ignore',
  }).unref()

  line('prewarm', `building and photographing ${ref} in the background`)
  line('', 'stage 5 reuses it if the commit still matches, and rebuilds if not')
}

console.log('')

const brief = Bun.spawn([ 'bun', 'scripts/brief.ts' ], { stdout: 'inherit', stderr: 'inherit' })

await brief.exited

// Never fails. A run that cannot take a picture can still do good work, and
// this script exists to tell it that early rather than to stop it.
