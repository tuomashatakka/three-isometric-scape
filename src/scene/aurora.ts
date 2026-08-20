import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three'
import type { OrthographicCamera, Texture } from 'three'
import { defineModule, smoothstep } from 'threejs-scene'
import { bakeAlphaField } from 'threejs-scene/modules/assets'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import type { DaylightState } from './daylight.ts'
import { sampleHeight } from './noise.ts'
import type { AtmosphereQuality } from './quality.ts'
import { deckReveal, deckViewSize } from './sky-deck.ts'


export interface AuroraOptions {
  camera:  OrthographicCamera
  config:  LiveConfig
  quality: AtmosphereQuality

  /** Live sky state. The aurora only exists in the part of it the sun has left. */
  daylight: DaylightState
}

interface Veil {
  mesh:   Mesh
  driftX: number
  driftY: number
  speed:  number
  phaseX: number
  phaseY: number

  /** This layer's share of the authored brightness. */
  weight: number
}

const TAU          = Math.PI * 2
const TEXTURE_SIZE = 160
const DRIFT_SPEED  = 2.1
const VEIL_ALPHA   = 0.32

/**
 * Tile width as a fraction of the widest authored frame.
 *
 * The veil extent follows the world, but its arc count belongs to the picture.
 * Scaling this from the camera keeps one broad ribbon and dark sky beside it
 * when the archipelago grows. 1.575 preserves the 207.8m tile against the 132m
 * maximum view the enlarged single island was tuned on.
 */
const TILE_VIEW_FRACTION = 1.575

export function auroraTileSize (maxViewSize: number): number {
  return maxViewSize * TILE_VIEW_FRACTION
}

/** Where the deck stops being sky and starts being quad, as fractions of the sheet. */
const REACH_IN  = 0.22
const REACH_OUT = 0.5

/** Metres of clearance the veil keeps above the cloud deck. */
const CLEARANCE = 8

/** Metres between the stacked veils. Parallax is the only depth a flat deck has. */
const LAYER_STEP = 4.5

/** Half-width of an auroral arc, in tile units. */
const BAND = 0.09

/** How far the arc wanders across the tile, and how far behind it the second one trails. */
const WANDER = 0.13
const TRAIL  = 0.27

/** Tile-space frequency of the ray striations along an arc. */
const RAY_SCALE = 52

const rgb = { r: 0, g: 0, b: 0 }

/**
 * How bright the curtain is, for a sky of a given darkness.
 *
 * One gate, where there used to be two. An aurora is there all day and is
 * simply outshone, so the only question is how much sky the sun has left — and
 * since `daylight.dark` is solved from where the sun actually stands on this
 * week of the year, the time of day and the week of the year are already the
 * same number. A second seasonal term on top of it would be the same fact
 * counted twice.
 *
 * There is deliberately no weather term. Solar activity is not a thing this
 * scape models, and a random flare would be the one non-deterministic thing in
 * a world that is otherwise a seed and a coordinate.
 */
export function auroraBrightness (dark: number, strength: number): number {
  return Math.max(0, strength) * Math.min(1, Math.max(0, dark))
}

/**
 * The deck, faded to nothing before its own edge.
 *
 * Same profile as the cloud deck and for the same reason — a transparent quad
 * with a straight rim on it reads as a quad — but a wider one. The aurora is
 * additive, so its edge is a *brightness* falling off rather than a cloud
 * thinning, and the eye finds a hard line in brightness much faster.
 */
function veilGeometry (size: number): PlaneGeometry {
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
 * The field: two wandering arcs, striated into rays, coloured across their width.
 *
 * Unlike the mist and the cloud fields this one carries colour as well as alpha,
 * because the colour *is* the structure. An aurora is green where the curtain is
 * dense and violet where it thins out at the fringes, so the tint is a function
 * of the distance from the arc's centre line — the same number the alpha is
 * already computed from, and impossible to keep in step if it were a gradient
 * applied afterwards.
 *
 * Everything in it is periodic in `u`, and it has to be. The centre lines are
 * sums of sines, so an arc leaves one edge of the tile at the height it enters
 * the next; the ray noise is cross-faded with a copy of itself one tile over,
 * which is the standard way to make a field that has no period wrap as if it
 * had one. The alternative is mirrored wrapping, and that was tried: reflecting
 * a wandering arc turns every tile boundary into a hard chevron, and a sky full
 * of zigzags is the one thing an aurora never looks like.
 */
function bakeVeil (data: Uint8Array, seed: number, core: Color, crown: Color): void {
  const tone = new Color()

  for (let y = 0; y < TEXTURE_SIZE; y += 1)
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const u     = x / TEXTURE_SIZE
      const v     = y / TEXTURE_SIZE
      const lead  = 0.5 + WANDER * Math.sin(u * TAU) + WANDER * 0.26 * Math.sin(u * TAU * 2 + 1.7)
      const trail = lead + TRAIL + WANDER * 0.22 * Math.sin(u * TAU * 2 - 0.9)

      // Whichever arc this pixel belongs to. Taken as a maximum rather than a
      // sum: two curtains overlapping do not add up to a brighter curtain, they
      // are simply two curtains, and adding them fills the gap between the arcs
      // that the second arc exists to show.
      const near   = (v - lead) / BAND
      const far    = (v - trail) / BAND
      const first  = Math.exp(-near * near)
      const second = Math.exp(-far * far) * 0.55
      const across = first >= second ? Math.abs(near) : Math.abs(far)
      const arc    = Math.max(first, second)

      const here   = sampleHeight(u * RAY_SCALE, v * 6, seed, 1)
      const over   = sampleHeight((u - 1) * RAY_SCALE, v * 6, seed, 1)
      const ray    = (here + (over - here) * u) * 0.5 + 0.5
      const alpha  = arc * (0.36 + 0.64 * ray)
      const offset = (y * TEXTURE_SIZE + x) * 4

      tone.copy(core).lerp(crown, Math.min(1, across * 0.4))
        .getRGB(rgb, SRGBColorSpace)

      data[offset]     = Math.round(rgb.r * 255)
      data[offset + 1] = Math.round(rgb.g * 255)
      data[offset + 2] = Math.round(rgb.b * 255)
      data[offset + 3] = Math.round(Math.min(1, alpha) * 255)
    }
}

/**
 * The winter night sky.
 *
 * Built as a deck rather than as a curtain on the horizon, and that is a fact
 * about the camera before it is a fact about the aurora. An orthographic view
 * tipped fifty degrees down puts the far distance a couple of hundred units
 * *above* the top of the frame — there is no horizon in this scape to hang a
 * curtain against, and a wall of light standing out at sea would be rendered
 * correctly and entirely off screen.
 *
 * A deck the camera looks *down* on is a fiction: the light is a hundred
 * kilometres up and the eye is eighty metres. It is also the fiction the sky
 * deck already runs, and for the same reason — this scape's camera flies above
 * its own weather, and a layer it cannot see is a layer it does not have. The
 * veils are stacked above the clouds so at least the order is right.
 *
 * The rest follows the cloud deck exactly — world-pinned sheets over one baked
 * field, faded in as the view pulls back, because the camera at the near zoom
 * sits *below* the deck and the only thing an overhead sheet could do there is
 * cover the picture.
 */
export function createAuroraLayer ({
  camera,
  config,
  quality,
  daylight,
}: AuroraOptions): ScapeModule | null {
  if (quality.auroraLayers < 1)
    return null

  const count    = quality.auroraLayers
  const deckSize = config().archipelago.worldSize * 4.4
  const geometry = veilGeometry(deckSize)
  const texture  = bakeAlphaField(
    TEXTURE_SIZE,
    f => bakeVeil(f, config().seed ^ 0x6b19, new Color(config().palette.aurora), new Color(config().palette.auroraCrown)),
    { wrap: RepeatWrapping, colorSpace: SRGBColorSpace },
  )

  function tile (index: number): Texture {
    const map = texture.clone()
    map.repeat.setScalar(deckSize / auroraTileSize(config().camera.maxViewSize) * (1 + index * 0.21))
    map.offset.set(index * 0.41, index * 0.27)
    map.needsUpdate = true
    return map
  }

  const veils = Array.from({ length: count }, (_unused, index): Veil => {
    const heading  = config().seed * 0.0007 + index * 0.83
    const weight   = (1 - index / (count + 1)) * VEIL_ALPHA
    const material = new MeshBasicMaterial({
      name:         `aurora-${index + 1}`,
      map:          tile(index),
      transparent:  true,
      depthWrite:   false,
      vertexColors: true,
      side:         DoubleSide,
      opacity:      0,

      // Two-sided *and* one draw. three renders a transparent double-sided
      // material in two passes — back faces, then front — which is a correct
      // default for a curved shell and pure waste for a flat sheet, where the
      // two passes cover the same pixels in the same order. `?debug` measured it
      // as exactly two draws per veil before this line and one after.
      forceSinglePass: true,

      // Light added to the sky rather than laid over it. An aurora is emission —
      // it never darkens the star behind it — and additive is also what keeps
      // the stacked veils from reading as three sheets of tinted glass.
      blending: AdditiveBlending,

      // Unfogged, like the cloud deck. Linear fog fades by distance from the
      // camera and this is the furthest thing in the frame; leave it on and the
      // aurora dissolves into the fog colour exactly where it comes into view.
      fog: false,
    })

    const mesh      = new Mesh(geometry, material)
    mesh.name       = `aurora-${index + 1}`
    mesh.rotation.x = -Math.PI / 2

    // Over the cloud deck, which is at 20 and up. Weather is a kilometre off the
    // ground and this is a hundred kilometres, so the clouds pass beneath it.
    mesh.renderOrder   = 30 + index
    mesh.frustumCulled = false
    mesh.visible       = false

    return {
      mesh,
      driftX: Math.cos(heading),
      driftY: Math.sin(heading) * 0.35,
      speed:  1 + index * 0.44,
      phaseX: 0,
      phaseY: 0,
      weight,
    }
  })

  return defineModule<ScapeConfig>({
    name: 'aurora',

    build (ctx) {
      for (const veil of veils)
        ctx.scene.add(veil.mesh)
    },

    update (_state, frame) {
      const { aurora, auroraHeight, cloudHeight } = config().atmosphere
      const zoom                                  = deckReveal(deckViewSize(camera, config), config().camera)

      // Both clocks and the zoom, in one number. The veils are made invisible
      // rather than transparent below it, because a map-wide additive quad
      // contributing nothing still costs every pixel it covers — and for most of
      // the year, and most of every day, it contributes nothing.
      const light = auroraBrightness(daylight.dark, aurora) * zoom
      const base  = config().terrain.waterLevel + Math.max(auroraHeight, cloudHeight + CLEARANCE)

      for (const [ index, veil ] of veils.entries()) {
        const material = veil.mesh.material as MeshBasicMaterial
        const map      = material.map

        material.opacity  = light * veil.weight
        veil.mesh.visible = light > 0.005

        if (!map || !veil.mesh.visible)
          continue

        veil.mesh.position.y = base + index * LAYER_STEP

        const travel = frame.delta *
          DRIFT_SPEED *
          veil.speed *
          config().atmosphere.auroraSpeed /
          deckSize *
          map.repeat.x

        veil.phaseX += veil.driftX * travel
        veil.phaseY += veil.driftY * travel
        map.offset.set(veil.phaseX, veil.phaseY)
      }
    },

    dispose () {
      for (const veil of veils) {
        const material = veil.mesh.material as MeshBasicMaterial
        veil.mesh.removeFromParent()
        material.map?.dispose()
        material.dispose()
      }
      geometry.dispose()
      texture.dispose()
    },
  })
}

// perf: one to three unlit additive quads over one shared 160² field and one
// shared geometry, drawn only on a dark night while the view is pulled back.
// Nothing per-frame but texture offsets, an opacity and a height. The material
// has the same shape as the cloud deck's, so three's cache hands it the program
// already linked and the scape gains none.
