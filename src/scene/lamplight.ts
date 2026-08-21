import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
} from 'three'
import type { OrthographicCamera } from 'three'
import { defineModule } from 'threejs-scene'
import { lanternBounds } from './beacon.ts'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import type { DaylightState } from './daylight.ts'
import type { LitPane } from './props/glazing.ts'
import type { AtmosphereQuality } from './quality.ts'
import { LAYER } from './layers.ts'


/**
 * The lamps behind the settlements' windows.
 *
 * Mounted beside the coastal light and built the same way, because it is the
 * same kind of thing: a lamp is lit by how far the sun is *down*, which is the
 * atmosphere's answer and not the landscape's — so this reads the day the
 * atmosphere resolved rather than sampling the clock a second time. One
 * `InstancedMesh` carries every pane in the archipelago, which is one draw for
 * forty-odd windows across five holdings.
 *
 * Where the panes are comes out of `props/glazing.ts` by way of the dressing:
 * the buildings are plopped onto ground-following footings, so the only thing
 * that knows a sill's world height is the thing that stood the building up.
 *
 * The glow is additive and writes no depth, so it lays light over the boards
 * without occluding them — and it is depth-*tested*, so a window on the far side
 * of a barn is hidden by the barn.
 *
 * ## Why it is not a shader on the glass
 *
 * The tempting version is an emissive term on the pane geometry itself, keyed off
 * the baked vertex colour. It cannot work: `mergeParts` jitters every part's
 * colour, so there is no exact value in the buffer left to test against — and
 * the five buildings are `Ploppable`s sharing the ground material with the
 * terrain, so an injection for the glass would run on every quad of every
 * island. One instanced quad per pane is cheaper than either.
 */
export interface LampLightOptions {
  config:  LiveConfig
  quality: AtmosphereQuality

  /**
   * Every lit pane, resolved lazily.
   *
   * Lazy because the panes only exist once the dressing has plopped the
   * buildings, and this module is composed before any of them have built — the
   * same reason the post chain resolves the lake through a getter.
   */
  panes: () => readonly LitPane[]

  /** Live sky state. A lamp answers to how far the sun is down and nothing else. */
  daylight: DaylightState

  /** Read for the frame-sized floor below. `userData.viewSize` is the live zoom. */
  camera: OrthographicCamera
}

const TAU = Math.PI * 2

/**
 * The smallest a window's glow is allowed to be on screen, as a share of the
 * frame.
 *
 * The one place this module is sized against the *view* rather than against the
 * world, and the reason is the one `birds.ts` gives for a gull's wingspan: the
 * default pose is the whole 1520 m archipelago in a 500 px frame, so three
 * metres of lamplight is a pixel, and a pixel of warm grey under the grade and
 * the grain pass is not a lit window, it is noise. Below this share the halo is
 * held at a mark instead, the way a chart holds a symbol at a legible size
 * however far out the map is drawn.
 *
 * Above it — anywhere closer than about a hundred metres of view — the floor
 * stops binding and the spill is exactly as wide as the config says it is, which
 * is where a still of a lit farmhouse can be measured against the boards it is on.
 */
const SCREEN_FLOOR = 0.014

/**
 * How far a held halo is allowed to be dimmed for the stretch, at most.
 *
 * A lamp spread over eighty times its own area is not eighty times as much light,
 * so the glow is dimmed by the factor it was stretched by — and the first attempt
 * at this system did exactly that and nothing else, which turned every lit window
 * in the archipelago into four hundredths of a per cent of a night frame. That is
 * the inverse square winning an argument it should not be in: the stretch is a
 * *legibility* device, not a claim about flux, so past this floor the dimming
 * stops and the symbol stays visible. The floor is what keeps three overlapping
 * halos over one farmyard reading as a lit holding rather than as a white disc.
 */
const FADE_FLOOR = 0.42

/** How deep the flicker cuts, as a share of full brightness. */
const FLICKER_DEPTH = 0.14

/** How far off the wall the glow is hung, in metres, to keep it out of the boards. */
const STANDOFF = 0.09

/**
 * How brightly a lit pane burns, 0..1 and up.
 *
 * `1 - day` squared, which is the beacon's curve and deliberately so: a lamp is a
 * lamp, and two answers to "how dark is it" is a coast whose lighthouse and whose
 * farmhouse come on at different dusks. What it is *not* is `dark` — that is the
 * threshold the stars come out at, and a kitchen light is on long before then.
 */
export function paneBrightness (config: ScapeConfig, day: number): number {
  const dusk = Math.min(1, Math.max(0, 1 - day))

  return Math.max(0, config.lamplight.brightness) * dusk * dusk
}

/**
 * How far above white a pane burns, so the bloom can find it.
 *
 * Gated on the tier that has a bloom to catch it, for the reason
 * `beacon.lampGlow` is: without one this is a clipped white rectangle where a
 * warm one used to be, which is the broken cheap version rather than the
 * graceful absence.
 */
export function paneGlow (config: ScapeConfig, quality: AtmosphereQuality): number {
  return quality.bloom ? Math.max(1, config.lamplight.glow) : 1
}

/**
 * A low-discrepancy fraction for pane `index`, 0..1.
 *
 * The golden-ratio sequence rather than a draw from the rng, and that is the
 * whole point: it is deterministic without a stream, it spreads evenly at every
 * count, and — the property that matters here — a pane added to the end of a
 * building's table does not move any pane before it. A run that glazes one more
 * gable should not relight the whole archipelago.
 */
export function paneSpread (index: number): number {
  return (index + 1) * 0.618_033_988_75 % 1
}

/** Whether the lamp behind pane `index` is one of the ones burning. */
export function paneLit (index: number, occupancy: number): boolean {
  return paneSpread(index) < Math.min(1, Math.max(0, occupancy))
}

/**
 * The wobble on pane `index` at `phase` turns, 0..1 and up.
 *
 * A wick behind old glass is never quite steady. Each pane is given its own
 * offset out of {@link paneSpread}, so a settlement reads as several lamps
 * rather than one dimmer switch — and the phase is carried by a rate that can
 * reach zero, which is what lets a capture stop it.
 */
export function paneFlicker (index: number, phase: number): number {
  return 1 - FLICKER_DEPTH * (0.5 - 0.5 * Math.cos((phase + paneSpread(index)) * TAU))
}

/**
 * Half-extent of a pane's glow, in metres, and how much it is dimmed for it.
 *
 * Two answers from one calculation because they are one decision: the halo is
 * metre-sized until it would be sub-pixel, and every metre it is stretched past
 * that is a metre of light spread thinner — down to {@link FADE_FLOOR}, past
 * which legibility wins. Returning the size without the fade is how an
 * archipelago pulled fully out turns into a row of white discs; returning the
 * fade without the floor is how it turns into nothing at all.
 */
type PaneHaloReturnType = { halfW: number, halfH: number, fade: number }

export function paneHalo (
  halfW:    number,
  halfH:    number,
  spill:    number,
  viewSize: number,
): PaneHaloReturnType {
  const floor  = Math.max(0, viewSize) * SCREEN_FLOOR
  const wanted = Math.max(0, spill)
  const width  = Math.max(halfW * wanted, floor)
  const height = Math.max(halfH * wanted, floor)

  return {
    halfW: width,
    halfH: height,
    fade:  Math.max(FADE_FLOOR, Math.min(1, halfW * wanted / Math.max(width, 1e-4))),
  }
}

/**
 * How far the flicker has turned after `delta` seconds, in turns.
 *
 * Flickers per *minute*, the unit the beacon's character is written in, and
 * wrapped so a scape left running overnight is at the phase one just opened is.
 */
export function advanceFlicker (phase: number, perMinute: number, delta: number): number {
  return (phase + Math.max(0, perMinute) / 60 * Math.max(0, delta)) % 1
}

/**
 * A soft disc, in the plane a pane looks out of.
 *
 * Radius 1 is the halo's own half-extent, so the instance's scale is the only
 * thing that decides how big a glow is. The falloff is baked into the vertex
 * colours rather than sampled from a texture: additive blending makes black
 * transparent, so a rim at zero *is* a soft edge, for no upload and no fetch.
 * The inner ring is held near full brightness, which is what reads as a lit pane
 * with a spill around it rather than as a fogged blob.
 */
export function buildGlowDisc (segments = 12): BufferGeometry {
  const positions: number[] = [ 0, 0, 0 ]
  const colors: number[]    = [ 1, 1, 1 ]
  const indices: number[]   = []
  const inner               = 0.42

  for (let step = 0; step < segments; step += 1) {
    const angle = step / segments * TAU

    positions.push(Math.cos(angle) * inner, Math.sin(angle) * inner, 0)
    colors.push(0.86, 0.86, 0.86)
  }

  for (let step = 0; step < segments; step += 1) {
    const angle = step / segments * TAU

    positions.push(Math.cos(angle), Math.sin(angle), 0)
    colors.push(0, 0, 0)
  }

  for (let step = 0; step < segments; step += 1) {
    const a = 1 + step
    const b = 1 + (step + 1) % segments

    indices.push(0, a, b)
    indices.push(a, segments + 1 + step, segments + 1 + (step + 1) % segments)
    indices.push(a, segments + 1 + (step + 1) % segments, b)
  }

  const geometry = new BufferGeometry()

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  return geometry
}

/**
 * @returns `null` when the archipelago has no glazing to light — a scape whose
 *   dressing was skipped gets no lamps rather than lamps standing in the sea.
 */
export function createLampLight (options: LampLightOptions): ScapeModule | null {
  const { config, quality, panes, daylight, camera } = options

  const geometry = buildGlowDisc()
  const material = new MeshBasicMaterial({
    vertexColors: true,
    transparent:  true,
    blending:     AdditiveBlending,
    depthWrite:   false,

    // A lamp is a light source, not a surface. Fog would mix the glow toward the
    // fog colour and then add it, which on a hazy night puts a grey patch on the
    // wall; haze between a window and the eye is the bloom's business.
    fog:     false,
    opacity: 1,
  })

  let mesh: InstancedMesh | null  = null
  let glazing: readonly LitPane[] = []
  let phase                       = 0

  const carrier = new Object3D()
  const tint    = new Color()

  /**
   * Write every instance's transform and brightness.
   *
   * Both together rather than the matrices once at build: the halo is sized
   * against the live view, so a zoom moves every glow — and the brightness has
   * to be dimmed by exactly the stretch that move applied, which is the same
   * calculation. Splitting them is how the two drift apart.
   */
  function writeInstances (lamp: number): void {
    if (!mesh)
      return

    const { lamplight, palette } = config()
    const viewSize               = camera.userData.viewSize as number ?? config().camera.viewSize
    const warm                   = new Color(palette.lamplight)

    for (const [ index, pane ] of glazing.entries()) {
      const halo = paneHalo(pane.halfW, pane.halfH, lamplight.spill, viewSize)

      carrier.position.set(
        pane.x + pane.nx * STANDOFF,
        pane.y,
        pane.z + pane.nz * STANDOFF,
      )
      carrier.rotation.set(0, Math.atan2(pane.nx, pane.nz), 0)
      carrier.scale.set(halo.halfW, halo.halfH, 1)
      carrier.updateMatrix()
      mesh.setMatrixAt(index, carrier.matrix)

      // Every pane is an instance and a dark room is one at zero, rather than a
      // shorter instance list: which windows are lit is a knob in the panel, and
      // a slider that needs the scape rebuilt to be seen is a slider that lies.
      // The unlit ones cost a matrix and a colour, not a draw.
      const level = paneLit(index, lamplight.occupancy)
        ? lamp * halo.fade * paneFlicker(index, phase)
        : 0

      mesh.setColorAt(index, tint.copy(warm).multiplyScalar(level))
    }

    mesh.instanceMatrix.needsUpdate = true

    if (mesh.instanceColor)
      mesh.instanceColor.needsUpdate = true
  }

  return defineModule<ScapeConfig>({
    name: 'scape-lamplight',

    build (ctx) {
      glazing = panes()

      if (glazing.length === 0)
        return

      mesh                  = new InstancedMesh(geometry, material, glazing.length)
      mesh.name             = 'lamplight'
      mesh.matrixAutoUpdate = false
      mesh.instanceMatrix.setUsage(DynamicDrawUsage)
      mesh.updateMatrix()

      // Reach enough for the widest halo the frame-sized floor can ask for, so
      // the sphere still holds every glow at full zoom-out. Hand-set for the
      // reason `lanternBounds` was written: three derives an `InstancedMesh`'s
      // bounds from the geometry at the identity, and these are metres apart
      // across a kilometre and a half of sea.
      mesh.boundingSphere = lanternBounds(
        glazing,
        config().camera.maxViewSize * SCREEN_FLOOR + 1,
      )

      // Over the sea and the beams, under the ground fog — a bank of mist in
      // front of a window should dilute it, and the beacon's own note explains
      // at length why leaving this at the default is a tie broken by projected
      // depth and therefore by the camera's heading.
      mesh.renderOrder = LAYER.lamplight
      mesh.visible     = false

      ctx.scene.add(mesh)
    },

    update (_state, frame) {
      if (!mesh)
        return

      const lamp = paneBrightness(config(), daylight.day)

      // A settlement with its lamps out is not drawn at all rather than drawn
      // black: an additive mesh still costs a sorted draw, and the middle of the
      // day is the common case.
      mesh.visible = lamp > 0.002

      if (!mesh.visible)
        return

      // Read every frame, because both are knobs in the panel and a slider that
      // only takes effect on a rebuild is a slider that lies.
      material.color.setScalar(paneGlow(config(), quality))

      phase = advanceFlicker(phase, config().lamplight.flicker, frame.delta)

      writeInstances(lamp)
    },

    dispose () {
      mesh?.removeFromParent()
      mesh?.dispose()
      mesh    = null
      glazing = []
      geometry.dispose()
      material.dispose()
    },
  })
}

// perf: one instanced draw for every lit window in the archipelago, skipped
// outright while the sun is up, and one matrix and one colour per pane on the
// frames it is not.
