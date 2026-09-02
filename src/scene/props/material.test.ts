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

/** Both programs, and the uniforms three would be handed with each. */
function compiledPair () {
  const materials = createScapeMaterials(() => SCAPE_CONFIG, NOTHING_SKIPPED, 6, undefined, 6)

  const read = (material: MeshStandardMaterial) => {
    const program = {
      uniforms:       {} as Record<string, unknown>,
      vertexShader:   '#include <common>\n#include <project_vertex>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <color_fragment>\n#include <normal_fragment_begin>',
    }

    material.onBeforeCompile?.(program as unknown as WebGLProgramParametersWithUniforms, undefined as never)

    return program
  }

  const answer = {
    ground:  read(materials.ground),
    foliage: read(materials.foliage),
  }

  materials.dispose()
  return answer
}


describe('the aspect the snow line swings on', () => {
  test('rides in the varying the ground already emits, rather than a second one', () => {
    const { ground } = compiledPair()

    // One `vec2` and no companion float: a driver that packs before it
    // eliminates gives a lone float a whole slot, so the second component is
    // free where a second varying would not have been.
    expect(ground.vertexShader).toContain('varying vec2 vScapeFace;')
    expect(ground.vertexShader).not.toContain('varying float vScape')
    expect(ground.fragmentShader).toContain('varying vec2 vScapeFace;')
  })

  test('moves the line itself, so a thaw eats the sunward face first', () => {
    const { ground } = compiledPair()

    // The claim: the aspect shifts the height snow starts at, and it is not a
    // second multiplier on the cover. A `mix` against `scapeSnow` would fade a
    // snow field out where this eats it from the bottom.
    expect(ground.fragmentShader).toContain('float scapeLine = uSeasonSnowLine - uSeasonAspect * (vScapeFace.y);')
    expect(ground.fragmentShader).toContain('smoothstep(\n    scapeLine,\n    scapeLine + 1.6,')
  })

  test('is read by nothing that cannot answer it', () => {
    const { foliage } = compiledPair()

    // Foliage has no normal varying and never declares one, so its season has
    // to resolve the aspect to a constant rather than to a name that is not
    // there. A shader that referenced it would not link at all.
    expect(foliage.vertexShader).not.toContain('vScapeFace')
    expect(foliage.fragmentShader).not.toContain('vScapeFace')
    expect(foliage.fragmentShader).toContain('uSeasonAspect * (0.0)')
  })

  test('has a compass on both programs, because the vertex stage is what reads it', () => {
    const { ground, foliage } = compiledPair()

    expect(ground.uniforms.uShadeDir).toBeDefined()
    expect(foliage.uniforms.uShadeDir).toBeDefined()
    expect(ground.vertexShader).toContain('uniform vec2 uShadeDir;')
  })
})
