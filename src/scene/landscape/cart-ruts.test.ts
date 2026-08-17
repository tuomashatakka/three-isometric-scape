import { describe, expect, test } from 'bun:test'
import { BufferAttribute, Color, PlaneGeometry } from 'three'
import type { BufferGeometry } from 'three'
import { mergeGeometryList } from 'threejs-scene/modules/assets'
import { cartRutGeometry } from './cart-ruts.ts'
import type { CartRutsOptions } from './cart-ruts.ts'
import type { Vec2 } from './path.ts'


/** The ribbon's cross-section, kept in step with `ACROSS` in the module. */
const ACROSS = 5

/** How far above the ground the ribbon is laid, in metres. */
const LIFT = 0.05

/** A straight run of track along +z, so a lateral offset is readable off x. */
const STRAIGHT: Vec2[] = [{ x: 0, z: 0 }, { x: 0, z: 40 }]

const GROUND = new Color(0x7d6a4f)
const RUT    = new Color(0x7d6a4f).multiplyScalar(0.58)

function options (over: Partial<CartRutsOptions> = {}): CartRutsOptions {
  return {
    track:     STRAIGHT,
    yard:      { x: 0, z: 0 },
    gauge:     1.45,
    width:     0.34,
    reach:     34,
    wear:      0.62,
    rut:       RUT,
    surfaceAt: (x, z) => Math.sin(x * 0.1) * 0.4 + z * 0.02,
    groundAt:  (_x, _z, target) => target.copy(GROUND),
    ...over,
  }
}

/** One vertex of the ribbon, with where it sits in the cross-section. */
interface Probe {
  x:      number
  y:      number
  z:      number
  color:  Color
  across: number
}

/** Every vertex, tagged with its place in the cross-section. */
function vertices (geometry: BufferGeometry): Probe[] {
  const position = geometry.getAttribute('position') as BufferAttribute
  const color    = geometry.getAttribute('color') as BufferAttribute

  return Array.from({ length: position.count }, (_unused, index) => ({
    x:      position.getX(index),
    y:      position.getY(index),
    z:      position.getZ(index),
    color:  new Color(color.getX(index), color.getY(index), color.getZ(index)),
    across: index % ACROSS,
  }))
}


describe('the ruts worn down the track', () => {
  test('a track nothing drives down is not built at all', () => {
    expect(cartRutGeometry(options({ wear: 0 }))).toBeNull()
    expect(cartRutGeometry(options({ width: 0 }))).toBeNull()
    expect(cartRutGeometry(options({ track: [{ x: 0, z: 0 }]}))).toBeNull()
  })

  test('there are two lines, one either side of the centreline, an axle apart', () => {
    const { gauge, width } = options()
    const centres          = vertices(cartRutGeometry(options())!).filter(v => v.across === 2)

    // The straight track runs along +z, so its normal is along x and a vertex's
    // lateral offset from the centreline is simply its x.
    const left  = centres.filter(v => v.x < 0)
    const right = centres.filter(v => v.x > 0)

    expect(left.length).toBeGreaterThan(0)
    expect(right.length).toBeGreaterThan(0)
    expect(left.length).toBe(right.length)

    // Both lines wander, but neither wanders onto the crown between them or out
    // past the edge of a 3.2 m track.
    for (const centre of centres)
      expect(Math.abs(Math.abs(centre.x) - gauge / 2)).toBeLessThanOrEqual(width * 0.6 + 1e-6)
  })

  test('it lies on the ground it is laid over, not through it', () => {
    const build = options()

    for (const vertex of vertices(cartRutGeometry(build)!))
      expect(vertex.y - build.surfaceAt(vertex.x, vertex.z)).toBeCloseTo(LIFT, 6)
  })

  test('its outer edge is the ground colour, which is what hides the seam', () => {
    for (const vertex of vertices(cartRutGeometry(options())!))
      if (vertex.across === 0 || vertex.across === ACROSS - 1)
        expect(vertex.color.getHex()).toBe(GROUND.getHex())
  })

  test('the wear is darkest in the middle of a rut', () => {
    const rows = vertices(cartRutGeometry(options())!)

    for (let start = 0; start + ACROSS <= rows.length; start += ACROSS) {
      const section  = rows.slice(start, start + ACROSS)
      const darkness = section.map(vertex => GROUND.r - vertex.color.r)

      expect(darkness[2]).toBeGreaterThanOrEqual(darkness[1])
      expect(darkness[2]).toBeGreaterThanOrEqual(darkness[3])
      expect(darkness[1]).toBeGreaterThanOrEqual(darkness[0])
      expect(darkness[3]).toBeGreaterThanOrEqual(darkness[4])
    }
  })

  test('the wear is the yard’s, so it is gone once the yard is out of reach', () => {
    const reach = 12
    const rows  = vertices(cartRutGeometry(options({ reach }))!)

    let worn = 0

    for (const vertex of rows)
      if (Math.hypot(vertex.x, vertex.z) > reach + 1)
        expect(vertex.color.getHex()).toBe(GROUND.getHex())
      else if (vertex.color.getHex() !== GROUND.getHex())
        worn += 1

    // …and it is not gone everywhere, which is the other half of the claim.
    expect(worn).toBeGreaterThan(0)
  })

  test('it faces the sky, so it is lit like the ground beside it', () => {
    const normal = cartRutGeometry(options())!.getAttribute('normal')

    for (let index = 0; index < normal.count; index += 1)
      expect(normal.getY(index)).toBeGreaterThan(0)
  })

  test('the same track wears the same ruts, byte for byte', () => {
    const a = cartRutGeometry(options())!
    const b = cartRutGeometry(options())!

    for (const name of [ 'position', 'uv', 'color', 'normal' ])
      expect(Array.from(a.getAttribute(name).array))
        .toEqual(Array.from(b.getAttribute(name).array))

    expect(Array.from(a.getIndex()!.array)).toEqual(Array.from(b.getIndex()!.array))
  })

  test('it merges into the terrain draw rather than costing one of its own', () => {
    const ruts   = cartRutGeometry(options())!
    const ground = new PlaneGeometry(196, 196, 4, 4)

    ground.rotateX(-Math.PI / 2)
    ground.setAttribute(
      'color',
      new BufferAttribute(new Float32Array(ground.getAttribute('position').count * 3), 3),
    )

    const merged = mergeGeometryList([ ground, ruts ], false)

    expect(merged.getAttribute('position').count)
      .toBe(ground.getAttribute('position').count + ruts.getAttribute('position').count)
  })
})
