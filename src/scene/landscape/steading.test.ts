import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { createScapeLayout } from './layout.ts'
import { STEADING_BUILDINGS, steadingPlaces } from './steading.ts'


describe('where the farmstead stands', () => {
  const layout = createScapeLayout(SCAPE_CONFIG)
  const places = steadingPlaces(layout.yard)

  test('the same yard arranges the same farm', () => {
    expect(steadingPlaces(layout.yard)).toEqual(places)
  })

  test('every building stands on the yard it belongs to', () => {
    for (const name of STEADING_BUILDINGS) {
      const place = places[name]
      const out   = Math.hypot(place.x - layout.yard.x, place.z - layout.yard.z)

      expect(out).toBeLessThan(layout.yard.radius)
      expect(place.radius).toBeGreaterThan(0)
    }
  })

  test('no two buildings are raised on the same ground', () => {
    for (const name of STEADING_BUILDINGS)
      for (const other of STEADING_BUILDINGS) {
        if (name === other)
          continue

        const a = places[name]
        const b = places[other]

        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(a.radius)
      }
  })

  test('the well is the middle of the yard, which is why the paths hub on it', () => {
    const out = Math.hypot(places.well.x - layout.yard.x, places.well.z - layout.yard.z)

    for (const name of STEADING_BUILDINGS)
      expect(out).toBeLessThan(Math.hypot(
        places[name].x - layout.yard.x,
        places[name].z - layout.yard.z,
      ))
  })
})
