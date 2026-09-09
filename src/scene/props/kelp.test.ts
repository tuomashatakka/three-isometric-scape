import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { KELP_HEIGHT, LEAN, buildKelp } from './kelp.ts'
import { resolvePalette } from './palette.ts'


const palette = resolvePalette()
const seeds   = [ 1, 7, 11, 42, 99, 4_242 ]

/** Where the sea is, in the plant's own units, once the placement has leaned it. */
const SURFACE = KELP_HEIGHT * Math.cos(LEAN)

const geometryOf = (seed: number): Float32Array =>
  buildKelp(createSeededRng(seed), palette).getAttribute('position').array as Float32Array

/**
 * The highest the plant reaches once leaned, in its own units.
 *
 * The placement's rotation, reduced to the one component this file cares about.
 * `landscape/kelp.ts` tips the plant about a horizontal axis square to its trail
 * bearing, which carries a local point to a height of `−x·sin(lean) +
 * y·cos(lean)` — and multiplies the lot by the plant's length, which is why
 * everything here is a fraction rather than a metre.
 */
function leanedTop (seed: number): number {
  const position = geometryOf(seed)

  let top = -Infinity

  for (let vertex = 0; vertex < position.length; vertex += 3)
    top = Math.max(top, -position[vertex] * Math.sin(LEAN) + position[vertex + 1] * Math.cos(LEAN))

  return top
}


describe('the kelp plant', () => {
  test.each(seeds)('seed %i keeps the holdfast on the stone', seed => {
    const bounds = new Box3().setFromArray(geometryOf(seed))

    // Base at `y = 0` like every other prop in the roster, so the placement
    // decides how deep the plant is rather than the geometry assuming a depth.
    expect(bounds.min.y).toBeGreaterThan(-0.05)
  })

  test.each(seeds)('seed %i floats its canopy rather than standing it out of the sea', seed => {
    // The claim the whole system rests on, and the one `--poses kelp` caught two
    // wrong versions of. The plant is built at a unit length and leaned until its
    // head is on the surface; if any weed on it reaches higher than that head,
    // every plant in the archipelago has a frond waving in the air.
    //
    // A couple of centimetres of slack, because the highest weed is meant to
    // *graze* the water — a canopy is awash, not submerged — and because the
    // jitter every part in the roster carries has to have somewhere to go.
    expect(leanedTop(seed)).toBeLessThanOrEqual(SURFACE + 0.03)
  })

  test.each(seeds)('seed %i puts that canopy at the surface rather than under it', seed => {
    // The other half, and without it the test above passes on a plant with no
    // crown at all. A canopy hanging a fifth of the plant's length below the
    // water is the first cut of this geometry — the fronds were hung two thirds
    // of the way up the stipe — and from above it is a bed nobody can see.
    expect(leanedTop(seed)).toBeGreaterThan(SURFACE - 0.08)
  })

  test('the crown is wide enough to read from above', () => {
    const bounds = new Box3().setFromArray(geometryOf(11))
    const size   = bounds.getSize(bounds.max.clone())

    // This scape is seen from overhead and a bed is read through its canopy, so
    // what has to be big is the crown rather than the plant. Under about half the
    // plant's own length across it is an olive dot at every zoom a bed is ever
    // seen at, which is what the five short fronds of the first cut gave.
    expect(Math.min(size.x, size.z)).toBeGreaterThan(KELP_HEIGHT * 0.5)
  })
})
