import { describe, expect, test } from 'bun:test'
import { clampFocus, clientPointToNdc, headingDelta, rotateAroundPivot, tiltForViewSize, wrapHeading, zoomViewSize } from './camera-controls.ts'


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

  test('turns the short way round when damping a heading', () => {
    expect(headingDelta(350, 10)).toBe(20)
    expect(headingDelta(10, 350)).toBe(-20)
    expect(headingDelta(0, 180)).toBe(-180)
  })

  test('derives elevation from the zoom level', () => {
    expect(tiltForViewSize(8, 8, 92, 21, 52)).toBe(21)
    expect(tiltForViewSize(92, 8, 92, 21, 52)).toBe(52)
    expect(tiltForViewSize(50, 8, 92, 21, 52)).toBeCloseTo(36.5, 5)
  })

  test('opens on the ground point it is asked for, and only inside the world', () => {
    expect(clampFocus(-31, 4, 250)).toEqual({ x: -31, z: 4 })

    // Past the edge the camera would open on a view no drag could get back to,
    // because a drag is held inside this same box.
    expect(clampFocus(-900, 900, 250)).toEqual({ x: -250, z: 250 })
  })

  describe('rotateAroundPivot', () => {
    test('the pivot point stays fixed across a heading change', () => {
      // The focus is 10 units east of the pivot. After a 90° rotation, it
      // should be 10 units south, but the pivot must not have moved.
      const focus  = { x: 10, z: 0 }
      const pivot  = { x: 0, z: 0 }
      const result = rotateAroundPivot(focus, pivot, 90)

      // Pivot unchanged (trivially — it is the origin).
      expect(pivot.x).toBe(0)
      expect(pivot.z).toBe(0)

      // Focus rotated 90° CW in the XZ plane: (10,0) → (0,-10).
      expect(result.x).toBeCloseTo(0, 8)
      expect(result.z).toBeCloseTo(-10, 8)
    })

    test('zero rotation leaves the focus unchanged', () => {
      const focus  = { x: 7, z: -3 }
      const pivot  = { x: 2, z: 5 }
      const result = rotateAroundPivot(focus, pivot, 0)

      expect(result.x).toBeCloseTo(7, 8)
      expect(result.z).toBeCloseTo(-3, 8)
    })

    test('rotating 360° returns to the start', () => {
      const focus  = { x: 12, z: 8 }
      const pivot  = { x: 3, z: -1 }
      const result = rotateAroundPivot(focus, pivot, 360)

      expect(result.x).toBeCloseTo(focus.x, 8)
      expect(result.z).toBeCloseTo(focus.z, 8)
    })

    test('the pivot-distance is preserved', () => {
      const focus  = { x: 5, z: 7 }
      const pivot  = { x: -2, z: 3 }
      const before = Math.hypot(focus.x - pivot.x, focus.z - pivot.z)

      for (const angle of [ 30, 90, 137, 270, -45 ]) {
        const result = rotateAroundPivot(focus, pivot, angle)
        const after  = Math.hypot(result.x - pivot.x, result.z - pivot.z)
        expect(after).toBeCloseTo(before, 8)
      }
    })

    test('heading wrap-around at 0/360', () => {
      // A focus at (5,0), pivot at origin. Rotating by -5° should give
      // nearly the same result as rotating by 355°.
      const focus = { x: 5, z: 0 }
      const pivot = { x: 0, z: 0 }
      const a     = rotateAroundPivot(focus, pivot, -5)
      const b     = rotateAroundPivot(focus, pivot, 355)

      expect(a.x).toBeCloseTo(b.x, 8)
      expect(a.z).toBeCloseTo(b.z, 8)
    })

    test('rotation at 45° (isometric base angle)', () => {
      // Focus 10 units from pivot along the +x axis. A 45° rotation should
      // put it on the diagonal.
      const focus    = { x: 10, z: 0 }
      const pivot    = { x: 0, z: 0 }
      const result   = rotateAroundPivot(focus, pivot, 45)
      const expected = 10 * Math.SQRT1_2

      expect(result.x).toBeCloseTo(expected, 8)
      expect(result.z).toBeCloseTo(-expected, 8)
    })
  })
})
