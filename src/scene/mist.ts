import {
  BufferAttribute,
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
} from 'three'
import type { OrthographicCamera, Texture } from 'three'
import { defineModule, smoothstep } from 'threejs-scene'
import { bakeAlphaField } from 'threejs-scene/modules/assets'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import type { DaylightState } from './daylight.ts'
import { sampleHeight } from './noise.ts'
import type { AtmosphereQuality } from './quality.ts'
import type { SeasonState } from './season.ts'
import { LAYER } from './layers.ts'


export interface MistOptions {
  camera:  OrthographicCamera
  config:  LiveConfig
  quality: AtmosphereQuality

  /** Live sky state — mist is the fog colour, and the fog colour has a clock now. */
  daylight: DaylightState

  /**
   * Live year state. The sea smoke is a fortnight of the winter and nothing
   * else, so this is the only thing that decides whether it exists at all.
   */
  season: SeasonState
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

  /** The live colour this family follows — the fog's, or the smoke's colder one. */
  color: Color
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

/**
 * The world-pinned sheets must cover the focus range and a two-to-one maximum
 * view before their radial fade reaches the frame. Their texture still repeats
 * every authored tile, so this changes reach without magnifying the wisps.
 */
const SHEET_WORLD_MULTIPLIER = 4.4

/** Upright slice spacing as a fraction of the widest authored frame. */
const SLICE_VIEW_FRACTION = 0.445

/** Preserve the mask's world-space sampling density as its quad grows. */
const MASK_CELL_UNITS = 20

export function mistSheetSize (worldSize: number): number {
  return worldSize * SHEET_WORLD_MULTIPLIER
}

export function mistSliceSpacing (viewSize: number): number {
  return viewSize * SLICE_VIEW_FRACTION
}

export function mistSliceReach (index: number, count: number, viewSize: number): number {
  return (index - (count - 1) / 2) * mistSliceSpacing(viewSize)
}

function mistMaskSegments (size: number): number {
  return Math.ceil(size / MASK_CELL_UNITS)
}

/** Radial fade band, as fractions of the terrain extent. */
const REACH_IN  = 0.16
const REACH_OUT = 0.44

/** Per-sheet opacity of the sea smoke, before the year scales it. */
const SMOKE_ALPHA = 0.42

/** How far off the water the lowest smoke sheet lies, in metres. */
const SMOKE_RISE = 0.5

/** Metres between the smoke sheets. A steam fog is shallow; this is why. */
const SMOKE_STEP = 0.9

/**
 * Where the smoke begins and where it reaches full strength, as multiples of
 * the island's own radius. It starts at the coastline by construction.
 */
const SMOKE_IN  = 1
const SMOKE_OUT = 2

/**
 * Where the smoke gives out again, as fractions of the sheet's half-width.
 *
 * Both are inside 1, so the field is gone before the quad's own straight edge
 * is — a transparent sheet with a rim on it reads as a sheet.
 */
const SMOKE_EDGE_IN  = 0.68
const SMOKE_EDGE_OUT = 0.96

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
function sheetGeometry (size: number, config: ScapeConfig): PlaneGeometry {
  const segments = mistMaskSegments(size)
  const geometry = new PlaneGeometry(size, size, segments, segments)
  const position = geometry.getAttribute('position')
  const colors   = new Float32Array(position.count * 4)

  for (let index = 0; index < position.count; index += 1) {
    const x      = position.getX(index)
    const z      = position.getY(index)
    const offset = index * 4
    let alpha    = 0

    for (const landmass of config.archipelago.landmasses) {
      const distance = Math.hypot(x - landmass.origin[0], z - landmass.origin[1])
      alpha = Math.max(alpha, 1 - smoothstep(
        landmass.terrain.size * REACH_IN,
        landmass.terrain.size * REACH_OUT,
        distance,
      ))
    }

    colors[offset]     = 1
    colors[offset + 1] = 1
    colors[offset + 2] = 1
    colors[offset + 3] = alpha
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

/**
 * A horizontal sheet that only exists off the coast.
 *
 * The ground mist's profile turned inside out, and for a physical reason rather
 * than a compositional one. Sea smoke is water steaming into air colder than it
 * is, so it stands over open water and nowhere else — which is exactly the part
 * of the map the mist sheets have already faded out of. Nothing over the
 * island, full strength a couple of island-radii out, and gone again before the
 * sheet's own edge.
 *
 * There is no ice term in here, and there does not need to be one: the smoke
 * only ever has a strength during the weeks the sea has not shut yet, so the
 * open water it wants is all the water there is. See `seaSmokeAmount`.
 */
function smokeGeometry (size: number, config: ScapeConfig): PlaneGeometry {
  const segments = mistMaskSegments(size)
  const geometry = new PlaneGeometry(size, size, segments, segments)
  const position = geometry.getAttribute('position')
  const colors   = new Float32Array(position.count * 4)
  const half     = size * 0.5

  for (let index = 0; index < position.count; index += 1) {
    const x      = position.getX(index)
    const z      = position.getY(index)
    const radius = Math.hypot(x, z)
    const offset = index * 4
    let offshore = 1

    for (const landmass of config.archipelago.landmasses) {
      const landRadius = landmass.terrain.size * 0.5 * landmass.terrain.islandOuter
      const distance   = Math.hypot(x - landmass.origin[0], z - landmass.origin[1])

      offshore = Math.min(offshore, smoothstep(
        landRadius * SMOKE_IN,
        landRadius * SMOKE_OUT,
        distance,
      ))
    }

    colors[offset]     = 1
    colors[offset + 1] = 1
    colors[offset + 2] = 1
    colors[offset + 3] = offshore *
      (1 - smoothstep(half * SMOKE_EDGE_IN, half * SMOKE_EDGE_OUT, radius))
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
  season,
}: MistOptions): ScapeModule {
  const count      = Math.max(1, quality.mistLayers)
  const sliceCount = Math.max(1, Math.round(count / 2))
  const smokeCount = Math.max(1, Math.round(count / 2))
  const sheetSize  = mistSheetSize(config().archipelago.worldSize)
  const waterLine  = config().terrain.waterLevel
  const amount     = config().atmosphere.mistAmount
  const geometry   = sheetGeometry(sheetSize, config())
  const upright    = sliceGeometry(sheetSize, MIST_HEIGHT)
  const offshore   = smokeGeometry(sheetSize, config())
  const texture    = bakeAlphaField(TEXTURE_SIZE, f => bakeMist(f, config().seed ^ 0x53a9))

  const mistColor = new Color(config().palette.fog).lerp(WHITE, 0.32)

  // Whiter than the mist, and not as a matter of taste: sea smoke is water that
  // has just condensed out of the air standing on it, where ground mist is haze
  // the sky is lighting through. The one is nearly opaque white in the small and
  // the other never is.
  const smokeColor = new Color(config().palette.fog).lerp(WHITE, 0.62)
  const visible    = amount > 0.01

  function tile (index: number, scale: number): Texture {
    const map = texture.clone()
    map.repeat.setScalar(sheetSize / TILE_UNITS * scale * (1 + index * 0.34))
    map.needsUpdate = true
    return map
  }

  function drift (index: number, weight: number, color: Color): Omit<MistSheet, 'mesh'> {
    const heading = config().seed * 0.001 + index * 0.7

    return {
      driftX: Math.cos(heading),
      driftZ: Math.sin(heading),
      speed:  1 + index * 0.45,
      phaseX: 0,
      phaseY: 0,
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
    return new MeshBasicMaterial({
      name,
      map,
      color,
      transparent:  true,
      depthWrite:   false,
      vertexColors: true,
      opacity,
      fog:          true,
    })
  }

  /**
   * One layer's per-frame work: colour, opacity, presence and wind travel.
   *
   * `amount` is the family's live strength — the authored mist density for the
   * sheets and the slices, the year's own smoke for the offshore ones — and it
   * is what decides whether the layer is drawn at all. A layer at zero is made
   * invisible rather than transparent, because a fullscreen transparent quad
   * that contributes nothing still costs every pixel it covers.
   */
  function advance (sheet: MistSheet, amount: number, delta: number): void {
    const material = sheet.mesh.material as MeshBasicMaterial
    const map      = material.map

    material.color.copy(sheet.color)
    material.opacity   = amount * sheet.weight
    sheet.mesh.visible = amount > 0.01

    if (!map)
      return

    const travel = delta *
      DRIFT_SPEED *
      sheet.speed *
      config().atmosphere.mistWind /
      sheetSize *
      map.repeat.x

    sheet.phaseX += sheet.driftX * travel
    sheet.phaseY += sheet.driftZ * travel
    map.offset.set(sheet.phaseX, sheet.phaseY)
  }

  const sheets = Array.from({ length: count }, (_unused, index): MistSheet => {
    const weight   = (1 - index / (count + 1)) * LAYER_ALPHA
    const material = mistMaterial(tile(index, 1), amount * weight, `mist-${index + 1}`, mistColor)

    // Pinned to the world, not to the camera. A sheet that chases the focus
    // point drags its whole cloud pattern across the ground as you pan, which
    // reads as the *island* moving — the one thing ground mist must never do.
    const mesh         = new Mesh(geometry, material)
    mesh.name          = `mist-${index + 1}`
    mesh.rotation.x    = -Math.PI / 2
    mesh.position.y    = waterLine + 1.45 + index * 1.15
    mesh.renderOrder   = LAYER.mist + index
    mesh.frustumCulled = false
    mesh.visible       = visible

    return { mesh, ...drift(index, weight, mistColor) }
  })

  const slices = Array.from({ length: sliceCount }, (_unused, index): MistSheet => {
    const weight   = (1 - index / (sliceCount + 1)) * SLICE_ALPHA
    const material = mistMaterial(tile(index, 0.5), amount * weight, `mist-slice-${index + 1}`, mistColor)

    const mesh         = new Mesh(upright, material)
    mesh.name          = `mist-slice-${index + 1}`
    mesh.position.y    = waterLine + MIST_HEIGHT * 0.5 - 0.6
    mesh.renderOrder   = LAYER.mist + count + index
    mesh.frustumCulled = false
    mesh.visible       = visible

    return { mesh, ...drift(index + count, weight, mistColor) }
  })

  /**
   * The steam off the open water, in the weeks the sea has not shut yet.
   *
   * Deliberately flat and deliberately low, and with no upright slices in the
   * family. Sea smoke really is a shallow layer — a metre or two, against the
   * nine-metre column the ground mist stands in — so the thinning that argued
   * the slices into existence is not a failure here but the shape of the thing:
   * seen from the near zoom, across the water rather than down onto it, two
   * sheets a metre apart present as a bank lying along the coastline, which is
   * exactly what steam fog looks like from the shore.
   */
  const smoke = Array.from({ length: smokeCount }, (_unused, index): MistSheet => {
    const weight   = (1 - index / (smokeCount + 1)) * SMOKE_ALPHA
    const material = mistMaterial(tile(index, 0.62), 0, `sea-smoke-${index + 1}`, smokeColor)

    const mesh      = new Mesh(offshore, material)
    mesh.name       = `sea-smoke-${index + 1}`
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = waterLine + SMOKE_RISE + index * SMOKE_STEP

    // Under the mist, so the sheets the island is standing in are composited
    // over the steam beyond it rather than under. This was at `index`, which
    // put the first sheet at 0 — tied with the water it is steaming off.
    mesh.renderOrder   = LAYER.seaSmoke + index
    mesh.frustumCulled = false

    // Off until the year says otherwise — at the authored midsummer there is
    // nothing to draw, and the sheet is the width of the map.
    mesh.visible = false

    return { mesh, ...drift(index + count + sliceCount, weight, smokeColor) }
  })

  const drifting = [ ...sheets, ...slices ]
  const all      = [ ...drifting, ...smoke ]

  return defineModule<ScapeConfig>({
    name: 'ground-mist',

    build (ctx) {
      for (const sheet of all)
        ctx.scene.add(sheet.mesh)
    },

    update (_state, frame) {
      const density  = config().atmosphere.mistAmount
      const viewSize = camera.userData.viewSize as number ?? config().camera.viewSize

      // Mist is unlit, so nothing else would carry the time of day onto it. Take
      // the horizon straight from the clock and it stays the same substance as
      // the fog at every hour instead of glowing white through the night.
      mistColor.copy(daylight.horizon).lerp(WHITE, 0.32)
      smokeColor.copy(daylight.horizon).lerp(WHITE, 0.62)

      for (const sheet of drifting)
        advance(sheet, density, frame.delta)

      // The year, not the weather. Sea smoke is off for all but a fortnight of
      // it, and the read is the same live field the ground and the lake take
      // their winter from — sampled once upstream, so the coast cannot be
      // steaming on a week the bays beside it are already shut on.
      for (const sheet of smoke)
        advance(sheet, season.smoke, frame.delta)

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
      for (const sheet of all) {
        const material = sheet.mesh.material as MeshBasicMaterial
        sheet.mesh.removeFromParent()
        material.map?.dispose()
        material.dispose()
      }
      geometry.dispose()
      upright.dispose()
      offshore.dispose()
      texture.dispose()
    },
  })
}

// perf: a handful of transparent draws, a third of them upright. The shared
// 128² alpha field is baked once and opacity is authored at build, so the only
// per-frame work is scrolling texture offsets and yawing the slices. The sea
// smoke adds no program — same material shape as the mist, so three's cache
// hands it the one already linked — and no draw at all outside its fortnight,
// because a layer at zero strength is made invisible rather than transparent.
