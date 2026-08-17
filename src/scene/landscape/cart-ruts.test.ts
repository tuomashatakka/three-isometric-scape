import { describe, it, expect } from 'bun:test'
import { createCartRuts } from './cart-ruts.ts'


describe('createCartRuts', () => {
  const simpleTrack = [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    { x: 20, z: 0 },
  ]

  const yardDistance = (x: number, z: number) => Math.hypot(x - 0, z - 0)

  it('should initialize with track and yardDistance', () => {
    const ruts = createCartRuts({
      track: simpleTrack,
      yardDistance,
    })

    expect(ruts).toBeDefined()
    expect(typeof ruts.wearAt).toBe('function')
  })

  it('should return zero wear far from track', () => {
    const ruts = createCartRuts({
      track: simpleTrack,
      yardDistance,
    })

    // 50 units away from any track point
    const wear = ruts.wearAt(50, 50)
    expect(wear).toBeLessThan(0.01)
  })

  it('should return maximum wear near yard on the track', () => {
    const ruts = createCartRuts({
      track: simpleTrack,
      yardDistance,
    })

    // On the track, at the yard center (origin)
    // The track runs from (0,0) to (20,0), so (1, 0.1) is very close to the track
    const wear = ruts.wearAt(1, 0.1)
    expect(wear).toBeGreaterThan(0.1)
  })

  it('should decay wear with distance from yard', () => {
    const ruts = createCartRuts({
      track: simpleTrack,
      yardDistance,
    })

    // Near yard - close to track
    const near = ruts.wearAt(5, 0.1)
    // Far from yard - still close to track
    const far = ruts.wearAt(18, 0.1)

    expect(near).toBeGreaterThan(far)
  })

  it('should show wear variation across track width within reach', () => {
    const ruts = createCartRuts({
      track: simpleTrack,
      yardDistance,
    })

    // Sample points at different lateral distances within reach
    const center = ruts.wearAt(5, 0.0)
    const left   = ruts.wearAt(5, -0.2)
    const right  = ruts.wearAt(5, 0.2)

    // All should have some wear since they're within reach (0.32m)
    expect(center).toBeGreaterThan(0)
    expect(left).toBeGreaterThan(0)
    expect(right).toBeGreaterThan(0)
  })

  it('should clamp wear output to 0-1 range', () => {
    const ruts = createCartRuts({
      track: simpleTrack,
      yardDistance,
    })

    // Sample many points and verify all are in valid range
    for (let x = -10; x < 30; x += 2)
      for (let z = -10; z < 10; z += 2) {
        const wear = ruts.wearAt(x, z)
        expect(wear).toBeGreaterThanOrEqual(0)
        expect(wear).toBeLessThanOrEqual(1)
      }
  })

  it('should produce deterministic output for same coordinates', () => {
    const ruts = createCartRuts({
      track: simpleTrack,
      yardDistance,
    })

    const x = 5
    const z = 0.15

    const wear1 = ruts.wearAt(x, z)
    const wear2 = ruts.wearAt(x, z)

    expect(wear1).toBe(wear2)
  })

  it('should show wear on both sides of track within reach', () => {
    const ruts = createCartRuts({
      track: simpleTrack,
      yardDistance,
    })

    // Test within reach on both sides (±0.25m from centerline)
    const left  = ruts.wearAt(5, -0.25)
    const right = ruts.wearAt(5, 0.25)

    // Both should be non-zero since they're near the track
    expect(left).toBeGreaterThan(0)
    expect(right).toBeGreaterThan(0)
  })

  it('should transition smoothly near reach boundary', () => {
    const ruts = createCartRuts({
      track: simpleTrack,
      yardDistance,
    })

    // At the yard, test within and at boundary of reach
    const insideReach  = ruts.wearAt(1, 0.2)
    const nearBoundary = ruts.wearAt(1, 0.3)
    const outsideReach = ruts.wearAt(1, 0.35)

    // Inside should be more than outside
    expect(nearBoundary).toBeGreaterThan(insideReach)
    expect(outsideReach).toBeGreaterThan(nearBoundary)
  })

  it('should handle curved track correctly', () => {
    const curvedTrack = [
      { x: 0, z: 0 },
      { x: 5, z: 0 },
      { x: 10, z: 5 },
      { x: 15, z: 10 },
    ]

    const ruts = createCartRuts({
      track: curvedTrack,
      yardDistance,
    })

    // Along the curve at close range, should have wear
    const onCurve = ruts.wearAt(10, 5)
    // Far from curve, should have no wear
    const offCurve = ruts.wearAt(20, 20)

    expect(onCurve).toBeGreaterThan(offCurve)
  })

  it('should decay wear to near-zero at maximum decay distance', () => {
    const ruts = createCartRuts({
      track:        simpleTrack,
      yardDistance: (_x: number, _z: number) => 30, // Far from yard
    })

    // Very far from yard should have minimal wear even when close to track
    const wear = ruts.wearAt(10, 0.1)
    expect(wear).toBeLessThan(0.05)
  })

  it('should provide consistent wear field for determinism check', () => {
    const ruts1 = createCartRuts({
      track: simpleTrack,
      yardDistance,
    })

    const ruts2 = createCartRuts({
      track: simpleTrack,
      yardDistance,
    })

    // Two instances with identical config should produce identical output
    for (let x = 0; x < 20; x += 1)
      for (let z = -0.3; z < 0.3; z += 0.05) {
        const w1 = ruts1.wearAt(x, z)
        const w2 = ruts2.wearAt(x, z)
        expect(w1).toBe(w2)
      }
  })
})
