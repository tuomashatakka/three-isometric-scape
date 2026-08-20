import {
  BufferAttribute,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three'
import type { OrthographicCamera, Texture } from 'three'
import { defineModule, smoothstep } from 'threejs-scene'
import { bakeAlphaField } from 'threejs-scene/modules/assets'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import type { DaylightState } from './daylight.ts'
import { sampleHeight } from './noise.ts'
import type { AtmosphereQuality } from './quality.ts'
import { LAYER } from './layers.ts'


export interface CloudOptions {
  camera:  OrthographicCamera
  config:  LiveConfig
  quality: AtmosphereQuality

  /** Live sky state, so the deck is lit by the same clock as everything else. */
  daylight: DaylightState
}

interface CloudDeck {
  mesh:   Mesh
  driftX: number
  driftZ: number
  speed:  number
  phaseX: number
  phaseY: number
  weight: number
}

const TEXTURE_SIZE = 128
const DRIFT_SPEED  = 2.4
const DECK_ALPHA   = 0.34

/**
 * Tile width as a fraction of the widest authored frame.
 *
 * The deck follows the world's extent, but cloud density is a screen-space
 * composition: widening the camera must widen a tile with it or the sky becomes
 * a wallpaper of tiny repeats. 0.809 preserves the 106.8m tile against the 132m
 * maximum view the single-island composition was tuned on.
 */
const TILE_VIEW_FRACTION = 0.809

export function cloudTileSize (maxViewSize: number): number {
  return maxViewSize * TILE_VIEW_FRACTION
}

/** Where the field stops being sky and starts being sheet, as fractions of the sheet. */
const REACH_IN  = 0.2
const REACH_OUT = 0.47

/** Noise level the cloud edge is cut at — below it is clear sky, and it stays clear. */
const CUT = 0.55

const WHITE = new Color('#ffffff')

/**
 * The alpha field, cut into cloud rather than left as haze.
 *
 * The mist uses this same fBm raised to a power, which keeps a little of it
 * everywhere — right for something you are standing in. A cloud deck read from
 * underneath has to have *gaps*, or it is just a grey filter over the frame, so
 * the field is thresholded instead: below the cut there is no cloud at all, and
 * the sky above the island stays a sky.
 */
function bakeClouds (data: Uint8Array, seed: number): void {
  for (let y = 0; y < TEXTURE_SIZE; y += 1)
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const sample = sampleHeight(x / TEXTURE_SIZE * 84, y / TEXTURE_SIZE * 84, seed, 1) * 0.5 + 0.5
      const offset = (y * TEXTURE_SIZE + x) * 4

      data[offset]     = 255
      data[offset + 1] = 255
      data[offset + 2] = 255
      data[offset + 3] = Math.round(smoothstep(CUT, CUT + 0.22, sample) * 255)
    }
}

function deckGeometry (size: number): PlaneGeometry {
  const geometry = new PlaneGeometry(size, size, 24, 24)
  const position = geometry.getAttribute('position')
  const colors   = new Float32Array(position.count * 4)

  for (let index = 0; index < position.count; index += 1) {
    const radius = Math.hypot(position.getX(index), position.getY(index)) / size
    const offset = index * 4

    colors[offset]     = 1
    colors[offset + 1] = 1
    colors[offset + 2] = 1
    colors[offset + 3] = 1 - smoothstep(REACH_IN, REACH_OUT, radius)
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 4))
  return geometry
}

/**
 * The sky.
 *
 * Same technique as the ground mist — world-pinned sheets of a baked alpha field
 * scrolling on the wind — moved up above the terrain and fading in as you pull
 * back. That gating is not a performance dodge: an orthographic camera zoomed in
 * sits *below* the deck, so the only thing overhead cloud could do there is
 * cover the frame. Pull out and the camera climbs past it, and the deck becomes
 * what it is meant to be, weather between you and the islands.
 */
export function createCloudLayer ({
  camera,
  config,
  quality,
  daylight,
}: CloudOptions): ScapeModule {
  const count    = Math.max(2, quality.mistLayers)
  const deckSize = config().archipelago.worldSize * 4.4
  const base     = config().terrain.waterLevel + config().atmosphere.cloudHeight
  const geometry = deckGeometry(deckSize)
  const tint     = new Color()
  const texture  = bakeAlphaField(TEXTURE_SIZE, f => bakeClouds(f, config().seed ^ 0x2c17))

  function tile (index: number): Texture {
    const map = texture.clone()
    map.repeat.setScalar(deckSize / cloudTileSize(config().camera.maxViewSize) * (1 + index * 0.29))
    map.offset.set(index * 0.37, index * 0.19)
    map.needsUpdate = true
    return map
  }

  const decks = Array.from({ length: count }, (_unused, index): CloudDeck => {
    const heading  = config().seed * 0.0013 + index * 1.1
    const weight   = (1 - index / (count + 1)) * DECK_ALPHA
    const material = new MeshBasicMaterial({
      name:         `cloud-deck-${index + 1}`,
      map:          tile(index),
      transparent:  true,
      depthWrite:   false,
      vertexColors: true,
      side:         DoubleSide,
      opacity:      0,

      // Unfogged on purpose. Linear fog fades by distance from the camera, and
      // the deck is the furthest thing in the frame — leave it in and every
      // cloud dissolves into the fog colour exactly when it comes into view.
      fog: false,
    })

    const mesh         = new Mesh(geometry, material)
    mesh.name          = `cloud-${index + 1}`
    mesh.rotation.x    = -Math.PI / 2
    mesh.position.y    = base + index * 5.5
    mesh.renderOrder   = LAYER.clouds + index
    mesh.frustumCulled = false
    mesh.visible       = false

    return {
      mesh,
      driftX: Math.cos(heading),
      driftZ: Math.sin(heading),
      speed:  1 + index * 0.38,
      phaseX: 0,
      phaseY: 0,
      weight,
    }
  })

  return defineModule<ScapeConfig>({
    name: 'sky-clouds',

    build (ctx) {
      for (const deck of decks)
        ctx.scene.add(deck.mesh)
    },

    update (_state, frame) {
      const { minViewSize, maxViewSize } = config().camera
      const viewSize                     = camera.userData.viewSize as number ?? config().camera.viewSize
      const zoom                         = smoothstep(
        minViewSize + (maxViewSize - minViewSize) * 0.45,
        minViewSize + (maxViewSize - minViewSize) * 0.9,
        viewSize,
      )
      const cover = config().atmosphere.cloudCover * zoom

      // Lit by the same sky the fog and the sun are. Cloud is the one surface in
      // the frame with nothing but ambient on it, so if it does not follow the
      // clock it stays daylight-white through the night.
      tint.copy(daylight.horizon).lerp(WHITE, 0.42 * daylight.day + 0.1)

      for (const deck of decks) {
        const material = deck.mesh.material as MeshBasicMaterial
        const map      = material.map

        material.opacity  = cover * deck.weight
        material.color.copy(tint)
        deck.mesh.visible = cover > 0.01

        if (!map || !deck.mesh.visible)
          continue

        const travel = frame.delta *
          DRIFT_SPEED *
          deck.speed *
          config().atmosphere.cloudSpeed /
          deckSize *
          map.repeat.x

        deck.phaseX += deck.driftX * travel
        deck.phaseY += deck.driftZ * travel
        map.offset.set(deck.phaseX, deck.phaseY)
      }
    },

    dispose () {
      for (const deck of decks) {
        const material = deck.mesh.material as MeshBasicMaterial
        deck.mesh.removeFromParent()
        material.map?.dispose()
        material.dispose()
      }
      geometry.dispose()
      texture.dispose()
    },
  })
}

// perf: two or three unlit transparent quads, drawn only while zoomed out, over
// one shared 128² alpha field and one shared geometry. Nothing per-frame but
// texture offsets, an opacity and a colour.
