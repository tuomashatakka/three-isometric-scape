import { describe, expect, test } from 'bun:test'
import { controlPaths, readPath, writePath } from './scape-controls.ts'
import type { ControlSection } from './scape-controls.ts'
import { createSettingsStore } from './settings-store.ts'


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

const SECTIONS: ControlSection[] = [
  {
    title:    'optics',
    controls: [
      { kind: 'select', path: 'look.grade', label: 'grade', options: [ 'nordic', 'noir' ]},
      {
        kind:     'toggle',
        label:    'bloom',
        restore:  0.34,
        children: [{ kind: 'range', path: 'look.bloom', label: 'strength', min: 0, max: 1, step: 0.01 }],
      },
    ],
  },
]

type ConfigReturnType = { look: { grade: string; bloom: number }}

function config (): ConfigReturnType {
  return { look: { grade: 'nordic', bloom: 0.34 }}
}

describe('paths', () => {
  test('read and write nested values', () => {
    const scape = config()

    expect(readPath(scape, 'look.bloom')).toBe(0.34)
    writePath(scape, 'look.bloom', 0.9)
    expect(scape.look.bloom).toBe(0.9)
  })

  test('ignore paths that do not resolve', () => {
    const scape = config()

    expect(readPath(scape, 'look.missing.deep')).toBeUndefined()
    writePath(scape, 'nowhere.at.all', 1)
    expect(scape).toEqual(config())
  })

  test('collect every leaf a section exposes, toggles included', () => {
    expect(controlPaths(SECTIONS)).toEqual([ 'look.grade', 'look.bloom' ])
  })
})

describe('createSettingsStore', () => {
  test('round-trips the exposed paths', async () => {
    const storage = memoryStorage()
    const first   = config()
    const store   = createSettingsStore(first, SECTIONS, storage)

    first.look.bloom = 1
    first.look.grade = 'noir'
    store.save()
    await Bun.sleep(300)

    const second = config()
    createSettingsStore(second, SECTIONS, storage).load()

    expect(second.look.bloom).toBe(1)
    expect(second.look.grade).toBe('noir')
  })

  test('refuses stored values whose type no longer matches', () => {
    const storage = memoryStorage()
    storage.setItem('three-iso.graphics.v1', JSON.stringify({ 'look.bloom': 'loud' }))

    const scape = config()
    createSettingsStore(scape, SECTIONS, storage).load()

    expect(scape.look.bloom).toBe(0.34)
  })

  test('survives unparseable storage', () => {
    const storage = memoryStorage()
    storage.setItem('three-iso.graphics.v1', '{ not json')

    const scape = config()
    createSettingsStore(scape, SECTIONS, storage).load()

    expect(scape.look.bloom).toBe(0.34)
  })

  test('reset restores the authored values and forgets the snapshot', async () => {
    const storage = memoryStorage()
    const scape   = config()
    const store   = createSettingsStore(scape, SECTIONS, storage)

    scape.look.bloom = 1.2
    store.save()
    await Bun.sleep(300)
    store.reset()

    expect(scape.look.bloom).toBe(0.34)
    expect(storage.getItem('three-iso.graphics.v1')).toBeNull()
  })

  test('degrades quietly when there is no storage at all', () => {
    const scape = config()
    const store = createSettingsStore(scape, SECTIONS, null)

    store.load()
    store.save()
    store.reset()

    expect(scape.look.bloom).toBe(0.34)
  })
})
