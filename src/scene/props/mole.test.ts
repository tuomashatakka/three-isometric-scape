import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import type { BufferGeometry } from 'three'
import { createSeededRng } from 'threejs-scene'
import { resolvePalette } from './index.ts'
import { buildMoleRun } from './mole.ts'
import type { MoleRunOptions } from './mole.ts'


const palette = resolvePalette()

/** Mean water, matching the config the dressing hands this. */
const WATER = -1.25

/** Where the crest is put in every fixture below. */
const CREST = WATER + 1.4

/** How deep the bed is at the head, in metres. A shelf walking out from the shore. */
const DEEP = 3.5

/** How long the fixture course is, in metres. */
const RUN = 24

/** A bed that falls away along `+x`, the way every bank in the scape does. */
function bedAt (x: number): number {
  return WATER - Math.min(DEEP, Math.max(0, x) / RUN * DEEP)
}

/** A straight run out along `+x`, hooked the way the survey hooks one. */
function options (overrides: Partial<MoleRunOptions> = {}): MoleRunOptions {
  const stations = Array.from({ length: 11 }, (_, step) => {
    const along = step * 2.4
    const bend  = Math.max(0, along - 12)
    const x     = Math.min(along, 12) + bend * Math.cos(Math.PI / 3)
    const z     = bend * Math.sin(Math.PI / 3)

    return { x, z }
  })

  return {
    stations,
    heightAt: (x: number) => bedAt(x),
    crest:    CREST,
    width:    3.2,
    batter:   1.25,
    spacing:  0.76,
    armour:   1.7,
    seaward:  1,
    rng:      createSeededRng(17),
    palette,
    ...overrides,
  }
}

function bounds (geometry: BufferGeometry): Box3 {
  return new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)
}

describe('the mole run', () => {
  test('it is a mergeable, vertex-coloured geometry', () => {
    const geometry = buildMoleRun(options())!

    expect(geometry).not.toBeNull()
    for (const attribute of [ 'position', 'normal', 'color' ])
      expect(geometry.getAttribute(attribute)).toBeDefined()

    geometry.dispose()
  })

  test('the crest is level, whatever the bed under it does', () => {
    // The one claim the silhouette rests on, and the one a run following the
    // bottom down would quietly break. The bed falls three and a half metres
    // over this course; the top of the stone may not follow it.
    const geometry = buildMoleRun(options())!
    const box      = bounds(geometry)

    expect(box.max.y).toBeGreaterThan(CREST - 0.1)
    expect(box.max.y).toBeLessThan(CREST + 0.45)
    expect(box.min.y).toBeLessThan(WATER - DEEP + 0.9)

    geometry.dispose()
  })

  test('the foot is wider than the crest, and wider where the water is deeper', () => {
    // The batter, measured. A mound whose courses were stacked straight would
    // pass every other test in this file and read as a wall somebody left in
    // the sea, so the wedge is checked against its own rule: the spread at the
    // head, where the bed is three and a half metres down, has to beat the
    // spread at the root, where it is at the waterline.
    const narrow = bounds(buildMoleRun(options({ batter: 0.1 }))!)
    const wide   = bounds(buildMoleRun(options({ batter: 2.5 }))!)

    expect(wide.max.z - wide.min.z).toBeGreaterThan(narrow.max.z - narrow.min.z)
    expect(narrow.max.z - narrow.min.z).toBeGreaterThan(3.2)
  })

  test('the armour is the tier knob, and the mound survives losing it', () => {
    const armoured = buildMoleRun(options())!
    const bare     = buildMoleRun(options({ armour: 0 }))!

    expect(bare.getAttribute('position').count).toBeLessThan(armoured.getAttribute('position').count)

    // Graceful absence rather than a broken cheap version: without the apron
    // the arm is still a wedge of stone standing to its own crest.
    const box = bounds(bare)

    expect(box.max.y).toBeGreaterThan(CREST - 0.1)
    expect(box.max.x - box.min.x).toBeGreaterThan(RUN * 0.6)

    armoured.dispose()
    bare.dispose()
  })

  test('the armour lies on the seaward side and nowhere else', () => {
    // A straight run along `+x` with a flat bed, so the two flanks are exactly
    // `+z` and `-z` and the apron has nowhere to hide. Which side it goes on
    // came out of the survey, and this is what says the prop still honours it.
    const straight = {
      stations: Array.from({ length: 9 }, (_, step) => ({ x: step * 2.4, z: 0 })),
      heightAt: () => WATER - 1.5,
    }
    const port      = bounds(buildMoleRun(options({ ...straight, seaward: 1 }))!)
    const starboard = bounds(buildMoleRun(options({ ...straight, seaward: -1 }))!)

    expect(port.max.z).toBeGreaterThan(-port.min.z)
    expect(starboard.max.z).toBeLessThan(-starboard.min.z)
  })

  test('it is byte-for-byte stable for a seed, and not for two', () => {
    const first  = buildMoleRun(options())!
    const second = buildMoleRun(options())!
    const other  = buildMoleRun(options({ rng: createSeededRng(18) }))!

    expect(Array.from(first.getAttribute('position').array as Float32Array))
      .toEqual(Array.from(second.getAttribute('position').array as Float32Array))
    expect(Array.from(first.getAttribute('position').array as Float32Array))
      .not.toEqual(Array.from(other.getAttribute('position').array as Float32Array))

    for (const geometry of [ first, second, other ])
      geometry.dispose()
  })

  test('a course with nothing in it builds nothing', () => {
    expect(buildMoleRun(options({ stations: []}))).toBeNull()
    expect(buildMoleRun(options({ stations: [{ x: 0, z: 0 }]}))).toBeNull()
    expect(buildMoleRun(options({ spacing: 0 }))).toBeNull()
  })
})
