import { createStateAccess } from 'threejs-scene'
import type { StateAccess, StateValue } from 'threejs-scene'
import type { ScapeConfig } from './config.ts'


/**
 * Who owns the config, and how to move a knob through them.
 *
 * The runtime's `createStateAccess` is the whole mechanism — a plain object
 * before the scape mounts, the app's store after `adopt`, and the last committed
 * state handed back on teardown so a rebuild after a context loss opens on what
 * the reader dragged rather than on what shipped. This is that, named for what
 * this app keeps in it.
 */
export type ConfigValue = StateValue

export type ConfigAccess<S extends object = ScapeConfig> = StateAccess<S>

export const createConfigAccess = createStateAccess
