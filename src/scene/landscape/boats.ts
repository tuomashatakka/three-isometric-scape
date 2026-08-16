import { DynamicDrawUsage, InstancedMesh, Object3D } from 'three'
import type { MeshStandardMaterial } from 'three'
import { createSeededRng } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { buildProp, resolvePalette } from '../props/index.ts'
import { yawAlong } from './layout.ts'
import { sampleWaterway } from './waterway.ts'
import type { RouteSample, WaterwayNetwork } from './waterway.ts'


export interface BoatFleet {
  mesh: InstancedMesh
  update(delta: number): void
  dispose(): void
}

export interface BoatFleetOptions {
  config:   ScapeConfig
  network:  WaterwayNetwork
  material: MeshStandardMaterial
}

/** How much of the keel sits below the mean water surface, in metres. */
const DRAFT = 0.16

/**
 * The boats running one-way around the archipelago's shared water route.
 *
 * One geometry, one material and one dynamic instance buffer keep the whole
 * fleet to one draw. The route owns its collision-free offsets; this layer only
 * advances all of them by the same distance, preserving that separation.
 */
export function createBoatFleet (options: BoatFleetOptions): BoatFleet {
  const { config, network, material } = options
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
  mesh.matrixAutoUpdate = false

  const carrier             = new Object3D()
  const sample: RouteSample = { x: 0, z: 0, angle: 0 }
  const water               = config.terrain.waterLevel
  let travelled = 0
  let disposed  = false

  function syncMatrices (): void {
    for (const [ index, offset ] of network.boatOffsets.entries()) {
      sampleWaterway(network.route, offset + travelled, sample)

      carrier.position.set(sample.x, water - DRAFT, sample.z)
      carrier.rotation.set(0, yawAlong(sample.angle), 0)
      carrier.updateMatrix()
      mesh.setMatrixAt(index, carrier.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
  }

  syncMatrices()

  return {
    mesh,

    update (delta) {
      if (disposed)
        return

      const advance = Math.max(0, delta) * Math.max(0, config.boats.speed)
      if (advance === 0)
        return

      travelled = (travelled + advance) % network.route.length
      syncMatrices()
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

// perf: one instanced draw, one shared geometry and three small matrix writes per
// moving frame. A zero boat speed performs no writes or gpu buffer upload.
