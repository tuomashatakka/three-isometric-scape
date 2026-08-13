import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { resolvePalette } from './palette.ts'
import { buildHayPole, buildMeadowBarn } from './upland.ts'
import { buildStoneWallRun } from './wall.ts'


const palette = resolvePalette()

type GeometryType = { getAttribute(name: string): { array: ArrayLike<number> }}

function boundsOf (geometry: GeometryType): Box3 {
  return new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)
}

describe('the upland pasture', () => {
  test('the meadow barn stands on its corner stones, doorway on +z', () => {
    const geometry = buildMeadowBarn(createSeededRng(17), palette)
    const bounds   = boundsOf(geometry)

    // Base at the ground, long axis on x, and tall enough to hold a winter's hay.
    expect(bounds.min.y).toBeGreaterThan(-0.3)
    expect(bounds.max.y).toBeGreaterThan(3.5)
    expect(bounds.max.x - bounds.min.x).toBeGreaterThan(bounds.max.z - bounds.min.z)

    // The loading ramp reaches out past the wall on the doorway side only.
    expect(bounds.max.z).toBeGreaterThan(-bounds.min.z + 0.2)

    geometry.dispose()
  })

  test('a hay pole is left standing proud of its hay', () => {
    // The silhouette is the point: the pole has to clear the stack at every
    // scale `dressing.ts` stamps it at, or it reads as a cone of mud.
    for (const seed of [ 1, 2, 3, 5, 8, 13 ]) {
      const geometry = buildHayPole(createSeededRng(seed), palette)
      const bounds   = boundsOf(geometry)
      const size     = bounds.getSize(bounds.max.clone())

      expect(bounds.max.y).toBeGreaterThan(2.1)
      expect(size.x).toBeLessThan(bounds.max.y)

      geometry.dispose()
    }
  })

  test('the wall follows the ground it is built across', () => {
    // A hillside: one metre of rise for every four walked along x.
    const slope = (x: number): number => x * 0.25
    const wall  = buildStoneWallRun({
      points:   [{ x: -6, z: 0 }, { x: 6, z: 0 }],
      heightAt: x => slope(x),
      rng:      createSeededRng(5),
      palette,
    })

    expect(wall).not.toBeNull()

    const bounds = boundsOf(wall!)

    // Rigid segments would put the whole run at one height; a following run
    // spans the three metres between the ends of this slope.
    expect(bounds.max.y - bounds.min.y).toBeGreaterThan(2.6)
    expect(bounds.min.y).toBeLessThan(slope(-6) + 0.4)
    expect(bounds.max.y).toBeGreaterThan(slope(6) + 0.4)

    wall!.dispose()
  })

  test('the wall skips the stations that fall below the waterline', () => {
    const points   = [{ x: -8, z: 0 }, { x: 8, z: 0 }]
    const heightAt = (x: number): number => x

    const whole = buildStoneWallRun({ points, heightAt: x => heightAt(x), rng: createSeededRng(5), palette })
    const dry   = buildStoneWallRun({
      points,
      heightAt:  x => heightAt(x),
      rng:       createSeededRng(5),
      palette,
      minHeight: 0,
    })

    expect(whole).not.toBeNull()
    expect(dry).not.toBeNull()
    expect(boundsOf(dry!).min.y).toBeGreaterThan(-0.3)
    expect(dry!.getAttribute('position').count).toBeLessThan(whole!.getAttribute('position').count)

    whole!.dispose()
    dry!.dispose()
  })

  test('a wall needs a line to follow', () => {
    expect(buildStoneWallRun({
      points:   [{ x: 0, z: 0 }],
      heightAt: () => 0,
      rng:      createSeededRng(5),
      palette,
    })).toBeNull()
  })

  test('every upland prop is byte-for-byte stable per seed', () => {
    for (const build of [ buildMeadowBarn, buildHayPole ]) {
      const first  = build(createSeededRng(808), palette)
      const second = build(createSeededRng(808), palette)

      expect(Array.from(first.getAttribute('position').array))
        .toEqual(Array.from(second.getAttribute('position').array))

      first.dispose()
      second.dispose()
    }

    const options = {
      points:   [{ x: -4, z: -4 }, { x: 4, z: 1 }, { x: 5, z: 6 }],
      heightAt: (x: number, z: number) => Math.sin(x * 0.3) + Math.cos(z * 0.2),
      palette,
    }
    const first  = buildStoneWallRun({ ...options, rng: createSeededRng(808) })
    const second = buildStoneWallRun({ ...options, rng: createSeededRng(808) })

    expect(Array.from(first!.getAttribute('position').array))
      .toEqual(Array.from(second!.getAttribute('position').array))

    first!.dispose()
    second!.dispose()
  })
})
