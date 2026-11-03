import type { BufferAttribute, BufferGeometry, InterleavedBufferAttribute } from 'three'


type Attribute = BufferAttribute | InterleavedBufferAttribute

/** Each corner's face: its area and unit normal, and the corners that share each point. */
interface Facets {
  area:   Float32Array
  facing: Float32Array
  points: number[][]
}

/**
 * Round a faceted solid off without adding a triangle to it.
 *
 * A stone built from a deformed icosahedron arrives with one normal and one
 * colour per face, so it shades as a cut gem. That is right for a block split
 * off a joint last winter, and wrong for nearly every stone in the scape: an
 * erratic, a field stone or a dyke course has been rolled, rained on and
 * handled until its edges are gone. This shades the edges round instead. At
 * every corner it averages the face normals (and the facet colours) of the
 * faces that meet there at less than `crease`. Gentle turns read as one curved
 * surface, and a real joint, sharper than the crease, keeps its edge.
 *
 * In place, on a non-indexed geometry: the triangle soup `part()` makes. The
 * weights are face areas, so a sliver of a triangle cannot tip a corner.
 * Deterministic: corners are matched by quantised position and grouped in
 * buffer order, and every group averages the *original* facets.
 */
export function soften (geometry: BufferGeometry, crease: number): BufferGeometry {
  const position = geometry.getAttribute('position')
  const normal   = geometry.getAttribute('normal')
  const color    = geometry.getAttribute('color')

  if (geometry.index || !normal)
    throw new Error('soften: needs a non-indexed geometry with normals — run it after part()')

  const facets = readFacets(position)
  const groups = smoothingGroups(facets, crease)
  const turned = blend(facets.area, groups, facets.facing)
  const shades = color ? blend(facets.area, groups, read(color)) : null

  write(normal, turned, true)
  if (color && shades)
    write(color, shades, false)

  return geometry
}

function readFacets (position: Attribute): Facets {
  const corners = position.count
  const area    = new Float32Array(corners)
  const facing  = new Float32Array(corners * 3)
  const byKey   = new Map<string, number[]>()

  for (let first = 0; first + 2 < corners; first += 3) {
    const ex    = position.getX(first + 1) - position.getX(first)
    const ey    = position.getY(first + 1) - position.getY(first)
    const ez    = position.getZ(first + 1) - position.getZ(first)
    const fx    = position.getX(first + 2) - position.getX(first)
    const fy    = position.getY(first + 2) - position.getY(first)
    const fz    = position.getZ(first + 2) - position.getZ(first)
    const cx    = ey * fz - ez * fy
    const cy    = ez * fx - ex * fz
    const cz    = ex * fy - ey * fx
    const twice = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1e-12

    for (let corner = first; corner < first + 3; corner += 1) {
      area[corner] = twice * 0.5
      facing.set([ cx / twice, cy / twice, cz / twice ], corner * 3)

      const key   = cornerKey(position.getX(corner), position.getY(corner), position.getZ(corner))
      const point = byKey.get(key)

      if (point)
        point.push(corner)
      else
        byKey.set(key, [ corner ])
    }
  }

  return { area, facing, points: [ ...byKey.values() ]}
}

/**
 * The corners at each point, split into smoothing groups: two faces are in one
 * group when a chain of faces links them with every step turning by less than
 * the crease. So a crease line through a point splits it in two, and a point
 * on a smooth curve is one group, whose corners all share one normal.
 */
function smoothingGroups ({ facing, points }: Facets, crease: number): number[][] {
  const limit              = Math.cos(crease)
  const groups: number[][] = []

  for (const point of points) {
    const root = point.map((_, index) => index)
    const find = (index: number): number => root[index] === index ? index : root[index] = find(root[index])

    for (let a = 0; a < point.length; a += 1)
      for (let b = a + 1; b < point.length; b += 1) {
        const agree = facing[point[a] * 3] * facing[point[b] * 3] +
          facing[point[a] * 3 + 1] * facing[point[b] * 3 + 1] +
          facing[point[a] * 3 + 2] * facing[point[b] * 3 + 2]

        if (agree >= limit)
          root[find(a)] = find(b)
      }

    const byRoot = new Map<number, number[]>()

    point.forEach((corner, index) => {
      const key = find(index)

      byRoot.set(key, [ ...byRoot.get(key) ?? [], corner ])
    })
    groups.push(...byRoot.values())
  }

  return groups
}

/** Every corner's `value`, as the face-area-weighted mean over its smoothing group. */
function blend (area: Float32Array, groups: number[][], value: Float32Array): Float32Array {
  const out = new Float32Array(value.length)

  for (const group of groups) {
    const sum = [ 0, 0, 0 ]
    let weight = 0

    for (const corner of group) {
      for (let axis = 0; axis < 3; axis += 1)
        sum[axis] += value[corner * 3 + axis] * area[corner]
      weight += area[corner]
    }

    for (const corner of group)
      out.set(sum.map(total => total / weight), corner * 3)
  }

  return out
}

function read (attribute: Attribute): Float32Array {
  const out = new Float32Array(attribute.count * 3)

  for (let index = 0; index < attribute.count; index += 1)
    out.set([ attribute.getX(index), attribute.getY(index), attribute.getZ(index) ], index * 3)

  return out
}

function write (attribute: Attribute, value: Float32Array, unit: boolean): void {
  for (let index = 0; index < attribute.count; index += 1) {
    const x      = value[index * 3]
    const y      = value[index * 3 + 1]
    const z      = value[index * 3 + 2]
    const length = unit ? Math.sqrt(x * x + y * y + z * z) || 1 : 1

    attribute.setXYZ(index, x / length, y / length, z / length)
  }
  attribute.needsUpdate = true
}

/** A tenth of a millimetre: the rock generator hashes positions, so shared corners coincide well inside it. */
function cornerKey (x: number, y: number, z: number): string {
  return `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`
}

// perf: build-time only, O(corners × corners-per-point). A detail-1 stone is
// 240 corners at most six to a point, and every stone is a merged or
// instanced geometry built once per prop type.
