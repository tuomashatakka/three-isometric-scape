import { describe, expect, test } from 'bun:test'
import {
  WEATHER_BANK_DRIFT,
  WEATHER_BANK_GLSL,
  WEATHER_BANK_HIGH,
  WEATHER_BANK_LOW,
  WEATHER_BANK_SWING,
  WEATHER_BANK_WORLD_FRACTION,
  bankMask,
  bankedField,
  weatherBankDrift,
  weatherBankTile,
  skyRepeats,
} from './weather-bank.ts'
import { CLOUD_CUT, CLOUD_EDGE } from './cloud-shadow.ts'
import { SCAPE_CONFIG } from './config.ts'


const { worldSize }               = SCAPE_CONFIG.archipelago
const { cloudScale, weatherBank } = SCAPE_CONFIG.atmosphere


describe('the tile, against the world it is laid over', () => {
  test('the bank tile follows the world, and only the world', () => {
    expect(weatherBankTile(worldSize)).toBeCloseTo(worldSize * WEATHER_BANK_WORLD_FRACTION, 10)
    expect(weatherBankTile(worldSize * 3)).toBeCloseTo(weatherBankTile(worldSize) * 3, 10)
  })

  /**
   * The claim the whole module exists to make, stated as a fact about the two
   * periods rather than as a description of a picture.
   *
   * Every field in the scape that tiles is frame-sized and repeats many times
   * across the world — which is right for what each of them is and wrong for
   * what they were being asked to do alone. A lattice is not one repeat, it is
   * several: the bank is world-sized and does not manage two periods across the
   * whole archipelago, so there is no lattice in it to find at any zoom.
   */
  test('the cloud tile repeats across the world and the bank does not', () => {
    expect(skyRepeats(worldSize, cloudScale)).toBeGreaterThan(8)
    expect(skyRepeats(worldSize, weatherBankTile(worldSize))).toBeLessThan(2)
  })

  test('a world of nothing still has a tile to divide by', () => {
    expect(weatherBankTile(0)).toBeGreaterThan(0)
    expect(Number.isFinite(skyRepeats(worldSize, weatherBankTile(0)))).toBe(true)
  })
})

describe('the field, banked', () => {
  test('no banking is the sky the scape had before it', () => {
    for (const detail of [ 0, 0.17, 0.5, 0.83, 1 ])
      expect(bankedField(detail, 0.93, 0)).toBe(detail)
  })

  /**
   * The bank is a bias and not a multiply, so a bank sitting exactly at its own
   * middle has to leave the field alone however hard it is turned up. Without
   * that the knob would darken or brighten the whole sky as a side effect of
   * shaping it, and the cover reported by `scape:map` would stop meaning what it
   * says.
   */
  test('a bank at its middle changes nothing at any strength', () => {
    for (const strength of [ 0.2, 0.6, 1 ])
      expect(bankedField(0.5, 0.5, strength)).toBeCloseTo(0.5, 12)
  })

  test('it is symmetric: what a high bank adds a low one takes', () => {
    const up   = bankedField(0.5, 0.8, 1) - 0.5
    const down = 0.5 - bankedField(0.5, 0.2, 1)

    expect(up).toBeCloseTo(down, 12)
    expect(up).toBeCloseTo(0.3 * WEATHER_BANK_SWING, 12)
  })

  test('it never leaves the field the cut is read against', () => {
    for (const detail of [ 0, 0.4, 1 ])
      for (const bank of [ 0, 0.5, 1 ]) {
        const banked = bankedField(detail, bank, 1)

        expect(banked).toBeGreaterThanOrEqual(0)
        expect(banked).toBeLessThanOrEqual(1)
      }
  })

  /**
   * The claim that makes a lane a lane.
   *
   * The cloud field is four octaves spanning roughly 0.17..0.83 about a mean of a
   * half, and `CLOUD_CUT` sits at 0.55 — above that mean, which is what gives an
   * unbanked sky its gaps. So the two claims are not each other's mirror. At the
   * authored strength a bank at its floor has to hold even the *top* of the
   * range under the cut, or a clear lane is merely thinner cloud; and a bank at
   * its ceiling has to carry the *mean* of it past `CLOUD_CUT + CLOUD_EDGE`, or
   * an overcast is merely denser stipple. Asking the second of the field's floor
   * as well would be asking the bank to do what the cut already decided.
   */
  test('at the authored strength the lanes are clear and the banks are shut', () => {
    expect(bankedField(0.83, 0, weatherBank)).toBeLessThan(CLOUD_CUT)
    expect(bankedField(0.5, 1, weatherBank)).toBeGreaterThan(CLOUD_CUT + CLOUD_EDGE)
  })
})

describe('the deck, masked', () => {
  test('no banking leaves every deck whole', () => {
    for (const bank of [ 0, 0.3, 0.5, 1 ])
      expect(bankMask(bank, 0)).toBe(1)
  })

  test('it takes the deck away under a low bank and leaves it under a high one', () => {
    expect(bankMask(WEATHER_BANK_LOW - 0.1, 1)).toBe(0)
    expect(bankMask(WEATHER_BANK_HIGH + 0.1, 1)).toBe(1)
  })

  test('it never returns anything a multiply into an alpha could not take', () => {
    for (const bank of [ -1, 0, 0.45, 1, 2 ])
      for (const strength of [ 0, 0.6, 1 ]) {
        expect(bankMask(bank, strength)).toBeGreaterThanOrEqual(0)
        expect(bankMask(bank, strength)).toBeLessThanOrEqual(1)
      }
  })
})

describe('the drift', () => {
  // The rule every moving thing in this scape is held to: a speed that can reach
  // zero, so a capture can stop it. The bank has no clock of its own — it rides
  // `wind.travel`, which `STILL` parks by zeroing the wind's strength — so this
  // states that there is no second path by which it could keep moving.
  test('a parked wind parks the bank', () => {
    expect(weatherBankDrift(0.9, 0, weatherBankTile(worldSize))).toBe(0)
    expect(weatherBankDrift(0, 400, weatherBankTile(worldSize))).toBe(0)
  })

  /**
   * The drift is in metres and the uv it is handed back in is a share of a tile,
   * so a world that doubles must see the bank scroll *half* as far per tile —
   * the same front crossing the same coast at the same speed. Getting this the
   * other way round is how a larger world would have ended up with weather
   * racing across it.
   */
  test('it is metres, so a wider world scrolls fewer tiles for the same travel', () => {
    const near = weatherBankDrift(1, 100, weatherBankTile(worldSize))
    const far  = weatherBankDrift(1, 100, weatherBankTile(worldSize * 2))

    expect(near).toBeCloseTo(far * 2, 12)
    expect(near * weatherBankTile(worldSize)).toBeCloseTo(100 * WEATHER_BANK_DRIFT, 10)
  })
})

describe('the lookup both readers compile', () => {
  test('it declares the bank uniforms and borrows the caller’s map', () => {
    for (const name of [ 'uWeatherBankOffset', 'uWeatherBankScale', 'uWeatherBank' ])
      expect(WEATHER_BANK_GLSL).toContain(name)

    // Declared by the caller, never here: the shadow already has one, and a
    // second `uniform sampler2D` of the same name is a compile error.
    expect(WEATHER_BANK_GLSL).not.toContain('uniform sampler2D')
    expect(WEATHER_BANK_GLSL).toContain('uCloudMap')
  })

  /**
   * The shader and the module have to be the same function, and the only way to
   * state that without a gl context is to check that the numbers the one is
   * written with are the numbers the other was compiled from.
   */
  test('it carries the same constants the module is tested at', () => {
    expect(WEATHER_BANK_GLSL).toContain(WEATHER_BANK_SWING.toFixed(2))
    expect(WEATHER_BANK_GLSL).toContain(WEATHER_BANK_LOW.toFixed(2))
    expect(WEATHER_BANK_GLSL).toContain(WEATHER_BANK_HIGH.toFixed(2))
  })
})
