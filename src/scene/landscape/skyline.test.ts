import { describe, expect, test } from 'bun:test'
import { MeshStandardMaterial, Vector3 } from 'three'
import { SCAPE_CONFIG } from '../config.ts'
import type { ScapeConfig } from '../config.ts'
import { SHORE_STEPS, patchReach, surveyFarShore } from './farshore.ts'
import { createFarShore } from './skyline.ts'


const material = new MeshStandardMaterial()
const shore    = surveyFarShore(SCAPE_CONFIG)
const mesh     = createFarShore(SCAPE_CONFIG, shore, material)!
const position = mesh.geometry.getAttribute('position')
const normal   = mesh.geometry.getAttribute('normal')
const indices  = mesh.geometry.getIndex()!

const { farShore, terrain } = SCAPE_CONFIG
const seabed                = terrain.waterLevel - terrain.seabedDrop
const RINGS                 = 4

/** Every vertex, with the bearing and radius it was swept at. */
function* swept (): Generator<{ at: number, ring: number, radius: number, y: number, bearing: number }> {
  for (let at = 0; at < position.count; at += 1) {
    const x = position.getX(at)
    const z = position.getZ(at)

    yield {
      at,
      ring:    at % RINGS,
      radius:  Math.hypot(x, z),
      y:       position.getY(at),
      bearing: Math.atan2(z, x),
    }
  }
}

describe('the far coast, as geometry', () => {
  test('one mesh, four rings a bearing, and nothing per frame', () => {
    expect(position.count).toBe(SHORE_STEPS * RINGS)
    expect(indices.count / 3).toBe(SHORE_STEPS * (RINGS - 1) * 2)
    expect(mesh.material).toBe(material)
    expect(mesh.matrixAutoUpdate).toBe(false)
  })

  test('it casts no shadow and receives none', () => {
    // The sun's shadow camera is fitted to the ground the view can see. A
    // two-kilometre ring of mountains in the caster list would open that fit
    // up and spend the islands' shadow resolution on a thing the air has half
    // dissolved.
    expect(mesh.castShadow).toBe(false)
    expect(mesh.receiveShadow).toBe(false)
  })

  test('no face is wound to look at the seabed', () => {
    // The claim the winding rule makes, as a fact about the buffer. A face
    // turned over is a face the sun cannot reach, the snow line cannot whiten
    // and the depth test draws from behind — and from this camera it reads as
    // a hole in the land rather than as an error.
    for (let at = 0; at < normal.count; at += 1)
      expect(normal.getY(at)).toBeGreaterThanOrEqual(-1e-6)
  })

  test('every triangle that has any area has it facing up', () => {
    const a    = new Vector3()
    const b    = new Vector3()
    const c    = new Vector3()
    const edge = new Vector3()
    const face = new Vector3()

    for (let tri = 0; tri < indices.count; tri += 3) {
      a.fromBufferAttribute(position, indices.getX(tri))
      b.fromBufferAttribute(position, indices.getX(tri + 1))
      c.fromBufferAttribute(position, indices.getX(tri + 2))
      face.copy(b).sub(a)
        .cross(edge.copy(c).sub(a))

      if (face.length() > 1e-3)
        expect(face.y).toBeGreaterThan(0)
    }
  })

  test('nothing it draws stands over the archipelago', () => {
    // The same claim as the survey's, one level down: the survey can be right
    // about where the coast stands and the sweep can still put a vertex
    // somewhere else. This is the one that would have caught it.
    for (const vertex of swept())
      expect(vertex.radius).toBeGreaterThan(patchReach(SCAPE_CONFIG, vertex.bearing))
  })

  test('the land runs past the corner of the widest frame the camera has', () => {
    // A coast with a visible outside edge is worse than no coast. The rim has
    // to clear the half-diagonal of a frame at `camera.maxViewSize`, on every
    // bearing that carries land.
    const corner = SCAPE_CONFIG.camera.maxViewSize * 0.5 * Math.SQRT2

    for (const vertex of swept())
      if (vertex.ring === RINGS - 1 && shore.samples[Math.floor(vertex.at / RINGS)].land > 0.5)
        expect(vertex.radius).toBeGreaterThan(corner)
  })

  test('a sound is on the seabed, not a bar across the way out', () => {
    // How the first build failed: the collapsed cross-section sat three metres
    // under mean water, which is inside the lake's depth tint, and every sound
    // drew as a pale bank straight across itself.
    for (const vertex of swept()) {
      const sample = shore.samples[Math.floor(vertex.at / RINGS)]

      if (sample.land === 0) {
        expect(vertex.y).toBeCloseTo(seabed, 3)
        expect(vertex.radius).toBeCloseTo(sample.distance, 2)
      }
    }
  })

  test('the ridge stands exactly as high as the survey says it does', () => {
    const highest = Math.max(...[ ...swept() ].map(vertex => vertex.y))

    expect(highest).toBeCloseTo(terrain.waterLevel + (shore.summit?.crest ?? 0), 3)
  })

  test('the toe is under water at the bottom of a spring tide', () => {
    // `sink` is the margin that keeps the bottom edge of the range out of the
    // picture, and half of `tide.range` is as far down as the sea ever goes.
    const spring = terrain.waterLevel - SCAPE_CONFIG.tide.range * 0.5

    for (const vertex of swept())
      if (vertex.ring === 0)
        expect(vertex.y).toBeLessThan(spring)
  })

  test('the same seed gives the same buffer, byte for byte', () => {
    const again = createFarShore(SCAPE_CONFIG, surveyFarShore(SCAPE_CONFIG), material)!

    expect(again.geometry.getAttribute('position').array)
      .toEqual(position.array as Float32Array)
    expect(again.geometry.getAttribute('color').array)
      .toEqual(mesh.geometry.getAttribute('color').array as Float32Array)
  })

  test('a scape with no far coast draws nothing at all', () => {
    const open: ScapeConfig = { ...SCAPE_CONFIG, farShore: { ...farShore, rise: 0 }}

    expect(createFarShore(open, surveyFarShore(open), material)).toBeNull()
  })
})
