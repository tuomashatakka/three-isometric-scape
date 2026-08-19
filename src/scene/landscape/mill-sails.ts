import { DynamicDrawUsage, InstancedMesh, Object3D, Sphere, Vector3 } from 'three'
import type { MeshStandardMaterial } from 'three'
import { createSeededRng } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { buildMillSails } from '../props/mill.ts'
import { resolvePalette } from '../props/index.ts'


/** One wheel, already resolved into world space by whoever surveyed the mill. */
export interface MillHub {

  /** Centre of the wheel — the outer end of the windshaft. */
  x: number
  y: number
  z: number

  /** Yaw that turns the wheel's plane into the wind. See `yawAlong`. */
  yaw: number
}

export interface MillSails {
  mesh: InstancedMesh

  /** How far the wheel has turned, in radians. Read by the tests, not the scene. */
  readonly phase: number
  update(delta: number): void
  dispose(): void
}

export interface MillSailsOptions {
  config:   ScapeConfig
  hubs:     readonly MillHub[]
  material: MeshStandardMaterial
}

/**
 * Every mill's sails, in one instanced draw.
 *
 * The only thing in the settlement that moves under its own power, and so the
 * only part of a building that cannot be merged into the steading geometry —
 * which is the whole reason the wheel is modelled apart from the mill rather
 * than as the front of it. One geometry, one material and one instance buffer
 * keep the archipelago's mills to a single draw between them.
 *
 * The rate is `mill.spin` scaled by `wind.strength`, so the knob that already
 * says how hard it is blowing turns the wheel too, and a still day stops it
 * without anything else being set. A stopped wheel writes no matrix and uploads
 * no buffer, which is what lets a capture be taken twice the same way.
 *
 * @returns `null` when no island had a shoulder to build a mill on — the caller
 *   gets no mesh rather than an empty one.
 */
export function createMillSails (options: MillSailsOptions): MillSails | null {
  const { config, hubs, material } = options

  if (hubs.length === 0)
    return null

  const geometry = buildMillSails(
    createSeededRng(config.seed).fork('mill-sails'),
    resolvePalette(),
    config.mill.sailSpan,
  )
  const mesh = new InstancedMesh(geometry, material, hubs.length)

  mesh.name          = 'mill-sails'
  mesh.castShadow    = true
  mesh.receiveShadow = true
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.updateMatrix()
  mesh.matrixAutoUpdate       = false
  mesh.userData.instanceFleet = 'mill'
  mesh.boundingSphere         = hubBounds(hubs, config.mill.sailSpan)

  // 'YXZ' so the composed rotation is yaw *then* spin: the wheel turns in its
  // own plane, and that plane is set by the mill it hangs off. Under the default
  // 'XYZ' the spin would be applied in world space and the sails would wobble
  // out of the shaft on every island but the one facing due east.
  const carrier = new Object3D()

  carrier.rotation.order = 'YXZ'

  let phase    = 0
  let disposed = false

  function writeMatrices (): void {
    for (const [ index, hub ] of hubs.entries()) {
      carrier.position.set(hub.x, hub.y, hub.z)
      carrier.rotation.set(0, hub.yaw, phase)
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

    update (delta) {
      if (disposed)
        return

      const rate = Math.max(0, config.mill.spin) * Math.max(0, config.wind.strength)

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

/**
 * A sphere that holds every wheel wherever it is in its turn.
 *
 * Given rather than computed from the instance matrices, because three derives
 * an instanced bound from the *geometry* at the identity and the wheels are
 * hundreds of metres apart. Without this the mills on two of the three islands
 * are culled from most poses.
 */
function hubBounds (hubs: readonly MillHub[], span: number): Sphere {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity

  for (const hub of hubs) {
    minX = Math.min(minX, hub.x)
    minY = Math.min(minY, hub.y)
    minZ = Math.min(minZ, hub.z)
    maxX = Math.max(maxX, hub.x)
    maxY = Math.max(maxY, hub.y)
    maxZ = Math.max(maxZ, hub.z)
  }

  const centre = new Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2)
  let radius   = 0

  for (const hub of hubs)
    radius = Math.max(radius, centre.distanceTo(new Vector3(hub.x, hub.y, hub.z)))

  return new Sphere(centre, radius + span)
}

// perf: one instanced draw for every mill in the archipelago, three matrix
// writes on a turning frame and none at all on a still one.
