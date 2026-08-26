import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from './config.ts'
import type { ScapeConfig } from './config.ts'
import { createDaylight } from './daylight.ts'
import { surveyArchipelago } from './landscape/archipelago.ts'
import { surveyWindows } from './landscape/windows.ts'
import { BARN_WINDOWS, FARMHOUSE_WINDOWS, SAUNA_WINDOWS } from './props/buildings.ts'
import { createWindowLamps, householdWake, isLit, lampLevel } from './windows.ts'
import { LADDER, atmosphereQuality } from './quality.ts'


const survey = surveyArchipelago(SCAPE_CONFIG)
const panes  = surveyWindows(survey)

const A_HOLDING = FARMHOUSE_WINDOWS.length + SAUNA_WINDOWS.length + BARN_WINDOWS.length

/** Enough of a sky for the one path that never reads it. See the absence test. */
const DAYLIGHT = createDaylight(() => SCAPE_CONFIG).state

/** The config with one section replaced, so a curve can be probed off its default. */
function tuned (windows: Partial<ScapeConfig['windows']>): ScapeConfig {
  return { ...SCAPE_CONFIG, windows: { ...SCAPE_CONFIG.windows, ...windows }}
}


describe('where the lamps are', () => {
  test('is every glazed pane on every holding', () => {
    expect(panes.length).toBe(SCAPE_CONFIG.archipelago.landmasses.length * A_HOLDING)
    expect(A_HOLDING).toBe(13)
  })

  /**
   * The claim, as a fact about the data: a lit window is *on the outside of the
   * wall it belongs to*.
   *
   * The failure it catches is the one sign error this system can make. A pane on
   * the far wall of a building looks the other way, so its bearing is the
   * standing's turned half a circle — and getting that wrong paints the glow on
   * the inside face, where the building's own geometry hides it. From the
   * default pose that is indistinguishable from the lamps not working at all,
   * which is exactly the kind of bug a screenshot cannot report.
   *
   * Stated locally — the pane, the placed centre of its *own* building, and the
   * bearing between them — rather than against the yard the buildings stand
   * round. The yard's middle is not the answer: the aitta stands on the far side
   * of it, and a pane facing across the yard is not a pane facing inward. The
   * building's centre is published on the record for exactly this reason.
   */
  test('every pane looks away from the building it is set into', () => {
    const inward = panes
      .map(pane => ({
        where: `${pane.x},${pane.z}`,
        dot:   Math.sin(pane.angle) * (pane.x - pane.centre.x) +
          Math.cos(pane.angle) * (pane.z - pane.centre.z),
      }))
      .filter(entry => entry.dot <= 0)

    expect(inward).toEqual([])
  })

  /**
   * A lamp is inside a room, so it stands well over the floor and well under the
   * ridge. Half a metre of clearance over the ground catches a pane placed
   * against one height and standing over another — the slope failure the
   * chimneys have their own version of.
   *
   * The ceiling is nine metres rather than the farmhouse's 6.3 m ridge, and the
   * slack is the gables: a gable pane stands 4.6 m out from the middle of a
   * building that was levelled onto the *highest* ground under its footprint, so
   * the ground directly beneath it can be a couple of metres lower than the
   * floor it is set into. Nine still fails a pane that has floated free of its
   * building, which is what the bound is for.
   */
  test('every pane stands in a wall rather than in the ground or the air', () => {
    const stray = panes.filter(pane => {
      const over = pane.y - survey.field.heightAt(pane.x, pane.z)

      return over < 0.5 || over > 9
    })

    expect(stray).toEqual([])
  })

  test('every pane has a size to be scaled by', () => {
    expect(panes.every(pane => pane.width > 0 && pane.height > 0)).toBe(true)
    expect(panes.every(pane => pane.dwelling > 0 && pane.dwelling <= 1)).toBe(true)
  })

  test('the survey is byte-for-byte stable for a seed', () => {
    expect(surveyWindows(survey)).toEqual(panes)
  })
})

/**
 * The graceful absence, stated rather than assumed. A scape dressed without a
 * steading — a tier that never built one, a survey that placed none — has no
 * panes, and the answer to that is no module at all rather than an
 * `InstancedMesh` of zero instances sitting in the render list forever.
 *
 * It is also the one path through `createWindowLamps` that can be tested
 * headless: everything past it wants a gl context.
 */
describe('an archipelago with nothing to light', () => {
  test('gets no module rather than an empty one', () => {
    for (const tier of LADDER)
      expect(createWindowLamps({
        config:   () => SCAPE_CONFIG,
        quality:  atmosphereQuality(tier),
        panes:    [],
        daylight: DAYLIGHT,
      })).toBeNull()
  })
})

describe('the household', () => {
  const banked = SCAPE_CONFIG.windows.banked

  test('is up in the evening and asleep in the small hours', () => {
    // 21:00, before the default bedtime of 22:34.
    expect(householdWake(SCAPE_CONFIG, 0.875)).toBeCloseTo(1, 5)

    // 03:00, hours before it is up at 06:29.
    expect(householdWake(SCAPE_CONFIG, 0.125)).toBeCloseTo(banked, 5)
  })

  test('never goes fully dark, and never exceeds one', () => {
    for (let step = 0; step <= 200; step += 1) {
      const wake = householdWake(SCAPE_CONFIG, step / 200)

      expect(wake).toBeGreaterThanOrEqual(banked - 1e-9)
      expect(wake).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  /**
   * The degenerate pair, stated rather than left to be discovered: a bedtime at
   * or before the rising leaves a household that never gets up. Every window
   * sits at `banked` all day, which is the honest reading of that pair — and
   * emphatically not a wrap-around that lights the farm through the afternoon.
   */
  test('a bedtime before the rising is a farm that never gets up', () => {
    const never = tuned({ rising: 0.8, bedtime: 0.2 })

    for (let step = 0; step <= 40; step += 1)
      expect(householdWake(never, step / 40)).toBeCloseTo(never.windows.banked, 5)
  })

  test('the clock wraps rather than running off the end of the day', () => {
    expect(householdWake(SCAPE_CONFIG, 2.875)).toBeCloseTo(householdWake(SCAPE_CONFIG, 0.875), 9)
  })
})

describe('how brightly a lamp burns', () => {
  test('is nothing at all in full daylight, whatever the hour says', () => {
    expect(lampLevel(SCAPE_CONFIG, 1, 0.875)).toBe(0)
    expect(lampLevel(SCAPE_CONFIG, 1, 0.125)).toBe(0)
  })

  test('is brightest at night with the household up', () => {
    const evening = lampLevel(SCAPE_CONFIG, 0, 0.875)
    const asleep  = lampLevel(SCAPE_CONFIG, 0, 0.125)

    expect(evening).toBeGreaterThan(asleep)
    expect(asleep).toBeGreaterThan(0)
  })

  /** The switch, and the only one. See the config's note on `enabled` flags. */
  test('is nothing with the lamps turned off, at any hour of any sky', () => {
    const out = tuned({ glow: 0 })

    for (const day of [ 0, 0.4, 1 ])
      for (const time of [ 0.05, 0.5, 0.875 ])
        expect(lampLevel(out, day, time)).toBe(0)
  })

  test('rises as the sun goes down rather than stepping', () => {
    const dusk = [ 1, 0.75, 0.5, 0.25, 0 ].map(day => lampLevel(SCAPE_CONFIG, day, 0.875))

    for (let step = 1; step < dusk.length; step += 1)
      expect(dusk[step]).toBeGreaterThan(dusk[step - 1])
  })
})

describe('which windows are occupied', () => {
  const rolls = panes.map((_pane, index) => index / panes.length)

  test('nothing is lit at zero, and every pane of a full house at one', () => {
    expect(rolls.some(roll => isLit(roll, 1, 0))).toBe(false)
    expect(rolls.every(roll => isLit(roll, 1, 1))).toBe(true)
  })

  /**
   * The claim the per-building weights exist to make: turning the farm up lights
   * the house before it lights the byre. Same rolls, same knob — only the
   * weight differs, so a strict inequality here is the weight doing its job.
   */
  test('the farmhouse lights before the byre', () => {
    const count = (dwelling: number): number => rolls.filter(roll => isLit(roll, dwelling, 0.66)).length

    expect(count(1)).toBeGreaterThan(count(0.55))
    expect(count(0.55)).toBeGreaterThan(count(0.3))
  })
})
