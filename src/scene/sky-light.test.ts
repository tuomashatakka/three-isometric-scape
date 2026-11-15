import { describe, expect, it } from 'bun:test'
import { ShaderChunk } from 'three'
import { HORIZON_BAND, installSkyLight, skyLightInstalled, skyRay, skyShare } from './sky-light.ts'


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

  it('adds the sky mirror once, after the environment lookup, only where there is none', () => {
    installSkyLight()

    const once = ShaderChunk.lights_fragment_maps
    installSkyLight()

    expect(ShaderChunk.lights_fragment_maps).toBe(once)
    expect(once.match(/skyRay  =/g)?.length).toBe(1)
    expect(once.indexOf('getIBLRadiance')).toBeLessThan(once.indexOf('skyRay'))
    expect(once).toContain('!defined( USE_ENVMAP )')
  })

  it('mirrors the sky behind the viewer on a smooth face and the sky over its normal on a rough one', () => {
    const view: [number, number, number] = [ 0, 0.6, 0.8 ]
    const up:   [number, number, number] = [ 0, 1, 0 ]

    const smooth = skyRay(view, up, 0)
    expect(smooth[0]).toBeCloseTo(0, 6)
    expect(smooth[1]).toBeCloseTo(0.6, 6)
    expect(smooth[2]).toBeCloseTo(-0.8, 6)

    const rough = skyRay(view, up, 1)
    expect(rough[1]).toBeCloseTo(1, 6)

    // the lean is monotone: a rougher face never looks lower than a smoother one
    let last = -1
    for (let r = 0; r <= 1.0001; r += 0.1) {
      const y = skyRay(view, up, r)[1]
      expect(y).toBeGreaterThanOrEqual(last - 1e-9)
      last = y
    }
  })
})
