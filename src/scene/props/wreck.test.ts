import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { WRECK_BEARING, WRECK_FOOTING } from '../landscape/wreck.ts'
import { resolvePalette } from './palette.ts'
import { HALF_LENGTH, WRECK_SINK, buildWreck } from './wreck.ts'


const palette = resolvePalette()

/** One hull, and her vertices, so a test can measure and then dispose her. */
type VerticesReturnType = { geometry: ReturnType<typeof buildWreck>, positions: Float32Array }

function vertices (seed: number): VerticesReturnType {
  const geometry = buildWreck(createSeededRng(seed), palette)

  return { geometry, positions: geometry.getAttribute('position').array as Float32Array }
}

describe('the wreck', () => {
  // The roster test already states that every prop is deterministic, based at
  // zero and vertex-coloured. What is here is the three claims this one makes
  // that no generic test can: that her footing is honest, that the heel is real
  // and lands her on the ground rather than through it, and that the sea has
  // taken the side of her it is supposed to have taken.

  test('the whole hull fits inside the footing the survey reserves', () => {
    // The number `dressing.ts` reserves against the scatter. A frame or a fallen
    // timber reaching past it is a pine seeded through her ribs.
    for (const seed of [ 3, 11, 4_242 ]) {
      const { geometry, positions } = vertices(seed)

      for (let index = 0; index < positions.length; index += 3)
        expect(Math.hypot(positions[index], positions[index + 2]))
          .toBeLessThanOrEqual(WRECK_FOOTING)

      geometry.dispose()
    }
  })

  test('she overhangs the rock she is sited on', () => {
    // Most of what a wreck looks like, as a fact about the data: the hull is
    // longer than the length of her the ledge is asked to carry. If these ever
    // met, the survey would be siting a boat that fits and the drawing would be
    // of a boat that was parked.
    const { geometry, positions } = vertices(11)
    const bounds                  = new Box3().setFromArray(positions)

    expect(bounds.max.x).toBeGreaterThan(WRECK_BEARING)
    expect(bounds.min.x).toBeLessThan(-WRECK_BEARING)

    geometry.dispose()
  })

  test('she stands on the ground the heel left her on', () => {
    // The one builder here whose base is not known until the roll is applied.
    // Zero to within a float, and nothing under it — a hull whose bilge came out
    // below zero would be bedded by `WRECK_SINK` plus however much the heel
    // happened to cost.
    for (const seed of [ 3, 11, 4_242 ]) {
      const { geometry, positions } = vertices(seed)
      const bounds                  = new Box3().setFromArray(positions)

      expect(bounds.min.y).toBeCloseTo(0, 5)
      expect(bounds.max.y).toBeGreaterThan(WRECK_SINK * 2)

      geometry.dispose()
    }
  })

  test('she is lying over, not standing up', () => {
    // The heel, stated where it can be measured. A hull drawn upright is
    // symmetric about her own centreline; one on her bilge is rolled into the
    // side she fell on, so she reaches further that way than she does to the
    // side in the air — and the highest thing amidships is off the centreline
    // rather than over it.
    const { geometry, positions } = vertices(11)
    const bounds                  = new Box3().setFromArray(positions)
    let crest                     = { y: 0, z: 0 }

    for (let index = 0; index < positions.length; index += 3)
      if (Math.abs(positions[index]) < HALF_LENGTH * 0.7 && positions[index + 1] > crest.y)
        crest = { y: positions[index + 1], z: positions[index + 2] }

    expect(bounds.max.z).toBeGreaterThan(Math.abs(bounds.min.z))
    expect(crest.z).toBeLessThan(-0.1)

    geometry.dispose()
  })

  test('the ribs are on the side that is out of the water', () => {
    // The other half of what makes her read as a wreck rather than as a pontoon.
    // The side in the water is stubs holding the last strakes on and the side in
    // the air is the whole silhouette, so amidships they reach nothing like the
    // same height. The first cut of this builder had the two the other way round
    // and photographed as a jetty — every other test here passed.
    const { geometry, positions } = vertices(11)
    let standing = 0
    let bedded   = 0

    for (let index = 0; index < positions.length; index += 3) {
      if (Math.abs(positions[index]) > HALF_LENGTH * 0.7)
        continue

      if (positions[index + 2] < -0.1)
        standing = Math.max(standing, positions[index + 1])
      if (positions[index + 2] > 0.6)
        bedded = Math.max(bedded, positions[index + 1])
    }

    expect(bedded).toBeGreaterThan(0)
    expect(standing).toBeGreaterThan(bedded * 2)

    geometry.dispose()
  })

  test('the heel is the same heel every time', () => {
    // Determinism at the level that matters for a captured frame: the bounds she
    // is dropped onto the ground by are a measured quantity, so two builds at
    // one seed have to land on the same millimetre.
    const first  = new Box3().setFromArray(vertices(4_242).positions)
    const second = new Box3().setFromArray(vertices(4_242).positions)

    expect(first.min.toArray()).toEqual(second.min.toArray())
    expect(first.max.toArray()).toEqual(second.max.toArray())
  })
})
