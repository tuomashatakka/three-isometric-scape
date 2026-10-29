import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { SCAPE_CONFIG } from '../config.ts'
import { resolvePalette } from '../props/index.ts'
import { buildWashLine, washRopeAt } from '../props/wash.ts'
import { surveyArchipelago } from './archipelago.ts'
import { WASH_SINK, WASH_TONES, clothOut, planWash, washBillow, washLineFrame, washOut } from './wash.ts'


const world = surveyArchipelago(SCAPE_CONFIG)

describe('the wash on the line', () => {
  const cloths = planWash(world, SCAPE_CONFIG, 1_000)

  test('every farm hangs some, and the same seed hangs the same', () => {
    const perLine = Math.floor(SCAPE_CONFIG.wash.length * SCAPE_CONFIG.wash.fill)

    expect(cloths.length).toBe(world.landmasses.length * perLine)
    expect(planWash(world, SCAPE_CONFIG, 1_000)).toEqual(cloths)
  })

  test('every peg is on its own rope, between the posts and under the knots', () => {
    const { length, height } = SCAPE_CONFIG.wash

    for (const cloth of cloths) {
      const frame = world.landmasses
        .map(landmass => washLineFrame(landmass, world.field.heightAt))
        .find(line => Math.hypot(line.x - cloth.x, line.z - cloth.z) <= length / 2)

      expect(frame).toBeDefined()
      if (!frame)
        continue

      expect(cloth.angle).toBe(frame.angle)
      expect(cloth.y).toBeLessThanOrEqual(frame.y + height + 1e-9)
      expect(cloth.y).toBeGreaterThanOrEqual(frame.y + washRopeAt(height, length, 0.5) - 1e-9)
      expect(WASH_TONES[cloth.tone]).toBeDefined()
    }
  })

  test('no hem drags on the ground it hangs over, blown or still', () => {
    for (const cloth of cloths) {
      const ground = world.field.heightAt(cloth.x, cloth.z)

      expect(cloth.y - cloth.drop).toBeGreaterThan(ground)
    }
  })

  test('the tier budget thins every line rather than one farm', () => {
    const thin  = planWash(world, SCAPE_CONFIG, 12)
    const lines = new Set(thin.map(cloth => cloth.angle))

    expect(thin.length).toBe(12)
    expect(lines.size).toBe(world.landmasses.length)
    expect(planWash(world, SCAPE_CONFIG, 0)).toEqual([])
    expect(planWash(world, { ...SCAPE_CONFIG, wash: { ...SCAPE_CONFIG.wash, height: 0 }}, 64)).toEqual([])
  })

  test('the wash is out by day and dry, and in at night or in the rain', () => {
    expect(washOut(1, 0)).toBe(1)
    expect(washOut(0, 0)).toBe(0)
    expect(washOut(1, 1)).toBe(0)
    expect(clothOut(washOut(1, 0), 0.85)).toBe(1)
    expect(clothOut(washOut(0, 0), 0.15)).toBe(0)
  })

  test('only the wind across the rope lifts it, and never past level', () => {
    expect(washBillow(1, 1, 0, 0)).toBe(0)
    expect(washBillow(1, 0, 1, 1)).toBe(0)
    expect(washBillow(1, 0.5, 1, 0)).toBeGreaterThan(0)
    expect(washBillow(1, 0.5, -1, 0)).toBeLessThan(0)
    expect(Math.abs(washBillow(10, 1, 1, 1))).toBeLessThan(Math.PI / 2)
  })

  test('the line stands on its feet, with its rope at the authored height', () => {
    const { length, height } = SCAPE_CONFIG.wash
    const geometry           = buildWashLine({ length, height, rng: createSeededRng(3), palette: resolvePalette() })
    const bounds             = new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)

    expect(bounds.min.y).toBeLessThan(-WASH_SINK)
    expect(bounds.max.y).toBeGreaterThan(height)
    expect(bounds.max.y).toBeLessThan(height + 0.3)
    expect(bounds.max.x - bounds.min.x).toBeGreaterThan(length)

    geometry.dispose()
  })
})
