import { BufferAttribute, BufferGeometry } from 'three'
import { hash3 } from 'threejs-scene'


/**
 * Give a rock the faces a real stone has: joints, a pitted skin, and enough
 * vertices along its outline that the silhouette is not a polyhedron.
 *
 * A deformed icosahedron, softened, reads as a smooth blob: every boulder in
 * the yard was a pebble scaled up. Real granite breaks along joints — two or
 * three flat planes meeting at hard edges — and between them weathers into
 * shallow pits and knuckles. So:
 *
 * - **cleave.** Two planes per stone, each a hashed bearing a little off the
 *   horizontal, cut off what lies beyond them. The flat faces they leave meet
 *   the body at more than `STONE_CREASE`, so `soften` keeps them as edges.
 * - **relief.** One subdivision (each triangle into four) on stones big
 *   enough to be seen at the yard frame, and a two-octave value noise cut
 *   *in* along the radius — knuckles a fifth of the stone across and pits a
 *   twelfth. Inward only, so a stone never grows past the hull its prop
 *   placed (the sea arch's clear opening is a test). A small stone keeps its
 *   triangle count and gets only the cleave; so does a fresh block (`worn`
 *   false), which is all joints and no weather.
 *
 * Keyed on position alone and drawing nothing from the rng, so every prop
 * built through `stonePart` places exactly where it did, and corners shared by
 * two triangles move together (the shell stays watertight). Build time only.
 */

/** Bounding radius, metres, from which a stone is subdivided before relief. */
export const CHISEL_SUBDIVIDE = 1

/** Relief amplitude, as a share of the stone's radius. */
export const CHISEL_RELIEF = 0.07

/** Where the joints cut, as a share of the radius out from the centre. */
export const CHISEL_CUT = [ 0.58, 0.8 ] as const

export function chisel (rock: BufferGeometry, worn = true): BufferGeometry {
  rock.computeBoundingSphere()

  const sphere = rock.boundingSphere
  const radius = sphere?.radius ?? 0

  if (!sphere || radius <= 0)
    return rock

  const shaped = worn && radius >= CHISEL_SUBDIVIDE ? subdivide(rock) : rock
  const centre = [ sphere.center.x, sphere.center.y, sphere.center.z ]
  const planes = joints(shaped, radius)
  const at     = shaped.getAttribute('position') as BufferAttribute

  for (let index = 0; index < at.count; index += 1) {
    const p = [ at.getX(index) - centre[0], at.getY(index) - centre[1], at.getZ(index) - centre[2] ]
    const r = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]) || 1

    if (shaped !== rock) {
      const knuckle = noise(p[0] / radius * 2.2, p[1] / radius * 2.2, p[2] / radius * 2.2)
      const pit     = noise(p[0] / radius * 6.1 + 17, p[1] / radius * 6.1, p[2] / radius * 6.1 - 5)
      const push    = -(knuckle * 0.7 + pit * 0.3) * CHISEL_RELIEF * radius * 2

      for (let axis = 0; axis < 3; axis += 1)
        p[axis] += p[axis] / r * push
    }

    for (const [ nx, ny, nz, cut ] of planes) {
      const beyond = p[0] * nx + p[1] * ny + p[2] * nz - cut

      if (beyond > 0) {
        p[0] -= nx * beyond
        p[1] -= ny * beyond
        p[2] -= nz * beyond
      }
    }

    at.setXYZ(index, p[0] + centre[0], p[1] + centre[1], p[2] + centre[2])
  }

  at.needsUpdate = true
  shaped.computeVertexNormals()
  shaped.computeBoundingSphere()

  return shaped
}

/**
 * The stone's two joints: a bearing and a height off the horizontal hashed out
 * of the stone's own first corner (which the rng already made unique), and a
 * cut depth in {@link CHISEL_CUT}. One leans on a side, one shears a top
 * corner — the two breaks a field stone shows from a farmyard.
 */
function joints (rock: BufferGeometry, radius: number): number[][] {
  const at   = rock.getAttribute('position')
  const seed = [ at.getX(0) * 31.7, at.getY(0) * 17.3, at.getZ(0) * 23.9 ]

  return [ 0, 1 ].map(joint => {
    const bearing = hash3(seed[0] + joint * 3.1, seed[1], seed[2]) * Math.PI * 2
    const rise    = joint === 0
      ? 0.1 + 0.3 * hash3(seed[2], seed[0] + joint, seed[1])
      : 0.55 + 0.35 * hash3(seed[1], seed[2], seed[0] - joint)
    const flat  = Math.sqrt(1 - rise * rise)
    const depth = CHISEL_CUT[0] + (CHISEL_CUT[1] - CHISEL_CUT[0]) * hash3(seed[0] - joint, seed[2], seed[1] + 7)

    return [ Math.cos(bearing) * flat, rise, Math.sin(bearing) * flat, depth * radius ]
  })
}

/** Trilinear value noise over `hash3`, smoothstepped: 0..1. */
function noise (x: number, y: number, z: number): number {
  const ix   = Math.floor(x)
  const iy   = Math.floor(y)
  const iz   = Math.floor(z)
  const fx   = ease(x - ix)
  const fy   = ease(y - iy)
  const fz   = ease(z - iz)
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
  const at   = (dx: number, dy: number, dz: number): number => hash3(ix + dx, iy + dy, iz + dz)

  return lerp(
    lerp(lerp(at(0, 0, 0), at(1, 0, 0), fx), lerp(at(0, 1, 0), at(1, 1, 0), fx), fy),
    lerp(lerp(at(0, 0, 1), at(1, 0, 1), fx), lerp(at(0, 1, 1), at(1, 1, 1), fx), fy),
    fz,
  )
}

function ease (t: number): number {
  return t * t * (3 - 2 * t)
}

/**
 * Each triangle into four, through its edge midpoints, on a non-indexed soup.
 * A midpoint is `(a + b) / 2` whichever triangle computes it, so the two
 * triangles either side of an edge agree on it to the bit.
 */
function subdivide (rock: BufferGeometry): BufferGeometry {
  const soup  = rock.index ? rock.toNonIndexed() : rock
  const names = Object.keys(soup.attributes).filter(name => name !== 'normal')
  const out   = new BufferGeometry()

  for (const name of names) {
    const source = soup.getAttribute(name)
    const size   = source.itemSize
    const values = new Float32Array(source.count * 4 * size)

    for (let first = 0; first + 2 < source.count; first += 3) {
      const corner = (index: number): number[] =>
        Array.from({ length: size }, (_, axis) => source.getComponent(first + index, axis))
      const a   = corner(0)
      const b   = corner(1)
      const c   = corner(2)
      const mid = (u: number[], v: number[]): number[] => u.map((value, axis) => (value + v[axis]) / 2)
      const ab  = mid(a, b)
      const bc  = mid(b, c)
      const ca  = mid(c, a)

      values.set([ a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca ].flat(), first * 4 * size)
    }

    out.setAttribute(name, new BufferAttribute(values, size))
  }

  if (soup !== rock)
    soup.dispose()
  rock.dispose()

  return out
}

// perf: build-time only. A detail-1 erratic goes from 80 triangles to 320 (136
// instances, +33k triangles on every tier); a field stone (461 instances),
// a cobble or a cairn course, under CHISEL_SUBDIVIDE, keeps its count.
