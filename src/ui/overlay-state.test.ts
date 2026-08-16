import { describe, expect, test } from 'bun:test'
import { readCardHidden, writeCardHidden } from './overlay-state.ts'


const KEY = 'three-iso.overlay.v1'

function memoryStorage (): Storage {
  const map = new Map<string, string>()

  return {
    get length () {
      return map.size
    },
    clear:   () => map.clear(),
    key:     index => [ ...map.keys() ][index] ?? null,
    getItem: key => map.get(key) ?? null,
    setItem (key, value) {
      map.set(key, value)
    },
    removeItem (key) {
      map.delete(key)
    },
  }
}

/** A store whose *property reads* throw — Safari's private mode, and a sandboxed frame. */
function hostileStorage (): Storage {
  return new Proxy({} as Storage, {
    get () {
      throw new Error('access denied')
    },
  })
}

describe('overlay state', () => {
  test('round-trips both answers', () => {
    const storage = memoryStorage()

    writeCardHidden(true, storage)
    expect(readCardHidden(storage)).toBe(true)

    writeCardHidden(false, storage)
    expect(readCardHidden(storage)).toBe(false)
  })

  test('says nothing rather than false when nobody has chosen', () => {
    // The distinction is the whole point: a first visit gets the caller's
    // default, and only a reader who has actually pressed the handle overrides it.
    expect(readCardHidden(memoryStorage())).toBeNull()
  })

  test('treats a value it did not write as nobody having chosen', () => {
    const storage = memoryStorage()

    storage.setItem(KEY, '{"hidden":true}')
    expect(readCardHidden(storage)).toBeNull()

    storage.setItem(KEY, 'yes')
    expect(readCardHidden(storage)).toBeNull()
  })

  test('degrades quietly when there is no storage at all', () => {
    expect(readCardHidden(null)).toBeNull()
    expect(() => writeCardHidden(true, null)).not.toThrow()
  })

  test('survives a store whose reads throw', () => {
    const storage = hostileStorage()

    expect(readCardHidden(storage)).toBeNull()
    expect(() => writeCardHidden(true, storage)).not.toThrow()
  })
})
