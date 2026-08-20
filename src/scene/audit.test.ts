import { describe, expect, test } from 'bun:test'
import { readSkips, SCAPE_FAMILIES } from './audit.ts'


describe('readSkips', () => {
  test('is empty when the url says nothing', () => {
    expect(readSkips(null, () => undefined).size).toBe(0)
    expect(readSkips('', () => undefined).size).toBe(0)
  })

  test('reads a comma-separated list, spaces and all', () => {
    const skipped = readSkips('water, mist', () => undefined)

    expect([ ...skipped ].sort()).toEqual([ 'mist', 'water' ])
  })

  test('reports a name it does not know rather than dropping it quietly', () => {
    const said: string[] = []
    const skipped        = readSkips('water,nonsense', message => said.push(message))

    expect(skipped.has('water')).toBe(true)
    expect(said.some(line => line.includes('nonsense'))).toBe(true)
  })

  test('accepts every family it advertises', () => {
    const skipped = readSkips(SCAPE_FAMILIES.join(','), () => undefined)

    expect(skipped.size).toBe(SCAPE_FAMILIES.length)
  })
})
