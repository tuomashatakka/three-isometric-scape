import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { HOWE_FOOTING, HOWE_HEIGHT, HOWE_RADIUS } from '../landscape/howe.ts'
import { buildHowe } from './howe.ts'
import { resolvePalette } from './palette.ts'


const palette = resolvePalette()

/** One mound, and its vertices, so a test can measure and then dispose it. */
function vertices (seed: number) {
  const geometry = buildHowe(createSeededRng(seed), palette)

  return { geometry, positions: geometry.getAttribute('position').array as Float32Array }
}

describe('the howe', () => {
  // The roster test already states that every prop is deterministic, based at
  // zero and vertex-coloured. What is here is the two claims this one makes
  // that no generic test can, and both of them are claims about *numbers the
  // siting search is using* — the mound's own foot and its crest are read by
  // `landscape/howe.ts` to decide where it can stand and whether the farm can
  // see it, so a mound that quietly grew would be sited by the old one.

  test('the whole mound fits inside the footing the survey reserves', () => {
    for (const seed of [ 3, 11, 4_242 ]) {
      const { geometry, positions } = vertices(seed)

      for (let index = 0; index < positions.length; index += 3)
        expect(Math.hypot(positions[index], positions[index + 2]))
          .toBeLessThanOrEqual(HOWE_FOOTING)

      geometry.dispose()
    }
  })

  test('its foot and its crest are the ones the siting measured with', () => {
    const { geometry, positions } = vertices(11)
    const bounds                  = new Box3().setFromArray(positions)

    // The crest is what the skyline test raises the sightline to. A mound built
    // a metre shorter than `HOWE_HEIGHT` is a mound sited as though it cleared
    // ground it does not clear, and the failure is a frame with no mound in it.
    expect(bounds.max.y).toBeGreaterThan(HOWE_HEIGHT - 0.2)
    expect(bounds.max.y).toBeLessThan(HOWE_HEIGHT + 0.4)

    // And the foot is what `kerbFall` probes the ground at. The kerb is set
    // into the turf line, so the widest thing here is the ring of stones and it
    // stands a stone's half-width outside the radius the probes use.
    const widest = Math.max(
      bounds.max.x, -bounds.min.x, bounds.max.z, -bounds.min.z,
    )

    expect(widest).toBeGreaterThan(HOWE_RADIUS)
    expect(widest).toBeLessThan(HOWE_RADIUS + 1)

    geometry.dispose()
  })

  test('the dig and its spoil are on the side the siting turns at the yard', () => {
    const { geometry, positions } = vertices(11)

    // The dome and the kerb are both rings about the axis, so they contribute
    // nothing to the mean: everything this measures is the hollow's lip and the
    // spoil run out of it. `faceToward` aims local `+z`, and a barrow modelled
    // the other way round is one whose hole faces away from the only place it
    // was ever looked at from.
    let sum = 0

    for (let index = 0; index < positions.length; index += 3)
      sum += positions[index + 2]

    expect(sum / (positions.length / 3)).toBeGreaterThan(0.05)

    geometry.dispose()
  })
})
