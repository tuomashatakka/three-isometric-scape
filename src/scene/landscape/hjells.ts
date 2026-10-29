import { DynamicDrawUsage, InstancedMesh, Object3D, Sphere, Vector3 } from 'three'
import type { Material } from 'three'
import { createSeededRng } from 'threejs-scene'
import type { LiveConfig } from '../config.ts'
import { buildProp, resolvePalette } from '../props/index.ts'
import { fishHung, hjellHung } from './hjell.ts'
import type { HjellFish } from './hjell.ts'
import { hypot } from '../hypot.ts'


/**
 * Every fish on every drying rack in the archipelago, as one draw.
 *
 * The half of the structure that has a mesh of its own. `landscape/hjell.ts`
 * decides which harbours have a line of ground open enough to dry on and where
 * on each run every fish hangs; the timber is already in the steading's merged
 * geometry; this puts one `InstancedMesh` over the whole coast and answers, every
 * frame, the only question that changes: what month it is.
 *
 * It integrates nothing and resolves nothing. The week of the year is read off
 * the season the landscape already samples — the same record the ground takes
 * its snow from and the bird cliff takes its colony from — so a rack cannot be
 * full on a week the hillside above it is in flower. That is the rule about
 * moving state having one authority, and a larder is where breaking it shows.
 */
export interface HjellCatch {
  mesh: InstancedMesh

  /** Re-hang every fish against the phase of the year this frame is at. */
  update(time: number): void
  dispose(): void
}

export interface HjellCatchOptions {
  config:   LiveConfig
  fish:     readonly HjellFish[]
  material: Material
}

/**
 * Metres a fish rises as it is taken in.
 *
 * Paired with the scale for the reason the colony's settle is: a fish that only
 * shrank would be a bad conjuring trick, and one that lifts off its rail as it
 * goes reads as something being carried away. Small, because a stockfish is
 * half a metre long and anything more is a fish climbing its own pole.
 */
const LIFT = 0.09

/**
 * The bound the racks are culled against.
 *
 * Real rather than disabled, like the bird cliffs': the fish are on fixed timber,
 * so the sphere that holds them is a fact about the harbours and is worth
 * computing once.
 */
function catchBounds (fish: readonly HjellFish[]): Sphere {
  let minX = Infinity,
    maxX   = -Infinity,
    minY   = Infinity,
    maxY   = -Infinity,
    minZ   = Infinity,
    maxZ   = -Infinity

  for (const one of fish) {
    minX = Math.min(minX, one.x)
    maxX = Math.max(maxX, one.x)
    minY = Math.min(minY, one.y)
    maxY = Math.max(maxY, one.y)
    minZ = Math.min(minZ, one.z)
    maxZ = Math.max(maxZ, one.z)
  }

  const centre = new Vector3((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5)
  let radius   = 0

  for (const one of fish)
    radius = Math.max(radius, hypot(one.x - centre.x, one.z - centre.z))

  return new Sphere(centre, radius + (maxY - minY) * 0.5 + LIFT + 1)
}

/**
 * Every fish on the coast, in one instanced draw.
 *
 * @returns `null` on a tier with no fish to give, and on a coast where no
 *   harbour had open enough ground for a rack — a graceful absence rather than
 *   a poor version. The timber is not in here and does not go with it: the racks
 *   are merged into the steading draw, they cost no draw call, and an empty rack
 *   in October is what the structure is supposed to look like.
 */
export function createHjellCatch ({
  config,
  fish,
  material,
}: HjellCatchOptions): HjellCatch | null {
  if (!fish.length)
    return null

  const geometry = buildProp(
    'stockfish',
    createSeededRng(config().seed).fork('hjell-catch'),
    resolvePalette(),
  )
  const mesh = new InstancedMesh(geometry, material, fish.length)

  mesh.name          = 'hjell-catch'
  mesh.castShadow    = true
  mesh.receiveShadow = true
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.updateMatrix()
  mesh.matrixAutoUpdate = false
  mesh.boundingSphere   = catchBounds(fish)

  const carrier = new Object3D()

  function hang (time: number): void {
    const { hung, peak } = config().hjell
    const full           = hjellHung(time, hung, peak)

    for (const [ index, one ] of fish.entries()) {
      const here = fishHung(full, one.keen)

      carrier.position.set(one.x, one.y + (1 - here) * LIFT, one.z)
      carrier.rotation.set(0, one.angle, 0)
      carrier.scale.setScalar(one.size * here)
      carrier.updateMatrix()
      mesh.setMatrixAt(index, carrier.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
  }

  hang(config().season.time)

  return {
    mesh,
    update: hang,

    dispose () {
      mesh.removeFromParent()
      mesh.dispose()
      geometry.dispose()
    },
  }
}
