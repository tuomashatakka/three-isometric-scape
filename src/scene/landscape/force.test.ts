import { describe, expect, test } from 'bun:test'
import { Color } from 'three'
import { SCAPE_CONFIG } from '../config.ts'
import { surveyArchipelago } from './archipelago.ts'
import { findFall, sheetGeometry } from './force.ts'
import type { Fall } from './force.ts'


/**
 * The whole archipelago, surveyed once for the file.
 *
 * The dune tests take one island because a belt is a fact about one island's own
 * coast. A fall is not that: whether every course in the scape carries one is the
 * run's whole claim, and it is exactly the claim that goes quietly false when the
 * noise, the smoothing or the carve is retuned. So this reads all six, and pays
 * about a second for the privilege.
 */
const survey = surveyArchipelago(SCAPE_CONFIG)

const { force, beck, terrain } = SCAPE_CONFIG

function fallOf (id: string): Fall | null {
  const landmass  = survey.landmasses.find(each => each.id === id)!
  const { creek } = landmass.survey.layout

  return creek && findFall({
    creek,
    depth:      beck.depth,
    fill:       beck.fill,
    waterLevel: terrain.waterLevel,
    least:      force.least,
    surfaceAt:  landmass.survey.field.heightAt,
  })
}

const home = fallOf('home')!

const sheet = sheetGeometry({
  fall:     home,
  breadth:  force.breadth,
  reach:    force.reach,
  standoff: force.standoff,
  water:    new Color(SCAPE_CONFIG.palette.deepWater),
  foam:     new Color(SCAPE_CONFIG.palette.foam),
})

/** Every vertex of the sheet, as `[x, y, z]`. */
function vertices (): [ number, number, number ][] {
  const position = sheet.getAttribute('position')

  return Array.from({ length: position.count }, (_unused, at) =>
    [ position.getX(at), position.getY(at), position.getZ(at) ])
}


describe('findFall', () => {
  // The run's headline, stated as a fact about the data. Six courses, six falls
  // — and if a retune of the ground leaves one of them with no reach steep
  // enough, this says which island rather than leaving a `scape:map` line
  // quietly one shorter than it was.
  test('every island with a course has a fall on it', () => {
    const coursed = survey.landmasses.filter(landmass => landmass.survey.layout.creek)

    expect(coursed.length).toBe(6)

    for (const landmass of coursed)
      expect(fallOf(landmass.id)).not.toBeNull()
  })

  test('the fall stands on the hillside, not in the sea', () => {
    for (const landmass of survey.landmasses) {
      const fall = fallOf(landmass.id)

      if (fall)
        expect(fall.foot).toBeGreaterThan(terrain.waterLevel)
    }
  })

  test('the lip stands over the foot by at least the least drop', () => {
    expect(home.drop).toBeGreaterThanOrEqual(force.least)
    expect(home.lip - home.foot).toBeCloseTo(home.drop, 10)
  })

  test('the heading is a unit vector in the ground plane', () => {
    expect(Math.hypot(home.headingX, home.headingZ)).toBeCloseTo(1, 6)
  })

  // What separates a fall from the reach above it. A face flatter than this is
  // water the beck's own riffle is already drawing, and hanging a second surface
  // over it would be two sheets in one channel.
  test('the face is steeper than the beck breaks white at', () => {
    expect(home.drop / home.run).toBeGreaterThan(0.6)
  })
})

describe('sheetGeometry', () => {
  test('carries the attributes the material reads', () => {
    expect(sheet.getAttribute('position')).toBeDefined()
    expect(sheet.getAttribute('color')).toBeDefined()
    expect(sheet.getAttribute('aForce')).toBeDefined()
    expect(sheet.getIndex()).not.toBeNull()
  })

  // Landform geometry, so the base is the lip rather than `y = 0` — and the two
  // ends of it are exactly the two levels the fall was measured between. A sheet
  // that overshot would stand in the plunge pool's floor; one that fell short
  // would end in the air.
  test('hangs between the lip and the plunge and goes no further', () => {
    const heights = vertices().map(([ , y ]) => y)

    expect(Math.max(...heights)).toBeCloseTo(home.lip, 6)
    expect(Math.min(...heights)).toBeCloseTo(home.lip - home.drop, 6)
  })

  test('lands out from the foot rather than against it', () => {
    const rows   = vertices()
    const centre = rows[Math.floor(rows.length / 2) - 2]
    const along  = (centre[0] - home.x) * home.headingX + (centre[2] - home.z) * home.headingZ

    // The last row is the one the throw is measured on: the water leaves the lip
    // with the speed it arrived at, so it reaches the run of the face plus the
    // throw before it is level with the plunge.
    const last = rows.at(-1)!
    const foot = (last[0] - home.x) * home.headingX + (last[2] - home.z) * home.headingZ

    expect(foot).toBeCloseTo(force.standoff + home.run + force.reach, 6)
    expect(along).toBeLessThan(foot)
  })

  test('opens out as it falls', () => {
    const rows = vertices()
    const wide = (row: number): number =>
      Math.hypot(rows[row * 5][0] - rows[row * 5 + 4][0], rows[row * 5][2] - rows[row * 5 + 4][2])

    expect(wide(10)).toBeGreaterThan(wide(0))
    expect(wide(0)).toBeCloseTo(home.half * 2 * force.breadth, 4)
  })

  test('is byte-for-byte stable for one fall', () => {
    const again = sheetGeometry({
      fall:     home,
      breadth:  force.breadth,
      reach:    force.reach,
      standoff: force.standoff,
      water:    new Color(SCAPE_CONFIG.palette.deepWater),
      foam:     new Color(SCAPE_CONFIG.palette.foam),
    })

    expect(Array.from(again.getAttribute('position').array))
      .toEqual(Array.from(sheet.getAttribute('position').array))
    expect(Array.from(again.getAttribute('color').array))
      .toEqual(Array.from(sheet.getAttribute('color').array))

    again.dispose()
  })
})
