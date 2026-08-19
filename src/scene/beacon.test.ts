import { describe, expect, test } from 'bun:test'
import { Vector3 } from 'three'
import { advanceOptic, lampBrightness, lanternBounds } from './beacon.ts'
import type { LanternHub } from './beacon.ts'
import { SCAPE_CONFIG } from './config.ts'


const HUBS: LanternHub[] = [
  { x: 63.5, y: 12.6, z: 39.3 },
  { x: -178, y: 9.4, z: 128 },
]

function withLamp (lamp: number) {
  return { ...SCAPE_CONFIG, beacon: { ...SCAPE_CONFIG.beacon, lamp }}
}

describe('the lamp', () => {
  test('is out at noon and burning at midnight', () => {
    expect(lampBrightness(SCAPE_CONFIG, 1)).toBe(0)
    expect(lampBrightness(SCAPE_CONFIG, 0)).toBeCloseTo(SCAPE_CONFIG.beacon.lamp, 6)
  })

  test('comes up through dusk rather than switching on', () => {
    const dusk = lampBrightness(SCAPE_CONFIG, 0.5)

    expect(dusk).toBeGreaterThan(0)
    expect(dusk).toBeLessThan(lampBrightness(SCAPE_CONFIG, 0))
  })

  test('zero is a light that was never lit, at any hour', () => {
    for (const day of [ 0, 0.25, 0.5, 1 ])
      expect(lampBrightness(withLamp(0), day)).toBe(0)
  })

  test('a day beyond the ends of its range cannot push it negative or dim it twice', () => {
    expect(lampBrightness(SCAPE_CONFIG, 1.4)).toBe(0)
    expect(lampBrightness(SCAPE_CONFIG, -0.4)).toBeCloseTo(SCAPE_CONFIG.beacon.lamp, 6)
  })
})

describe('the optic', () => {
  test('turns at the rate it was given, in turns per minute', () => {
    // Six turns a minute is one turn every ten seconds, so five seconds is half
    // of one — the check that the unit in the config is the unit in the code.
    expect(advanceOptic(0, 6, 5)).toBeCloseTo(Math.PI, 6)
  })

  test('a stopped optic stays exactly where it stands', () => {
    expect(advanceOptic(1.234, 0, 10)).toBe(1.234)
    expect(advanceOptic(1.234, -3, 10)).toBe(1.234)
    expect(advanceOptic(1.234, 4, 0)).toBe(1.234)
  })

  test('wraps, so a scape left running all day is where a fresh one is', () => {
    const phase = advanceOptic(0, 4, 60 * 60)

    expect(phase).toBeGreaterThanOrEqual(0)
    expect(phase).toBeLessThan(Math.PI * 2)
  })
})

describe('the bound', () => {
  test('holds every lantern and the whole throw of its beams', () => {
    const bound = lanternBounds(HUBS, SCAPE_CONFIG.beacon.beamReach)

    for (const hub of HUBS)
      expect(bound.containsPoint(new Vector3(hub.x, hub.y, hub.z))).toBe(true)

    expect(bound.radius).toBeGreaterThan(SCAPE_CONFIG.beacon.beamReach)
  })

  test('one lantern is a sphere around that lantern', () => {
    const bound = lanternBounds([ HUBS[0] ], 40)

    expect(bound.center.x).toBeCloseTo(HUBS[0].x, 6)
    expect(bound.radius).toBeCloseTo(40, 6)
  })
})
