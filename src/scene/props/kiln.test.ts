import { describe, expect, test } from 'bun:test'
import { Box3, Vector3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { KILN_FOOTING, KILN_SILL } from '../landscape/kiln.ts'
import { KILN_MOUTH, buildKiln } from './kiln.ts'
import { resolvePalette } from './palette.ts'


const palette = resolvePalette()

function kiln (seed = 77) {
  return buildKiln(createSeededRng(seed), palette)
}

function bounds (seed = 77): Box3 {
  const geometry = kiln(seed)

  return new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)
}


describe('the lime kiln', () => {
  test('it is one geometry, vertex-coloured, and finite everywhere', () => {
    const geometry = kiln()
    const position = geometry.getAttribute('position').array as Float32Array

    expect(geometry.index).toBeNull()
    for (const attribute of [ 'position', 'normal', 'uv', 'color' ])
      expect(geometry.getAttribute(attribute)).toBeDefined()

    for (const value of position)
      expect(Number.isFinite(value)).toBe(true)
  })

  test('it stands on its own draw sill, with nothing under the ground', () => {
    // The base is the arch rather than the axis, because the dressing sets this
    // building down at the low end of its site. A handspan under zero is the
    // apron's own jitter; anything deeper is stone buried in the ground it is
    // supposed to be standing on.
    const box = bounds()

    expect(box.min.y).toBeGreaterThan(-0.15)
    expect(box.max.y).toBeGreaterThan(3.4)
  })

  test('the rim is above the stonework it is published as the mouth of', () => {
    const box = bounds()

    // Clear of the charging ring, so the smoke leaves the throat rather than
    // the blocks round it, and under the rail on the stage — the plume comes out
    // of the kiln, not out of the handrail somebody holds while charging it.
    expect(KILN_MOUTH.y).toBeGreaterThan(3.7)
    expect(KILN_MOUTH.y).toBeLessThan(box.max.y)
    expect(KILN_MOUTH.x).toBe(0)
    expect(KILN_MOUTH.z).toBe(0)
  })

  test('the footing holds everything the kiln actually reaches over', () => {
    // The claim `KILN_FOOTING` makes, as a fact about the geometry rather than
    // as a number somebody remembered to update: nothing is built inside this
    // radius of the axis, and the lime heap is what gets closest to breaking it.
    const position = kiln().getAttribute('position').array as Float32Array
    let furthest   = 0

    for (let i = 0; i < position.length; i += 3)
      furthest = Math.max(furthest, Math.hypot(position[i], position[i + 2]))

    expect(furthest).toBeLessThanOrEqual(KILN_FOOTING)
    expect(furthest).toBeGreaterThan(KILN_FOOTING - 0.5)
  })

  test('the drum is built to the radius the siting measures it by', () => {
    // `KILN_SILL` is the one length the search and the geometry both have to
    // agree about: the fall is measured across it, the freeboard is asked at it,
    // and the dressing stands the building on the ground under it. The drum's
    // widest course is its foot, so the geometry's answer is readable straight
    // off the bounds at the base.
    // Read off the back of the drum at the base, on the middle of the face:
    // the front is where the apron runs out to and the flanks are where the
    // revetment wings do, and neither of those is the drum.
    const position = kiln().getAttribute('position').array as Float32Array
    let back       = 0

    for (let i = 0; i < position.length; i += 3)
      if (Math.abs(position[i]) < 0.1 && position[i + 1] < 0.3 && position[i + 2] < 0)
        back = Math.max(back, -position[i + 2])

    expect(back).toBeGreaterThan(KILN_SILL - 0.25)
    expect(back).toBeLessThan(KILN_SILL + 0.25)
  })

  test('the draw arch is an opening in the downhill face', () => {
    // A kiln with its mouth on the wrong side is a kiln cut into the hill, and
    // from the default pose that looks like a drum with no arch at all. The
    // soot in the recess is the darkest thing in the build, so finding where the
    // darkest vertices sit finds the mouth.
    const geometry = kiln()
    const position = geometry.getAttribute('position').array as Float32Array
    const color    = geometry.getAttribute('color').array as Float32Array
    const mouth    = new Vector3()
    let found      = 0

    for (let i = 0; i < color.length; i += 3) {
      const luma = color[i] + color[i + 1] + color[i + 2]

      // The front of the drum only, under the springing of the arch: the throat
      // at the rim and the peat stacked out to one side are the same soot and
      // the same dark, and neither of them is the mouth.
      if (luma > 0.5 || Math.abs(position[i]) > 1 || position[i + 1] > 2)
        continue

      mouth.x += position[i]
      mouth.y += position[i + 1]
      mouth.z += position[i + 2]
      found   += 1
    }

    expect(found).toBeGreaterThan(0)
    mouth.divideScalar(found)

    expect(mouth.z).toBeGreaterThan(0)
    expect(Math.abs(mouth.x)).toBeLessThan(0.5)
  })

  test('it is byte-for-byte stable for one seed and varies with another', () => {
    const first  = kiln(5).getAttribute('position').array
    const second = kiln(5).getAttribute('position').array
    const other  = kiln(6).getAttribute('position').array

    expect(Array.from(first)).toEqual(Array.from(second))
    expect(Array.from(first)).not.toEqual(Array.from(other))
  })
})
