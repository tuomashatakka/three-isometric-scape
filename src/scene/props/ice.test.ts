import { describe, expect, test } from 'bun:test'
import { Box3 } from 'three'
import { createSeededRng } from 'threejs-scene'
import { buildFloe } from './ice.ts'
import { resolvePalette } from './palette.ts'


const palette = resolvePalette()
const build   = (seed: number): Box3 => {
  const geometry = buildFloe(createSeededRng(seed), palette)
  const bounds   = new Box3().setFromArray(geometry.getAttribute('position').array as Float32Array)

  geometry.dispose()

  return bounds
}


describe('the plate', () => {
  test('is a unit: about a metre across the flats and a metre of stand', () => {
    // Everything the pack draws is this geometry under a non-uniform scale of
    // `(length, rise, width)`, so a unit that was two metres across would make
    // every plate in the archipelago twice the size the survey says it is.
    const bounds = build(11)
    const size   = bounds.getSize(bounds.max.clone())

    expect(size.x).toBeGreaterThan(0.9)
    expect(size.x).toBeLessThan(1.25)
    expect(size.z).toBeGreaterThan(0.9)
    expect(size.z).toBeLessThan(1.25)
  })

  test('floats on the waterline rather than under it', () => {
    // The placement puts `y = 0` at the sea's own surface, tide included. A
    // plate whose hull dipped below its own base would be an ice floe with a
    // hole cut in the water round it.
    const bounds = build(11)

    expect(bounds.min.y).toBeGreaterThan(-0.06)
    expect(bounds.max.y).toBeGreaterThan(1)
    expect(bounds.max.y).toBeLessThan(1.8)
  })

  test('is the same plate, byte for byte, twice', () => {
    const first  = buildFloe(createSeededRng(404), palette)
    const second = buildFloe(createSeededRng(404), palette)

    expect(Array.from(first.getAttribute('position').array))
      .toEqual(Array.from(second.getAttribute('position').array))
    expect(Array.from(first.getAttribute('color').array))
      .toEqual(Array.from(second.getAttribute('color').array))

    first.dispose()
    second.dispose()
  })

  test('is one plate for the whole archipelago, and the field varies by scale', () => {
    // Deliberately not varied per instance: the variety in a pack comes from the
    // survey dealing every plate its own length, width and yaw — see
    // `planPackIce` — and a second geometry would be a second draw call for a
    // difference the scale is already making.
    expect(Array.from(build(1).min.toArray()))
      .toEqual(Array.from(build(2).min.toArray()))
  })

  test('stays paler than the snow it is drawn beside and darker than the limewash', () => {
    // A floe is frozen sea, not snow — see `props/palette.ts`. Stated here
    // because the one way this system fails silently is by out-burning the drift
    // on the island behind it, and a colour is not something `prop:map` can see.
    const ice   = Number.parseInt(palette.floe.slice(1), 16)
    const trim  = Number.parseInt(palette.trimWhite.slice(1), 16)
    const crust = Number.parseInt(palette.floeSnow.slice(1), 16)
    const wet   = Number.parseInt(palette.floeWet.slice(1), 16)

    expect(ice).toBeLessThan(trim)
    expect(ice).toBeLessThan(crust)
    expect(wet).toBeLessThan(ice)
  })
})
