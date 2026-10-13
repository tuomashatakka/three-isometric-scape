import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { SCAPE_CONFIG } from '../config.ts'
import { CARTER_HEIGHT, CART_GAUGE, CART_TYRE, CART_WHEEL, buildCarter } from './carter.ts'
import { resolvePalette } from './palette.ts'


const palette = resolvePalette()

function geometryOf (seed = 17) {
  return buildCarter(createSeededRng(seed), palette)
}

function boundsOf (seed = 17): Box3 {
  const geometry = geometryOf(seed)
  const bounds   = new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)

  geometry.dispose()

  return bounds
}

/**
 * The claim, as a fact about the data. The ruts down the cart track are cut at
 * `cartRuts.gauge`, and the thing that made them has to run in them — at close
 * zoom, with the cart standing on its own ruts, a gauge that disagrees reads
 * immediately as two different vehicles.
 */
describe('the cart on the road', () => {
  test('its wheels run in the ruts the track already carries', () => {
    expect(SCAPE_CONFIG.cartRuts.gauge).toBe(CART_GAUGE)

    const bounds = boundsOf()

    expect(bounds.max.x).toBeCloseTo(CART_GAUGE / 2 + CART_TYRE, 5)
    expect(bounds.min.x).toBeCloseTo(-(CART_GAUGE / 2 + CART_TYRE), 5)
  })

  test('it stands on the ground at the tyres and at the boots alike', () => {
    const bounds = boundsOf()

    // Within a centimetre rather than exactly, and the centimetre is the
    // trailing boot: the leg is a cylinder tipped about its own middle, so the
    // heel of it swings a few millimetres under the sole. Anything larger than
    // this is a cart floating or a carter buried, and both read from above.
    expect(bounds.min.y).toBeGreaterThan(-0.01)
    expect(bounds.min.y).toBeLessThan(0.01)
  })

  test('the carter is a person-sized thing on top of a cart-sized one', () => {
    const bounds = boundsOf()

    expect(bounds.max.y).toBeCloseTo(CARTER_HEIGHT, 5)
    expect(CARTER_HEIGHT).toBeGreaterThan(CART_WHEEL * 2)
  })

  test('the pair faces +z, so a yaw along the road points it down the road', () => {
    const bounds = boundsOf()

    // The shafts and the person in them are ahead of the axle; the tailboard is
    // behind it. A cart modelled the other way round is one that arrives at the
    // shore backwards on every island.
    expect(bounds.max.z).toBeGreaterThan(Math.abs(bounds.min.z))
  })

  test('it is deterministic for one seed and varies with another', () => {
    const first  = geometryOf(99)
    const second = geometryOf(99)
    const other  = geometryOf(100)

    expect(Array.from(first.getAttribute('color').array))
      .toEqual(Array.from(second.getAttribute('color').array))
    expect(Array.from(first.getAttribute('position').array))
      .toEqual(Array.from(second.getAttribute('position').array))
    expect(Array.from(other.getAttribute('color').array))
      .not.toEqual(Array.from(first.getAttribute('color').array))

    first.dispose()
    second.dispose()
    other.dispose()
  })
})
