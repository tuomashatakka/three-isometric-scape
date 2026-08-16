import type { BufferGeometry } from 'three'


/**
 * An orthographic ASCII rasteriser for one baked prop geometry.
 *
 * The same bargain `scape-map.ts` makes, one scale down: the scape map answers
 * *where is everything*, and this answers *what does one thing look like* —
 * without a browser, a GPU, a screenshot, or a round trip through an image the
 * caller then has to describe to itself.
 *
 * That matters more than it sounds. A prop builder is a pure function from a
 * seed to a geometry, so the only thing standing between an edit and knowing
 * whether it worked is a picture. Making that picture cost ~10 ms of CPU and
 * zero dependencies turns geometry work into a normal edit-run-look loop.
 *
 * It reads the vertex colours the props already bake, so what it draws is the
 * prop's real shading — a part in the wrong colour shows up as the wrong shade,
 * not as an outline that could be anything.
 */

type Vec3 = readonly [number, number, number]

/** Screen basis: `u` right, `v` up, `w` toward the camera. All unit length. */
interface Basis {
  u: Vec3
  v: Vec3
  w: Vec3
}

const ISO_SIN = Math.sin(Math.atan(Math.SQRT1_2))
const ISO_COS = Math.cos(Math.atan(Math.SQRT1_2))
const R2      = Math.SQRT1_2

/**
 * The six angles worth looking at a building from.
 *
 * `iso` is the one that matters most, because it is the angle the scape is
 * actually played at — a fault that only shows at 35.26° is still a fault. The
 * four elevations exist because they are the ones you can *measure* from: a
 * roof either meets a wall in `side`, or it does not.
 */
export const VIEWS: Record<string, Basis> = {
  front: { u: [ 1, 0, 0 ], v: [ 0, 1, 0 ], w: [ 0, 0, 1 ]},
  back:  { u: [ -1, 0, 0 ], v: [ 0, 1, 0 ], w: [ 0, 0, -1 ]},
  right: { u: [ 0, 0, -1 ], v: [ 0, 1, 0 ], w: [ 1, 0, 0 ]},
  left:  { u: [ 0, 0, 1 ], v: [ 0, 1, 0 ], w: [ -1, 0, 0 ]},
  top:   { u: [ 1, 0, 0 ], v: [ 0, 0, -1 ], w: [ 0, 1, 0 ]},
  iso:   {
    u: [ R2, 0, -R2 ],
    v: [ -R2 * ISO_SIN, ISO_COS, -R2 * ISO_SIN ],
    w: [ R2 * ISO_COS, ISO_SIN, R2 * ISO_COS ],
  },
}

export type ViewName = keyof typeof VIEWS

/** Dark to light. Ten levels is what a terminal font can actually separate. */
export const SHADES = ' .:-~=+*#%@'

/** Key light, in world space — high, off the left shoulder, slightly forward. */
const LIGHT: Vec3 = [ -0.42, 0.79, 0.44 ]

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

export interface RasterOptions {

  /** Grid width. @defaultValue 96 */
  cols?: number

  /** @defaultValue `'iso'` */
  view?: ViewName

  /**
   * Terminal cell height over width.
   *
   * Wrong here and every roof pitch is a lie, which is the one thing this tool
   * exists to be trusted about. @defaultValue 2
   */
  cell?: number

  /** Rows to fit into. Derived from the prop's aspect when absent. */
  rows?: number
}

export interface RasterResult {
  lines: string[]

  /** Triangles in the geometry — what the prop costs, in every view. */
  triangles: number

  /**
   * Triangles that survived projection to a non-zero screen area.
   *
   * Always lower, and view-dependent: an elevation collapses every face
   * parallel to its own line of sight. Useful only for reading the picture,
   * never as a cost.
   */
  drawn: number

  /** World-space extent, for the stats block. */
  min: Vec3
  max: Vec3

  /** Metres per column, so a reader can measure off the picture. */
  scale: number
}

/** Vertices in screen space, plus the world bounds, for one basis. */
interface Projection {
  su:   Float64Array
  sv:   Float64Array
  sw:   Float64Array
  min:  [number, number, number]
  max:  [number, number, number]
  minU: number
  maxU: number
  minV: number
  maxV: number
}

/** Transform every vertex once, so the triangle loop never touches the basis. */
function project (position: ArrayLike<number>, basis: Basis, count: number): Projection {
  const su = new Float64Array(count)
  const sv = new Float64Array(count)
  const sw = new Float64Array(count)

  const min: [number, number, number] = [ Infinity, Infinity, Infinity ]
  const max: [number, number, number] = [ -Infinity, -Infinity, -Infinity ]

  let minU = Infinity,
    maxU   = -Infinity,
    minV   = Infinity,
    maxV   = -Infinity

  for (let i = 0; i < count; i += 1) {
    const p: Vec3 = [ position[i * 3], position[i * 3 + 1], position[i * 3 + 2] ]

    for (let axis = 0; axis < 3; axis += 1) {
      if (p[axis] < min[axis])
        min[axis] = p[axis]
      if (p[axis] > max[axis])
        max[axis] = p[axis]
    }

    su[i] = dot(p, basis.u)
    sv[i] = dot(p, basis.v)
    sw[i] = dot(p, basis.w)

    if (su[i] < minU)
      minU = su[i]
    if (su[i] > maxU)
      maxU = su[i]
    if (sv[i] < minV)
      minV = sv[i]
    if (sv[i] > maxV)
      maxV = sv[i]
  }

  return { su, sv, sw, min, max, minU, maxU, minV, maxV }
}

/**
 * The ramp level for one facet: its baked paint, under one key light.
 *
 * Level 0 is reserved for *nothing here*, so the darkest paint still draws as
 * '.' rather than as a hole. Tarred boards against an unlit background are
 * otherwise the same glyph, and a prop with a missing part would look exactly
 * like a prop with a very dark one.
 */
function shadeOf (position: ArrayLike<number>, colour: ArrayLike<number> | undefined, t: number): number {
  // Facet normal in world space, for the lambert term. The geometry is baked
  // flat-shaded, so one normal per triangle is not an approximation.
  const e1: Vec3 = [
    position[(t + 1) * 3] - position[t * 3],
    position[(t + 1) * 3 + 1] - position[t * 3 + 1],
    position[(t + 1) * 3 + 2] - position[t * 3 + 2],
  ]
  const e2: Vec3 = [
    position[(t + 2) * 3] - position[t * 3],
    position[(t + 2) * 3 + 1] - position[t * 3 + 1],
    position[(t + 2) * 3 + 2] - position[t * 3 + 2],
  ]
  const n: Vec3 = [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0],
  ]

  const len = Math.hypot(n[0], n[1], n[2]) || 1
  const lit = 0.34 + 0.66 * Math.abs(dot([ n[0] / len, n[1] / len, n[2] / len ], LIGHT))

  let tint = 0.72

  if (colour) {
    let sum = 0
    for (let k = 0; k < 3; k += 1)
      sum += 0.299 * colour[(t + k) * 3] + 0.587 * colour[(t + k) * 3 + 1] + 0.114 * colour[(t + k) * 3 + 2]
    tint = sum / 3
  }

  // Gamma toward the ramp: linear luminance spends too many levels in the
  // highlights and leaves every shadowed wall as the same single glyph.
  return 1 + Math.max(0, Math.min(SHADES.length - 2,
                                  Math.round(Math.sqrt(Math.max(0, tint)) * lit * (SHADES.length - 2))))
}

/** The grid being drawn into: one glyph level and one depth per cell. */
interface Target {
  shade: Int8Array
  depth: Float64Array
  cols:  number
  rows:  number
}

/** A projected vertex: cell x, cell y, and depth toward the camera. */
type Point = readonly [number, number, number]

/**
 * Fill one triangle, depth-tested, at a single flat level.
 *
 * Kept apart from the loop that feeds it because this is the only part of the
 * tool that is fiddly rather than merely long: the barycentric weights are
 * rotated one place from the vertices they belong to, and dividing them by a
 * signed area is what lets both windings fill without a separate backface case.
 */
function fillTriangle (target: Target, a: Point, b: Point, c: Point, level: number): boolean {
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

  if (Math.abs(area) < 1e-9)
    return false

  const loX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])))
  const hiX = Math.min(target.cols - 1, Math.ceil(Math.max(a[0], b[0], c[0])))
  const loY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])))
  const hiY = Math.min(target.rows - 1, Math.ceil(Math.max(a[1], b[1], c[1])))

  for (let py = loY; py <= hiY; py += 1)
    for (let px = loX; px <= hiX; px += 1) {
      const x = px + 0.5
      const y = py + 0.5

      // w1 is the weight of vertex a, because it is the sub-triangle opposite it.
      const w0 = ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) / area
      const w1 = ((c[0] - b[0]) * (y - b[1]) - (c[1] - b[1]) * (x - b[0])) / area
      const w2 = ((a[0] - c[0]) * (y - c[1]) - (a[1] - c[1]) * (x - c[0])) / area

      if (w0 < 0 || w1 < 0 || w2 < 0)
        continue

      const z     = w1 * a[2] + w2 * b[2] + w0 * c[2]
      const index = py * target.cols + px

      if (z <= target.depth[index])
        continue

      target.depth[index] = z
      target.shade[index] = level
    }

  return true
}

/** Collapse the grid to text, trimming the ragged right edge off each row. */
function toLines (target: Target): string[] {
  const lines: string[] = []

  for (let py = 0; py < target.rows; py += 1) {
    let line = ''

    for (let px = 0; px < target.cols; px += 1) {
      const level = target.shade[py * target.cols + px]

      line += level < 0 ? ' ' : SHADES[level]
    }

    lines.push(line.replace(/\s+$/, ''))
  }

  return lines
}

/**
 * Draw one geometry as an ASCII grid.
 *
 * A painter's algorithm would be shorter, but a z-buffer is what makes an
 * intersection *visible*: when a gable pokes through a roof, the buffer is what
 * decides that the gable's facet is the one you see, and seeing it is the whole
 * point.
 */
export function rasterize (geometry: BufferGeometry, options: RasterOptions = {}): RasterResult {
  const { cols = 96, view = 'iso', cell = 2 } = options
  const basis                                 = VIEWS[view] ?? VIEWS.iso
  const position                              = geometry.getAttribute('position').array as ArrayLike<number>
  const colour                                = geometry.getAttribute('color')?.array as ArrayLike<number> | undefined
  const count                                 = Math.floor(position.length / 3)

  const { su, sv, sw, min, max, minU, maxU, minV, maxV } = project(position, basis, count)

  const scale = (cols - 1) / Math.max(maxU - minU, 1e-6)
  const rows  = options.rows ?? Math.max(1, Math.ceil(Math.max(maxV - minV, 1e-6) * scale / cell) + 1)

  const target: Target = {
    shade: new Int8Array(rows * cols).fill(-1),
    depth: new Float64Array(rows * cols).fill(-Infinity),
    cols,
    rows,
  }

  const at = (i: number): Point => [ (su[i] - minU) * scale, (maxV - sv[i]) * scale / cell, sw[i] ]

  let drawn = 0

  for (let t = 0; t < count; t += 3)
    if (fillTriangle(target, at(t), at(t + 1), at(t + 2), shadeOf(position, colour, t)))
      drawn += 1

  return {
    lines:     toLines(target),
    triangles: Math.floor(count / 3),
    drawn,
    min:       min as Vec3,
    max:       max as Vec3,
    scale,
  }
}

/**
 * Which palette entry each baked facet came from, and how high it reaches.
 *
 * Jitter and grime are both multiplicative, so they move a baked colour along
 * its own brightness ray and leave its *direction* nearly intact — which makes
 * the normalised colour a usable fingerprint for the palette entry it started
 * as. Hues survive this well; the greys (granite, shingle, iron, trim) all
 * normalise toward white and will trade places, so read those as one family
 * rather than as four answers.
 *
 * The reason to want it: "does `faluDark` appear above the roofline" is a
 * question about a bug, and this answers it in one line of output.
 */
export function paletteAudit (
  geometry: BufferGeometry,
  palette:  Readonly<Record<string, string>>,
): { name: string; facets: number; minY: number; maxY: number }[] {
  const position = geometry.getAttribute('position').array as ArrayLike<number>
  const colour   = geometry.getAttribute('color')?.array as ArrayLike<number> | undefined

  if (!colour)
    return []

  // The baked attribute holds LINEAR colour: three.js converts every hex it is
  // handed out of sRGB. That conversion is a power curve, not a scale, so a
  // swatch compared in sRGB does not point the same way as its own baked
  // facets — which is enough to make falu red and rust iron trade places.
  const toLinear = (c: number): number =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4

  const swatches = Object.entries(palette).map(([ name, hex ]) => {
    const r = toLinear(parseInt(hex.slice(1, 3), 16) / 255)
    const g = toLinear(parseInt(hex.slice(3, 5), 16) / 255)
    const b = toLinear(parseInt(hex.slice(5, 7), 16) / 255)
    const m = Math.max(r, g, b) || 1

    return { name, r: r / m, g: g / m, b: b / m }
  })

  const found = new Map<string, { name: string; facets: number; minY: number; maxY: number }>()

  for (let t = 0; t < position.length / 3; t += 3) {
    let r    = 0,
      g      = 0,
      b      = 0,
      top    = -Infinity,
      bottom = Infinity

    for (let k = 0; k < 3; k += 1) {
      r += colour[(t + k) * 3]
      g += colour[(t + k) * 3 + 1]
      b += colour[(t + k) * 3 + 2]

      const y = position[(t + k) * 3 + 1]
      if (y > top)
        top = y
      if (y < bottom)
        bottom = y
    }

    const m = Math.max(r, g, b) || 1
    r /= m; g /= m; b /= m

    let best         = swatches[0]
    let bestDistance = Infinity

    for (const swatch of swatches) {
      const d = (swatch.r - r) ** 2 + (swatch.g - g) ** 2 + (swatch.b - b) ** 2
      if (d < bestDistance) {
        bestDistance = d
        best = swatch
      }
    }

    const entry = found.get(best.name) ?? { name: best.name, facets: 0, minY: Infinity, maxY: -Infinity }

    entry.facets += 1
    entry.minY = Math.min(entry.minY, bottom)
    entry.maxY = Math.max(entry.maxY, top)
    found.set(best.name, entry)
  }

  return [ ...found.values() ].sort((a, b) => b.maxY - a.maxY)
}
