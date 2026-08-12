import {
  Color,
  DataTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MirroredRepeatWrapping,
  PlaneGeometry,
  RGBAFormat,
  Vector3,
} from 'three'
import type { OrthographicCamera } from 'three'
import { defineModule, smoothstep } from 'threejs-scene'
import type { AppModule } from 'threejs-scene'
import type { ScapeConfig } from './config.ts'
import { sampleHeight } from './noise.ts'
import type { AtmosphereQuality } from './quality.ts'


export interface MistOptions {
  camera:  OrthographicCamera
  config:  ScapeConfig
  quality: AtmosphereQuality
}

interface MistSheet {
  mesh:   Mesh
  driftX: number
  driftZ: number
  speed:  number
  weight: number
}

const TEXTURE_SIZE = 128
const DRIFT_SPEED  = 1.6
const LAYER_ALPHA  = 0.34

// Elevation of the view direction, in sine, over which the mist fades up.
const GRAZE_IN  = 0.3
const GRAZE_OUT = 0.58
const WHITE     = new Color('#ffffff')
const viewAxis  = new Vector3()

function bakeMist (data: Uint8Array, seed: number): void {
  for (let y = 0; y < TEXTURE_SIZE; y += 1)
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const sample = sampleHeight(
        x / TEXTURE_SIZE * 96,
        y / TEXTURE_SIZE * 96,
        seed,
        1,
      )
      const alpha  = Math.max(0, Math.min(1, sample * 1.25 + 0.32)) ** 1.6
      const offset = (y * TEXTURE_SIZE + x) * 4

      data[offset]     = 255
      data[offset + 1] = 255
      data[offset + 2] = 255
      data[offset + 3] = Math.round(alpha * 255)
    }
}

export function createMistLayer ({
  camera,
  config,
  quality,
}: MistOptions): AppModule<Record<string, never>> {
  const count     = Math.max(1, quality.mistLayers)
  const sheetSize = config.terrain.size * 1.5
  const geometry  = new PlaneGeometry(sheetSize, sheetSize)
  const field     = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4)
  bakeMist(field, config.seed ^ 0x53a9)

  const texture       = new DataTexture(field, TEXTURE_SIZE, TEXTURE_SIZE, RGBAFormat)
  texture.wrapS       = MirroredRepeatWrapping
  texture.wrapT       = MirroredRepeatWrapping
  texture.magFilter   = LinearFilter
  texture.minFilter   = LinearFilter
  texture.needsUpdate = true

  const mistColor = new Color(config.palette.fog).lerp(WHITE, 0.32)
  const sheets    = Array.from({ length: count }, (_unused, index): MistSheet => {
    const map = texture.clone()
    map.repeat.setScalar(1.6 + index * 0.55)
    map.needsUpdate = true

    const material = new MeshBasicMaterial({
      map,
      color:       mistColor,
      transparent: true,
      depthWrite:  false,
      opacity:     config.atmosphere.mistAmount * (1 - index / (count + 1)) * LAYER_ALPHA,
      fog:         true,
    })

    const mesh         = new Mesh(geometry, material)
    mesh.name          = `mist-${index + 1}`
    mesh.rotation.x    = -Math.PI / 2
    mesh.position.y    = config.terrain.waterLevel + 1.45 + index * 1.15
    mesh.renderOrder   = 2 + index
    mesh.frustumCulled = false
    mesh.visible       = config.atmosphere.mistAmount > 0.01

    const heading = config.seed * 0.001 + index * 0.7
    return {
      mesh,
      driftX: Math.cos(heading),
      driftZ: Math.sin(heading),
      speed:  1 + index * 0.45,
      weight: 1 - index / (count + 1),
    }
  })

  return defineModule<Record<string, never>>({
    name: 'ground-mist',

    build (ctx) {
      for (const sheet of sheets)
        ctx.scene.add(sheet.mesh)
    },

    update (_state, frame) {
      const target = camera.userData.target as readonly [number, number, number] | undefined
      const focusX = target?.[0] ?? 0
      const focusZ = target?.[2] ?? 0

      // Fade the mist out as the view flattens.
      //
      // These are flat sheets, so from above you see each one over a small
      // patch of ground, while at a grazing angle every one of them stretches
      // to the horizon and the whole lower frame ends up behind four stacked
      // layers at once. Physically more path length really does mean more mist
      // — but a miniature reads as a miniature because you can see it, and a
      // white-out is not weather, it is a lost frame.
      viewAxis.setFromMatrixColumn(camera.matrixWorld, 2)

      const graze = 0.28 + 0.72 * smoothstep(GRAZE_IN, GRAZE_OUT, Math.abs(viewAxis.y))

      for (const sheet of sheets) {
        const material = sheet.mesh.material as MeshBasicMaterial
        const map      = material.map
        if (!map)
          continue

        const travel = frame.delta *
          DRIFT_SPEED *
          sheet.speed *
          config.atmosphere.mistWind /
          sheetSize *
          map.repeat.x

        map.offset.x += sheet.driftX * travel
        map.offset.y += sheet.driftZ * travel
        sheet.mesh.position.x = focusX
        sheet.mesh.position.z = focusZ
        material.opacity      = config.atmosphere.mistAmount * sheet.weight * LAYER_ALPHA * graze
      }
    },

    dispose () {
      for (const sheet of sheets) {
        const material = sheet.mesh.material as MeshBasicMaterial
        sheet.mesh.removeFromParent()
        material.map?.dispose()
        material.dispose()
      }
      geometry.dispose()
      texture.dispose()
    },
  })
}

// perf: two transparent draws on mobile and four on desktop. the shared 128²
// alpha field is baked once; per-frame work only scrolls texture offsets.
