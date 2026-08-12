import { BufferAttribute, Color, Mesh, PlaneGeometry } from 'three'
import type { Material } from 'three'
import { hash2, smoothstep } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import type { HeightField } from './height.ts'
import { distanceToTrack, plotInfluence } from './layout.ts'
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

export function createTerrainPainter (config: ScapeConfig, layout: ScapeLayout): TerrainPainter {
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

  const scree  = new Color(palette.scree)
  const track  = new Color(palette.track)
  const tilled = new Color(palette.tilled)
  const yard   = new Color(palette.yard)

  const corridor = layout.track.width * 1.5

  return {
    paint (height, slope, x, z, target) {
      const relative = height - waterLevel

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

      target.copy(lower.color).lerp(upper.color, mix)

      const exposed = smoothstep(0.34, 0.78, slope)
      if (exposed > 0)
        target.lerp(scree, exposed * 0.82)

      for (const plot of layout.plots) {
        const claim = plotInfluence(plot, x, z)

        if (claim > 0 && height > waterLevel + 0.4)
          target.lerp(tilled, claim * 0.72)
      }

      const fromYard = Math.hypot(x - layout.yard.x, z - layout.yard.z)
      const onYard   = 1 - smoothstep(layout.yard.radius * 0.5, layout.yard.radius * 1.15, fromYard)
      if (onYard > 0)
        target.lerp(yard, onYard * 0.65)

      const onTrack = 1 - smoothstep(layout.track.width * 0.42, corridor, distanceToTrack(layout, x, z))
      if (onTrack > 0)
        target.lerp(track, onTrack * 0.88)

      const macro = hash2(x * 0.031, z * 0.031) * 0.14 + hash2(x * 0.19, z * 0.19) * 0.06
      target.multiplyScalar(0.92 + macro)

      return target
    },
  }
}

export function createTerrain (
  config:   ScapeConfig,
  layout:   ScapeLayout,
  field:    HeightField,
  material: Material,
  segments: number,
): Mesh {
  const { size } = config.terrain
  const geometry = new PlaneGeometry(size, size, segments, segments)
  geometry.rotateX(-Math.PI / 2)

  const positions = geometry.getAttribute('position')
  const colors    = new Float32Array(positions.count * 3)
  const painter   = createTerrainPainter(config, layout)
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

  const terrain         = new Mesh(geometry, material)
  terrain.name          = 'terrain'
  terrain.receiveShadow = true
  terrain.castShadow    = true
  return terrain
}

// perf: one draw. Colour and height are baked at build time, so the per-frame
// cost is a single vertex-coloured standard material with no texture fetch
// beyond the shared cloud-shadow map.
