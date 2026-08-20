/**
 * `writePath`, without mutating what it writes into.
 *
 * The runtime's store commits a *new* object on every write, so a module still
 * holding the object from before the write goes on reading the values from
 * before the write. Replacing only the spine of the path is what keeps that
 * cheap: setting `look.bloom` on a config of twenty sections copies two objects
 * and keeps the other eighteen by reference, so the frame after a slider moves
 * allocates almost nothing.
 *
 * Semantics are `writePath`'s, deliberately, because the same dotted strings
 * arrive here from a slider, a url, a stored snapshot and a capture flag: every
 * write is silent. A path whose parent does not resolve writes nothing rather
 * than inventing the shape it would need, because a stale key in a saved
 * preference set must not take the scape down on boot.
 *
 * An upstream candidate — it belongs beside `readPath`/`writePath` in the
 * runtime's `lib/state`, and it is app-local only because a run that consumes
 * the published package cannot also publish to it.
 */
export function withPath<S extends object> (state: S, path: string, value: unknown): S {
  const keys = path.split('.')

  if (keys.some(key => key === ''))
    return state

  return spine(state, keys, value) as S ?? state
}

/**
 * Copy `node` along `keys`, and nothing else.
 *
 * @returns The replacement, `node` itself when the write changed nothing, or
 * `undefined` when the path ran into something that is not an object — which is
 * the dead path `writePath` would silently skip.
 */
function spine (node: unknown, keys: readonly string[], value: unknown): unknown {
  if (typeof node !== 'object' || node === null)
    return undefined

  const record           = node as Record<string, unknown>
  const [ key, ...rest ] = keys

  // Writing the value it already holds is not a change, and the store fires its
  // listeners on identity — so handing back the same object is what stops a
  // slider dragged across a value it is already on from rebuilding anything.
  if (rest.length === 0)
    return record[key] === value ? node : { ...record, [key]: value }

  const next = spine(record[key], rest, value)

  if (next === undefined)
    return undefined

  return next === record[key] ? node : { ...record, [key]: next }
}
