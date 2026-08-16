import {
  DynamicDrawUsage,
  InstancedMesh,
  Object3D,
  Sphere,
  Vector3,
} from 'three'
import type { MeshStandardMaterial } from 'three'
import { createSeededRng } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { buildProp, resolvePalette } from '../props/index.ts'
import {
  advanceFleetSchedule,
  createFleetSchedule,
  sampleScheduledBoat,
  scheduledFleetMinimumSeparation,
  turnToward,
} from './boat-motion.ts'
import type { ScheduledBoatSample } from './boat-motion.ts'
import { yawAlong } from './layout.ts'
import { BOAT_HULL_RADIUS, sampleWaterway } from './waterway.ts'
import type { RouteSample, WaterwayNetwork, WaterwayRoute } from './waterway.ts'


export interface BoatPose extends ScheduledBoatSample {
  instanceId: number
  y:          number
  bearing:    number
  moving:     boolean
  speed01:    number
}

export interface BoatWakeEmitter {
  instanceId: number
  x:          number
  y:          number
  z:          number
  directionX: number
  directionZ: number
  speed:      number
  strength:   number
  phase:      number
}

export interface BoatMotionConfig {
  dwellSeconds:  number
  turnRate:      number
  turnLookAhead: number
  wakeOffset:    number
}

export interface BoatFleet {
  mesh:              InstancedMesh
  poses:             readonly BoatPose[]
  wakeEmitters:      readonly BoatWakeEmitter[]
  minimumSeparation: number
  readPose(index: number, target: BoatPose): boolean
  readWake(index: number, target: BoatWakeEmitter): boolean
  update(delta: number): void
  dispose(): void
}

export interface BoatFleetOptions {
  config:   ScapeConfig
  network:  WaterwayNetwork
  material: MeshStandardMaterial
  motion?:  Partial<BoatMotionConfig>
}

export const DEFAULT_BOAT_MOTION: Readonly<BoatMotionConfig> = {
  dwellSeconds:  7,
  turnRate:      1.4,
  turnLookAhead: 5,
  wakeOffset:    1.45,
}

/** How much of the keel sits below the mean water surface, in metres. */
const DRAFT = 0.16

function copyPose (source: BoatPose, target: BoatPose): void {
  target.instanceId    = source.instanceId
  target.x             = source.x
  target.y             = source.y
  target.z             = source.z
  target.angle         = source.angle
  target.bearing       = source.bearing
  target.moving        = source.moving
  target.speed01       = source.speed01
  target.routeDistance = source.routeDistance
  target.legIndex      = source.legIndex
  target.portIndex     = source.portIndex
  target.docked        = source.docked
  target.speed         = source.speed
}

function copyWake (source: BoatWakeEmitter, target: BoatWakeEmitter): void {
  target.instanceId = source.instanceId
  target.x          = source.x
  target.y          = source.y
  target.z          = source.z
  target.directionX = source.directionX
  target.directionZ = source.directionZ
  target.speed      = source.speed
  target.strength   = source.strength
  target.phase      = source.phase
}

function routeBounds (route: WaterwayRoute, y: number): Sphere {
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity

  for (const point of route.points) {
    minX = Math.min(minX, point.x)
    minZ = Math.min(minZ, point.z)
    maxX = Math.max(maxX, point.x)
    maxZ = Math.max(maxZ, point.z)
  }

  const x = (minX + maxX) * 0.5
  const z = (minZ + maxZ) * 0.5
  let radius = 0

  for (const point of route.points)
    radius = Math.max(radius, Math.hypot(point.x - x, point.z - z))

  return new Sphere(
    new Vector3(x, y, z),
    radius + BOAT_HULL_RADIUS + 1,
  )
}

function createPose (instanceId: number): BoatPose {
  return {
    instanceId,
    x:             0,
    y:             0,
    z:             0,
    angle:         0,
    bearing:       0,
    moving:        false,
    speed01:       0,
    routeDistance: 0,
    legIndex:      0,
    portIndex:     -1,
    docked:        false,
    speed:         0,
  }
}

function createWake (instanceId: number): BoatWakeEmitter {
  return {
    instanceId,
    x:          0,
    y:          0,
    z:          0,
    directionX: 0,
    directionZ: 1,
    speed:      0,
    strength:   0,
    phase:      0,
  }
}

/**
 * The boats running one-way around the archipelago's shared water route.
 *
 * One geometry, one material and one dynamic instance buffer keep the whole
 * fleet to one draw. The synchronized schedule is audited independently before
 * it is allowed to animate.
 */
export function createBoatFleet (options: BoatFleetOptions): BoatFleet {
  const { config, network, material } = options
  const motion                        = { ...DEFAULT_BOAT_MOTION, ...options.motion }
  const geometry                      = buildProp(
    'rowboat',
    createSeededRng(config.seed).fork('boat-fleet'),
    resolvePalette(),
  )
  const mesh = new InstancedMesh(geometry, material, network.boatOffsets.length)

  mesh.name          = 'boat-fleet'
  mesh.castShadow    = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.updateMatrix()
  mesh.matrixAutoUpdate       = false
  mesh.userData.instanceFleet = 'boat'
  mesh.boundingSphere         = routeBounds(network.route, config.terrain.waterLevel)

  const carrier             = new Object3D()
  const before: RouteSample = { x: 0, z: 0, angle: 0 }
  const after: RouteSample  = { x: 0, z: 0, angle: 0 }
  const poses               = network.boatOffsets.map((_offset, index) => createPose(index))
  const wakeEmitters        = network.boatOffsets.map((_offset, index) => createWake(index))
  const schedule            = createFleetSchedule()
  const water               = config.terrain.waterLevel
  const minimumSeparation   = scheduledFleetMinimumSeparation(
    network.route,
    network.boatOffsets.length,
  )
  let disposed  = false
  let lastSpeed = Math.max(0, config.boats.speed)

  if (minimumSeparation < config.boats.separation)
    throw new Error(`scheduled fleet separation fell to ${minimumSeparation.toFixed(2)}m`)

  function syncMatrices (delta: number, snap: boolean): void {
    for (const [ index, pose ] of poses.entries()) {
      const previousAngle = pose.angle

      sampleScheduledBoat(network.route, index, schedule, config.boats.speed, pose)
      sampleWaterway(network.route, pose.routeDistance - motion.turnLookAhead, before)
      sampleWaterway(network.route, pose.routeDistance + motion.turnLookAhead, after)

      const dx           = after.x - before.x
      const dz           = after.z - before.z
      const desiredAngle = Math.hypot(dx, dz) > 1e-6
        ? Math.atan2(dz, dx)
        : pose.angle

      pose.angle = snap
        ? desiredAngle
        : turnToward(previousAngle, desiredAngle, motion.turnRate * Math.max(0, delta))
      pose.y       = water - DRAFT
      pose.bearing = pose.angle
      pose.speed01 = pose.speed > 0
        ? Math.min(1, pose.speed / Math.max(1e-6, config.boats.speed))
        : 0
      pose.moving = pose.speed01 > 0

      carrier.position.set(pose.x, pose.y, pose.z)
      carrier.rotation.set(0, yawAlong(pose.angle), 0)
      carrier.updateMatrix()
      mesh.setMatrixAt(index, carrier.matrix)

      const wake     = wakeEmitters[index]
      const forwardX = Math.cos(pose.angle)
      const forwardZ = Math.sin(pose.angle)

      wake.x          = pose.x - forwardX * motion.wakeOffset
      wake.y          = water + 0.02
      wake.z          = pose.z - forwardZ * motion.wakeOffset
      wake.directionX = forwardX
      wake.directionZ = forwardZ
      wake.speed      = pose.speed
      wake.strength   = pose.speed01
      wake.phase     += pose.speed * Math.max(0, delta)
    }

    mesh.instanceMatrix.needsUpdate = true
  }

  function silenceWakes (): void {
    for (const [ index, wake ] of wakeEmitters.entries()) {
      poses[index].speed   = 0
      poses[index].speed01 = 0
      poses[index].moving  = false
      wake.speed           = 0
      wake.strength        = 0
    }
  }

  syncMatrices(0, true)

  return {
    mesh,
    poses,
    wakeEmitters,
    minimumSeparation,

    readPose (index, target) {
      const source = poses[index]
      if (!source)
        return false

      copyPose(source, target)
      return true
    },

    readWake (index, target) {
      const source = wakeEmitters[index]
      if (!source)
        return false

      copyWake(source, target)
      return true
    },

    update (delta) {
      if (disposed)
        return

      const speed = Math.max(0, config.boats.speed)
      if (speed === 0) {
        if (lastSpeed !== 0)
          silenceWakes()
        lastSpeed = 0
        return
      }

      lastSpeed = speed
      if (!advanceFleetSchedule(
        schedule,
        network.route,
        delta,
        speed,
        motion.dwellSeconds,
      ))
        return

      syncMatrices(delta, false)
    },

    dispose () {
      if (disposed)
        return

      disposed = true
      mesh.removeFromParent()
      mesh.dispose()
      geometry.dispose()
    },
  }
}

// perf: one instanced draw, stable pose/wake records and three small matrix
// writes per moving frame. A zero boat speed performs no gpu buffer upload.
