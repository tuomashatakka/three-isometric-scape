import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { SCAPE_CONFIG } from '../config.ts'
import { buildProp, resolvePalette } from './index.ts'
import {
  MILL_HUB_HEIGHT,
  MILL_HUB_REACH,
  MILL_SINK,
  buildMillSails,
} from './mill.ts'


const palette = resolvePalette()

type GeometryType = { getAttribute(name: string): { array: ArrayLike<number> }}

function boundsOf (geometry: GeometryType): Box3 {
  return new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)
}

describe('the windmill', () => {
  test('the windshaft reaches the hub the wheel hangs on', () => {
    const mill   = buildProp('windmill', createSeededRng(7_319), palette)
    const bounds = boundsOf(mill)

    // Not "there is timber somewhere near the front" — the shaft has to come out
    // to where a separate module is going to hang a wheel, and the two agree on
    // one constant or the wheel floats off the end of it.
    expect(bounds.max.z).toBeGreaterThan(MILL_HUB_REACH - 0.1)
    expect(bounds.max.y).toBeGreaterThan(MILL_HUB_HEIGHT)

    mill.dispose()
  })

  test('the tail stair reaches the ground behind the post', () => {
    const mill   = buildProp('windmill', createSeededRng(7_319), palette)
    const bounds = boundsOf(mill)

    // Buried rather than resting: the mill is set into a hill, and the foot of
    // the stair is the piece furthest from where that was measured.
    expect(bounds.min.y).toBeLessThan(0)
    expect(bounds.min.z).toBeLessThan(-4)

    mill.dispose()
  })
})

describe('the sail wheel', () => {
  const span  = SCAPE_CONFIG.mill.sailSpan
  const wheel = buildMillSails(createSeededRng(7_319), palette, span)

  test('is centred on its own hub', () => {
    const bounds = boundsOf(wheel)

    // The instance matrix puts the hub at the end of the shaft, so anything the
    // geometry is off its own origin by is the wheel hanging crooked.
    expect(Math.abs(bounds.min.x + bounds.max.x)).toBeLessThan(0.2)
    expect(Math.abs(bounds.min.y + bounds.max.y)).toBeLessThan(0.2)
  })

  test('spans what the config asked for', () => {
    const bounds = boundsOf(wheel)
    const size   = bounds.getSize(bounds.max.clone())

    expect(size.x).toBeGreaterThan(span * 0.95)
    expect(size.x).toBeLessThan(span * 1.05)
    expect(size.y).toBeGreaterThan(span * 0.95)

    // Flat: it turns in a plane, and a wheel with depth would foul the gable.
    expect(size.z).toBeLessThan(1)
  })

  test('no sail tip reaches the ground it turns over', () => {
    // The claim the hub height and the span exist to keep. A wheel whose tips
    // dig in is not a slower mill, it is a mill standing in a trench.
    const lowest = MILL_HUB_HEIGHT - MILL_SINK - span / 2

    expect(lowest).toBeGreaterThan(0.5)
  })

  test('is deterministic for one seed', () => {
    const again = buildMillSails(createSeededRng(7_319), palette, span)

    expect(Array.from(again.getAttribute('position').array))
      .toEqual(Array.from(wheel.getAttribute('position').array))
    expect(Array.from(again.getAttribute('color').array))
      .toEqual(Array.from(wheel.getAttribute('color').array))

    again.dispose()
  })

  test('scales with the span it is given', () => {
    const wide = buildMillSails(createSeededRng(7_319), palette, span * 1.5)

    expect(boundsOf(wide).max.x).toBeGreaterThan(boundsOf(wheel).max.x)
    wide.dispose()
  })
})
