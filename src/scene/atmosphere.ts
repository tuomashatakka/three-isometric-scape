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
import type { AtmosphereQuality } from './quality.ts'


/** The atmosphere module, plus the sun position the post chain needs for god rays. */
export interface Atmosphere {
  module: AppModule<Record<string, never>>

  /** Sun position in world space, refreshed every frame. Read it, never write it. */
  sunPosition: Vector3
}

export interface AtmosphereOptions {
  camera:       OrthographicCamera
  config:       ScapeConfig
  groundRadius: number
  quality:      AtmosphereQuality
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
const TALLEST      = 6
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

  const reach   = TALLEST / Math.max(0.25, lightZ.y)
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
}: AtmosphereOptions): Atmosphere {
  const { atmosphere, palette } = config
  const direction               = new Vector3(...atmosphere.sunDirection).normalize()
  const sunPosition             = new Vector3()
  const horizonBase             = new Color(palette.sky)
  const horizon                 = new Color(palette.sky)
  const skyTop                  = new Color(atmosphere.skyTop)
  const sunColor                = new Color(atmosphere.sunColor)
  const groundColor             = new Color(palette.meadow)

  const lighting = standardLighting<Record<string, never>>({
    env: { intensity: 0.34 },
    sun: {
      color:         atmosphere.sunColor,
      intensity:     atmosphere.sunStrength,
      position:      atmosphere.sunDirection,
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

  const bounce      = new DirectionalLight(groundColor, atmosphere.sunStrength * 0.25)
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

  function paintSky (): void {
    for (let index = 0; index < SKY_STEPS; index += 1) {
      const t      = index / (SKY_STEPS - 1)
      const amount = t * t
      const offset = index * 4

      skyData[offset]     = Math.round((horizon.r + (skyTop.r - horizon.r) * amount) ** (1 / 2.2) * 255)
      skyData[offset + 1] = Math.round((horizon.g + (skyTop.g - horizon.g) * amount) ** (1 / 2.2) * 255)
      skyData[offset + 2] = Math.round((horizon.b + (skyTop.b - horizon.b) * amount) ** (1 / 2.2) * 255)
      skyData[offset + 3] = 255
    }
    skyTexture.needsUpdate = true
  }

  function scatter (): void {
    horizon.copy(horizonBase)
    sunFlat.copy(direction).setY(0)
    viewFlat.setFromMatrixColumn(camera.matrixWorld, 2)
      .negate()
      .setY(0)

    if (sunFlat.lengthSq() > 1e-6 && viewFlat.lengthSq() > 1e-6) {
      const facing = viewFlat.normalize().dot(sunFlat.normalize())
      const toward = Math.max(0, facing) ** 2
      const away   = Math.max(0, -facing)
      const amount = Math.min(1, atmosphere.fogDensity * 1.4)

      horizon.lerp(sunColor, toward * SUN_SCATTER * amount)
      horizon.lerp(skyTop, away * AWAY_SCATTER * amount)
    }

    fog.color.copy(horizon)
    paintSky()
  }

  function reframe (elapsed: number): void {
    camera.updateMatrixWorld()

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

    rig.sun.position.copy(target).addScaledVector(direction, SUN_DISTANCE)
    sunPosition.copy(rig.sun.position)
    rig.sun.target.position.copy(target)
    rig.sun.target.updateMatrixWorld()
    fitShadow(rig.sun, camera, target, viewSize)

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
      rig               = mountLighting(ctx, lighting)

      ctx.scene.add(bounce, bounce.target)
      ctx.scene.fog                  = fog
      ctx.scene.background           = skyTexture
      ctx.scene.environmentIntensity = 0.34

      reframe(0)
    },

    update (_state, frame) {
      reframe(frame.elapsed)
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

  return { module, sunPosition }
}

// perf: one sky texture upload while the view changes, one linear-fog update,
// and a shadow-frustum fit per frame; no render-loop allocations or extra draws.
