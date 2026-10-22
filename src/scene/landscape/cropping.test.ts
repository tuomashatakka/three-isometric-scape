import { describe, expect, test } from 'bun:test'
import { Color } from 'three'
import { SCAPE_CONFIG } from '../config.ts'
import { COURSES, courseRun, cropShare, crownShare, grassShare, rotationCycle, swardShare } from './cropping.ts'
import type { Course, Rotation } from './cropping.ts'
import type { Footpaths } from './footpath.ts'
import { createHeightField } from './height.ts'
import { createScapeLayout, plotInfluence } from './layout.ts'
import { createTerrainPainter } from './terrain.ts'


const ROTATION: Rotation = SCAPE_CONFIG.cropping

function tally (run: readonly Course[]): Record<Course, number> {
  return Object.fromEntries(
    COURSES.map(course => [ course, run.filter(entry => entry === course).length ]),
  ) as Record<Course, number>
}

describe('the cycle', () => {
  test('is as long as the rotation has years, and holds what was asked for', () => {
    const cycle = rotationCycle(ROTATION)

    expect(cycle).toHaveLength(ROTATION.courses)
    expect(tally(cycle)).toEqual({ corn: 2, ley: 1, fallow: 1 })
  })

  test('is every course of a four-year rotation, so the whole of it is on the ground at once', () => {
    expect(new Set(rotationCycle(ROTATION)).size).toBe(COURSES.length)
  })

  test('alternates the resting years with the corn rather than stacking them after it', () => {
    expect(rotationCycle(ROTATION)).toEqual([ 'corn', 'ley', 'corn', 'fallow' ])
  })

  test('leaves a corn year in every consecutive pair, which is what the small islands live on', () => {
    const cycle = rotationCycle(ROTATION)

    for (let start = 0; start < cycle.length; start += 1)
      expect([ cycle[start], cycle[(start + 1) % cycle.length] ]).toContain('corn')
  })

  test('is all corn when no year of it rests — the infield as it stood before the rotation', () => {
    expect(rotationCycle({ ...ROTATION, courses: 1, ley: 0, fallow: 0 })).toEqual([ 'corn' ])
    expect(tally(rotationCycle({ ...ROTATION, ley: 0, fallow: 0 }))).toEqual({ corn: 4, ley: 0, fallow: 0 })
  })

  test('clamps a cycle asked for more years than it has, rather than throwing inside a layout', () => {
    const over = rotationCycle({ ...ROTATION, courses: 3, ley: 2, fallow: 2 })

    expect(over).toHaveLength(3)
    expect(tally(over)).toEqual({ corn: 0, ley: 2, fallow: 1 })
    expect(new Set(over).size).toBe(2)
  })

  test('survives a zero and a fraction, because both are things a person can type', () => {
    expect(rotationCycle({ ...ROTATION, courses: 0 })).toHaveLength(1)
    expect(rotationCycle({ ...ROTATION, courses: 2.7, ley: 0.9, fallow: 0 })).toEqual([ 'corn', 'corn' ])
  })
})

describe('dealing the fields round it', () => {
  test('gives consecutive fields consecutive courses', () => {
    const run = courseRun(8, ROTATION, 0)

    expect(run).toEqual([ 'corn', 'ley', 'corn', 'fallow', 'corn', 'ley', 'corn', 'fallow' ])
  })

  test('puts every course on the ground once over any cycle-length stretch of fields', () => {
    for (let shift = 0; shift < 9; shift += 1)
      expect(tally(courseRun(ROTATION.courses, ROTATION, shift))).toEqual({ corn: 2, ley: 1, fallow: 1 })
  })

  test('takes a shift from anywhere on the number line and still lands in the cycle', () => {
    expect(courseRun(4, ROTATION, 4)).toEqual(courseRun(4, ROTATION, 0))
    expect(courseRun(4, ROTATION, -1)).toEqual(courseRun(4, ROTATION, 3))
    expect(courseRun(4, ROTATION, 1.6)).toEqual(courseRun(4, ROTATION, 1))
  })

  test('deals nothing to an island with no fields', () => {
    expect(courseRun(0, ROTATION, 2)).toEqual([])
    expect(courseRun(-3, ROTATION, 2)).toEqual([])
  })

  test('is byte-for-byte the same run every time it is dealt', () => {
    expect(courseRun(17, ROTATION, 5)).toEqual(courseRun(17, ROTATION, 5))
  })
})

describe('what a course does to the field it is in', () => {
  test('stands a crop on the corn and on nothing else', () => {
    expect(cropShare('corn')).toBe(1)
    expect(cropShare('ley')).toBe(0)
    expect(cropShare('fallow')).toBe(0)
  })

  test('leaves the fallow its full relief — a resting field is not an unworked one', () => {
    expect(crownShare('fallow', ROTATION)).toBe(1)
    expect(crownShare('corn', ROTATION)).toBe(1)
  })

  test('slumps only the ley, and never past flat or over full', () => {
    expect(crownShare('ley', ROTATION)).toBeCloseTo(ROTATION.leyCrown, 6)
    expect(crownShare('ley', { ...ROTATION, leyCrown: -2 })).toBe(0)
    expect(crownShare('ley', { ...ROTATION, leyCrown: 4 })).toBe(1)
  })

  test('hands the painter shares it can use whatever was typed', () => {
    expect(grassShare(ROTATION)).toBeCloseTo(ROTATION.leyGrass, 6)
    expect(grassShare({ ...ROTATION, leyGrass: -1 })).toBe(0)
    expect(grassShare({ ...ROTATION, leyGrass: 9 })).toBe(1)

    expect(swardShare(ROTATION)).toBeCloseTo(ROTATION.cornSward, 6)
    expect(swardShare({ ...ROTATION, cornSward: -1 })).toBe(0)
    expect(swardShare({ ...ROTATION, cornSward: 9 })).toBe(1)
  })
})


describe('the ground each course is painted on', () => {
  const layout           = createScapeLayout(SCAPE_CONFIG)
  const paths: Footpaths = { paths: [], wearAt: () => 0 }
  const field            = createHeightField(SCAPE_CONFIG, layout)

  // The same scape twice, with everything the rotation grows taken off it in
  // one of them — so every field in the second is the bare tilth that every
  // field in the archipelago used to be. The difference between them at a
  // point *is* the course and nothing else.
  const sown = createTerrainPainter(SCAPE_CONFIG, layout, paths, field)
  const bare = createTerrainPainter(
    { ...SCAPE_CONFIG, cropping: { ...SCAPE_CONFIG.cropping, leyGrass: 0, cornSward: 0 }},
    layout,
    paths,
    field,
  )

  const ground = (painter: ReturnType<typeof createTerrainPainter>, x: number, z: number): Color =>
    painter.paint(field.heightAt(x, z), field.slopeAt(x, z), x, z, new Color())

  /** How far a colour leans green — the one thing a sward does to the ground. */
  const green = (color: Color): number => color.g - (color.r + color.b) / 2

  type MiddleOfReturnType = { x: number, z: number }

  const middleOf = (course: Course): MiddleOfReturnType => {
    const plot = layout.plots.find(candidate => candidate.course === course)

    expect(plot).toBeDefined()
    return { x: plot!.x, z: plot!.z }
  }

  test('a growing course is greener ground than the same field in bare tilth', () => {
    for (const course of [ 'corn', 'ley' ] as const) {
      const { x, z } = middleOf(course)

      expect(green(ground(sown, x, z))).toBeGreaterThan(green(ground(bare, x, z)))
    }
  })

  test('a fallow is the bare tilth itself — nothing is growing to take off it', () => {
    const { x, z } = middleOf('fallow')

    expect(ground(sown, x, z).getHex()).toBe(ground(bare, x, z).getHex())
  })

  /**
   * The claim of the whole section, and the one a still can be held against:
   * at the far zoom the corduroy is sub-pixel and colour is all that is left
   * to tell two fields apart. Three courses have to be three grounds.
   */
  test('the three courses are three different grounds, greenest first', () => {
    const [ ley, corn, fallow ] = ([ 'ley', 'corn', 'fallow' ] as const)
      .map(course => ground(sown, middleOf(course).x, middleOf(course).z))

    expect(new Set([ ley.getHex(), corn.getHex(), fallow.getHex() ]).size).toBe(3)
    expect(green(ley)).toBeGreaterThan(green(corn))
    expect(green(corn)).toBeGreaterThan(green(fallow))
  })

  test('a course stops at its own field edge rather than leaking into the hill', () => {
    const plot = layout.plots.find(candidate => candidate.course === 'ley')!

    // Stepped out along the bearing away from the yard until no plot claims
    // the point at all — the infield is a scatter of rectangles and a fixed
    // offset from one of them lands in another often enough to matter.
    for (let away = 1; away < 40; away += 0.5) {
      const x = plot.x + away
      const z = plot.z + away

      if (layout.plots.some(candidate => plotInfluence(candidate, x, z) > 0))
        continue

      expect(ground(sown, x, z).getHex()).toBe(ground(bare, x, z).getHex())
      return
    }

    throw new Error('no unclaimed ground found beside the ley')
  })
})
