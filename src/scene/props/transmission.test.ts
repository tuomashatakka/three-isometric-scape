import { describe, expect, it } from 'bun:test'
import { ShaderChunk } from 'three'
import { FOLIAGE_TRANSMIT, TRANSMIT_FILTER, TRANSMIT_FRAGMENT, transmitted } from './transmission.ts'


describe('light through the crown', () => {
  it('adds nothing to a face the sun already lights', () => {
    expect(transmitted(1)).toBe(0)
    expect(transmitted(0)).toBe(0)
  })

  it('lights the far side, most where it faces straight away, and never as much as the near side', () => {
    expect(transmitted(-0.5)).toBeGreaterThan(0)
    expect(transmitted(-1)).toBeGreaterThan(transmitted(-0.5))
    expect(transmitted(-1)).toBe(FOLIAGE_TRANSMIT)
    expect(FOLIAGE_TRANSMIT).toBeLessThan(1)
  })

  it('passes warm light and keeps the blue', () => {
    expect(TRANSMIT_FILTER[2]).toBeLessThan(TRANSMIT_FILTER[1])
    expect(TRANSMIT_FILTER[0]).toBeGreaterThanOrEqual(TRANSMIT_FILTER[1])
  })

  it('reads only names three\'s own light loop declares, and keeps the chunk it replaces', () => {
    expect(TRANSMIT_FRAGMENT).toContain('#include <lights_fragment_end>')
    expect(ShaderChunk.lights_pars_begin).toContain('directionalLights[ NUM_DIR_LIGHTS ]')
    expect(ShaderChunk.lights_fragment_begin).toContain('geometryNormal')
    expect(ShaderChunk.lights_physical_pars_fragment).toContain('diffuseColor')
    expect(ShaderChunk.lights_physical_pars_fragment).toContain('reflectedLight.directDiffuse')
  })
})
