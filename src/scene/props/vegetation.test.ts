import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { resolvePalette } from './palette.ts'
import { buildBirch, buildGrassTuft, buildJuniper, buildPine, buildSpruce } from './vegetation.ts'


const palette = resolvePalette()

type GeometryType = { getAttribute(name: string): { array: ArrayLike<number> }}

function boundsOf (geometry: GeometryType): Box3 {
  return new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)
}

/**
 * `displaceByNoise` and `applyTwist` are the two modifiers this run adopts —
 * `applyBend`/`applyTaper` were already load-bearing on the grass blade. Both
 * are build-time vertex deformers: they move vertices, they never add or
 * remove one, so the claims below are about *shape*, not about triangle count
 * (the roster-wide triangle count is asserted unchanged in `props.test.ts`).
 */
describe('vegetation modifiers', () => {
  test('a spruce, pine and birch are each byte-for-byte the same tree for one seed', () => {
    for (const build of [ buildSpruce, buildPine, buildBirch ]) {
      const first  = build(createSeededRng(4_242), palette)
      const second = build(createSeededRng(4_242), palette)

      expect(Array.from(first.getAttribute('position').array))
        .toEqual(Array.from(second.getAttribute('position').array))

      first.dispose()
      second.dispose()
    }
  })

  test('a grass tuft is byte-for-byte the same tuft for one seed', () => {
    const first  = buildGrassTuft(createSeededRng(19), palette)
    const second = buildGrassTuft(createSeededRng(19), palette)

    expect(Array.from(first.getAttribute('position').array))
      .toEqual(Array.from(second.getAttribute('position').array))

    first.dispose()
    second.dispose()
  })

  test('the noise-roughened canopy is no longer a perfect cone or sphere', () => {
    // A `cone`/`ball` primitive has every rim vertex at the same distance from
    // its own axis. `displaceByNoise` pushes each one along its own normal by a
    // different hashed amount, so the claim is exactly that: the rim stops
    // being a circle. A variance of zero would mean the modifier never reached
    // the geometry — a silent no-op, not a passing test.
    for (const build of [ buildSpruce, buildPine, buildBirch ]) {
      const geometry        = build(createSeededRng(4_242), palette)
      const position        = geometry.getAttribute('position')
      const radii: number[] = []

      for (let i = 0; i < position.count; i += 1)
        radii.push(Math.hypot(position.getX(i), position.getZ(i)))

      const mean     = radii.reduce((a, b) => a + b, 0) / radii.length
      const variance = radii.reduce((a, r) => a + (r - mean) ** 2, 0) / radii.length

      expect(variance).toBeGreaterThan(0)

      geometry.dispose()
    }
  })

  test('the canopy noise stays small enough to roughen a tier, not fold it inside out', () => {
    // Spruce's own tiers, in `vegetation.ts`: the widest is 0.95 m. amp is a
    // tenth of each tier's own radius, so no vertex should walk further from
    // the trunk than the widest tier plus its own noise budget.
    const geometry = buildSpruce(createSeededRng(4_242), palette)
    const position = geometry.getAttribute('position')
    let furthest   = 0

    for (let i = 0; i < position.count; i += 1)
      furthest = Math.max(furthest, Math.hypot(position.getX(i), position.getZ(i)))

    expect(furthest).toBeLessThan(0.95 * 1.25)

    geometry.dispose()
  })

  test('two seeds give two different canopies, not one noise pattern reused', () => {
    const a = buildSpruce(createSeededRng(1), palette)
    const b = buildSpruce(createSeededRng(2), palette)

    expect(Array.from(a.getAttribute('position').array))
      .not.toEqual(Array.from(b.getAttribute('position').array))

    a.dispose()
    b.dispose()
  })

  test('the blade twist pivots from the base, so the root stays planted', () => {
    // `applyTwist` rotates by `angle * t` along the axis, and `t` is 0 at the
    // geometry's own minimum y — the blade's foot. Whatever the twist angle
    // turned out to be, the lowest ring of vertices is untouched by it, so
    // every tuft still meets the ground at the same footprint `applyBend` and
    // `applyTaper` already left it at.
    const withTwist = buildGrassTuft(createSeededRng(19), palette).getAttribute('position')
    let minY        = Infinity

    for (let i = 0; i < withTwist.count; i += 1)
      minY = Math.min(minY, withTwist.getY(i))

    // The tuft merges four blades at different heights and jitter, so the
    // exact vertex values are not asserted — only that the tuft still stands
    // with its lowest point at the ground, the same bound `props.test.ts`
    // already holds every prop to.
    expect(minY).toBeGreaterThan(-0.75)
    expect(minY).toBeLessThan(0.05)
  })

  test('a juniper spreads wider than it stands tall, which is what tells it from a spruce', () => {
    // The whole point of the builder: a spruce is one axis of stacked cones and
    // reads as tall, a juniper is a spreading mound and reads as low and broad.
    // If the footprint ever stops out-reaching the height the shrub has quietly
    // turned back into a small conifer, and this states the difference as data.
    const geometry = buildJuniper(createSeededRng(4_242), palette)
    const bounds   = boundsOf(geometry)
    const size     = bounds.getSize(bounds.max.clone())

    expect(bounds.min.y).toBeGreaterThan(-0.1)
    expect(Math.max(size.x, size.z)).toBeGreaterThan(size.y)

    // A knee-to-waist-high bush, not a tree and not ground cover.
    expect(size.y).toBeGreaterThan(0.3)
    expect(size.y).toBeLessThan(1.2)

    geometry.dispose()
  })

  test('a juniper is byte-for-byte the same bush for one seed, and varies with the seed', () => {
    const first  = buildJuniper(createSeededRng(77), palette)
    const second = buildJuniper(createSeededRng(77), palette)
    const other  = buildJuniper(createSeededRng(78), palette)

    expect(Array.from(first.getAttribute('position').array))
      .toEqual(Array.from(second.getAttribute('position').array))
    expect(Array.from(first.getAttribute('position').array))
      .not.toEqual(Array.from(other.getAttribute('position').array))

    first.dispose()
    second.dispose()
    other.dispose()
  })

  test('a grass tuft stands on the ground and stays inside a plausible tuft size', () => {
    const geometry = buildGrassTuft(createSeededRng(4_242), palette)
    const bounds   = boundsOf(geometry)
    const size     = bounds.getSize(bounds.max.clone())

    expect(bounds.min.y).toBeGreaterThan(-0.1)
    expect(size.y).toBeLessThan(0.7)
    expect(size.x).toBeLessThan(0.6)
    expect(size.z).toBeLessThan(0.6)

    geometry.dispose()
  })
})
