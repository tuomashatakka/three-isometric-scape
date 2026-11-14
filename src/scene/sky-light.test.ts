import { describe, expect, it } from 'bun:test'
import { ShaderChunk } from 'three'
import { HORIZON_BAND, installSkyLight, skyLightInstalled, skyShare } from './sky-light.ts'


describe('the sky light', () => {
  it('replaces three’s hemisphere function once, and only that', () => {
    const before = ShaderChunk.lights_pars_begin
    installSkyLight()

    const once = ShaderChunk.lights_pars_begin
    installSkyLight()

    expect(skyLightInstalled()).toBe(true)
    expect(ShaderChunk.lights_pars_begin).toBe(once)
    expect(once.match(/getHemisphereLightIrradiance\(/g)?.length).toBe(1)
    expect(once).not.toContain('return irradiance;\n\n\t}\n\n#endif')

    // Everything outside the one function is three's own.
    const head = before.slice(0, before.indexOf('vec3 getHemisphereLightIrradiance'))
    expect(once.startsWith(head)).toBe(true)
  })

  it('reads the key light only where a directional light exists', () => {
    installSkyLight()

    const chunk = ShaderChunk.lights_pars_begin
    const hemi  = chunk.slice(chunk.indexOf('vec3 getHemisphereLightIrradiance'))
    expect(hemi.indexOf('#if NUM_DIR_LIGHTS > 0')).toBeLessThan(hemi.indexOf('directionalLights[ 0 ]'))
    // and the struct it reads is declared above it in the same chunk
    expect(chunk.indexOf('uniform DirectionalLight directionalLights')).toBeLessThan(chunk.indexOf('skyShare'))
  })

  it('leaves a roof and a floor where three had them', () => {
    expect(skyShare(1)).toBe(1)
    expect(skyShare(-1)).toBe(0)
  })

  it('lets an upright face see the horizon instead of half the ground', () => {
    expect(skyShare(0)).toBeCloseTo(0.5 + 0.5 * HORIZON_BAND, 6)

    // monotone from floor to roof: the band never makes a tilt darker than a steeper one
    let last = -1
    for (let up = -1; up <= 1.0001; up += 0.05) {
      const share = skyShare(up)
      expect(share).toBeGreaterThanOrEqual(last)
      last = share
    }
  })
})
