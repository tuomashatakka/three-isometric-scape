import { describe, expect, test } from 'bun:test'
import type { IUniform } from 'three'
import { SCAPE_CONFIG } from '../config.ts'
import type { ScapeConfig } from '../config.ts'
import type { TideState } from '../tide.ts'
import type { GroundNormal } from './height.ts'
import type { WindState } from '../wind.ts'
import {
  SWASH_BAND,
  SWASH_DRY,
  SWASH_FLOOR,
  SWASH_FRAGMENT,
  SWASH_SUBMERGED,
  measureSwash,
  setSwash,
  swashExposure,
  swashGrade,
  swashLift,
  swashRun,
  swashState,
  swashSteepness,
  swashWalk,
} from './swash.ts'
import type { SwashField } from './swash.ts'
import { swellBearings, swellRate, swellWavenumber } from './swell.ts'


const { waveHeight, swellLength } = SCAPE_CONFIG.water
const { reach, steep }            = SCAPE_CONFIG.swash

/** A wind at rest, pointed along +x. */
const CALM: WindState = {
  phase:    0,
  bearing:  0,
  dirX:     1,
  dirZ:     0,
  base:     0,
  gust:     0,
  strength: 0,
  travel:   0,
}

/** Mean water, at the top of nothing. */
const SLACK: TideState = { level: 0, phase: 0, amplitude: 0, spring: 0, stream: 0 }

/**
 * A cone of land standing out of the sea at the origin.
 *
 * A field rather than the archipelago's, because what the survey has to be
 * tested on is a shore whose gradient is known in closed form: this one rises
 * one metre in four, everywhere, so the run-up it reports can be checked
 * against `swashRun` by hand rather than against itself.
 */
function cone (slope: number, radius: number): SwashField {
  return {
    heightAt (x: number, z: number): number {
      return (radius - Math.hypot(x, z)) * slope
    },
    normalAt (x: number, z: number, target: GroundNormal): GroundNormal {
      const away = Math.max(1e-6, Math.hypot(x, z))
      const unit = 1 / Math.hypot(slope, 1)

      target.x = x / away * slope * unit
      target.y = unit
      target.z = z / away * slope * unit

      return target
    },
    landmassAt (x: number, z: number): { id: string } | null {
      return Math.hypot(x, z) < radius ? { id: 'cone' } : null
    },
  }
}

describe('the run-up', () => {
  test('is the swell\'s own number, not a width anybody chose', () => {
    // Hunt's relation, written out: R = H * tanB / sqrt(H / L). At a gradient
    // under the ceiling the three numbers on the right are the whole of it, and
    // none of them is in `config-swash.ts`.
    const grade = 0.1
    const hunt  = waveHeight * grade * Math.sqrt(swellLength / waveHeight)

    expect(swashSteepness(waveHeight, swellLength)).toBeCloseTo(Math.sqrt(swellLength / waveHeight), 12)
    expect(swashRun(grade, waveHeight, swellLength, 1, 99)).toBeCloseTo(hunt, 12)
  })

  test('walks the same distance across any beach the fit still holds on', () => {
    // The claim, stated as a fact about the data rather than re-derived: under
    // the ceiling the gradient cancels out of `R / tanB` exactly, so a shingle
    // bank at 1:12 and a sand flat at 1:40 are wetted the same number of metres
    // inland by the same sea — sqrt(H * L), which is 6.2 m at the authored one.
    const flat = Math.sqrt(waveHeight * swellLength)

    for (const grade of [ 1 / 12, 1 / 20, 1 / 40, 1 / 80 ]) {
      const run = swashRun(grade, waveHeight, swellLength, 1, 99)

      expect(swashWalk(grade, run)).toBeCloseTo(flat, 9)
    }
  })

  test('stops climbing at the ceiling and only then starts narrowing', () => {
    const gentle = swashRun(0.05, waveHeight, swellLength, 1, steep)
    const sheer  = swashRun(2.6, waveHeight, swellLength, 1, steep)
    const cliff  = swashRun(5.2, waveHeight, swellLength, 1, steep)

    // Under the ceiling it answers the slope; over it, two coasts a factor of
    // two apart in gradient run up to exactly the same height.
    expect(gentle).toBeLessThan(sheer)
    expect(sheer).toBeCloseTo(waveHeight * steep, 12)
    expect(cliff).toBeCloseTo(sheer, 12)

    // And the band narrows as the ground stands up, which is what makes a crag
    // a splash zone rather than a tide mark two storeys up.
    expect(swashWalk(5.2, cliff)).toBeCloseTo(swashWalk(2.6, sheer) / 2, 9)
  })

  test('is a switch at zero, and a gradient of zero has no sea on it', () => {
    expect(swashRun(0.3, waveHeight, swellLength, 0, steep)).toBe(0)
    expect(swashRun(0, waveHeight, swellLength, reach, steep)).toBe(0)
    expect(swashRun(0.3, 0, swellLength, reach, steep)).toBe(0)
  })

  test('is stable byte for byte at a given sea', () => {
    const once  = swashRun(0.137, waveHeight, swellLength, reach, steep)
    const twice = swashRun(0.137, waveHeight, swellLength, reach, steep)

    expect(once).toBe(twice)
    expect(Number.isFinite(once)).toBe(true)
  })
})

describe('the ground it is measured on', () => {
  test('reads a gradient off a unit normal, and guards the quotient', () => {
    expect(swashGrade(1)).toBe(0)
    expect(swashGrade(Math.SQRT1_2)).toBeCloseTo(1, 9)

    // A face lying flat enough to divide by nothing still divides by the floor.
    expect(swashGrade(0)).toBeCloseTo(1 / SWASH_FLOOR, 9)
    expect(Number.isFinite(swashGrade(0))).toBe(true)
  })

  test('keeps the lee of an island wetter than nothing and drier than the weather shore', () => {
    const { lee } = SCAPE_CONFIG.swash

    expect(swashExposure(-1, lee)).toBeCloseTo(1, 12)
    expect(swashExposure(1, lee)).toBeCloseTo(lee, 12)
    expect(swashExposure(0, lee)).toBeCloseTo((1 + lee) / 2, 12)
    expect(swashExposure(1, 0)).toBe(0)
  })

  test('lifts with the gust and never falls below the calm three quarters', () => {
    expect(swashLift(0)).toBeCloseTo(0.75, 12)
    expect(swashLift(0.9)).toBeGreaterThan(swashLift(0))
    expect(swashLift(99)).toBeCloseTo(swashLift(1.6), 12)
  })
})

describe('the shore, surveyed', () => {
  test('finds a band on a cone whose gradient is known in closed form', () => {
    const slope  = 0.25
    const survey = measureSwash(cone(slope, 300), SCAPE_CONFIG, 800, 160)
    const hand   = swashRun(slope, waveHeight, swellLength, reach, steep)

    expect(survey.shore).toBeGreaterThan(0)
    expect(survey.wetted).toBeGreaterThan(0)
    expect(survey.run).toBeCloseTo(Math.round(hand * 100) / 100, 2)
    expect(survey.walk).toBeCloseTo(Math.round(hand / slope * 100) / 100, 2)
    expect(survey.grade).toBeCloseTo(slope, 2)
  })

  test('reports a dry coast rather than an empty one when the switch is off', () => {
    const dry: ScapeConfig = { ...SCAPE_CONFIG, swash: { ...SCAPE_CONFIG.swash, reach: 0 }}
    const survey           = measureSwash(cone(0.25, 300), dry, 800, 160)

    // The littoral is still there and still counted — which is the difference
    // between a band that has been switched off and a survey that has lost the
    // coast it was measuring.
    expect(survey.shore).toBeGreaterThan(0)
    expect(survey.wetted).toBe(0)
    expect(survey.tallest).toBe(0)
  })

  test('is stable run to run', () => {
    const field = cone(0.25, 300)

    expect(measureSwash(field, SCAPE_CONFIG, 800, 120))
      .toEqual(measureSwash(field, SCAPE_CONFIG, 800, 120))
  })
})

describe('the instant the shore is drawn at', () => {
  test('puts the band on the live waterline rather than on mean water', () => {
    const flood = swashState(SCAPE_CONFIG, { ...SLACK, level: 0.4 }, CALM, 0)

    expect(flood.level).toBeCloseTo(SCAPE_CONFIG.terrain.waterLevel + 0.4, 12)
  })

  test('carries the swell the lake is actually drawing, phase and all', () => {
    const { swellLength, swellSpread } = SCAPE_CONFIG.water
    const state                        = swashState(SCAPE_CONFIG, SLACK, CALM, 3)
    const bearing                      = swellBearings(swellSpread, CALM.dirX, CALM.dirZ)[0]

    // The dominant train, read exactly as `scapeWave` reads it: the clock
    // through the deep-water dispersion, the wavenumber off the same
    // wavelength, and the fan's own first bearing. A shore that resolved any
    // one of the three for itself would be a second sea.
    expect(state.phase).toBeCloseTo(3 * swellRate(swellLength), 12)
    expect(state.wavenumber).toBeCloseTo(swellWavenumber(swellLength), 12)
    expect(state.runX).toBeCloseTo(bearing[0], 12)
    expect(state.runZ).toBeCloseTo(bearing[1], 12)
    expect(state.height).toBeCloseTo(waveHeight * swashLift(0), 12)
  })

  test('has a dry reading for a material with no lake under it', () => {
    expect(SWASH_DRY.height).toBe(0)
    expect(SWASH_DRY.wavenumber).toBe(0)
  })

  test('writes every uniform the program declares', () => {
    const uniforms: Record<string, IUniform> = {}

    for (const name of SWASH_PARS_NAMES)
      uniforms[name] = { value: null }

    setSwash(uniforms, swashState(SCAPE_CONFIG, SLACK, CALM, 2), SCAPE_CONFIG.swash)

    for (const name of SWASH_PARS_NAMES)
      expect(uniforms[name].value).not.toBeNull()
  })
})

/**
 * Every float uniform the chunk declares, read out of the chunk itself.
 *
 * So that a uniform added to the shader and forgotten in `setSwash` fails here
 * rather than drawing as whatever `undefined` becomes on the driver.
 */
const SWASH_PARS_NAMES = [ ...SWASH_FRAGMENT.matchAll(/\buSwash[A-Z]\w*/g) ]
  .map(match => match[0])
  .filter(name => name !== 'uSwashFoamColor' && name !== 'uSwashRun')

describe('the shader is a mirror rather than a copy', () => {
  test('shapes the band with the module\'s own constants', () => {
    expect(SWASH_FRAGMENT).toContain(String(SWASH_BAND))
    expect(SWASH_FRAGMENT).toContain(String(SWASH_SUBMERGED))
    expect(SWASH_FRAGMENT).toContain(String(SWASH_FLOOR))
  })

  test('reads the face varying the ground already carries, and fetches nothing', () => {
    expect(SWASH_FRAGMENT).toContain('vScapeFace.x')
    expect(SWASH_FRAGMENT).toContain('vScapeFace.z')
    expect(SWASH_FRAGMENT).toContain('scapeAltitude')
    expect(SWASH_FRAGMENT).not.toContain('texture2D')
  })
})
