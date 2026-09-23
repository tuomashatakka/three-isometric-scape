import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { resolvePalette } from './palette.ts'
import { buildGuillemot } from './seabird.ts'


const palette = resolvePalette()
const seeds   = [ 1, 7, 11, 42, 99, 4_242 ]

const geometryOf = (seed: number): Float32Array =>
  buildGuillemot(createSeededRng(seed), palette).getAttribute('position').array as Float32Array

const colourOf = (seed: number): Float32Array =>
  buildGuillemot(createSeededRng(seed), palette).getAttribute('color').array as Float32Array


describe('the bird on the ledge', () => {
  test.each(seeds)('seed %i stands on the rock rather than in it', seed => {
    const bounds = new Box3().setFromArray(geometryOf(seed))

    expect(bounds.min.y).toBeGreaterThan(-0.06)
    expect(bounds.max.y).toBeGreaterThan(0.3)
  })

  test.each(seeds)('seed %i is taller than it is wide, which is the whole read', seed => {
    const bounds = new Box3().setFromArray(geometryOf(seed))
    const size   = bounds.getSize(bounds.max.clone())

    // An auk stands upright because its legs are set too far back for anything
    // else. Drawn level it is a gull sitting down, and the archipelago already
    // has four hundred of those in the air.
    expect(size.y).toBeGreaterThan(size.x * 2)
    expect(size.y).toBeGreaterThan(size.z * 1.4)
  })

  test.each(seeds)('seed %i keeps a white front on a dark bird', seed => {
    const colour = colourOf(seed)

    let darkest = 1
    let palest  = 0

    for (let vertex = 0; vertex < colour.length; vertex += 3) {
      const value = (colour[vertex] + colour[vertex + 1] + colour[vertex + 2]) / 3

      darkest = Math.min(darkest, value)
      palest  = Math.max(palest, value)
    }

    // The claim is the *contrast*, not either tone: a bird cliff reads at range
    // because a row of white fronts stands against dark backs, and a merge pass
    // that grimed the breast down to the body would take the cliff with it.
    expect(palest - darkest).toBeGreaterThan(0.35)
  })

  test('the breast faces the same way the placement points it', () => {
    const position = geometryOf(11)
    const colour   = colourOf(11)

    let palestZ = 0
    let palest  = 0

    for (let vertex = 0; vertex < colour.length; vertex += 3) {
      const value = (colour[vertex] + colour[vertex + 1] + colour[vertex + 2]) / 3

      if (value > palest) {
        palest  = value
        palestZ = position[vertex + 2]
      }
    }

    // +z, like the flock and the colony on the guard: the yaw the ledge deals
    // is the direction the bird is looking, and a bird whose white was on its
    // back would face the cliff it is standing on.
    expect(palestZ).toBeGreaterThan(0)
  })
})
