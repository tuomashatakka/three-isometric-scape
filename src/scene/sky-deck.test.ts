import { describe, expect, test } from 'bun:test'
import { OrthographicCamera } from 'three'
import { SCAPE_CONFIG } from './config.ts'
import { REVEAL_IN, REVEAL_OUT, deckReveal, deckViewSize } from './sky-deck.ts'


const LIMITS = SCAPE_CONFIG.camera

/** A view size at a fraction of the authored zoom range. */
function at (fraction: number): number {
  return LIMITS.minViewSize + (LIMITS.maxViewSize - LIMITS.minViewSize) * fraction
}

describe('deckReveal', () => {
  test('hides the deck at the near zoom, where the camera is under it', () => {
    expect(deckReveal(LIMITS.minViewSize, LIMITS)).toBe(0)
    expect(deckReveal(at(REVEAL_IN), LIMITS)).toBe(0)
  })

  test('is fully open by the far zoom', () => {
    expect(deckReveal(at(REVEAL_OUT), LIMITS)).toBe(1)
    expect(deckReveal(LIMITS.maxViewSize, LIMITS)).toBe(1)
  })

  test('only ever opens on the way out', () => {
    let previous = 0

    for (let step = 0; step <= 20; step += 1) {
      const reveal = deckReveal(at(step / 20), LIMITS)

      expect(reveal).toBeGreaterThanOrEqual(previous)
      previous = reveal
    }
  })

  test('is the same curve wherever the zoom range is moved to', () => {
    const wider = { ...LIMITS, minViewSize: 40, maxViewSize: 2_000 }

    expect(deckReveal(at(0.7), LIMITS))
      .toBeCloseTo(deckReveal(40 + (2_000 - 40) * 0.7, wider), 10)
  })

  test('the scape opens on a sky that is already out', () => {
    expect(deckReveal(LIMITS.viewSize, LIMITS)).toBeGreaterThan(0.9)
  })
})

describe('deckViewSize', () => {
  test('reads the live zoom off the camera once the controls have set one', () => {
    const camera             = new OrthographicCamera()
    camera.userData.viewSize = 123

    expect(deckViewSize(camera, () => SCAPE_CONFIG)).toBe(123)
  })

  test('falls back to the authored opening before they have', () => {
    expect(deckViewSize(new OrthographicCamera(), () => SCAPE_CONFIG)).toBe(LIMITS.viewSize)
  })
})
