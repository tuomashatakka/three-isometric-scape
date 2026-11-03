import { describe, expect, test } from 'bun:test'
import { Color, ShaderChunk } from 'three'
import { SCAPE_CONFIG } from '../config.ts'
import { THREE_VIEW_DIR, eyeLights } from '../frame.ts'
import { BED_WET, THREE_F0, WATER_F0, bedTransmission, normalReflectance, waterBody } from './water-body.ts'


function rgb (hex: number): [number, number, number] {
  const c = new Color(hex)

  return [ c.r, c.g, c.b ]
}

describe('the body of the water', () => {
  const deep = rgb(SCAPE_CONFIG.palette.deepWater)
  const bed  = rgb(SCAPE_CONFIG.palette.shore)

  test('at the waterline it is the wet bed, and offshore it is the deep water', () => {
    const edge = waterBody(0, deep, bed)
    const open = waterBody(1, deep, bed)

    edge.forEach((v, i) => expect(v).toBeCloseTo(bed[i] * BED_WET, 6))
    open.forEach((v, i) => expect(Math.abs(v - deep[i])).toBeLessThan(0.1 * bed[i]))
  })

  test('the red goes first, so a shelf is green-blue rather than a paler sand', () => {
    const [ r, g, b ] = bedTransmission(0.15)

    expect(r).toBeLessThan(b)
    expect(b).toBeLessThan(g)
  })

  test('is monotonic in depth and deterministic', () => {
    let last = bedTransmission(0)

    for (let d = 0.05; d <= 1; d += 0.05) {
      const next = bedTransmission(d)

      next.forEach((v, i) => expect(v).toBeLessThan(last[i]))
      last = next
    }
    expect(waterBody(0.3, deep, bed)).toEqual(waterBody(0.3, deep, bed))
  })

  test('the deep water is bluer than it is red, which the grey stops never were', () => {
    expect(deep[2]).toBeGreaterThan(deep[0] * 3)
  })

  test('water reflects half what three assumes of a dielectric', () => {
    expect(WATER_F0).toBeCloseTo(0.02, 2)
    expect(normalReflectance(1.5)).toBeCloseTo(THREE_F0, 6)
  })

  test('the light loop still spells the view direction the eye replaces', () => {
    expect(ShaderChunk.lights_fragment_begin).toContain(THREE_VIEW_DIR)
    expect(eyeLights(ShaderChunk.lights_fragment_begin)).toContain('scapeEye()')
    expect(() => eyeLights('nothing to replace')).toThrow()
  })
})
