import { existsSync, readdirSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'


/**
 * A chromium this machine already has.
 *
 * `playwright-core` ships no browser on purpose — that is the whole reason it
 * is the dependency rather than `playwright`, which would drag a hundred and
 * fifty megabytes into a repository whose own build is under a megabyte. So the
 * binary is found rather than installed, and the order is deliberate: an
 * explicit path first, then playwright's own cache, then the browser the
 * machine already has for people to use.
 */
export function findChromium (): string {
  const named = process.env.PLAYWRIGHT_CHROMIUM

  if (named && existsSync(named))
    return named

  const mac   = platform() === 'darwin'
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? (mac
    ? join(homedir(), 'Library', 'Caches', 'ms-playwright')
    : join(homedir(), '.cache', 'ms-playwright'))

  if (existsSync(cache)) {
    // Newest revision first — a cache that has been through a few playwright
    // upgrades holds several, and the old ones may not speak the current
    // protocol.
    const revisions = readdirSync(cache)
      .filter(name => name.startsWith('chromium-'))
      .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)))

    for (const revision of revisions) {
      const candidates = mac
        ? [
          join(cache, revision, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
          join(cache, revision, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        ]
        : [ join(cache, revision, 'chrome-linux', 'chrome') ]

      for (const candidate of candidates)
        if (existsSync(candidate))
          return candidate
    }
  }

  const installed = mac
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : '/usr/bin/google-chrome'

  if (existsSync(installed))
    return installed

  throw new Error(
    'no chromium found · set PLAYWRIGHT_CHROMIUM=/path/to/chrome, or run `bunx playwright install chromium`',
  )
}

/**
 * Software rasterisation, on purpose.
 *
 * A real adapter draws the same scene slightly differently from one frame to
 * the next and very differently from one machine to the next, which makes every
 * visual diff a negotiation about how much noise counts as noise. SwiftShader
 * is slower and exactly reproducible, so a diff of zero means zero. `--gpu`
 * trades that back for speed when nobody is going to diff the result.
 */
export const SOFTWARE_FLAGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--disable-lcd-text',
]

export const GPU_FLAGS = [ '--ignore-gpu-blocklist', '--enable-gpu-rasterization' ]

/** Whether something is already answering on a port. */
export async function listening (port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(700) })
    return true
  }
  catch {
    return false
  }
}

export interface Server {
  port: number
  stop(): void
}

/**
 * Serve the scape, and leave alone anything already serving it.
 *
 * A run that starts its own vite on top of the one the developer is already
 * looking at gets a port collision at best and a stale build at worst, so the
 * port is checked before anything is spawned — and a server we did not start is
 * a server we do not stop.
 */
export async function serve (port: number, root?: string): Promise<Server> {
  if (await listening(port))
    return { port, stop: () => undefined }

  const args = root
    ? [ 'x', 'vite', 'preview', '--outDir', root, '--host', '127.0.0.1', '--port', String(port), '--strictPort' ]
    : [ 'x', 'vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort' ]

  const child = Bun.spawn([ 'bun', ...args ], { stdout: 'ignore', stderr: 'ignore' })

  for (let tries = 0; tries < 60; tries += 1) {
    if (await listening(port))
      return { port, stop: () => child.kill() }

    await Bun.sleep(250)
  }

  child.kill()
  throw new Error(`vite never came up on ${port}`)
}

/**
 * Serve a built `dist` and nothing else.
 *
 * `vite preview` would do this too, but it insists on a project rooted where it
 * is run and the reference build lives in a detached worktree. The scape builds
 * with `base: './'` so every asset path inside `dist` is relative — which makes
 * the whole thing serveable by twenty lines that cannot themselves be the
 * reason two captures differ.
 */
export async function serveStatic (port: number, dir: string): Promise<Server> {
  const server = Bun.serve({
    port,
    hostname: '127.0.0.1',

    async fetch (request) {
      const path = new URL(request.url).pathname
      const file = Bun.file(join(dir, path === '/' ? 'index.html' : decodeURIComponent(path)))

      return await file.exists() ? new Response(file) : new Response('not found', { status: 404 })
    },
  })

  return { port, stop: () => void server.stop(true) }
}
