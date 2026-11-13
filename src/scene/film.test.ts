import { describe, expect, it } from 'bun:test'
import { ACESFilmicToneMapping, CustomToneMapping, NoToneMapping, ShaderChunk } from 'three'
import type { WebGLRenderer } from 'three'
import {
  CONTRAST_REACH,
  DYE_DENSITY,
  EXPOSURE_SPAN,
  FILM_GLSL,
  FILM_SHOULDER,
  LIGHT_TINT,
  MID_GREY,
  SHADE_TINT,
  SHOULDER_PULL,
  STOCK,
  STOCK_GAIN,
  dyeDensity,
  film,
  gradeContrast,
  installDirectFilm,
  packExposure,
  shoulder,
  splitTone,
  stock,
  unpackExposure,
} from './film.ts'
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

describe('the film shoulder', () => {
  it('leaves everything under paper white alone, and a zero grade', () => {
    expect(shoulder(0.5, 1)).toBe(0)
    expect(shoulder(FILM_SHOULDER[0], 1)).toBe(0)
    expect(shoulder(3, 0)).toBe(0)
  })

  it('takes more colour the brighter the highlight, never all of it', () => {
    let last = 0
    for (let l = 0.7; l <= 3; l += 0.1) {
      const pull = shoulder(l, 1)
      expect(pull).toBeGreaterThanOrEqual(last)
      last = pull
    }
    expect(last).toBeCloseTo(SHOULDER_PULL, 6)
    expect(last).toBeLessThan(1)
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

  it('turns contrast about mid-grey, and no further than its reach', () => {
    expect(gradeContrast(0)).toBe(1)
    expect(gradeContrast(1)).toBeCloseTo(1 + CONTRAST_REACH)
    expect(gradeContrast(5)).toBeCloseTo(1 + CONTRAST_REACH)
    expect(gradeContrast(-1)).toBe(1)
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

  it('leaves the stock\'s shade cooler than its light', () => {
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

  it('casts the stock without brightening its brightest channel', () => {
    expect(Math.max(...STOCK_GAIN)).toBe(1)
    expect(Math.min(...STOCK_GAIN)).toBeGreaterThan(0.8)
  })
})

describe('the film on a tier with no post chain', () => {
  it('carries exposure and strength through one uniform', () => {
    for (const exposure of [ 0.4, 0.98, 1.6 ])
      for (const strength of [ 0, 0.37, 0.78, 1 ]) {
        const back = unpackExposure(packExposure(exposure, strength))
        expect(back.exposure).toBeCloseTo(exposure, 5)
        expect(back.strength).toBeCloseTo(strength, 2)
      }
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
    expect(chunk).toContain('ACESFilmicToneMapping( color * ( exposure')
    expect(chunk).not.toContain('CustomToneMapping( vec3 color ) { return color; }')
  })

  it('leaves a tier with a chain on the plain curve, and its lens on the same function', () => {
    const renderer = { toneMapping: NoToneMapping } as unknown as WebGLRenderer
    installDirectFilm(renderer, false)
    expect(renderer.toneMapping).toBe(ACESFilmicToneMapping)

    const lens = createLensPass({ taps: 0, grain: false, defocus: null })
    expect(lens.material.fragmentShader).toContain(FILM_GLSL)
    expect(lens.material.fragmentShader).not.toContain('sampler3D')
  })
})

describe('the stock', () => {
  it('keeps detail in the deep shade instead of crushing it to the lift', () => {
    const luma = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    const deep = luma(stock([ 0.02, 0.02, 0.02 ]))
    const dark = luma(stock([ 0.05, 0.05, 0.05 ]))
    expect(deep).toBeGreaterThan(STOCK.lift)
    expect(dark - deep).toBeGreaterThan(0.015)
  })

  it('all but leaves mid-grey where the exposure put it', () => {
    const [ , g ] = stock([ MID_GREY, MID_GREY, MID_GREY ])
    expect(Math.abs(g - MID_GREY)).toBeLessThan(0.03)
  })
})
