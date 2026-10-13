import { DynamicDrawUsage, InstancedMesh, Object3D } from 'three'
import type { Sphere } from 'three'
import type { MeshStandardMaterial } from 'three'
import { createSeededRng } from 'threejs-scene'
import type { LiveConfig } from '../config.ts'
import { buildProp, resolvePalette } from '../props/index.ts'
import { alignToSlope } from './align.ts'
import { carterJourney, carterSpan, sampleCarterRound } from './carter.ts'
import type { CarterRound, CarterSample } from './carter.ts'
import type { GroundNormal, HeightField } from './height.ts'
import { yawAlong } from './layout.ts'
import { hubBounds } from './mill-sails.ts'


/** How far the cart's own geometry stands from the point it is placed at, in metres. */
const CART_REACH = 3.4

export interface Carters {
  mesh: InstancedMesh

  /** How many carts are on the road this frame. Read by the tests, not the scene. */
  readonly working: number

  /**
   * Put every cart where the clock says it is.
   *
   * Takes no delta, and that is the design rather than an omission: the journey
   * is a function of `daylight.time` and `season.time` and integrates nothing of
   * its own. See the header of `carter.ts`.
   */
  update(): void
  dispose(): void
}

export interface CartersOptions {
  config:   LiveConfig
  rounds:   readonly CarterRound[]
  material: MeshStandardMaterial

  /** The ground the wheels run on — the cart takes its lean from it. */
  field: HeightField
}

/**
 * Every cart being worked in the archipelago, in one instanced draw.
 *
 * One geometry, one material and one instance buffer, the way the mills and the
 * ferries are — the whole settlement's traffic costs one draw call and at most
 * one matrix per island per frame.
 *
 * A cart that is not out is written at zero scale rather than being dropped from
 * the count, for the reason the colony's are: the instance order is the round
 * order, which is what lets a reader of the buffer say *which* island a matrix
 * belongs to, and a shrinking `count` would renumber them every time a day
 * closed.
 *
 * @returns `null` when no island had a track long enough to work, or when the
 *   tier asked for no rounds at all — the caller gets no mesh rather than an
 *   empty one.
 */
export function createCarters (options: CartersOptions): Carters | null {
  const { config, rounds, material, field } = options

  if (rounds.length === 0)
    return null

  const geometry = buildProp(
    'carter',
    createSeededRng(config().seed).fork('carters'),
    resolvePalette(),
  )
  const mesh = new InstancedMesh(geometry, material, rounds.length)

  mesh.name          = 'carters'
  mesh.castShadow    = true
  mesh.receiveShadow = true
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.updateMatrix()
  mesh.matrixAutoUpdate       = false
  mesh.userData.instanceFleet = 'carter'
  mesh.boundingSphere         = roundBounds(rounds)

  const carrier                          = new Object3D()
  const sample: CarterSample             = { x: 0, y: 0, z: 0, bearing: 0 }
  const normal: GroundNormal             = { x: 0, y: 1, z: 0 }
  const facing: [number, number, number] = [ 0, 0, 0 ]

  let working  = 0
  let disposed = false
  let drawn    = Number.NaN
  let year     = Number.NaN

  function writeMatrices (): void {
    const scape = config()
    const span  = carterSpan(scape)
    const lean  = Math.min(1, Math.max(0, scape.carter.lean))

    working = 0

    for (const [ index, round ] of rounds.entries()) {
      const journey = carterJourney(scape.daylight.time, span, round.length, scape.carter.reach)

      if (!journey.out) {
        carrier.position.set(round.points[0].x, round.points[0].y, round.points[0].z)
        carrier.rotation.set(0, 0, 0)
        carrier.scale.setScalar(0)
        carrier.updateMatrix()
        mesh.setMatrixAt(index, carrier.matrix)
        continue
      }

      working += 1
      sampleCarterRound(round, journey.distance, journey.homeward, sample)
      field.normalAt(sample.x, sample.z, normal)
      alignToSlope(normal, yawAlong(sample.bearing), lean, facing)

      carrier.position.set(sample.x, sample.y, sample.z)
      carrier.rotation.set(facing[0], facing[1], facing[2])
      carrier.scale.setScalar(1)
      carrier.updateMatrix()
      mesh.setMatrixAt(index, carrier.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
  }

  writeMatrices()
  drawn = config().daylight.time
  year  = config().season.time

  return {
    mesh,

    get working () {
      return working
    },

    update () {
      if (disposed)
        return

      // Both clocks, because the journey reads both: the hour decides where
      // along the round the cart is and the week decides whether there are
      // enough hours to go at all. A frame that moved neither writes no matrix
      // and uploads no buffer, which is what lets a capture be taken twice the
      // same way.
      const now  = config().daylight.time
      const week = config().season.time

      if (now === drawn && week === year)
        return

      drawn = now
      year  = week
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
 * A sphere that holds every cart wherever it is on its round.
 *
 * Built from the rounds' own points rather than from the instance matrices, for
 * the reason the mills' is: three derives an instanced bound from the geometry
 * at the identity, and these are an archipelago apart. `hubBounds` already does
 * exactly this arithmetic for the wheels, so it does it here too — the span it
 * is padded by is the cart's own length rather than a sail's.
 */
function roundBounds (rounds: readonly CarterRound[]): Sphere {
  const hubs = rounds.flatMap(round => round.points.map(point => ({ ...point, yaw: 0 })))

  return hubBounds(hubs, CART_REACH)
}
