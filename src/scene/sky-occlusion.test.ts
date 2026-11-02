import { describe, expect, test } from 'bun:test'
import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry } from 'three'
import { SKY_REACHES, bakeSky, boxMean, collectSolids, createSkyOcclusion, rasterise, settle, skyGrid } from './sky-occlusion.ts'


const grid = skyGrid(64, 64)

/** Flat ground at zero with a 4 m cube standing on it, built through the rasteriser. */
type YardReturnType = { ground: Float32Array; top: Float32Array }

function yard (): YardReturnType {
  const ground = new Float32Array(grid.size * grid.size).fill(-Infinity)
  const sheet  = new PlaneGeometry(64, 64).rotateX(-Math.PI / 2)

  rasterise(grid, sheet, new Matrix4(), { top: ground })

  const top = ground.slice()

  rasterise(grid, new BoxGeometry(4, 4, 4).translate(0, 2, 0), new Matrix4(), { top })

  return { ground, top }
}

const texel = (column: number, row: number): number => row * grid.size + column

describe('sky occlusion', () => {
  test('the rasteriser lays a plane over every texel and a box only over its footprint', () => {
    const { ground, top } = yard()

    expect(ground.every(height => Math.abs(height) < 1e-5)).toBe(true)
    expect(top[texel(32, 32)]).toBeCloseTo(4, 5)
    expect(top[texel(10, 10)]).toBeCloseTo(0, 5)
  })

  test('the ground at a wall foot is shaded, open ground is not, and a roof sees the whole sky', () => {
    const { ground, top } = yard()
    const { data }        = bakeSky(grid, ground, top)
    const red             = (column: number, row: number): number => data[texel(column, row) * 4]
    const green           = (column: number, row: number): number => data[texel(column, row) * 4 + 1]

    // A texel out from the wall's face is dark; twenty metres out is open sky.
    expect(red(35, 32)).toBeLessThan(170)
    expect(red(52, 32)).toBe(255)
    expect(green(52, 32)).toBe(255)

    // Darkest at the foot, lifting with distance.
    expect(red(35, 32)).toBeLessThan(red(38, 32))
    expect(red(38, 32)).toBeLessThan(red(44, 32))

    // The roof's centre stands above everything round it.
    expect(green(32, 32)).toBe(255)
  })

  test('a thin thing counts by the ground it covers, not as a column a texel wide', () => {
    const ground = new Float32Array(grid.size * grid.size)
    const cells  = ground.length
    const into   = { top: ground.slice(), cover: { area: new Float32Array(cells), volume: new Float32Array(cells) }}
    const blade  = new BoxGeometry(0.1, 0.5, 0.1).translate(0, 0.25, 0)

    // A blade in one texel; a crown filling most of another, built of small faces.
    rasterise(grid, blade, new Matrix4().makeTranslation(-20.5, 0, -20.5), into)

    for (const [ dx, dz ] of [[ 0, 0 ], [ 0.45, 0 ], [ 0, 0.45 ], [ 0.45, 0.45 ]])
      rasterise(grid, new BoxGeometry(0.45, 2, 0.45).translate(0, 1, 0), new Matrix4().makeTranslation(10.3 + dx, 0, 10.3 + dz), into)

    settle(ground, into)

    expect(into.top[texel(11, 11)]).toBeLessThan(0.05)
    expect(into.top[texel(42, 42)]).toBeGreaterThan(1.5)
  })

  test('the bake is a pure function of the heights', () => {
    const one = yard()
    const two = yard()

    expect(bakeSky(grid, one.ground, one.top).data).toEqual(bakeSky(grid, two.ground, two.top).data)
  })

  test('the box mean is the plain mean inside the grid', () => {
    const size   = 16
    const source = Float32Array.from({ length: size * size }, (_, cell) => cell % 7)
    const out    = new Float32Array(size * size)
    const reach  = 2
    let expected  = 0

    boxMean(source, size, reach, new Float32Array(size * size), out)

    for (let row = 6; row <= 10; row += 1)
      for (let column = 6; column <= 10; column += 1)
        expected += source[row * size + column]

    expect(out[8 * size + 8]).toBeCloseTo(expected / 25, 5)
    expect(SKY_REACHES.length).toBe(3)
  })

  test('a scattered family is rasterised once, however many tiles share it, and glass is not solid', () => {
    const solid  = new MeshStandardMaterial()
    const stone  = new BoxGeometry(1, 1, 1)
    const whole  = new InstancedMesh(stone, solid, 9)
    const tile   = new InstancedMesh(stone, solid, 3)
    const other  = new InstancedMesh(new BoxGeometry(1, 1, 1), solid, 2)
    const window = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
    const root   = new Group()

    whole.name = 'erratic'
    tile.name  = 'erratic'
    other.name = 'erratic'
    root.add(whole, tile, other, window)

    const found = collectSolids([ root ], material => material === solid)

    expect(found).toHaveLength(2)
    expect(found).toContain(whole)
    expect(found).toContain(other)
  })

  test('until it bakes, everything sees the whole sky', () => {
    const occlusion = createSkyOcclusion()
    const map       = occlusion.uniforms.uSkyMap.value as { image: { data: Uint8Array }}

    expect([ ...map.image.data.slice(0, 2) ]).toEqual([ 255, 255 ])
    occlusion.dispose()
  })
})
