import { BufferAttribute, Color, Mesh, PlaneGeometry } from 'three'
import type { BufferGeometry, Material } from 'three'
import { hash2, smoothstep } from 'threejs-scene'
import { mergeGeometryList } from 'threejs-scene/modules/assets'
import type { ScapeConfig } from '../config.ts'
import type { ArchipelagoSurvey } from './archipelago.ts'
import { cartRutGeometry } from './cart-ruts.ts'
import type { Footpaths } from './footpath.ts'
import type { HeightField } from './height.ts'
import { distanceToTrack, pastureInfluence, plotInfluence } from './layout.ts'
import type { ScapeLayout } from './layout.ts'


/**
 * Terrain colour.
 *
 * The scaffold lerped two colours by height, which reads as a gradient rather
 * than as ground. Real Nordic terrain is banded *and* slope-driven: granite
 * shows wherever the face is too steep to hold soil, whatever the altitude.
 * The slope override is what stops the bands looking like contour lines.
 */
export interface TerrainPainter {
  paint(height: number, slope: number, x: number, z: number, target: Color): Color
}

interface Band {
  offset: number
  color:  Color
}

/**
 * The altitude band a height falls in, blended with its neighbour.
 *
 * Clamps rather than extrapolates at both ends: below the first band and above
 * the last there is nothing to lerp toward, and lerping toward the band itself
 * is the only answer that does not invent a colour the palette never authored.
 */
function bandAt (bands: readonly Band[], relative: number, target: Color): Color {
  let lower = bands[0]
  let upper = bands[bands.length - 1]

  for (let index = 0; index < bands.length - 1; index += 1)
    if (relative >= bands[index].offset && relative <= bands[index + 1].offset) {
      lower = bands[index]
      upper = bands[index + 1]
      break
    }

  if (relative < bands[0].offset)
    upper = lower
  else if (relative > bands[bands.length - 1].offset)
    lower = upper

  const span = upper.offset - lower.offset
  const mix  = span === 0 ? 0 : smoothstep(lower.offset, upper.offset, relative)

  return target.copy(lower.color).lerp(upper.color, mix)
}

export function createTerrainPainter (
  config: ScapeConfig,
  layout: ScapeLayout,
  paths:  Footpaths,
): TerrainPainter {
  const { palette }    = config
  const { waterLevel } = config.terrain

  const bands: Band[] = [
    { offset: -2.4, color: new Color(palette.silt) },
    { offset: -0.25, color: new Color(palette.shore) },
    { offset: 0.55, color: new Color(palette.shore) },
    { offset: 1.6, color: new Color(palette.meadow) },
    { offset: 3.4, color: new Color(palette.dryGrass) },
    { offset: 5.2, color: new Color(palette.heath) },
    { offset: 7, color: new Color(palette.scree) },
    { offset: 9, color: new Color(palette.lichen) },
  ]

  const scree     = new Color(palette.scree)
  const track     = new Color(palette.track)
  const tilled    = new Color(palette.tilled)
  const yard      = new Color(palette.yard)
  const pasture   = new Color(palette.pasture)
  const streambed = new Color(palette.streambed)
  const trodden   = new Color(palette.trodden)

  const corridor = layout.track.width * 1.5

  return {
    paint (height, slope, x, z, target) {
      const relative = height - waterLevel

      bandAt(bands, relative, target)

      const exposed = smoothstep(0.34, 0.78, slope)
      if (exposed > 0)
        target.lerp(scree, exposed * 0.82)

      for (const plot of layout.plots) {
        const claim = plotInfluence(plot, x, z)

        if (claim > 0 && height > waterLevel + 0.4)
          target.lerp(tilled, claim * 0.72)
      }

      // Mown ground, painted over the altitude bands rather than under them.
      // The pasture sits high enough that the bands have already turned it
      // toward heath and scree, and grazed grass is exactly what that is not.
      const grazed = pastureInfluence(layout, x, z)
      if (grazed > 0)
        target.lerp(pasture, grazed * 0.62)

      const fromYard = Math.hypot(x - layout.yard.x, z - layout.yard.z)
      const onYard   = 1 - smoothstep(layout.yard.radius * 0.5, layout.yard.radius * 1.15, fromYard)
      if (onYard > 0)
        target.lerp(yard, onYard * 0.65)

      const onTrack = 1 - smoothstep(layout.track.width * 0.42, corridor, distanceToTrack(layout, x, z))
      if (onTrack > 0)
        target.lerp(track, onTrack * 0.88)

      // Over the track, under the beck.
      //
      // Weighted by how green the ground under it already is, which is the whole
      // reason this does not simply darken the farm. A path is *turf that has
      // been walked off*, so it can only show where there was turf: across the
      // meadow the full lerp lands, and on the yard, the road and the tilled
      // plots — ground that is bare because something else already made it bare —
      // it barely registers. Without the weight, eight routes converging on one
      // well turn the middle of the farm into a single brown patch, which reads
      // as a stain rather than as paths.
      const worn = paths.wearAt(x, z)
      if (worn > 0 && height > waterLevel + 0.1) {
        const green = Math.min(1, Math.max(
          0,
          (target.g * 2 - target.r - target.b) / (target.g + 0.05),
        ))

        target.lerp(trodden, worn * config.footpath.wear * (0.3 + 0.7 * green))
      }

      // Last, and over the track: the beck cuts *under* the road rather than
      // stopping at it, so the channel keeps its gravel across the crossing and
      // the bridge reads as spanning something. The wash is strongest on the
      // floor and thins onto the banks, which is where the altitude bands are
      // already doing the right thing on their own.
      const wet = layout.creek?.claimAt(x, z) ?? 0
      if (wet > 0)
        target.lerp(streambed, Math.min(1, wet * 1.15) * 0.74)

      const macro = hash2(x * 0.031, z * 0.031) * 0.14 + hash2(x * 0.19, z * 0.19) * 0.06
      target.multiplyScalar(0.92 + macro)

      return target
    },
  }
}

/**
 * The ground *as drawn* — the chord between the terrain's vertices, not the
 * continuous field they were sampled from.
 *
 * The two are not the same surface, and anything laid flat on the terrain has
 * to be laid on this one. The patch is a `PlaneGeometry` of `segments` quads
 * split along the diagonal that runs from a quad's far-near corner to its
 * near-far one, so the height inside a quad is a plane through three of its
 * corners, and it can stand tens of centimetres off `heightAt` where the ground
 * is curved — enough to swallow anything lifted by less than that.
 */
export function drawnSurfaceOf (
  field:    HeightField,
  size:     number,
  segments: number,
): (x: number, z: number) => number {
  const step = size / segments
  const half = size / 2
  const cell = (value: number): number =>
    Math.min(segments - 1, Math.max(0, Math.floor((value + half) / step)))

  return (x, z) => {
    const column = cell(x)
    const row    = cell(z)
    const left   = -half + column * step
    const near   = -half + row * step
    const across = (x - left) / step
    const along  = (z - near) / step

    const corner = field.heightAt(left, near)
    const far    = field.heightAt(left, near + step)
    const right  = field.heightAt(left + step, near)

    if (across + along <= 1)
      return corner + (right - corner) * across + (far - corner) * along

    const opposite = field.heightAt(left + step, near + step)

    return opposite + (far - opposite) * (1 - across) + (right - opposite) * (1 - along)
  }
}

function terrainGeometry (
  config:   ScapeConfig,
  layout:   ScapeLayout,
  field:    HeightField,
  paths:    Footpaths,
  segments: number,
): BufferGeometry {
  const geometry = new PlaneGeometry(config.terrain.size, config.terrain.size, segments, segments)
  geometry.rotateX(-Math.PI / 2)

  const positions = geometry.getAttribute('position')
  const colors    = new Float32Array(positions.count * 3)
  const painter   = createTerrainPainter(config, layout, paths)
  const color     = new Color()

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const z = positions.getZ(index)
    const y = field.heightAt(x, z)

    positions.setY(index, y)
    painter.paint(y, field.slopeAt(x, z), x, z, color).toArray(colors, index * 3)
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}

/**
 * The rut ribbon for one island, in that island's local space.
 *
 * It shares the terrain's painter rather than a second opinion about the ground
 * colour, which is what lets its outer edge sit invisibly on the surface it
 * lies on.
 */
function cartRutPatch (
  config:   ScapeConfig,
  layout:   ScapeLayout,
  field:    HeightField,
  paths:    Footpaths,
  segments: number,
): BufferGeometry | null {
  const painter = createTerrainPainter(config, layout, paths)
  const surface = drawnSurfaceOf(field, config.terrain.size, segments)

  return cartRutGeometry({
    ...config.cartRuts,
    track:     layout.track.points,
    yard:      layout.yard,
    rut:       new Color(config.palette.track).multiplyScalar(0.4),
    surfaceAt: surface,
    groundAt:  (x, z, target) =>
      painter.paint(field.heightAt(x, z), field.slopeAt(x, z), x, z, target),
  })
}

function terrainMesh (geometry: BufferGeometry, material: Material): Mesh {
  const terrain         = new Mesh(geometry, material)
  terrain.name          = 'terrain'
  terrain.receiveShadow = true
  terrain.castShadow    = true

  // The island never moves. Recomposing its matrix from a position, a rotation
  // and a scale that are the same three values every frame is a small cost, but
  // it is a cost with no possible effect.
  terrain.updateMatrix()
  terrain.matrixAutoUpdate = false
  return terrain
}

export function createTerrain (
  config:   ScapeConfig,
  layout:   ScapeLayout,
  field:    HeightField,
  paths:    Footpaths,
  material: Material,
  segments: number,
): Mesh {
  return terrainMesh(terrainGeometry(config, layout, field, paths, segments), material)
}

/**
 * One seabed and three independently sampled terrain patches, merged into one
 * draw. Each patch keeps the original island's metres-per-segment density.
 */
export function createArchipelagoTerrain (
  config:       ScapeConfig,
  archipelago:  ArchipelagoSurvey,
  material:     Material,
  baseSegments: number,
): Mesh {
  const pieces: BufferGeometry[] = []
  const seabed                   = new PlaneGeometry(archipelago.size, archipelago.size, 1, 1)
  seabed.rotateX(-Math.PI / 2)

  const seabedPositions = seabed.getAttribute('position')
  const seabedColors    = new Float32Array(seabedPositions.count * 3)
  const seabedColor     = new Color(config.palette.silt)

  for (let index = 0; index < seabedPositions.count; index += 1) {
    seabedPositions.setY(
      index,
      config.terrain.waterLevel - config.terrain.seabedDrop - 0.3,
    )
    seabedColor.toArray(seabedColors, index * 3)
  }

  seabed.setAttribute('color', new BufferAttribute(seabedColors, 3))
  pieces.push(seabed)

  for (const landmass of archipelago.landmasses) {
    const segments = Math.max(
      24,
      Math.round(baseSegments * landmass.config.terrain.size / config.terrain.size),
    )
    const geometry = terrainGeometry(
      landmass.config,
      landmass.survey.layout,
      landmass.survey.field,
      landmass.survey.paths,
      segments,
    )

    geometry.translate(landmass.origin.x, 0, landmass.origin.z)
    pieces.push(geometry)

    // The ruts are the one piece of the island whose density is its own rather
    // than the terrain grid's, which is the whole reason they exist as geometry.
    // They still merge into the same draw.
    const ruts = cartRutPatch(
      landmass.config,
      landmass.survey.layout,
      landmass.survey.field,
      landmass.survey.paths,
      segments,
    )

    if (ruts) {
      ruts.translate(landmass.origin.x, 0, landmass.origin.z)
      pieces.push(ruts)
    }
  }

  const merged = mergeGeometryList(pieces, false)
  for (const piece of pieces)
    piece.dispose()

  merged.computeBoundingSphere()
  return terrainMesh(merged, material)
}

// perf: one draw. Colour and height are baked at build time, so the per-frame
// cost is a single vertex-coloured standard material with no texture fetch
// beyond the shared cloud-shadow map.
