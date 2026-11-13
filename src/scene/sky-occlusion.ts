import { DataTexture, LinearFilter, Matrix4, RGBAFormat, UnsignedByteType, Vector2, Vector3, Vector4 } from 'three'
import type { BufferGeometry, IUniform, InstancedMesh, Material, Mesh, Object3D } from 'three'

/**
 * How much of the sky each point of the scape can see, baked once.
 *
 * The ground was lit as though nothing stood on it. A wall, a tree, a boulder or
 * a byre met the soil with no darkening at all, so every prop looked pasted on —
 * and on the two tiers with no shadow map that was all of them, at every hour.
 * Under the overcast this coast mostly has, the shading a photograph shows *is*
 * sky occlusion: the light that cannot reach a point because something nearby
 * stands taller than it.
 *
 * The answer is static, so it is computed once rather than every frame. After
 * the dressing is placed, every solid is rasterised from above into a grid of
 * *top* heights (the highest surface over each texel) beside a grid of *ground*
 * heights (the terrain alone). How much of the sky a point sees is then a
 * question about its neighbourhood: at each of five reaches, how far the
 * average top height round it stands above it. Five box blurs answer that for
 * every texel at once, whatever the reach — no rays, no per-texel loops over
 * neighbours.
 *
 * One RGBA8 texture carries it to every program:
 *
 * - **r** — visibility at ground level, under whatever stands there
 * - **g** — visibility at the top surface (a roof, a crown, bare ground)
 * - **b** — the ground height, `lo..hi`
 * - **a** — the top height, `lo..hi`
 *
 * A fragment knows its own height, so it blends r to g by where it stands
 * between the two: the soil under a spruce is dark, the spruce's lower boughs
 * less so, its tip not at all. Bare ground has r = g, so the 16 cm the height
 * channels quantise to never shows.
 *
 * It replaced the screen-space GTAO pass the ultra tier ran over every frame —
 * that only ever reached one tier in four, cost a full-resolution pass, and
 * forgot every occluder off the edge of the screen.
 */
export interface SkyOcclusion {

  /** The uniforms every program that reads the occlusion declares. */
  uniforms: Record<string, IUniform>

  /** Their declarations and the two reads, for this tier's march. */
  glsl: string

  /** Taps the sun's shadow walks; part of the program's identity. */
  march: number

  /** Take the key light's world position from here, every frame (`Atmosphere.sunPosition`). */
  follow(sun: Vector3): void

  /** Bake from the terrain and from everything standing on it. Replaces any earlier bake. */
  bake(ground: readonly Object3D[], standing: readonly Object3D[]): void

  /** The strength, `look.ao`: 0 turns both the shade and the march's shadow off. */
  update(strength: number): void
  dispose(): void
}

/** The square of the world the map covers: its corner and its edge, in metres, and its texels a side. */
export interface SkyGrid {
  minX: number
  minZ: number
  span: number
  size: number
}

/**
 * The five reaches, metres, and what each may take away.
 *
 * The first is contact — a stone's own skirt, the dark line at a wall foot. The
 * second is a building's or a stand's shade on the yard beside it. The third is
 * the foot of a crag. The last two are the *terrain's* own sky: a gully between
 * two knolls, a corrie under a fell, the floor of a fjord — ground that is open
 * straight up and still sees half the sky it would on a summit, because the
 * land stands round it. Without them a hollow was lit exactly as brightly as
 * the ridge above it and the islands shaded as one flat sheet under overcast.
 *
 * A point is fully occluded at a reach when the average top round it stands
 * `SLOPE` × the reach above it. The wide reaches cost a box blur each at the
 * bake and nothing in any frame: the read is the fetch it always was.
 */
export const SKY_REACHES = [ 1.2, 3.5, 9, 26, 70 ] as const
export const SKY_WEIGHTS = [ 0.42, 0.38, 0.32, 0.45, 0.4 ] as const

/** The first reach that is the terrain's: from here on the average is of the ground, not of what stands on it. */
export const TERRAIN_REACH = 3

/**
 * The slope that closes a reach. The terrain's reaches close on a gentler one:
 * a wall that fills the sky stands a metre over a metre, a glen side that does
 * stands three over twenty-six.
 */
export const SKY_SLOPES = [ 0.7, 0.7, 0.7, 0.12, 0.07 ] as const

/** What the rasteriser should treat as solid: the scape's own two materials, and nothing see-through. */
export type SolidTest = (material: Material) => boolean

export interface SkyBake {
  data: Uint8Array

  /** The height range the two height channels span. */
  lo: number
  hi: number
}

/**
 * What a rasterised solid is written into.
 *
 * `top` is raised to every surface a texel wide or wider. `cover` is where the
 * smaller ones go — nearly every triangle in a tree, a tuft or a fence — and
 * it is what keeps them honest: a 5 cm grass blade splatted as the highest
 * point over a square metre stands up as a metre-wide column, and a meadow of
 * them shades itself like a forest. So a small triangle adds only the ground
 * it actually covers from above (`area`, texels², up-facing faces only, so a
 * closed solid counts its footprint once) and that area times its height
 * (`volume`). {@link settle} folds the two in.
 */
export interface Heights {
  top:    Float32Array
  cover?: { area: Float32Array; volume: Float32Array }
}

/**
 * Write every triangle of a geometry under `matrix` into `into`. A larger
 * triangle is scanned over its box and interpolated, so a roof plane or a
 * terrain facet is a surface rather than three dots.
 */
export function rasterise (grid: SkyGrid, geometry: BufferGeometry, matrix: Matrix4, into: Heights): void {
  const position = geometry.getAttribute('position')
  const index    = geometry.getIndex()
  const count    = index ? index.count : position.count
  const m        = matrix.elements
  const scale    = grid.size / grid.span
  const xs       = [ 0, 0, 0 ]
  const ys       = [ 0, 0, 0 ]
  const zs       = [ 0, 0, 0 ]

  // The arrays themselves where they are plain, which is every mesh the scape
  // builds: `getX` per corner was most of the bake.
  const flat    = 'isInterleavedBufferAttribute' in position ? null : position.array
  const corners = index?.array

  for (let tri = 0; tri + 2 < count; tri += 3) {
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = corners ? corners[tri + corner] : tri + corner
      const x      = flat ? flat[vertex * 3] : position.getX(vertex)
      const y      = flat ? flat[vertex * 3 + 1] : position.getY(vertex)
      const z      = flat ? flat[vertex * 3 + 2] : position.getZ(vertex)

      xs[corner] = (m[0] * x + m[4] * y + m[8] * z + m[12] - grid.minX) * scale - 0.5
      ys[corner] = m[1] * x + m[5] * y + m[9] * z + m[13]
      zs[corner] = (m[2] * x + m[6] * y + m[10] * z + m[14] - grid.minZ) * scale - 0.5
    }

    scanTriangle(grid.size, xs, ys, zs, into)
  }
}

function raise (size: number, column: number, row: number, height: number, target: Float32Array): void {
  if (column < 0 || row < 0 || column >= size || row >= size)
    return

  const at = row * size + column

  if (height > target[at])
    target[at] = height
}

/** A triangle under a texel: its footprint and its mean height where its middle falls, or its highest corner without a `cover`. */
function splat (size: number, xs: number[], ys: number[], zs: number[], area: number, into: Heights): void {
  const column = Math.round((xs[0] + xs[1] + xs[2]) / 3)
  const row    = Math.round((zs[0] + zs[1] + zs[2]) / 3)

  if (!into.cover) {
    raise(size, column, row, Math.max(ys[0], ys[1], ys[2]), into.top)

    return
  }

  // Facing up is a negative signed area in these axes (x across, z down the rows).
  if (area >= 0 || column < 0 || row < 0 || column >= size || row >= size)
    return

  const at = row * size + column

  into.cover.area[at]   -= area / 2
  into.cover.volume[at] -= area / 2 * (ys[0] + ys[1] + ys[2]) / 3
}

function scanTriangle (size: number, xs: number[], ys: number[], zs: number[], into: Heights): void {
  const left   = Math.max(0, Math.ceil(Math.min(xs[0], xs[1], xs[2])))
  const right  = Math.min(size - 1, Math.floor(Math.max(xs[0], xs[1], xs[2])))
  const bottom = Math.max(0, Math.ceil(Math.min(zs[0], zs[1], zs[2])))
  const top    = Math.min(size - 1, Math.floor(Math.max(zs[0], zs[1], zs[2])))
  const area   = (xs[1] - xs[0]) * (zs[2] - zs[0]) - (xs[2] - xs[0]) * (zs[1] - zs[0])

  // Under half a texel of footprint — a blade, a bough, a rail, a wall seen
  // edge on — is a small thing, whatever box it happens to straddle. Not on
  // the ground pass, which has no cover to put it in and must leave no holes.
  const small = Math.abs(area) < (into.cover ? 1 : 1e-6)

  if (right < left || top < bottom || small) {
    splat(size, xs, ys, zs, area, into)

    return
  }

  for (let row = bottom; row <= top; row += 1)
    for (let column = left; column <= right; column += 1) {
      const w0 = ((xs[1] - column) * (zs[2] - row) - (xs[2] - column) * (zs[1] - row)) / area
      const w1 = ((xs[2] - column) * (zs[0] - row) - (xs[0] - column) * (zs[2] - row)) / area
      const w2 = 1 - w0 - w1

      if (w0 >= -1e-4 && w1 >= -1e-4 && w2 >= -1e-4)
        raise(size, column, row, w0 * ys[0] + w1 * ys[1] + w2 * ys[2], into.top)
    }
}

/**
 * Fold the small things into the top: a texel a fifth covered by a 2 m crown
 * stands 0.4 m over its ground, one fully covered stands at the crown's mean.
 */
export function settle (ground: Float32Array, into: Required<Heights>): void {
  const { top, cover } = into

  for (let cell = 0; cell < top.length; cell += 1) {
    const area = cover.area[cell]

    if (area > 0) {
      const rise = Math.min(1, area) * (cover.volume[cell] / area - ground[cell])

      top[cell] = Math.max(top[cell], ground[cell] + Math.max(0, rise))
    }
  }
}

function isInstanced (mesh: Mesh): mesh is InstancedMesh {
  return (mesh as InstancedMesh).isInstancedMesh === true
}

/**
 * Every solid mesh under these roots, once.
 *
 * A scattered family is drawn as one world-wide mesh *and* as the tiles that
 * share its geometry (`scatter-lod.ts`), so the same stone would be rasterised
 * twice. Max is idempotent, so that would only cost time — but it is half the
 * bake, so a family is kept as whichever of its meshes holds the most instances.
 */
export function collectSolids (roots: readonly Object3D[], solid: SolidTest): Mesh[] {
  const singles: Mesh[]                      = []
  const families: Map<string, InstancedMesh> = new Map()
  const ids                                  = new Map<object, number>()
  const id                                   = (thing: object): number => {
    if (!ids.has(thing))
      ids.set(thing, ids.size)

    return ids.get(thing) ?? 0
  }

  for (const root of roots)
    root.traverse(object => {
      const mesh = object as Mesh

      if (!mesh.isMesh || Array.isArray(mesh.material) || !solid(mesh.material))
        return

      if (!isInstanced(mesh)) {
        singles.push(mesh)

        return
      }

      const key  = `${mesh.name}:${id(mesh.geometry)}`
      const held = families.get(key)

      if (!held || held.count < mesh.count)
        families.set(key, mesh)
    })

  return [ ...singles, ...families.values() ]
}

/** Write everything in these meshes into `into`, instances and all. World matrices must be current. */
export function rasteriseAll (grid: SkyGrid, meshes: readonly Mesh[], into: Heights, scratch: Matrix4): void {
  for (const mesh of meshes) {
    if (!isInstanced(mesh)) {
      rasterise(grid, mesh.geometry, mesh.matrixWorld, into)
      continue
    }

    for (let instance = 0; instance < mesh.count; instance += 1) {
      mesh.getMatrixAt(instance, scratch)
      scratch.premultiply(mesh.matrixWorld)
      rasterise(grid, mesh.geometry, scratch, into)
    }
  }
}

/**
 * A clamped box mean of `source` over `reach` texels each way, horizontal then
 * vertical. O(n) whatever the reach, and both passes walk memory in rows — the
 * vertical one keeps a running sum per column rather than striding down each.
 */
export function boxMean (source: Float32Array, size: number, reach: number, scratch: Float32Array, out: Float32Array): void {
  boxRows(source, size, reach, scratch)
  boxColumns(scratch, size, reach, out)
}

function boxRows (source: Float32Array, size: number, reach: number, out: Float32Array): void {
  const width = reach * 2 + 1
  const last  = size - 1

  for (let row = 0; row < size; row += 1) {
    const base = row * size
    let sum    = 0

    for (let cell = -reach; cell <= reach; cell += 1)
      sum += source[base + Math.min(last, Math.max(0, cell))]

    for (let cell = 0; cell < size; cell += 1) {
      const add    = cell + reach + 1
      const remove = cell - reach

      out[base + cell] = sum / width
      sum += source[base + (add > last ? last : add)] - source[base + (remove < 0 ? 0 : remove)]
    }
  }
}

function boxColumns (source: Float32Array, size: number, reach: number, out: Float32Array): void {
  const width = reach * 2 + 1
  const last  = size - 1
  const sums  = new Float32Array(size)

  for (let row = -reach; row <= reach; row += 1) {
    const base = Math.min(last, Math.max(0, row)) * size

    for (let cell = 0; cell < size; cell += 1)
      sums[cell] += source[base + cell]
  }

  for (let row = 0; row < size; row += 1) {
    const add    = Math.min(last, row + reach + 1) * size
    const remove = Math.max(0, row - reach) * size
    const base   = row * size

    for (let cell = 0; cell < size; cell += 1) {
      out[base + cell] = sums[cell] / width
      sums[cell] += source[add + cell] - source[remove + cell]
    }
  }
}

/**
 * The bake itself, from the two height grids. Pure, and the thing the tests
 * state their claims about.
 *
 * `ground` is the terrain alone; `top` is everything, and is never below it.
 */
export function bakeSky (grid: SkyGrid, ground: Float32Array, top: Float32Array): SkyBake {
  const cells   = grid.size * grid.size
  const texel   = grid.span / grid.size
  const data    = new Uint8Array(cells * 4)
  const lit     = new Float32Array(cells * 2).fill(1)
  const scratch = new Float32Array(cells)
  const mean    = new Float32Array(cells)
  let lo = Infinity
  let hi = -Infinity

  for (let cell = 0; cell < cells; cell += 1) {
    lo = Math.min(lo, ground[cell])
    hi = Math.max(hi, top[cell])
  }

  for (const [ step, reach ] of SKY_REACHES.entries()) {
    const span   = Math.max(1, Math.round(reach / texel))
    const weight = SKY_WEIGHTS[step]
    const full   = 1 / (span * texel * SKY_SLOPES[step])

    // The terrain's reaches ask about the land alone: a lone byre does not
    // close the sky over a field seventy metres off.
    boxMean(step < TERRAIN_REACH ? top : ground, grid.size, span, scratch, mean)

    for (let cell = 0; cell < cells; cell += 1) {
      const low  = (mean[cell] - ground[cell]) * full
      const high = (mean[cell] - top[cell]) * full

      // Most of the world is open sea or open ground: nothing to take.
      if (low > 0)
        lit[cell * 2] *= 1 - weight * (low > 1 ? 1 : low)
      if (high > 0)
        lit[cell * 2 + 1] *= 1 - weight * (high > 1 ? 1 : high)
    }
  }

  const range = Math.max(1e-3, hi - lo)

  for (let cell = 0; cell < cells; cell += 1) {
    data[cell * 4]     = Math.round(lit[cell * 2] * 255)
    data[cell * 4 + 1] = Math.round(lit[cell * 2 + 1] * 255)
    data[cell * 4 + 2] = Math.round((ground[cell] - lo) / range * 255)
    data[cell * 4 + 3] = Math.round((top[cell] - lo) / range * 255)
  }

  return { data, lo, hi }
}

/**
 * The read, for any program that has the world position and normal.
 *
 * `scapeSky` is the visibility, 0..1, already raised to the strength. Linear
 * filtering on all four channels is what makes the shade soft: the occlusion
 * is smooth by construction, and the two heights interpolate to the slope a
 * canopy edge would have anyway.
 *
 * `scapeSunLit` is the same map asked a second question: is anything standing
 * between this point and the sun? It walks the top heights toward the light,
 * `march` taps on spacing that widens with distance, and keeps the lowest
 * clearance as a penumbra that softens with reach — a cast shadow from every
 * wall, stone, crown and hill, moving with the sun, on the two tiers whose
 * devices cannot run a shadow map. Where a shadow map exists `march` is 0 and
 * the walk compiles away. The start is pushed out along the face's own normal
 * by most of a texel, or a sunlit wall would find itself in the next texel's
 * height and shade its own foot.
 */
export function skyOcclusionGlsl (march: number): string {
  return /* glsl */`
  #define SKY_MARCH ${Math.max(0, Math.round(march))}
  uniform sampler2D uSkyMap;
  uniform vec4 uSkyRect;
  uniform vec2 uSkyRange;
  uniform float uSkyStrength;
  uniform float uSkyTexel;
  uniform vec3 uSkySun;

  float scapeSky (vec3 world) {
    vec4 sky      = texture2D(uSkyMap, (world.xz - uSkyRect.xy) * uSkyRect.zw);
    float ground  = uSkyRange.x + sky.b * uSkyRange.y;
    float rise    = (sky.a - sky.b) * uSkyRange.y;
    float above   = clamp((world.y - ground) / max(rise, 0.6), 0.0, 1.0);
    return pow(max(mix(sky.r, sky.g, above), 0.02), uSkyStrength);
  }

  float scapeSunLit (vec3 world, vec3 face) {
    float lit = 1.0;
  #if SKY_MARCH > 0
    vec3 toSun  = normalize(uSkySun - world);
    float level = length(toSun.xz);

    if (toSun.y > 0.0 && level > 1e-3 && uSkyStrength > 0.0) {
      vec2 along  = toSun.xz / level;
      float climb = toSun.y / level;
      vec3 start  = world + vec3(face.x, 0.0, face.z) * uSkyTexel * 0.8 + vec3(0.0, 0.12, 0.0);

      for (int tap = 0; tap < SKY_MARCH; tap++) {
        float reach = uSkyTexel * (0.7 + pow(float(tap), 1.6) * 0.9);
        vec2 at     = start.xz + along * reach;
        float top   = uSkyRange.x + texture2D(uSkyMap, (at - uSkyRect.xy) * uSkyRect.zw).a * uSkyRange.y;
        float clear = start.y + reach * climb - top;
        lit = min(lit, clamp(0.5 + clear / (0.25 + 0.12 * reach), 0.0, 1.0));
      }
    }
  #endif
    return mix(1.0, lit, min(uSkyStrength, 1.0));
  }
`
}

/**
 * Where it lands in a standard material: after the lights are summed and where
 * three would apply an `aoMap`. The sky light and its reflection take the whole
 * of the visibility; the sun takes a third of it, and the march's shadow.
 * `SCAPE_SKY_AT` is the world position the program supplies.
 */
export const SKY_OCCLUSION_FRAGMENT = /* glsl */`
  #include <aomap_fragment>
  vec3 scapeSkyAt    = SCAPE_SKY_AT;
  float scapeSkySeen = scapeSky(scapeSkyAt);
  float scapeSunSeen = mix(1.0, scapeSkySeen, 0.3) * scapeSunLit(scapeSkyAt, inverseTransformDirection(normal, viewMatrix));
  reflectedLight.indirectDiffuse  *= scapeSkySeen;
  reflectedLight.indirectSpecular *= scapeSkySeen;
  reflectedLight.directDiffuse    *= scapeSunSeen;
  reflectedLight.directSpecular   *= scapeSunSeen;
`

/** The square the map covers: the whole world, which is where every island is. */
export function skyGrid (worldSize: number, size: number): SkyGrid {
  return { minX: -worldSize / 2, minZ: -worldSize / 2, span: worldSize, size }
}

export interface SkyOcclusionOptions {
  grid:  SkyGrid
  solid: SolidTest

  /** Taps the sun's shadow walks (`quality.sunMarch`); 0 on a tier with a shadow map. */
  march: number

  /** The floor the ground grid starts at where no terrain covers it — the sea. */
  floor: number
}

/** One white texel: everything sees the whole sky until the bake lands. */
function blank (): DataTexture {
  const texture = new DataTexture(new Uint8Array([ 255, 255, 0, 0 ]), 1, 1, RGBAFormat, UnsignedByteType)

  texture.needsUpdate = true

  return texture
}

export function createSkyOcclusion (options?: SkyOcclusionOptions): SkyOcclusion {
  const map: IUniform<DataTexture> = { value: blank() }
  const rect                       = new Vector4(0, 0, 0, 0)
  const uniforms                   = {
    uSkyMap:      map,
    uSkyRect:     { value: rect },
    uSkyRange:    { value: new Vector2(0, 1) },
    uSkyStrength: { value: 1 },
    uSkyTexel:    { value: options ? options.grid.span / options.grid.size : 1 },
    uSkySun:      { value: new Vector3(0, 1e4, 0) },
  }

  return {
    uniforms,
    glsl:  skyOcclusionGlsl(options?.march ?? 0),
    march: options?.march ?? 0,

    follow (sun) {
      uniforms.uSkySun.value = sun
    },

    bake (groundRoots, standing) {
      if (!options)
        return

      bakeInto(options, groundRoots, standing)
    },

    update (strength) {
      uniforms.uSkyStrength.value = Math.max(0, strength)
    },

    // Back to the blank texel rather than freed and left: the landscape keeps
    // this across a rebuild, and the next build draws before its bake lands.
    dispose () {
      map.value.dispose()
      map.value = blank()
    },
  }

  function bakeInto ({ grid, solid, floor }: SkyOcclusionOptions, groundRoots: readonly Object3D[], standing: readonly Object3D[]): void {
    const ground = new Float32Array(grid.size * grid.size).fill(-Infinity)
    const matrix = new Matrix4()

    for (const root of [ ...groundRoots, ...standing ])
      root.updateMatrixWorld(true)

    rasteriseAll(grid, collectSolids(groundRoots, solid), { top: ground }, matrix)

    for (let cell = 0; cell < ground.length; cell += 1)
      if (ground[cell] === -Infinity)
        ground[cell] = floor

    const into = {
      top:   ground.slice(),
      cover: { area: new Float32Array(ground.length), volume: new Float32Array(ground.length) },
    }

    rasteriseAll(grid, collectSolids(standing, solid), into, matrix)
    settle(ground, into)

    const top = into.top

    const { data, lo, hi } = bakeSky(grid, ground, top)
    const texture          = new DataTexture(data, grid.size, grid.size, RGBAFormat, UnsignedByteType)

    texture.magFilter       = LinearFilter
    texture.minFilter       = LinearFilter
    texture.generateMipmaps = false
    texture.needsUpdate     = true
    map.value.dispose()
    map.value = texture; (globalThis as unknown as { skyDebug: unknown }).skyDebug = { data, lo, hi, grid }
    rect.set(grid.minX, grid.minZ, 1 / grid.span, 1 / grid.span)
    uniforms.uSkyRange.value.set(lo, hi - lo)
  }
}
