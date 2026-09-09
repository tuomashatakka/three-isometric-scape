import { describe, expect, test } from 'bun:test'
import type { MeshStandardMaterial, WebGLProgramParametersWithUniforms } from 'three'
import { NOTHING_SKIPPED } from '../audit.ts'
import { SCAPE_CONFIG } from '../config.ts'
import { SNOW_BAND, SNOW_WANDER, WANDER_ACROSS, WANDER_ALONG } from '../landscape/drift.ts'
import { createSeason } from '../season.ts'
import { createWeather } from '../weather.ts'
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


describe('the two compasses the snow line swings on', () => {
  test('both ride in the varying the ground already emits, rather than one each', () => {
    const { ground } = compiledPair()

    // One `vec3` and no companion floats: a driver that packs before it
    // eliminates gives a lone float a whole slot, so the second and third
    // components are free where two more varyings would not have been — and a
    // `vec3` occupies the slot the `vec2` already had.
    expect(ground.vertexShader).toContain('varying vec3 vScapeFace;')
    expect(ground.vertexShader).not.toContain('varying float vScape')
    expect(ground.fragmentShader).toContain('varying vec3 vScapeFace;')
  })

  test('moves the line itself, so a thaw eats the sunward face first', () => {
    const { ground } = compiledPair()

    // The claim: the aspect shifts the height snow starts at, and it is not a
    // second multiplier on the cover. A `mix` against `scapeSnow` would fade a
    // snow field out where this eats it from the bottom.
    expect(ground.fragmentShader).toContain(
      'float scapeLine = uSeasonSnowLine - uSeasonAspect * (vScapeFace.y) - uSeasonDrift * (vScapeFace.z);'
    )
    expect(ground.fragmentShader).toContain('smoothstep(\n    scapeLine,\n    scapeLine + 1.6,')
  })

  test('takes the band and the wander from the module the survey measures with', () => {
    const { ground } = compiledPair()

    // The one thing a mirrored rule cannot be trusted about is its numbers, so
    // they are not written here twice — the program is built from the same
    // exports `measureDrift` shapes the cover with, and this states that the
    // interpolation actually happened rather than that the two happen to match.
    expect(ground.fragmentShader).toContain(`scapeLine + ${SNOW_BAND},`)
    expect(ground.fragmentShader).toContain(`scapeWander * ${SNOW_WANDER}`)
    expect(ground.fragmentShader).toContain(
      `sin(vScapeGround.x * ${WANDER_ALONG}) * cos(vScapeGround.y * ${WANDER_ACROSS})`
    )
  })

  test('the lee is the smoother surface, because a drift is packed and a dusting is not', () => {
    const { ground } = compiledPair()

    // Weighted by the cover rather than applied beside it: ground with no snow
    // on it has no drift to be smooth, whichever way it faces.
    expect(ground.fragmentShader).toContain('mix(0.78, 0.56, clamp(vScapeFace.z, 0.0, 1.0)),')
    expect(ground.fragmentShader).toContain('    scapeSnow\n  );')
  })

  test('is read by nothing that cannot answer it', () => {
    const { foliage } = compiledPair()

    // Foliage has no normal varying and never declares one, so its season has
    // to resolve both bearings to a constant rather than to a name that is not
    // there. A shader that referenced one would not link at all.
    expect(foliage.vertexShader).not.toContain('vScapeFace')
    expect(foliage.fragmentShader).not.toContain('vScapeFace')
    expect(foliage.fragmentShader).toContain('uSeasonAspect * (0.0)')
    expect(foliage.fragmentShader).toContain('uSeasonDrift * (0.0)')
  })

  test('has both compasses on both programs, because the vertex stage is what reads them', () => {
    const { ground, foliage } = compiledPair()

    expect(ground.uniforms.uShadeDir).toBeDefined()
    expect(ground.uniforms.uDriftDir).toBeDefined()
    expect(foliage.uniforms.uShadeDir).toBeDefined()
    expect(foliage.uniforms.uDriftDir).toBeDefined()
    expect(ground.vertexShader).toContain('uniform vec2 uShadeDir;')
    expect(ground.vertexShader).toContain('uniform vec2 uDriftDir;')
  })

  test('the weather bearing is the base one, not the gust the grass sways on', () => {
    const materials = createScapeMaterials(() => SCAPE_CONFIG, NOTHING_SKIPPED, 6, undefined, 6)
    const uniforms  = {} as Record<string, { value: { x: number, y: number }}>
    const program   = {
      uniforms,
      vertexShader:   '#include <common>\n#include <project_vertex>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <color_fragment>\n#include <normal_fragment_begin>',
    }

    materials.ground.onBeforeCompile?.(program as unknown as WebGLProgramParametersWithUniforms, undefined as never)

    // A drift is a winter's worth of weather. `wind.ts` veers the live bearing
    // by a few degrees at every gust, and a hillside that changed shape with it
    // would be a hillside breathing — so the state handed in here is a veered
    // one and the compass has to ignore it.
    const veered  = SCAPE_CONFIG.wind.bearing + 40
    const bearing = SCAPE_CONFIG.wind.bearing * Math.PI / 180

    materials.update(
      {
        phase:    0,
        bearing:  veered * Math.PI / 180,
        dirX:     Math.cos(veered * Math.PI / 180),
        dirZ:     Math.sin(veered * Math.PI / 180),
        base:     0.5,
        gust:     0,
        strength: 0.5,
        travel:   0,
      },
      createSeason(() => SCAPE_CONFIG).state,
      createWeather(() => SCAPE_CONFIG).state,
    )

    expect(uniforms.uDriftDir.value.x).toBeCloseTo(Math.cos(bearing), 12)
    expect(uniforms.uDriftDir.value.y).toBeCloseTo(Math.sin(bearing), 12)
    materials.dispose()
  })
})
