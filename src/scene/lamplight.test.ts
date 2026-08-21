import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { SCAPE_CONFIG } from './config.ts'
import type { ScapeConfig } from './config.ts'
import {
  advanceFlicker,
  buildGlowDisc,
  paneBrightness,
  paneFlicker,
  paneGlow,
  paneHalo,
  paneLit,
  paneSpread,
} from './lamplight.ts'
import { atmosphereQuality } from './quality.ts'


const config = SCAPE_CONFIG as ScapeConfig

function withLamplight (overrides: Partial<ScapeConfig['lamplight']>): ScapeConfig {
  return { ...config, lamplight: { ...config.lamplight, ...overrides }}
}

describe('when the lamps come on', () => {
  test('burns nothing at noon and brightest with the sun off the water', () => {
    expect(paneBrightness(config, 1)).toBe(0)
    expect(paneBrightness(config, 0)).toBeCloseTo(config.lamplight.brightness, 6)
  })

  // The same curve the beacon's lamp uses, and the same reason: a coast whose
  // lighthouse and whose farmhouse come on at different dusks is two answers to
  // one question.
  test('comes up through dusk rather than snapping on', () => {
    const half = paneBrightness(config, 0.5)

    expect(half).toBeGreaterThan(0)
    expect(half).toBeLessThan(paneBrightness(config, 0) * 0.3)
  })

  test('is the switch: nobody home leaves every pane dark at every hour', () => {
    const dark = withLamplight({ brightness: 0 })

    for (const day of [ 0, 0.25, 0.5, 1 ])
      expect(paneBrightness(dark, day)).toBe(0)
  })

  test('takes the negative it can be dragged to as no lamp at all', () => {
    expect(paneBrightness(withLamplight({ brightness: -2 }), 0)).toBe(0)
  })
})

describe('which windows are lit', () => {
  test('leaves the configured share burning across a whole archipelago', () => {
    const panes = 45
    let lit     = 0

    for (let index = 0; index < panes; index += 1)
      if (paneLit(index, 0.66))
        lit += 1

    // The golden-ratio sequence is low-discrepancy, so the count tracks the
    // share to within a pane or two at any length rather than only on average.
    expect(lit).toBeGreaterThan(panes * 0.6)
    expect(lit).toBeLessThan(panes * 0.72)
  })

  test('is deterministic — the same pane is lit on every run', () => {
    const first  = Array.from({ length: 30 }, (_value, index) => paneLit(index, 0.5))
    const second = Array.from({ length: 30 }, (_value, index) => paneLit(index, 0.5))

    expect(first).toEqual(second)
  })

  // The claim the sequence was chosen for: glazing one more gable must not
  // relight the buildings before it. A draw from an rng cannot promise this.
  test('does not relight an earlier pane when a later one is added', () => {
    const before = Array.from({ length: 9 }, (_value, index) => paneLit(index, 0.66))
    const after  = Array.from({ length: 14 }, (_value, index) => paneLit(index, 0.66))

    expect(after.slice(0, 9)).toEqual(before)
  })

  test('lights all of it at one and none of it at zero', () => {
    for (let index = 0; index < 20; index += 1) {
      expect(paneLit(index, 1)).toBe(true)
      expect(paneLit(index, 0)).toBe(false)
    }
  })

  test('spreads every pane across the unit interval', () => {
    for (let index = 0; index < 50; index += 1) {
      expect(paneSpread(index)).toBeGreaterThanOrEqual(0)
      expect(paneSpread(index)).toBeLessThan(1)
    }
  })
})

describe('the flicker', () => {
  test('stops dead at a rate of zero, which is what a capture needs', () => {
    expect(advanceFlicker(0.3, 0, 12)).toBe(0.3)
  })

  test('turns once a second at sixty flickers a minute', () => {
    expect(advanceFlicker(0, 60, 0.5)).toBeCloseTo(0.5, 6)
  })

  test('wraps, so a scape left running overnight is where one just opened is', () => {
    expect(advanceFlicker(0, 60, 3_600)).toBeCloseTo(0, 6)
    expect(advanceFlicker(0, 14, 60 / 14 * 10.25)).toBeCloseTo(0.25, 6)
  })

  test('never brightens a pane and never puts one out', () => {
    for (let index = 0; index < 12; index += 1)
      for (const phase of [ 0, 0.17, 0.5, 0.83 ]) {
        expect(paneFlicker(index, phase)).toBeLessThanOrEqual(1.000_001)
        expect(paneFlicker(index, phase)).toBeGreaterThan(0.8)
      }
  })

  test('gives each pane its own phase, so a settlement is lamps and not a dimmer', () => {
    const levels = new Set(
      Array.from({ length: 9 }, (_value, index) => paneFlicker(index, 0).toFixed(6)),
    )

    expect(levels.size).toBeGreaterThan(6)
  })
})

describe('the halo, at the two ends of the zoom', () => {
  const spill = config.lamplight.spill

  test('is exactly as wide as the config says it is, pulled in', () => {
    const halo = paneHalo(0.4, 0.55, spill, config.camera.minViewSize)

    expect(halo.halfW).toBeCloseTo(0.4 * spill, 6)
    expect(halo.halfH).toBeCloseTo(0.55 * spill, 6)
    expect(halo.fade).toBeCloseTo(1, 6)
  })

  test('is held at a legible mark, pulled out', () => {
    const halo = paneHalo(0.4, 0.55, spill, config.camera.maxViewSize)

    expect(halo.halfW).toBeGreaterThan(0.4 * spill * 10)
    expect(halo.halfW).toBe(halo.halfH)
  })

  // The whole reason the size and the fade come out of one call: a lamp spread
  // over eighty times its own area is not eighty times as much light. But the
  // stretch is a legibility device rather than a claim about flux, so the dimming
  // has a floor — and without it every lit window in the archipelago was four
  // hundredths of a per cent of a night frame, which is the same as absent.
  test('dims for the stretch, but never past the legibility floor', () => {
    const mid  = paneHalo(0.4, 0.55, spill, 140)
    const wide = paneHalo(0.4, 0.55, spill, config.camera.maxViewSize)

    expect(mid.fade).toBeGreaterThan(0.42)
    expect(mid.fade).toBeLessThan(1)
    expect(mid.fade).toBeCloseTo(0.4 * spill / mid.halfW, 6)

    expect(wide.fade).toBe(0.42)
  })

  test('never fades a halo it did not stretch', () => {
    for (const viewSize of [ 8, 40, 90, 200, 540, 1_400 ])
      expect(paneHalo(0.4, 0.55, spill, viewSize).fade).toBeLessThanOrEqual(1)
  })

  test('holds the middle of the zoom between the two', () => {
    const near = paneHalo(0.4, 0.55, spill, 40)
    const far  = paneHalo(0.4, 0.55, spill, 540)

    expect(near.halfW).toBeLessThan(far.halfW)
    expect(near.fade).toBeGreaterThan(far.fade)
  })
})

describe('the glow above white', () => {
  test('is only spent where there is a bloom to catch it', () => {
    expect(paneGlow(config, atmosphereQuality('ultra'))).toBeCloseTo(config.lamplight.glow, 6)

    // The graceful absence rather than the broken cheap version: on a tier with
    // no bloom the lamp stays exactly as bright as it is drawn, which is a warm
    // pane instead of a clipped white one.
    expect(paneGlow(config, atmosphereQuality('mobile'))).toBe(1)
    expect(paneGlow(config, atmosphereQuality('minimal'))).toBe(1)
  })

  test('never drops a lamp below the white it is drawn at', () => {
    expect(paneGlow(withLamplight({ glow: 0.2 }), atmosphereQuality('ultra'))).toBe(1)
  })
})

describe('the glow disc', () => {
  test('is a unit disc, so the instance scale is the only thing that sizes it', () => {
    const geometry = buildGlowDisc()
    const bounds   = new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)

    expect(bounds.max.x).toBeCloseTo(1, 6)
    expect(bounds.min.x).toBeCloseTo(-1, 6)

    // Flat, and in the plane a pane looks out of — the instance's yaw is what
    // turns it onto the wall.
    expect(bounds.max.z).toBe(0)
    expect(bounds.min.z).toBe(0)

    geometry.dispose()
  })

  test('carries its falloff in the vertex colours, bright in and black out', () => {
    const geometry = buildGlowDisc()
    const colors   = geometry.getAttribute('color').array as Float32Array

    expect(colors[0]).toBeCloseTo(1, 6)
    expect(colors[colors.length - 1]).toBe(0)

    geometry.dispose()
  })
})
