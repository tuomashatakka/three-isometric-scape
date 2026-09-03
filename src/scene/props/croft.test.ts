import { describe, expect, test } from 'bun:test'
import { Box3, Vector3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { CROFT_FOOTING } from '../landscape/croft.ts'
import { CROFT_VENT, CROFT_WINDOWS, buildCroft } from './croft.ts'
import { resolvePalette } from './palette.ts'


const palette = resolvePalette()

/** One croft, and its vertices, so a test can measure and then dispose it. */
interface BuiltCroft {
  geometry:  ReturnType<typeof buildCroft>
  positions: Float32Array
}

function vertices (seed: number): BuiltCroft {
  const geometry = buildCroft(createSeededRng(seed), palette)

  return { geometry, positions: geometry.getAttribute('position').array as Float32Array }
}

describe('the croft', () => {
  // The roster test already states that every prop is deterministic, based at
  // zero and vertex-coloured. What is here is the three claims this building
  // makes that no generic test can: that its footing is honest, that its flue
  // clears its own roof, and that it cannot be turned blind.

  test('the whole plan fits inside the footing the survey reserves', () => {
    // The number `landscape/croft.ts` refuses to site anything else inside and
    // `dressing.ts` reserves against the scatter. A roof overhang, a step stone
    // or an oar reaching past it is a spruce seeded through the building.
    for (const seed of [ 3, 11, 4_242 ]) {
      const { geometry, positions } = vertices(seed)

      for (let index = 0; index < positions.length; index += 3)
        expect(Math.hypot(positions[index], positions[index + 2]))
          .toBeLessThanOrEqual(CROFT_FOOTING)

      geometry.dispose()
    }
  })

  test('the flue lets go of its smoke above the masonry, not inside it', () => {
    const { geometry, positions } = vertices(11)
    const bounds                  = new Box3().setFromArray(positions)

    // Above everything the building has, so the plume leaves the stack rather
    // than the cap — the mistake `SMOKEHOUSE_VENT` documents from the other end.
    expect(CROFT_VENT.y).toBeGreaterThan(bounds.max.y)

    // And only just: a mouth further up than this is smoke starting in mid-air.
    expect(CROFT_VENT.y - bounds.max.y).toBeLessThan(0.3)

    // Off the ridge line, for the reason the farmhouse's chimney is off it.
    expect(Math.abs(CROFT_VENT.x)).toBeGreaterThan(0.5)

    geometry.dispose()
  })

  test('its two panes are in different walls, so no yaw turns it blind', () => {
    const axes = new Set(CROFT_WINDOWS.map(pane => pane.axis ?? 'z'))

    // The whole reason the gable one exists: the camera is a fixed dimetric
    // heading the reader can spin, and a hut glazed on one wall only shows a
    // blank end from half of those headings — on the only glass in the kit that
    // is not part of a farm or a chapel.
    expect(axes).toEqual(new Set([ 'x', 'z' ]))
  })

  test('the door is on the side the site search turns toward the harbour', () => {
    const { geometry, positions } = vertices(11)
    let deepest                   = new Vector3()

    // The step stone in front of the threshold is the furthest thing on `+z`,
    // and `+z` is what `faceToward` aims. A building modelled the other way
    // round is a croft that presents its blank back to the water.
    for (let index = 0; index < positions.length; index += 3)
      if (positions[index + 2] > deepest.z)
        deepest = new Vector3(positions[index], positions[index + 1], positions[index + 2])

    expect(deepest.z).toBeGreaterThan(2)
    expect(deepest.y).toBeLessThan(0.4)

    geometry.dispose()
  })
})
