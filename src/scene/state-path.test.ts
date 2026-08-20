import { describe, expect, test } from 'bun:test'
import { readPath, writePath } from 'threejs-scene'
import { withPath } from './state-path.ts'


type SampleReturnType = { look: { bloom: number, grade: string }, camera: { viewSize: number }}

function sample (): SampleReturnType {
  return {
    look:   { bloom: 0.4, grade: 'noir' },
    camera: { viewSize: 30 },
  }
}


describe('withPath', () => {
  test('writes the leaf without touching what it wrote into', () => {
    const before = sample()
    const after  = withPath(before, 'look.bloom', 0.9)

    expect(after.look.bloom).toBe(0.9)
    expect(before.look.bloom).toBe(0.4)
  })

  test('copies the spine and keeps everything off it by reference', () => {
    const before = sample()
    const after  = withPath(before, 'look.bloom', 0.9)

    expect(after).not.toBe(before)
    expect(after.look).not.toBe(before.look)
    expect(after.camera).toBe(before.camera)
  })

  test('writing the value already there changes nothing, so no listener fires', () => {
    const before = sample()

    expect(withPath(before, 'look.bloom', 0.4)).toBe(before)
    expect(withPath(before, 'look.grade', 'noir')).toBe(before)
  })

  test('a dead path is silent, exactly as writePath is', () => {
    const before = sample()

    expect(withPath(before, 'nowhere.at.all', 1)).toBe(before)
    expect(withPath(before, '', 1)).toBe(before)
    expect(withPath(before, 'look..bloom', 1)).toBe(before)
  })

  test('agrees with writePath on where the value lands', () => {
    const mutated = sample()
    const copied  = withPath(sample(), 'camera.viewSize', 42)

    writePath(mutated, 'camera.viewSize', 42)

    expect(copied).toEqual(mutated)
    expect(readPath(copied, 'camera.viewSize')).toBe(42)
  })

  test('a one-key path writes the top level', () => {
    const before = { seed: 1, look: { bloom: 0.4 }}
    const after  = withPath(before, 'seed', 7)

    expect(after.seed).toBe(7)
    expect(after.look).toBe(before.look)
  })
})
