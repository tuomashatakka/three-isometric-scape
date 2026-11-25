import { describe, expect, it } from 'bun:test'
import { AgXToneMapping, CustomToneMapping, NoToneMapping, ShaderChunk } from 'three'
import type { WebGLRenderer } from 'three'
import {
  gradeAmount,
  CONTRAST_REACH,
  DYE_DENSITY,
  EXPOSURE_SPAN,
  FRAME_VARYING,
  LENS_VIGNETTE,
  FILM_GLSL,
  LIGHT_TINT,
  MID_GREY,
  SHADE_TINT,
  dyeDensity,
  film,
  installDirectFilm,
  packExposure,
  splitTone,
  unpackExposure,
  vignette,
} from './film.ts'
import { installAerialPerspective } from './aerial.ts'
import { createLensPass } from './lens.ts'


const channels = [ 0, 1, 2 ] as const

describe('the split tone', () => {
  it('leaves the mid-tones and a zero strength alone', () => {
    for (const channel of channels) {
      expect(splitTone(0.3, channel, 1)).toBe(1)
      expect(splitTone(0.01, channel, 0)).toBe(1)
    }
  })

  it('cools the shade and warms the light', () => {
    expect(splitTone(0, 2, 1)).toBeGreaterThan(splitTone(0, 0, 1))
    expect(splitTone(2, 0, 1)).toBeGreaterThan(splitTone(2, 2, 1))
  })

  it('does not change how bright either end is', () => {
    const luma = (tint: readonly number[]) => 0.2126 * tint[0] + 0.7152 * tint[1] + 0.0722 * tint[2]
    expect(luma(SHADE_TINT)).toBeCloseTo(1, 1)
    expect(luma(LIGHT_TINT)).toBeCloseTo(1, 1)
  })
})

describe('the dye density', () => {
  it('leaves a grey and a zero grade alone', () => {
    expect(dyeDensity(0, 1)).toBe(1)
    expect(dyeDensity(1, 0)).toBe(1)
  })

  it('prints a saturated colour darker than a pale one of the same luminance', () => {
    const luminance = (c: readonly number[]): number => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722
    const pale      = [ 0.2, 0.22, 0.2 ] as const
    const scale     = luminance(pale) / luminance([ 0.05, 0.3, 0.02 ])
    const moss      = [ 0.05 * scale, 0.3 * scale, 0.02 * scale ] as const

    expect(luminance(moss)).toBeCloseTo(luminance(pale), 6)
    expect(luminance(film(moss, 1))).toBeLessThan(luminance(film(pale, 1)) * 0.92)
  })

  it('never takes more than its density, and the shader carries the same number', () => {
    expect(dyeDensity(4, 4)).toBeCloseTo(1 - DYE_DENSITY, 9)
    expect(FILM_GLSL).toContain(`1.0 - ${DYE_DENSITY.toFixed(2)} * clamp((peak`)
  })
})

describe('the grade as a whole', () => {
  const grey = (value: number) => [ value, value, value ] as const

  it('turns contrast about mid-grey as a power: the pivot and black stay put', () => {
    expect(film(grey(MID_GREY), 1)[1]).toBeCloseTo(MID_GREY, 2)
    expect(film(grey(0), 1)[1]).toBe(0)

    const luma = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    // A shade at a third of mid-grey loses no more than its reach in stops.
    const shade = luma(film(grey(0.06), 1)) / 0.06
    expect(shade).toBeLessThan(1)
    expect(shade).toBeGreaterThan(Math.pow(1 / 3, CONTRAST_REACH) * 0.9)
  })

  it('is the raw render for a grey at strength zero', () => {
    for (const value of [ 0, 0.05, MID_GREY, 0.6, 1, 3 ])
      for (const channel of film(grey(value), 0))
        expect(channel).toBeCloseTo(value, 6)
  })

  it('deepens the shade and lifts the light — depth in the grey', () => {
    const luma = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    const dark = luma(film(grey(0.08), 0.78))
    const lit  = luma(film(grey(0.5), 0.78))
    expect(lit - dark).toBeGreaterThan(0.5 - 0.08)
  })

  it('leaves the print\'s shade cooler than its light', () => {
    const [ r, , b ]   = film(grey(0.03), 1)
    const [ lr, , lb ] = film(grey(0.9), 1)
    expect(b).toBeGreaterThan(r)
    expect(lr / lb).toBeGreaterThan(r / b)
  })

  it('never returns a negative or non-finite channel', () => {
    for (const strength of [ 0, 0.5, 1 ])
      for (const colour of [[ 0, 0, 0 ], [ 8, 0, 0 ], [ 0.2, 0.9, 0.1 ], [ 4, 4, 4 ]] as const)
        for (const channel of film(colour, strength)) {
          expect(Number.isFinite(channel)).toBe(true)
          expect(channel).toBeGreaterThanOrEqual(0)
        }
  })
})

describe('the film on a tier with no post chain', () => {
  it('carries exposure, grade and lens through one uniform', () => {
    for (const exposure of [ 0.4, 0.98, 1.6 ])
      for (const strength of [ 0, 0.37, 0.78, 1 ])
        for (const lens of [ 0, 0.35, 1 ]) {
          // As the gpu holds it: a 32-bit float.
          const back = unpackExposure(Math.fround(packExposure(exposure, strength, lens)))
          expect(back.exposure).toBeCloseTo(exposure, 2)
          expect(back.strength).toBeCloseTo(strength, 2)
          expect(back.lens).toBeCloseTo(lens, 5)
        }

    expect(packExposure(EXPOSURE_SPAN, 1, 1)).toBeLessThan(2 ** 14)
  })

  it('gives the frame a place on the direct path: a vignette off the aerial varying, and grain off the pixel grid', () => {
    installDirectFilm({ toneMapping: NoToneMapping } as unknown as WebGLRenderer, true)
    installAerialPerspective(60)

    const chunk = ShaderChunk.tonemapping_pars_fragment
    expect(chunk).toContain(`varying vec3 ${FRAME_VARYING}`)
    expect(chunk).toContain('gl_FragCoord')
    expect(ShaderChunk.fog_pars_vertex).toContain(`varying vec3 ${FRAME_VARYING}`)
    expect(ShaderChunk.fog_vertex).toContain(`${FRAME_VARYING} = gl_Position.xyw`)

    // The centre keeps all its light; a corner of a square frame gives up about a fifth at full lens.
    expect(vignette(0, LENS_VIGNETTE)).toBe(1)
    expect(vignette(0.5, LENS_VIGNETTE)).toBeGreaterThan(0.75)
    expect(vignette(0.5, LENS_VIGNETTE)).toBeLessThan(0.9)
    expect(vignette(0.5, 0)).toBe(1)
  })

  it('keeps an out-of-range exposure from bleeding into the strength', () => {
    expect(unpackExposure(packExposure(EXPOSURE_SPAN * 3, 0.5)).strength).toBe(0.5)
    expect(unpackExposure(packExposure(-1, 0.5)).strength).toBe(0.5)
  })

  it('develops inside the materials: the film, then the curve the bare renderer ran', () => {
    const renderer = { toneMapping: NoToneMapping } as unknown as WebGLRenderer

    installDirectFilm(renderer, true)
    installDirectFilm(renderer, true)

    const chunk = ShaderChunk.tonemapping_pars_fragment
    expect(renderer.toneMapping).toBe(CustomToneMapping)
    expect(chunk.split('vec3 scapeFilm').length).toBe(2)
    expect(chunk).toContain('AgXToneMapping( color * ( exposure')
    expect(chunk).not.toContain('CustomToneMapping( vec3 color ) { return color; }')
  })

  it('leaves a tier with a chain on the plain curve, and its lens on the same function', () => {
    const renderer = { toneMapping: NoToneMapping } as unknown as WebGLRenderer
    installDirectFilm(renderer, false)
    expect(renderer.toneMapping).toBe(AgXToneMapping)

    const lens = createLensPass({ taps: 0, grain: false, defocus: null })
    expect(lens.material.fragmentShader).toContain(FILM_GLSL)
    expect(lens.material.fragmentShader).not.toContain('sampler3D')
  })
})

describe('one curve', () => {
  it('develops the frame once: no second curve or display-space stock ahead of AgX', () => {
    expect(FILM_GLSL).not.toContain('sqrt')
    expect(FILM_GLSL).not.toContain('ACES')
    expect(ShaderChunk.tonemapping_pars_fragment.split('AgXToneMapping( color * ( exposure').length).toBe(2)
  })

  it('keeps detail in the deep shade: a wall at 2% and one at 5% stay apart', () => {
    const luma = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    const deep = luma(film([ 0.02, 0.02, 0.02 ], 1))
    const dark = luma(film([ 0.05, 0.05, 0.05 ], 1))
    expect(dark / deep).toBeGreaterThan(2.2)
  })
})

describe('the camera row', () => {
  it('carries the grade up to a full camera, and the glass alone past it', () => {
    expect(gradeAmount({ intensity: 0.8, lens: 1 })).toBeCloseTo(0.8, 6)
    expect(gradeAmount({ intensity: 0.8, lens: 2 })).toBeCloseTo(0.8, 6)
    expect(gradeAmount({ intensity: 0.8, lens: 0.5 })).toBeCloseTo(0.4, 6)
    expect(gradeAmount({ intensity: 0.8, lens: 0 })).toBe(0)
  })
})
