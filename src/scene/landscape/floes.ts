import { DynamicDrawUsage, InstancedMesh, Object3D, Sphere, Vector3 } from 'three'
import type { Material } from 'three'
import { createSeededRng } from 'threejs-scene'
import type { LiveConfig } from '../config.ts'
import { buildProp, resolvePalette } from '../props/index.ts'
import type { SeasonState } from '../season.ts'
import type { TideState } from '../tide.ts'
import type { WindState } from '../wind.ts'
import { floeExtent } from './packice.ts'
import type { IceFloe } from './packice.ts'


/**
 * The pack on the sound, as one draw.
 *
 * The half of the ice that has a mesh in it. `landscape/packice.ts` decides
 * which water carries a plate and which week each one arrives; this puts one
 * `InstancedMesh` over the whole archipelago and answers, every frame, the three
 * things that change: how much of the winter is up, where the sea is, and what
 * the wind is doing to a field of ice floating on it.
 *
 * It integrates nothing and resamples nothing. The year comes from the published
 * `SeasonState` the ground and the lake are already reading, the sea's level
 * from the published `TideState` the surface moves its own plane with, and the
 * working from `wind.travel` — the scape's one integrated distance. A plate
 * cannot be riding a tide the water beside it is not at, and a still with the
 * clocks stopped is the same still twice. That is the rule about moving state
 * having one authority, and a floe is exactly where breaking it would show: ice
 * standing in a hole in the sea.
 */
export interface PackIce {
  mesh: InstancedMesh

  /** Re-place every plate against this frame's year, tide and wind. */
  update(season: SeasonState, wind: WindState): void
  dispose(): void
}

export interface PackIceOptions {
  config: LiveConfig
  floes:  readonly IceFloe[]

  /** The shared ground material. A floe is vertex-coloured like everything else. */
  material: Material

  /** The scape's one tide. Read, never resolved a second time. */
  tide: TideState
}

/**
 * Working per metre of wind travel.
 *
 * A rate, and therefore one that stops: `wind.travel` dies with either
 * `wind.speed` or `wind.strength`, which is the pair `STILL` already sets.
 * Slow — a pack grinds, it does not bob — and deliberately not a round fraction
 * of the surf's `SURGE_RATE`, so the two never come into step and make the whole
 * field breathe as one thing.
 */
const WORK_RATE = 0.037

/** Radians a plate turns through as it works. A floe pivots in the lead it is in. */
const WORK_TURN = 0.06

/**
 * The wind the field is first seated in: none.
 *
 * A pack placed before the first `update` is a pack placed before anything has
 * published a wind or a year, and the honest answer to both is a dead calm in
 * August — every plate at zero extent, drawing nothing. Without it the instance
 * matrices spend their first frame at the identity, which is the whole field
 * stacked full-size on the origin.
 */
const CALM: WindState = {
  phase:    0,
  bearing:  0,
  dirX:     1,
  dirZ:     0,
  base:     0,
  gust:     0,
  strength: 0,
  travel:   0,
}

/**
 * The bound the pack is culled against.
 *
 * Real rather than disabled, like the seal colony's and unlike the fleet's: the
 * plates work through half a metre and stay where the survey put them, so the
 * sphere that holds them is a fact about the archipelago and is worth computing
 * once. Given the tide's full swing and the widest plate as slack.
 */
function packBounds (floes: readonly IceFloe[], surface: number, slack: number): Sphere {
  if (!floes.length)
    return new Sphere(new Vector3(), 0)

  let minX = Infinity,
    maxX   = -Infinity,
    minZ   = Infinity,
    maxZ   = -Infinity

  for (const floe of floes) {
    minX = Math.min(minX, floe.x)
    maxX = Math.max(maxX, floe.x)
    minZ = Math.min(minZ, floe.z)
    maxZ = Math.max(maxZ, floe.z)
  }

  const x = (minX + maxX) * 0.5
  const z = (minZ + maxZ) * 0.5
  let radius = 0

  for (const floe of floes)
    radius = Math.max(radius, Math.hypot(floe.x - x, floe.z - z) + floe.length * 0.5)

  return new Sphere(new Vector3(x, surface, z), radius + slack)
}

/**
 * Every plate of ice in the archipelago, in one instanced draw.
 *
 * @returns `null` on a tier with no plates to give, and on an archipelago whose
 *   water the front never closes over — a graceful absence rather than a poor
 *   version. The sheet the surface paints is there at every tier either way,
 *   which is most of what a frozen sound looks like from the zoom a phone is
 *   usually at.
 */
export function createPackIce ({
  config,
  floes,
  material,
  tide,
}: PackIceOptions): PackIce | null {
  if (!floes.length)
    return null

  const geometry = buildProp(
    'floe',
    createSeededRng(config().seed).fork('pack-ice'),
    resolvePalette(),
  )
  const mesh = new InstancedMesh(geometry, material, floes.length)

  mesh.name          = 'pack-ice'
  mesh.castShadow    = true
  mesh.receiveShadow = true
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.updateMatrix()
  mesh.matrixAutoUpdate = false
  mesh.boundingSphere   = packBounds(
    floes,
    config().terrain.waterLevel,
    config().tide.range + config().pack.working + 2,
  )

  const carrier = new Object3D()

  /**
   * The earliest week any plate in this field arrives.
   *
   * What the summer costs, and it is the whole of the gate: below this there is
   * no standing ice anywhere in the archipelago, so a placement pass would write
   * seventeen hundred zeroed matrices to say what it said last frame. Three
   * seasons of the year the pack is a comparison.
   */
  const dawn = floes.reduce((first, floe) => Math.min(first, floe.onset), Infinity)

  // True until the first pass has run, so the seating below always happens: the
  // matrices start at the identity, and an early-out that believed a field it
  // had never placed would draw the whole pack full-size on the origin.
  let standing = true

  function place (freeze: number, wind: WindState): void {
    const live               = config()
    const surface            = live.terrain.waterLevel + tide.level
    const { cover, working } = live.pack
    const any                = freeze >= dawn && cover > 0

    if (!any && !standing)
      return

    standing = any

    for (const [ index, floe ] of floes.entries()) {
      const extent = floeExtent(floe, freeze, cover)

      // The whole of the seasonal coupling, and it is a scale rather than a
      // visibility: ice makes as a skim and thickens, so a plate coming in at
      // the edge of the pack grows out of the water it is floating in instead of
      // appearing on top of it.
      if (extent <= 0) {
        carrier.scale.setScalar(0)
        carrier.position.set(floe.x, surface, floe.z)
        carrier.rotation.set(0, floe.angle, 0)
        carrier.updateMatrix()
        mesh.setMatrixAt(index, carrier.matrix)
        continue
      }

      // One phase per plate, off the wind's own travel. Position and yaw read
      // the same swing so a floe moves the way a floe moves — along the lead it
      // is in, turning as it goes — rather than sliding sideways with its
      // heading pinned.
      const swing = Math.sin(wind.travel * WORK_RATE + floe.phase)
      const shove = working * swing

      carrier.position.set(
        floe.x + wind.dirX * shove,
        surface,
        floe.z + wind.dirZ * shove,
      )
      carrier.rotation.set(0, floe.angle + swing * WORK_TURN, 0)
      carrier.scale.set(floe.length * extent, floe.rise * extent, floe.width * extent)
      carrier.updateMatrix()
      mesh.setMatrixAt(index, carrier.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
  }

  place(0, CALM)

  return {
    mesh,

    update (season, wind) {
      place(season.freeze, wind)
    },

    dispose () {
      mesh.removeFromParent()
      mesh.dispose()
      geometry.dispose()
    },
  }
}
