import { DynamicDrawUsage, InstancedMesh, Object3D, Quaternion, Sphere, Vector3 } from 'three'
import type { Material } from 'three'
import { createSeededRng } from 'threejs-scene'
import type { LiveConfig } from '../config.ts'
import { buildProp, resolvePalette } from '../props/index.ts'
import { KELP_HEIGHT } from '../props/kelp.ts'
import type { TideState } from '../tide.ts'
import { kelpDepth, kelpLean, kelpPlants } from './kelpbed.ts'
import type { KelpPlant, KelpSkirt } from './kelpbed.ts'


/**
 * The weed in the shallows, as one draw.
 *
 * The half of the kelp bed that has a mesh in it. `landscape/kelpbed.ts` decides
 * which water carries weed and how long every plant in it is; this puts one
 * `InstancedMesh` over the whole archipelago and answers, every frame, the only
 * question that changes: how far each plant is leaning.
 *
 * It integrates nothing about the tide and resamples nothing. The sea's level
 * comes from the published `TideState` — the same record the lake moves its own
 * plane from, the fleet floats on and the seal colony is worked by — so the
 * water cannot be at one height for the surface and another for the thing
 * growing under it. That is the rule about moving state having one authority,
 * and a canopy is exactly where breaking it would show: a bed lying flat on a
 * surface that is no longer there.
 *
 * The one thing it does keep is the surge, and it keeps it as an integral so
 * `kelp.sway` can be turned to zero and back without the bed jumping to where it
 * would have been had it never stopped — the same reason the colony keeps rolls
 * and the plume keeps climbs.
 */
export interface KelpForest {
  mesh: InstancedMesh

  /** Advance the surge and re-lean every plant against the tide of this frame. */
  update(delta: number): void
  dispose(): void
}

export interface KelpForestOptions {
  config:   LiveConfig
  skirts:   readonly KelpSkirt[]
  material: Material

  /** The scape's one tide. Read, never resolved a second time. */
  tide: TideState
}

const TAU = Math.PI * 2

/**
 * The furthest over a plant may be pushed, in radians.
 *
 * A right angle is a plant lying flat on the seabed, which is where a bared bed
 * ends up and is as far as anything anchored by a holdfast can go. Without the
 * clamp `kelp.surge` would take a plant already flat at low water on *through*
 * the ground it is rooted in, and a frond waving out of the underside of a
 * shelf is the kind of thing no still at any pose would catch.
 */
const FLAT = Math.PI * 0.5

/**
 * The bound the forest is culled against.
 *
 * Real, and honest about being nearly useless: the beds ring six islands spread
 * over fifteen hundred metres of sea, so the sphere that holds them is most of
 * the world and the renderer will never cull it. It is computed anyway because
 * the alternative — leaving the automatic bound to be recomputed off instance
 * matrices that change every frame — is worse than a sphere that always passes.
 */
function forestBounds (plants: readonly KelpPlant[]): Sphere {
  if (!plants.length)
    return new Sphere(new Vector3(), 0)

  let minX    = Infinity,
    maxX      = -Infinity,
    minZ      = Infinity,
    maxZ      = -Infinity
  let deepest = 0,
    longest   = 0

  for (const plant of plants) {
    minX    = Math.min(minX, plant.x)
    maxX    = Math.max(maxX, plant.x)
    minZ    = Math.min(minZ, plant.z)
    maxZ    = Math.max(maxZ, plant.z)
    deepest = Math.min(deepest, plant.bed)
    longest = Math.max(longest, plant.length)
  }

  const x = (minX + maxX) * 0.5
  const z = (minZ + maxZ) * 0.5

  let radius = 0

  for (const plant of plants)
    radius = Math.max(radius, Math.hypot(plant.x - x, plant.z - z))

  return new Sphere(new Vector3(x, deepest * 0.5, z), radius + longest)
}

/**
 * Every plant in the archipelago, in one instanced draw.
 *
 * @returns `null` on a tier with no weed to give, and on a sea with no depth the
 *   search would plant in — a graceful absence rather than a poor version.
 */
export function createKelpForest ({
  config,
  skirts,
  material,
  tide,
}: KelpForestOptions): KelpForest | null {
  const plants = kelpPlants(skirts)

  if (!plants.length)
    return null

  const geometry = buildProp(
    'kelp',
    createSeededRng(config().seed).fork('kelp-forest'),
    resolvePalette(),
  )
  const mesh = new InstancedMesh(geometry, material, plants.length)

  mesh.name = 'kelp-forest'

  // Underwater, and lit through a couple of metres of it. A bed that cast into
  // the shadow map would put several hundred more instances through the depth
  // pass to darken a seabed the water's own depth tint has already darkened —
  // and it receives, because the island's own shadow crossing a bed at a low
  // sun is the thing that says the weed is *in* the water rather than on it.
  mesh.castShadow    = false
  mesh.receiveShadow = true
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.updateMatrix()
  mesh.matrixAutoUpdate = false
  mesh.boundingSphere   = forestBounds(plants)

  const carrier = new Object3D()
  const hinge   = new Vector3()
  const lean    = new Quaternion()

  // Surges, not seconds — so a bed given a slower swell slows where it lies
  // instead of jumping a fraction of a cycle.
  let swung = 0

  function place (): void {
    const live  = config()
    const water = live.terrain.waterLevel
    const surge = Math.max(0, live.kelp.surge)

    for (const [ index, plant ] of plants.entries()) {
      const depth = kelpDepth(plant, water, tide.level)

      // The swell only ever pushes a plant *further* over — see `kelp.surge`.
      // Its own phase per plant, so a bed breathes as a bed rather than as one
      // animal.
      const swell = surge * (0.5 + 0.5 * Math.sin(swung * TAU + plant.phase * TAU))
      const angle = Math.min(FLAT, kelpLean(depth, plant.length) + swell)

      // The hinge is the horizontal axis square to the trail bearing, so leaning
      // by `angle` carries the plant's own up-axis exactly that far toward the
      // bearing it is falling along — and the crown, which `props/kelp.ts` built
      // tilted by the nominal lean, comes out lying level on the sea. This is
      // the plant's *only* rotation: a yaw about its own stipe before the lean
      // would turn the crown back out of that plane and stand half of it in the
      // air, and the trail bearing already carries the variety a yaw would add.
      hinge.set(Math.sin(plant.trail), 0, -Math.cos(plant.trail))
      lean.setFromAxisAngle(hinge, angle)

      carrier.position.set(plant.x, plant.bed, plant.z)
      carrier.quaternion.copy(lean)
      carrier.scale.setScalar(plant.length / KELP_HEIGHT)
      carrier.updateMatrix()
      mesh.setMatrixAt(index, carrier.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
  }

  place()

  return {
    mesh,

    update (delta) {
      swung = (swung + delta * Math.max(0, config().kelp.sway) / 60) % 1
      place()
    },

    dispose () {
      mesh.removeFromParent()
      mesh.dispose()
      geometry.dispose()
    },
  }
}
