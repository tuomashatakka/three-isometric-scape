import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import type { Browser, ConsoleMessage, Page } from 'playwright-core'
import { GPU_FLAGS, SOFTWARE_FLAGS, findChromium, serve } from './browser.ts'
import { parseArgs } from './args.ts'
import type { Args } from './args.ts'


/** One camera and clock the scape gets photographed from. */
export interface Pose {
  name:    string
  rot?:    number
  zoom?:   number
  time?:   number
  season?: number
  set?:    string[]
}

/**
 * The six frames stage 5 of the brief asks for.
 *
 * "Both zoom extremes and across the day/night cycle" is not a suggestion —
 * most of this scape's historical bugs were angle- or time-dependent and
 * invisible from the default pose, which is exactly why the brief says it. One
 * command, one browser launch, six answers.
 */
export const TOURS: Record<string, Pose[]> = {
  tour: [
    { name: 'default' },
    { name: 'near', zoom: 10 },
    { name: 'far', zoom: 540 },
    { name: 'noon', time: 0.5 },
    // A night pose now has to name a week as well as an hour. The sun runs a
    // seasonal arc, and at this latitude the default midsummer year has no
    // night in it at all — an unqualified 'night' captured a white one. Late
    // autumn puts the sun twenty-six degrees under at the same hour.
    { name: 'night', time: 0.02, season: 0.78 },
    { name: 'winter', season: 0.02 },
  ],

  // The cheap pass: is there a scape at all, and does it survive being drawn.
  quick: [{ name: 'default' }],
}

/**
 * A capture the diff can rely on.
 *
 * Every clock in the scape is stopped rather than merely slowed, because a
 * "slow" clock still advances by however long the page took to get to `ready`,
 * which is the one number that is different on every run. Grain is stopped for
 * the same reason and wind for a subtler one: the foliage sway is driven from
 * elapsed time, so a tree is only in the same place twice if no time passed.
 */
const STILL = [
  'daylight.speed=0',
  'season.speed=0',
  'wind.strength=0',
  'look.grain=0',
  'atmosphere.cloudSpeed=0',
  'atmosphere.auroraSpeed=0',
  'water.waveHeight=0',
  'boats.speed=0',

  // Both of the weather's rates. `speed` holds the front where `weather.time`
  // put it; `fall` stops the drops themselves, which are the only thing in the
  // scape that moves fast enough to be somewhere else between two frames.
  'weather.speed=0',
  'weather.fall=0',
]

export interface ShotOptions {
  base:  string
  pose:  Pose
  tier:  string
  skip?: string
  ratio: number
  aa?:   string
  post?: string
  still: boolean

  /**
   * Fake the browser's clock as well as stopping the scape's own.
   *
   * Off by default, and that is a finding rather than a preference: freezing
   * `requestAnimationFrame` also freezes the compositor, and playwright's
   * screenshot waits for a frame that then never arrives. With every speed in
   * the config already at zero there is almost nothing left for a real clock to
   * move, so the fake one buys very little and costs a pump loop to keep the
   * shutter unblocked. Kept for the cases where it earns that.
   */
  clock: boolean

  /** Leave the overlay, card and frame counter in the picture. */
  chrome: boolean
  extra:  string[]

  /**
   * Frames the scape must have drawn before the shutter opens.
   *
   * Not milliseconds. Under software rasterisation this scape runs anywhere
   * between a fifth of a frame and five frames a second depending on tier and
   * how warm the shader cache is, so a fixed wait captures a different stage of
   * the same fade-in every time — measured, on this machine, as 72 draw calls
   * on one run and 108 on the next. A frame count is the same everywhere.
   */
  frames: number
}

/** Build the url that puts the scape in one pose. */
export function shotUrl (options: ShotOptions): string {
  const { pose } = options
  const sets     = [
    ...options.still ? STILL : [],
    ...pose.rot === undefined ? [] : [ `camera.rotation=${pose.rot}` ],
    ...pose.zoom === undefined ? [] : [ `camera.viewSize=${pose.zoom}` ],
    ...pose.time === undefined ? [] : [ `daylight.time=${pose.time}` ],
    ...pose.season === undefined ? [] : [ `season.time=${pose.season}` ],
    ...pose.set ?? [],
    ...options.extra,
  ]

  const params = new URLSearchParams()

  // Pinned rather than detected. `readQualitySignals` answers from cores,
  // pointer and viewport, so the same command would pick a different tier on a
  // laptop than on a build box — and two captures at two tiers are not a diff,
  // they are two different scapes.
  params.set('tier', options.tier)
  params.set('ratio', String(options.ratio))

  // Storage is per origin rather than per page load, so a tour of six poses
  // through one browser context would have each pose open on wherever the pose
  // before it came to rest. Pinned for the same reason the tier is.
  if (options.still)
    params.set('camera', 'fresh')

  if (options.skip)
    params.set('skip', options.skip)

  if (options.aa !== undefined)
    params.set('aa', options.aa)

  if (options.post !== undefined)
    params.set('post', options.post)

  if (sets.length)
    params.set('set', sets.join(','))

  return `${options.base}?${params.toString()}`
}

export interface ShotResult {
  pose:      string
  state:     string
  fps:       number
  calls:     number
  triangles: number
  drawn:     number
  errors:    string[]
  ms:        number
  path:      string
}

/** How long a capture is allowed to spend getting to its first draw. */
const READY_BUDGET = 40_000

/**
 * Photograph one pose.
 *
 * The clock is faked before the page is opened, so the whole load happens on a
 * timeline this script controls: `runFor` is what advances `requestAnimationFrame`,
 * which means the scape draws exactly the number of frames it is given and not
 * one that depends on how busy the machine was.
 */
export async function shoot (page: Page, options: ShotOptions, out: string): Promise<ShotResult> {
  const errors: string[] = []
  const started          = Date.now()

  const onConsole = (message: ConsoleMessage): void => {
    // The page asks for a favicon it does not have and the browser logs the
    // 404 as an error. It is not one, and counting it would put every capture
    // ever taken into the broken column.
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text())
  }

  page.on('console', onConsole)
  page.on('pageerror', error => errors.push(error.message))

  // The overlay, the card and the frame counter are not the scape, and the
  // counter in particular prints a different number every single run — leaving
  // it in frame would mean every diff of every pose reported a change in the
  // bottom-left corner and nowhere else.
  if (!options.chrome)
    await page.addInitScript(() => {
      const hide = document.createElement('style')

      hide.textContent = '.gfx, .fps, #scape-card, .card-toggle { display: none !important }'
      document.addEventListener('DOMContentLoaded', () => document.head.append(hide))
    })

  if (options.clock)
    await page.clock.install({ time: 0 })

  await page.goto(shotUrl(options), { waitUntil: 'commit' })

  const readState = (): Promise<string> =>
    page.evaluate(() => document.documentElement.dataset.scapeState ?? 'booting')

  let state = 'booting'

  while (state === 'booting' && Date.now() - started < READY_BUDGET) {
    if (options.clock)
      await page.clock.runFor(120)
    else
      await page.waitForTimeout(120)

    state = await readState()
  }

  // Settle. The cloud deck fades in with the zoom, the mist drifts up, and the
  // temporal passes resolve over several frames — so the first drawn frame is
  // never the frame worth keeping, and "drawn enough" is counted rather than
  // waited out.
  const drawn = (): Promise<number> =>
    page.evaluate(() => Number(document.documentElement.dataset.scapeDrawn ?? 0))

  while (state === 'ready' && await drawn() < options.frames && Date.now() - started < READY_BUDGET)
    if (options.clock)
      await page.clock.runFor(250)
    else
      await page.waitForTimeout(250)

  const vitals = await page.evaluate(() => {
    const root = document.documentElement.dataset

    return {
      state:     root.scapeState ?? 'booting',
      fps:       Number(root.scapeFps ?? 0),
      calls:     Number(root.scapeCalls ?? 0),
      triangles: Number(root.scapeTris ?? 0),
      drawn:     Number(root.scapeDrawn ?? 0),
    }
  })

  // Under a faked clock nothing presents unless something advances it, and the
  // shutter is waiting on exactly that — so the clock is pumped alongside the
  // capture rather than before it.
  const shutter = page.screenshot({ path: out, animations: 'disabled' })

  if (options.clock)
    for (let tick = 0; tick < 24; tick += 1)
      await page.clock.runFor(32).catch(() => undefined)

  await shutter
  page.off('console', onConsole)

  return { ...vitals, pose: options.pose.name, errors, ms: Date.now() - started, path: out }
}

/** One line per pose, and enough of one that most runs never open the image. */
export function formatResult (result: ShotResult): string {
  const millions = (result.triangles / 1e6).toFixed(2)
  const verdict  = result.state === 'ready' && !result.errors.length ? 'ok  ' : result.state.toUpperCase()

  return [
    result.pose.padEnd(11),
    verdict.padEnd(8),
    `${(result.ms / 1000).toFixed(1)}s`.padStart(6),
    `fps ${result.fps.toFixed(1).padStart(5)}`,
    `draws ${String(result.calls).padStart(4)}`,
    `tris ${millions}M`,
    `f ${String(result.drawn).padStart(3)}`,
    `err ${result.errors.length}`,
    `-> ${result.path}`,
  ].join('  ')
}

export function posesFrom (args: Args): Pose[] {
  const named = args.str('poses')

  if (named)
    return TOURS[named] ?? named.split(',').map(name => TOURS.tour.find(pose => pose.name === name) ?? { name })

  return [{
    name:   args.str('name', 'shot'),
    rot:    args.has('rot') ? args.num('rot', 45) : undefined,
    zoom:   args.has('zoom') ? args.num('zoom', 70) : undefined,
    time:   args.has('time') ? args.num('time', 0.42) : undefined,
    season: args.has('season') ? args.num('season', 0.5) : undefined,
  }]
}

export function optionsFrom (args: Args, base: string, pose: Pose): ShotOptions {
  return {
    base,
    pose,
    tier:   args.str('tier', 'mobile'),
    skip:   args.str('skip'),
    ratio:  args.num('ratio', 1),
    aa:     args.str('aa'),
    post:   args.str('post'),
    still:  !args.has('no-still'),
    clock:  args.has('clock'),
    chrome: args.has('chrome'),
    extra:  args.list('set'),
    frames: args.num('frames', 40),
  }
}

export async function withBrowser<T> (gpu: boolean, run: (browser: Browser) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args:           gpu ? GPU_FLAGS : SOFTWARE_FLAGS,
  })

  try {
    return await run(browser)
  }
  finally {
    await browser.close()
  }
}

async function main (): Promise<void> {
  const args = parseArgs(Bun.argv.slice(2))

  if (args.has('help')) {
    console.log([
      'scape:shot — the scape, from a pose, without anybody watching',
      '',
      '  --poses tour          named set: tour (6 frames) | quick (1)',
      '  --rot 45 --zoom 70    camera yaw, and view size (tilt is derived from zoom)',
      '  --time 0.42           the day, 0..1',
      '  --season 0.5          the year, 0..1',
      '  --tier mobile         pinned, not detected — a detected tier is undiffable',
      '  --skip post,mist      drop scene families',
      '  --set look.bloom=0    raw dotted-path override, repeatable',
      '  --size 800x500        viewport',
      '  --frames 40           frames the scape must draw before the shutter opens',
      '  --gpu                 real adapter instead of swiftshader (fast, noisy)',
      '  --no-still            let the scape clocks run (never diff the result)',
      '  --clock               fake the browser clock too — slower, rarely needed',
      '  --chrome              leave the overlay and frame counter in the picture',
      '  --dist dist           serve a built directory instead of starting a dev server',
      '  --port 4174           leaves an existing server on that port alone',
      '  --out .scape/shots    directory',
    ].join('\n'))
    return
  }

  const out               = args.str('out', '.scape/shots')
  const port              = args.num('port', 4174)
  const poses             = posesFrom(args)
  const [ width, height ] = args.str('size', '800x500').split('x')
    .map(Number)

  await mkdir(out, { recursive: true })

  const server                = await serve(port, args.str('dist'))
  const results: ShotResult[] = []

  try {
    await withBrowser(args.has('gpu'), async browser => {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })

      for (const pose of poses) {
        const page = await context.newPage()

        try {
          const options = optionsFrom(args, `http://127.0.0.1:${port}/`, pose)
          const result  = await shoot(page, options, `${out}/${pose.name}.png`)

          results.push(result)
          console.log(formatResult(result))
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

  const broken = results.filter(result => result.state !== 'ready' || result.errors.length)

  for (const result of broken)
    for (const line of result.errors.slice(0, 3))
      console.log(`  ${result.pose}: ${line}`)

  if (broken.length)
    process.exitCode = 1
}

if (import.meta.main)
  await main()
