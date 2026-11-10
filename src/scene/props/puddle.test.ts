import { describe, expect, test } from 'bun:test'
import type { MeshStandardMaterial, WebGLProgramParametersWithUniforms } from 'three'
import { NOTHING_SKIPPED } from '../audit.ts'
import { SCAPE_CONFIG } from '../config.ts'
import { createTextureCatalogue } from '../textures/catalogue.ts'
import { createScapeMaterials } from './material.ts'
import { PUDDLE_DRY, PUDDLE_FILL, PUDDLE_TILE, hollowAt, puddleLevel } from './puddle.ts'


interface Channel {
  data: Uint8Array
  size: number
}

/** The red channel of a catalogue map, as the shader reads it. */
function channel (id: 'ground.wear' | 'ground.grain'): Channel {
  const texture = createTextureCatalogue(SCAPE_CONFIG.seed).get(id)
  const data    = (texture.image as { data: Uint8Array }).data

  return { data, size: Math.round(Math.sqrt(data.length / 4)) }
}

/**
 * The hollow over one puddle-scale patch of ground, sampled the way the shader
 * reads it: the broad wear at the patch's place, the same map `PUDDLE_TILE`
 * times finer, and the grain ragging both.
 */
function hollows (): number[] {
  const wear          = channel('ground.wear')
  const grain         = channel('ground.grain')
  const out: number[] = []
  const at            = (map: Channel, u: number, v: number): number => {
    const x = Math.floor((u % 1 + 1) % 1 * map.size)
    const y = Math.floor((v % 1 + 1) % 1 * map.size)

    return map.data[(y * map.size + x) * 4] / 255
  }

  for (let j = 0; j < 160; j++)
    for (let i = 0; i < 160; i++) {
      const u = i / 160
      const v = j / 160

      out.push(hollowAt(
        at(wear, u * PUDDLE_TILE, v * PUDDLE_TILE) - 0.5,
        at(wear, u, v) - 0.5,
        at(grain, u * 7, v * 7),
      ))
    }

  return out
}

function cover (wet: number, field: readonly number[]): number {
  const level = puddleLevel(wet)

  return field.filter(depth => depth > level).length / field.length
}

describe('where the rain stands', () => {
  const field = hollows()

  test('dry ground holds no water, however deep its hollows', () => {
    expect(cover(0, field)).toBe(0)
    expect(puddleLevel(0)).toBe(PUDDLE_DRY)
    expect(puddleLevel(1)).toBeCloseTo(PUDDLE_DRY - PUDDLE_FILL, 6)
  })

  test('the water line rises with the wet, and never past a quarter of the ground', () => {
    const steps = [ 0.2, 0.4, 0.62, 0.8, 1 ].map(wet => cover(wet, field))

    for (let i = 1; i < steps.length; i++)
      expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1])

    // The authored shower (`weather.wet` 0.62): puddles, not a flood.
    expect(cover(0.62, field)).toBeGreaterThan(0.03)
    expect(cover(0.62, field)).toBeLessThan(0.16)
    expect(cover(1, field)).toBeLessThan(0.3)
  })

  test('deterministic: the same seed lays the same hollows', () => {
    expect(hollows()).toEqual(field)
  })
})

describe('what the ground program is given', () => {
  function fragment (detailTaps: number): string {
    const materials = createScapeMaterials(() => SCAPE_CONFIG, NOTHING_SKIPPED, detailTaps)
    const ground    = materials.ground as MeshStandardMaterial
    const program   = {
      uniforms:       {} as Record<string, unknown>,
      vertexShader:   '#include <common>\n#include <project_vertex>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <color_fragment>\n#include <normal_fragment_begin>\n#include <opaque_fragment>',
    }

    ground.onBeforeCompile?.(program as unknown as WebGLProgramParametersWithUniforms, undefined as never)
    materials.dispose()

    expect(program.uniforms).toHaveProperty('uSkyHorizon')
    return program.fragmentShader
  }

  test('the full program fills its hollows and mirrors the sky in them', () => {
    const full = fragment(6)

    expect(full).toContain('scapePool')
    expect(full).toContain('scapeOnBed')
    expect(full).toContain('uSkyHorizon')
    expect(full.indexOf('scapePuddle')).toBeLessThan(full.indexOf('#include <opaque_fragment>'))
  })

  test('the one-tap program keeps the sheen and stands no water', () => {
    const lite = fragment(1)

    expect(lite).not.toContain('scapePool')
    expect(lite).toContain('float scapePuddle = 0.0;')
    expect(lite).toContain('uSkyHorizon')
  })
})
