import { DynamicDrawUsage, InstancedMesh, Object3D } from 'three'
import type { MeshStandardMaterial } from 'three'
import { createSeededRng } from 'threejs-scene'
import type { LiveConfig } from '../config.ts'
import { resolvePalette } from '../props/index.ts'
import { WHEEL_RADIUS, buildWaterWheel } from '../props/watermill.ts'
import type { AtmosphereQuality } from '../quality.ts'
import { hubBounds } from './mill-sails.ts'
import type { MillHub } from './mill-sails.ts'


/**
 * One wheel, already resolved into world space, and the way round it turns.
 *
 * `sense` is what a sail wheel has no use for: every windmill on this coast
 * turns the same way because every one of them is built to, while a water wheel
 * turns away from whichever end of the trough fills it — and the ground picks
 * that end. See `WatermillSite.feedSide`.
 */
export interface WaterWheelHub extends MillHub {
  sense: number
}

export interface WaterWheels {
  mesh: InstancedMesh

  /** How far the wheel has turned, in radians. Read by the tests, not the scene. */
  readonly phase: number

  /**
   * Turn the wheel. `flow` is what is left of the beck this week — 1 in an open
   * channel, 0 when the winter has it shut — so the wheel stops in the weeks the
   * water does and starts again when it thaws.
   */
  update(delta: number, flow: number): void
  dispose(): void
}

export interface WaterWheelsOptions {
  config:   LiveConfig
  quality:  AtmosphereQuality
  hubs:     readonly WaterWheelHub[]
  material: MeshStandardMaterial
}

/**
 * Every watermill's wheel, in one instanced draw.
 *
 * The post mill's sails have been the only thing in the settlement that moved
 * under its own power since they went up, and this is the second — built the
 * same way, down to the `'YXZ'` rotation order, because they are the same
 * problem. One geometry, one material and one instance buffer keep the
 * archipelago's water wheels to a single draw between them, and a wheel is the
 * one part of a mill that therefore cannot be merged into the steading.
 *
 * What differs is what turns it. A sail wheel reads the live wind, gust
 * included, so a squall spins it up; a water wheel reads the *beck*, which on
 * this coast is a far steadier thing and stops for one reason only — the week
 * the channel freezes. That is `beckFreeze`, resolved by the caller and handed
 * over as a share, so there is one winter in the scape rather than a second knob
 * here to keep in step with the first.
 *
 * `watermill.spin` is the rate and it reaches zero, which is what lets a capture
 * be taken twice the same way. A stopped wheel writes no matrix and uploads no
 * buffer.
 *
 * @returns `null` when no island's beck had a reach that would turn a wheel —
 *   the caller gets no mesh rather than an empty one.
 */
export function createWaterWheels (options: WaterWheelsOptions): WaterWheels | null {
  const { config, quality, hubs, material } = options

  if (hubs.length === 0)
    return null

  const geometry = buildWaterWheel(
    createSeededRng(config().seed).fork('water-wheel'),
    resolvePalette(),
    WHEEL_RADIUS,
    quality.wheelBuckets,
  )
  const mesh = new InstancedMesh(geometry, material, hubs.length)

  mesh.name          = 'water-wheels'
  mesh.castShadow    = true
  mesh.receiveShadow = true
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.updateMatrix()
  mesh.matrixAutoUpdate       = false
  mesh.userData.instanceFleet = 'watermill'
  mesh.boundingSphere         = hubBounds(hubs, WHEEL_RADIUS * 2)

  // Yaw then spin, for the reason the sails give: under the default 'XYZ' the
  // spin is applied in world space and the buckets wobble out of the axle on
  // every island whose mill does not happen to face due east.
  const carrier = new Object3D()

  carrier.rotation.order = 'YXZ'

  let phase    = 0
  let disposed = false

  function writeMatrices (): void {
    for (const [ index, hub ] of hubs.entries()) {
      carrier.position.set(hub.x, hub.y, hub.z)
      carrier.rotation.set(0, hub.yaw, phase * hub.sense)
      carrier.updateMatrix()
      mesh.setMatrixAt(index, carrier.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
  }

  writeMatrices()

  return {
    mesh,

    get phase () {
      return phase
    },

    update (delta, flow) {
      if (disposed)
        return

      const rate = Math.max(0, config().watermill.spin) * Math.max(0, Math.min(1, flow))

      if (rate === 0)
        return

      phase = (phase + rate * Math.max(0, delta)) % (Math.PI * 2)
      writeMatrices()
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

// perf: one instanced draw for every watermill in the archipelago, one matrix
// write each on a turning frame and none at all on a frozen one.
