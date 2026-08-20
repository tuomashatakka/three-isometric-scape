import { describe, expect, test } from 'bun:test'
import { createStore } from 'threejs-scene'
import { SCAPE_CONFIG } from './config.ts'
import type { ScapeConfig } from './config.ts'
import { createConfigAccess } from './config-access.ts'
import { createDaylight } from './daylight.ts'
import { createSeason } from './season.ts'
import { createWeather } from './weather.ts'
import { createWind } from './wind.ts'


function access (): ReturnType<typeof createConfigAccess<ScapeConfig>> {
  return createConfigAccess<ScapeConfig>(SCAPE_CONFIG)
}


describe('who owns the config', () => {
  test('a write before the scape mounts leaves the authored object alone', () => {
    const config = access()

    config.write('look.bloom', 0.9)

    expect(config.read().look.bloom).toBe(0.9)
    expect(SCAPE_CONFIG.look.bloom).not.toBe(0.9)
  })

  test('once adopted, the store is what a read comes back from', () => {
    const config = access()
    const store  = createStore<ScapeConfig>(config.read())

    config.adopt(store)
    config.write('look.bloom', 0.77)

    expect(store.get().look.bloom).toBe(0.77)
    expect(config.read().look.bloom).toBe(0.77)
  })

  test('a write nobody would notice does not wake the store', () => {
    const config = access()
    const store  = createStore<ScapeConfig>(config.read())

    let woke = 0

    store.subscribe(() => {
      woke += 1
    })
    config.adopt(store)

    config.write('look.bloom', 0.5)
    config.write('look.bloom', 0.5)

    expect(woke).toBe(1)
  })

  test('teardown hands back what the reader last moved, so a rebuild starts there', () => {
    const config  = access()
    const store   = createStore<ScapeConfig>(config.read())
    const release = config.adopt(store)

    config.write('look.bloom', 0.61)
    release()

    // The scape is down and there is no store, but the next mount is built from
    // `read()` — and it has to open on the value the reader dragged, not on the
    // one that shipped.
    expect(config.read().look.bloom).toBe(0.61)

    config.write('look.vignette', 0.2)

    expect(config.read().look.bloom).toBe(0.61)
    expect(config.read().look.vignette).toBe(0.2)
  })
})

/**
 * The failure this whole change risks, tested directly.
 *
 * A capture cannot see it: `?set=` is applied before the scape mounts, and
 * nothing in the capture harness drives the overlay — so a module that captured
 * its section at build time and stopped answering afterwards would photograph
 * identically at every pose. These three are the clocks that had exactly that
 * shape, and the assertion is the one that matters: move a knob *after* the
 * thing was built, and the thing has to notice.
 */
describe('a knob moved after the scape was built', () => {
  test('reaches the solar arc', () => {
    const config = access()
    const arc    = createDaylight(config.read)
    const before = arc.sample(0.5, 0.25).direction.clone()

    config.write('daylight.latitude', SCAPE_CONFIG.daylight.latitude - 25)

    expect(arc.sample(0.5, 0.25).direction.equals(before)).toBe(false)
  })

  test('reaches the year', () => {
    const config = access()
    const year   = createSeason(config.read)

    expect(year.sample(0.06).freeze).toBeGreaterThan(0)

    config.write('season.ice', 0)

    expect(year.sample(0.06).freeze).toBe(0)
  })

  test('reaches the wind', () => {
    const config = access()
    const wind   = createWind(config.read)

    wind.module.build?.(undefined as never)

    const before = wind.state.dirX

    config.write('wind.bearing', SCAPE_CONFIG.wind.bearing + 90)
    wind.module.update?.(config.read(), { delta: 0, elapsed: 0, frame: 1 }, undefined as never)

    // A capture cannot check this: `?set=` is applied before the scape mounts,
    // so a wind that stopped answering after build would photograph identically
    // at every pose while the whole scape leaned the wrong way live.
    expect(wind.state.dirX).not.toBeCloseTo(before, 3)
  })

  test('reaches the weather', () => {
    const config = access()
    const sky    = createWeather(config.read)

    // A high-summer week so nothing here is sleet, sampled at the centre of the
    // squall band so there is actually something falling to take away.
    const week   = createSeason(config.read).sample(0.45)
    const squall = 0.3

    expect(sky.sample(squall, week).fall).toBeGreaterThan(0)

    config.write('weather.rain', 0)

    expect(sky.sample(squall, week).fall).toBe(0)
  })
})
