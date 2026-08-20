import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from './config.ts'


/** Every leaf in the config, as `path` and value. */
function leaves (node: unknown, prefix = ''): [ string, unknown ][] {
  if (typeof node !== 'object' || node === null)
    return [[ prefix, node ]]

  if (Array.isArray(node))
    return [[ prefix, node ]]

  return Object.entries(node).flatMap(([ key, value ]) =>
    leaves(value, prefix ? `${prefix}.${key}` : key))
}

const all = leaves(SCAPE_CONFIG)

describe('the tuning surface', () => {
  test('there is something to check', () => {
    expect(all.length).toBeGreaterThan(100)
  })

  /**
   * "There is no `enabled` flag anywhere: an effect is off when its strength is
   * zero." A boolean beside a number is two ways to say off, and they disagree
   * the moment one is written and the other is not — a slider that does nothing
   * because a flag it does not mention is false is the worst version of that.
   *
   * Written as a shape test rather than a name test on purpose: `enabled` is
   * only the most obvious spelling of the mistake. `on`, `visible`, `active` and
   * `useX` are the same mistake with better cover.
   */
  test('no knob is a boolean', () => {
    const flags = all.filter(([ , value ]) => typeof value === 'boolean').map(([ path ]) => path)

    expect(flags).toEqual([])
  })

  test('every knob is a number, a string or a list of them', () => {
    const odd = all.filter(([ , value ]) =>
      !(typeof value === 'number' || typeof value === 'string' || Array.isArray(value)))

    expect(odd).toEqual([])
  })

  /**
   * A knob whose value is not finite cannot be reached from a url, a slider or a
   * capture flag, because every one of those routes goes through `Number()`.
   */
  test('every number is finite', () => {
    const broken = all
      .filter(([ , value ]) => typeof value === 'number' && !Number.isFinite(value))
      .map(([ path ]) => path)

    expect(broken).toEqual([])
  })
})
