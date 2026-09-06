import { DynamicDrawUsage, InstancedMesh, Object3D, Sphere, Vector3 } from 'three'
import type { Material } from 'three'
import { createSeededRng } from 'threejs-scene'
import type { LiveConfig } from '../config.ts'
import { buildProp, resolvePalette } from '../props/index.ts'
import type { TideState } from '../tide.ts'
import { hauledSeals, sealAshore, sealClearance } from './haulout.ts'
import type { Haulout, HauledSeal } from './haulout.ts'


/**
 * The colony on the guard, as one draw.
 *
 * The half of the haul-out that has a mesh in it. `landscape/haulout.ts` decides
 * which rocks carry seals and where on each rock every animal lies; this puts
 * one `InstancedMesh` over the whole archipelago and answers, every frame, the
 * only question that changes: how much of each animal is out of the water.
 *
 * It integrates nothing about the tide and resamples nothing. The sea's level is
 * read from the published `TideState` — the same record the lake moves its own
 * plane from and the fleet floats on — so the water cannot be at one height for
 * the surface and another for the animals lying in it. That is the rule about
 * moving state having one authority, and a colony is exactly where breaking it
 * would show: a seal standing in a hole in the sea.
 *
 * The one thing it does keep is the basking roll, and it keeps it as an integral
 * so `haulout.shuffle` can be turned to zero and back without the colony jumping
 * to where it would have been had it never stopped — the same reason the flock
 * keeps radians and the plume keeps climbs.
 */
export interface SealColony {
  mesh: InstancedMesh

  /** Advance the roll and re-place every animal against the tide of this frame. */
  update(delta: number): void
  dispose(): void
}

export interface SealColonyOptions {
  config:   LiveConfig
  haulouts: readonly Haulout[]
  material: Material

  /** The scape's one tide. Read, never resolved a second time. */
  tide: TideState
}

const TAU = Math.PI * 2

/**
 * Metres an animal sinks as the water takes its ledge.
 *
 * Small, and it is the whole of the exit animation. A seal that shrank in place
 * would be a bad conjuring trick; one that slides down as it goes reads as an
 * animal leaving a rock, which is what is actually happening. Paired with the
 * scale rather than replacing it, because a hauled seal is only 0.4 m tall and a
 * sink alone would leave a wet grey lozenge lying in the surface.
 */
const SLIP = 0.24

/** Radians of yaw the basking roll swings through, either side of the bearing. */
const ROLL_YAW = 0.09

/** Radians the body tips through with it. A seal on a rock rocks; it does not stand. */
const ROLL_TIP = 0.07

/**
 * The bound the colony is culled against.
 *
 * Real rather than disabled, unlike the fleet's: the animals are on fixed rocks,
 * so the sphere that holds them is a fact about the guard and is worth computing
 * once. It is measured against the ledges rather than mean water, and given the
 * slip and the longest animal as slack.
 */
function colonyBounds (seals: readonly HauledSeal[]): Sphere {
  if (!seals.length)
    return new Sphere(new Vector3(), 0)

  let minX = Infinity,
    maxX   = -Infinity,
    minZ   = Infinity,
    maxZ   = -Infinity
  let minY = Infinity,
    maxY   = -Infinity

  for (const seal of seals) {
    minX = Math.min(minX, seal.x)
    maxX = Math.max(maxX, seal.x)
    minZ = Math.min(minZ, seal.z)
    maxZ = Math.max(maxZ, seal.z)
    minY = Math.min(minY, seal.ledge)
    maxY = Math.max(maxY, seal.ledge)
  }

  const x = (minX + maxX) * 0.5
  const y = (minY + maxY) * 0.5
  const z = (minZ + maxZ) * 0.5
  let radius = 0

  for (const seal of seals)
    radius = Math.max(radius, Math.hypot(seal.x - x, seal.z - z))

  return new Sphere(new Vector3(x, y, z), radius + (maxY - minY) * 0.5 + SLIP + 2)
}

/**
 * Every seal in the archipelago, in one instanced draw.
 *
 * @returns `null` on a tier with no seals to give, and on a guard with no rock
 *   the search would put one on — a graceful absence rather than a poor version.
 */
export function createSealColony ({
  config,
  haulouts,
  material,
  tide,
}: SealColonyOptions): SealColony | null {
  const seals = hauledSeals(haulouts)

  if (!seals.length)
    return null

  const geometry = buildProp(
    'seal',
    createSeededRng(config().seed).fork('seal-colony'),
    resolvePalette(),
  )
  const mesh = new InstancedMesh(geometry, material, seals.length)

  mesh.name          = 'seal-colony'
  mesh.castShadow    = true
  mesh.receiveShadow = true
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.updateMatrix()
  mesh.matrixAutoUpdate = false
  mesh.boundingSphere   = colonyBounds(seals)

  const carrier = new Object3D()

  // Rolls, not seconds — so an animal given a slower roll slows where it lies
  // instead of jumping a fraction of a cycle.
  let rolled = 0

  function place (): void {
    const live               = config()
    const water              = live.terrain.waterLevel
    const { ashore, emerge } = live.haulout

    for (const [ index, seal ] of seals.entries()) {
      const clear = sealClearance(seal, water, tide.level)

      // Two independent reasons to be in the water, and they multiply: the sea
      // has taken this animal's ledge, or this animal is one of the ones out
      // fishing. Neither is a flag — one is a subtraction against the tide and
      // the other is a share of the colony.
      const out   = seal.keen < ashore ? sealAshore(clear, emerge) : 0
      const swing = Math.sin(rolled * TAU + seal.angle * 3.1)

      carrier.position.set(seal.x, seal.ledge - (1 - out) * SLIP, seal.z)
      carrier.rotation.set(0, seal.angle + swing * ROLL_YAW, swing * ROLL_TIP)
      carrier.scale.setScalar(seal.size * out)
      carrier.updateMatrix()
      mesh.setMatrixAt(index, carrier.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
  }

  place()

  return {
    mesh,

    update (delta) {
      rolled = (rolled + delta * Math.max(0, config().haulout.shuffle) / 60) % 1
      place()
    },

    dispose () {
      mesh.removeFromParent()
      mesh.dispose()
      geometry.dispose()
    },
  }
}
