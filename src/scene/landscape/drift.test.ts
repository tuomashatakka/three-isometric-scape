import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import type { ScapeConfig } from '../config.ts'
import { surveyArchipelago } from './archipelago.ts'
import { faceAmount } from './aspect.ts'
import {
  SNOW_BAND,
  driftDirection,
  measureDrift,
  snowCover,
  snowLineAt,
  snowWander,
} from './drift.ts'
import type { GroundNormal } from './height.ts'


const survey = surveyArchipelago(SCAPE_CONFIG)

/** A unit normal leaning `lean` of the way over onto a ground-plane direction. */
type DirectionType = { x: number, z: number }

function turned (direction: DirectionType, lean: number): GroundNormal {
  return {
    x: direction.x * lean,
    y: Math.sqrt(Math.max(0, 1 - lean * lean)),
    z: direction.z * lean,
  }
}

function withSeason (patch: Partial<ScapeConfig['season']>): ScapeConfig {
  return { ...SCAPE_CONFIG, season: { ...SCAPE_CONFIG.season, ...patch }}
}

/** The world's own extent, which is what the survey walks. */
const WORLD = SCAPE_CONFIG.archipelago.worldSize

describe('the bearing the weather comes on', () => {
  test('is the direction the wind blows toward, which is the way a lee face points', () => {
    const lee = driftDirection(41)

    expect(lee.x).toBeCloseTo(Math.cos(41 * Math.PI / 180), 12)
    expect(lee.z).toBeCloseTo(Math.sin(41 * Math.PI / 180), 12)
    expect(Math.hypot(lee.x, lee.z)).toBeCloseTo(1, 12)
  })

  test('writes into the record it is handed, and allocates nothing when it is', () => {
    const target = { x: 0, z: 0 }

    expect(driftDirection(118, target)).toBe(target)
    expect(target.x).toBeCloseTo(driftDirection(118).x, 12)
  })

  test('a face turned out of the weather is +1 and one turned into it is -1', () => {
    const lee = driftDirection(SCAPE_CONFIG.wind.bearing)

    expect(faceAmount(turned(lee, 0.6), lee)).toBeCloseTo(1, 6)
    expect(faceAmount(turned({ x: -lee.x, z: -lee.z }, 0.6), lee)).toBeCloseTo(-1, 6)
    expect(faceAmount({ x: 0, y: 1, z: 0 }, lee)).toBeCloseTo(0, 12)
  })
})

describe('the line the two compasses place', () => {
  test('both swings lower the line on the face turned away from their agent', () => {
    const base = 0.6

    expect(snowLineAt(base, 2.2, 1, 3.4, 0)).toBeCloseTo(base - 2.2, 12)
    expect(snowLineAt(base, 2.2, 0, 3.4, 1)).toBeCloseTo(base - 3.4, 12)
    expect(snowLineAt(base, 2.2, -1, 3.4, -1)).toBeCloseTo(base + 5.6, 12)
  })

  test('a swing of zero is the line the scape had, whatever the face', () => {
    for (const exposure of [ -1, -0.4, 0, 0.7, 1 ])
      expect(snowLineAt(0.6, 2.2, 0.3, 0, exposure)).toBeCloseTo(snowLineAt(0.6, 2.2, 0.3, 0, 0), 12)
  })

  test('the cover is the band the shader steps over, and it is bounded', () => {
    const line = 4

    expect(snowCover(line - SNOW_BAND - 2, 0, 0, line)).toBe(0)
    expect(snowCover(line + SNOW_BAND + 2, 0, 0, line)).toBe(1)
    expect(snowCover(line + SNOW_BAND * 0.5, 0, 0, line)).toBeGreaterThan(0)
    expect(snowCover(line + SNOW_BAND * 0.5, 0, 0, line)).toBeLessThan(1)
  })

  test('the line wanders, and it wanders the same way every time it is asked', () => {
    expect(snowWander(17, -23)).toBeCloseTo(snowWander(17, -23), 15)
    expect(Math.abs(snowWander(17, -23))).toBeLessThanOrEqual(1)

    const walk = Array.from({ length: 64 }, (_, step) => snowWander(step * 3.7, step * 2.1))

    expect(Math.max(...walk) - Math.min(...walk)).toBeGreaterThan(0.9)
  })
})

describe('what the wind does to the archipelago', () => {
  const measured = measureDrift(survey.field, SCAPE_CONFIG, survey.landmasses, WORLD, 90)

  test('every island the world has is measured, and none twice', () => {
    expect(measured.length).toBe(survey.landmasses.length)
    expect(new Set(measured.map(island => island.id)).size).toBe(measured.length)
  })

  test('it moves the cover rather than only taking it away', () => {
    const bared  = measured.reduce((sum, island) => sum + island.bared, 0)
    const banked = measured.reduce((sum, island) => sum + island.banked, 0)

    expect(bared).toBeGreaterThan(0)
    expect(banked).toBeGreaterThan(0)
  })

  test('the ground earns most of the swing the knob offers it', () => {
    for (const island of measured)
      expect(island.realised).toBeGreaterThan(SCAPE_CONFIG.season.snowDrift)
  })

  test('turning the weather right round swaps the faces it scours for the ones it banks', () => {
    const about = measureDrift(
      survey.field,
      { ...SCAPE_CONFIG, wind: { ...SCAPE_CONFIG.wind, bearing: SCAPE_CONFIG.wind.bearing + 180 }},
      survey.landmasses,
      WORLD,
      90,
    )

    for (const [ index, island ] of measured.entries()) {
      expect(about[index].id).toBe(island.id)
      expect(about[index].scoured).toBeCloseTo(island.drifted, 1)
      expect(about[index].drifted).toBeCloseTo(island.scoured, 1)
    }
  })

  test('a swing of zero leaves the winter the scape already had', () => {
    const still = measureDrift(survey.field, withSeason({ snowDrift: 0 }), survey.landmasses, WORLD, 90)

    for (const island of still) {
      expect(island.cover).toBe(island.even)
      expect(island.bared).toBe(0)
      expect(island.banked).toBe(0)
      expect(island.realised).toBe(0)
    }
  })

  test('it is deterministic — the same seed measures the same winter twice', () => {
    const again = measureDrift(survey.field, SCAPE_CONFIG, survey.landmasses, WORLD, 90)

    expect(again).toEqual(measured)
  })
})
