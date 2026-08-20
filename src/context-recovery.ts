import { createStore } from 'threejs-scene'
import type { Store } from 'threejs-scene'
import { SCAPE_CONFIG } from './scene/config.ts'
import type { AtmosphereQuality } from './scene/quality.ts'
import { reduceAtmosphereQuality } from './scene/quality.ts'
import type { TierMemory } from './scene/tier-memory.ts'
import type { Diagnostics } from './ui/diagnostics.ts'


/**
 * What the scape is doing, on the root element.
 *
 * Deliberately *not* `data-scape` — that attribute already marks the canvas,
 * and a document-order `querySelector` for it would find `<html>` first the
 * moment this was written. The screenshot tool waits on `ready` here rather
 * than on a timeout, because a timeout long enough for the slowest tier is a
 * timeout wasted on every other one.
 */
export type ScapeState = 'booting' | 'ready' | 'lost' | 'failed'

/**
 * Everything the page knows about the scape it is trying to keep alive.
 *
 * Serializable on purpose, which is the runtime store's contract — every field
 * here is a string, a number or a flat bag of them, so this whole status can be
 * logged, replayed or diffed. The canvas element and the pending timer handles
 * are deliberately *not* in it: those are resources, not facts, and a resource
 * in a serializable store is a store that cannot be serialized.
 */
export interface ScapeStatus {

  /** The lifecycle word, mirrored onto `data-scape-state` by a subscriber. */
  scape: ScapeState

  /**
   * The tier as detected, walked down by every context this page has lost.
   *
   * This is what the memory, the fallback ladder and the runtime seeding all
   * reason about. It deliberately does not fold in the reader's answer to the
   * effects switch: a device that survived `mobile` with everything turned on
   * would otherwise look like a device that survived `desktop`.
   */
  quality: AtmosphereQuality

  /** How many WebGL contexts this page load has spent. */
  losses: number
}

/**
 * The four things that can happen to a scape.
 *
 * `drawn` is the only one the scene itself raises — a scape that has issued a
 * draw call has drawn, which is the only definition of ready that does not
 * depend on how fast the device is.
 */
export type ScapeAction =
  | { type: 'booting' } |
  { type: 'drawn' } |
  { type: 'failed' } |
  { type: 'lost' }

/**
 * How many contexts one page load is allowed to spend.
 *
 * Not a guess at what the device can take — a guess at what the *browser* will
 * tolerate. Chrome counts context losses per origin and, past some threshold,
 * refuses to create another one at all: `A WebGL context could not be created.
 * Reason: Web page caused context loss and was blocked`. That state is strictly
 * worse than the crash it followed, because the scape then cannot start at any
 * tier, and it outlives the tab. Two is enough to walk one step down the ladder
 * and see whether the step helped; a third is spending the reader's goodwill
 * with their browser on a device that has already answered twice.
 */
export const MAX_LOSSES = 2

/**
 * How long to leave the GPU alone before asking it for another context.
 *
 * A driver that has just reset is in no state to hand out a new context, and
 * asking immediately is how one loss turns into a loop of them.
 */
const RECOVERY_DELAY = 900

/**
 * How long a tier has to survive before it counts as survivable.
 *
 * Long enough to clear the window every loss on record has landed inside — the
 * device log showed one at 0.7s and one at 6.3s — and short enough that the
 * verdict is written before anyone navigates away from a scape that is working.
 */
const GRACE = 9000

/**
 * The whole fallback ladder, as one pure function.
 *
 * Every decision that used to be spread across a `loseContext` closure — has
 * the browser had enough, is there a tier left to give up, is this loss the one
 * that ends the page — is a state transition and nothing else, so it can be
 * argued with in a test that has no GPU, no DOM and no timers.
 */
export function reduce (status: ScapeStatus, action: ScapeAction): ScapeStatus {
  switch (action.type) {
    case 'booting':
      return status.scape === 'booting' ? status : { ...status, scape: 'booting' }
    // A stray frame does not talk a scape that has already died back into
    // being ready, so only a booting scape is allowed to become one.
    case 'drawn':
      return status.scape === 'booting' ? { ...status, scape: 'ready' } : status
    case 'failed':
      return status.scape === 'failed' ? status : { ...status, scape: 'failed' }
    case 'lost': {
      const losses = status.losses + 1
      const next   = reduceAtmosphereQuality(status.quality)

      // The browser is keeping score too, and its penalty is worse than the
      // crash. Chrome blocks an origin from getting *any* further context once a
      // page has lost too many — "Web page caused context loss and was blocked"
      // — and after that the scape cannot even start, on a device where a
      // cheaper tier might have run perfectly. Rebuilding is a budget, so it is
      // spent like one, and running out of budget is the same dead end as
      // running out of ladder.
      if (losses >= MAX_LOSSES || !next)
        return { ...status, scape: 'failed', losses }

      return { scape: 'lost', quality: next, losses }
    }
  }
}

/**
 * The store the whole page reads the scape's condition from.
 *
 * One writer per concern and one vocabulary for all of them: the recovery
 * ladder dispatches `lost`, the scene dispatches `drawn` off its first draw
 * call, and the root element's `data-scape-state` is a *subscriber* rather than
 * a fifth place the state is kept. Nothing reads the attribute back.
 */
export function createScapeStatus (quality: AtmosphereQuality): Store<ScapeStatus, ScapeAction> {
  const status = createStore<ScapeStatus, ScapeAction>({ scape: 'booting', quality, losses: 0 }, reduce)

  document.documentElement.dataset.scapeState = 'booting'

  status.subscribe((next, prev) => {
    if (next.scape !== prev.scape)
      document.documentElement.dataset.scapeState = next.scape
  })

  return status
}

export interface ContextRecoveryOptions {

  /** Where the condition of the scape is kept, and the only writer of it. */
  status: Store<ScapeStatus, ScapeAction>

  /** The canvas the scape opens on. Replaced outright when a context dies. */
  canvas: HTMLCanvasElement

  diagnostics: Diagnostics

  /** What this device has already proven, and where a surviving tier is filed. */
  memory: TierMemory

  /** Build the scape onto this canvas at this budget, or throw saying why. */
  mount (canvas: HTMLCanvasElement, quality: AtmosphereQuality): void

  /** Take down whatever the last `mount` built. */
  unmount (): void

  /** Point the runtime knobs at the tier now in force, before it is built. */
  seed (quality: AtmosphereQuality): void

  /** Write the settings snapshot back, once a fallback has rewritten it. */
  save (): void

  /**
   * Whether a tier that survives is worth writing down.
   *
   * An audit run assembles the scape and never draws it, so it has not survived
   * anything — and a verdict left behind by one would be inherited by the next
   * ordinary load, which is a lie about a scape that was never rendered.
   */
  remember?: boolean
}

export interface ContextRecovery {

  /**
   * The first build of the page.
   *
   * @returns Whether the scape stood up. A failure is reported through the
   * diagnostics log rather than thrown, because on a phone the log *is* the
   * error report, and an uncaught error on top of a message that already
   * explains itself only buries it under a stack trace nobody can read.
   */
  build (): boolean

  /**
   * Build it again, on the same canvas and the same tier.
   *
   * For the handful of decisions that are taken once rather than read per frame
   * — whether there is a post chain, whether shadow maps compile, how many drops
   * the rain's one static buffer holds. Deferred by a tick so the control that
   * asked for it has finished its own event first, and coalesced, because a
   * reader flicking the effects switch back and forth should cost one rebuild.
   *
   * The canvas is *not* renewed: its context is alive and well, and asking for a
   * second one is exactly what the loss recovery is careful not to do lightly.
   */
  rebuild (): void

  /**
   * Come back, but cheaper.
   *
   * The device has just said, in the only way it can, that the budget it was
   * given is more than it has. Rebuilding on the same settings would only ask it
   * the same question again, so every recovery costs a tier — and once there is
   * no tier left to give up, the scape says so instead of thrashing.
   */
  lost (): void

  /** The page is really going away: drop every pending timer and the scape. */
  dispose (): void
}

export function createContextRecovery (options: ContextRecoveryOptions): ContextRecovery {
  const { status, diagnostics, memory, remember = true } = options

  // Resources rather than state, which is why they are here and not in the
  // store: a canvas element and three timer handles mean nothing outside this
  // page load, and the store is the half of this that survives serialization.
  let canvas     = options.canvas
  let recovering = 0
  let rebuilding = 0
  let proving    = 0

  /**
   * One build, one verdict, and nothing thrown past here.
   *
   * Every path into the scape — the first load, a rebuild, a recovery timer —
   * fails the same way and for the same reasons, and throwing out of a timer
   * would only lose the message the reader needs.
   *
   * @returns The failure message, or `null` when the scape stood up.
   */
  function attempt (what: string): string | null {
    const { quality } = status.get()

    try {
      status.dispatch({ type: 'booting' })
      options.mount(canvas, quality)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      diagnostics.fail(`${what} · ${message}`)
      status.dispatch({ type: 'failed' })

      return message
    }

    // A tier that holds this long without dropping the context is a tier the
    // device can simply be handed next time, rather than being walked down to
    // through another crash. Cancelled by `teardown`, so a loss inside the
    // window never gets recorded as a survival.
    if (remember)
      proving = window.setTimeout(() => memory.remember(quality.tier), GRACE)

    return null
  }

  function teardown (): void {
    window.clearTimeout(proving)
    options.unmount()
  }

  /**
   * A fresh canvas for a fresh context.
   *
   * A canvas hands out exactly one WebGL context for its whole life, so a canvas
   * whose context died is a canvas that can only ever be handed the corpse back
   * — and whether the browser bothers to restore it at all is a per-platform
   * accident. Replacing the element sidesteps the question: the new one has
   * never had a context, so it gets a clean one on request.
   */
  function renewCanvas (): void {
    // Deep, so the no-webgl fallback text inside it survives the swap.
    const replacement = canvas.cloneNode(true) as HTMLCanvasElement

    canvas.replaceWith(replacement)
    canvas = replacement
  }

  function build (): boolean {
    const failure = attempt('could not build the scape')

    if (failure === null)
      return true

    // three throws a flat "Error creating WebGL context" whatever the reason,
    // and the reason is the only part worth reading — it arrives separately,
    // through `webglcontextcreationerror`, one line earlier in the log. When the
    // browser has blocklisted the origin after too many losses, "context
    // creation failed" reads as a broken page and sends the reader to reload,
    // which is the one thing that cannot help. So say what actually clears it.
    if ((/creating webgl context|context could not be created/iu).test(failure))
      diagnostics.fail('if that says the page was blocked, this origin has lost too many contexts · fully close the browser and reopen, or use a private tab')

    return false
  }

  function rebuild (): void {
    window.clearTimeout(rebuilding)
    rebuilding = window.setTimeout(() => {
      teardown()
      attempt('rebuild failed')
    }, 0)
  }

  function lost (): void {
    status.dispatch({ type: 'lost' })
    teardown()

    const { scape, quality, losses } = status.get()

    // The ladder has already decided; this only says which wall was hit, and
    // `MAX_LOSSES` is the one the reader can actually do something about.
    if (scape === 'failed') {
      diagnostics.fail(losses >= MAX_LOSSES
        ? `${losses} contexts lost · stopping before the browser blocks this page · reload to try again`
        : 'no tier left to fall back to · reload to rebuild the scape')

      return
    }

    // Written now, not once the rebuild survives: whatever the reader does next
    // — reload, background the tab, give up and come back tomorrow — should
    // start from what we just learned rather than repeat the crash to learn it
    // again.
    memory.remember(quality.tier)
    diagnostics.say(`falling back to the ${quality.tier} tier in ${RECOVERY_DELAY}ms`)

    // Including whatever the reader had dragged the performance knobs to, and
    // their answer to the effects switch. A device that has just given up its
    // context does not get to keep the budget it gave it up on — and unlocking
    // every effect is the most expensive answer there is to give.
    if (SCAPE_CONFIG.runtime.effects !== 'tier') {
      SCAPE_CONFIG.runtime.effects = 'tier'
      options.save()
      diagnostics.say('effects put back to the tier default · the device has just refused the unlocked budget')
    }

    options.seed(quality)

    window.clearTimeout(recovering)
    recovering = window.setTimeout(() => {
      renewCanvas()
      attempt('rebuild failed')
    }, RECOVERY_DELAY)
  }

  function dispose (): void {
    window.clearTimeout(recovering)
    window.clearTimeout(rebuilding)
    teardown()
  }

  return { build, rebuild, lost, dispose }
}
