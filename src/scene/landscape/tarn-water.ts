import { BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshStandardMaterial } from 'three'
import type { IUniform, WebGLProgramParametersWithUniforms } from 'three'
import { smoothstep } from 'threejs-scene'
import { mergeGeometryList } from 'threejs-scene/modules/assets'
import type { LiveConfig } from '../config.ts'
import type { AtmosphereQuality } from '../quality.ts'
import type { SeasonState } from '../season.ts'
import type { ArchipelagoSurvey } from './archipelago.ts'
import type { Tarn } from './tarn.ts'
import { drawnSurfaceOf, patchSegments } from './terrain.ts'


/**
 * Rings of vertices between the middle of a pool and its shore.
 *
 * Four, and they are not there for the silhouette — the edge is the sector
 * count's business. They are there for the *depth tint*, which is a gradient
 * painted into the vertices: with one ring the pool is a flat disc of one
 * colour with a rim, and the shallows a tarn is read by are the first thing to
 * go.
 */
const RINGS = 4

/**
 * Metres the sheet is set below the height it stands at.
 *
 * The shoreline is not drawn. The sheet is a flat disc out to the full radius
 * and the bank simply stands in front of it, exactly the way the sea's one
 * plane meets every coast in the archipelago — so the waterline is wherever the
 * ground *the terrain actually drew* crosses the level, at any segment count,
 * rather than wherever a solver in here guessed it would be. The whole cost of
 * that is a pair of nearly coplanar surfaces where a bank comes in flat, and
 * two centimetres of bias is what stops them fighting over the pixel.
 */
const SINK = 0.02

/**
 * Metres of water the depth tint takes to reach full darkness.
 *
 * Well under the pool's own depth on purpose. What reads as depth in still
 * water is the *margin* — the first half metre, where the bed is still visible
 * through it — and a gradient stretched over the whole depth puts all of its
 * contrast where nothing can see it.
 */
const TINT_DEPTH = 0.7

/**
 * How much darker than the sea's deep tint the middle of a pool is.
 *
 * The same treatment the beck gets and for the same reason — a small body of
 * water sitting in peat and taking the whole hemisphere would otherwise come
 * out paler than the sound it is four metres above.
 */
const DEEP = 0.5

const TARN_PARS_FRAGMENT = /* glsl */ `
uniform vec3  uTarnIce;
uniform vec3  uTarnSnow;
uniform float uTarnFreeze;
uniform float uTarnLying;
`

/**
 * Winter arrives here first, and that is the whole difference between this
 * water and the sound below it.
 *
 * A pool a stone's throw across and knee deep on a fell has no fetch, no swell
 * and almost no thermal mass; it is ice on the first hard week, and the sea
 * between the islands is still open. `frost` says how much sooner, and the
 * input is the one `season.freeze` the lake and the beck already read — a
 * second winter in the config would be a second winter to keep in agreement.
 */
export function tarnFreeze (freeze: number, frost: number): number {
  return smoothstep(0, Math.max(0.05, 1 - frost), freeze)
}

/**
 * One pool, as geometry in its island's local frame.
 *
 * A fan: a middle vertex, then `RINGS` rings of `sectors` vertices out to the
 * full radius. Flat, because the water is — nothing on this fell has the fetch
 * to raise a wave on a pool you could throw a stone across, and a still surface
 * is also a surface with no speed in it to stop before a capture.
 */
function tarnGeometry (
  tarn:      Tarn,
  surfaceAt: (x: number, z: number) => number,
  sectors:   number,
  shallow:   Color,
  deep:      Color,
): { geometry: BufferGeometry, wetted: number } | null {
  const positions: number[] = []
  const colors: number[]    = []
  const indices: number[]   = []
  const tint                = new Color()
  const surface             = tarn.level - SINK

  /** How much water stands over the drawn ground here, and never less than none. */
  const depthAt = (x: number, z: number): number => Math.max(0, tarn.level - surfaceAt(x, z))

  const push = (x: number, z: number): void => {
    positions.push(x, surface, z)
    tint.copy(shallow).lerp(deep, smoothstep(0, TINT_DEPTH, depthAt(x, z)))
    colors.push(tint.r, tint.g, tint.b)
  }

  push(tarn.x, tarn.z)

  // The wetted radius on each bearing, measured against the same drawn ground
  // the sheet will be occluded by. Nothing in the geometry uses it — the disc
  // is drawn to the full radius either way — but a pool the terrain grid turned
  // out to be too coarse to hold any water in is a pool with nothing to draw,
  // and this is how that is noticed rather than shipped as an invisible mesh.
  let wetted = 0

  for (let sector = 0; sector < sectors; sector += 1) {
    const bearing = sector / sectors * Math.PI * 2
    const cos     = Math.cos(bearing)
    const sin     = Math.sin(bearing)

    for (let ring = 1; ring <= RINGS; ring += 1) {
      const distance = tarn.radius * ring / RINGS
      const x        = tarn.x + cos * distance
      const z        = tarn.z + sin * distance

      if (depthAt(x, z) > 0)
        wetted = Math.max(wetted, distance)

      push(x, z)
    }
  }

  if (wetted <= 0)
    return null

  const ringAt = (sector: number, ring: number): number =>
    1 + sector % sectors * RINGS + (ring - 1)

  for (let sector = 0; sector < sectors; sector += 1) {
    // Wound so the fan faces up. The bearing runs the other way round in the
    // xz plane than the winding does, which is why the middle triangle takes
    // the *next* sector first.
    indices.push(0, ringAt(sector + 1, 1), ringAt(sector, 1))

    for (let ring = 1; ring < RINGS; ring += 1) {
      const inner = ringAt(sector, ring)
      const next  = ringAt(sector + 1, ring)

      indices.push(inner, next, ringAt(sector, ring + 1))
      indices.push(next, ringAt(sector + 1, ring + 1), ringAt(sector, ring + 1))
    }
  }

  const geometry = new BufferGeometry()

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  return { geometry, wetted }
}

/** Every tarn in the archipelago, as one draw. */
export interface TarnWater {
  mesh: Mesh

  /** How many pools there are, and the widest water in any of them, in metres. */
  pools:  number
  widest: number

  update(season: SeasonState): void
  dispose(): void
}

/**
 * Every island's pool, merged into one mesh with one material.
 *
 * Built in each island's local frame — the only frame the survey, the height
 * field and the terrain grid agree in — and translated into the world
 * afterwards, exactly the way the becks and the cart ruts are.
 *
 * @returns The water, or `null` when no island in the archipelago has ground
 *   that holds any.
 */
export function createTarnWater (
  config:       LiveConfig,
  archipelago:  ArchipelagoSurvey,
  quality:      AtmosphereQuality,
  baseSegments: number,
): TarnWater | null {
  const scape                    = config()
  const pieces: BufferGeometry[] = []

  // The margin takes the streambed's own colour, so the water has no seam
  // against the bank it is lying against — the beck's answer to the same
  // question, and the same two entries in the palette.
  const shallow = new Color(scape.palette.streambed)
  const deep    = new Color(scape.palette.deepWater).multiplyScalar(DEEP)

  let pools  = 0
  let widest = 0

  for (const landmass of archipelago.landmasses) {
    const { tarn } = landmass.survey

    if (!tarn)
      continue

    const segments = patchSegments(
      scape.terrain.size,
      landmass.config.terrain.size,
      baseSegments,
      landmass.detail,
    )

    const surfaceAt = drawnSurfaceOf(landmass.survey.field, landmass.config.terrain.size, segments)
    const pool      = tarnGeometry(tarn, surfaceAt, quality.tarnSectors, shallow, deep)

    if (!pool)
      continue

    pool.geometry.translate(landmass.origin.x, 0, landmass.origin.z)
    pieces.push(pool.geometry)
    pools += 1
    widest = Math.max(widest, pool.wetted * 2)
  }

  if (pieces.length === 0)
    return null

  const geometry = mergeGeometryList(pieces, false)
  for (const piece of pieces)
    piece.dispose()

  geometry.computeBoundingSphere()

  const uniforms: Record<string, IUniform> = {
    uTarnIce:    { value: new Color(scape.palette.ice) },
    uTarnSnow:   { value: new Color(scape.palette.snow) },
    uTarnFreeze: { value: 0 },
    uTarnLying:  { value: 0 },
  }

  // Opaque, for the reason the beck is: a transparent sheet over a bed painted
  // the colour the depth tint already paints buys nothing, and it would add a
  // fifth surface to an ordering this scape has been bitten by — see
  // `scene/layers.ts`.
  const material = new MeshStandardMaterial({
    name:         'tarn-water',
    vertexColors: true,
    roughness:    0.18,
    metalness:    0.05,
  })

  material.onBeforeCompile = (program: WebGLProgramParametersWithUniforms) => {
    Object.assign(program.uniforms, uniforms)

    program.fragmentShader = program.fragmentShader
      .replace('#include <common>', `#include <common>\n${TARN_PARS_FRAGMENT}`)
      .replace('#include <color_fragment>', /* glsl */ `
#include <color_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb, uTarnIce, uTarnFreeze);
diffuseColor.rgb = mix(diffuseColor.rgb, uTarnSnow, uTarnLying);
`)
  }

  material.customProgramCacheKey = () => 'scape-tarn'

  const mesh = new Mesh(geometry, material)
  mesh.name  = 'tarn-water'

  // It takes the sun and the cloud shadow the ground takes and casts nothing:
  // a sheet lying in its own basin has nothing to cast onto.
  mesh.receiveShadow = true
  mesh.updateMatrix()
  mesh.matrixAutoUpdate = false

  return {
    mesh,
    pools,
    widest,

    update (season) {
      const tarn   = config().tarn
      const locked = tarnFreeze(season.freeze, tarn.frost)

      // The mirror is the pool's whole character, and it is a surface property
      // rather than a colour — so it is the roughness that moves, and it moves
      // the other way from the slider. Ice is not a mirror: what freezes over
      // goes matte, which is why the lock is in here too.
      material.roughness = 0.05 + (1 - tarn.mirror) * 0.6 + locked * 0.35
      material.metalness = 0.05 + tarn.mirror * 0.25 * (1 - locked)

      uniforms.uTarnFreeze.value = locked
      uniforms.uTarnLying.value  = locked * season.snow;
      (uniforms.uTarnIce.value as Color).copy(season.iceColor);
      (uniforms.uTarnSnow.value as Color).copy(season.snowColor)
    },

    dispose () {
      geometry.dispose()
      material.dispose()
    },
  }
}

// perf: one draw for every tarn in the archipelago. `tarnSectors` × 4 + 1
// vertices per pool — 177 on the desktop tier, 81 on the cheapest — with no
// texture fetch and two colour mixes in the fragment.
