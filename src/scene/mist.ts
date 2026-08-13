import {
  BufferAttribute,
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
import type { OrthographicCamera, Texture } from 'three'
import { defineModule, smoothstep } from 'threejs-scene'
import type { AppModule } from 'threejs-scene'
import type { ScapeConfig } from './config.ts'
import type { DaylightState } from './daylight.ts'
import { sampleHeight } from './noise.ts'
import type { AtmosphereQuality } from './quality.ts'


export interface MistOptions {
  camera:  OrthographicCamera
  config:  ScapeConfig
  quality: AtmosphereQuality

  /** Live sky state — mist is the fog colour, and the fog colour has a clock now. */
  daylight: DaylightState
}

interface MistSheet {
  mesh:   Mesh
  driftX: number
  driftZ: number
  speed:  number

  /** Accumulated wind travel, in UV units. Slices add a world term on top. */
  phaseX: number
  phaseY: number

  /** This layer's share of the authored density. */
  weight: number
}

const TEXTURE_SIZE = 128
const DRIFT_SPEED  = 1.6
const LAYER_ALPHA  = 0.34

/** Per-slice opacity of the upright sheets, before the mist amount scales it. */
const SLICE_ALPHA = 0.26

/** How tall the mist column stands above the waterline, in metres. */
const MIST_HEIGHT = 9

/**
 * World units per tile of the mist field.
 *
 * The sheet has to be wide enough to reach past the terrain from any pan, but
 * the *pattern* has a real-world size that has nothing to do with how far the
 * sheet extends. Tie the repeat to the sheet instead of to this and widening
 * the sheet magnifies every wisp with it — a few big soft blobs, bilinearly
 * smoothed until the gaps close, which is how ground mist becomes a white-out.
 */
const TILE_UNITS = 79

/** Radial fade band, as fractions of the terrain extent. */
const REACH_IN  = 0.16
const REACH_OUT = 0.44

const WHITE    = new Color('#ffffff')
const viewAxis = new Vector3()

/**
 * A horizontal sheet that fades out to sea.
 *
 * The sheets are pinned to the world, and a flat sheet wide enough to survive
 * any pan is also wide enough to lie over every pixel of open water in the
 * frame — several of them stacked, which is a uniform white glaze over the lake
 * rather than weather. Ground mist collects over land and shallows in the first
 * place, so the alpha is baked to fall off radially: dense on the island, gone
 * by the time the eye is out at sea, and never an edge you can see.
 */
function sheetGeometry (size: number, extent: number): PlaneGeometry {
  const geometry = new PlaneGeometry(size, size, 40, 40)
  const position = geometry.getAttribute('position')
  const colors   = new Float32Array(position.count * 4)

  for (let index = 0; index < position.count; index += 1) {
    const radius = Math.hypot(position.getX(index), position.getY(index))
    const offset = index * 4

    colors[offset]     = 1
    colors[offset + 1] = 1
    colors[offset + 2] = 1
    colors[offset + 3] = 1 - smoothstep(extent * REACH_IN, extent * REACH_OUT, radius)
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 4))
  return geometry
}

/**
 * An upright slice of the same field.
 *
 * Stacked horizontal sheets only have depth when you look *across* them, so a
 * mist built from them alone thins out exactly as the view tips down, until it
 * is a set of planes seen edge-on. The fix is the standard one for volumetric
 * fog: add slices that stand upright and face the viewer, spaced along the view
 * axis, so there is always something between the eye and the ground whatever
 * the elevation. Alpha is dense at the waterline and gone by the top, and falls
 * off both sides so the slab never shows a vertical edge.
 */
function sliceGeometry (width: number, height: number): PlaneGeometry {
  const geometry = new PlaneGeometry(width, height, 32, 10)
  const position = geometry.getAttribute('position')
  const colors   = new Float32Array(position.count * 4)

  for (let index = 0; index < position.count; index += 1) {
    const across = Math.abs(position.getX(index)) / (width * 0.5)
    const up     = (position.getY(index) + height * 0.5) / height
    const offset = index * 4

    colors[offset]     = 1
    colors[offset + 1] = 1
    colors[offset + 2] = 1
    colors[offset + 3] = (1 - smoothstep(0.5, 1, across)) *
      smoothstep(0, 0.08, up) *
      (1 - smoothstep(0.16, 1, up))
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 4))
  return geometry
}

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
  daylight,
}: MistOptions): AppModule<Record<string, never>> {
  const count      = Math.max(1, quality.mistLayers)
  const sliceCount = Math.max(1, Math.round(count / 2))
  const sheetSize  = config.terrain.size * 2.8
  const spacing    = config.terrain.size * 0.3
  const waterLine  = config.terrain.waterLevel
  const amount     = config.atmosphere.mistAmount
  const geometry   = sheetGeometry(sheetSize, config.terrain.size)
  const upright    = sliceGeometry(sheetSize, MIST_HEIGHT)
  const field      = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4)
  bakeMist(field, config.seed ^ 0x53a9)

  const texture       = new DataTexture(field, TEXTURE_SIZE, TEXTURE_SIZE, RGBAFormat)
  texture.wrapS       = MirroredRepeatWrapping
  texture.wrapT       = MirroredRepeatWrapping
  texture.magFilter   = LinearFilter
  texture.minFilter   = LinearFilter
  texture.needsUpdate = true

  const mistColor = new Color(config.palette.fog).lerp(WHITE, 0.32)
  const visible   = amount > 0.01

  function tile (index: number, scale: number): Texture {
    const map = texture.clone()
    map.repeat.setScalar(sheetSize / TILE_UNITS * scale * (1 + index * 0.34))
    map.needsUpdate = true
    return map
  }

  function drift (index: number, weight: number): Omit<MistSheet, 'mesh'> {
    const heading = config.seed * 0.001 + index * 0.7

    return {
      driftX: Math.cos(heading),
      driftZ: Math.sin(heading),
      speed:  1 + index * 0.45,
      phaseX: 0,
      phaseY: 0,
      weight,
    }
  }

  /**
   * Opacity tracks the authored density, and nothing else.
   *
   * It used to be scaled every frame by the view elevation, which meant
   * orbiting or zooming quietly changed the weather. Mist belongs to the world,
   * not to where you happen to be standing — so it follows `mistAmount` alone,
   * which keeps it live for the tuning overlay while leaving the camera no say.
   */
  // `name` is carried purely so a failed program link can be attributed: three
  // prints `Material Name:` and nothing else when a driver declines to link and
  // declines to say why, and an unnamed material makes that line useless.
  function mistMaterial (map: Texture, opacity: number, name: string): MeshBasicMaterial {
    return new MeshBasicMaterial({
      name,
      map,
      color:        mistColor,
      transparent:  true,
      depthWrite:   false,
      vertexColors: true,
      opacity,
      fog:          true,
    })
  }

  const sheets = Array.from({ length: count }, (_unused, index): MistSheet => {
    const weight   = (1 - index / (count + 1)) * LAYER_ALPHA
    const material = mistMaterial(tile(index, 1), amount * weight, `mist-${index + 1}`)

    // Pinned to the world, not to the camera. A sheet that chases the focus
    // point drags its whole cloud pattern across the ground as you pan, which
    // reads as the *island* moving — the one thing ground mist must never do.
    const mesh         = new Mesh(geometry, material)
    mesh.name          = `mist-${index + 1}`
    mesh.rotation.x    = -Math.PI / 2
    mesh.position.y    = waterLine + 1.45 + index * 1.15
    mesh.renderOrder   = 2 + index
    mesh.frustumCulled = false
    mesh.visible       = visible

    return { mesh, ...drift(index, weight) }
  })

  const slices = Array.from({ length: sliceCount }, (_unused, index): MistSheet => {
    const weight   = (1 - index / (sliceCount + 1)) * SLICE_ALPHA
    const material = mistMaterial(tile(index, 0.5), amount * weight, `mist-slice-${index + 1}`)

    const mesh         = new Mesh(upright, material)
    mesh.name          = `mist-slice-${index + 1}`
    mesh.position.y    = waterLine + MIST_HEIGHT * 0.5 - 0.6
    mesh.renderOrder   = 2 + count + index
    mesh.frustumCulled = false
    mesh.visible       = visible

    return { mesh, ...drift(index + count, weight) }
  })

  const all = [ ...sheets, ...slices ]

  return defineModule<Record<string, never>>({
    name: 'ground-mist',

    build (ctx) {
      for (const sheet of all)
        ctx.scene.add(sheet.mesh)
    },

    update (_state, frame) {
      const density = config.atmosphere.mistAmount

      // Mist is unlit, so nothing else would carry the time of day onto it. Take
      // the horizon straight from the clock and it stays the same substance as
      // the fog at every hour instead of glowing white through the night.
      mistColor.copy(daylight.horizon).lerp(WHITE, 0.32)

      for (const sheet of all) {
        const material = sheet.mesh.material as MeshBasicMaterial
        const map      = material.map

        material.color.copy(mistColor)
        material.opacity   = density * sheet.weight
        sheet.mesh.visible = density > 0.01

        if (!map)
          continue

        const travel = frame.delta *
          DRIFT_SPEED *
          sheet.speed *
          config.atmosphere.mistWind /
          sheetSize *
          map.repeat.x

        sheet.phaseX += sheet.driftX * travel
        sheet.phaseY += sheet.driftZ * travel
        map.offset.set(sheet.phaseX, sheet.phaseY)
      }

      // The upright slices face the camera and spread along its view axis, so
      // the stack always has depth to look through whatever the elevation.
      viewAxis.setFromMatrixColumn(camera.matrixWorld, 2).setY(0)

      if (viewAxis.lengthSq() < 1e-6)
        return

      viewAxis.normalize()

      const focus = camera.userData.target as readonly [number, number, number] | undefined
      const yaw   = Math.atan2(viewAxis.x, viewAxis.z)
      const cos   = Math.cos(yaw)
      const sin   = Math.sin(yaw)

      for (const [ index, slice ] of slices.entries()) {
        const map = (slice.mesh.material as MeshBasicMaterial).map
        if (!map)
          continue

        // Centred on the focus, not on the origin. A stack pinned to the world
        // origin falls behind the camera the moment you pan to the far side of
        // the map, and the upright mist simply stops existing there.
        const reach = (index - (sliceCount - 1) / 2) * spacing
        const x     = (focus?.[0] ?? 0) - viewAxis.x * reach
        const z     = (focus?.[2] ?? 0) - viewAxis.z * reach

        slice.mesh.rotation.y = yaw
        slice.mesh.position.x = x
        slice.mesh.position.z = z

        // Following the focus is only safe because the pattern does not come
        // with it: the slice's own displacement along its local x axis is fed
        // back into the texture offset, so every wisp stays over the same patch
        // of ground while the quad slides underneath it.
        map.offset.x = slice.phaseX + (x * cos - z * sin) / sheetSize * map.repeat.x
      }
    },

    dispose () {
      for (const sheet of all) {
        const material = sheet.mesh.material as MeshBasicMaterial
        sheet.mesh.removeFromParent()
        material.map?.dispose()
        material.dispose()
      }
      geometry.dispose()
      upright.dispose()
      texture.dispose()
    },
  })
}

// perf: a handful of transparent draws, a third of them upright. The shared
// 128² alpha field is baked once and opacity is authored at build, so the only
// per-frame work is scrolling texture offsets and yawing the slices.
