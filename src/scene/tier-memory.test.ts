import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createTierMemory } from './tier-memory.ts'


/**
 * `bun test` has no DOM, which is the same situation as a browser that refuses
 * storage — and the module is written to survive that. So the tests that want a
 * memory install one, and the test that wants no memory at all simply does not.
 */
function installStorage (seed: Record<string, string> = {}): Map<string, string> {
  const entries = new Map(Object.entries(seed))

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value:        {
      getItem:    (key: string) => entries.get(key) ?? null,
      setItem:    (key: string, value: string) => void entries.set(key, value),
      removeItem: (key: string) => void entries.delete(key),
    },
  })

  return entries
}

function removeStorage (): void {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined })
}

const KEY = 'three-iso:tier'

// Matches the fallback the module uses when vite's define never reaches it.
const BUILD = 'unbundled'

beforeEach(() => void installStorage())
afterEach(() => void removeStorage())

describe('createTierMemory', () => {
  test('remembers nothing on a device that has not been here', () => {
    expect(createTierMemory().remembered).toBeNull()
    expect(createTierMemory().clamp('ultra')).toBe('ultra')
  })

  test('holds a device down to what it has already proven', () => {
    installStorage({ [KEY]: `${BUILD} minimal` })

    const memory = createTierMemory()

    expect(memory.remembered).toBe('minimal')
    expect(memory.clamp('ultra')).toBe('minimal')
    expect(memory.clamp('mobile')).toBe('minimal')
  })

  test('never argues a device upward', () => {
    installStorage({ [KEY]: `${BUILD} ultra` })

    // A machine that survived ultra last week may be throttled or on battery
    // now. Memory is allowed to lower the ask and nothing else.
    expect(createTierMemory().clamp('mobile')).toBe('mobile')
  })

  test('discards a verdict reached about another build', () => {
    installStorage({ [KEY]: '2020-01-01T00:00:00.000Z minimal' })

    expect(createTierMemory().remembered).toBeNull()
  })

  test('discards a stored value that is no longer a tier', () => {
    installStorage({ [KEY]: `${BUILD} potato` })

    expect(createTierMemory().remembered).toBeNull()
  })

  test('discards a stored value it cannot even split', () => {
    installStorage({ [KEY]: 'mobile' })

    expect(createTierMemory().remembered).toBeNull()
  })

  test('writes a verdict the next load can read back', () => {
    const entries = installStorage()

    createTierMemory().remember('minimal')

    expect(entries.get(KEY)).toBe(`${BUILD} minimal`)
    expect(createTierMemory().remembered).toBe('minimal')
  })

  test('forgets, so an explicit tier is not overruled by an old crash', () => {
    installStorage({ [KEY]: `${BUILD} minimal` })

    const memory = createTierMemory()

    memory.forget()

    expect(createTierMemory().remembered).toBeNull()
  })

  test('starts, reads and writes on a device with no storage at all', () => {
    removeStorage()

    const memory = createTierMemory()

    expect(memory.remembered).toBeNull()
    expect(() => memory.remember('mobile')).not.toThrow()
    expect(() => memory.forget()).not.toThrow()
    expect(memory.clamp('desktop')).toBe('desktop')
  })

  test('survives storage that throws on every call', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value:        {
        getItem () {
          throw new Error('quota')
        },
        setItem () {
          throw new Error('quota')
        },
        removeItem () {
          throw new Error('quota')
        },
      },
    })

    const memory = createTierMemory()

    expect(memory.remembered).toBeNull()
    expect(() => memory.remember('mobile')).not.toThrow()
  })
})
