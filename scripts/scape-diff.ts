import { existsSync } from 'node:fs'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { serveStatic } from './browser.ts'
import { parseArgs } from './args.ts'
import { optionsFrom, posesFrom, shoot, withBrowser } from './scape-shot.ts'
import type { Pose } from './scape-shot.ts'


export interface Comparison {
  pose:     string
  changed:  number
  maxBlock: number

  /** Where the diff image was written, or `null` if it did not earn one. */
  diff:  string | null
  note?: string
}

interface Measured {
  changed:  number
  maxBlock: number
  image:    PNG
}

/** Side of the square the worst-block figure is measured over, in pixels. */
const BLOCK = 32

/**
 * Compare two captures.
 *
 * Two numbers, because one is not enough. `changed` is the share of the frame
 * that moved, which a small bright feature can never push above a fraction of a
 * percent however wrong it is; `maxBlock` is the worst thirty-two pixel square,
 * which is how a broken jetty in the corner of a wide shot gets noticed at all.
 */
export function compare (before: PNG, after: PNG, tolerance: number): Measured {
  const { width, height } = before
  const diff              = new PNG({ width, height })

  const changed = pixelmatch(before.data, after.data, diff.data, width, height, {
    threshold: tolerance,
    includeAA: false,
    diffColor: [ 255, 0, 128 ],
    alpha:     0.25,
  })

  // The per-block pass reads the diff image the comparison just produced rather
  // than the sources again — every pixel it marked is non-zero in the red
  // channel, so counting is a scan and not a second comparison.
  let maxBlock = 0

  for (let top = 0; top < height; top += BLOCK)
    for (let left = 0; left < width; left += BLOCK) {
      const right  = Math.min(left + BLOCK, width)
      const bottom = Math.min(top + BLOCK, height)
      let hits     = 0

      for (let y = top; y < bottom; y += 1)
        for (let x = left; x < right; x += 1)
          if (diff.data[(y * width + x) * 4] > 0 && diff.data[(y * width + x) * 4 + 1] === 0)
            hits += 1

      maxBlock = Math.max(maxBlock, hits / ((right - left) * (bottom - top)))
    }

  return { changed: 100 * changed / (width * height), maxBlock: 100 * maxBlock, image: diff }
}

async function readPng (path: string): Promise<PNG> {
  return PNG.sync.read(Buffer.from(await Bun.file(path).arrayBuffer()))
}

export function formatTable (rows: readonly Comparison[]): string {
  const lines = [ 'pose         changed   maxblock  verdict' ]

  for (const row of rows)
    lines.push([
      row.pose.padEnd(12),
      `${row.changed.toFixed(2)}%`.padStart(7),
      `${row.maxBlock.toFixed(1)}%`.padStart(9),
      row.note ?? (row.diff ? `  CHANGED   -> ${row.diff}` : '  same'),
    ].join(''))

  return lines.join('\n')
}

/** `scape:map --json` on a checkout, so a drowned island is caught without a picture. */
async function structure (cwd: string): Promise<Record<string, unknown> | null> {
  const run = Bun.spawn([ 'bun', 'scripts/scape-map.ts', '--json' ], { cwd, stdout: 'pipe', stderr: 'ignore' })
  const raw = await new Response(run.stdout).text()

  try {
    return JSON.parse(raw) as Record<string, unknown>
  }
  catch {
    return null
  }
}

function structuralLine (
  before: Record<string, unknown> | null,
  after:  Record<string, unknown> | null,
): string {
  // A ref from before these tools existed has no `scape-map.ts` to run, which
  // is not a failure and should not read like one — it is simply the honest
  // limit of comparing against history that predates the instrument.
  if (!before)
    return 'structural: not compared — the ref has no scape:map, so it predates the tool'

  if (!after)
    return 'structural: not compared — scape:map would not survey this working tree'

  const read = (source: Record<string, unknown>): Record<string, string> => {
    const stats = source as { land: number, creek: unknown, footpaths: { routes: number }, peak: { height: number }, plots: number, isles: { surfacing: number }}

    return {
      land:      `${stats.land}%`,
      creek:     stats.creek ? 'OK' : 'NONE',
      footpaths: String(stats.footpaths.routes),
      peak:      `${stats.peak.height}m`,
      plots:     String(stats.plots),
      isles:     String(stats.isles.surfacing),
    }
  }

  const was  = read(before)
  const now  = read(after)
  const same = Object.keys(was).every(key => was[key] === now[key])

  return `structural: ${Object.keys(was).map(key => `${key} ${was[key]}->${now[key]}`)
    .join('  ')}` +
    `   ${same ? 'no structural change' : 'STRUCTURE MOVED'}`
}

/**
 * A checkout of some other commit, built and ready to serve.
 *
 * A stored baseline image cannot work here: an unattended run starts from a
 * fresh clone with no `.scape/` in it, so the only reference that is reliably
 * available is one git can produce on demand. `node_modules` is symlinked
 * rather than installed — the dependency set is the lockfile's, and the
 * lockfile is what both sides are being compared under anyway.
 */
async function prepareRef (ref: string): Promise<string> {
  const rev = (await new Response(
    Bun.spawn([ 'git', 'rev-parse', ref ], { stdout: 'pipe' }).stdout,
  ).text()).trim()

  const tree = resolve('.scape/ref', rev.slice(0, 12))

  if (!existsSync(join(tree, 'dist', 'index.html'))) {
    await rm(tree, { recursive: true, force: true })
    await mkdir('.scape/ref', { recursive: true })

    const add = Bun.spawn([ 'git', 'worktree', 'add', '--detach', '--force', tree, rev ], { stdout: 'ignore', stderr: 'pipe' })

    if (await add.exited !== 0)
      throw new Error(`git worktree add ${ref} failed · ${await new Response(add.stderr).text()}`)

    await Bun.spawn([ 'ln', '-s', resolve('node_modules'), join(tree, 'node_modules') ]).exited

    const built = Bun.spawn([ 'bun', 'x', 'vite', 'build' ], { cwd: tree, stdout: 'ignore', stderr: 'pipe' })

    if (await built.exited !== 0)
      throw new Error(`building ${ref} failed · ${await new Response(built.stderr).text()}`)
  }

  return tree
}

async function buildHere (): Promise<string> {
  const built = Bun.spawn([ 'bun', 'x', 'vite', 'build' ], { stdout: 'ignore', stderr: 'pipe' })

  if (await built.exited !== 0)
    throw new Error(`build failed · ${await new Response(built.stderr).text()}`)

  return resolve('.')
}

async function capture (
  root:  string,
  port:  number,
  out:   string,
  poses: readonly Pose[],
  args:  ReturnType<typeof parseArgs>,
): Promise<void> {
  await mkdir(out, { recursive: true })

  const server = await serveStatic(port, join(root, 'dist'))

  try {
    await withBrowser(args.has('gpu'), async browser => {
      const [ width, height ] = args.str('size', '800x500').split('x')
        .map(Number)
      const context           = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })

      for (const pose of poses) {
        const page = await context.newPage()

        try {
          await shoot(page, optionsFrom(args, `http://127.0.0.1:${port}/`, pose), join(out, `${pose.name}.png`))
        }
        finally {
          await page.close()
        }
      }

      await context.close()
    })
  }
  finally {
    server.stop()
  }
}

/** One pose, weighed against its reference. */
async function weigh (
  name:      string,
  before:    string,
  after:     string,
  threshold: number,
  tolerance: number,
): Promise<Comparison> {
  const left  = join(before, `${name}.png`)
  const right = join(after, `${name}.png`)

  if (!existsSync(left) || !existsSync(right))
    return { pose: name, changed: 0, maxBlock: 0, diff: null, note: '  MISSING' }

  const [ a, b ] = await Promise.all([ readPng(left), readPng(right) ])

  // A capture that changed shape cannot be compared pixel for pixel, and
  // padding one to fit the other would invent a difference along two edges.
  if (a.width !== b.width || a.height !== b.height)
    return { pose: name, changed: 100, maxBlock: 100, diff: null, note: '  SIZE CHANGED' }

  const target = join('.scape/diff', `${name}.png`)
  const result = compare(a, b, tolerance)
  const moved  = result.changed >= threshold

  // Only the poses that moved get an image written. An unchanged run should
  // cost the reader a table and nothing else.
  if (moved)
    await Bun.write(target, PNG.sync.write(result.image))

  return {
    pose:     name,
    changed:  result.changed,
    maxBlock: result.maxBlock,
    diff:     moved ? target : null,
  }
}

async function main (): Promise<void> {
  const args = parseArgs(Bun.argv.slice(2))

  if (args.has('help')) {
    console.log([
      'scape:diff — what the change did to the picture, in numbers first',
      '',
      '  --ref origin/main     build that ref in a worktree and compare against it',
      '  --poses tour          which poses to compare',
      '  --threshold 0.5       percent of the frame that counts as changed',
      '  --tolerance 0.1       per-pixel colour tolerance, 0..1',
      '  --accept              promote the current shots to .scape/baseline',
      '  --clean               remove the cached reference worktrees',
      '  --size 800x500        viewport',
      '',
      'with no --ref, compares .scape/shots against .scape/baseline',
    ].join('\n'))
    return
  }

  const threshold = args.num('threshold', 0.5)
  const tolerance = args.num('tolerance', 0.1)
  const shots     = '.scape/shots'
  const baseline  = '.scape/baseline'

  // The reference worktrees are kept on purpose — building one is the slowest
  // thing either tool does, and a run that compares against `origin/main` twice
  // in an afternoon should pay for it once. This is how they are given back.
  if (args.has('clean')) {
    await rm('.scape/ref', { recursive: true, force: true })
    await Bun.spawn([ 'git', 'worktree', 'prune' ]).exited
    console.log('reference worktrees removed')
    return
  }

  if (args.has('accept')) {
    await mkdir(baseline, { recursive: true })

    for (const name of await readdir(shots))
      await Bun.write(join(baseline, name), Bun.file(join(shots, name)))

    console.log(`baseline updated from ${shots}`)
    return
  }

  const poses = posesFrom(args)
  const ref   = args.str('ref')
  let before         = baseline
  let structuralNote = ''

  if (ref) {
    const tree = await prepareRef(ref)
    const here = await buildHere()

    before = '.scape/ref-shots'

    await capture(tree, args.num('port', 4186), before, poses, args)
    await capture(here, args.num('port', 4186) + 1, shots, poses, args)

    structuralNote = structuralLine(await structure(tree), await structure(here))
  }

  await mkdir('.scape/diff', { recursive: true })

  const rows = await Promise.all(
    poses.map(pose => weigh(pose.name, before, shots, threshold, tolerance)),
  )

  console.log(formatTable(rows))

  if (structuralNote)
    console.log(structuralNote)

  if (rows.some(row => row.changed >= threshold || row.note))
    process.exitCode = 1
}

if (import.meta.main)
  await main()
