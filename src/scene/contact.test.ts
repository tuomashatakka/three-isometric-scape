import { describe, expect, test } from 'bun:test'
import { BoxGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial } from 'three'
import {
  CONTACT_CELLS, CONTACT_RADIUS, binOccluders, contactGlsl, contactWindow, gatherOccluders, sphereShade, sphereSun,
} from './contact.ts'
import { SEAT_HEIGHT, seatShade } from './sky-occlusion.ts'


const UP = [ 0, 1, 0 ]

describe('contact shade', () => {
  test('the ground at a stone\'s foot loses sky, and a stride off it keeps nearly all', () => {
    const stone = [ 0, 0.5, 0, 0.5 ]
    const foot  = sphereShade([ 0.6, 0, 0 ], UP, stone)
    const away  = sphereShade([ 3, 0, 0 ], UP, stone)

    expect(foot).toBeLessThan(0.82)
    expect(away).toBeGreaterThan(0.97)
    expect(foot).toBeLessThan(away)
  })

  test('a stone does not shade itself: its own surface and anything turned away keep the sky', () => {
    const stone = [ 0, 0.5, 0, 0.5 ]

    expect(sphereShade([ 0.5, 0.5, 0 ], [ 1, 0, 0 ], stone)).toBe(1)
    expect(sphereShade([ 1.2, 0.5, 0 ], [ 1, 0, 0 ], stone)).toBe(1)
  })

  test('a stone casts a shadow on the ground away from the sun, crisp at its foot and none behind the light', () => {
    const stone = [ 0, 0.5, 0, 0.5 ]
    const sun   = [ Math.SQRT1_2, Math.SQRT1_2, 0 ]

    expect(sphereSun([ -0.5, 0, 0 ], sun, stone)).toBeLessThan(0.1)
    expect(sphereSun([ 1.5, 0, 0 ], sun, stone)).toBe(1)
    expect(sphereSun([ -0.5, 0, 3 ], sun, stone)).toBe(1)
  })

  test('the seat darkens the foot of a wall and nothing that faces the sky or stands clear', () => {
    expect(seatShade(0, 0)).toBeLessThan(0.5)
    expect(seatShade(0, 1)).toBe(1)
    expect(seatShade(SEAT_HEIGHT, 0)).toBe(1)
  })
})

describe('the bins', () => {
  test('the window is snapped to whole cells and covers a frame several view heights deep', () => {
    const a = contactWindow(3.1, -2.2, 10)
    const b = contactWindow(3.1 + a.cell * 0.2, -2.2, 10)

    expect(a).toEqual(b)
    expect(a.cell * CONTACT_CELLS).toBeGreaterThan(30)
  })

  test('a cell holds at most its slots, largest first, and a sphere outside the window is never binned', () => {
    const window = contactWindow(0, 0, 10)
    const near   = [ 0.1, 0.3, 0.1, 0.3, 0.2, 0.6, 0.2, 0.6, 0, 0.4, 0, 0.4 ]
    const far    = [ 400, 0.5, 400, 0.5 ]
    const all    = new Float32Array([ ...near, ...far ])
    const into   = new Float32Array(CONTACT_CELLS * CONTACT_CELLS * 2 * 4)
    const binned = binOccluders(all, window, 2, into)
    const column = Math.floor((0.1 - window.x) / window.cell)
    const row    = Math.floor((0.1 - window.z) / window.cell)
    const at     = (row * CONTACT_CELLS + column) * 2 * 4

    expect(binned).toBe(3)
    expect(into[at + 3]).toBeCloseTo(0.6, 6)
    expect(into[at + 7]).toBeCloseTo(0.4, 6)
    expect(into.some((value, index) => index % 4 === 0 && value === 400)).toBe(false)
  })

  test('binning is a pure function of the spheres and the window', () => {
    const all    = new Float32Array(Array.from({ length: 400 }, (_, i) => [ i * 37 % 23 - 11, 0.4, i * 53 % 19 - 9, 0.2 + i % 7 * 0.1 ]).flat())
    const window = contactWindow(0, 0, 12)
    const a      = new Float32Array(CONTACT_CELLS * CONTACT_CELLS * 4 * 4)
    const b      = new Float32Array(a.length)

    binOccluders(all, window, 4, a)
    binOccluders(all, window, 4, b)

    expect(a).toEqual(b)
  })
})

describe('the candidates', () => {
  test('every placed instance is a sphere, a moving flock and a tuft are not', () => {
    const material = new MeshBasicMaterial()
    const stones   = new InstancedMesh(new BoxGeometry(1, 0.8, 1), material, 2)
    const flock    = new InstancedMesh(new BoxGeometry(1, 1, 1), material, 2)
    const tuft     = new Mesh(new BoxGeometry(0.05, 0.1, 0.05), material)

    stones.setMatrixAt(0, new Matrix4().makeTranslation(2, 0.4, 0))
    stones.setMatrixAt(1, new Matrix4().makeTranslation(-2, 0.4, 0))
    flock.instanceMatrix.setUsage(DynamicDrawUsage)

    const spheres = gatherOccluders([ stones, flock, tuft ])

    expect(spheres.length).toBe(8)
    expect(spheres[0]).toBeCloseTo(2, 6)
    expect(spheres[3]).toBeGreaterThanOrEqual(CONTACT_RADIUS[0])
    expect(spheres[3]).toBeLessThanOrEqual(CONTACT_RADIUS[1])
  })

  test('the sun\'s half compiles only where there is no shadow map', () => {
    expect(contactGlsl(4, true)).toContain('toSun')
    expect(contactGlsl(4, false)).not.toContain('along')
  })
})
