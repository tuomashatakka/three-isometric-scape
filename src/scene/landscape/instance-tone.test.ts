import { describe, expect, it } from 'bun:test'
import { BufferAttribute, BufferGeometry } from 'three'
import { LEAN_BLUE, LEAN_RED, familyChroma, instanceTone, spotHash } from './instance-tone.ts'


const coloured = (rgb: readonly number[], count = 6): BufferGeometry => {
  const geometry = new BufferGeometry()
  const colours  = new Float32Array(count * 3)

  for (let index = 0; index < count; index += 1)
    colours.set(rgb, index * 3)

  geometry.setAttribute('color', new BufferAttribute(colours, 3))
  return geometry
}

const channels = (tint: string): number[] => [ 1, 3, 5 ].map(at => Number.parseInt(tint.slice(at, at + 2), 16) / 255)

describe('the spot hash', () => {
  it('is the same for the same spot and stays inside -1..1', () => {
    for (let index = 0; index < 400; index += 1) {
      const x = index * 1.37 - 200
      const z = index * -0.91 + 77
      const h = spotHash(x, z)

      expect(h).toBe(spotHash(x, z))
      expect(h).toBeGreaterThanOrEqual(-1)
      expect(h).toBeLessThanOrEqual(1)
    }
  })

  it('leans as many warm as cool, with neighbours unrelated', () => {
    let sum   = 0
    let pairs = 0

    for (let index = 0; index < 4000; index += 1) {
      const here = spotHash(index * 0.5, index * 0.25)

      sum   += here
      pairs += here * spotHash(index * 0.5 + 0.5, index * 0.25 + 0.25)
    }

    expect(Math.abs(sum / 4000)).toBeLessThan(0.05)
    expect(Math.abs(pairs / 4000)).toBeLessThan(0.05)
  })
})

describe('how coloured a family is', () => {
  it('gives a grey stone none of the lean and a spruce all of it', () => {
    expect(familyChroma(coloured([ 0.42, 0.42, 0.44 ]))).toBe(0)
    expect(familyChroma(coloured([ 0.08, 0.3, 0.1 ]))).toBe(1)
    expect(familyChroma(new BufferGeometry())).toBe(0)
  })
})

describe('the tone of one instance', () => {
  it('is the plain grey shade on a family with no colour — stone stays stone', () => {
    expect(instanceTone(0.9, 12.5, -40, 0)).toBe('#e6e6e6')
  })

  it('anchors on green and never leans further than its reach', () => {
    for (let index = 0; index < 200; index += 1) {
      const [ r, g, b ] = channels(instanceTone(0.8, index * 3.1, index * -1.7, 1)) as [number, number, number]

      expect(g).toBeCloseTo(0.8, 2)
      expect(Math.abs(r / g - 1)).toBeLessThanOrEqual(LEAN_RED + 0.01)
      expect(Math.abs(b / g - 1)).toBeLessThanOrEqual(LEAN_BLUE + 0.01)
      // Warm and cool are one axis: red up is blue down.
      expect((r - g) * (b - g)).toBeLessThanOrEqual(1e-6)
    }
  })

  it('gives a stand both warm and cool trees', () => {
    const leans = Array.from({ length: 200 }, (_, index) => channels(instanceTone(0.8, index * 3.1, index * -1.7, 1)))
      .map(([ r, , b ]) => (r ?? 0) - (b ?? 0))

    expect(Math.max(...leans)).toBeGreaterThan(0.15)
    expect(Math.min(...leans)).toBeLessThan(-0.15)
  })
})
