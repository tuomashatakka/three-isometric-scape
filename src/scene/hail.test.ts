import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from './config.ts'
import {
  hailCellRadius,
  hailCellTravel,
  hailColumnAxis,
  hailColumnSlack,
  hailColumnSpan,
  hailLead,
} from './hail.ts'
import { HAIL_CENTRE, HAIL_WIDTH } from './weather.ts'


describe('hailLead', () => {
  test('is nowhere at the peak, upwind before it and downwind after', () => {
    expect(hailLead(HAIL_CENTRE)).toBeCloseTo(0, 9)
    expect(hailLead(HAIL_CENTRE - HAIL_WIDTH)).toBeCloseTo(-1, 9)
    expect(hailLead(HAIL_CENTRE + HAIL_WIDTH)).toBeCloseTo(1, 9)
  })

  test('clamps rather than running the cell off across the dry half of the cycle', () => {
    expect(hailLead(HAIL_CENTRE + 0.4)).toBe(1)
    expect(hailLead(HAIL_CENTRE - 0.4)).toBe(-1)
  })

  test('crosses in one direction over the pulse, without a jump in it', () => {
    let last = -1

    for (let step = 0; step <= 60; step += 1) {
      const phase = HAIL_CENTRE - HAIL_WIDTH + step / 60 * HAIL_WIDTH * 2
      const lead  = hailLead(phase)

      expect(lead).toBeGreaterThanOrEqual(last)
      expect(lead - last).toBeLessThanOrEqual(0.1)
      last = lead
    }
  })

  test('wraps, so a clock that has been running is a clock at a phase', () => {
    expect(hailLead(HAIL_CENTRE + 3)).toBeCloseTo(hailLead(HAIL_CENTRE), 9)
    expect(hailLead(HAIL_CENTRE - 2 + HAIL_WIDTH)).toBeCloseTo(1, 9)
  })
})

describe('hailCellRadius', () => {
  test('is world-sized: a world that doubles carries a cell that doubles', () => {
    const share = SCAPE_CONFIG.weather.hailCell

    expect(hailCellRadius(3_040, share) / hailCellRadius(1_520, share)).toBeCloseTo(2, 9)
  })

  test('is half the authored width, so the knob reads as a width', () => {
    expect(hailCellRadius(1_000, 0.2)).toBeCloseTo(100, 9)
  })

  test('is a cell rather than the whole archipelago at the authored share', () => {
    const radius = hailCellRadius(SCAPE_CONFIG.archipelago.worldSize, SCAPE_CONFIG.weather.hailCell)

    // The claim the edge exists for: a shower you can stand outside. A cell
    // wider than the world has no edge in any frame and is simply white weather.
    expect(radius * 2).toBeLessThan(SCAPE_CONFIG.archipelago.worldSize * 0.5)
    expect(radius).toBeGreaterThan(SCAPE_CONFIG.camera.minViewSize)
  })

  test('never collapses on a world or a share of nothing', () => {
    expect(hailCellRadius(0, 0.2)).toBeGreaterThan(0)
    expect(hailCellRadius(1_520, 0)).toBeGreaterThan(0)
  })
})

describe('the column over the cell', () => {
  const radius = hailCellRadius(SCAPE_CONFIG.archipelago.worldSize, SCAPE_CONFIG.weather.hailCell)

  test('is never wider than the cell it is dealt into', () => {
    // The claim the whole clamp exists for: the first build laid a column 1 456 m
    // across over a 334 m cell and the mask threw away nineteen stones in twenty.
    for (const viewSize of [ 8, 60, 260, 520, 1_400, 1_600 ])
      expect(hailColumnSpan(viewSize, radius)).toBeLessThanOrEqual(radius * 2 + 1e-9)
  })

  test('is never wider than the frame it is seen in either', () => {
    for (const viewSize of [ 8, 60, 260, 520, 1_400 ])
      expect(hailColumnSpan(viewSize, radius)).toBeLessThanOrEqual(viewSize * 2.8)
  })

  test('sits on the cell once the cell is the smaller of the two', () => {
    const slack = hailColumnSlack(1_400, radius)

    expect(slack).toBe(0)
    expect(hailColumnAxis(600, 40, slack)).toBe(40)
  })

  test('follows the camera inside a cell wider than the frame', () => {
    const slack = hailColumnSlack(20, radius)

    expect(slack).toBeGreaterThan(0)
    expect(hailColumnAxis(40, 0, slack)).toBe(40)
  })

  test('never lets the column leave the cell, however far the camera is', () => {
    for (const viewSize of [ 8, 60, 260, 520, 1_400 ]) {
      const slack = hailColumnSlack(viewSize, radius)
      const at    = hailColumnAxis(10_000, 0, slack)

      expect(Math.abs(at) + hailColumnSpan(viewSize, radius) * 0.5)
        .toBeLessThanOrEqual(radius + 1e-9)
    }
  })

  test('crosses the cell without a jump at the zoom the clamp changes hands', () => {
    const over  = radius * 2 / 1.7
    const steps = [ over * 0.9, over * 0.99, over, over * 1.01, over * 1.1 ]
    const spans = steps.map(viewSize => hailColumnSpan(viewSize, radius))

    for (let step = 1; step < spans.length; step += 1)
      expect(Math.abs(spans[step] - spans[step - 1])).toBeLessThan(radius * 0.2)
  })
})

describe('hailCellTravel', () => {
  test('carries the cell further than its own width over one pulse', () => {
    const radius = hailCellRadius(SCAPE_CONFIG.archipelago.worldSize, SCAPE_CONFIG.weather.hailCell)

    // A shower that moves less than its own width has not crossed anything, and
    // the pair of poses that says the cell travels would be one picture twice.
    expect(hailCellTravel(radius)).toBeGreaterThan(radius * 2)
  })
})
