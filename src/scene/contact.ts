import { Box3, DataTexture, DynamicDrawUsage, FloatType, Matrix4, NearestFilter, RGBAFormat, Vector3, Vector4 } from 'three'
import type { Camera, IUniform, InstancedMesh, Mesh } from 'three'

/**
 * Contact shade: every stone, bale, barrel and post meets the ground.
 *
 * The sky bake carries the shade a wall or a stand throws on the yard, but at
 * the phone's 1.48 m texel a metre-wide boulder is half a texel, so the first
 * reach (1.2 m) had nothing to say at its foot and every small prop stood on
 * the turf with no seat. A finer bake is a bigger texture and a slower first
 * load on the tier that can least afford either.
 *
 * Small solids are instead treated as what an overcast sky sees them as:
 * spheres. The occlusion a sphere of radius r at distance l casts on a surface
 * whose normal makes angle θ with it is `cos θ · r² / l²` (the solid angle it
 * covers, cosine-weighted) — exact for a sphere, and close enough for a stone,
 * a bale or a cairn course. The ground beside a stone darkens to its foot and
 * fades within about its own width; a stone's flank toward its neighbour
 * darkens; a surface turned away takes nothing, which is what keeps a stone
 * from shading itself.
 *
 * The candidates are gathered once at the bake (every instance of every solid
 * family, sized off its bounding box). When the frame moves they are binned
 * into a {@link CONTACT_CELLS}² grid over the ground the frame can see — a
 * float texture of a few hundred kilobytes, written only when the window
 * moves — so a fragment reads the few spheres that reach its own cell and no
 * others, however many stones the frame holds. A frame wider than
 * {@link CONTACT_FRAME} has no window, and the read returns on its first test.
 */

/** Smallest and largest radius a candidate may have, metres: under it is a tuft, over it the bake's own reaches see it. */
export const CONTACT_RADIUS = [ 0.14, 2.6 ] as const

/** The view height, metres, past which no contact is drawn. */
export const CONTACT_FRAME = 90

/** The most of the sky a surface touching a sphere gives up. */
export const CONTACT_DEPTH = 0.8

/** Packed x, y, z, radius per candidate. */
export type Occluders = Float32Array

const box      = new Box3()
const instance = new Matrix4()
const world    = new Matrix4()
const centre   = new Vector3()
const size     = new Vector3()
const column   = new Vector3()

function isInstanced (mesh: Mesh): mesh is InstancedMesh {
  return (mesh as InstancedMesh).isInstancedMesh === true
}

/** The sphere a box stands for under `matrix`: its centre, and half its largest extent. */
function sphereOf (matrix: Matrix4, out: number[]): void {
  box.getCenter(centre).applyMatrix4(matrix)
  box.getSize(size)

  const e  = matrix.elements
  const sx = size.x * column.set(e[0], e[1], e[2]).length()
  const sy = size.y * column.set(e[4], e[5], e[6]).length()
  const sz = size.z * column.set(e[8], e[9], e[10]).length()

  // The sphere stands for the solid's bulk: half its footprint, but never
  // much taller than it is — a flat slab is not a ball.
  const r = Math.min(Math.max(sx, sz) * 0.5, sy * 0.75 + Math.min(sx, sz) * 0.2)

  out.push(centre.x, centre.y, centre.z, r)
}

/**
 * Every small solid among these meshes as a sphere — the sky bake's own
 * `collectSolids`, so a scattered family counts once however many tiles share
 * it. Moving families (a dynamic instance buffer: the flock) are left out —
 * their spheres would stay where they were baked — and so is anything merged
 * into one large mesh, which the bake's reaches already see.
 */
export function gatherOccluders (meshes: readonly Mesh[]): Occluders {
  const out: number[] = []

  for (const mesh of meshes) {
    if (!mesh.geometry.boundingBox)
      mesh.geometry.computeBoundingBox()

    box.copy(mesh.geometry.boundingBox as Box3)

    if (!isInstanced(mesh)) {
      sphereOf(mesh.matrixWorld, out)
      continue
    }

    if (mesh.instanceMatrix.usage === DynamicDrawUsage)
      continue

    for (let index = 0; index < mesh.count; index += 1) {
      mesh.getMatrixAt(index, instance)
      sphereOf(world.multiplyMatrices(mesh.matrixWorld, instance), out)
    }
  }

  const kept: number[] = []

  for (let at = 0; at < out.length; at += 4)
    if (out[at + 3] >= CONTACT_RADIUS[0] && out[at + 3] <= CONTACT_RADIUS[1])
      kept.push(out[at], out[at + 1], out[at + 2], out[at + 3])

  return new Float32Array(kept)
}

/** What a sphere at `sphere` (x, y, z, r) leaves of the sky at `point` with unit normal `normal`. */
export function sphereShade (point: readonly number[], normal: readonly number[], sphere: readonly number[]): number {
  const d  = [ sphere[0] - point[0], sphere[1] - point[1], sphere[2] - point[2] ]
  const l2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]
  const r2 = sphere[3] * sphere[3]

  if (l2 <= r2 * 1.02)
    return 1

  const l      = Math.sqrt(l2)
  const facing = Math.max(0, (normal[0] * d[0] + normal[1] * d[1] + normal[2] * d[2]) / l)

  return 1 - CONTACT_DEPTH * facing * r2 / l2
}

/**
 * What a sphere leaves of the sun at `point`, toward unit `toSun`: the soft
 * shadow of a ball, its penumbra widening with the distance the light has to
 * travel past it (`CONTACT_PENUMBRA` of a metre per metre) — so a stone's
 * shadow is crisp at its foot and soft a stride away, as the sun's half-degree
 * disc and the sky round it make every shadow.
 */
export const CONTACT_PENUMBRA = 0.18

export function sphereSun (point: readonly number[], toSun: readonly number[], sphere: readonly number[]): number {
  const d     = [ sphere[0] - point[0], sphere[1] - point[1], sphere[2] - point[2] ]
  const along = d[0] * toSun[0] + d[1] * toSun[1] + d[2] * toSun[2]

  if (along <= 0)
    return 1

  const miss = Math.sqrt(Math.max(0, d[0] * d[0] + d[1] * d[1] + d[2] * d[2] - along * along))
  const soft = sphere[3] * 0.35 + CONTACT_PENUMBRA * along
  const t    = Math.min(1, Math.max(0, (miss - sphere[3] + soft * 0.5) / soft))

  return t * t * (3 - 2 * t)
}


/** Cells a side of the window the spheres are binned into. */
export const CONTACT_CELLS = 96

/** How far past its radius a sphere reaches, in radii: its shade has faded to a few percent, and its shadow mostly ended. */
export const CONTACT_REACH = 3.2

/**
 * The square of ground the bins cover, as a multiple of the view height. A
 * camera 20–35° up sees ground two to three view heights deep, and the focus
 * is where its axis meets the *mean* level: a yard on a mound is ten metres
 * nearer the lens than the focus of a ten-metre frame.
 */
export const CONTACT_WINDOW = 4.5

/** Where the bins lie: the window's corner (x, z) and its cell size, metres. */
export interface ContactWindow {
  x:    number
  z:    number
  cell: number
}

/** The window round a focus for a frame `viewSize` metres tall, its corner snapped to whole cells so a pan does not shimmer. */
export function contactWindow (x: number, z: number, viewSize: number): ContactWindow {
  const cell = viewSize * CONTACT_WINDOW / CONTACT_CELLS
  const half = CONTACT_CELLS / 2

  return { x: (Math.round(x / cell) - half) * cell, z: (Math.round(z / cell) - half) * cell, cell }
}

/**
 * Bin every sphere into each cell it reaches, up to `slots` a cell, largest
 * first, into `into` (x, y, z, r per slot; `CONTACT_CELLS * slots` texels a
 * row, `CONTACT_CELLS` rows). An empty slot has radius 0, which ends the
 * read. Returns how many spheres were binned.
 */
export function binOccluders (all: Occluders, window: ContactWindow, slots: number, into: Float32Array): number {
  into.fill(0)

  const reach           = CONTACT_CELLS * window.cell
  const order: number[] = []

  for (let at = 0; at < all.length; at += 4) {
    const r = all[at + 3] * CONTACT_REACH

    if (all[at] + r > window.x && all[at] - r < window.x + reach && all[at + 2] + r > window.z && all[at + 2] - r < window.z + reach)
      order.push(at)
  }

  // Largest first, then the order they were gathered in: deterministic.
  order.sort((a, b) => all[b + 3] - all[a + 3] || a - b)

  const filled = new Uint8Array(CONTACT_CELLS * CONTACT_CELLS)

  for (const at of order) {
    const r      = all[at + 3] * CONTACT_REACH
    const left   = Math.max(0, Math.floor((all[at] - r - window.x) / window.cell))
    const right  = Math.min(CONTACT_CELLS - 1, Math.floor((all[at] + r - window.x) / window.cell))
    const bottom = Math.max(0, Math.floor((all[at + 2] - r - window.z) / window.cell))
    const top    = Math.min(CONTACT_CELLS - 1, Math.floor((all[at + 2] + r - window.z) / window.cell))

    for (let row = bottom; row <= top; row += 1)
      for (let column = left; column <= right; column += 1) {
        const cell = row * CONTACT_CELLS + column

        if (filled[cell] >= slots)
          continue

        into.set(all.subarray(at, at + 4), (cell * slots + filled[cell]) * 4)
        filled[cell] += 1
      }
  }

  return order.length
}

/**
 * `vec2 scapeContact(vec3 world, vec3 normal, vec3 toSun)`: x is the sky the
 * point keeps, y the sun. It reads only its own cell's `slots` spheres. The
 * sun's half compiles in only where `sun` is set — the tiers with no shadow
 * map, whose march reads the sky map's 1.5 m texels and so loses a stone's
 * shadow as well as its shade.
 */
export function contactGlsl (slots: number, sun: boolean): string {
  const count = Math.max(1, Math.round(slots))

  return /* glsl */`
  uniform highp sampler2D uContactMap;
  uniform vec4 uContactRect;

  vec2 scapeContact (vec3 p, vec3 n, vec3 toSun) {
    vec2 seen = vec2(1.0);
    vec2 cell = floor((p.xz - uContactRect.xy) * uContactRect.z);

    if (uContactRect.z <= 0.0 || any(lessThan(cell, vec2(0.0))) || any(greaterThanEqual(cell, vec2(${CONTACT_CELLS}.0))))
      return seen;

    for (int k = 0; k < ${count}; k++) {
      vec4 ball = texelFetch(uContactMap, ivec2(int(cell.x) * ${count} + k, int(cell.y)), 0);
      if (ball.w <= 0.0) break;

      vec3 d   = ball.xyz - p;
      float l2 = dot(d, d);
      float r2 = ball.w * ball.w;
      if (l2 <= r2 * 1.02) continue;
      seen.x *= 1.0 - ${CONTACT_DEPTH.toFixed(2)} * clamp(dot(n, d) * inversesqrt(l2), 0.0, 1.0) * r2 / l2;
    ${sun
      ? `float along = dot(d, toSun);
      if (along > 0.0) {
        float miss = sqrt(max(l2 - along * along, 0.0));
        float soft = ball.w * 0.35 + ${CONTACT_PENUMBRA.toFixed(2)} * along;
        seen.y *= smoothstep(0.0, 1.0, (miss - ball.w + soft * 0.5) / soft);
      }`
      : ''}
    }
    return seen;
  }
`
}

export interface Contact {
  uniforms: Record<string, IUniform>
  glsl:     string

  /** Take the candidates from these meshes. Replaces any earlier set. */
  gather(meshes: readonly Mesh[]): void

  /** Follow the camera's focus and frame; rebins only when the window moved. */
  aim(camera: Camera | undefined, on: boolean): void
  dispose(): void
}

/** Contact for `slots` spheres a cell; `sun` adds their shadows (tiers with no shadow map). */
export function createContact (slots: number, sun: boolean): Contact {
  const count    = Math.max(1, Math.round(slots))
  const data     = new Float32Array(CONTACT_CELLS * count * CONTACT_CELLS * 4)
  const map      = new DataTexture(data, CONTACT_CELLS * count, CONTACT_CELLS, RGBAFormat, FloatType)
  const rect     = new Vector4(0, 0, 0, 0)
  const uniforms = { uContactMap: { value: map }, uContactRect: { value: rect }}
  let occluders: Occluders = new Float32Array(0)
  let binned               = ''

  map.minFilter   = NearestFilter
  map.magFilter   = NearestFilter
  map.needsUpdate = true

  return {
    uniforms,
    glsl: contactGlsl(count, sun),

    gather (meshes) {
      occluders = slots > 0 ? gatherOccluders(meshes) : new Float32Array(0)
      binned    = ''
    },

    aim (camera, on) {
      const target   = camera?.userData.target as readonly number[] | undefined
      const viewSize = camera?.userData.viewSize as number | undefined

      if (!on || slots <= 0 || !target || viewSize === undefined || viewSize >= CONTACT_FRAME || occluders.length === 0) {
        rect.z = 0
        return
      }

      const window = contactWindow(target[0], target[2], viewSize)
      const key    = `${window.x}:${window.z}:${window.cell}`

      if (key !== binned) {
        binOccluders(occluders, window, count, data)
        map.needsUpdate = true
        binned          = key
      }

      rect.set(window.x, window.z, 1 / window.cell, CONTACT_CELLS)
    },

    dispose () {
      map.dispose()
    },
  }
}
