import { describe, expect, test } from 'bun:test'
import { NO_CAMERA_SESSION, createCameraStore, readOpening, readSession } from './camera-state.ts'


/** A `Storage` that answers, so the store can be exercised without a browser. */
function fakeStorage (seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed))

  return {
    get length () {
      return map.size
    },
    key:        index => [ ...map.keys() ][index] ?? null,
    getItem:    key => map.get(key) ?? null,
    setItem:    (key, value) => void map.set(key, value),
    removeItem: key => void map.delete(key),
    clear:      () => map.clear(),
  } as Storage
}

const KEY = 'three-iso.camera.v1'


describe('reading a stored pose', () => {
  test('takes one where every number is a number', () => {
    expect(readOpening({ x: 1, z: -2, viewSize: 40, heading: 190 }))
      .toEqual({ x: 1, z: -2, viewSize: 40, heading: 190 })
  })

  /**
   * The whole reason this is not a cast.
   *
   * A stored pose is applied straight to the camera before the first frame, so
   * one bad number is a scape that opens looking at nowhere and never recovers
   * — and it would read as a broken build rather than as bad data.
   */
  test('refuses anything that would aim the camera at nowhere', () => {
    expect(readOpening({ x: Number.NaN, z: 0, viewSize: 40, heading: 0 })).toBeNull()
    expect(readOpening({ x: 0, z: 0, viewSize: Infinity, heading: 0 })).toBeNull()
    expect(readOpening({ x: 0, z: 0, viewSize: 0, heading: 0 })).toBeNull()
    expect(readOpening({ x: 0, z: 0, viewSize: -4, heading: 0 })).toBeNull()
    expect(readOpening({ x: '3', z: 0, viewSize: 40, heading: 0 })).toBeNull()
    expect(readOpening({ z: 0, viewSize: 40, heading: 0 })).toBeNull()
    expect(readOpening(null)).toBeNull()
    expect(readOpening('nope')).toBeNull()
  })
})

describe('reading a stored session', () => {
  test('nothing stored is the authored default, with no tour', () => {
    expect(readSession(null)).toEqual({ ...NO_CAMERA_SESSION, waypoints: []})
  })

  test('a hand-edited or half-written record falls back rather than throwing', () => {
    expect(readSession('{{{')).toEqual({ ...NO_CAMERA_SESSION, waypoints: []})
    expect(readSession('[]')).toEqual({ ...NO_CAMERA_SESSION, waypoints: []})
    expect(readSession('"a string"')).toEqual({ ...NO_CAMERA_SESSION, waypoints: []})
  })

  test('drops the stops it cannot read and keeps the ones it can', () => {
    const session = readSession(JSON.stringify({
      waypoints: [
        { x: 0, z: 0, viewSize: 20, heading: 0 },
        { x: 'no', z: 0, viewSize: 20, heading: 0 },
        { x: 5, z: 5, viewSize: 30, heading: 90 },
      ],
    }))

    expect(session.waypoints).toEqual([
      { x: 0, z: 0, viewSize: 20, heading: 0 },
      { x: 5, z: 5, viewSize: 30, heading: 90 },
    ])
  })

  test('never restores a leg that takes no time at all', () => {
    expect(readSession(JSON.stringify({ legSeconds: 0 })).legSeconds).toBeGreaterThan(0)
    expect(readSession(JSON.stringify({ legSeconds: 'soon' })).legSeconds)
      .toBe(NO_CAMERA_SESSION.legSeconds)
  })
})

describe('the camera store', () => {
  test('gives back what it was given, once the write has landed', async () => {
    const storage = fakeStorage()
    const store   = createCameraStore(storage)
    const session = {
      opening:    { x: 3, z: 4, viewSize: 25, heading: 12 },
      waypoints:  [{ x: 0, z: 0, viewSize: 20, heading: 0 }],
      legSeconds: 9,
      loop:       false,
    }

    store.save(session)
    await Bun.sleep(400)

    expect(store.load()).toEqual(session)
  })

  test('keeps its own copy, so a later edit of the caller’s list is not stored', async () => {
    const storage = fakeStorage()
    const store   = createCameraStore(storage)
    const stops   = [{ x: 1, z: 1, viewSize: 20, heading: 0 }]

    store.save({ opening: null, waypoints: stops, legSeconds: 6, loop: true })
    stops[0].x = 404
    await Bun.sleep(400)

    expect(store.load().waypoints[0].x).toBe(1)
  })

  test('coalesces a flurry of saves into one write', async () => {
    let writes        = 0
    const underlying = fakeStorage()
    const counting   = {
      ...underlying,
      getItem: (key: string) => underlying.getItem(key),
      setItem: (key: string, value: string) => {
        writes += 1
        underlying.setItem(key, value)
      },
    } as Storage

    const store = createCameraStore(counting)

    for (let tick = 0; tick < 20; tick += 1)
      store.save({ opening: { x: tick, z: 0, viewSize: 20, heading: 0 }, waypoints: [], legSeconds: 6, loop: true })

    await Bun.sleep(400)

    expect(writes).toBe(1)
    expect(store.load().opening?.x).toBe(19)
  })

  test('forgetting removes the record rather than storing an empty one', async () => {
    const storage = fakeStorage()
    const store   = createCameraStore(storage)

    store.save({ opening: { x: 1, z: 1, viewSize: 20, heading: 0 }, waypoints: [], legSeconds: 6, loop: true })
    await Bun.sleep(400)
    store.clear()

    expect(storage.getItem(KEY)).toBeNull()
  })

  test('a store that is not there at all is a session that does not persist, not a crash', () => {
    const store = createCameraStore(null)

    store.save({ opening: { x: 1, z: 1, viewSize: 20, heading: 0 }, waypoints: [], legSeconds: 6, loop: true })
    store.clear()

    expect(store.load()).toEqual({ ...NO_CAMERA_SESSION, waypoints: []})
  })
})
