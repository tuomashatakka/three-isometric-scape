import { describe, expect, test } from 'bun:test'
import { BoxGeometry } from 'three'
import { createSeededRng } from 'threejs-scene'
import { mergeParts, part } from 'threejs-scene/modules/assets'
import { NORDIC_PALETTE } from '../src/scene/props/palette.ts'
import { buildProp, resolvePalette } from '../src/scene/props/index.ts'
import { SHADES, VIEWS, paletteAudit, rasterize } from './raster.ts'


/**
 * What the drawing has to get right to be worth trusting.
 *
 * A picture you cannot trust is worse than no picture, because you will act on
 * it. So: the projection is measurable, the depth buffer actually occludes, and
 * the colour audit names the right paint — those three, and the tool is a
 * reliable answer to "what did that edit do".
 */

const rng = (): ReturnType<typeof createSeededRng> => createSeededRng(3)

describe('the projection', () => {
  test('every view basis is orthonormal', () => {
    for (const [ name, basis ] of Object.entries(VIEWS)) {
      const axes = [ basis.u, basis.v, basis.w ]

      for (const axis of axes)
        expect(Math.hypot(...axis)).toBeCloseTo(1, 9)

      // Non-orthogonal axes would shear the picture, and a sheared elevation is
      // exactly the sort of thing you would measure a roof pitch off and be
      // wrong about.
      for (let a = 0; a < 3; a += 1)
        for (let b = a + 1; b < 3; b += 1)
          expect(axes[a].reduce((sum, value, i) => sum + value * axes[b][i], 0)).toBeCloseTo(0, 9)

      expect(name).toBeTruthy()
    }
  })

  test('a cube fills a square, and the scale is metres per column', () => {
    const geometry = part(new BoxGeometry(2, 2, 2), { color: '#b0b0b0', jitter: 0, rng: rng() })
    const shot     = rasterize(geometry, { view: 'front', cols: 21, cell: 1 })

    expect(shot.triangles).toBe(12)

    // Four of the six faces are edge-on in an elevation and project to a line.
    expect(shot.drawn).toBe(4)
    expect(shot.min).toEqual([ -1, -1, -1 ])
    expect(shot.scale).toBeCloseTo(10, 9)

    // Cells are sampled at their centres, so the far edge of the last row and
    // column falls outside the cube: 20 filled of 21, on both axes. Equal on
    // both is the claim worth making — that is the aspect being right.
    const filled = shot.lines.filter(line => line.trim().length > 0)

    expect(filled).toHaveLength(20)
    expect(Math.max(...filled.map(line => line.length))).toBe(20)

    geometry.dispose()
  })

  test('the near face wins — the depth buffer is not a painter', () => {
    // Declared far-first, so a painter's algorithm would draw the dark slab last
    // and this test would show it: the bright square would vanish.
    const geometry = mergeParts([
      part(new BoxGeometry(4, 4, 0.2), { at: [ 0, 0, -2 ], color: '#111111', jitter: 0, rng: rng() }),
      part(new BoxGeometry(1, 1, 0.2), { at: [ 0, 0, 2 ], color: '#ffffff', jitter: 0, rng: rng() }),
    ])

    const shot   = rasterize(geometry, { view: 'front', cols: 41, cell: 1 })
    const middle = shot.lines[20]

    const near = middle[20]
    const far  = middle[2]

    expect(SHADES.indexOf(near)).toBeGreaterThan(SHADES.indexOf(far))

    // And the dark slab is drawn rather than dropped — an unlit facet has to be
    // distinguishable from a missing one.
    expect(far).not.toBe(' ')

    geometry.dispose()
  })
})

describe('the palette audit', () => {
  test('it names the paint a prop was actually built from', () => {
    const geometry = buildProp('farmhouse', rng(), resolvePalette())
    const rows     = paletteAudit(geometry, NORDIC_PALETTE)
    const by       = (name: string): { maxY: number } | undefined => rows.find(row => row.name === name)

    // Falu red on the walls, granite in the chimney cap. Matching in sRGB puts
    // the rust chimney into the falu bucket, because three.js bakes the colour
    // attribute in LINEAR space and that conversion is a curve, not a scale.
    expect(by('faluRed')).toBeDefined()
    expect(by('ironRust')).toBeDefined()
    expect(by('faluRed')!.maxY).toBeLessThan(by('ironRust')!.maxY)

    geometry.dispose()
  })

  test('no gabled building shows wall paint above its own ridge', () => {
    // The regression this whole change exists for, asked of the finished props
    // rather than of the helper: if a gable end ever pokes through its roof
    // again, the wall colour outruns the ridge cap and this fails.
    const walls: Record<string, string> = {
      farmhouse:  'faluDark',
      barn:       'faluDark',
      aitta:      'tarWood',
      sauna:      'woodDark',
      meadowBarn: 'driftwoodDark',
      boathouse:  'tarWood',
    }

    for (const [ prop, wall ] of Object.entries(walls)) {
      const geometry = buildProp(prop as 'barn', rng(), resolvePalette())
      const rows     = paletteAudit(geometry, NORDIC_PALETTE)
      const painted  = rows.find(row => row.name === wall)
      const roof     = rows.find(row => row.name === 'shingle' || row.name === 'shingleWorn')

      expect(painted).toBeDefined()
      expect(roof).toBeDefined()
      expect(painted!.maxY).toBeLessThan(roof!.maxY)

      geometry.dispose()
    }
  })
})
