import { describe, expect, test } from 'bun:test'
import { latticeField } from './lattice.ts'


describe('latticeField', () => {
  const ground = (x: number, z: number): number => Math.sin(x * 0.3) * 2 + Math.cos(z * 0.2) * 1.5

  test('is the field itself at every lattice point, and reads each point once', () => {
    let reads   = 0
    const counted = (x: number, z: number): number => {
      reads += 1
      return ground(x, z)
    }
    const field = latticeField({ heightAt: counted }, 0.75, -10, -10)

    for (let row = 0; row < 20; row += 1)
      for (let column = 0; column < 20; column += 1)
        expect(field.heightAt(-10 + column * 0.75 + 1e-9, -10 + row * 0.75 + 1e-9)).toBeCloseTo(ground(-10 + column * 0.75, -10 + row * 0.75), 6)

    const after = reads

    field.heightAt(-5, -5)
    field.slopeAt(-5, -5)
    expect(reads - after).toBeLessThan(16)
    expect(after).toBeLessThanOrEqual(21 * 21)
  })

  test('stays within the rounding a 0.75 m lattice allows between points', () => {
    const field = latticeField({ heightAt: ground }, 0.75)

    for (let i = 0; i < 500; i += 1) {
      const x = Math.sin(i * 12.9898) * 300
      const z = Math.cos(i * 78.233) * 300

      expect(Math.abs(field.heightAt(x, z) - ground(x, z))).toBeLessThan(0.15)
    }
  })
})
