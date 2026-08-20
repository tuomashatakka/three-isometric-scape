import type { Store } from 'threejs-scene'
import type { ScapeConfig } from './config.ts'
import { withPath } from './state-path.ts'


/** What a knob can hold: the three types a control, a url or a snapshot writes. */
export type ConfigValue = number | string | boolean

/**
 * Who owns the config, and how to move a knob through them.
 *
 * The owner changes exactly once per mount. Before the scape is built there is
 * nobody to tell, so a write is just the next version of a plain object; once
 * `createApp` has taken the config into its store, the store is the single
 * writer and every module in the scene is reading whatever it last committed.
 * Both halves are behind this, so the overlay, the settings snapshot and the
 * url all move a knob the same way and none of them has to know which half of
 * the page's life they are in.
 *
 * This exists because the store commits a *new* object on every write. Without
 * one place that knows which object is current, a rebuild after a context loss
 * would hand the scape the values that shipped rather than the ones the reader
 * had dragged — the settings snapshot would read them back off an object three
 * writes out of date, and neither failure would show up in a capture, because
 * no capture drives the overlay.
 */
export interface ConfigAccess<S extends object = ScapeConfig> {

  /** The config as of now. The same reader every scene module already takes. */
  read (): S

  /** Move one knob, through whoever currently owns the config. */
  write (path: string, value: ConfigValue): void

  /**
   * The scape has mounted, and its store owns the config from here.
   *
   * @returns A function that takes ownership back — call it on teardown, so the
   * gap between one mount and the next still has somewhere to keep a write.
   */
  adopt (store: Store<S>): () => void
}

export function createConfigAccess<S extends object> (authored: S): ConfigAccess<S> {
  let owner: Store<S> | null = null
  let loose                  = authored

  return {
    read: () => owner?.get() ?? loose,

    write (path, value) {
      if (!owner) {
        loose = withPath(loose, path, value)
        return
      }

      const next = withPath(owner.get(), path, value)

      // `withPath` hands back the same object when the knob was already there,
      // and `set` would spread it into a new one regardless — which would wake
      // every subscriber to report that nothing happened.
      if (next !== owner.get())
        owner.set(next)
    },

    adopt (store) {
      owner = store

      return () => {
        // Whatever the reader moved while the scape was up is what the next
        // mount has to start from, so the last committed state comes back out
        // with the ownership.
        loose = store.get()
        owner = null
      }
    },
  }
}
