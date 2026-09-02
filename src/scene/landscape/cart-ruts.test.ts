import { describe, expect, test } from 'bun:test'
import { BufferAttribute, Color, PlaneGeometry } from 'three'
import type { BufferGeometry } from 'three'
import { smoothstep } from 'threejs-scene'
import { mergeGeometryList } from 'threejs-scene/modules/assets'
import { SCAPE_CONFIG } from '../config.ts'
import { cartRutGeometry, trafficAt } from './cart-ruts.ts'
import type { CartRutsOptions } from './cart-ruts.ts'
import type { Footpaths } from './footpath.ts'
import { createHeightField } from './height.ts'
import { createScapeLayout, distanceToTrack } from './layout.ts'
import type { Vec2 } from './path.ts'
import { createTerrainPainter } from './terrain.ts'
import type { TerrainPainter } from './terrain.ts'


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


describe('the traffic the wear is measured in', () => {
  test('holds full over the stretch the traffic has not thinned on', () => {
    expect(trafficAt(0, 40)).toBeCloseTo(1, 6)
    expect(trafficAt(40 * 0.4, 40)).toBeCloseTo(1, 6)
  })

  test('is gone by the reach, and stays gone past it', () => {
    expect(trafficAt(40, 40)).toBeCloseTo(0, 6)
    expect(trafficAt(400, 40)).toBeCloseTo(0, 6)
  })

  test('only ever thins with distance', () => {
    const walk = Array.from({ length: 60 }, (_unused, step) => trafficAt(step, 40))

    for (let step = 1; step < walk.length; step += 1)
      expect(walk[step]).toBeLessThanOrEqual(walk[step - 1])
  })
})

describe('the dirt the ruts run in', () => {
  const layout           = createScapeLayout(SCAPE_CONFIG)
  const paths: Footpaths = { paths: [], wearAt: () => 0 }
  const field            = createHeightField(SCAPE_CONFIG, layout)

  // The same scape twice, once with the traffic taken off it. Everything the
  // painter does apart from the soiling is identical between the two, so the
  // difference between them *is* the soiling and nothing else.
  const clean = createTerrainPainter(
    { ...SCAPE_CONFIG, cartRuts: { ...SCAPE_CONFIG.cartRuts, wear: 0 }},
    layout,
    paths,
    field,
  )
  const worn = createTerrainPainter(SCAPE_CONFIG, layout, paths, field)

  const lit = (color: Color): number => (color.r + color.g + color.b) / 3

  /**
   * The share of the ground's light the soiling takes at a point.
   *
   * A ratio rather than a difference, because `paint` ends on a macro noise
   * multiply that varies metre to metre. It divides straight back out of a
   * ratio, and would otherwise swamp a sweep across a two-metre corridor.
   */
  function shareUnder (painter: TerrainPainter, x: number, z: number): number {
    const base  = clean.paint(6, 0, x, z, new Color())
    const dirty = painter.paint(6, 0, x, z, new Color())

    return 1 - lit(dirty) / lit(base)
  }

  const soilShare = (x: number, z: number): number => shareUnder(worn, x, z)

  /** The track segment whose middle is nearest the yard, and the way across it. */
  function stretch (pick: 'near' | 'far') {
    const points = layout.track.points
    let best     = null as null | { x: number, z: number, nx: number, nz: number, from: number }

    for (let index = 0; index < points.length - 1; index += 1) {
      const a      = points[index]
      const b      = points[index + 1]
      const length = Math.hypot(b.x - a.x, b.z - a.z)

      if (length === 0)
        continue

      const x    = (a.x + b.x) / 2
      const z    = (a.z + b.z) / 2
      const from = Math.hypot(x - layout.yard.x, z - layout.yard.z)

      // Clear of the farmyard disc, which is bare for its own reasons.
      if (from < layout.yard.radius * 1.2)
        continue

      const closer = pick === 'near' ? from < (best?.from ?? Infinity) : from > (best?.from ?? -1)

      if (closer)
        best = { x, z, nx: -(b.z - a.z) / length, nz: (b.x - a.x) / length, from }
    }

    if (!best)
      throw new Error('no track stretch clear of the yard')

    return best
  }

  const near = stretch('near')
  const far  = stretch('far')

  test('dirties the road where the traffic is', () => {
    expect(soilShare(near.x, near.z)).toBeGreaterThan(0.02)
  })

  test('leaves the ground either side of the road alone', () => {
    const off = layout.track.width * 4

    expect(soilShare(near.x + near.nx * off, near.z + near.nz * off)).toBeCloseTo(0, 6)
  })

  test('is the yard’s, so pulling the reach in takes it off the far end', () => {
    // Held against one point rather than compared between two, because the
    // share depends on the ground under it as much as on the traffic over it —
    // the far end of the track is lighter ground, and a lighter ground shows
    // the same dirt harder. Same place, shorter reach, is the only comparison
    // that isolates the falloff.
    const pulled = createTerrainPainter(
      { ...SCAPE_CONFIG, cartRuts: { ...SCAPE_CONFIG.cartRuts, reach: far.from * 0.5 }},
      layout,
      paths,
      field,
    )

    expect(soilShare(far.x, far.z)).toBeGreaterThan(0.02)
    expect(shareUnder(pulled, far.x, far.z)).toBeCloseTo(0, 6)
  })

  test('reaches further than the track it dirties, as the scape is tuned', () => {
    // Worth pinning: no stretch of the road gets more than about 26 m from the
    // gate against a 40 m reach, so the fade is still running when the road
    // runs out and nothing on it is ever fully clean. Drop `reach` under this
    // and the far end of the track starts coming back to its own colour.
    expect(far.from).toBeLessThan(SCAPE_CONFIG.cartRuts.reach)
  })

  test('sits on the crown of the road and falls off faster than the road does', () => {
    // Squared against `onTrack`, so half way out to the verge keeps a quarter of
    // the dirt rather than half of it. A linear falloff passes the first of
    // these and not the second, which is the whole reason for the squaring.
    const peak  = soilShare(near.x, near.z)
    const sweep = Array.from({ length: 24 }, (_unused, step) => {
      const off = (step + 1) * (layout.track.width * 1.5) / 24

      return soilShare(near.x + near.nx * off, near.z + near.nz * off)
    })

    for (const share of sweep)
      expect(share).toBeLessThan(peak)

    // Half way out by *corridor weight* rather than by metres — the road's own
    // falloff is a smoothstep, so half the width is nowhere near half the road.
    const off     = layout.track.width * 0.96
    const probeX  = near.x + near.nx * off
    const probeZ  = near.z + near.nz * off
    const onTrack = 1 - smoothstep(
      layout.track.width * 0.42,
      layout.track.width * 1.5,
      distanceToTrack(layout, probeX, probeZ),
    )

    expect(onTrack).toBeGreaterThan(0.35)
    expect(onTrack).toBeLessThan(0.65)

    // A quarter of the dirt where the road keeps half its own colour. A linear
    // falloff lands on `onTrack` here instead, at twice this — which is the
    // whole reason for the squaring, and the only thing this test is for.
    const share = soilShare(probeX, probeZ) / peak

    expect(share).toBeGreaterThan(onTrack * onTrack * 0.85)
    expect(share).toBeLessThan(onTrack * onTrack * 1.15)
  })
})
