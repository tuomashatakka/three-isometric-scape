import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { HERO_PROPS, PROPS, SCATTER_PROPS, buildProp, resolvePalette } from './index.ts'
import type { PropName } from './index.ts'


const palette = resolvePalette()
const names   = Object.keys(PROPS) as PropName[]

describe('prop roster', () => {
  test.each(names)('%s builds a mergeable, vertex-coloured geometry', name => {
    const geometry = buildProp(name, createSeededRng(11), palette)

    expect(geometry.index).toBeNull()
    for (const attribute of [ 'position', 'normal', 'uv', 'color' ])
      expect(geometry.getAttribute(attribute)).toBeDefined()

    geometry.dispose()
  })

  test.each(names)('%s stands on the ground and stays within scale', name => {
    const geometry = buildProp(name, createSeededRng(11), palette)
    const bounds   = new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)
    const size     = bounds.getSize(bounds.max.clone())

    expect(bounds.min.y).toBeGreaterThan(-0.75)
    expect(bounds.max.y).toBeGreaterThan(0)
    expect(Math.max(size.x, size.y, size.z)).toBeLessThan(14)

    geometry.dispose()
  })

  test.each(names)('%s is deterministic for one seed', name => {
    const first  = buildProp(name, createSeededRng(4_242), palette)
    const second = buildProp(name, createSeededRng(4_242), palette)

    expect(Array.from(first.getAttribute('position').array))
      .toEqual(Array.from(second.getAttribute('position').array))
    expect(Array.from(first.getAttribute('color').array))
      .toEqual(Array.from(second.getAttribute('color').array))

    first.dispose()
    second.dispose()
  })

  test('a different seed varies the props that ask for variation', () => {
    const a = buildProp('logPile', createSeededRng(1), palette)
    const b = buildProp('logPile', createSeededRng(2), palette)

    expect(Array.from(a.getAttribute('position').array))
      .not.toEqual(Array.from(b.getAttribute('position').array))

    a.dispose()
    b.dispose()
  })
})

/**
 * A prop is registered in `PROPS` and then spent — merged into the steading
 * draw as a hero, or stamped through one `InstancedMesh` as scatter. Choosing
 * which is a deliberate act; *forgetting* to choose is silent. The builder still
 * compiles, its determinism test still passes, `prop:map` still draws it, and
 * nothing ever puts it in the scape.
 */
describe('the roster is fully spent', () => {
  test('every prop is either a hero or scattered', () => {
    const spent   = new Set<string>([ ...HERO_PROPS, ...SCATTER_PROPS ])
    const orphans = Object.keys(PROPS).filter(name => !spent.has(name))

    expect(orphans).toEqual([])
  })

  test('no prop is spent twice, and none is spent that does not exist', () => {
    const spent = [ ...HERO_PROPS, ...SCATTER_PROPS ]

    expect(spent.length).toBe(new Set(spent).size)
    expect(spent.length).toBe(Object.keys(PROPS).length)

    for (const name of spent)
      expect(PROPS).toHaveProperty(name)
  })
})
