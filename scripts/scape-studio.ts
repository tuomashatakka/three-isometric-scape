import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { parseArgs } from './args.ts'
import { GPU_FLAGS, SOFTWARE_FLAGS, findChromium, listening, serve } from './browser.ts'
import { TOURS } from './scape-poses.ts'
import type { Pose } from './scape-poses.ts'
import { posesFrom, shotUrl } from './scape-shot.ts'


/**
 * One browser, one page, kept warm between looks.
 *
 * `scape:shot` pays for a chromium launch, a bundle load, a scene build and a
 * shader link on every pose — about ninety seconds under swiftshader — and a
 * run that wants to look ten times spends a quarter of an hour waiting. The
 * studio pays that once. It serves the scape through vite's dev server, so the
 * page reloads itself whenever a source file changes, and it drives the page
 * through the `?bridge` remote (`src/bridge.ts`): a camera move, an hour, a
 * season or any per-frame knob is a write and a few frames, not a reload.
 *
 *   bun run studio serve                       # the daemon; run it in the background
 *   bun run studio shot --poses tour           # photograph a named set
 *   bun run studio shot --zoom 10 --set wind.strength=0.6 --name yard
 *   bun run studio census                      # where the triangles and draws go
 *   bun run studio shot --hide mist,haar       # the same look without those meshes
 *   bun run studio probe 0.5 0.2               # which meshes are under that point
 *   bun run studio eval "scape.census(200)"     # any expression, the bridge in scope
 *   bun run studio stop
 *
 * Captures land in `.scape/studio/`. Build-time knobs (`--set archipelago.*`
 * and the like) need `--rebuild`, which rebuilds the scene in place without
 * reloading the bundle. `--tier` reopens the page at that tier.
 */

const PORT      = Number(process.env.SCAPE_STUDIO_PORT ?? 4199)
const VITE_PORT = 4175
const OUT       = '.scape/studio'

/** How long a look may wait for the page, in milliseconds. */
const BUDGET = 180_000

interface ShotRequest {
  name:    string
  writes:  [string, string][]
  frames:  number
  rebuild: boolean
  tier?:   string
  census?: boolean
  hide?:   string[]
}

function valueOf (raw: string): number | boolean | string {
  if (raw === 'true' || raw === 'false')
    return raw === 'true'

  const number = Number(raw)

  return raw.trim() !== '' && Number.isFinite(number) ? number : raw
}

/** The writes a pose stands for, in the order `shotUrl` applies them. */
export function poseWrites (pose: Pose, extra: readonly string[] = []): [string, string][] {
  const sets = [
    ...pose.rot === undefined ? [] : [ `camera.rotation=${pose.rot}` ],
    ...pose.zoom === undefined ? [] : [ `camera.viewSize=${pose.zoom}` ],
    ...pose.time === undefined ? [] : [ `daylight.time=${pose.time}` ],
    ...pose.season === undefined ? [] : [ `season.time=${pose.season}` ],
    ...pose.set ?? [],
    ...extra,
  ]

  return sets.map(entry => {
    const at = entry.indexOf('=')

    return [ entry.slice(0, at), entry.slice(at + 1) ]
  })
}

// ---- the daemon ------------------------------------------------------------

async function serveStudio (gpu: boolean): Promise<void> {
  const vite             = await serve(VITE_PORT)
  const browser          = await chromium.launch({ executablePath: findChromium(), args: gpu ? GPU_FLAGS : SOFTWARE_FLAGS })
  const context          = await browser.newContext({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 1 })
  const page             = await context.newPage()
  const errors: string[] = []
  let tier      = 'mobile'

  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text())
  })
  await page.addInitScript(() => {
    const hide = document.createElement('style')

    hide.textContent = '.gfx, .fps, #scape-card, .card-toggle { display: none !important }'
    document.addEventListener('DOMContentLoaded', () => document.head.append(hide))
  })

  async function open (): Promise<void> {
    const url = shotUrl({
      base:   `http://127.0.0.1:${VITE_PORT}/`,
      pose:   { name: 'studio' },
      tier,
      ratio:  1,
      still:  true,
      clock:  false,
      chrome: false,
      extra:  [],
      frames: 0,
    })

    await page.goto(`${url}&bridge`, { waitUntil: 'commit' })
  }

  async function ready (frames: number): Promise<void> {
    const started = Date.now()

    await page.waitForFunction(() => document.documentElement.dataset.scapeState === 'ready' && 'scape' in window,
                               undefined, { timeout: BUDGET })

    const from = await page.evaluate(() => Number(document.documentElement.dataset.scapeDrawn ?? 0))

    while (Date.now() - started < BUDGET) {
      const drawn = await page.evaluate(() => Number(document.documentElement.dataset.scapeDrawn ?? 0))

      // A drawn count that went *down* is a reload — vite saw an edit — so the
      // frames are counted again from the new mount.
      if (drawn >= from + frames || drawn < from && drawn >= frames)
        return
      await Bun.sleep(150)
    }
  }

  async function shot (request: ShotRequest): Promise<object> {
    const started = Date.now()

    errors.length = 0
    if (request.tier && request.tier !== tier) {
      tier = request.tier
      await open()
    }

    await ready(0)
    await page.evaluate(({ writes, hide }) => {
      const bridge = (window as unknown as { scape: { reset(): void, write(path: string, value: unknown): void, hide(names: string[]): number }}).scape

      bridge.reset()
      for (const [ path, value ] of writes)
        bridge.write(path, value)
      bridge.hide(hide)
    }, { writes: request.writes.map(([ path, raw ]) => [ path, valueOf(raw) ] as const), hide: request.hide ?? []})

    if (request.rebuild) {
      await page.evaluate(() => (window as unknown as { scape: { rebuild(): void }}).scape.rebuild())
      await page.waitForFunction(() => document.documentElement.dataset.scapeDrawn === '0' ||
        document.documentElement.dataset.scapeState !== 'ready', undefined, { timeout: 5_000 }).catch(() => undefined)
    }

    await ready(request.frames)

    const path = `${OUT}/${request.name}.png`

    await page.screenshot({ path, animations: 'disabled' })

    const measured = await page.evaluate(withCensus => {
      const bridge = (window as unknown as { scape: { info(): object, census(limit: number): object[] }}).scape

      return { info: bridge.info(), census: withCensus ? bridge.census(12) : undefined }
    }, request.census ?? false)

    return { path, ms: Date.now() - started, tier, errors: [ ...errors ], ...measured }
  }

  await mkdir(OUT, { recursive: true })
  await open()

  // One look at a time: the page is a single camera.
  let queue: Promise<unknown> = Promise.resolve()

  const server = Bun.serve({
    port:        PORT,
    hostname:    '127.0.0.1',
    idleTimeout: 0,

    async fetch (request) {
      const { pathname } = new URL(request.url)

      if (pathname === '/status')
        return Response.json({ ok: true, tier, url: page.url() })

      if (pathname === '/stop') {
        setTimeout(() => void browser.close().finally(() => {
          vite.stop()
          server.stop()
          process.exit(0)
        }), 50)
        return Response.json({ ok: true })
      }

      if (pathname === '/census') {
        const run = queue.then(async () => {
          await ready(1)
          return page.evaluate(() => {
            const bridge = (window as unknown as { scape: { info(): object, census(limit: number): object[] }}).scape

            return { info: bridge.info(), census: bridge.census(40) }
          })
        })

        queue = run.catch(() => undefined)
        return Response.json(await run)
      }

      if (pathname === '/eval' && request.method === 'POST') {
        const { source } = await request.json() as { source: string }
        const run        = queue.then(() => page.evaluate(source))

        queue = run.catch(() => undefined)
        try {
          return Response.json({ value: await run })
        }
        catch (error) {
          return Response.json({ error: String(error) })
        }
      }

      if (pathname === '/probe' && request.method === 'POST') {
        const { x, y } = await request.json() as { x: number, y: number }
        const run      = queue.then(() => page.evaluate(([ px, py ]) =>
          (window as unknown as { scape: { probe(x: number, y: number): string[] }}).scape.probe(px, py), [ x, y ] as const))

        queue = run.catch(() => undefined)
        return Response.json(await run)
      }

      if (pathname === '/shot' && request.method === 'POST') {
        const body = await request.json() as ShotRequest
        // A page vite reloaded mid-look loses its context; one retry lands on
        // the new mount.
        const run  = queue.then(() => shot(body).catch(async (error: unknown) => {
          if (!String(error).includes('context was destroyed'))
            throw error
          return shot(body)
        }))

        queue = run.catch(() => undefined)
        try {
          return Response.json(await run)
        }
        catch (error) {
          return Response.json({ error: String(error), errors }, { status: 500 })
        }
      }

      return new Response('studio: /status /shot /census /stop', { status: 404 })
    },
  })

  await ready(1).catch(() => undefined)
  console.log(`studio ready on :${PORT} (vite :${VITE_PORT}, ${gpu ? 'gpu' : 'swiftshader'})`)
}

// ---- the client ------------------------------------------------------------

async function call (path: string, body?: object): Promise<unknown> {
  if (!await listening(PORT)) {
    console.error(`no studio on :${PORT}. start one in the background first: bun run studio serve`)
    process.exit(2)
  }

  const response = await fetch(`http://127.0.0.1:${PORT}${path}`, body
    ? { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' }}
    : undefined)

  return response.json()
}

type ResultType = { info: Record<string, number>, census: Record<string, unknown>[] }

function formatCensus (result: ResultType): string {
  const { info } = result
  const lines    = [ `draws ${info.calls}  tris ${(info.triangles / 1e6).toFixed(2)}M  programs ${info.programs}  geometries ${info.geometries}  textures ${info.textures}` ]

  for (const row of result.census)
    lines.push(`  ${String(row.name).padEnd(28)} ${String(row.kind).padEnd(14)} draws ${String(row.draws).padStart(3)}  ` +
      `inst ${String(row.instances).padStart(6)}  tris ${(Number(row.triangles) / 1e3).toFixed(0).padStart(6)}k`)

  return lines.join('\n')
}

type Shot = { path?: string, ms?: number, info?: Record<string, number>, errors?: string[], error?: string, census?: Record<string, unknown>[] }

function formatShot (name: string, result: Shot): string {
  const info  = result.info ?? {}
  const lines = [
    `${name.padEnd(12)} ${((result.ms ?? 0) / 1000).toFixed(1).padStart(5)}s  draws ${info.calls}  ` +
    `tris ${((info.triangles ?? 0) / 1e6).toFixed(2)}M  err ${result.errors?.length ?? 0}  -> ${result.path}`,
    ...(result.errors ?? []).slice(0, 3).map(line => `  ${line}`),
  ]

  if (result.census)
    lines.push(formatCensus({ info, census: result.census }))

  return lines.join('\n')
}

async function shotCommand (args: ReturnType<typeof parseArgs>): Promise<void> {
  const named = args.str('poses')
  const poses = named && TOURS[named] ? TOURS[named] : posesFrom(args)

  for (const pose of poses) {
    const result = await call('/shot', {
      name:    pose.name,
      writes:  poseWrites(pose, args.list('set')),
      frames:  args.num('frames', 4),
      rebuild: args.has('rebuild'),
      tier:    args.has('tier') ? args.str('tier') : pose.tier,
      census:  args.has('census'),
      hide:    args.list('hide').flatMap(entry => entry.split(',')),
    }) as Shot

    if (result.error) {
      console.log(`${pose.name.padEnd(12)} FAIL  ${result.error}`)
      process.exitCode = 1
      continue
    }

    console.log(formatShot(pose.name, result))
  }
}

async function main (): Promise<void> {
  const [ command = 'status', ...rest ] = Bun.argv.slice(2)
  const args                            = parseArgs(rest)

  if (command === 'serve')
    return serveStudio(args.has('gpu'))

  if (command === 'stop' || command === 'status')
    return void console.log(JSON.stringify(await call(`/${command}`)))

  if (command === 'census')
    return void console.log(formatCensus(await call('/census') as Parameters<typeof formatCensus>[0]))

  if (command === 'shot')
    return shotCommand(args)

  // Anything else: an expression run in the page, with `scape` (the bridge) in
  // scope. `eval "scape.census(200).filter(row => row.triangles === 0)"`.
  if (command === 'eval')
    return void console.log(JSON.stringify(await call('/eval', { source: rest.join(' ') }), null, 1))

  // What is drawn under a point of the last look: `probe 0.5 0.2` is the middle
  // of the frame, a fifth of the way down. Names, nearest first.
  if (command === 'probe') {
    const [ x = '0.5', y = '0.5' ] = rest.filter(entry => !entry.startsWith('--'))

    return void console.log((await call('/probe', { x: Number(x), y: Number(y) }) as string[]).join('  ') || '(sky)')
  }

  console.log('studio: serve [--gpu] | shot [--poses set | --rot --zoom --time --season] [--set a.b=1] [--hide name,name] [--rebuild] [--census] | probe x y | eval <js> | census | status | stop')
}

if (import.meta.main)
  await main()
