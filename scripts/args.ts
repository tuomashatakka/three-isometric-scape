import { writePath } from 'threejs-scene'


/**
 * A parsed command line.
 *
 * Deliberately tiny and shared by all three tools rather than pulled from a
 * package: the whole surface is `--flag`, `--key value` and a repeatable
 * `--set`, and every one of these scripts is a debugging instrument that has to
 * keep working when the dependency tree is exactly what is under suspicion.
 */
export interface Args {
  has(name: string): boolean
  str(name: string, fallback: string): string
  str(name: string): string | undefined
  num(name: string, fallback: number): number
  list(name: string): string[]

  /** Everything that was not a `--flag` or a flag's value. */
  rest: string[]
}

export function parseArgs (argv: readonly string[]): Args {
  const flags          = new Map<string, string[]>()
  const rest: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]

    if (!token.startsWith('--')) {
      rest.push(token)
      continue
    }

    // `--key=value` and `--key value` are the same thing. The second form is
    // what a person types and the first is what survives being pasted into a
    // shell script, so both have to work.
    const equals = token.indexOf('=')
    const name   = equals === -1 ? token.slice(2) : token.slice(2, equals)
    const next   = argv[index + 1]
    let value    = equals === -1 ? undefined : token.slice(equals + 1)

    if (value === undefined && next !== undefined && !next.startsWith('--')) {
      value = next
      index += 1
    }

    const held = flags.get(name) ?? []

    held.push(value ?? '')
    flags.set(name, held)
  }

  function str (name: string, fallback?: string): string | undefined {
    const held = flags.get(name)
    return held?.length ? held[held.length - 1] : fallback
  }

  return {
    rest,
    str:  str as Args['str'],
    has:  name => flags.has(name),
    list: name => flags.get(name) ?? [],

    num (name, fallback) {
      const value = Number(str(name))
      return Number.isFinite(value) ? value : fallback
    },
  }
}

/**
 * `1` is a number, `true` is a boolean, `nordic` is a string.
 *
 * The config holds all three, and a dotted-path override that turned every
 * value into a string would quietly write `'0'` — which is truthy — over the
 * strength knob it was asked to switch off.
 */
export function coerce (raw: string): unknown {
  if (raw === 'true')
    return true

  if (raw === 'false')
    return false

  const value = Number(raw)

  return raw !== '' && Number.isFinite(value) ? value : raw
}

/**
 * Apply `--set a.b=1 --set c.d=2` to a config, in order.
 *
 * Reuses `writePath` from the graphics overlay, so a knob is addressed here by
 * exactly the string the panel and the settings store already address it by.
 * Nothing in this file knows what any of them mean.
 */
export function applyOverrides (config: object, sets: readonly string[]): string[] {
  const applied: string[] = []

  for (const entry of sets) {
    const split = entry.indexOf('=')

    if (split === -1)
      throw new Error(`--set wants path=value, got "${entry}"`)

    const path = entry.slice(0, split).trim()

    writePath(config, path, coerce(entry.slice(split + 1).trim()))
    applied.push(path)
  }

  return applied
}
