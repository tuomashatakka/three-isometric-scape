import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { surveyArchipelago } from './archipelago.ts'
import {
  SHELTER_RESOLUTION,
  WATER_SHELTER_GLSL,
  bakeShelterData,
  fetchShelter,
  shelterAt,
  surveyShelter,
} from './shelter.ts'
import type { ShelterField } from './shelter.ts'
import { bakeDepthGrid } from './shore-mask.ts'


const { reach, swellReach } = SCAPE_CONFIG.shelter

/**
 * A square of water with one square island in the middle of it.
 *
 * Hand-built rather than surveyed, because every claim about *which way* the
 * shelter points wants ground whose shape is known exactly. One texel of the
 * fixture is `span / (size - 1)` metres, so the island below is a body 7 texels
 * across at the middle of a grid 64 texels wide.
 */
function island (size = 64, half = 3): Float32Array {
  const depth  = new Float32Array(size * size).fill(1)
  const middle = Math.floor(size / 2)

  for (let row = middle - half; row <= middle + half; row += 1)
    for (let column = middle - half; column <= middle + half; column += 1)
      depth[row * size + column] = 0

  return depth
}

/** The texel a point of the fixture's own grid lands in. */
function texel (size: number, column: number, row: number): number {
  return row * size + column
}

/** Shelter at a texel, resolved for weather coming out of (x, z). */
function from (field: ShelterField, index: number, x: number, z: number): number {
  const length = Math.hypot(x, z)

  return shelterAt(field, index, x / length, z / length)
}


describe('what a ray brings back', () => {
  test('it never leaves the unit interval, at any distance', () => {
    for (let metres = -50; metres <= 1_200; metres += 7) {
      const value = fetchShelter(metres, 400)

      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  /**
   * The curve stated as the fact it is fitted to.
   *
   * Fetch-limited wave height goes as about the square root of the distance the
   * wind has run, so the *deficit* does too — which puts half the shelter gone
   * at a quarter of the reach rather than at half of it. That asymmetry is the
   * whole reason a twenty-four metre breakwater throws a lee worth drawing, and
   * a build that quietly went linear would look like a smear over the sound.
   */
  test('shelter falls as the root of the distance, not with it', () => {
    expect(fetchShelter(0, 400)).toBe(1)
    expect(fetchShelter(100, 400)).toBeCloseTo(0.5, 10)
    expect(fetchShelter(225, 400)).toBeCloseTo(0.25, 10)
    expect(fetchShelter(400, 400)).toBe(0)

    // Past the reach is nothing at all rather than a negative, and a reach of
    // zero is the honest reading of "nothing shelters anything".
    expect(fetchShelter(4_000, 400)).toBe(0)
    expect(fetchShelter(10, 0)).toBe(0)
  })
})


describe('the field over a known island', () => {
  const size  = 64
  const span  = 1_280
  const depth = island(size)
  const field = surveyShelter(depth, size, span, { reach: 400, swellReach: 160 })
  const mid   = Math.floor(size / 2)

  /**
   * The claim this whole system exists to make, on ground whose shape is known.
   *
   * The texel just off the island's eastern edge is sheltered from weather
   * arriving out of the west — which is where the island is — and open to
   * weather arriving out of the east, which is six hundred metres of empty
   * water. One number, read two ways, and the two readings have to differ by
   * most of the interval or the harmonic is not carrying a bearing at all.
   */
  test('a lee is a lee only from the side the land is on', () => {
    const lee    = texel(size, mid + 4, mid)
    const toward = from(field, lee, -1, 0)
    const away   = from(field, lee, 1, 0)

    expect(toward).toBeGreaterThan(0.6)
    expect(away).toBeLessThan(0.05)
    expect(toward - away).toBeGreaterThan(0.5)
  })

  test('the lee is the same on every side, because the island is', () => {
    const sides = [
      from(field, texel(size, mid + 4, mid), -1, 0),
      from(field, texel(size, mid - 4, mid), 1, 0),
      from(field, texel(size, mid, mid + 4), 0, -1),
      from(field, texel(size, mid, mid - 4), 0, 1),
    ]

    for (const side of sides)
      expect(side).toBeCloseTo(sides[0], 2)
  })

  test('it fades out with distance from the land that makes it', () => {
    let previous = 1

    for (let out = 4; out < mid - 2; out += 1) {
      const here = from(field, texel(size, mid + out, mid), -1, 0)

      expect(here).toBeLessThanOrEqual(previous + 1e-6)
      previous = here
    }

    // And past the reach it is gone rather than merely small: 400 m is twenty
    // texels of this fixture, and the corner is further than that from
    // everything.
    expect(field.data[texel(size, 1, 1) * 4]).toBe(0)
    expect(field.data[texel(size, 1, 1) * 4 + 3]).toBe(0)
  })

  /**
   * The two seas, stated as the ordering `config-shelter.ts` argues for.
   *
   * The swell's reach is the shorter one — a swell bends back into its own
   * shadow rather than having to be rebuilt — so the swell channel has to die
   * off sooner than the wind sea's mean does, everywhere, and reach zero while
   * the wind sea's is still carrying something.
   */
  test('the swell comes back into its own shadow before the wind sea does', () => {
    const near = texel(size, mid + 5, mid)
    const far  = texel(size, mid + 14, mid)

    expect(field.data[near * 4 + 3]).toBeGreaterThan(0)
    expect(field.data[near * 4 + 3]).toBeLessThan(field.data[near * 4])
    expect(field.data[far * 4 + 3]).toBe(0)
    expect(field.data[far * 4]).toBeGreaterThan(0)
  })

  test('open water with nothing in it is open', () => {
    const empty = surveyShelter(new Float32Array(size * size).fill(1), size, span, {
      reach:      400,
      swellReach: 160,
    })

    for (const value of empty.data)
      expect(value).toBe(0)
  })

  /**
   * Land is land, however the grid came by it. A dry texel finds land one step
   * away on every bearing — itself — which is never drawn, since no fragment of
   * the lake stands on dry ground, but is what keeps the gpu's bilinear filter
   * from blending a coast against an unwritten texel. One step of this fixture
   * is 20 m, which on the root curve is a shelter of 0.78 rather than of 1.
   */
  test('the ground the island stands on is not a hole in the map', () => {
    const middle = texel(size, mid, mid)

    expect(field.data[middle * 4]).toBeGreaterThan(0.7)
  })
})


describe('what the map stores', () => {
  const size  = 64
  const depth = island(size)

  test('it is the same field twice, to the byte', () => {
    const first  = bakeShelterData(surveyShelter(depth, size, 1_280, { reach, swellReach }))
    const second = bakeShelterData(surveyShelter(depth, size, 1_280, { reach, swellReach }))

    expect(first).toEqual(second)
  })

  /**
   * The encoding, stated against the decode the shader does.
   *
   * `r` and `a` are unsigned shares and use the whole byte; `g` and `b` are
   * coefficients of a harmonic and are signed, so they are packed the way
   * `shore-mask.ts` packs a bearing and come back through the same
   * `gb * 2.0 - 1.0` the chunk below applies. A build that packed one and
   * decoded the other would put the lee of every island on the wrong side of
   * it, which is exactly the kind of error a still cannot distinguish from a
   * wind blowing the other way.
   */
  test('the signed channels round-trip through the shader\'s own decode', () => {
    const field = surveyShelter(depth, size, 1_280, { reach: 400, swellReach: 160 })
    const bytes = bakeShelterData(field)

    for (let index = 0; index < bytes.length; index += 4) {
      expect(bytes[index] / 255).toBeCloseTo(field.data[index], 2)
      expect(bytes[index + 1] / 255 * 2 - 1).toBeCloseTo(field.data[index + 1], 2)
      expect(bytes[index + 2] / 255 * 2 - 1).toBeCloseTo(field.data[index + 2], 2)
      expect(bytes[index + 3] / 255).toBeCloseTo(field.data[index + 3], 2)
    }
  })

  test('the reconstruction is clamped, because a first harmonic overshoots', () => {
    const field = surveyShelter(depth, size, 1_280, { reach: 400, swellReach: 160 })

    for (let index = 0; index < size * size; index += 1)
      for (let turn = 0; turn < 16; turn += 1) {
        const angle = turn / 16 * Math.PI * 2
        const value = shelterAt(field, index, Math.cos(angle), Math.sin(angle))

        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
  })
})


/**
 * The cost of this system, stated where a refactor has to walk past it.
 *
 * One dependent read in the fragment and one vertex fetch, both of a map small
 * enough to sit in texture cache — see the note on `WATER_SHELTER_GLSL`. A
 * second `texture2D` in here is the cheap program's budget going again, and the
 * reconstruction has to stay a dot product: a chunk that reached for `sin` or
 * `atan` would be paying per fragment for something that was resolved at build.
 */
describe('the chunk', () => {
  test('it takes exactly one texture read and no trigonometry', () => {
    expect(WATER_SHELTER_GLSL.match(/texture2D/g)).toHaveLength(1)
    expect(WATER_SHELTER_GLSL).not.toContain('sin(')
    expect(WATER_SHELTER_GLSL).not.toContain('atan')
  })

  test('it shares the bathymetry mask\'s scale rather than carrying a copy', () => {
    expect(WATER_SHELTER_GLSL).toContain('uShoreScale')
    expect(WATER_SHELTER_GLSL).not.toContain('uShelterScale')
  })

  test('the reconstruction clamps, the way shelterAt does', () => {
    expect(WATER_SHELTER_GLSL).toContain('clamp(shelter.r + dot(shelter.gb * 2.0 - 1.0, upwind), 0.0, 1.0)')
  })
})


/**
 * The archipelago, which is the only place the claim can be checked against the
 * world it was written for.
 *
 * One survey, which is the expensive thing in this file; everything above runs
 * on fixtures for exactly that reason.
 */
describe('the lee of the real archipelago', () => {
  const config  = SCAPE_CONFIG
  const span    = config.archipelago.worldSize * 1.02
  const survey  = surveyArchipelago(config)
  const depth   = bakeDepthGrid(config, survey.field, span, SHELTER_RESOLUTION)
  const field   = surveyShelter(depth, SHELTER_RESOLUTION, span, config.shelter)
  const step    = span / (SHELTER_RESOLUTION - 1)
  const bearing = config.wind.bearing * Math.PI / 180
  const upwindX = -Math.cos(bearing)
  const upwindZ = -Math.sin(bearing)

  /** The texel a world point lands in. */
  const at = (x: number, z: number): number =>
    Math.round((z + span / 2) / step) * SHELTER_RESOLUTION + Math.round((x + span / 2) / step)

  /**
   * The headline, in one assertion: the harbour the mole was built to shelter
   * is sheltered, and the sound outside it is not.
   *
   * The mole stands at (-41.7, -33) and reaches 24 m out; the harbour it closes
   * is at (-13, -28). The open water south-west of the archipelago is the same
   * sea with nothing between it and the weather.
   */
  test('the harbour is sheltered and the sound outside it is not', () => {
    const harbour = from(field, at(-16, -34), upwindX, upwindZ)
    const sound   = from(field, at(-120, -160), upwindX, upwindZ)

    expect(harbour).toBeGreaterThan(0.75)
    expect(sound).toBeLessThan(0.3)
    expect(harbour - sound).toBeGreaterThan(0.5)
  })

  test('the swell is shaded in the harbour and not out in the sound', () => {
    expect(field.data[at(-16, -34) * 4 + 3]).toBeGreaterThan(0.3)
    expect(field.data[at(-120, -160) * 4 + 3]).toBeLessThan(0.1)
  })

  /**
   * The two findings the `shelter` line of `scape:map --stats` prints, stated
   * as the band the section is tuned to sit in.
   *
   * Under about a per cent nothing on the water reads as sheltered at any zoom
   * and the map is a tap spent on a field that draws nothing; past about a
   * third the lees have run together and the archipelago has no weather side
   * left. Both ends are `shelter.reach` set wrong rather than a world that
   * changed, and this is where a run that widens the world finds out.
   */
  test('the archipelago has a lee and an open sound both', () => {
    let water = 0
    let lee   = 0

    for (let index = 0; index < depth.length; index += 1) {
      if (!(depth[index] > 0))
        continue

      water += 1
      lee += shelterAt(field, index, upwindX, upwindZ) >= 0.5 ? 1 : 0
    }

    const share = lee / water * 100

    expect(share).toBeGreaterThan(1)
    expect(share).toBeLessThan(33)
  })

  /**
   * And the field has a *bearing* in it, rather than being a measure of how
   * enclosed the water is. A swing near zero with a healthy mean is a pond: it
   * would mean veering the wind through a whole gale moved nothing on the
   * water, which is the one thing this run is for.
   */
  test('veering the wind moves the lee', () => {
    const inside = at(-16, -34)
    const across = from(field, inside, -upwindX, -upwindZ)

    expect(from(field, inside, upwindX, upwindZ) - across).toBeGreaterThan(0.2)
  })
})
