import { describe, expect, test } from 'bun:test'
import { Color } from 'three'
import type { BufferGeometry } from 'three'
import { SCAPE_CONFIG } from '../config.ts'
import { createScapeLayout, plotInfluence } from './layout.ts'
import type { Plot } from './layout.ts'
import { layoutRigs, plotRigs, rigGeometry, rigLength, rigProfile } from './rigs.ts'
import type { Rig, RigGeometryOptions, RigLayout } from './rigs.ts'


/** The ribbon's cross-section, kept in step with `ACROSS` in the module. */
const ACROSS = 5

/** How far above the ground the furrow edge is laid, in metres. */
const LIFT = 0.04

const LAYOUT: RigLayout = { spacing: 2.1, headland: 1.6, margin: 0.8 }

const GROUND = new Color(0x6d5a44)
const CROP   = new Color(0x7c8a3d)

/** A plot square to the axes, so a local offset is readable straight off x and z. */
const SQUARE: Plot = { x: 0, z: 0, halfW: 8, halfD: 6, rotation: 0, level: 3 }

function options (over: Partial<RigGeometryOptions> = {}): RigGeometryOptions {
  return {
    rigs:       plotRigs(SQUARE, LAYOUT),
    ...LAYOUT,
    crown:      0.17,
    cropAmount: 0.72,
    crop:       CROP,
    cuts:       18,
    surfaceAt:  (x, z) => Math.sin(x * 0.07) * 0.3 + z * 0.01,
    groundAt:   (_x, _z, target) => target.copy(GROUND),
    ...over,
  }
}

/** Every vertex of a ribbon, with the height it was laid over. */
function probe (geometry: BufferGeometry, options_: RigGeometryOptions): {
  x:        number
  z:        number
  standing: number
  color:    Color
}[] {
  const position = geometry.getAttribute('position')
  const color    = geometry.getAttribute('color')
  const read     = []

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index)
    const z = position.getZ(index)

    read.push({
      x,
      z,
      standing: position.getY(index) - options_.surfaceAt(x, z),
      color:    new Color(color.getX(index), color.getY(index), color.getZ(index)),
    })
  }

  return read
}

describe('laying a plot out in rigs', () => {
  test('the strips run the long way, because turning is the expensive part', () => {
    const wide = plotRigs({ ...SQUARE, halfW: 8, halfD: 6 }, LAYOUT)
    const tall = plotRigs({ ...SQUARE, halfW: 6, halfD: 8 }, LAYOUT)

    // Long axis is local X on the first and local Z on the second, and the
    // rotation is zero — so one runs along x and the other along z.
    expect(wide.every(rig => Math.abs(rig.dirX) === 1)).toBe(true)
    expect(tall.every(rig => Math.abs(rig.dirZ) === 1)).toBe(true)
  })

  test('every strip in a plot is parallel to every other', () => {
    const rigs = plotRigs({ ...SQUARE, rotation: 0.7 }, LAYOUT)

    expect(rigs.length).toBeGreaterThan(1)

    for (const rig of rigs) {
      expect(rig.dirX).toBeCloseTo(rigs[0]!.dirX, 12)
      expect(rig.dirZ).toBeCloseTo(rigs[0]!.dirZ, 12)
    }
  })

  test('no rig, and no furrow beside one, escapes its own plot', () => {
    const plot = { ...SQUARE, rotation: 0.4 }

    for (const rig of plotRigs(plot, LAYOUT)) {
      const half = LAYOUT.spacing / 2

      for (const end of [ -1, 1 ])
        for (const side of [ -1, 0, 1 ]) {
          const x = rig.x + rig.dirX * rig.halfLength * end - rig.dirZ * half * side
          const z = rig.z + rig.dirZ * rig.halfLength * end + rig.dirX * half * side

          expect(plotInfluence(plot, x, z)).toBeGreaterThan(0)
        }
    }
  })

  test('the strips are centred on the plot — the headland is even at both ends', () => {
    const rigs = plotRigs(SQUARE, LAYOUT)
    const off  = rigs.map(rig => -rig.z)

    expect(Math.min(...off) + Math.max(...off)).toBeCloseTo(0, 12)
    expect(rigs.every(rig => rig.x === SQUARE.x)).toBe(true)
  })

  test('a plot narrower than one rig is left unploughed rather than half-ploughed', () => {
    expect(plotRigs({ ...SQUARE, halfD: 1.2 }, LAYOUT)).toEqual([])
  })

  test('there is no flag: spacing 0 is a farm that never ploughed', () => {
    expect(plotRigs(SQUARE, { ...LAYOUT, spacing: 0 })).toEqual([])
  })

  test('the scape the config describes has rigs on it', () => {
    const layout = createScapeLayout(SCAPE_CONFIG)
    const rigs   = layoutRigs(layout.plots, SCAPE_CONFIG.rigs)

    expect(layout.plots.length).toBeGreaterThan(0)
    expect(rigs.length).toBeGreaterThanOrEqual(layout.plots.length)
    expect(rigLength(rigs)).toBeGreaterThan(0)
  })

  test('the layout is deterministic', () => {
    const once  = layoutRigs(createScapeLayout(SCAPE_CONFIG).plots, SCAPE_CONFIG.rigs)
    const again = layoutRigs(createScapeLayout(SCAPE_CONFIG).plots, SCAPE_CONFIG.rigs)

    expect(again).toEqual(once)
  })
})

describe('the ridge profile', () => {
  test('nothing stands in the furrow, and the crown is full height', () => {
    expect(rigProfile(1.05, 8, 16, 1.05, 0)).toBe(0)
    expect(rigProfile(0, 8, 16, 1.05, 0)).toBeGreaterThan(0.7)
  })

  test('a rig rises out of its headland rather than stepping out of it', () => {
    expect(rigProfile(0, 0, 16, 1.05, 0)).toBe(0)
    expect(rigProfile(0, 16, 16, 1.05, 0)).toBe(0)
    expect(rigProfile(0, 0.2, 16, 1.05, 0)).toBeLessThan(rigProfile(0, 8, 16, 1.05, 0))
  })

  test('it never leaves 0..1, so neither the lift nor the crop can overshoot', () => {
    for (let along = 0; along <= 16; along += 0.25)
      for (let across = -1.4; across <= 1.4; across += 0.1) {
        const standing = rigProfile(across, along, 16, 1.05, 3)

        expect(standing).toBeGreaterThanOrEqual(0)
        expect(standing).toBeLessThanOrEqual(1)
      }
  })
})

describe('the rig geometry', () => {
  test('it carries exactly what a terrain patch carries, so it can merge', () => {
    const geometry = rigGeometry(options())!

    expect(geometry).not.toBeNull()
    expect(geometry.getAttribute('position')).toBeDefined()
    expect(geometry.getAttribute('normal')).toBeDefined()
    expect(geometry.getAttribute('uv')).toBeDefined()
    expect(geometry.getAttribute('color').itemSize).toBe(3)
    expect(geometry.getIndex()).not.toBeNull()
  })

  test('one ribbon per rig, at one cross-section per cut plus the ends', () => {
    const built    = options({ cuts: 10 })
    const geometry = rigGeometry(built)!

    expect(geometry.getAttribute('position').count)
      .toBe(built.rigs.length * (10 + 1) * ACROSS)
  })

  test('the furrow edge lies on the ground it is laid over, and takes no crop', () => {
    const built = options()
    const read  = probe(rigGeometry(built)!, built)
    const edges = read.filter(vertex => Math.abs(vertex.standing - LIFT) < 1e-6)

    expect(edges.length).toBeGreaterThan(0)

    for (const edge of edges)
      expect(edge.color.getHex()).toBe(GROUND.getHex())
  })

  test('no crown stands higher than the crown it was given', () => {
    const built = options()

    for (const vertex of probe(rigGeometry(built)!, built)) {
      expect(vertex.standing).toBeGreaterThanOrEqual(LIFT - 1e-6)
      expect(vertex.standing).toBeLessThanOrEqual(LIFT + built.crown + 1e-6)
    }
  })

  test('the crop is on the crowns and nowhere else', () => {
    const built = options()
    const read  = probe(rigGeometry(built)!, built)
    const green = read.filter(vertex => vertex.color.g > GROUND.g + 1e-6)

    expect(green.length).toBeGreaterThan(0)

    // Every greened vertex is a standing one, and the greenest is the highest.
    for (const vertex of green)
      expect(vertex.standing).toBeGreaterThan(LIFT)
  })

  test('a fallow field keeps its relief and loses its colour', () => {
    const built = options({ cropAmount: 0 })
    const read  = probe(rigGeometry(built)!, built)

    expect(read.some(vertex => vertex.standing > LIFT + 0.05)).toBe(true)

    for (const vertex of read)
      expect(vertex.color.getHex()).toBe(GROUND.getHex())
  })

  test('a flat-ploughed field keeps its colour and loses its relief', () => {
    const built = options({ crown: 0 })
    const read  = probe(rigGeometry(built)!, built)

    expect(read.some(vertex => vertex.color.getHex() !== GROUND.getHex())).toBe(true)

    for (const vertex of read)
      expect(vertex.standing).toBeCloseTo(LIFT, 6)
  })

  test('a tier with no cuts gets no rigs rather than a broken cheap version', () => {
    expect(rigGeometry(options({ cuts: 0 }))).toBeNull()
    expect(rigGeometry(options({ rigs: []}))).toBeNull()
  })

  test('it is byte-for-byte stable', () => {
    const once  = rigGeometry(options())!.getAttribute('position').array
    const again = rigGeometry(options())!.getAttribute('position').array

    expect(Array.from(again)).toEqual(Array.from(once))
  })

  test('it stays inside the plot it was laid on', () => {
    const built = options()
    const read  = probe(rigGeometry(built)!, built)

    for (const vertex of read) {
      expect(Math.abs(vertex.x)).toBeLessThanOrEqual(SQUARE.halfW)
      expect(Math.abs(vertex.z)).toBeLessThanOrEqual(SQUARE.halfD)
    }
  })

  test('a whole archipelago of strips is still one geometry', () => {
    const rigs: Rig[] = layoutRigs(createScapeLayout(SCAPE_CONFIG).plots, SCAPE_CONFIG.rigs)
    const geometry    = rigGeometry(options({ rigs }))!

    expect(geometry.getAttribute('position').count).toBe(rigs.length * 19 * ACROSS)
  })
})
