import { describe, expect, test } from 'bun:test'
import { FISSURE_GLSL, JOINT_OPEN, JOINT_WIDTH, JOINTS, fissureAt, jointCoord, jointHash } from './fissure.ts'
import { STRATA_GLSL } from './strata.ts'
import { weatheringFragment } from './weathering.ts'


describe('fissure', () => {
  test('rides the stone block after the strata and before the moss, binding nothing of its own', () => {
    const glsl = weatheringFragment('uDetailMap')

    expect(glsl.indexOf(FISSURE_GLSL)).toBeGreaterThan(glsl.indexOf(STRATA_GLSL))
    expect(glsl.indexOf(FISSURE_GLSL)).toBeLessThan(glsl.indexOf('float moss'))
    expect(FISSURE_GLSL).not.toMatch(/uniform|varying|texture2D/)
  })

  test('the moss is laid over what the joints left, not over the albedo the block began with', () => {
    expect(weatheringFragment('uDetailMap')).toContain('mix(mix(diffuseColor.rgb,')
  })

  test('the joint sets are unit planes, steep, and far from parallel', () => {
    for (const { normal } of JOINTS) {
      expect(Math.hypot(...normal)).toBeCloseTo(1, 9)
      expect(Math.abs(normal[1])).toBeLessThan(0.5)
    }

    const [ a, b ] = JOINTS.map(set => set.normal)
    expect(Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2])).toBeLessThan(0.3)
  })

  test('a set repeats at its spacing along its own normal, wander aside', () => {
    const { normal, spacing } = JOINTS[0]
    const at                  = [ 3.2, 1.1, -7.4 ] as const
    const step                = at.map((v, i) => v + normal[i] * spacing) as [ number, number, number ]
    const wander              = Math.abs(jointCoord(0, ...step) - jointCoord(0, ...at) - 1)

    expect(wander).toBeLessThan(0.4)
  })

  test('cracks are lines, not a grid: a share of the stone, and some lengths tight', () => {
    let open = 0
    let n    = 0

    for (let x = -20; x < 20; x += 0.031)
      for (let y = 0; y < 3; y += 0.53) {
        open += fissureAt(x, y, x * 0.37 - 4)
        n    += 1
      }

    // Two sets, each open over `JOINT_OPEN` of its lengths and `2 · JOINT_WIDTH` of a spacing.
    const expected = 1 - (1 - JOINT_OPEN * 2 * JOINT_WIDTH) ** 2
    expect(open / n).toBeGreaterThan(expected * 0.5)
    expect(open / n).toBeLessThan(expected * 1.6)
  })

  test('the hash is deterministic, in range and roughly uniform', () => {
    let below = 0

    for (let i = 0; i < 2000; i += 1) {
      const h = jointHash(i, i * 7 - 300)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(1)
      expect(jointHash(i, i * 7 - 300)).toBe(h)
      below += h < JOINT_OPEN ? 1 : 0
    }

    expect(below / 2000).toBeCloseTo(JOINT_OPEN, 1)
  })
})
