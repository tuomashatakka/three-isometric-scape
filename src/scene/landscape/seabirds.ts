import { DynamicDrawUsage, InstancedMesh, Object3D, Sphere, Vector3 } from 'three'
import type { Material } from 'three'
import { createSeededRng } from 'threejs-scene'
import type { LiveConfig } from '../config.ts'
import { buildProp, resolvePalette } from '../props/index.ts'
import { colonyAshore, ledgeBirds } from './ledges.ts'
import type { CliffColony, LedgeBird } from './ledges.ts'


/**
 * Every bird cliff in the archipelago, as one draw.
 *
 * The half of the colony that has a mesh in it. `landscape/ledges.ts` decides
 * which headlands carry birds and where on each face every bird is standing;
 * this puts one `InstancedMesh` over the whole archipelago and answers, every
 * frame, the only question that changes: what month it is.
 *
 * It integrates nothing and resolves nothing. The week of the year is read off
 * the season the landscape already samples — the same record the ground takes
 * its snow from and the lake takes its freeze from — so the cliff cannot be
 * full on a week the hillside above it is under snow. That is the rule about
 * moving state having one authority, and a colony is where breaking it shows:
 * an auk standing on a ledge in a January still.
 */
export interface SeabirdCliffs {
  mesh: InstancedMesh

  /** Re-place every bird against the phase of the year this frame is at. */
  update(time: number): void
  dispose(): void
}

export interface SeabirdCliffOptions {
  config:   LiveConfig
  colonies: readonly CliffColony[]
  material: Material
}

/**
 * Metres a bird drops as it leaves.
 *
 * The whole of the departure, paired with the scale for the reason the seals'
 * slip is: a bird that only shrank would be a bad conjuring trick, and one that
 * settles onto its ledge as it comes reads as an animal landing on rock. Small,
 * because an auk is a third of a metre tall and anything more is a bird sinking
 * into the cliff.
 */
const SETTLE = 0.11

/**
 * The bound the cliffs are culled against.
 *
 * Real rather than disabled, unlike the fleet's: the birds are on fixed rock, so
 * the sphere that holds them is a fact about the headlands and is worth
 * computing once. Measured against the ledges, with the settle and the tallest
 * bird as slack.
 */
function cliffBounds (birds: readonly LedgeBird[]): Sphere {
  let minX = Infinity,
    maxX   = -Infinity,
    minY   = Infinity,
    maxY   = -Infinity,
    minZ   = Infinity,
    maxZ   = -Infinity

  for (const bird of birds) {
    minX = Math.min(minX, bird.x)
    maxX = Math.max(maxX, bird.x)
    minY = Math.min(minY, bird.y)
    maxY = Math.max(maxY, bird.y)
    minZ = Math.min(minZ, bird.z)
    maxZ = Math.max(maxZ, bird.z)
  }

  const centre = new Vector3((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5)
  let radius   = 0

  for (const bird of birds)
    radius = Math.max(radius, Math.hypot(bird.x - centre.x, bird.z - centre.z))

  return new Sphere(centre, radius + (maxY - minY) * 0.5 + SETTLE + 1)
}

/**
 * How much of one bird is on its ledge, 0..1.
 *
 * The colony's own arrival, dealt across the window rather than applied to all
 * of it at once: `ashore` is how full the cliff is this week and `keen` is where
 * in the filling this bird sits, so the lowest ledges are occupied a fortnight
 * before the highest and empty a fortnight after them. Exported for the test
 * that states that ordering as a fact rather than leaving it to a still.
 */
export function birdAshore (ashore: number, keen: number): number {
  return Math.max(0, Math.min(1, (ashore - keen * 0.55) / 0.45))
}

/**
 * Every bird in the archipelago, in one instanced draw.
 *
 * @returns `null` on a tier with no birds to give, and on a coast with no
 *   headland the search would put one on — a graceful absence rather than a
 *   poor version. The whitewash on the rock is not in here and does not go with
 *   it: that is the terrain's vertex colour, it costs nothing, and it is most of
 *   what a colony looks like from anywhere but close to.
 */
export function createSeabirdCliffs ({
  config,
  colonies,
  material,
}: SeabirdCliffOptions): SeabirdCliffs | null {
  const birds = ledgeBirds(colonies)

  if (!birds.length)
    return null

  const geometry = buildProp(
    'guillemot',
    createSeededRng(config().seed).fork('cliff-colony'),
    resolvePalette(),
  )
  const mesh = new InstancedMesh(geometry, material, birds.length)

  mesh.name          = 'cliff-colony'
  mesh.castShadow    = true
  mesh.receiveShadow = true
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.updateMatrix()
  mesh.matrixAutoUpdate = false
  mesh.boundingSphere   = cliffBounds(birds)

  const carrier = new Object3D()

  function place (time: number): void {
    const full = colonyAshore(time, config().ledges.ashore)

    for (const [ index, bird ] of birds.entries()) {
      const here = birdAshore(full, bird.keen)

      carrier.position.set(bird.x, bird.y - (1 - here) * SETTLE, bird.z)
      carrier.rotation.set(0, bird.angle, 0)
      carrier.scale.setScalar(bird.size * here)
      carrier.updateMatrix()
      mesh.setMatrixAt(index, carrier.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
  }

  place(config().season.time)

  return {
    mesh,
    update: place,

    dispose () {
      mesh.removeFromParent()
      mesh.dispose()
      geometry.dispose()
    },
  }
}
