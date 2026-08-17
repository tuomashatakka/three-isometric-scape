import { describe, expect, test } from 'bun:test'
import { readCardHidden, readSectionOpen, writeCardHidden, writeSectionOpen } from './overlay-state.ts'


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


describe('which drawer sections were left open', () => {
  test('remembers a section by its name', () => {
    const storage = memoryStorage()

    writeSectionOpen('optics', true, storage)
    writeSectionOpen('water', false, storage)

    expect(readSectionOpen('optics', storage)).toBe(true)
    expect(readSectionOpen('water', storage)).toBe(false)
  })

  /**
   * Keyed by name and not by index on purpose: adding a section in the middle of
   * the panel, or reordering it, must not reopen a different one than the reader
   * chose — and a section nobody has answered for has to be able to keep its own
   * default, which `false` could not express.
   */
  test('a section nobody has answered for says so, rather than saying closed', () => {
    const storage = memoryStorage()

    expect(readSectionOpen('mist', storage)).toBeNull()

    writeSectionOpen('mist', false, storage)
    expect(readSectionOpen('mist', storage)).toBe(false)
  })

  test('one section’s answer does not overwrite the rest', () => {
    const storage = memoryStorage()

    writeSectionOpen('optics', true, storage)
    writeSectionOpen('season', true, storage)
    writeSectionOpen('optics', false, storage)

    expect(readSectionOpen('season', storage)).toBe(true)
  })

  test('a hand-edited record is treated as nobody having said', () => {
    const storage = memoryStorage()

    storage.setItem('three-iso.sections.v1', 'not json')
    expect(readSectionOpen('optics', storage)).toBeNull()

    storage.setItem('three-iso.sections.v1', '["optics"]')
    expect(readSectionOpen('optics', storage)).toBeNull()
  })

  test('no store at all is a panel that does not remember, not a crash', () => {
    expect(readSectionOpen('optics', null)).toBeNull()
    expect(() => writeSectionOpen('optics', true, null)).not.toThrow()
  })
})
