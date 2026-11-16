import {
  BufferAttribute,
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector2,
  Vector3,
} from 'three'
import type {
  IUniform,
  OrthographicCamera,
  Texture,
  WebGLProgramParametersWithUniforms,
} from 'three'
import { defineModule, smoothstep } from 'threejs-scene'
import { bakeAlphaField } from 'threejs-scene/modules/assets'
import {
  WEATHER_BANK_BEGIN_VERTEX,
  WEATHER_BANK_MAP_FRAGMENT,
  WEATHER_BANK_PARS_FRAGMENT,
  WEATHER_BANK_PARS_VERTEX,
  weatherBankDrift,
  weatherBankTile,
} from './weather-bank.ts'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import type { DaylightState } from './daylight.ts'
import { sampleHeight } from './noise.ts'
import type { AtmosphereQuality } from './quality.ts'
import type { TextureCatalogue } from './textures/catalogue.ts'
import type { WindState } from './wind.ts'
import { LAYER } from './layers.ts'


export interface MistOptions {
  camera:  OrthographicCamera
  config:  LiveConfig
  quality: AtmosphereQuality

  /** Live sky state — mist is the fog colour, and the fog colour has a clock now. */
  daylight: DaylightState

  /**
   * The scape's one wind.
   *
   * Every sheet used to pick a heading off the seed and its own index, so a bank
   * of fog crossed the island at an angle unrelated to the grass leaning in it.
   * They travel on the wind now, spread by a few degrees apiece so the stack
   * still has parallax in it.
   */
  wind: WindState

  /**
   * The scape's maps, for the bank alone.
   *
   * The mist field is a 79 m tile and the world is 1520 m, so every sheet in
   * here was a lattice of the same wisp stamped nineteen times across the
   * archipelago — the single most visible thing in the scape at the wide poses.
   * The bank is the world-sized field that was missing; it is read off
   * `sky.cloudShadow` because that is the one map the whole weather agrees on.
   * See `weather-bank.ts`.
   */
  textures: TextureCatalogue
}

interface MistSheet {
  mesh: Mesh

  /** Radians this sheet's heading is turned off the wind. See {@link MistOptions.wind}. */
  spread: number
  speed:  number

  /** Accumulated wind travel, in UV units. Slices add a world term on top. */
  phaseX: number
  phaseY: number

  /** Wind travel this sheet has already scrolled to, so a live response cannot jump. */
  travelled: number

  /** This layer's share of the authored density. */
  weight: number

  /** The live colour the sheet follows. */
  color: Color
}

const TEXTURE_SIZE = 128
const DRIFT_SPEED  = 1.6

/** Radians between one sheet's heading and the next. See {@link MistOptions.wind}. */
const SHEET_SPREAD = 0.11

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
 *
 * Exported so `scape:map` can state the other half of that sentence as a number.
 * A wisp has a real-world size and this is it; what it is *not* is a licence to
 * stamp the same tile nineteen times across a 1520 m world, which is what the
 * wide poses showed before `weather-bank.ts` gave the field a world-sized one to
 * be modulated by.
 */
export const TILE_UNITS = 79

/**
 * The world-pinned sheets must cover the focus range and a two-to-one maximum
 * view before their radial fade reaches the frame. Their texture still repeats
 * every authored tile, so this changes reach without magnifying the wisps.
 */
const SHEET_WORLD_MULTIPLIER = 4.4

/** Upright slice spacing as a fraction of the widest authored frame. */
const SLICE_VIEW_FRACTION = 0.445


export function mistSheetSize (worldSize: number): number {
  return worldSize * SHEET_WORLD_MULTIPLIER
}

export function mistSliceSpacing (viewSize: number): number {
  return viewSize * SLICE_VIEW_FRACTION
}

export function mistSliceReach (index: number, count: number, viewSize: number): number {
  return (index - (count - 1) / 2) * mistSliceSpacing(viewSize)
}

const WHITE    = new Color('#ffffff')
const viewAxis = new Vector3()

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
  textures,
  wind,
}: MistOptions): ScapeModule {
  const count      = Math.max(1, quality.mistLayers)
  const sliceCount = Math.max(1, Math.round(count / 2))
  const sheetSize  = mistSheetSize(config().archipelago.worldSize)
  const waterLine  = config().terrain.waterLevel
  const amount     = config().atmosphere.mistAmount
  const upright    = sliceGeometry(sheetSize, MIST_HEIGHT)
  const texture    = bakeAlphaField(TEXTURE_SIZE, f => bakeMist(f, config().seed ^ 0x53a9))

  const mistColor = new Color(config().palette.fog).lerp(WHITE, 0.32)

  const visible    = amount > 0.01

  // The weather every slice is in, at a tile wider than the world — the same
  // set of uniform objects across the slices, and the same field, at
  // the same scale, that the cloud deck and the ground shadow read.
  const bankOffset: IUniform<Vector2>          = { value: new Vector2() }
  const bankScale: IUniform<number>            = { value: 1 / weatherBankTile(config().archipelago.worldSize) }
  const bank: IUniform<number>                 = { value: 0 }
  const bankUniforms: Record<string, IUniform> = {
    uCloudMap:          { value: textures.get('sky.cloudShadow') },
    uWeatherBankOffset: bankOffset,
    uWeatherBankScale:  bankScale,
    uWeatherBank:       bank,
  }

  function tile (index: number, scale: number): Texture {
    const map = texture.clone()
    map.repeat.setScalar(sheetSize / TILE_UNITS * scale * (1 + index * 0.34))
    map.needsUpdate = true
    return map
  }

  function drift (index: number, weight: number, color: Color): Omit<MistSheet, 'mesh'> {
    return {
      spread:    (index % 5 - 2) * SHEET_SPREAD,
      speed:     1 + index * 0.45,
      phaseX:    0,
      phaseY:    0,
      travelled: 0,
      weight,
      color,
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
  function mistMaterial (map: Texture, opacity: number, name: string, color: Color): MeshBasicMaterial {
    const material = new MeshBasicMaterial({
      name,
      map,
      color,
      transparent:  true,
      depthWrite:   false,
      vertexColors: true,
      opacity,
      fog:          true,
    })

    // Every sheet in every family takes the bank, and takes it in world metres
    // rather than in its own uv: each one carries a different `map.repeat` and
    // its own scrolling phase, so a uv here would be a different field on each
    // and none of them the ground's. The model matrix is the one frame they all
    // share, and it costs a varying — see `weather-bank.ts`.
    material.onBeforeCompile = (program: WebGLProgramParametersWithUniforms) => {
      Object.assign(program.uniforms, bankUniforms)

      program.vertexShader = program.vertexShader
        .replace('#include <common>', `#include <common>\n${WEATHER_BANK_PARS_VERTEX}`)
        .replace('#include <begin_vertex>', WEATHER_BANK_BEGIN_VERTEX)

      program.fragmentShader = program.fragmentShader
        .replace('#include <common>', `#include <common>\n${WEATHER_BANK_PARS_FRAGMENT}`)
        .replace('#include <map_fragment>', WEATHER_BANK_MAP_FRAGMENT)
    }

    return material
  }

  /**
   * One layer's per-frame work: colour, opacity, presence and wind travel.
   *
   * `amount` is the live mist density, and it is what decides whether the layer is drawn at all. A layer at zero is made
   * invisible rather than transparent, because a fullscreen transparent quad
   * that contributes nothing still costs every pixel it covers.
   */
  function advance (sheet: MistSheet, amount: number): void {
    const material = sheet.mesh.material as MeshBasicMaterial
    const map      = material.map

    material.color.copy(sheet.color)
    material.opacity   = amount * sheet.weight
    sheet.mesh.visible = amount > 0.01

    if (!map)
      return

    // Differenced against the wind's own travel rather than integrated from a
    // delta, for the reason the cloud deck gives: a response moved on the
    // overlay should change where the sheet goes next, not where it already is.
    const step = (wind.travel - sheet.travelled) *
      DRIFT_SPEED *
      sheet.speed *
      config().atmosphere.mistDrag /
      sheetSize *
      map.repeat.x

    const heading = wind.bearing + sheet.spread

    sheet.travelled = wind.travel
    sheet.phaseX   += Math.cos(heading) * step
    sheet.phaseY   += Math.sin(heading) * step
    map.offset.set(sheet.phaseX, sheet.phaseY)
  }

  const slices = Array.from({ length: sliceCount }, (_unused, index): MistSheet => {
    const weight   = (1 - index / (sliceCount + 1)) * SLICE_ALPHA
    const material = mistMaterial(tile(index, 0.5), amount * weight, `mist-slice-${index + 1}`, mistColor)

    const mesh          = new Mesh(upright, material)
    mesh.name           = `mist-slice-${index + 1}`
    mesh.rotation.order = 'YXZ'
    mesh.position.y     = waterLine + MIST_HEIGHT * 0.5 - 0.6
    mesh.renderOrder    = LAYER.mist + index
    mesh.frustumCulled  = false
    mesh.visible        = visible

    return { mesh, ...drift(index, weight, mistColor) }
  })

  return defineModule<ScapeConfig>({
    name: 'ground-mist',

    build (ctx) {
      for (const sheet of slices)
        ctx.scene.add(sheet.mesh)
    },

    update () {
      const density  = config().atmosphere.mistAmount
      const viewSize = camera.userData.viewSize as number ?? config().camera.viewSize
      const bankTile = weatherBankTile(config().archipelago.worldSize)
      const drifted  = weatherBankDrift(config().atmosphere.cloudDrag, wind.travel, bankTile)

      // The bank the sheets are in. No downsun throw, unlike the ground shadow's:
      // fog is the weather rather than the shadow of it, so it sits where the
      // bank sits. It rides the scape's one wind, which `STILL` parks.
      bankOffset.value.set(wind.dirX * drifted, wind.dirZ * drifted)
      bankScale.value = 1 / bankTile
      bank.value      = Math.max(0, config().atmosphere.weatherBank)

      // Mist is unlit, so nothing else would carry the time of day onto it. Take
      // the horizon straight from the clock and it stays the same substance as
      // the fog at every hour instead of glowing white through the night.
      mistColor.copy(daylight.horizon).lerp(WHITE, 0.32)

      for (const sheet of slices)
        advance(sheet, density)

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
        const reach = mistSliceReach(index, sliceCount, viewSize)
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
      for (const sheet of slices) {
        const material = sheet.mesh.material as MeshBasicMaterial
        sheet.mesh.removeFromParent()
        material.map?.dispose()
        material.dispose()
      }
      upright.dispose()
      texture.dispose()
    },
  })
}

// perf: one to three upright transparent draws. The shared 128² alpha field is
// baked once, so the only per-frame work is scrolling texture offsets and
// yawing the slices. The sea smoke these sheets used to share a family with is
// a term in the aerial chunk now (`seaSmoke` in `aerial.ts`): no draw, no mask.
