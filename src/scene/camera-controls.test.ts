import { describe, expect, test } from 'bun:test'
import { clientPointToNdc, wrapHeading, zoomViewSize } from './camera-controls.ts'


describe('camera control math', () => {
  test('wraps headings into compass degrees', () => {
    expect(wrapHeading(370)).toBe(10)
    expect(wrapHeading(-45)).toBe(315)
  })

  test('zooms an orthographic frustum and respects its limits', () => {
    expect(zoomViewSize(40, 2, 18, 92)).toBe(20)
    expect(zoomViewSize(20, 4, 18, 92)).toBe(18)
    expect(zoomViewSize(80, 0.5, 18, 92)).toBe(92)
  })

  test('maps client coordinates into normalized device coordinates', () => {
    const bounds = { left: 10, top: 20, width: 200, height: 100 }

    expect(clientPointToNdc(10, 20, bounds)).toEqual([ -1, 1 ])
    expect(clientPointToNdc(110, 70, bounds)).toEqual([ 0, 0 ])
    expect(clientPointToNdc(210, 120, bounds)).toEqual([ 1, -1 ])
  })
})
