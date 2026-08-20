import { describe, expect, test } from 'bun:test'
import type { MeshStandardMaterial, WebGLProgramParametersWithUniforms } from 'three'
import { NOTHING_SKIPPED } from '../audit.ts'
import { SCAPE_CONFIG } from '../config.ts'
import { createScapeMaterials } from './material.ts'


/**
 * The program three would compile, without a gl context to compile it in.
 *
 * `onBeforeCompile` is a pure text transform over the shader chunks, so handing
 * it the include markers it looks for is enough to read out exactly what the
 * driver would be given.
 */
type CompiledReturnType = {
  fragment: string
  key:      string
}

function compiled (detailTaps: number, reliefSteps: number): CompiledReturnType {
  const materials = createScapeMaterials(
    () => SCAPE_CONFIG,
    NOTHING_SKIPPED,
    detailTaps,
    undefined,
    reliefSteps,
  )
  const ground  = materials.ground as MeshStandardMaterial
  const program = {
    uniforms:       {},
    vertexShader:   '#include <common>\n#include <project_vertex>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <color_fragment>\n#include <normal_fragment_begin>',
  }

  ground.onBeforeCompile?.(program as unknown as WebGLProgramParametersWithUniforms, undefined as never)

  const answer = {
    fragment: program.fragmentShader,
    key:      ground.customProgramCacheKey?.() ?? '',
  }

  materials.dispose()
  return answer
}


describe('what the ground material actually compiles', () => {
  test('the full tap budget reads the baked normal and marches the relief', () => {
    const { fragment } = compiled(6, 6)

    expect(fragment).toContain('uGroundNormalMap')
    expect(fragment).toContain('scapeStep')
    expect(fragment).toContain('uWearMap')
  })

  test('relief at zero keeps the normal map and drops only the march', () => {
    const { fragment } = compiled(6, 0)

    expect(fragment).toContain('uGroundNormalMap')
    expect(fragment).not.toContain('scapeStep')
  })

  /**
   * The trap this file was written for.
   *
   * `scape:shot` and `scape:diff` default to `--tier mobile`, and mobile spends
   * one tap. Neither the normal map nor the march exists in that program — so a
   * change to either photographs as *exactly* 0.00% on every pose at the default
   * tier, which is the gate working and looks precisely like the effect not
   * existing. Stated here as a fact about the shader rather than left to be
   * rediscovered from an identical png.
   */
  test('the one-tap path has neither, whatever the relief count says', () => {
    const { fragment } = compiled(1, 12)

    expect(fragment).not.toContain('uGroundNormalMap')
    expect(fragment).not.toContain('scapeStep')
  })

  test('the step count is in the cache key, because an unrolled loop is not in the shader three sees', () => {
    // Two materials that differ only by an injected loop bound are identical as
    // far as three's own program cache is concerned, and it would hand the
    // second one the first one's program.
    expect(compiled(6, 6).key).not.toBe(compiled(6, 12).key)
    expect(compiled(6, 6).key).not.toBe(compiled(6, 0).key)
    expect(compiled(6, 6).key).toBe(compiled(6, 6).key)
  })

  test('the march is spliced ahead of every fetch it is meant to offset', () => {
    // A march that ran after the grain was already sampled would cost its taps
    // and move nothing — which is a failure with no symptom at all.
    const { fragment } = compiled(6, 6)

    expect(fragment.indexOf('scapeStep')).toBeLessThan(fragment.indexOf('texture2D(uDetailMap'))
    expect(fragment.indexOf('scapeStep')).toBeLessThan(fragment.indexOf('texture2D(uWearMap'))
  })
})
