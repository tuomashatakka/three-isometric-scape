import {
  Color,
  DataTexture,
  DirectionalLight,
  Fog,
  LinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  Vector3,
} from 'three'
import type {
  HemisphereLight,
  Object3D,
  OrthographicCamera,
  Scene,
} from 'three'
import { defineModule } from 'threejs-scene'
import type { AppModule, SceneContext } from 'threejs-scene'
import { standardLighting } from 'threejs-scene/modules/lighting'
import type { ScapeConfig } from './config.ts'
import { createDaylight } from './daylight.ts'
import type { DaylightState } from './daylight.ts'
import type { AtmosphereQuality } from './quality.ts'


/** The atmosphere module, plus the sun position the post chain needs for god rays. */
export interface Atmosphere {
  module: AppModule<Record<string, never>>

  /** Sun position in world space, refreshed every frame. Read it, never write it. */
  sunPosition: Vector3

  /** Live sky state — what time of day it is, resolved into colours. Read only. */
  daylight: DaylightState
}

export interface AtmosphereOptions {
  camera:       OrthographicCamera
  config:       ScapeConfig
  groundRadius: number
  quality:      AtmosphereQuality

  /**
   * Whether the shadow map will actually be rebuilt on this frame.
   *
   * The fitted frustum is written into `sun.shadow.camera` and read only when
   * the map renders, so fitting it on a frame that will reuse the last map is
   * work with nowhere to go. `scene/runtime.ts` owns the cadence and answers
   * this; without one, every frame draws its own map and every frame needs a fit.
   */
  shadowDue?(): boolean
}

export interface FogRange {
  near: number
  far:  number
}

interface LightingRig {
  scene: Scene
  sun:   DirectionalLight
  hemi:  HemisphereLight
}

const SUN_DISTANCE = 150
const MAX_FOG      = 0.94
const SKY_STEPS    = 64

/**
 * What the hemisphere is scaled by when there is no image-based fill.
 *
 * The cheap tiers drop the PMREM room environment, and it is the only other
 * ambient term in the rig — leave the hemisphere where it was and the shadow
 * side of every surface crushes. This hands the environment's share back to the
 * light that is still there, so the tier costs detail rather than exposure.
 */
const AMBIENT_TAKEOVER = 1.28

/** Canopy clearance over the terrain's own relief, in metres. */
const CANOPY = 7
// Heading-driven scattering, kept deliberately slight. The horizon colour it
// produces is both the fog colour and the sky's lower band, so every hazy thing
// in the frame — the mist sheets included, they are fogged like anything else —
// brightens together when the view swings toward the sun. At the old strength
// that read as the weather changing while you orbited: the same island was a
// washed-out miniature facing one way and a dark moody one facing the other.
// Direction should tint the light, not re-expose the shot.
const SUN_SCATTER  = 0.12
const AWAY_SCATTER = 0.06

const corner   = new Vector3()
const ground   = [ new Vector3(), new Vector3(), new Vector3(), new Vector3() ]
const right    = new Vector3()
const up       = new Vector3()
const forward  = new Vector3()
const lightX   = new Vector3()
const lightY   = new Vector3()
const lightZ   = new Vector3()
const viewFlat = new Vector3()
const sunFlat  = new Vector3()
const focus    = new Vector3()
const WORLD_UP = new Vector3(0, 1, 0)
const FALLBACK = new Vector3(0, 0, 1)

function clamp (value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function calculateFogRange (
  cameraDistance: number,
  viewSize: number,
  groundRadius: number,
  density: number,
  breath = 1,
): FogRange {
  const safeViewSize = Math.max(1, viewSize)
  const near         = Math.max(0.1, cameraDistance - safeViewSize * 0.9)
  const amount       = clamp(density * breath, 0, MAX_FOG)
  const moodFar      = near + safeViewSize * (1.35 + 3.4 * (1 - amount))
  const edgeFar      = cameraDistance + Math.max(1, groundRadius) * 2

  return {
    near,
    far: Math.max(near + 1, Math.min(moodFar, edgeFar)),
  }
}

function isDirectionalLight (object: Object3D): object is DirectionalLight {
  return (object as DirectionalLight).isDirectionalLight === true
}

function isHemisphereLight (object: Object3D): object is HemisphereLight {
  return (object as HemisphereLight).isHemisphereLight === true
}

function mountLighting (
  ctx: SceneContext,
  lighting: AppModule<Record<string, never>>,
): LightingRig | null {
  const before = ctx.scene.children.length
  lighting.build(ctx)

  const added = ctx.scene.children.slice(before)
  const sun   = added.find(isDirectionalLight)
  const hemi  = added.find(isHemisphereLight)
  if (!sun || !hemi)
    return null

  sun.shadow.bias       = -0.0004
  sun.shadow.normalBias = 0.035
  sun.shadow.radius     = 2
  return { scene: ctx.scene, sun, hemi }
}

function visibleGround (
  camera: OrthographicCamera,
  target: Vector3,
  viewSize: number,
): Vector3[] {
  right.setFromMatrixColumn(camera.matrixWorld, 0)
  up.setFromMatrixColumn(camera.matrixWorld, 1)
  forward.setFromMatrixColumn(camera.matrixWorld, 2).negate()

  const aspect     = camera.right !== camera.left
    ? (camera.right - camera.left) / (camera.top - camera.bottom)
    : 1
  const halfHeight = viewSize / 2
  const halfWidth  = halfHeight * aspect
  let index        = 0

  for (const sx of [ -1, 1 ])
    for (const sy of [ -1, 1 ]) {
      corner.copy(target)
        .addScaledVector(right, sx * halfWidth)
        .addScaledVector(up, sy * halfHeight)

      const travel = Math.abs(forward.y) < 1e-4
        ? 0
        : (target.y - corner.y) / forward.y
      ground[index].copy(corner).addScaledVector(forward, travel)
      index += 1
    }

  return ground
}

function fitShadow (
  sun: DirectionalLight,
  camera: OrthographicCamera,
  target: Vector3,
  viewSize: number,
  tallest: number,
): void {
  const corners = visibleGround(camera, target, viewSize)

  lightZ.copy(sun.position).sub(sun.target.position)
    .normalize()
  lightX.crossVectors(WORLD_UP, lightZ)
  if (lightX.lengthSq() < 1e-6)
    lightX.crossVectors(FALLBACK, lightZ)
  lightX.normalize()
  lightY.crossVectors(lightZ, lightX).normalize()

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const point of corners) {
    corner.copy(point).sub(sun.target.position)

    const x = corner.dot(lightX)
    const y = corner.dot(lightY)
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }

  // Margin for what stands *outside* the visible ground yet still throws a
  // shadow into it. The terrain casts too, and it is by far the tallest thing
  // here — a margin sized for a spruce clips every ridge shadow at the frame
  // edge, which is what makes hills look like they are lit from inside.
  const reach   = tallest / Math.max(0.25, lightZ.y)
  const shadow  = sun.shadow.camera
  shadow.left   = minX - reach
  shadow.right  = maxX + reach
  shadow.bottom = minY - reach
  shadow.top    = maxY + reach
  shadow.near   = 1
  shadow.far    = SUN_DISTANCE * 2 + reach
  shadow.updateProjectionMatrix()
}

function readCameraFocus (camera: OrthographicCamera): Vector3 {
  const target = camera.userData.target as readonly [number, number, number] | undefined
  if (target)
    focus.set(target[0], target[1], target[2])
  else
    focus.set(0, 0, 0)
  return focus
}

export function createAtmosphereLayer ({
  camera,
  config,
  groundRadius,
  quality,
  shadowDue = () => true,
}: AtmosphereOptions): Atmosphere {
  const { atmosphere, palette } = config
  const daylight                = createDaylight(config)

  // `sky` is the live state object, and `direction` is its vector — both are
  // mutated in place by `sample`, never reassigned, so everything downstream can
  // hold the reference instead of being pushed a new one every frame.
  const sky         = daylight.sample(config.daylight.time)
  const direction   = sky.direction
  const sunPosition = new Vector3()
  const horizon     = new Color()
  const bounceBase  = new Color(palette.meadow)
  const tallest     = Math.max(
    ...config.archipelago.landmasses.map(landmass => landmass.terrain.height),
  ) + CANOPY
  const hemiGain    = quality.environment ? 1 : AMBIENT_TAKEOVER

  const lighting = standardLighting<Record<string, never>>({
    env: quality.environment ? { intensity: sky.environment } : false,
    sun: {
      color:         atmosphere.sunColor,
      intensity:     atmosphere.sunStrength,
      position:      [ direction.x, direction.y, direction.z ],
      shadowMapSize: quality.shadowMapSize,
      shadowFrustum: 64,
      shadowFar:     400,
    },
    hemi: {
      skyColor:    atmosphere.hemiSky,
      groundColor: atmosphere.hemiGround,
      intensity:   atmosphere.hemiStrength,
    },
  })

  const bounce      = new DirectionalLight(bounceBase, atmosphere.sunStrength * 0.25)
  bounce.castShadow = false

  const fog             = new Fog(palette.fog, 1, 2)
  const skyData         = new Uint8Array(SKY_STEPS * 4)
  const skyTexture      = new DataTexture(skyData, 1, SKY_STEPS, RGBAFormat)
  skyTexture.colorSpace = SRGBColorSpace
  skyTexture.magFilter  = LinearFilter
  skyTexture.minFilter  = LinearFilter

  let rig: LightingRig | null                 = null
  let ownerScene: Scene | null                = null
  let previousFog: Scene['fog']               = null
  let previousBackground: Scene['background'] = null

  // What the ramp was last painted from. These two colours are the entire input
  // to `paintSky`, so colours that match can only produce bytes that match.
  const paintedHorizon = new Color()
  const paintedTop     = new Color()

  let painted = false

  /**
   * Repaint the sky ramp, and only hand it to the gpu when it has actually
   * changed.
   *
   * This used to set `needsUpdate` on every frame, which is what cost the scape
   * its context on an android handset. A texture marked dirty is re-uploaded,
   * and re-uploading one that in-flight draw calls still reference makes a
   * tile-based driver ghost a fresh backing store rather than overwrite the live
   * one. At thirty frames a second those pile up until the allocator has nothing
   * left to give, and the failure surfaces at the next surface allocation:
   *
   *     WebGL warning: <Present>: Swap chain surface creation failed.
   *     WebGL context was lost.
   *
   * Which is why the loss was always somewhere around fifteen to twenty seconds
   * in, why it never depended on the tier, the resolution or the post chain, and
   * why the library's own starters — which upload no textures at all — never
   * showed it.
   *
   * The ramp is eight-bit, so the comparison is exact rather than a tolerance:
   * whenever the quantised bytes come out the same the upload was a no-op that
   * cost a buffer anyway. On a slow dawn that is almost every frame.
   */
  function paintSky (): void {
    // Cheaper still than finding out the bytes match: notice that the colours
    // they would have been computed from match, and never run the ramp at all.
    // On a stopped clock — which is most of the time anyone spends looking at a
    // paused scape — that is sixty-four texels and a hundred and ninety-two
    // gamma curves a frame that never happen.
    if (painted && paintedHorizon.equals(horizon) && paintedTop.equals(sky.skyTop))
      return

    paintedHorizon.copy(horizon)
    paintedTop.copy(sky.skyTop)
    painted = true

    let changed = false

    for (let index = 0; index < SKY_STEPS; index += 1) {
      const t      = index / (SKY_STEPS - 1)
      const amount = t * t
      const offset = index * 4

      const top = sky.skyTop

      const r = Math.round((horizon.r + (top.r - horizon.r) * amount) ** (1 / 2.2) * 255)
      const g = Math.round((horizon.g + (top.g - horizon.g) * amount) ** (1 / 2.2) * 255)
      const b = Math.round((horizon.b + (top.b - horizon.b) * amount) ** (1 / 2.2) * 255)

      if (skyData[offset] !== r || skyData[offset + 1] !== g || skyData[offset + 2] !== b)
        changed = true

      skyData[offset]     = r
      skyData[offset + 1] = g
      skyData[offset + 2] = b
      skyData[offset + 3] = 255
    }

    if (changed)
      skyTexture.needsUpdate = true
  }

  function scatter (): void {
    horizon.copy(sky.horizon)
    sunFlat.copy(direction).setY(0)
    viewFlat.setFromMatrixColumn(camera.matrixWorld, 2)
      .negate()
      .setY(0)

    if (sunFlat.lengthSq() > 1e-6 && viewFlat.lengthSq() > 1e-6) {
      const facing = viewFlat.normalize().dot(sunFlat.normalize())
      const toward = Math.max(0, facing) ** 2
      const away   = Math.max(0, -facing)
      const amount = Math.min(1, atmosphere.fogDensity * 1.4)

      horizon.lerp(sky.sun, toward * SUN_SCATTER * amount)
      horizon.lerp(sky.skyTop, away * AWAY_SCATTER * amount)
    }

    fog.color.copy(horizon)
    paintSky()
  }

  function reframe (elapsed: number, delta: number): void {
    camera.updateMatrixWorld()

    // The clock lives in the config, so scrubbing the overlay's time slider and
    // letting the cycle run are the same operation on the same number.
    const clock = config.daylight
    clock.time  = (clock.time + delta * clock.speed / 60) % 1
    daylight.sample(clock.time)

    const target         = readCameraFocus(camera)
    const viewSize       = camera.userData.viewSize as number ?? config.camera.viewSize
    const cameraDistance = camera.userData.radius as number ?? camera.position.distanceTo(target)
    const breath         = 1 + (
      Math.sin(elapsed * 0.041) * 0.6 +
      Math.sin(elapsed * 0.017) * 0.4
    ) * atmosphere.fogBreath
    const range = calculateFogRange(
      cameraDistance,
      viewSize,
      groundRadius,
      atmosphere.fogDensity,
      breath,
    )

    fog.near = range.near
    fog.far  = range.far
    scatter()

    if (!rig)
      return

    rig.sun.color.copy(sky.sun)
    rig.sun.intensity = sky.sunStrength
    rig.hemi.color.copy(sky.hemiSky)
    rig.hemi.groundColor.copy(sky.hemiGround)
    rig.hemi.intensity             = sky.hemiStrength * hemiGain
    rig.scene.environmentIntensity = sky.environment

    rig.sun.position.copy(target).addScaledVector(direction, SUN_DISTANCE)
    sunPosition.copy(rig.sun.position)
    rig.sun.target.position.copy(target)
    rig.sun.target.updateMatrixWorld()

    if (rig.sun.castShadow && shadowDue())
      fitShadow(rig.sun, camera, target, viewSize, tallest)

    // The ground bounce carries a little of the key light's colour, so it warms
    // through golden hour and goes cold at night instead of staying a fixed
    // green fill that no longer belongs to any of the skies above it.
    bounce.color.copy(bounceBase).lerp(sky.sun, 0.3)
    bounce.intensity = atmosphere.sunStrength * 0.25 * (0.12 + 0.88 * sky.day)
    bounce.position.copy(target).addScaledVector(direction, -SUN_DISTANCE)
    bounce.position.y = target.y + SUN_DISTANCE * 0.28
    bounce.target.position.copy(target)
    bounce.target.updateMatrixWorld()
  }

  const module = defineModule<Record<string, never>>({
    name: 'atmosphere',

    build (ctx) {
      ownerScene        = ctx.scene
      previousFog       = ctx.scene.fog
      previousBackground = ctx.scene.background
      rig = mountLighting(ctx, lighting)

      if (rig)
        rig.sun.castShadow = quality.shadows

      ctx.scene.add(bounce, bounce.target)
      ctx.scene.fog        = fog
      ctx.scene.background = skyTexture

      reframe(0, 0)
    },

    update (_state, frame) {
      reframe(frame.elapsed, frame.delta)
    },

    dispose () {
      if (ownerScene?.fog === fog)
        ownerScene.fog = previousFog
      if (ownerScene?.background === skyTexture)
        ownerScene.background = previousBackground

      bounce.removeFromParent()
      bounce.target.removeFromParent()
      bounce.dispose()
      skyTexture.dispose()
      lighting.dispose?.()

      rig                = null
      ownerScene         = null
      previousFog        = null
      previousBackground = null
    },
  })

  return { module, sunPosition, daylight: sky }
}

// perf: one sky texture upload while the view changes, one linear-fog update
// and a colour resolve per frame; no render-loop allocations and no extra
// draws. The sky ramp is only recomputed when the colours behind it moved, and
// the shadow frustum is only refitted on the frames the map is rebuilt on.
